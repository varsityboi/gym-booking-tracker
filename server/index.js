import express from "express";
import pool from "./db.js";
import authRouter from "./routes/auth.js";
import classesRouter from "./routes/classes.js";
import bookingsRouter from "./routes/bookings.js";
import mealRoutes from "./routes/meals.js";
import foodRoutes from "./routes/foods.js";
import waterRoutes from "./routes/water.js";
import targetRoutes from "./routes/targets.js";
import meRoutes from "./routes/me.js";
const app = express();
app.use(express.json());
const PORT = 3000;
app.use("/meals", mealRoutes);
app.use("/foods", foodRoutes);
app.use("/water", waterRoutes);
app.use("/targets", targetRoutes);
app.use("/me", meRoutes);
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
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "photo is too large (max 8 MB)" });
  }
  if (err.code === "LIMIT_UNEXPECTED_FILE" || err.code === "LIMIT_FILE_COUNT") {
    return res.status(400).json({ error: "send exactly one photo in the 'photo' field" });
  }
  res.status(500).json({ error: "something went wrong" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
