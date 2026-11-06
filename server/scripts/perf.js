// npm run perf: response times and query plans against the seed database.
// Starts the app in-process with DATABASE_URL replaced by SEED_DATABASE_URL,
// logs in as the demo member and demo admin, and calls each route 20 times
// (after one untimed warm-up), printing the median and max in ms. During the
// warm-up it records the SQL the app actually sends (by wrapping pg's
// Client#query), then runs EXPLAIN ANALYZE on those statements for the routes
// below and reports which indexes they use and any sequential scans. Read-only
// (only SELECTs are explained). No AI calls: /meals/analyze isn't touched.
import pg from "pg";

const seedUrl = process.env.SEED_DATABASE_URL;
const dbName = seedUrl && decodeURIComponent(new URL(seedUrl).pathname.replace(/^\//, ""));
if (!seedUrl || !/_(seed|test)$/.test(dbName)) {
  console.error("SEED_DATABASE_URL must be set and name a database ending in _seed or _test (run npm run db:seed first)");
  process.exit(1);
}
// Before the app (and config/db.js) is imported, so its pool uses the seed db.
process.env.DATABASE_URL = seedUrl;

const ROUNDS = 20;
const SLOW_MS = 100;
const BIG_TABLE_ROWS = 1000;
const EXPLAIN_ROUTES = ["/me/today", "/meals?date", "/bookings/mine", "/admin/classes"];

// Record every query sent while `recording` is set.
let recording = null;
const originalQuery = pg.Client.prototype.query;
pg.Client.prototype.query = function (config, values, callback) {
  if (recording) {
    const text = typeof config === "string" ? config : config?.text;
    const params = typeof config === "string" ? values : (config?.values ?? values);
    if (text) recording.push({ text, values: Array.isArray(params) ? params : [] });
  }
  return originalQuery.call(this, config, values, callback);
};

const { default: app } = await import("../app.js");
const { default: pool } = await import("../config/db.js");
const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://localhost:${server.address().port}`;
console.log(`perf: app on ${base}, database ${dbName}\n`);

async function login(email) {
  const res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "demo12345" }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`login ${email}: ${res.status} ${body.error} (did npm run db:seed run?)`);
  return body.token;
}
const member = await login("demo@gym.com");
const admin = await login("demoadmin@gym.com");

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
// The busiest upcoming class: most booked plus waiting.
const busy = (
  await pool.query(`
    SELECT c.id, c.title, c.booked,
           (SELECT COUNT(*)::int FROM waitlist w WHERE w.class_id = c.id AND w.status = 'waiting') AS waiting
    FROM classes c WHERE c.status = 'scheduled' AND c.starts_at > NOW()
    ORDER BY c.booked + (SELECT COUNT(*) FROM waitlist w WHERE w.class_id = c.id AND w.status = 'waiting') DESC, c.id
    LIMIT 1`)
).rows[0];

const ROUTES = [
  { label: "/classes", path: "/classes", token: member },
  { label: "/bookings/mine", path: "/bookings/mine", token: member },
  { label: "/me/today", path: "/me/today", token: member },
  { label: "/meals?date", path: `/meals?date=${today}`, token: member },
  { label: "/targets", path: "/targets", token: member },
  { label: "/foods/search?q=paneer", path: "/foods/search?q=paneer", token: member },
  { label: "/admin/classes", path: "/admin/classes", token: admin },
  { label: "/admin/classes/:id/people", path: `/admin/classes/${busy.id}/people`, token: admin },
];

const get = async (path, token) => {
  const res = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${body.error}`);
  return body;
};
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const results = [];
const captured = new Map();
for (const route of ROUTES) {
  recording = [];
  const sample = await get(route.path, route.token); // warm-up, not timed
  captured.set(route.label, recording);
  recording = null;
  const times = [];
  for (let i = 0; i < ROUNDS; i++) {
    const t0 = performance.now();
    await get(route.path, route.token);
    times.push(performance.now() - t0);
  }
  const size = Array.isArray(sample) ? `${sample.length} items` : `${JSON.stringify(sample).length} bytes`;
  results.push({ ...route, median: median(times), max: Math.max(...times), size });
}

console.log(`Response times, ${ROUNDS} calls each (ms):`);
console.log(`  ${"route".padEnd(28)} ${"median".padStart(7)} ${"max".padStart(7)}   response`);
for (const r of results) {
  const flag = r.median > SLOW_MS ? "  <-- over 100 ms" : "";
  console.log(`  ${r.label.padEnd(28)} ${r.median.toFixed(1).padStart(7)} ${r.max.toFixed(1).padStart(7)}   ${r.size}${flag}`);
}
console.log(`  (busy class for people: #${busy.id} ${busy.title}, ${busy.booked} booked, ${busy.waiting} waiting)\n`);

// --------------------------------------------------------------- plans
const tableRows = new Map(
  (await pool.query("SELECT relname, reltuples::bigint AS n FROM pg_class WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace")).rows.map((r) => [r.relname, Number(r.n)])
);
function walk(node, out) {
  const type = node["Node Type"];
  if (node["Index Name"]) out.indexes.add(`${node["Index Name"]} (${type})`);
  if (type === "Seq Scan") {
    out.seqScans.push({ table: node["Relation Name"], rows: tableRows.get(node["Relation Name"]) ?? 0, filter: node.Filter ?? null });
  }
  for (const child of node.Plans ?? []) walk(child, out);
}

const proposals = [];
console.log("Query plans (EXPLAIN ANALYZE on the SQL each route sent):");
for (const label of EXPLAIN_ROUTES) {
  console.log(`\n  ${label}`);
  const statements = captured.get(label).filter((q) => /^\s*(SELECT|WITH)\b/i.test(q.text) && /\bFROM\b/i.test(q.text));
  for (const q of statements) {
    const client = await pool.connect();
    let plan;
    try {
      plan = (await client.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${q.text}`, q.values)).rows[0]["QUERY PLAN"][0];
    } finally {
      client.release();
    }
    const out = { indexes: new Set(), seqScans: [] };
    walk(plan.Plan, out);
    const firstLine = q.text.replace(/\s+/g, " ").trim().slice(0, 90);
    const big = out.seqScans.filter((s) => s.rows >= BIG_TABLE_ROWS);
    const verdict = out.indexes.size > 0 ? (big.length ? "index + SEQ SCAN on a big table" : "uses an index") : big.length ? "SEQ SCAN on a big table" : "no index (only small tables)";
    console.log(`    - ${firstLine}…`);
    console.log(`      ${plan["Execution Time"].toFixed(2)} ms, ${verdict}`);
    if (out.indexes.size) console.log(`      indexes: ${[...out.indexes].join(", ")}`);
    for (const s of out.seqScans) {
      console.log(`      seq scan: ${s.table} (~${s.rows} rows)${s.filter ? `, filter ${s.filter}` : ""}`);
      if (s.rows >= BIG_TABLE_ROWS) proposals.push({ route: label, ...s });
    }
  }
}

console.log("\nSummary:");
const slow = results.filter((r) => r.median > SLOW_MS);
console.log(slow.length ? `  over ${SLOW_MS} ms median: ${slow.map((r) => r.label).join(", ")}` : `  every route's median is under ${SLOW_MS} ms`);
console.log(proposals.length
  ? `  sequential scans on big tables: ${proposals.map((p) => `${p.table} (${p.route})`).join(", ")}`
  : `  no sequential scans on tables with ${BIG_TABLE_ROWS}+ rows`);

server.close();
await pool.end();
