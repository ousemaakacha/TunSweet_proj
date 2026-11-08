import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { customerAuth } from "../backend/customer-auth.js";
const require = createRequire(new URL("../backend/package.json", import.meta.url));
const express = require("express");

async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "tunisweet-auth-"));
  const emails = [];
  let time = Date.now();
  const config = { directory, env: {}, now: () => time,
    sendVerification: async (email, token) => emails.push({ email, token }), ...options };
  let server;
  async function start() {
    const app = express(); app.use(express.json());
    app.use("/auth", (await customerAuth(config)).router);
    server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  }
  await start();
  t.after(async () => { await new Promise((r) => server.close(r)); await fs.rm(directory, { recursive: true, force: true }); });
  return { emails, directory, advance: (ms) => { time += ms; },
    restart: async () => { await new Promise((r) => server.close(r)); await start(); },
    async api(route, body, cookie, method = body ? "POST" : "GET") {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/auth${route}`, {
        method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, data: await response.json(), cookie: response.headers.get("set-cookie") };
    } };
}
const account = { name: "Cliente Test", email: "cliente@example.com", password: "una-password-lunga!" };

test("registration, unique email, verification, cookies, persistence and revocation", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.api("/register", { ...account, password: "breve" })).status, 400);
  const registered = await f.api("/register", { ...account, email: " CLIENTE@example.com " });
  assert.equal(registered.status, 201);
  assert.equal(registered.cookie, null);
  assert.equal(f.emails[0].email, account.email);
  assert.equal((await f.api("/register", account)).status, 409);
  assert.equal((await f.api("/login", account)).data.error, "authVerificationRequired");
  assert.equal((await f.api("/session")).status, 401);
  assert.equal((await f.api("/session", undefined, `ts_account=${f.emails[0].token}`)).status, 401);
  assert.equal((await f.api("/resend", { email: account.email })).status, 429);
  const oldToken = f.emails[0].token;
  f.advance(61000);
  assert.equal((await f.api("/resend", { email: account.email })).status, 200);
  assert.equal((await f.api("/verify", { token: oldToken })).status, 400);
  const current = f.emails[1].token;
  assert.equal((await f.api("/verify", { token: current })).status, 200);
  assert.equal((await f.api("/verify", { token: current })).status, 400);
  assert.equal((await f.api("/login", { ...account, password: "sbagliata" })).status, 401);
  const login = await f.api("/login", account);
  assert.equal(login.status, 200);
  assert.equal(login.data.verified, true);
  assert.equal(login.data.password, undefined);
  assert.match(login.cookie, /HttpOnly/); assert.match(login.cookie, /SameSite=Lax/);
  const cookie = login.cookie.split(";")[0];
  await f.restart();
  assert.equal((await f.api("/session", undefined, cookie)).status, 200);
  const archive = await fs.readFile(path.join(f.directory, "accounts.json"), "utf8");
  assert.ok(!archive.includes(account.password));
  assert.ok(!archive.includes(current));
  assert.ok(!archive.includes(cookie.split("=")[1]));
  assert.equal((await f.api("/session", undefined, cookie, "DELETE")).status, 200);
  assert.equal((await f.api("/session", undefined, cookie)).status, 401);
  const second = await f.api("/login", account);
  f.advance(8 * 3600000 + 1);
  assert.equal((await f.api("/session", undefined, second.cookie.split(";")[0])).status, 401);
});

test("expired/malformed links cannot verify accounts; resend replaces an expired link", async (t) => {
  const f = await fixture(t);
  await f.api("/register", account);
  f.advance(3600001);
  assert.equal((await f.api("/verify", { token: f.emails[0].token })).data.error, "authExpiredLink");
  assert.equal((await f.api("/verify", { token: "bad" })).data.error, "authInvalidLink");
  assert.equal((await f.api("/login", account)).status, 403);
  await f.api("/resend", { email: account.email });
  assert.equal((await f.api("/verify", { token: f.emails[1].token })).status, 200);
});

test("missing SMTP reports failure and keeps account unverified; resend can recover", async (t) => {
  const f = await fixture(t, { sendVerification: undefined });
  assert.equal((await f.api("/register", account)).data.error, "authEmailUnavailable");
  assert.equal((await f.api("/login", account)).status, 403);
  assert.equal((await f.api("/resend", { email: account.email })).status, 503);
  assert.equal((await f.api("/resend", { email: "unknown@example.com" })).status, 200);
});

test("SMTP delivery errors allow retry and production cookies require HTTPS", async (t) => {
  let fail = true; let raw;
  const f = await fixture(t, { env: { NODE_ENV: "production" }, sendVerification: async (_, token) => {
    if (fail) throw new Error("SMTP unavailable"); raw = token;
  } });
  assert.equal((await f.api("/register", account)).status, 503);
  fail = false;
  assert.equal((await f.api("/resend", { email: account.email })).status, 200);
  await f.api("/verify", { token: raw });
  assert.match((await f.api("/login", account)).cookie, /Secure/);
});

test("login attempts are limited", async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 40; i++) await f.api("/login", {});
  assert.equal((await f.api("/login", {})).status, 429);
  f.advance(15 * 60000 + 1);
  assert.equal((await f.api("/login", {})).status, 400);
});
