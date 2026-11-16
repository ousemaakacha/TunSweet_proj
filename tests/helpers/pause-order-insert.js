import { DatabaseSync } from "node:sqlite";

// Test-only preload: stop the real HTTP checkout after SQL stock writes, before an order insert.
const prepare = DatabaseSync.prototype.prepare;
DatabaseSync.prototype.prepare = function (sql) {
  const statement = prepare.call(this, sql);
  if (sql.startsWith("INSERT INTO records")) {
    const run = statement.run.bind(statement);
    statement.run = function (type, ...parameters) {
      if (type === "order") {
        process.send({ stockWritten: true });
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
      }
      return run(type, ...parameters);
    };
  }
  return statement;
};
