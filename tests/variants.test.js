import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { scryptSync } from "node:crypto";
import { fileURLToPath } from "node:url";
import { adminCredentials } from "../backend/admin-auth.js";
import { createOrder } from "../backend/order-domain.js";
import { calendarDays } from "../shared/calendar.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const day = calendarDays()[0].date;
const password = "VariantTestPassword2026!";
const product = {
  id: 1, title: "Dolce test", titleEn: "Test pastry", category: "pastries",
  description: "Dolce", descriptionEn: "Pastry", price: 99,
  image: "https://example.com/pastry.webp", imagePosition: "center",
  ingredients: [], ingredientsEn: [], allergens: [], allergensEn: [],
  available: true, published: true, stock: 0, format: "Base", formatEn: "Base", featured: false,
  variants: [
    { name: "Piccola", nameEn: "Small", format: "6 pezzi", formatEn: "6 pieces", price: 7.35, stock: 3, available: true },
    { name: "Grande", nameEn: "Large", format: "12 pezzi", formatEn: "12 pieces", price: 12.4, stock: 4, available: true },
    { name: "Sospesa", format: "6 pezzi", price: 1, stock: 10, available: false },
    { name: "Esaurita", format: "6 pezzi", price: 1, stock: 0, available: true },
  ],
};
const base = { ...product, id: 2, variants: [], price: 8.5, stock: 5 };
const input = (key, items) => ({
  idempotencyKey: key, items,
  customer: { name: "Cliente Test", email: "variants@test.example", phone: "+39 320 0000000", notes: "" },
  pickupDate: day, pickupSlot: "16:00–17:00", paymentMethod: "pay_on_pickup",
});
const historic = createOrder(input("historical-base-order", [{ productId: 2, quantity: 1 }]), [base], []).order;
historic.items = historic.items.map(({ format, formatEn, ...item }) => item);
let directory, port, server, adminCookie, customerCookie, catalog, purchased;
let logs = "";

async function api(route, { body, cookie, method = body ? "POST" : "GET" } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json(), headers: response.headers };
}
const archive = (type) => fs.readFile(path.join(directory, `${type}.json`), "utf8").then(JSON.parse);
const admin = (route, options = {}) => api(route, { ...options, cookie: adminCookie });
const item = (variant, quantity = 1) => ({ productId: 1, variantId: catalog.variants.find((v) => v.name === variant).id, quantity });

async function start() {
  server = spawn(process.execPath, ["server.js"], {
    cwd: path.join(root, "backend"),
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DATABASE_DIR: directory },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (value) => { logs += value; });
  server.stderr.on("data", (value) => { logs += value; });
  for (let i = 0; i < 100; i++) {
    try { if ((await api("/health")).status === 200) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(logs);
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise((resolve) => server.once("exit", resolve));
  server.kill();
  await exited;
}

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "tunisweet-variants-"));
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  await fs.writeFile(path.join(directory, "product.json"), JSON.stringify([product, base]));
  await fs.writeFile(path.join(directory, "order.json"), JSON.stringify([historic]));
  await fs.writeFile(path.join(directory, "availability.json"), JSON.stringify([{
    id: 1, title: day, category: "pickup", date: day, enabled: true, notes: "",
    slots: [{ start: "16:00", end: "17:00", capacity: 100 }],
  }]));
  await fs.writeFile(path.join(directory, "admin-account.json"), JSON.stringify(await adminCredentials("admin@variants.test", password)));
  await fs.writeFile(path.join(directory, "accounts.json"), JSON.stringify({
    users: [{ id: "variant-buyer", name: "Cliente Test", email: "variants@test.example", verifiedAt: Date.now(), createdAt: Date.now(),
      password: { salt: "variant-test", hash: scryptSync(password, "variant-test", 64).toString("hex") } }], sessions: [],
  }));
  await start();
  const administrator = await api("/admin/session", { body: { email: "admin@variants.test", password } });
  assert.equal(administrator.status, 200);
  adminCookie = administrator.headers.get("set-cookie").split(";")[0];
  const customer = await api("/auth/login", { body: { email: "variants@test.example", password } });
  assert.equal(customer.status, 200);
  customerCookie = customer.headers.get("set-cookie").split(";")[0];
  catalog = (await admin("/admin/products/1")).data;
});
after(async () => {
  await stop();
  if (directory && path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith("tunisweet-variants-"))
    await fs.rm(directory, { recursive: true, force: true });
});

