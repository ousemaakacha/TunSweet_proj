import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { adminCredentials } from "./admin-auth.js";
const directory =
  process.env.DATABASE_DIR ||
  fileURLToPath(new URL("./database/", import.meta.url));
await fs.mkdir(directory, { recursive: true });
const file = path.join(directory, "admin-account.json");
try {
  await fs.access(file);
  console.error(
    "Account già presente. Per sostituirlo usa npm run admin:create -- --replace.",
  );
  if (!process.argv.includes("--replace")) process.exit(1);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (!process.stdin.isTTY) {
  console.error("Apri un terminale interattivo per creare l’account.");
  process.exit(1);
}
let hidden = false;
const output = new Writable({
  write(chunk, encoding, callback) {
    if (!hidden) process.stdout.write(chunk);
    callback();
  },
});
const prompt = createInterface({
  input: process.stdin,
  output,
  terminal: true,
});
try {
  const email = (await prompt.question("Email amministratore: ")).trim();
  process.stdout.write("Password (almeno 12 caratteri, input nascosto): ");
  hidden = true;
  const password = await prompt.question("");
  hidden = false;
  process.stdout.write("\n");
  process.stdout.write("Ripeti password: ");
  hidden = true;
  const confirmation = await prompt.question("");
  hidden = false;
  process.stdout.write("\n");
  if (password !== confirmation) throw new Error("Le password non coincidono.");
  const account = await adminCredentials(email, password);
  await fs.writeFile(`${file}.tmp`, JSON.stringify(account, null, 2), {
    mode: 0o600,
  });
  await fs.rename(`${file}.tmp`, file);
  await fs.writeFile(path.join(directory, "admin-sessions.json"), "[]", {
    mode: 0o600,
  });
  console.log(
    "Account creato. Riavvia il backend, poi accedi da /admin/login.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  prompt.close();
}
