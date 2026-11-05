import cors from "cors";
import helmet from "helmet";

// Origins allowed to call the API from a browser: CLIENT_ORIGIN, comma
// separated (default: the Vite dev server).
export const allowedOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// Requests without an Origin header (curl, server-to-server) aren't affected
// by CORS. A browser on any other origin gets no Access-Control-Allow-Origin
// header, so it can't read the response.
export const corsMiddleware = cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Authorization", "Content-Type"],
  maxAge: 600,
});

// Helmet's defaults for the API.
export const apiHelmet = helmet();

// The Swagger page at /docs works with helmet's default policy (its scripts
// are files, its inline styles are allowed), except upgrade-insecure-requests:
// that would turn "Try it out" calls to http://... into https:// and break
// them when the API runs on plain http. Set after apiHelmet, so its
// Content-Security-Policy header replaces the default one.
export const docsHelmet = helmet({
  contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
});