test("existing variant IDs are assigned once, persisted and exposed to public and admin catalogs", async () => {
  const ids = catalog.variants.map((v) => v.id);
  assert.equal(new Set(ids).size, 4);
  for (const id of ids) assert.match(id, /^[0-9a-f-]{36}$/);
  assert.deepEqual((await archive("product"))[0].variants.map((v) => v.id), ids);
  assert.deepEqual((await api("/products/1")).data.product.variants, catalog.variants);
  await stop();
  await start();
  assert.deepEqual((await admin("/admin/products/1")).data.variants.map((v) => v.id), ids);
  assert.deepEqual((await admin(`/admin/orders/${historic.id}`)).data, historic);
});

test("admin preserves IDs across reordering and assigns new IDs; duplicate and malformed IDs are rejected", async () => {
  for (const variants of [
    [catalog.variants[0], catalog.variants[0]],
    [{ ...catalog.variants[0], id: 123 }],
    [{ ...catalog.variants[0], id: "bad-id" }],
    [{ ...catalog.variants[0], stock: -1 }],
    [{ ...catalog.variants[0], price: -1 }],
  ]) assert.equal((await admin("/admin/products/1", { method: "PUT", body: { variants } })).status, 400);
  const updated = await admin("/admin/products/1", { method: "PUT", body: { variants: [
    ...catalog.variants.toReversed(),
    { name: "Nuova", format: "1 pezzo", price: 2, stock: 1, available: true },
  ] } });
  assert.equal(updated.status, 200);
  assert.deepEqual(updated.data.variants.slice(0, 4).map((v) => v.id), catalog.variants.toReversed().map((v) => v.id));
  assert.ok(updated.data.variants[4].id);
  catalog = updated.data;
});

test("HTTP checkout rejects bad quantities, invalid variants and aggregate stock without changing archives", async () => {
  const stockBefore = await archive("product"), ordersBefore = await archive("order");
  const cases = [
    [[{ productId: 1, quantity: 1 }], "variantRequired"],
    [[{ productId: 1, variantId: "missing", quantity: 1 }], "stockChanged"],
    [[item("Sospesa")], "stockChanged"], [[item("Esaurita")], "stockChanged"],
    [[item("Piccola", 4)], "stockChanged"],
    [[item("Piccola", 2), item("Piccola", 2)], "stockChanged"],
    [[{ ...item("Piccola"), productId: 2 }], "stockChanged"],
    ...[0, -1, 1.5, "1", null, Number.MAX_SAFE_INTEGER + 1].map((quantity) => [[item("Piccola", quantity)], "invalidOrder"]),
    ...[null, "", 1, {}].map((variantId) => [[{ productId: 1, variantId, quantity: 1 }], "invalidOrder"]),
    [[item("Piccola", Number.MAX_SAFE_INTEGER), item("Piccola")], "invalidOrder"],
  ];
  for (const [items, error] of cases) {
    const response = await api("/orders", { body: input("invalid-variant-attempt", items) });
    assert.equal(response.status, 409);
    assert.equal(response.data.error, error);
  }
  assert.deepEqual(await archive("product"), stockBefore);
  assert.deepEqual(await archive("order"), ordersBefore);
});

test("mixed orders use server variant prices, decrement only selected stock and retain bilingual snapshots", async () => {
  const response = await api("/orders", { cookie: customerCookie, body: {
    ...input("mixed-variant-order", [
      { ...item("Piccola"), price: 0.01, variantName: "Forged", format: "Forged" },
      item("Grande", 2), item("Piccola"), { productId: 2, quantity: 1, price: 0 },
    ]), total: 0.01,
  } });
  assert.equal(response.status, 201);
  purchased = response.data.order;
  assert.equal(purchased.total, 48);
  assert.equal(purchased.items.length, 3);
  assert.equal(purchased.items[0].quantity, 2);
  assert.equal(purchased.items[0].variantName, "Piccola");
  assert.equal(purchased.items[0].variantNameEn, "Small");
  assert.equal(purchased.items[0].formatEn, "6 pieces");
  assert.equal(purchased.items[0].price, 7.35);
  const saved = await archive("product");
  const p = saved.find((p) => p.id === 1);
  assert.equal(p.stock, 0);
  assert.equal(p.available, true);
  assert.equal(p.variants.find((v) => v.id === item("Piccola").variantId).stock, 1);
  assert.equal(p.variants.find((v) => v.id === item("Grande").variantId).stock, 2);
  assert.equal(p.variants.find((v) => v.name === "Sospesa").stock, 10);
  assert.equal(saved.find((p) => p.id === 2).stock, 4);
  assert.deepEqual((await api("/account/orders", { cookie: customerCookie })).data[0].items, purchased.items);
});

