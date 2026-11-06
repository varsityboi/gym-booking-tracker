import fs from "node:fs";

// schema.sql, applied as one script. `db` is a pg Pool or Client.
// Used by npm run db:setup (the real database) and npm run db:seed.
export async function applySchema(db) {
  const sql = fs.readFileSync(new URL("../../schema.sql", import.meta.url), "utf8");
  await db.query(sql);
}
