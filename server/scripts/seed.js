// npm run db:seed: a demo database full of realistic data, for trying the
// app and checking performance. Never touches the real database:
//   - connects with SEED_DATABASE_URL only, and refuses unless that
//     database's name ends in _seed or _test (and isn't DATABASE_URL's);
//   - creates the database if it's missing, then drops and recreates its
//     public schema, applies schema.sql and imports the foods (the same code
//     as db:setup and db:foods);
//   - fills it with deterministic data (fixed random seed): every run gives
//     the same rows and counts. Times are relative to today's India date, so
//     "today" in the app always has data.
// Every seeded account's password is demo12345 (demo@gym.com is the demo
// member, demoadmin@gym.com the demo admin).
import pg from "pg";
import bcrypt from "bcryptjs";
import { applySchema } from "./lib/schema.js";
import { importFoods } from "./lib/foods.js";

pg.types.setTypeParser(1700, (value) => parseFloat(value));

// ---------------------------------------------------------------- safety
const SEED_URL = process.env.SEED_DATABASE_URL;
if (!SEED_URL) {
  console.error("SEED_DATABASE_URL is not set (add it to server/.env)");
  process.exit(1);
}
const seedUrl = new URL(SEED_URL);
const dbName = decodeURIComponent(seedUrl.pathname.replace(/^\//, ""));
if (!/^[a-z0-9_]+$/.test(dbName) || !/_(seed|test)$/.test(dbName)) {
  console.error(`refusing to seed "${dbName}": the database name must end in _seed or _test`);
  process.exit(1);
}
if (process.env.DATABASE_URL) {
  const real = new URL(process.env.DATABASE_URL);
  if (real.host === seedUrl.host && real.pathname === seedUrl.pathname) {
    console.error("refusing to seed: SEED_DATABASE_URL points at the same database as DATABASE_URL");
    process.exit(1);
  }
}
console.log(`Seeding database "${dbName}" on ${seedUrl.host}`);

// Create the database if it doesn't exist (via the server's "postgres" database).
{
  const maintenance = new URL(SEED_URL);
  maintenance.pathname = "/postgres";
  const client = new pg.Client({ connectionString: maintenance.toString() });
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE "${dbName}"`); // name checked above: [a-z0-9_]+
    console.log(`Created database ${dbName}`);
  }
  await client.end();
}

const pool = new pg.Pool({ connectionString: SEED_URL });
const started = Date.now();

// --------------------------------------------------------- reset + schema
{
  const client = await pool.connect();
  try {
    await client.query("DROP SCHEMA public CASCADE");
    await client.query("CREATE SCHEMA public");
    await applySchema(client);
    const foods = await importFoods(client);
    console.log(`Schema applied, ${foods} foods imported`);
  } finally {
    client.release();
  }
}

// ------------------------------------------------------- random + time
function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261107);
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
const round2 = (n) => Math.round(n * 100) / 100;
// n distinct items from arr, in random order.
function sample(arr, n) {
  const copy = arr.slice();
  const count = Math.min(n, copy.length);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rand() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.now();
const todayIst = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(NOW);
const MIDNIGHT = Date.parse(`${todayIst}T00:00:00+05:30`); // today, India time
// dayOffset days from today, at `minutes` after midnight India time.
const at = (dayOffset, minutes) => MIDNIGHT + dayOffset * DAY + minutes * MIN;
// Every time below is worked out from MIDNIGHT only ("raw" time), so the
// rows, and the order of the event tables, are the same on every run. Things
// that happened can't be in the future, though: when rows are written, raw
// times after SQUASH_FROM (10 minutes ago, still today) are squeezed, in order,
// into the minutes before now. Only classes.starts_at is written raw.
// Nothing that happened is generated later than the end of tomorrow.
const SQUASH_FROM = Math.max(NOW - 10 * MIN, MIDNIGHT + (NOW - MIDNIGHT) / 2);
const SQUASH_END = MIDNIGHT + 2 * DAY;
function squash(t) {
  if (t < SQUASH_FROM) return t;
  if (t > SQUASH_END) throw new Error(`seed bug: a past event at ${new Date(t).toISOString()}`);
  return SQUASH_FROM + ((t - SQUASH_FROM) * (NOW - 1000 - SQUASH_FROM)) / (SQUASH_END - SQUASH_FROM);
}
const ts = (d) => (d === null ? null : new Date(squash(d instanceof Date ? d.getTime() : d)));
// Bookings, cancellations and waitlist changes for classes after today all
// happened before today.
const beforeToday = (t) => Math.min(t, MIDNIGHT - MIN);
// `count` increasing times spread over [from, to].
function timeline(count, from, to) {
  const span = Math.max(to - from, count);
  return Array.from({ length: count }, () => from + rand() * span)
    .sort((x, y) => x - y)
    .map((t) => new Date(Math.round(t)));
}

// ----------------------------------------------------------------- users
const FIRST_F = ["Aanya", "Ananya", "Diya", "Isha", "Kavya", "Meera", "Neha", "Pooja", "Priya", "Riya", "Sanya", "Shreya",
  "Sneha", "Tanvi", "Aditi", "Anjali", "Bhavna", "Divya", "Gauri", "Ishita", "Lakshmi", "Nandini", "Radhika", "Swati", "Zoya", "Fatima", "Harpreet", "Simran"];
const FIRST_M = ["Aarav", "Aditya", "Arjun", "Dev", "Ishaan", "Kabir", "Karan", "Manish", "Nikhil", "Pranav", "Rahul", "Rohan",
  "Sahil", "Siddharth", "Varun", "Vikram", "Yash", "Abhishek", "Amit", "Harsh", "Imran", "Kunal", "Mohit", "Naveen", "Ravi", "Sameer", "Gurpreet", "Joseph"];
const LAST = ["Sharma", "Verma", "Gupta", "Iyer", "Nair", "Reddy", "Rao", "Patel", "Shah", "Mehta", "Joshi", "Kulkarni", "Desai",
  "Singh", "Kaur", "Gill", "Chatterjee", "Banerjee", "Das", "Bose", "Menon", "Pillai", "Khan", "Qureshi", "Fernandes", "D'Souza", "Agarwal", "Bhat", "Mishra", "Pandey"];

const passwordHash = await bcrypt.hash("demo12345", 10);
const users = []; // { id, name, email, role, created_at }
const emailsSeen = new Map();
function addUser(name, role, email) {
  if (!email) {
    const base = name.toLowerCase().replace(/[^a-z ]/g, "").trim().replace(/\s+/, ".");
    const n = (emailsSeen.get(base) ?? 0) + 1;
    emailsSeen.set(base, n);
    email = `${base}${n > 1 ? n : ""}@example.com`;
  }
  const user = { id: users.length + 1, name, email, role, created_at: new Date(at(-int(120, 500), int(0, 1439))) };
  users.push(user);
  return user;
}
const demoAdmin = addUser("Arjun Rao", "admin", "demoadmin@gym.com");
addUser("Kavya Iyer", "admin");
addUser("Rohan Mehta", "admin");
const demo = addUser("Priya Sharma", "member", "demo@gym.com");
for (let i = 0; i < 300; i++) {
  const female = chance(0.5);
  addUser(`${pick(female ? FIRST_F : FIRST_M)} ${pick(LAST)}`, "member");
}
const members = users.filter((u) => u.role === "member");
const others = members.filter((u) => u !== demo);

// --------------------------------------------------------------- classes
const CLASS_TYPES = [
  { title: "Morning Yoga", times: [6 * 60, 6 * 60 + 30, 7 * 60], cap: [12, 20] },
  { title: "HIIT Blast", times: [6 * 60 + 30, 7 * 60 + 30, 18 * 60 + 30], cap: [15, 25] },
  { title: "Strength Basics", times: [7 * 60, 8 * 60, 19 * 60], cap: [10, 16] },
  { title: "Spin Class", times: [6 * 60 + 45, 17 * 60 + 30, 18 * 60 + 45], cap: [12, 20] },
  { title: "Zumba", times: [18 * 60, 19 * 60], cap: [20, 30] },
  { title: "Pilates Core", times: [9 * 60, 17 * 60], cap: [10, 14] },
  { title: "Boxing Fit", times: [19 * 60 + 30, 20 * 60], cap: [12, 18] },
  { title: "Evening Yoga", times: [18 * 60 + 15, 19 * 60 + 15], cap: [12, 20] },
  { title: "Functional Training", times: [7 * 60 + 15, 18 * 60], cap: [12, 18] },
  { title: "Mobility & Stretch", times: [8 * 60 + 30, 20 * 60 + 30], cap: [10, 15] },
];
const CANCEL_REASONS = ["Instructor is unwell", "Studio maintenance", "Public holiday", "Low sign-ups", "Power cut in the building", "Trainer on leave"];

const classes = []; // { id, title, start, capacity, offset, cancelled, cancel_reason, cancelled_at, created_at }
for (let offset = -90; offset <= 29; offset++) {
  const weekday = new Date(at(offset, 12 * 60)).getUTCDay();
  const perDay = weekday === 0 || weekday === 6 ? int(2, 3) : int(3, 4);
  const types = sample(CLASS_TYPES, perDay);
  const day = types
    .map((type) => ({ type, minutes: pick(type.times) }))
    .sort((a, b) => a.minutes - b.minutes);
  for (const { type, minutes } of day) {
    const start = at(offset, minutes);
    const cancelled = chance(0.05);
    classes.push({
      id: classes.length + 1,
      title: type.title,
      start,
      capacity: int(type.cap[0], type.cap[1]),
      offset,
      cancelled,
      cancel_reason: cancelled && chance(0.85) ? pick(CANCEL_REASONS) : null,
      cancelled_at: cancelled ? new Date(offset >= 1 ? beforeToday(start - int(2, 48) * HOUR) : start - int(2, 48) * HOUR) : null,
      created_at: new Date(beforeToday(start - int(10, 30) * DAY)),
    });
  }
}

// The demo member: 3 classes attended in the last week, 2 booked in the
// next week, and a place on the waitlist of a full class in the next days.
const live = (c) => !c.cancelled;
const demoRole = new Map();
for (const c of sample(classes.filter((c) => live(c) && c.offset >= -6 && c.offset <= 0), 3)) demoRole.set(c.id, "booked");
for (const c of sample(classes.filter((c) => live(c) && c.offset >= 1 && c.offset <= 7), 2)) demoRole.set(c.id, "booked");
const demoWaitClass = pick(classes.filter((c) => live(c) && c.offset >= 1 && c.offset <= 5 && !demoRole.has(c.id)));
demoRole.set(demoWaitClass.id, "waiting");

// -------------------------------------------- bookings, waitlist, events
const bookings = []; // { id, user_id, class_id, status, created_at }
const waitlist = []; // { id, user_id, class_id, status, created_at, updated_at }
const bookingEvents = []; // { booking_id, waitlist_id, user_id, class_id, action, created_at }
const event = (e) => bookingEvents.push({ booking_id: null, waitlist_id: null, ...e });

for (const c of classes) {
  const role = demoRole.get(c.id);
  // How full: past classes mostly well attended, near-future ones filling
  // up (some full), far-future ones only starting to.
  let fill;
  if (c.offset <= 0) fill = chance(0.25) ? 1 : 0.55 + rand() * 0.45;
  else if (c.offset <= 3) fill = chance(0.4) ? 1 : 0.6 + rand() * 0.4;
  else if (c.offset <= 10) fill = chance(0.15) ? 1 : 0.3 + rand() * 0.6;
  else fill = 0.05 + rand() * 0.45;
  if (role === "waiting") fill = 1;
  const active = Math.min(c.capacity, Math.max(1, Math.round(c.capacity * fill)));
  const full = active === c.capacity;
  const future = c.offset >= 1;

  const earlyCancels = int(0, Math.max(1, Math.round(active * 0.15)));
  const waiters = full && future ? (role === "waiting" ? int(2, 5) : int(1, 5)) : 0;
  const promotion = waiters > 0 && role !== "waiting" && chance(0.4);
  const leave = waiters - (promotion ? 1 : 0) >= 2 && role !== "waiting" && chance(0.15);

  // Who: the demo member where wanted, everyone else at random.
  const people = sample(others, active + earlyCancels + waiters);
  let bookers = people.slice(0, active + earlyCancels);
  let waiting = people.slice(active + earlyCancels);
  if (role === "booked") bookers = [demo, ...bookers.slice(1)];
  if (role === "waiting") waiting = [waiting[0], demo, ...waiting.slice(2)];

  // Event times: in order, in the days before the class (or its
  // cancellation), never after now.
  const steps = bookers.length + earlyCancels + waiters + (promotion ? 2 : 0) + (leave ? 1 : 0);
  const end = (c.cancelled ? c.cancelled_at.getTime() - MIN : c.start - 30 * MIN);
  const windowEnd = future ? beforeToday(end) : end;
  const times = timeline(steps, windowEnd - int(3, 9) * DAY, windowEnd);
  let step = 0;
  const next = () => times[step++];

  const activeBookings = [];
  for (const user of bookers) {
    const b = { id: bookings.length + 1, user_id: user.id, class_id: c.id, status: "active", created_at: next() };
    bookings.push(b);
    activeBookings.push(b);
    event({ booking_id: b.id, user_id: user.id, class_id: c.id, action: "booked", created_at: b.created_at });
  }
  // Early cancellations (never the demo member's booking).
  const cancellable = activeBookings.filter((b) => b.user_id !== demo.id);
  for (const b of sample(cancellable, earlyCancels)) {
    b.status = "cancelled";
    activeBookings.splice(activeBookings.indexOf(b), 1);
    event({ booking_id: b.id, user_id: b.user_id, class_id: c.id, action: "cancelled", created_at: next() });
  }
  const entries = [];
  for (const user of waiting) {
    const t = next();
    const w = { id: waitlist.length + 1, user_id: user.id, class_id: c.id, status: "waiting", created_at: t, updated_at: t };
    waitlist.push(w);
    entries.push(w);
    event({ waitlist_id: w.id, user_id: user.id, class_id: c.id, action: "waitlisted", created_at: t });
  }
  if (promotion) {
    // A booked member cancels; the first in line gets the place.
    const leaver = pick(activeBookings.filter((b) => b.user_id !== demo.id));
    leaver.status = "cancelled";
    activeBookings.splice(activeBookings.indexOf(leaver), 1);
    event({ booking_id: leaver.id, user_id: leaver.user_id, class_id: c.id, action: "cancelled", created_at: next() });
    const first = entries.shift();
    const t = next();
    const b = { id: bookings.length + 1, user_id: first.user_id, class_id: c.id, status: "active", created_at: t };
    bookings.push(b);
    activeBookings.push(b);
    first.status = "promoted";
    first.updated_at = t;
    event({ booking_id: b.id, waitlist_id: first.id, user_id: first.user_id, class_id: c.id, action: "promoted", created_at: t });
  }
  if (leave) {
    const w = entries.splice(entries.length - 1, 1)[0];
    w.status = "left";
    w.updated_at = next();
    event({ waitlist_id: w.id, user_id: w.user_id, class_id: c.id, action: "left_waitlist", created_at: w.updated_at });
  }
  if (c.cancelled) {
    // As POST /classes/:id/cancel does: every booking and waiting entry goes.
    for (const b of activeBookings) {
      b.status = "cancelled";
      event({ booking_id: b.id, user_id: b.user_id, class_id: c.id, action: "class_cancelled", created_at: c.cancelled_at });
    }
    for (const w of entries) {
      w.status = "left";
      w.updated_at = c.cancelled_at;
      event({ waitlist_id: w.id, user_id: w.user_id, class_id: c.id, action: "class_cancelled", created_at: c.cancelled_at });
    }
    activeBookings.length = 0;
  }
  c.booked = activeBookings.length;
  if (c.booked > c.capacity) throw new Error(`class ${c.id} over capacity`);
}

// --------------------------------------------------------------- meals
const foodRows = (await pool.query("SELECT id, name FROM foods ORDER BY id")).rows;
const foodsMatching = (re) => {
  const ids = foodRows.filter((f) => re.test(f.name)).map((f) => f.id);
  return ids.length ? ids : foodRows.map((f) => f.id);
};
const FOOD_GROUPS = {
  breakfast: foodsMatching(/paratha|parantha|poha|upma|idli|dosa|uttapam|omelette|toast|porridge|cornflakes|tea|coffee|milk|banana|egg/i),
  main: foodsMatching(/rice|pulao|biryani|dal|roti|chapati|naan|curry|paneer|chicken|fish|sabzi|bhaji|raita|rajma|chole|chana|khichdi|sambar|palak|aloo/i),
  snack: foodsMatching(/samosa|pakora|pakoda|chaat|biscuit|sandwich|fruit|tea|lassi|dhokla|vada|cutlet|nuts|sprout/i),
};
const ESTIMATES = [
  { name: "Homemade green chutney", c: 60, p: 2, f: 3, cb: 6 },
  { name: "Masala chai (home style)", c: 45, p: 1.5, f: 1.5, cb: 6.5 },
  { name: "Mixed vegetable salad", c: 35, p: 1.5, f: 0.3, cb: 6 },
  { name: "Protein shake", c: 80, p: 10, f: 1.5, cb: 6 },
  { name: "Street-style bhel", c: 210, p: 5, f: 9, cb: 28 },
  { name: "Moong sprouts salad", c: 90, p: 7, f: 1, cb: 14 },
  { name: "Masala buttermilk", c: 25, p: 1.2, f: 1, cb: 3 },
  { name: "Fruit custard", c: 120, p: 3, f: 3.5, cb: 19 },
];
const MEAL_SLOTS = [
  { group: "breakfast", minutes: 8 * 60, spread: 60, p: 0.85 },
  { group: "main", minutes: 13 * 60 + 15, spread: 60, p: 0.9 },
  { group: "snack", minutes: 17 * 60, spread: 45, p: 0.35 },
  { group: "main", minutes: 20 * 60 + 30, spread: 60, p: 0.85 },
];

const meals = []; // { id, user_id, eaten_at }
const mealItems = []; // { id, meal_id, food_id, grams, custom_name, est..., version, deleted_at }
const mealItemEvents = []; // { meal_item_id, meal_id, user_id, action, before, after, created_at }
const photoAnalyses = []; // { user_id, created_at, vision_provider, duration_ms, ok }
const snap = (i, version, grams, deletedAt = null) => ({
  version,
  food_id: i.food_id,
  custom_name: i.custom_name,
  grams,
  est_calories_per_100g: i.est_calories_per_100g,
  est_protein_per_100g: i.est_protein_per_100g,
  est_fat_per_100g: i.est_fat_per_100g,
  est_carbs_per_100g: i.est_carbs_per_100g,
  deleted_at: deletedAt,
});

const loggers = [demo, ...sample(others, 149)];
for (const user of loggers) {
  const isDemo = user === demo;
  const activity = isDemo ? 1 : 0.25 + rand() * 0.35;
  for (let offset = -89; offset <= 0; offset++) {
    if (!chance(activity)) continue;
    // The demo member's today: breakfast, lunch and a snack, so far.
    const slots = isDemo && offset === 0 ? MEAL_SLOTS.slice(0, 3) : MEAL_SLOTS.filter((s) => chance(s.p));
    for (const slot of slots) {
      const eaten = at(offset, slot.minutes + int(-slot.spread, slot.spread));
      const meal = { id: meals.length + 1, user_id: user.id, eaten_at: new Date(eaten) };
      meals.push(meal);
      if (chance(isDemo ? 0.4 : 0.15)) {
        const ok = chance(0.94);
        photoAnalyses.push({
          user_id: user.id,
          created_at: new Date(eaten - MIN),
          vision_provider: ok ? (chance(0.85) ? "gemini" : "groq") : null,
          duration_ms: int(2500, 12000),
          ok,
        });
      }
      const count = int(2, 5);
      for (let k = 0; k < count; k++) {
        const estimated = chance(0.12);
        const est = estimated ? pick(ESTIMATES) : null;
        const item = {
          id: mealItems.length + 1,
          meal_id: meal.id,
          food_id: estimated ? null : pick(FOOD_GROUPS[slot.group]),
          custom_name: est?.name ?? null,
          est_calories_per_100g: est?.c ?? null,
          est_protein_per_100g: est?.p ?? null,
          est_fat_per_100g: est?.f ?? null,
          est_carbs_per_100g: est?.cb ?? null,
          grams: int(8, 40) * 5, // 40-200 g a portion
          version: 1,
          deleted_at: null,
        };
        mealItems.push(item);
        const createdAt = new Date(eaten + 2 * MIN);
        mealItemEvents.push({ meal_item_id: item.id, meal_id: meal.id, user_id: user.id, action: "created", before: null,
          after: snap(item, 1, item.grams), created_at: createdAt });
        const roll = rand();
        if (roll < 0.06) {
          // Edited: the grams were corrected afterwards.
          const before = snap(item, 1, item.grams);
          item.grams = Math.max(10, item.grams + int(-8, 8) * 5);
          item.version = 2;
          mealItemEvents.push({ meal_item_id: item.id, meal_id: meal.id, user_id: user.id, action: "edited", before,
            after: snap(item, 2, item.grams), created_at: new Date(eaten + 30 * MIN) });
        } else if (roll < 0.09 && !(isDemo && offset === 0)) {
          // Removed: logged by mistake.
          const removedAt = new Date(eaten + 45 * MIN);
          mealItemEvents.push({ meal_item_id: item.id, meal_id: meal.id, user_id: user.id, action: "removed",
            before: snap(item, 1, item.grams), after: null, created_at: removedAt });
          item.version = 2;
          item.deleted_at = removedAt;
        }
      }
    }
  }
}

// ------------------------------------------------------- water + targets
const waterLogs = []; // { user_id, ml, logged_at }
const drinkers = [...loggers, ...sample(others.filter((u) => !loggers.includes(u)), 50)];
for (const user of drinkers) {
  const isDemo = user === demo;
  const activity = isDemo ? 1 : 0.3 + rand() * 0.4;
  for (let offset = -89; offset <= 0; offset++) {
    if (!chance(activity)) continue;
    const count = isDemo ? int(5, 9) : int(3, 8);
    const minutes = Array.from({ length: count }, () => int(7 * 60, 22 * 60)).sort((a, b) => a - b);
    for (const m of minutes) {
      waterLogs.push({ user_id: user.id, ml: chance(0.7) ? 250 : 500, logged_at: new Date(at(offset, m)) });
    }
  }
}

const targets = []; // { user_id, calories, protein_g, fat_g, carbs_g, water_ml, updated_at }
for (const user of members) {
  if (user !== demo && !chance(0.85)) continue;
  const calories = user === demo ? 2000 : int(32, 56) * 50;
  targets.push({
    user_id: user.id,
    calories,
    protein_g: user === demo ? 110 : int(60, 160),
    fat_g: user === demo ? 65 : Math.round((calories * (0.22 + rand() * 0.1)) / 9),
    carbs_g: user === demo ? 240 : Math.round((calories * (0.45 + rand() * 0.1)) / 4),
    water_ml: user === demo ? 3000 : int(8, 16) * 250,
    updated_at: new Date(at(-int(1, 80), int(6 * 60, 22 * 60))),
  });
}

// ---------------------------------------------------------------- insert
// Ids follow time order for the event tables (history reads by id).
const byTime = (rows) => rows.map((r, i) => [r, i]).sort((a, b) => a[0].created_at - b[0].created_at || a[1] - b[1]).map(([r], i) => ({ id: i + 1, ...r }));
const bookingEventRows = byTime(bookingEvents);
const mealItemEventRows = byTime(mealItemEvents);
const photoRows = byTime(photoAnalyses);
const waterRows = waterLogs.map((w, i) => ({ id: i + 1, ...w }));

// Multi-row INSERTs, at most 1000 rows (and under Postgres's 65535
// parameter limit) per statement, all of one table in one transaction.
async function insert(table, columns, rows, toValues) {
  const client = await pool.connect();
  const size = Math.min(1000, Math.floor(60000 / columns.length));
  try {
    await client.query("BEGIN");
    for (let i = 0; i < rows.length; i += size) {
      const chunk = rows.slice(i, i + size);
      const params = [];
      const tuples = chunk.map((row) => {
        const values = toValues(row);
        const placeholders = values.map((v) => {
          params.push(v);
          return `$${params.length}`;
        });
        return `(${placeholders.join(", ")})`;
      });
      await client.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ${tuples.join(", ")}`, params);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
const json = (v) => (v === null ? null : JSON.stringify({ ...v, deleted_at: v.deleted_at ? ts(v.deleted_at).toISOString() : null }));

await insert("users", ["id", "name", "email", "password_hash", "role", "created_at"], users,
  (u) => [u.id, u.name, u.email, passwordHash, u.role, ts(u.created_at)]);
await insert("classes", ["id", "title", "starts_at", "capacity", "booked", "created_at", "status", "cancelled_at", "cancel_reason"], classes,
  (c) => [c.id, c.title, new Date(c.start), c.capacity, c.booked, ts(c.created_at), c.cancelled ? "cancelled" : "scheduled", ts(c.cancelled_at), c.cancel_reason]);
await insert("bookings", ["id", "user_id", "class_id", "status", "created_at"], bookings,
  (b) => [b.id, b.user_id, b.class_id, b.status, ts(b.created_at)]);
await insert("waitlist", ["id", "user_id", "class_id", "status", "created_at", "updated_at"], waitlist,
  (w) => [w.id, w.user_id, w.class_id, w.status, ts(w.created_at), ts(w.updated_at)]);
await insert("booking_events", ["id", "booking_id", "waitlist_id", "user_id", "class_id", "action", "created_at"], bookingEventRows,
  (e) => [e.id, e.booking_id, e.waitlist_id, e.user_id, e.class_id, e.action, ts(e.created_at)]);
await insert("meals", ["id", "user_id", "eaten_at"], meals, (m) => [m.id, m.user_id, ts(m.eaten_at)]);
await insert("meal_items", ["id", "meal_id", "food_id", "grams", "custom_name", "est_calories_per_100g", "est_protein_per_100g",
  "est_fat_per_100g", "est_carbs_per_100g", "version", "deleted_at"], mealItems,
  (i) => [i.id, i.meal_id, i.food_id, i.grams, i.custom_name, i.est_calories_per_100g, i.est_protein_per_100g,
    i.est_fat_per_100g, i.est_carbs_per_100g, i.version, ts(i.deleted_at)]);
await insert("meal_item_events", ["id", "meal_item_id", "meal_id", "user_id", "action", "before", "after", "created_at"], mealItemEventRows,
  (e) => [e.id, e.meal_item_id, e.meal_id, e.user_id, e.action, json(e.before), json(e.after), ts(e.created_at)]);
await insert("water_logs", ["id", "user_id", "ml", "logged_at"], waterRows, (w) => [w.id, w.user_id, w.ml, ts(w.logged_at)]);
await insert("user_targets", ["user_id", "calories", "protein_g", "fat_g", "carbs_g", "water_ml", "updated_at"], targets,
  (t) => [t.user_id, t.calories, t.protein_g, t.fat_g, t.carbs_g, t.water_ml, ts(t.updated_at)]);
await insert("photo_analyses", ["id", "user_id", "created_at", "vision_provider", "duration_ms", "ok"], photoRows,
  (p) => [p.id, p.user_id, ts(p.created_at), p.vision_provider, p.duration_ms, p.ok]);

// Explicit ids were inserted, so move each sequence past them.
const SERIAL_TABLES = ["users", "classes", "bookings", "waitlist", "booking_events", "meals", "meal_items", "meal_item_events", "water_logs", "photo_analyses"];
for (const table of SERIAL_TABLES) {
  await pool.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`);
}

// Checks the app relies on: booked = active bookings, never over capacity.
const mismatch = await pool.query(`
  SELECT c.id FROM classes c
  LEFT JOIN bookings b ON b.class_id = c.id AND b.status = 'active'
  GROUP BY c.id HAVING c.booked <> COUNT(b.id) OR COUNT(b.id) > c.capacity`);
if (mismatch.rowCount > 0) throw new Error(`booked doesn't match active bookings for classes ${mismatch.rows.map((r) => r.id)}`);

await pool.query("ANALYZE");

// ----------------------------------------------------------------- report
const TABLES = ["users", "classes", "bookings", "waitlist", "booking_events", "foods", "meals", "meal_items", "meal_item_events",
  "water_logs", "user_targets", "photo_analyses"];
let total = 0;
console.log("\nRows per table:");
for (const table of TABLES) {
  const n = (await pool.query(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n;
  total += n;
  console.log(`  ${table.padEnd(18)} ${String(n).padStart(7)}`);
}
console.log(`  ${"TOTAL".padEnd(18)} ${String(total).padStart(7)}`);
const demoToday = (
  await pool.query(
    `SELECT (SELECT COUNT(*) FROM meals WHERE user_id = $1 AND eaten_at >= $2)::int AS meals_today,
            (SELECT COUNT(*) FROM bookings b JOIN classes c ON c.id = b.class_id
              WHERE b.user_id = $1 AND b.status = 'active' AND c.starts_at > NOW())::int AS upcoming,
            (SELECT COUNT(*) FROM waitlist WHERE user_id = $1 AND status = 'waiting')::int AS waiting`,
    [demo.id, new Date(MIDNIGHT)]
  )
).rows[0];
console.log(`\nDemo member demo@gym.com: ${demoToday.meals_today} meals today, ${demoToday.upcoming} upcoming bookings, ${demoToday.waiting} waitlist place(s)`);
console.log("Logins: demo@gym.com and demoadmin@gym.com (every seeded account), password demo12345");
console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
if (total <= 5000) throw new Error(`only ${total} rows; expected over 5,000`);
await pool.end();
