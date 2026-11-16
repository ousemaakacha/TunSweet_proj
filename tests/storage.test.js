import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { migrateStorage, openStorage, databaseName, transactionalTypes } from "../backend/storage.js";
import { createOrder } from "../backend/order-domain.js";
import { calendarDays, defaultSettings } from "../shared/calendar.js";
import { readArchive } from "./helpers/storage.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const originalProduct = JSON.parse(await fs.readFile(path.join(root, "backend/database/product.json"), "utf8"))[0];
const date = calendarDays()[0].date;
const slot = "16:00–17:00";
const adminToken = "storage-admin-session";
const customerToken = "storage-customer-session";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const input = (key, productId = 1, variantId) => ({
  idempotencyKey: key, items: [{ productId, ...(variantId && { variantId }), quantity: 1 }],
  customer: { name: "Cliente Test", email: "test@storage.example", phone: "+39 320 0000000", notes: "Privata" },
  pickupDate: date, pickupSlot: slot, paymentMethod: "pay_on_pickup",
});

async function fixture(t, { history = false } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "tunisweet-storage-"));
  const stops = [];
  t.after(async () => {
    for (const stop of stops) await stop();
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith("tunisweet-storage-"));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const product = { ...structuredClone(originalProduct), id: 1, available: true, published: true, stock: 8, variants: [] };
  const variantId = "ba060150-cd13-4a36-9325-6da99385bf72";
  const variantProduct = { ...product, id: 2, variants: [{
    id: variantId, name: "Piccola", nameEn: "Small", format: "6 pezzi", formatEn: "6 pieces",
    price: 7.35, stock: 8, available: true,
  }] };
  const order = createOrder(input("historical-storage-key"), [product], [], new Date(), null, "historic-account").order;
  Object.assign(order, {
    id: 71, status: "Completato", paymentStatus: "paid", paymentRecordedAt: "2025-01-02T10:00:00.000Z",
    paymentRecordedBy: "old-admin@example.com", legacyProperty: { retained: true },
  });
  order.items[0].legacyBatch = "historic-batch";
  const state = {
    product: [variantProduct, product], order: history ? [order] : [],
    availability: [{ id: 9, title: date, category: "pickup", date, enabled: true,
      notes: "Nota privata", slots: [{ start: "16:00", end: "17:00", capacity: 100 }] }],
    storesetting: [{ ...defaultSettings, id: 3 }],
  };
  for (const [type, rows] of Object.entries(state))
    await fs.writeFile(path.join(directory, `${type}.json`), JSON.stringify(rows, null, 2));
  await fs.writeFile(path.join(directory, "admin-account.json"), JSON.stringify({ email: "admin@storage.example", name: "Admin" }));
  await fs.writeFile(path.join(directory, "admin-sessions.json"), JSON.stringify([
    { hash: digest(adminToken), email: "admin@storage.example", expiresAt: Date.now() + 3600000 },
  ]));
  await fs.writeFile(path.join(directory, "accounts.json"), JSON.stringify({
    users: [{ id: "buyer", name: "Cliente", email: "buyer@storage.example", verifiedAt: Date.now() }],
    sessions: [{ hash: digest(customerToken), userId: "buyer", expiresAt: Date.now() + 3600000 }],
  }));
  return { directory, state, variantId, backup: path.join(directory, "backup"), stops };
}

