import pool from "../config/db.js";

// { now } from the database, to check the connection.
export async function getDbTime() {
  const result = await pool.query("SELECT NOW()");
  return result.rows[0];
}
