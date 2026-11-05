// Security middleware tests, no database or AI: CORS, helmet (including the
// Swagger page's CSP), the JSON body limit, and the login/sign-up limiters.
// CORS/helmet/body-limit go through the real app from app.js on requests that
// are answered before any route touches the database. The limiters' counting
// is tested on fresh limiters in front of a fake login handler, and a check
// confirms the real auth routes use the shared limiters.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.CLIENT_ORIGIN = "http://localhost:5173, https://gym.example.com";
const { default: express } = await import("express");
const { default: app } = await import("../app.js");
const { default: authRouter } = await import("../routes/auth.js");
const { createLoginLimiter, createSignupLimiter, loginLimiter, signupLimiter } = await import(
  "../middleware/rateLimit.js"
);

const servers = [];
function listen(handler) {
  const server = handler.listen(0);
  servers.push(server);
  return `http://localhost:${server.address().port}`;
}
let base;
before(() => {
  base = listen(app);
});
after(() => servers.forEach((s) => s.close()));

const preflight = (origin) =>
  fetch(`${base}/classes`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "PATCH",
      "Access-Control-Request-Headers": "authorization,content-type",
    },
  });

test("CORS: an allowed origin gets the CORS headers", async () => {
  const res = await preflight("http://localhost:5173");
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:5173");
  assert.equal(res.headers.get("access-control-allow-methods"), "GET,POST,PUT,PATCH,DELETE");
  assert.equal(res.headers.get("access-control-allow-headers"), "Authorization,Content-Type");

  // The second origin in the comma-separated list works too, on a real request.
  const get = await fetch(`${base}/`, { headers: { Origin: "https://gym.example.com" } });
  assert.equal(get.headers.get("access-control-allow-origin"), "https://gym.example.com");
});

test("CORS: any other origin gets no Access-Control-Allow-Origin", async () => {
  const res = await preflight("https://evil.example");
  assert.equal(res.headers.get("access-control-allow-origin"), null);
  const get = await fetch(`${base}/`, { headers: { Origin: "https://evil.example" } });
  assert.equal(get.headers.get("access-control-allow-origin"), null);
  // Requests without an Origin (curl, servers) are unaffected.
  assert.equal((await fetch(`${base}/`)).status, 200);
});

test("helmet: API responses get the default headers", async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.match(res.headers.get("content-security-policy"), /upgrade-insecure-requests/);
});

test("/docs still loads, with a CSP that allows it", async () => {
  const page = await fetch(`${base}/docs/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>Swagger UI<\/title>/);
  const csp = page.headers.get("content-security-policy");
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /style-src 'self' https: 'unsafe-inline'/);
  assert.doesNotMatch(csp, /upgrade-insecure-requests/);

  for (const file of ["swagger-ui-bundle.js", "swagger-ui-standalone-preset.js", "swagger-ui.css"]) {
    assert.equal((await fetch(`${base}/docs/${file}`)).status, 200, file);
  }
  const init = await (await fetch(`${base}/docs/swagger-ui-init.js`)).text();
  assert.match(init, /"validatorUrl": null/);
  assert.match(init, /"openapi": "3.1.0"/);
});

test("a JSON body over 100kb: 413 request body too large", async () => {
  const res = await fetch(`${base}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "x".repeat(150 * 1024), email: "a@b.co", password: "12345678" }),
  });
  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { error: "request body too large" });
});

test("the real /auth routes use the shared limiters, before validation", () => {
  const first = (path) =>
    authRouter.stack.find((l) => l.route?.path === path && l.route.methods.post).route.stack[0].handle;
  assert.equal(first("/login"), loginLimiter);
  assert.equal(first("/signup"), signupLimiter);
});

// A fake login: 200 for the password "right", 401 otherwise.
function fakeLoginServer(limiter) {
  const fake = express();
  fake.use(express.json());
  fake.post("/login", limiter, (req, res) =>
    req.body.password === "right"
      ? res.json({ token: "t" })
      : res.status(401).json({ error: "wrong email or password" })
  );
  const url = listen(fake);
  return (email, password) =>
    fetch(`${url}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
}

test("login limiter: the 6th failed attempt gets 429 with Retry-After", async () => {
  const login = fakeLoginServer(createLoginLimiter());
  for (let i = 1; i <= 5; i++) {
    // Case and spaces don't make a new key.
    const email = i % 2 ? "Asha@Example.com" : " asha@example.com ";
    assert.equal((await login(email, "wrong")).status, 401, `attempt ${i}`);
  }
  const sixth = await login("asha@example.com", "right");
  assert.equal(sixth.status, 429, "blocked even with the right password");
  assert.deepEqual(await sixth.json(), { error: "too many login attempts, try again later" });
  const retryAfter = Number(sixth.headers.get("retry-after"));
  assert.ok(retryAfter > 0 && retryAfter <= 15 * 60, `Retry-After ${retryAfter}`);

  // A different email from the same address has its own count.
  assert.equal((await login("someone@example.com", "wrong")).status, 401);
});

test("login limiter: a correct login isn't counted", async () => {
  const login = fakeLoginServer(createLoginLimiter());
  const email = "ravi@example.com";
  for (let i = 1; i <= 4; i++) assert.equal((await login(email, "wrong")).status, 401);
  assert.equal((await login(email, "right")).status, 200);
  // Had the success counted, this would be the 6th attempt and get 429.
  assert.equal((await login(email, "wrong")).status, 401, "5th failure still allowed");
  assert.equal((await login(email, "wrong")).status, 429, "6th failure blocked");
});

test("sign-up limiter: the 11th request in an hour gets 429", async () => {
  const fake = express();
  fake.use(express.json());
  fake.post("/signup", createSignupLimiter(), (req, res) => res.status(201).json({ id: 1 }));
  const url = listen(fake);
  const signup = () => fetch(`${url}/signup`, { method: "POST" });
  for (let i = 1; i <= 10; i++) assert.equal((await signup()).status, 201, `request ${i}`);
  const eleventh = await signup();
  assert.equal(eleventh.status, 429);
  assert.deepEqual(await eleventh.json(), { error: "too many sign-ups from this address, try again later" });
  assert.ok(Number(eleventh.headers.get("retry-after")) > 0);
});
