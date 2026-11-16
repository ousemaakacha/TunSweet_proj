import { parseArgs } from "node:util";
import { migrateStorage } from "./storage.js";

try {
  const { values } = parseArgs({ options: {
    directory: { type: "string" },
    backup: { type: "string" },
  } });
  if (!values.directory || !values.backup)
    throw new Error("Uso: npm run storage:migrate -- --directory <copia-archivi> --backup <nuova-directory-backup>");
  const result = migrateStorage(values.directory, values.backup);
  console.log(result.imported ? `Importazione completata. Backup: ${result.backupDirectory}` :
    "Archivi già importati. SQLite e modifiche successive preservati.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
