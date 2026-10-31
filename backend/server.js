import "dotenv/config";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adminAuth } from "./admin-auth.js";
import cors from "cors";
import morgan from "morgan";
import { validators } from "./schema.js";
import { createOrder } from "./order-domain.js";
import { calendarDays, defaultSettings } from "../shared/calendar.js";
import { validateDomain, orderStatuses } from "./admin-domain.js";
import { customerAuth } from "./customer-auth.js";
import {
  uploadMiddleware,
  cloudinaryStorageAdapter,
  configured,
} from "./image-storage.js";
const app = express(),
  PORT = Number(process.env.PORT) || 3001;
const directory =
  process.env.DATABASE_DIR ||
  fileURLToPath(new URL("./database/", import.meta.url));
const origins = (
  process.env.FRONTEND_ORIGINS ||
  "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173"
).split(",");
app.use(
  cors({
    credentials: true,
    origin(origin, cb) {
      cb(null, !origin || origins.includes(origin));
    },
  }),
);
app.use(morgan("dev", { skip: (req) => req.method === "OPTIONS" }));
app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("X-Content-Type-Options", "nosniff");
  if (req.headers.origin && !origins.includes(req.headers.origin))
    return res.status(403).json({ error: "Origine non autorizzata." });
  next();
});
const cache = {};
await fs.mkdir(directory, { recursive: true });
for (const type of Object.keys(validators)) {
  try {
    cache[type] = JSON.parse(
      await fs.readFile(path.join(directory, `${type}.json`), "utf8"),
    );
    if (
      !Array.isArray(cache[type]) ||
      cache[type].some((v) => !validators[type](v).valid)
    )
      throw new Error(`Archivio ${type} non valido.`);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    cache[type] = [];
  }
}
const save = async (type) => {
  const file = path.join(directory, `${type}.json`);
  await fs.writeFile(`${file}.tmp`, JSON.stringify(cache[type], null, 2));
  await fs.rename(`${file}.tmp`, file);
};
let queue = Promise.resolve();
const mutate = (handler) => (req, res, next) => {
  queue = queue
    .catch(() => {})
    .then(async () => {
      const before = structuredClone(cache);
      try {
        await handler(req, res);
      } catch (e) {
        Object.assign(cache, before);
        next(e);
      }
    });
};
const wrap = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res)).catch(next);
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const settings = () => ({ ...defaultSettings, ...cache.storesetting[0] });
const calendar = (all = false) =>
  calendarDays(cache.order, cache.availability, settings(), new Date(), all);
