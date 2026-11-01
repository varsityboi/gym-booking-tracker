import express from "express";
import pool from "./db.js";
const app = express();
const PORT = 3000;

app.get("/", (req, res) => {
  res.send("Gym API is running");
});
app.get("/db-test", async (req, res) => {
  const result = await pool.query("SELECT NOW()");
  res.send(result.rows[0]);
});
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});