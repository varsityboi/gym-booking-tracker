// npm run test:db: runs every test file with DB_TESTS=1 and .env loaded, so
// the tests that write to the real database run too. A node launcher instead
// of `DB_TESTS=1 node ...` so it works the same in PowerShell, cmd and sh.
// Extra arguments are passed on to node --test.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const serverDir = fileURLToPath(new URL("..", import.meta.url));

const child = spawn(
  process.execPath,
  ["--env-file=.env", "--test", ...process.argv.slice(2), "tests/*.test.js"],
  { cwd: serverDir, stdio: "inherit", env: { ...process.env, DB_TESTS: "1" } }
);
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