async function start({ directory, stops }, { pause = false } = {}) {
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const child = spawn(process.execPath, [
    ...(pause ? ["--import", new URL("./helpers/pause-order-insert.js", import.meta.url).href] : []),
    "server.js",
  ], {
    cwd: path.join(root, "backend"),
    env: { ...process.env, DATABASE_DIR: directory, PORT: String(port), HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let logs = "";
  child.stdout.on("data", (data) => { logs += data; });
  child.stderr.on("data", (data) => { logs += data; });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
  };
  stops.push(stop);
  const api = async (route, { body, method = body ? "POST" : "GET", cookie } = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method, headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  };
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(logs);
    try { if ((await api("/health")).status === 200) return { child, api, stop }; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(logs);
}

test("migration CLI imports only isolated copies of the shop archives and requires explicit paths", async (t) => {
  const f = await fixture(t);
  const expected = {}, sources = {};
  for (const type of transactionalTypes) {
    const source = path.join(root, "backend/database", `${type}.json`);
    try {
      sources[type] = await fs.readFile(source, "utf8");
      expected[type] = JSON.parse(sources[type]);
      await fs.writeFile(path.join(f.directory, `${type}.json`), sources[type]);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      expected[type] = [];
      await fs.unlink(path.join(f.directory, `${type}.json`));
    }
  }
  const run = (args) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["migrate-storage.js", ...args], { cwd: path.join(root, "backend") });
    let output = "";
    child.stdout.on("data", (value) => { output += value; });
    child.stderr.on("data", (value) => { output += value; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, output }));
  });
  assert.equal((await run(["--directory", f.directory])).code, 1);
  await assert.rejects(fs.access(path.join(f.directory, databaseName)));
  const args = ["--directory", f.directory, "--backup", f.backup];
  const imported = await run(args);
  assert.equal(imported.code, 0, imported.output);
  for (const type of transactionalTypes) assert.deepEqual(readArchive(f.directory, type), expected[type]);
  assert.equal((await run(args)).code, 0);
  for (const [type, content] of Object.entries(sources))
    assert.equal(await fs.readFile(path.join(root, "backend/database", `${type}.json`), "utf8"), content);
});

test("migration backs up exact bytes, preserves every field and order, and never overwrites later edits", async (t) => {
  const f = await fixture(t, { history: true });
  const untouched = await fs.readFile(path.join(f.directory, "accounts.json"), "utf8");
  assert.equal(migrateStorage(f.directory, f.backup).imported, true);
  const manifest = JSON.parse(await fs.readFile(path.join(f.backup, "manifest.json"), "utf8"));
  const store = openStorage(f.directory);
  try {
    assert.deepEqual(store.snapshot(), f.state);
    for (const type of transactionalTypes) {
      const source = await fs.readFile(path.join(f.directory, `${type}.json`), "utf8");
      assert.equal(await fs.readFile(path.join(f.backup, `${type}.json`), "utf8"), source);
      assert.equal(digest(source), manifest.files[`${type}.json`]);
    }
    store.transaction(() => {
      const rows = store.snapshot().product;
      rows[1].stock = 5;
      store.replace("product", rows);
    });
    assert.equal(migrateStorage(f.directory, f.backup).imported, false);
    assert.equal(store.snapshot().product[1].stock, 5);
    await fs.writeFile(path.join(f.directory, "product.json"), JSON.stringify([]));
    assert.throws(() => migrateStorage(f.directory, f.backup), /archivi diversi/);
    assert.equal(store.snapshot().product[1].stock, 5);
  } finally { store.close(); }
  assert.equal(await fs.readFile(path.join(f.directory, "accounts.json"), "utf8"), untouched);
  assert.deepEqual((await fs.readdir(f.backup)).sort(), ["availability.json", "manifest.json", "order.json", "product.json", "storesetting.json"]);
});

test("bad imports fail closed; missing optional archives stay empty and startup never imports JSON", async (t) => {
  const f = await fixture(t, { history: true });
  assert.throws(() => openStorage(f.directory), /SQLite assente/);
  await assert.rejects(fs.access(path.join(f.directory, databaseName)));
  const invalidOrders = [f.state.order[0], { ...f.state.order[0], id: 72, accountId: "another-owner" }];
  await fs.writeFile(path.join(f.directory, "order.json"), JSON.stringify(invalidOrders));
  assert.throws(() => migrateStorage(f.directory, f.backup), /idempotenza duplicate/);
  await assert.rejects(fs.access(path.join(f.directory, databaseName)));
  await assert.rejects(fs.access(f.backup));
  await fs.writeFile(path.join(f.directory, "order.json"), JSON.stringify(f.state.order));
  await fs.writeFile(path.join(f.directory, "product.json"), JSON.stringify([f.state.product[0], f.state.product[0]]));
  assert.throws(() => migrateStorage(f.directory, f.backup), /identificativi/);
  await fs.writeFile(path.join(f.directory, "product.json"), JSON.stringify(f.state.product));
  await fs.unlink(path.join(f.directory, "availability.json"));
  await fs.unlink(path.join(f.directory, "storesetting.json"));
  migrateStorage(f.directory, f.backup);
  assert.deepEqual(readArchive(f.directory, "availability"), []);
  assert.deepEqual(readArchive(f.directory, "storesetting"), []);
});

