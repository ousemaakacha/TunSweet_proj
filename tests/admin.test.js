import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { calendarDays, defaultSettings } from "../shared/calendar.js";
import { createOrder } from "../backend/order-domain.js";
import { adminCredentials } from "../backend/admin-auth.js";
const root = fileURLToPath(new URL("../", import.meta.url));
let dir,
  server,
  cookie,
  product,
  order,
  review,
  day,
  logs = "";
const base = "http://127.0.0.1:3099";
async function api(
  route,
  { method = "GET", body, auth = true, headers = {} } = {},
) {
  const r = await fetch(base + route, {
    method,
    headers: {
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(auth && cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body:
      body instanceof FormData
        ? body
        : body === undefined
          ? undefined
          : JSON.stringify(body),
  });
  if (route === "/admin/session" && method === "POST" && r.ok)
    cookie = r.headers.get("set-cookie").split(";")[0];
  return { status: r.status, data: await r.json(), headers: r.headers };
}
before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "tunisweet-admin-test-"));
  await fs.writeFile(
    path.join(dir, "admin-account.json"),
    JSON.stringify(
      await adminCredentials("admin@tunisweet.test", "TestAdminPassword2026!"),
    ),
  );
  const products = JSON.parse(
    await fs.readFile(path.join(root, "backend/database/product.json"), "utf8"),
  );
  await fs.writeFile(path.join(dir, "product.json"), JSON.stringify(products));
  await fs.writeFile(
    path.join(dir, "managed-images.json"),
    JSON.stringify({
      "tunisweet/products/owned-test": {
        url: "https://res.cloudinary.com/storage-test/image/upload/owned.webp",
        publicId: "tunisweet/products/owned-test",
      },
    }),
  );
  server = spawn(process.execPath, ["server.js"], {
    cwd: path.join(root, "backend"),
    env: {
      ...process.env,
      PORT: "3099",
      HOST: "127.0.0.1",
      DATABASE_DIR: dir,
      CLOUDINARY_CLOUD_NAME: "",
      CLOUDINARY_API_KEY: "",
      CLOUDINARY_API_SECRET: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (v) => {
    logs += v;
  });
  server.stderr.on("data", (v) => {
    logs += v;
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await api("/health", { auth: false })).status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(logs);
});
after(async () => {
  if (server) {
    server.kill();
    await new Promise((r) => {
      if (server.exitCode !== null) return r();
      server.once("exit", r);
    });
  }
  if (
    dir &&
    path.dirname(dir) === os.tmpdir() &&
    path.basename(dir).startsWith("tunisweet-admin-test-")
  )
    await fs.rm(dir, { recursive: true, force: true });
});
test("private resources reject public reads and mutations", async () => {
  for (const route of [
    "/admin/orders",
    "/admin/customers",
    "/admin/settings",
    "/uploads/config",
  ])
    assert.equal((await api(route, { auth: false })).status, 401);
  for (const route of [
    "/orders",
    "/orders/1",
    "/customers",
    "/storesettings",
    "/availabilities",
  ])
    assert.equal((await api(route, { auth: false })).status, 403);
  assert.equal(
    (await api("/products", { method: "POST", body: {}, auth: false })).status,
    403,
  );
  assert.equal(
    (
      await api("/health", {
        headers: { Origin: "https://untrusted.example" },
        auth: false,
      })
    ).status,
    403,
  );
});
test("admin login validates credentials and issues an expiring session", async () => {
  assert.equal(
    (
      await api("/admin/session", {
        method: "POST",
        body: { email: "admin@tunisweet.test", password: "wrong" },
        auth: false,
      })
    ).status,
    401,
  );
  const r = await api("/admin/session", {
    method: "POST",
    body: { email: "admin@tunisweet.test", password: "TestAdminPassword2026!" },
    auth: false,
  });
  assert.equal(r.status, 200);
  assert.ok(r.data.expiresAt > Date.now());
  assert.equal(r.data.password, undefined);
  assert.equal(r.data.token, undefined);
  assert.match(r.headers.get("set-cookie"), /HttpOnly/);
  assert.match(r.headers.get("set-cookie"), /SameSite=Lax/);
  assert.equal((await api("/admin/session")).status, 200);
});
test("URL product CRUD, drafts, primary image order and legacy products", async () => {
  const existing = (await api("/admin/products")).data[0];
  assert.ok(existing.image);
  const { id, createdAt, updatedAt, ...copy } = existing;
  const images = [
    {
      url: "https://example.com/one.webp",
      source: "external",
      altIt: "Uno",
      altEn: "One",
      isPrimary: false,
      sortOrder: 0,
    },
    {
      url: "https://example.com/two.webp",
      source: "external",
      altIt: "Due",
      altEn: "Two",
      isPrimary: true,
      sortOrder: 1,
    },
  ];
  const created = await api("/admin/products", {
    method: "POST",
    body: {
      ...copy,
      title: "QA URL",
      image: images[1].url,
      images,
      published: false,
      stock: 4,
    },
  });
  assert.equal(created.status, 201);
  product = created.data;
  assert.equal(product.image, images[1].url);
  assert.equal(
    (await api(`/products/${product.id}`, { auth: false })).status,
    404,
  );
  let updated = await api(`/admin/products/${product.id}`, {
    method: "PUT",
    body: { published: true },
  });
  assert.equal(updated.status, 200);
  const publicList = (await api("/products?full=true", { auth: false })).data;
  assert.ok(publicList.some((p) => p.id === product.id));
  assert.equal(
    (
      await api(`/admin/products/${product.id}`, {
        method: "PUT",
        body: { stock: -1 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api(`/admin/products/${product.id}`, {
        method: "PUT",
        body: { images: images.map((i) => ({ ...i, isPrimary: true })) },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api(`/admin/products/${product.id}`, {
        method: "PUT",
        body: {
          images: [{ ...images[0], url: "javascript:evil()", isPrimary: true }],
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api(`/admin/products/${product.id}`, {
        method: "PUT",
        body: {
          images: [
            {
              ...images[0],
              isPrimary: true,
              source: "cloudinary",
              publicId: "tunisweet/products/forged",
            },
          ],
        },
      })
    ).status,
    400,
  );
});
test("calendar custom slots drive public availability and reject overselling", async () => {
  const adminDays = (await api("/admin/calendar")).data;
  assert.equal(
    adminDays[0].date,
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(
      new Date(),
    ),
  );
  day = (await api("/pickup-slots", { auth: false })).data[0].date;
  const r = await api("/admin/availability", {
    method: "POST",
    body: {
      title: day,
      category: "pickup",
      date: day,
      enabled: true,
      notes: "PRIVATE calendar note",
      slots: [
        { start: "16:00", end: "17:00", capacity: 1 },
        { start: "18:00", end: "20:00", capacity: 2 },
      ],
    },
  });
  assert.equal(r.status, 201);
  const slots = await api("/pickup-slots", { auth: false });
  assert.equal(slots.data.find((d) => d.date === day).slots[0].remaining, 1);
  assert.ok(!JSON.stringify(slots.data).includes("PRIVATE"));
  const input = {
    idempotencyKey: "admin-test-order-1",
    items: [{ productId: product.id, quantity: 1 }],
    customer: {
      name: "Cliente Test",
      email: "test@example.com",
      phone: "+39 320 0000000",
      notes: "",
    },
    pickupDate: day,
    pickupSlot: "16:00–17:00",
    paymentMethod: "pay_on_pickup",
  };
  const placed = await api("/orders", {
    method: "POST",
    body: input,
    auth: false,
  });
  assert.equal(placed.status, 201);
  order = placed.data.order;
  assert.equal(
    (
      await api("/orders", {
        method: "POST",
        body: { ...input, idempotencyKey: "admin-test-order-2" },
        auth: false,
      })
    ).data.error,
    "slotFull",
  );
  assert.equal(
    (await api("/orders", { method: "POST", body: input, auth: false })).data
      .order.id,
    order.id,
  );
  assert.equal(
    (
      await api(`/admin/availability/${r.data.id}`, {
        method: "PUT",
        body: { slots: [{ start: "16:00", end: "17:00", capacity: 0 }] },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await api(`/admin/availability/${r.data.id}`, {
        method: "PUT",
        body: { enabled: false },
      })
    ).status,
    200,
  );
  assert.ok(
    !(await api("/pickup-slots", { auth: false })).data.some(
      (d) => d.date === day,
    ),
  );
  assert.equal(
    (
      await api("/orders", {
        method: "POST",
        body: { ...input, idempotencyKey: "admin-test-order-3" },
        auth: false,
      })
    ).data.error,
    "invalidPickup",
  );
});
test("order status persists and customer aggregation keeps notes private", async () => {
  assert.equal(
    (await api(`/admin/orders/${order.id}`)).data.paymentStatus,
    "unpaid",
  );
  const receipt = await api(`/admin/orders/${order.id}`, {
    method: "PUT",
    body: { paymentStatus: "paid" },
  });
  assert.equal(receipt.status, 200);
  assert.equal(receipt.data.paymentStatus, "paid");
  assert.equal(receipt.data.paymentRecordedBy, "admin@tunisweet.test");
  assert.ok(receipt.data.paymentRecordedAt);
  assert.equal(
    (
      await api(`/admin/orders/${order.id}`, {
        method: "PUT",
        body: { paymentStatus: "unpaid" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api(`/admin/orders/${order.id}`, {
        method: "PUT",
        body: { status: "Confermato" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await api(`/admin/orders/${order.id}`)).data.status,
    "Confermato",
  );
  assert.equal(
    (
      await api(`/admin/orders/${order.id}`, {
        method: "PUT",
        body: { total: 0, status: "Completato" },
      })
    ).status,
    400,
  );
  const people = (await api("/admin/customers")).data;
  assert.equal(people.length, 1);
  assert.equal(people[0].orderCount, 1);
  const c = people[0];
  const saved = await api("/admin/customers", {
    method: "POST",
    body: {
      title: c.name,
      category: "customer",
      name: c.name,
      email: c.email,
      phone: c.phone,
      notes: "PRIVATE customer note",
    },
  });
  assert.equal(saved.status, 201);
  assert.equal((await api("/admin/customers")).data.length, 1);
  assert.equal((await api("/customers", { auth: false })).status, 403);
  assert.equal(
    (
      await api(`/admin/orders/${order.id}`, {
        method: "PUT",
        body: { status: "Annullato" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await api(`/admin/orders/${order.id}`, {
        method: "PUT",
        body: { status: "Confermato" },
      })
    ).status,
    409,
  );
});
test("moderation only publishes approved reviews", async () => {
  const created = await api("/admin/reviews", {
    method: "POST",
    body: {
      title: "Recensione",
      category: "shop",
      author: "Autore Test",
      text: "Ottimi dolci.",
      textEn: "Great sweets.",
      rating: 5,
      approved: false,
      status: "In attesa",
    },
  });
  assert.equal(created.status, 201);
  review = created.data;
  assert.equal(
    (await api("/reviews?full=true", { auth: false })).data.length,
    0,
  );
  assert.equal(
    (
      await api(`/admin/reviews/${review.id}`, {
        method: "PUT",
        body: { status: "Approvata" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await api("/reviews?full=true", { auth: false })).data.length,
    1,
  );
  await api(`/admin/reviews/${review.id}`, {
    method: "PUT",
    body: { status: "Nascosta" },
  });
  assert.equal(
    (await api(`/reviews/${review.id}`, { auth: false })).status,
    404,
  );
  await api(`/admin/reviews/${review.id}`, { method: "DELETE" });
});
test("settings update public information and default pickup days", async () => {
  const s = (await api("/admin/settings")).data;
  const saved = await api("/admin/settings", {
    method: "POST",
    body: {
      ...s,
      name: "TUNISWEET QA",
      contactText: "Solo dati del negozio",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    },
  });
  assert.equal(saved.status, 201);
  const publicData = (await api("/store-settings", { auth: false })).data;
  assert.equal(publicData.name, "TUNISWEET QA");
  assert.equal(publicData.lowStock, undefined);
  assert.equal(publicData.weekdays, undefined);
  assert.equal(
    (
      await api(`/admin/settings/${saved.data.id}`, {
        method: "PUT",
        body: { instagram: "http://unsafe.example" },
      })
    ).status,
    400,
  );
});
test("upload rejects invalid MIME, content, oversized files and missing Cloudinary; external deletes never reach provider", async () => {
  assert.equal((await api("/uploads/config")).data.configured, false);
  const send = async (blob, name) => {
    const body = new FormData();
    body.append("image", blob, name);
    return api("/uploads/images", { method: "POST", body });
  };
  assert.equal(
    (await send(new Blob(["abc"], { type: "image/svg+xml" }), "bad.svg"))
      .status,
    400,
  );
  assert.equal(
    (
      await send(
        new Blob(["not-a-real-png"], { type: "image/png" }),
        "fake.png",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await send(
        new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" }),
        "big.png",
      )
    ).status,
    400,
  );
  const sharp = createRequire(
    new URL("../backend/package.json", import.meta.url),
  )("sharp");
  const png = await sharp({
    create: { width: 10, height: 10, channels: 3, background: "#536348" },
  })
    .png()
    .toBuffer();
  assert.equal(
    (await send(new Blob([png], { type: "image/png" }), "valid.png")).status,
    503,
  );
  assert.equal(
    (
      await api(
        "/uploads/images/" +
          encodeURIComponent("https://example.com/external.png"),
        { method: "DELETE" },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await api(
        "/uploads/images/" + encodeURIComponent("tunisweet/products/unknown"),
        { method: "DELETE" },
      )
    ).status,
    400,
  );
  const managed = {
    url: "https://res.cloudinary.com/storage-test/image/upload/owned.webp",
    publicId: "tunisweet/products/owned-test",
    source: "cloudinary",
    altIt: "Prodotto",
    altEn: "Product",
    isPrimary: true,
    sortOrder: 0,
  };
  assert.equal(
    (
      await api(`/admin/products/${product.id}`, {
        method: "PUT",
        body: { images: [managed] },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await api("/uploads/images/" + encodeURIComponent(managed.publicId), {
        method: "DELETE",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await api(`/admin/products/${product.id}`, {
        method: "PUT",
        body: { images: product.images },
      })
    ).status,
    200,
  );
});
test("concurrent checkout submissions cannot oversell a pickup slot", async () => {
  const nextDay = (await api("/pickup-slots", { auth: false })).data[0].date;
  await api("/admin/availability", {
    method: "POST",
    body: {
      title: nextDay,
      category: "pickup",
      date: nextDay,
      enabled: true,
      notes: "",
      slots: [{ start: "16:00", end: "20:00", capacity: 1 }],
    },
  });
  const makeInput = (n) => ({
    idempotencyKey: `concurrent-checkout-${n}`,
    items: [{ productId: product.id, quantity: 1 }],
    customer: {
      name: "Cliente Concorrenza",
      email: "concurrent@example.com",
      phone: "+39 320 0001111",
      notes: "",
    },
    pickupDate: nextDay,
    pickupSlot: "16:00–20:00",
    paymentMethod: "pay_on_pickup",
  });
  const results = await Promise.all(
    [1, 2].map((n) =>
      api("/orders", { method: "POST", body: makeInput(n), auth: false }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(
    (await api("/pickup-slots", { auth: false })).data.find(
      (d) => d.date === nextDay,
    ).slots[0].remaining,
    0,
  );
});

test("delete URL product and revoke logout session", async () => {
  assert.equal(
    (await api(`/admin/products/${product.id}`, { method: "DELETE" })).status,
    200,
  );
  assert.equal(
    (await api(`/products/${product.id}`, { auth: false })).status,
    404,
  );
  assert.equal((await api("/admin/session", { method: "DELETE" })).status, 200);
  assert.equal((await api("/admin/orders")).status, 401);
});