test("product edits, variant removal, deletion and restart preserve orders and idempotent retries", async () => {
  const current = (await admin("/admin/products/1")).data;
  assert.equal((await admin("/admin/products/1", { method: "PUT", body: {
    title: "Changed", titleEn: "Changed", variants: current.variants
      .filter((v) => v.id !== item("Piccola").variantId)
      .map((v) => ({ ...v, name: "Changed", format: "Changed", price: 100 })),
  } })).status, 200);
  assert.deepEqual((await admin(`/admin/orders/${purchased.id}`)).data.items, purchased.items);
  assert.equal((await admin("/admin/products/1", { method: "DELETE" })).status, 200);
  await stop();
  await start();
  const retry = await api("/orders", { cookie: customerCookie, body: { idempotencyKey: purchased.idempotencyKey } });
  assert.equal(retry.status, 200);
  assert.deepEqual(retry.data.order, purchased);
  assert.deepEqual((await api("/account/orders", { cookie: customerCookie })).data[0].items, purchased.items);
  assert.deepEqual((await admin(`/admin/orders/${historic.id}`)).data, historic);
  assert.equal((await archive("order")).length, 2);
});

test("concurrent repeated sends decrement stock once; distinct sends cannot oversell a variant", async () => {
  const { id, ...copy } = product;
  const created = await admin("/admin/products", { body: { ...copy, variants: [{ ...copy.variants[0], stock: 1 }] } });
  assert.equal(created.status, 201);
  const p = created.data;
  const items = [{ productId: p.id, variantId: p.variants[0].id, quantity: 1 }];
  const same = await Promise.all([1, 2].map(() => api("/orders", { body: input("concurrent-same-variant", items) })));
  assert.deepEqual(same.map((r) => r.status).sort(), [200, 201]);
  assert.equal(same[0].data.order.id, same[1].data.order.id);
  const exhausted = (await admin(`/admin/products/${p.id}`)).data;
  assert.equal(exhausted.variants[0].stock, 0);
  assert.equal(exhausted.variants[0].available, false);
  assert.equal(exhausted.available, true);
  assert.equal((await admin(`/admin/products/${p.id}`, { method: "PUT", body: {
    variants: [{ ...exhausted.variants[0], stock: 1, available: true }],
  } })).status, 200);
  const distinct = await Promise.all([1, 2].map((n) => api("/orders", { body: input(`concurrent-distinct-${n}`, items) })));
  assert.deepEqual(distinct.map((r) => r.status).sort(), [201, 409]);
  assert.equal(distinct.find((r) => r.status === 409).data.error, "stockChanged");
  assert.equal((await admin(`/admin/products/${p.id}`)).data.variants[0].stock, 0);
});

test("a failed order write restores variant stock and availability before a retry", async () => {
  const { id, ...copy } = product;
  const p = (await admin("/admin/products", { body: { ...copy, variants: [{ ...copy.variants[0], stock: 1 }] } })).data;
  const stockBefore = await archive("product"), ordersBefore = await archive("order");
  const body = input("retry-after-write-failure", [{ productId: p.id, variantId: p.variants[0].id, quantity: 1 }]);
  const blockedFile = path.join(directory, "order.json.tmp");
  await fs.mkdir(blockedFile);
  try {
    assert.equal((await api("/orders", { body })).status, 500);
    assert.deepEqual(await archive("product"), stockBefore);
    assert.deepEqual(await archive("order"), ordersBefore);
    assert.deepEqual((await admin(`/admin/products/${p.id}`)).data, p);
  } finally {
    await fs.rmdir(blockedFile);
  }
  assert.equal((await api("/orders", { body })).status, 201);
  assert.equal((await api("/orders", { body })).status, 200);
  assert.equal((await admin(`/admin/products/${p.id}`)).data.variants[0].stock, 0);
});
