import express from "express";
import pool from "./db.js";
import authRouter from "./routes/auth.js";
import classesRouter from "./routes/classes.js";
import bookingsRouter from "./routes/bookings.js";
import mealRoutes from "./routes/meals.js";
const app = express();
app.use(express.json());
const PORT = 3000;
app.use("/meals", mealRoutes);
app.get("/", (req, res) => {
  res.send("Gym API is running");
});

app.get("/db-test", async (req, res) => {
  const result = await pool.query("SELECT NOW()");
  res.send(result.rows[0]);
});

app.use("/auth", authRouter);
app.use("/classes", classesRouter);
app.use("/bookings", bookingsRouter);

app.use((req, res) => {
  res.status(404).json({ error: "route not found" });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "invalid JSON in request body" });
  }
  res.status(500).json({ error: "something went wrong" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
