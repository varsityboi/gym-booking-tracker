import fs from "fs";
import pool from "./db.js";

const sql = fs.readFileSync("schema.sql", "utf8");
await pool.query(sql);
console.log("Tables created");
await pool.end();