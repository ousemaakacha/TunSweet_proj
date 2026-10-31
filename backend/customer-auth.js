import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { Router } from "express";
import { z } from "zod";
import nodemailer from "nodemailer";

const derive = promisify(scrypt);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("hex");
const HOUR = 3600000;
const email = z.string().trim().max(254).email().transform((v) => v.toLowerCase());
const credentials = z.object({ email, password: z.string().min(1).max(128) });
const registration = credentials.extend({
  name: z.string().trim().min(2).max(120),
  password: z.string().min(12).max(128),
});
const publicUser = ({ id, name, email, verifiedAt }) => ({ id, name, email, verified: !!verifiedAt });
const fail = (status, code) => { throw Object.assign(new Error(code), { status }); };

// This archive is independent of the public CRUD resources: hashes never leave this router.
export async function customerAuth({ directory, sendVerification, now = Date.now, env = process.env }) {
  const router = Router();
  const file = path.join(directory, "accounts.json");
  let state;
  try { state = JSON.parse(await fs.readFile(file, "utf8")); }
  catch (e) { if (e.code !== "ENOENT") throw e; state = { users: [], sessions: [] }; }
  if (!Array.isArray(state.users) || !Array.isArray(state.sessions)) throw new Error("Archivio account non valido.");
  const save = async () => {
    await fs.writeFile(`${file}.tmp`, JSON.stringify(state, null, 2), { mode: 0o600 });
    await fs.rename(`${file}.tmp`, file);
  };
  const secure = env.AUTH_COOKIE_SECURE === "true" || env.NODE_ENV === "production";
  const cookieOptions = { httpOnly: true, secure, sameSite: "lax", path: "/" };
  let queue = Promise.resolve();
  const limited = new Map();
  router.use((req, res, next) => {
    if (req.method !== "POST") return next();
    // Bound memory and count failed requests as well as successful ones.
    for (const [key, value] of limited) if (value.until <= now()) limited.delete(key);
    const keys = [req.ip];
    if (["/login", "/resend"].includes(req.path) && typeof req.body?.email === "string")
      keys.push(`${req.path}:${req.body.email.trim().toLowerCase().slice(0, 254)}`);
    for (const key of keys) {
      const entry = limited.get(key) || { count: 0, until: now() + 15 * 60000 };
      limited.set(key, entry);
      if (++entry.count > 40) { res.set("Retry-After", "900"); return res.status(429).json({ error: "authRateLimit" }); }
    }
    next();
  });
  const route = (handler) => (req, res, next) => {
    queue = queue.catch(() => {}).then(async () => {
      const before = structuredClone(state);
      try { await handler(req, res); }
      catch (e) { if (e instanceof z.ZodError) res.status(400).json({ error: "authInvalidFields" }); else if (e.status) res.status(e.status).json({ error: e.message }); else { state = before; next(e); } }
    });
  };
  const send = sendVerification || smtpVerification(env);
  async function verification(user) {
    if (user.sentAt && now() - user.sentAt < 60000) fail(429, "authResendWait");
    const raw = token();
    user.verification = { hash: digest(raw), expiresAt: now() + HOUR };
    await save();
    try { await send(user.email, raw); }
    catch { fail(503, "authEmailUnavailable"); }
    user.sentAt = now();
    await save();
  }
  router.post("/register", route(async (req, res) => {
    const input = registration.parse(req.body);
    if (state.users.some((u) => u.email === input.email)) fail(409, "authEmailExists");
    const salt = randomBytes(16).toString("hex");
    const hash = await derive(input.password, salt, 64);
    const user = { id: token(), name: input.name, email: input.email,
      password: { salt, hash: hash.toString("hex") }, createdAt: now(), verifiedAt: null };
    state.users.push(user);
    await verification(user);
    res.status(201).json({ verificationRequired: true });
  }));
  router.post("/resend", route(async (req, res) => {
    const input = z.object({ email }).parse(req.body);
    const user = state.users.find((u) => u.email === input.email);
    if (user && !user.verifiedAt) await verification(user);
    res.json({ success: true });
  }));
  router.post("/verify", route(async (req, res) => {
    const raw = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(req.body);
    if (!raw.success) fail(400, "authInvalidLink");
    const user = state.users.find((u) => u.verification?.hash === digest(raw.data.token));
    if (!user) fail(400, "authInvalidLink");
    if (user.verification.expiresAt <= now()) fail(410, "authExpiredLink");
    user.verifiedAt = now();
    delete user.verification;
    await save();
    res.json({ success: true });
  }));
  router.post("/login", route(async (req, res) => {
    const input = credentials.parse(req.body);
    const user = state.users.find((u) => u.email === input.email);
    // Always derive a hash, including unknown addresses.
    const candidate = await derive(input.password, user?.password.salt || "unknown-account-salt", 64);
    const expected = Buffer.from(user?.password.hash || "00".repeat(64), "hex");
    if (!timingSafeEqual(candidate, expected) || !user) fail(401, "authInvalidCredentials");
    if (!user.verifiedAt) fail(403, "authVerificationRequired");
    const raw = token();
    state.sessions = state.sessions.filter((s) => s.expiresAt > now());
    state.sessions.push({ hash: digest(raw), userId: user.id, expiresAt: now() + 8 * HOUR });
    await save();
    res.cookie("ts_account", raw, { ...cookieOptions, maxAge: 8 * HOUR });
    res.json(publicUser(user));
  }));
  const sessionHash = (req) => {
    const value = req.headers.cookie?.split(";").map((v) => v.trim()).find((v) => v.startsWith("ts_account="))?.slice(11);
    return value ? digest(value) : null;
  };
  router.get("/session", route(async (req, res) => {
    const session = state.sessions.find((s) => s.hash === sessionHash(req) && s.expiresAt > now());
    const user = session && state.users.find((u) => u.id === session.userId && u.verifiedAt);
    if (!user) fail(401, "authSessionExpired");
    res.json(publicUser(user));
  }));
  router.delete("/session", route(async (req, res) => {
    state.sessions = state.sessions.filter((s) => s.hash !== sessionHash(req));
    await save();
    res.clearCookie("ts_account", cookieOptions);
    res.json({ success: true });
  }));
  return router;
}

function smtpVerification(env) {
  let transport;
  return async (to, raw) => {
    if (!env.SMTP_HOST || !env.SMTP_FROM || !env.PUBLIC_SITE_URL) throw new Error("SMTP non configurato");
    const site = new URL(env.PUBLIC_SITE_URL);
    if (!["https:", "http:"].includes(site.protocol)) throw new Error("URL sito non valido");
    const secure = env.SMTP_SECURE === "true";
    transport ||= nodemailer.createTransport({
      host: env.SMTP_HOST, port: Number(env.SMTP_PORT) || 587, secure,
      requireTLS: !secure,
      ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {}),
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000, dnsTimeout: 10000,
      disableFileAccess: true, disableUrlAccess: true,
    });
    const url = new URL("/account/verifica", site);
    url.hash = `token=${raw}`;
    const result = await transport.sendMail({
      from: env.SMTP_FROM, to, subject: "TUNISWEET · Verifica la tua email / Verify your email",
      text: `Conferma il tuo indirizzo email aprendo questo link e premendo Verifica email. Il link scade tra un'ora ed è utilizzabile una sola volta.\n\nVerify your email by opening this link and pressing Verify email. It expires in one hour and can be used once.\n\n${url.href}\n\nSe non hai richiesto un account, ignora questa email. / If you did not request an account, ignore this email.`,
    });
    if (!result.accepted?.length) throw new Error("Email non accettata");
  };
}
