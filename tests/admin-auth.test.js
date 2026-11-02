import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { adminAuth, adminCredentials } from "../backend/admin-auth.js";
const require = createRequire(
  new URL("../backend/package.json", import.meta.url),
);
const express = require("express");
const credentials = {
  email: "owner@tunisweet.test",
  password: "AnIndependentTestPassword!",
};
async function fixture(t, env = {}) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "tunisweet-admin-auth-"),
  );
  let time = Date.now(),
    server;
  const start = async () => {
    const app = express();
    app.use(express.json());
    const auth = await adminAuth({ directory, env, now: () => time });
    app.post("/session", auth.login);
    app.use(auth.authorize);
    app.get("/session", auth.session);
    app.delete("/session", auth.logout);
    server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
  };
  await start();
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return {
    directory,
    advance: (ms) => (time += ms),
    configure: () =>
      adminCredentials(credentials.email, credentials.password).then(
        (account) =>
          fs.writeFile(
            path.join(directory, "admin-account.json"),
            JSON.stringify(account),
          ),
      ),
    restart: async () => {
      await new Promise((r) => server.close(r));
      await start();
    },
    async api(method = "GET", body, cookie) {
      const r = await fetch(
        `http://127.0.0.1:${server.address().port}/session`,
        {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(cookie ? { Cookie: cookie } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        },
      );
      return {
        status: r.status,
        data: await r.json(),
        cookie: r.headers.get("set-cookie"),
      };
    },
  };
}
test("administrator requires provisioning, persists hashed sessions and revokes access", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.api("POST", credentials)).status, 503);
  await f.configure();
  assert.equal(
    (await f.api("POST", { ...credentials, password: "wrong" })).status,
    401,
  );
  const login = await f.api("POST", credentials);
  assert.equal(login.status, 200);
  assert.equal(login.data.token, undefined);
  assert.equal(login.data.password, undefined);
  assert.match(login.cookie, /HttpOnly/);
  assert.match(login.cookie, /SameSite=Lax/);
  const cookie = login.cookie.split(";")[0];
  await f.restart();
  assert.equal((await f.api("GET", undefined, cookie)).status, 200);
  const saved = await fs.readFile(
    path.join(f.directory, "admin-sessions.json"),
    "utf8",
  );
  assert.ok(!saved.includes(cookie.split("=")[1]));
  assert.ok(
    !(
      await fs.readFile(path.join(f.directory, "admin-account.json"), "utf8")
    ).includes(credentials.password),
  );
  assert.equal((await f.api("DELETE", undefined, cookie)).status, 200);
  assert.equal((await f.api("GET", undefined, cookie)).status, 401);
  const again = await f.api("POST", credentials);
  f.advance(8 * 3600000 + 1);
  assert.equal(
    (await f.api("GET", undefined, again.cookie.split(";")[0])).status,
    401,
  );
});
test("administrator cookies are secure in production and login attempts are limited", async (t) => {
  const f = await fixture(t, { NODE_ENV: "production" });
  await f.configure();
  assert.match((await f.api("POST", credentials)).cookie, /Secure/);
  for (let i = 0; i < 10; i++)
    assert.equal(
      (await f.api("POST", { ...credentials, password: "wrong" })).status,
      401,
    );
  assert.equal((await f.api("POST", credentials)).status, 429);
  f.advance(15 * 60000 + 1);
  assert.equal((await f.api("POST", credentials)).status, 200);
});
