import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { createHash, scryptSync } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createOrder } from "../backend/order-domain.js";
import { adminCredentials } from "../backend/admin-auth.js";
import { calendarDays } from "../shared/calendar.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const password = "CustomerTestPassword2026!";
const admin = { email: "admin@orders.test", password: "AdminTestPassword2026!" };
const customerA = { id: "account-a", name: "Cliente A", email: "a@orders.test" };
const customerB = { id: "account-b", name: "Cliente B", email: "b@orders.test" };
const day = calendarDays()[0].date;
const product = {
  id: 1, title: "Dolce test", titleEn: "Test pastry", category: "pastries",
  description: "Dolce per test", descriptionEn: "Test pastry",
  price: 8.5, image: "https://example.com/pastry.webp", imagePosition: "center",
  ingredients: [], ingredientsEn: [], allergens: [], allergensEn: [],
  available: true, stock: 100, format: "Confezione", formatEn: "Box", featured: false,
};
const input = (key, email = customerA.email) => ({
  idempotencyKey: key,
  items: [{ productId: product.id, quantity: 2 }],
  customer: { name: "Cliente Test", email, phone: "+39 320 0000000", notes: "PRIVATE pickup note" },
  pickupDate: day, pickupSlot: "16:00–17:00", paymentMethod: "pay_on_pickup",
});
const legacy = createOrder(input("historical-order-email-only"), [product], []).order;
let directory, port, server, cookieA, cookieB, adminCookie, orderA, orderB, guest;
let logs = "";

async function api(route, { body, cookie, method = body ? "POST" : "GET" } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json(), headers: response.headers };
}
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
const archive = () => fs.readFile(path.join(directory, "order.json"), "utf8").then(JSON.parse);

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "tunisweet-customer-orders-"));
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const users = [customerA, customerB, { id: "unverified", name: "Non verificato", email: "pending@orders.test" }].map((user) => ({
    ...user, createdAt: Date.now(), verifiedAt: user.id === "unverified" ? null : Date.now(),
    password: { salt: user.id, hash: scryptSync(password, user.id, 64).toString("hex") },
  }));
  const sessions = [
    { token: "expired-session", userId: customerA.id, expiresAt: Date.now() - 1 },
    { token: "unverified-session", userId: "unverified", expiresAt: Date.now() + 3600000 },
  ].map(({ token, ...session }) => ({ ...session, hash: createHash("sha256").update(token).digest("hex") }));
  await fs.writeFile(path.join(directory, "accounts.json"), JSON.stringify({ users, sessions }));
  await fs.writeFile(path.join(directory, "product.json"), JSON.stringify([product]));
  await fs.writeFile(path.join(directory, "order.json"), JSON.stringify([legacy]));
  await fs.writeFile(path.join(directory, "availability.json"), JSON.stringify([{
    id: 1, title: day, category: "pickup", date: day, enabled: true,
    slots: [{ start: "16:00", end: "17:00", capacity: 100 }], notes: "PRIVATE calendar note",
  }]));
  await fs.writeFile(path.join(directory, "admin-account.json"), JSON.stringify(await adminCredentials(admin.email, admin.password)));
  await start();
  const login = async (email) => {
    const response = await api("/auth/login", { body: { email, password } });
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie").split(";")[0];
  };
  cookieA = await login(customerA.email);
  cookieB = await login(customerB.email);
  const response = await api("/admin/session", { body: admin });
  assert.equal(response.status, 200);
  adminCookie = response.headers.get("set-cookie").split(";")[0];
});
after(async () => {
  await stop();
  if (directory && path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith("tunisweet-customer-orders-"))
    await fs.rm(directory, { recursive: true, force: true });
});

