import path from "node:path";
import { migrateStorage, openStorage } from "../../backend/storage.js";

export function importFixture(directory) {
  return migrateStorage(directory, path.join(directory, "migration-backup"));
}

export function readArchive(directory, type) {
  const store = openStorage(directory, { readOnly: true });
  try { return store.snapshot()[type]; }
  finally { store.close(); }
}
