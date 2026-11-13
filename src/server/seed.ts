import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Service, schemas } from "./service.js";
import { dataDirectory } from "./http.js";
const file = process.argv[2];
if (!file) throw new Error("Usage: seed <fixture.json>");
const fixture = JSON.parse(await readFile(file, "utf8"));
if (!fixture || !Array.isArray(fixture.tasks))
  throw new Error("Fixture must contain a tasks array");
const service = new Service(join(dataDirectory(), "dashboard.sqlite"));
try {
  service.db.exec(
    "CREATE TABLE IF NOT EXISTS seed_items (fingerprint TEXT PRIMARY KEY, task_id TEXT NOT NULL)",
  );
  let count = 0;
  for (const input of fixture.tasks) {
    const value = schemas.create.parse(input);
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(value))
      .digest("hex");
    if (service.seedTask(fingerprint, value)) count++;
  }
  console.log(`Imported ${count} tasks`);
} finally {
  service.close();
}