test("customer order history rejects anonymous, forged, expired, unverified and admin sessions", async () => {
  for (const cookie of [undefined, "ts_account=forged", "ts_account=expired-session", "ts_account=unverified-session", adminCookie]) {
    const response = await api(`/account/orders?accountId=${customerA.id}&email=${customerA.email}`, { cookie });
    assert.equal(response.status, 401);
    assert.deepEqual(response.data, { error: "authSessionExpired" });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.deepEqual((await api("/account/orders", { cookie: cookieA })).data, []);
  assert.deepEqual((await api("/account/orders", { cookie: cookieB })).data, []);
});

test("checkout derives ownership from the verified server session and ignores browser identities and email", async () => {
  const spoofed = { accountId: customerB.id, userId: customerB.id, verified: true };
  const anonymous = await api("/orders", { body: { ...input("guest-order-spoofed-account"), ...spoofed } });
  assert.equal(anonymous.status, 201);
  guest = anonymous.data.order;
  assert.equal(guest.accountId, undefined);
  const placedA = await api("/orders", {
    cookie: cookieA,
    body: { ...input("account-a-order", customerB.email), ...spoofed,
      customer: { ...input("unused", customerB.email).customer, ...spoofed, id: customerB.id } },
  });
  assert.equal(placedA.status, 201);
  orderA = placedA.data.order;
  assert.equal(orderA.accountId, customerA.id);
  assert.equal(orderA.customer.email, customerB.email);
  assert.equal(orderA.total, 17);
  const placedB = await api("/orders", { cookie: cookieB, body: { ...input("account-b-order"), accountId: customerA.id } });
  assert.equal(placedB.status, 201);
  orderB = placedB.data.order;
  assert.equal(orderB.accountId, customerB.id);
  const saved = await archive();
  assert.equal(saved.find((order) => order.id === legacy.id).accountId, undefined);
  assert.equal(saved.find((order) => order.id === guest.id).accountId, undefined);
  assert.equal(saved.find((order) => order.id === orderA.id).accountId, customerA.id);
  assert.equal(saved.find((order) => order.id === orderB.id).accountId, customerB.id);
});

test("customers read only their own snapshots; admin status updates preserve ownership and private fields stay hidden", async () => {
  const updated = await api(`/admin/orders/${orderA.id}`, {
    method: "PUT", cookie: adminCookie, body: { status: "Pronto per il ritiro", paymentStatus: "paid" },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.accountId, customerA.id);
  for (const [cookie, expected, other] of [[cookieA, orderA, orderB], [cookieB, orderB, orderA]]) {
    const response = await api(`/account/orders?accountId=${other.accountId}&email=${other.customer.email}&id=${other.id}`, { cookie });
    assert.equal(response.status, 200);
    assert.deepEqual(response.data.map((order) => order.id), [expected.id]);
    const order = response.data[0];
    assert.deepEqual(order.items, expected.items);
    for (const key of ["reference", "total", "createdAt", "pickupDate", "pickupSlot"])
      assert.deepEqual(order[key], expected[key]);
    for (const key of ["accountId", "customer", "idempotencyKey", "paymentRecordedBy", "paymentRecordedAt"])
      assert.equal(Object.hasOwn(order, key), false);
    for (const route of ["/orders", `/orders/${other.id}`, `/account/orders/${other.id}`, "/admin/orders"])
      assert.ok([401, 403].includes((await api(route, { cookie })).status));
  }
  const order = (await api("/account/orders", { cookie: cookieA })).data[0];
  assert.equal(order.status, "Pronto per il ritiro");
  assert.equal(order.paymentStatus, "paid");
});

test("idempotency retries cannot expose another account's order or claim guest and historical orders", async () => {
  const before = await archive();
  const retry = await api("/orders", { cookie: cookieA, body: input(orderA.idempotencyKey) });
  assert.equal(retry.status, 200);
  assert.equal(retry.data.order.reference, orderA.reference);
  for (const [cookie, key] of [
    [cookieB, orderA.idempotencyKey], [undefined, orderA.idempotencyKey],
    [cookieA, orderB.idempotencyKey], [cookieA, guest.idempotencyKey], [cookieA, legacy.idempotencyKey],
  ]) {
    const response = await api("/orders", { cookie, body: { ...input(key), accountId: customerA.id } });
    assert.equal(response.status, 409);
    assert.deepEqual(response.data, { error: "invalidOrder" });
  }
  const guestRetry = await api("/orders", { body: input(guest.idempotencyKey) });
  assert.equal(guestRetry.status, 200);
  assert.equal(guestRetry.data.order.id, guest.id);
  assert.deepEqual(await archive(), before);
});

test("ownership and legacy orders survive restart; invalid sessions cannot silently place guest orders", async () => {
  await stop();
  await start();
  assert.deepEqual((await api("/account/orders", { cookie: cookieA })).data.map((order) => order.id), [orderA.id]);
  assert.deepEqual((await api("/account/orders", { cookie: cookieB })).data.map((order) => order.id), [orderB.id]);
  const before = await archive();
  for (const cookie of ["ts_account=expired-session", "ts_account=forged", "ts_account=unverified-session"]) {
    const response = await api("/orders", { cookie, body: input("invalid-session-checkout") });
    assert.equal(response.status, 401);
    assert.deepEqual(response.data, { error: "authSessionExpired" });
    assert.match(response.headers.get("set-cookie"), /^ts_account=;/);
  }
  assert.equal((await api("/auth/session", { cookie: cookieA, method: "DELETE" })).status, 200);
  assert.equal((await api("/account/orders", { cookie: cookieA })).status, 401);
  assert.equal((await api("/orders", { cookie: cookieA, body: input("revoked-session-checkout") })).status, 401);
  assert.deepEqual(await archive(), before);
  assert.equal(before.find((order) => order.id === legacy.id).accountId, undefined);
});
