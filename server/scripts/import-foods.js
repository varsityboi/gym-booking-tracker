import pool from "../config/db.js";
import { importFoods } from "./lib/foods.js";

const count = await importFoods(pool);
console.log(`Loaded ${count} foods`);
await pool.end();
