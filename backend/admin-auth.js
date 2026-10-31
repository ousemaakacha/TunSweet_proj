import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const derive = promisify(scrypt);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const SESSION_MS = 8 * 60 * 60 * 1000;
export async function adminCredentials(email, password) {
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 128
  )
    throw new Error("Usa un’email valida e una password di 12–128 caratteri.");
  const salt = randomBytes(16).toString("hex");
  return {
    email: email.trim().toLowerCase(),
    name: "Amministratore",
    password: {
      salt,
      hash: (await derive(password, salt, 64)).toString("hex"),
    },
  };
}
export async function adminAuth({
  directory,
  env = process.env,
  now = Date.now,
}) {
  const accountFile = path.join(directory, "admin-account.json");
  const sessionFile = path.join(directory, "admin-sessions.json");
  let sessions = [];
  try {
    sessions = JSON.parse(await fs.readFile(sessionFile, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!Array.isArray(sessions))
    throw new Error("Archivio sessioni amministrative non valido.");
  const attempts = new Map();
  const cookie = {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production" || env.AUTH_COOKIE_SECURE === "true",
    path: "/",
  };
  let queue = Promise.resolve();
  const serialize = (handler) => (req, res, next) => {
    queue = queue
      .catch(() => {})
      .then(() => handler(req, res, next))
      .catch(next);
  };
  const save = async () => {
    await fs.writeFile(`${sessionFile}.tmp`, JSON.stringify(sessions), {
      mode: 0o600,
    });
    await fs.rename(`${sessionFile}.tmp`, sessionFile);
  };
  const readAccount = async () => {
    try {
      return JSON.parse(await fs.readFile(accountFile, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  };
  const sessionHash = (req) => {
    const value = req.headers.cookie
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("ts_admin="))
      ?.slice(9);
    return value ? digest(value) : null;
  };
  const login = serialize(async (req, res) => {
    for (const [key, value] of attempts)
      if (value.until <= now()) attempts.delete(key);
    const key = req.ip;
    const a = attempts.get(key) || { count: 0, until: now() + 15 * 60000 };
    attempts.set(key, a);
    if (++a.count > 10) {
      res.set("Retry-After", "900");
      return res
        .status(429)
        .json({ error: "Troppi tentativi. Riprova tra 15 minuti." });
    }
    const account = await readAccount();
    if (!account)
      return res.status(503).json({
        error:
          "Accesso amministrativo non configurato. Crea l’account dal terminale con npm run admin:create nella cartella backend.",
      });
    const validInput =
      typeof req.body?.email === "string" &&
      typeof req.body?.password === "string" &&
      req.body.password.length <= 128;
    const password = validInput ? req.body.password : "";
    const candidate = await derive(password, account.password.salt, 64);
    const valid = timingSafeEqual(
      candidate,
      Buffer.from(account.password.hash, "hex"),
    );
    if (
      !validInput ||
      !valid ||
      req.body.email.trim().toLowerCase() !== account.email
    )
      return res.status(401).json({ error: "Email o password non corrette." });
    const token = randomBytes(32).toString("hex");
    const expiresAt = now() + SESSION_MS;
    sessions = sessions.filter((s) => s.expiresAt > now());
    sessions.push({ hash: digest(token), expiresAt, email: account.email });
    await save();
    attempts.delete(key);
    res.cookie("ts_admin", token, { ...cookie, maxAge: SESSION_MS });
    res.json({ name: account.name, email: account.email, expiresAt });
  });
  const authorize = serialize(async (req, res, next) => {
    const account = await readAccount();
    const session = sessions.find(
      (s) =>
        s.hash === sessionHash(req) &&
        s.expiresAt > now() &&
        s.email === account?.email,
    );
    if (!session)
      return res
        .status(401)
        .json({ error: "Sessione scaduta. Accedi nuovamente." });
    req.adminSession = session;
    next();
  });
  return {
    login,
    authorize,
    session: (req, res) =>
      res.json({
        name: "Amministratore",
        email: req.adminSession.email,
        expiresAt: req.adminSession.expiresAt,
      }),
    logout: serialize(async (req, res) => {
      sessions = sessions.filter((s) => s.hash !== req.adminSession.hash);
      await save();
      res.clearCookie("ts_admin", cookie);
      res.json({ success: true });
    }),
  };
}
