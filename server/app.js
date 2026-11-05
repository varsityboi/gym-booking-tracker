import { readFileSync } from "node:fs";
import express from "express";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";
import { corsMiddleware, apiHelmet, docsHelmet } from "./middleware/security.js";
import authRouter from "./routes/auth.js";
import classesRouter from "./routes/classes.js";
import bookingsRouter from "./routes/bookings.js";
import mealRoutes from "./routes/meals.js";
import foodRoutes from "./routes/foods.js";
import waterRoutes from "./routes/water.js";
import targetRoutes from "./routes/targets.js";
import meRoutes from "./routes/me.js";
import healthRoutes from "./routes/health.js";

// Every API router and where it's mounted, in mount order. Exported so the
// OpenAPI test can list the real routes.
export const apiMounts = [
  ["/meals", mealRoutes],
  ["/foods", foodRoutes],
  ["/water", waterRoutes],
  ["/targets", targetRoutes],
  ["/me", meRoutes],
  ["/", healthRoutes],
  ["/auth", authRouter],
  ["/classes", classesRouter],
  ["/bookings", bookingsRouter],
];

// The hand-written API description, loaded once at startup.
export const openapiSpec = YAML.parse(
  readFileSync(new URL("./openapi.yaml", import.meta.url), "utf8")
);

const app = express();
app.use(apiHelmet);
app.use(corsMiddleware);
app.use(express.json({ limit: "100kb" }));
for (const [path, router] of apiMounts) app.use(path, router);

// API docs: the raw spec and a Swagger UI page.
app.get("/openapi.json", (req, res) => res.json(openapiSpec));
app.use(
  "/docs",
  docsHelmet,
  swaggerUi.serve,
  // No validator badge: it's an image from validator.swagger.io, which the CSP blocks.
  swaggerUi.setup(openapiSpec, { swaggerOptions: { validatorUrl: null } })
);

app.use((req, res) => {
  res.status(404).json({ error: "route not found" });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "invalid JSON in request body" });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "request body too large" });
  }
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "photo is too large (max 8 MB)" });
  }
  if (err.code === "LIMIT_UNEXPECTED_FILE" || err.code === "LIMIT_FILE_COUNT") {
    return res.status(400).json({ error: "send exactly one photo in the 'photo' field" });
  }
  res.status(500).json({ error: "something went wrong" });
});

export default app;