app.use("/auth", await customerAuth({ directory }));
const normalizeReview = (r) => ({
  ...r,
  status: r.status || (r.approved ? "Approvata" : "In attesa"),
});
const normalizeProduct = (p) => {
  if (!p.images?.length) return p;
  const image = (p.images.find((i) => i.isPrimary) || p.images[0]).url;
  return {
    ...p,
    image,
    imagePosition: image.includes("pastries-atlas.png")
      ? p.imagePosition
      : "center",
  };
};
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/pickup-slots", (req, res) =>
  res.json(
    calendar().map((d) => ({
      date: d.date,
      slots: d.slots.map((s) => ({ time: s.time, remaining: s.remaining })),
    })),
  ),
);
app.get("/store-settings", (req, res) => {
  const s = settings();
  res.json({
    name: s.name,
    email: s.email,
    whatsapp: s.whatsapp,
    instagram: s.instagram,
    pickupMessage: s.pickupMessage,
    contactText: s.contactText,
    logo: s.logo,
    primaryColor: s.primaryColor,
    start: s.start,
    end: s.end,
  });
});
app.get("/products", (req, res) => {
  let rows = cache.product
    .filter((p) => p.published !== false)
    .map(normalizeProduct);
  if (req.query.category)
    rows = rows.filter((p) => p.category === req.query.category);
  if (req.query.search)
    rows = rows.filter((p) =>
      p.title.toLowerCase().includes(String(req.query.search).toLowerCase()),
    );
  res.json(
    req.query.full === "true"
      ? rows
      : rows.map(({ id, title, category, createdAt, updatedAt }) => ({
          id,
          title,
          category,
          createdAt,
          updatedAt,
        })),
  );
});
app.get("/products/:id", (req, res) => {
  const p = cache.product.find(
    (p) => p.id === Number(req.params.id) && p.published !== false,
  );
  if (!p) return res.status(404).json({ error: "Prodotto non trovato." });
  res.json({ success: true, product: normalizeProduct(p) });
});
app.get("/reviews", (req, res) =>
  res.json(
    cache.review
      .filter((r) => normalizeReview(r).status === "Approvata")
      .map(normalizeReview),
  ),
);
app.get("/reviews/:id", (req, res) => {
  const r = cache.review.find(
    (r) =>
      r.id === Number(req.params.id) &&
      normalizeReview(r).status === "Approvata",
  );
  if (!r) return res.status(404).json({ error: "Recensione non trovata." });
  res.json({ success: true, review: r });
});
app.post(
  "/orders",
  mutate(async (req, res) => {
    const result = createOrder(
      req.body,
      cache.product,
      cache.order,
      new Date(),
      calendar(),
    );
    if (result.existing)
      return res.json({ success: true, order: result.order });
    for (const i of result.order.items) {
      const p = cache.product.find((p) => p.id === i.productId);
      p.stock -= i.quantity;
      p.available = p.stock > 0;
      p.updatedAt = new Date().toISOString();
    }
    cache.order.push(result.order);
    try {
      await save("product");
      await save("order");
    } catch (e) {
      for (const i of result.order.items) {
        const p = cache.product.find((p) => p.id === i.productId);
        p.stock += i.quantity;
        p.available = true;
      }
      cache.order.pop();
      await save("product");
      throw e;
    }
    res.status(201).json({ success: true, order: result.order });
  }),
);
const administration = await adminAuth({ directory });
const authorize = administration.authorize;
app.post("/admin/session", administration.login);
app.use("/admin", authorize);
app.delete("/admin/session", administration.logout);
app.get("/admin/session", administration.session);
app.get("/admin/overview", (req, res) =>
  res.json({
    products: cache.product.map(normalizeProduct),
    orders: cache.order,
    reviews: cache.review.map(normalizeReview),
    calendar: calendar(true),
    settings: settings(),
  }),
);
app.get("/admin/calendar", (req, res) => res.json(calendar(true)));
const resources = {
  products: "product",
  orders: "order",
  reviews: "review",
  customers: "customer",
  availability: "availability",
  settings: "storesetting",
};
function customers() {
  const people = [];
  for (const order of cache.order) {
    const c = order.customer,
      email = c.email.trim().toLowerCase(),
      phone = c.phone.replace(/\D/g, "");
    let person = people.find(
      (p) =>
        (email && p.email.toLowerCase() === email) ||
        (phone && p.phone.replace(/\D/g, "") === phone),
    );
    if (!person) {
      const saved = cache.customer.find(
        (p) =>
          p.email.toLowerCase() === email ||
          (phone && p.phone.replace(/\D/g, "") === phone),
      );
      person = {
        ...c,
        ...saved,
        id: saved?.id,
        notes: saved?.notes || "",
        orders: [],
      };
      people.push(person);
    }
    person.orders.push(order);
  }
  for (const c of cache.customer)
    if (!people.some((p) => p.id === c.id)) people.push({ ...c, orders: [] });
  return people.map((p) => ({
    ...p,
    orderCount: p.orders.length,
    totalSpent: p.orders
      .filter((o) => o.status !== "Annullato")
      .reduce((s, o) => s + o.total, 0),
    lastOrder: p.orders
      .map((o) => o.createdAt)
      .sort()
      .at(-1),
  }));
}
app.get("/admin/:resource", (req, res) => {
  const type = resources[req.params.resource];
  if (!type) return res.status(404).json({ error: "Risorsa non trovata." });
  res.json(
    type === "customer"
      ? customers()
      : type === "storesetting"
        ? settings()
        : type === "review"
          ? cache.review.map(normalizeReview)
          : cache[type].map((v) =>
              type === "product" ? normalizeProduct(v) : v,
            ),
  );
});
app.get("/admin/:resource/:id", (req, res) => {
  const type = resources[req.params.resource],
    item = cache[type]?.find((v) => v.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: "Elemento non trovato." });
  res.json(type === "product" ? normalizeProduct(item) : item);
});
for (const method of ["post", "put", "delete"])
  app[method](
    "/admin/:resource/:id?",
    mutate(async (req, res) => {
      const type = resources[req.params.resource];
      if (!type) return fail(404, "Risorsa non trovata.");
      let id = Number(req.params.id),
        old = cache[type].find((v) => v.id === id);
      if (type === "storesetting" && !old) old = cache[type][0];
      if (method !== "post" && !old && type !== "storesetting")
        return fail(404, "Elemento non trovato.");
      if (method === "delete") {
        if (!["product", "review"].includes(type))
          return fail(403, "Eliminazione non consentita.");
        cache[type] = cache[type].filter((v) => v.id !== id);
        await save(type);
        return res.json({ success: true });
      }
      let data = { ...old, ...req.body };
      if (type === "order") {
        if (
          method !== "put" ||
          !Object.keys(req.body).length ||
          Object.keys(req.body).some(
            (k) => !["status", "paymentStatus"].includes(k),
          ) ||
          (req.body.status !== undefined &&
            !orderStatuses.includes(req.body.status)) ||
          (req.body.paymentStatus !== undefined &&
            req.body.paymentStatus !== "paid")
        )
          return fail(400, "Stato ordine non valido.");
        if (
          old.status === "Annullato" &&
          (req.body.paymentStatus ||
            (req.body.status && req.body.status !== old.status))
        )
          return fail(409, "Un ordine annullato non può essere riattivato.");
        if (req.body.paymentStatus === "paid") {
          if (
            old.paymentMethod !== "pay_on_pickup" ||
            data.status === "Annullato"
          )
            return fail(
              409,
              "Il pagamento non può essere registrato per questo ordine.",
            );
          if (old.paymentStatus !== "paid") {
            data.paymentRecordedAt = new Date().toISOString();
            data.paymentRecordedBy = req.adminSession.email;
          }
        }
        // Cancelling a pickup does not silently restock perishable food.
      } else {
        if (type === "review") {
          data.status ||= data.approved ? "Approvata" : "In attesa";
          data.approved = data.status === "Approvata";
        }
        if (type === "product" && data.images?.length) {
          data.images = data.images.map((v, i) => ({ ...v, sortOrder: i }));
          data = normalizeProduct(data);
        }
        if (type === "availability") {
          const same = cache.availability.find(
            (a) => a.date === data.date && a.id !== old?.id,
          );
          if (same) {
            old = same;
            data.id = same.id;
          }
          for (const s of data.slots || []) {
            const occupied = cache.order.filter(
              (o) =>
                o.pickupDate === data.date &&
                o.pickupSlot === `${s.start}–${s.end}` &&
                o.status !== "Annullato",
            ).length;
            if (s.capacity < occupied)
              return fail(409, "Capienza inferiore ai ritiri già prenotati.");
          }
          const booked = cache.order.filter(
            (o) => o.pickupDate === data.date && o.status !== "Annullato",
          );
          if (
            booked.some(
              (o) =>
                !(data.slots || []).some(
                  (s) => `${s.start}–${s.end}` === o.pickupSlot,
                ),
            )
          )
            return fail(
              409,
              "Mantieni le fasce con ritiri già prenotati. Puoi bloccare la data per nuove prenotazioni.",
            );
        }
        if (type === "customer") {
          const same = cache.customer.find(
            (c) =>
              c.id !== old?.id &&
              (c.email.toLowerCase() === data.email?.toLowerCase() ||
                (data.phone &&
                  c.phone.replace(/\D/g, "") ===
                    data.phone.replace(/\D/g, ""))),
          );
          if (same) old = same;
        }
        try {
          validateDomain(type, data);
          const result = validators[type](data);
          if (!result.valid)
            return fail(400, "Controlla i campi richiesti e il loro formato.");
        } catch (e) {
          return fail(400, e.issues?.[0]?.message || e.message);
        }
      }
      const now = new Date().toISOString();
      data = {
        ...data,
        id: old?.id || Math.max(0, ...cache[type].map((v) => v.id)) + 1,
        createdAt: old?.createdAt || now,
        updatedAt: now,
      };
      cache[type] = old
        ? cache[type].map((v) => (v.id === old.id ? data : v))
        : [...cache[type], data];
      await save(type);
      res.status(old ? 200 : 201).json(data);
    }),
  );
