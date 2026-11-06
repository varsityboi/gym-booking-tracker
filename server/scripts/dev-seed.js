// npm run dev:seed: npm run dev, but against the seed database. Starts the
// same `node --env-file=.env --watch index.js` with DATABASE_URL replaced by
// SEED_DATABASE_URL (a variable already set in the environment wins over
// .env, so the server sees the seed one). A node launcher instead of
// `DATABASE_URL=... node ...` so it works the same in PowerShell, cmd and sh.
// It listens on the same PORT as npm run dev: stop that one first (or set
// PORT for this one). Extra arguments are passed on to index.js.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const seedUrl = process.env.SEED_DATABASE_URL;
if (!seedUrl) {
  console.error("SEED_DATABASE_URL is not set (add it to server/.env)");
  process.exit(1);
}
const dbName = decodeURIComponent(new URL(seedUrl).pathname.replace(/^\//, ""));
if (!/_(seed|test)$/.test(dbName)) {
  console.error(`refusing to start against "${dbName}": SEED_DATABASE_URL must name a database ending in _seed or _test`);
  process.exit(1);
}
console.log(`dev:seed: using database ${dbName}`);

const serverDir = fileURLToPath(new URL("..", import.meta.url));
const child = spawn(process.execPath, ["--env-file=.env", "--watch", "index.js", ...process.argv.slice(2)], {
  cwd: serverDir,
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: seedUrl },
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
