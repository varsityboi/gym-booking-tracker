import pool from "../config/db.js";
import { applySchema } from "./lib/schema.js";

await applySchema(pool);
console.log("Tables created");
await pool.end();