test("SQL uniqueness rolls back stock too; reopening and restoring a cold backup preserve the whole snapshot", async (t) => {
  const f = await fixture(t, { history: true });
  migrateStorage(f.directory, f.backup);
  const store = openStorage(f.directory);
  try {
    assert.throws(() => store.transaction(() => {
      const state = store.snapshot();
      state.product[1].stock--;
      store.replace("product", state.product);
      store.replace("order", [...state.order, { ...state.order[0], id: 72, accountId: "other" }]);
    }), /UNIQUE constraint failed/);
    assert.deepEqual(store.snapshot(), f.state);
  } finally { store.close(); }
  const coldBackup = path.join(f.directory, "cold-backup.sqlite");
  await fs.copyFile(path.join(f.directory, databaseName), coldBackup);
  const reopened = openStorage(f.directory);
  try {
    reopened.transaction(() => reopened.replace("order", []));
  } finally { reopened.close(); }
  await fs.copyFile(coldBackup, path.join(f.directory, databaseName));
  const restored = openStorage(f.directory);
  try { assert.deepEqual(restored.snapshot(), f.state); }
  finally { restored.close(); }
});

test("independent HTTP processes serialize keys, base and variant stock, capacity and administration", async (t) => {
  const f = await fixture(t);
  migrateStorage(f.directory, f.backup);
  const a = await start(f), b = await start(f);
  const admin = (server, route, body) => server.api(route, { method: "PUT", body, cookie: `ts_admin=${adminToken}` });
  const same = await Promise.all(Array.from({ length: 8 }, (_, i) => [a, b][i % 2].api(i % 2 ? "/orders/" : "/ORDERS", {
    body: input("same-concurrent-key"), cookie: `ts_account=${customerToken}`,
  })));
  assert.equal(same.filter((r) => r.status === 201).length, 1);
  assert.equal(same.filter((r) => r.status === 200).length, 7);
  assert.equal(new Set(same.map((r) => r.data.order.id)).size, 1);
  assert.equal(readArchive(f.directory, "product")[1].stock, 7);
  const wrongOwner = await b.api("/orders", { body: input("same-concurrent-key") });
  assert.deepEqual(wrongOwner, { status: 409, data: { error: "invalidOrder" } });

  assert.equal((await admin(a, "/admin/products/1", { stock: 1 })).status, 200);
  assert.equal((await admin(b, "/admin/products/1", { title: "Titolo aggiornato" })).data.stock, 1);
  const base = await Promise.all([a, b].map((server, i) => server.api("/orders", { body: input(`base-stock-${i}`) })));
  assert.deepEqual(base.map((r) => r.status).sort(), [201, 409]);
  assert.equal(readArchive(f.directory, "product")[1].stock, 0);
  const variant = f.state.product[0].variants[0];
  await admin(a, "/admin/products/2", { variants: [{ ...variant, stock: 1 }] });
  const variants = await Promise.all([a, b].map((server, i) => server.api("/orders", { body: input(`variant-stock-${i}`, 2, f.variantId) })));
  assert.deepEqual(variants.map((r) => r.status).sort(), [201, 409]);
  assert.equal(readArchive(f.directory, "product")[0].variants[0].stock, 0);

  const occupied = readArchive(f.directory, "order").length;
  assert.equal((await admin(b, "/admin/availability/9", { slots: [{ start: "16:00", end: "17:00", capacity: occupied - 1 }] })).status, 409);
  assert.equal((await admin(a, "/admin/availability/9", { slots: [{ start: "16:00", end: "17:00", capacity: occupied + 1 }] })).status, 200);
  await admin(b, "/admin/products/1", { stock: 8, available: true });
  const capacity = await Promise.all([a, b].map((server, i) => server.api("/orders", { body: input(`last-capacity-${i}`) })));
  assert.deepEqual(capacity.map((r) => r.status).sort(), [201, 409]);
  assert.equal(capacity.find((r) => r.status === 409).data.error, "slotFull");
  assert.equal(readArchive(f.directory, "order").length, occupied + 1);
  assert.equal(readArchive(f.directory, "product")[1].stock, 7);

  const order = same[0].data.order;
  await admin(b, `/admin/orders/${order.id}`, { status: "Annullato" });
  assert.equal((await admin(a, `/admin/orders/${order.id}`, { status: "Confermato" })).status, 409);
  assert.equal(readArchive(f.directory, "product")[1].stock, 7);
  const activeBefore = readArchive(f.directory, "order").filter((row) => row.status !== "Annullato").length;
  const [calendarEdit, racingOrder] = await Promise.all([
    admin(a, "/admin/availability/9", { slots: [{ start: "16:00", end: "17:00", capacity: activeBefore }] }),
    b.api("/orders", { body: input("calendar-edit-racing-order") }),
  ]);
  assert.ok((calendarEdit.status === 200 && racingOrder.status === 409) ||
    (calendarEdit.status === 409 && racingOrder.status === 201));
  const activeAfter = readArchive(f.directory, "order").filter((row) => row.status !== "Annullato").length;
  assert.ok(activeAfter <= readArchive(f.directory, "availability")[0].slots[0].capacity);
  assert.equal(readArchive(f.directory, "product")[1].stock, 7 - Number(racingOrder.status === 201));
  await admin(a, "/admin/settings/3", { weekdays: [] });
  const snapshot = readArchive(f.directory, "order");
  const changedDate = calendarDays([], [], { ...defaultSettings, weekdays: [0, 1, 2, 3, 4, 5, 6] })
    .find((day) => day.date !== date).date;
  const closed = await b.api("/orders", { body: { ...input("settings-change-check"), pickupDate: changedDate } });
  assert.equal(closed.status, 409);
  assert.deepEqual(readArchive(f.directory, "order"), snapshot);
  await a.stop();
  await b.stop();
  const restarted = await start(f);
  const retry = await restarted.api("/orders", { body: { idempotencyKey: order.idempotencyKey }, cookie: `ts_account=${customerToken}` });
  assert.equal(retry.status, 200);
  assert.equal(retry.data.order.id, order.id);
  assert.equal(retry.data.order.status, "Annullato");
  assert.deepEqual(readArchive(f.directory, "order"), snapshot);
});

test("hard crash between SQL stock update and order insert leaves no partial writes, then retry commits once", async (t) => {
  const f = await fixture(t);
  migrateStorage(f.directory, f.backup);
  const crashed = await start(f, { pause: true });
  const checkpoint = once(crashed.child, "message", { signal: AbortSignal.timeout(10000) });
  const body = input("hard-crash-retry");
  const pending = crashed.api("/orders", { body }).catch((error) => error);
  assert.deepEqual((await checkpoint)[0], { stockWritten: true });
  await crashed.stop();
  assert.ok(await pending instanceof Error);
  const recovered = openStorage(f.directory);
  try { assert.deepEqual(recovered.snapshot(), f.state); }
  finally { recovered.close(); }
  const restarted = await start(f);
  assert.equal((await restarted.api("/orders", { body })).status, 201);
  assert.equal((await restarted.api("/orders", { body })).status, 200);
  assert.equal(readArchive(f.directory, "product")[1].stock, 7);
  assert.equal(readArchive(f.directory, "order").length, 1);
  const check = new DatabaseSync(path.join(f.directory, databaseName));
  try { assert.equal(check.prepare("PRAGMA integrity_check").get().integrity_check, "ok"); }
  finally { check.close(); }
});
