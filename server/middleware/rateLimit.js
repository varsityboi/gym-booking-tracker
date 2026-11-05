import { rateLimit, ipKeyGenerator } from "express-rate-limit";

// In-memory counters: they reset when the server restarts and aren't shared
// between server processes. Behind a reverse proxy, set Express's
// "trust proxy" so req.ip is the client's address, not the proxy's.

const MINUTE = 60 * 1000;

// Failed logins per IP + email: 5 per 15 minutes. Successful logins (status
// < 400) aren't counted. The 6th failed attempt, and anything after it until
// the window ends, gets 429 with a Retry-After header (seconds).
export function createLoginLimiter({ windowMs = 15 * MINUTE, limit = 5 } = {}) {
  return rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-7", // RateLimit headers, and Retry-After when limited
    legacyHeaders: false,
    // ipKeyGenerator groups IPv6 addresses by subnet, so one user can't
    // dodge the limit by rotating addresses.
    keyGenerator: (req) =>
      `${ipKeyGenerator(req.ip)}|${String(req.body?.email ?? "").trim().toLowerCase()}`,
    handler: (req, res) => {
      res.status(429).json({ error: "too many login attempts, try again later" });
    },
  });
}

// Sign-ups per IP: 10 per hour, successful or not.
export function createSignupLimiter({ windowMs = 60 * MINUTE, limit = 10 } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({ error: "too many sign-ups from this address, try again later" });
    },
  });
}

export const loginLimiter = createLoginLimiter();
export const signupLimiter = createSignupLimiter();
