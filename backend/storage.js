import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { validators, OrderSchema } from "./schema.js";

export const transactionalTypes = ["product", "order", "availability", "storesetting"];
export const databaseName = "shop.sqlite";

function validArchiveRow(type, row) {
  if (type !== "order") return validators[type](row).valid;
  const result = OrderSchema.safeParse(row);
  // Validate known fields while retaining historical order extensions, including nested properties.
  return result.success || result.error.issues.every((issue) => issue.code === "unrecognized_keys");
}

function transaction(db, handler, mode = "IMMEDIATE") {
  db.exec(`BEGIN ${mode}`);
  try {
    const result = handler();
    if (result?.then) throw new Error("La transazione SQLite deve essere sincrona.");
    db.exec("COMMIT");
    return result;
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

function storage(db) {
  const read = db.prepare("SELECT type, document FROM records ORDER BY type, position");
  const remove = db.prepare("DELETE FROM records WHERE type = ?");
  const insert = db.prepare("INSERT INTO records (type, id, position, document) VALUES (?, ?, ?, ?)");
  function snapshot() {
    const result = Object.fromEntries(transactionalTypes.map((type) => [type, []]));
    for (const row of read.all()) result[row.type].push(JSON.parse(row.document));
    return result;
  }
  return {
    snapshot: () => db.isTransaction ? snapshot() : transaction(db, snapshot, "DEFERRED"),
    transaction: (handler) => transaction(db, handler),
    replace(type, rows) {
      if (!db.isTransaction || !transactionalTypes.includes(type))
        throw new Error("Scrittura fuori dalla transazione SQLite.");
      remove.run(type);
      rows.forEach((row, position) => insert.run(type, row.id, position, JSON.stringify(row)));
    },
    fingerprint: () => db.prepare("SELECT fingerprint FROM migration WHERE id = 1").get().fingerprint,
    close: () => db.close(),
  };
}

export function openStorage(directory, { readOnly = false } = {}) {
  const filename = path.join(directory, databaseName);
  if (!fs.existsSync(filename))
    throw new Error("SQLite assente. Esegui storage:migrate su una copia degli archivi prima di avviare il backend.");
  const db = new DatabaseSync(filename, { readOnly, timeout: 5000 });
  try {
    db.exec("PRAGMA synchronous = FULL");
    if (db.prepare("PRAGMA user_version").get().user_version !== 1 ||
        db.prepare("PRAGMA quick_check").get().quick_check !== "ok" ||
        db.prepare("PRAGMA journal_mode").get().journal_mode !== "delete")
      throw new Error("Database SQLite non valido o versione non supportata.");
    const result = storage(db);
    result.fingerprint();
    return result;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function migrateStorage(directory, backupDirectory) {
  if (!directory || !backupDirectory) throw new Error("Directory dati e backup obbligatorie.");
  directory = fs.realpathSync(directory);
  const lockfile = path.join(directory, `${databaseName}.migration.lock`);
  const lock = fs.openSync(lockfile, "wx", 0o600);
  const temporary = path.join(directory, `${databaseName}.import-${randomUUID()}`);
  let db;
  try {
    const archives = {}, state = {};
    for (const type of transactionalTypes) {
      let content = null;
      try { content = fs.readFileSync(path.join(directory, `${type}.json`), "utf8"); }
      catch (error) {
        if (error.code !== "ENOENT" || ["product", "order"].includes(type)) throw error;
      }
      archives[type] = content;
      const rows = content === null ? [] : JSON.parse(content);
      if (!Array.isArray(rows) || rows.some((row) => !validArchiveRow(type, row) ||
          !Number.isSafeInteger(row.id) || row.id < 1) ||
          new Set(rows.map((row) => row.id)).size !== rows.length)
        throw new Error(`Archivio ${type} non valido: controlla campi e identificativi.`);
      state[type] = rows;
    }
    const keys = state.order.map((order) => order.idempotencyKey);
    if (new Set(keys).size !== keys.length)
      throw new Error("Chiavi di idempotenza duplicate: importazione interrotta, nessun ordine eliminato.");
    const fingerprint = createHash("sha256").update(JSON.stringify(archives)).digest("hex");
    const filename = path.join(directory, databaseName);
    if (fs.existsSync(filename)) {
      const existing = openStorage(directory, { readOnly: true });
      try {
        if (existing.fingerprint() !== fingerprint)
          throw new Error("SQLite esistente proviene da archivi diversi. Non sarà sovrascritto.");
      } finally { existing.close(); }
      return { imported: false, fingerprint };
    }

    // Keep the exact source bytes, including fields unknown to the current validators.
    fs.mkdirSync(backupDirectory, { mode: 0o700 });
    const files = {};
    for (const [type, content] of Object.entries(archives)) {
      files[`${type}.json`] = content === null ? null : createHash("sha256").update(content).digest("hex");
      if (content !== null) fs.writeFileSync(path.join(backupDirectory, `${type}.json`), content,
        { flag: "wx", mode: 0o600, flush: true });
    }
    fs.writeFileSync(path.join(backupDirectory, "manifest.json"), JSON.stringify({
      createdAt: new Date().toISOString(), source: directory, fingerprint, files,
      counts: Object.fromEntries(transactionalTypes.map((type) => [type, state[type].length])),
    }, null, 2), { flag: "wx", mode: 0o600, flush: true });

    fs.writeFileSync(temporary, "", { flag: "wx", mode: 0o600 });
    db = new DatabaseSync(temporary, { timeout: 5000 });
    db.exec("PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL");
    transaction(db, () => {
      db.exec(`
        CREATE TABLE records (
          type TEXT NOT NULL CHECK (type IN ('product', 'order', 'availability', 'storesetting')),
          id INTEGER NOT NULL CHECK (id > 0),
          position INTEGER NOT NULL,
          document TEXT NOT NULL CHECK (json_valid(document)) CHECK (json_extract(document, '$.id') = id),
          PRIMARY KEY (type, id)
        ) STRICT;
        CREATE UNIQUE INDEX order_idempotency ON records (json_extract(document, '$.idempotencyKey'))
          WHERE type = 'order';
        CREATE TABLE migration (id INTEGER PRIMARY KEY CHECK (id = 1), fingerprint TEXT NOT NULL) STRICT;
        PRAGMA user_version = 1;
      `);
      const target = storage(db);
      for (const type of transactionalTypes) target.replace(type, state[type]);
      db.prepare("INSERT INTO migration VALUES (1, ?)").run(fingerprint);
    });
    if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
      throw new Error("Verifica integrità SQLite fallita.");
    db.close();
    db = null;
    fs.renameSync(temporary, filename);
    return { imported: true, fingerprint, backupDirectory: path.resolve(backupDirectory) };
  } finally {
    db?.close();
    for (const suffix of ["", "-journal"]) fs.rmSync(`${temporary}${suffix}`, { force: true });
    fs.closeSync(lock);
    fs.unlinkSync(lockfile);
  }
}