app.use("/uploads", authorize);
app.get("/uploads/config", (req, res) =>
  res.json({ configured: configured(), maxSize: 5 * 1024 * 1024 }),
);
app.post(
  "/uploads/images",
  uploadMiddleware,
  wrap(async (req, res) =>
    res.status(201).json(await cloudinaryStorageAdapter.upload(req.file)),
  ),
);
app.delete(
  "/uploads/images/:publicId",
  mutate(async (req, res) => {
    const id = req.params.publicId;
    if (
      cache.product.some((p) => p.images?.some((i) => i.publicId === id)) ||
      cache.storesetting.some((s) => s.logoPublicId === id)
    )
      return fail(
        409,
        "Immagine ancora associata a un prodotto o al logo. Salva prima la rimozione.",
      );
    await cloudinaryStorageAdapter.delete(id);
    res.json({ success: true });
  }),
);
// No generic public CRUD for customers, calendar notes, settings or order records.
app.use((req, res) =>
  res
    .status(403)
    .json({ error: "Risorsa privata o operazione non consentita." }),
);
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.name === "MulterError" ? 400 : error.status || 500;
  res.status(status).json({
    error:
      error.code === "LIMIT_FILE_SIZE"
        ? "Il file supera il limite di 5 MB."
        : error.name === "MulterError"
          ? "Invia una sola immagine JPEG, PNG o WebP per richiesta."
          : status < 500
            ? error.message
            : status === 503
              ? "Cloudinary non configurato. Usa Inserisci URL."
              : "Operazione non riuscita. Verifica il backend o la configurazione Cloudinary e riprova.",
  });
});
app.listen(PORT, process.env.HOST || "127.0.0.1", () =>
  console.log(
    `TUNISWEET API http://127.0.0.1:${PORT} · account email/password · amministrazione protetta`,
  ),
);
