// Checks that openapi.yaml documents exactly the routes the app registers:
// every method + path on the API routers must be in the spec, and every
// operation in the spec must exist. No database or AI calls (importing the
// app only creates the pool and AI clients; nothing connects).
// /docs and /openapi.json are the documentation itself, not API routes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apiMounts, openapiSpec } from "../app.js";

const METHODS = ["get", "post", "put", "patch", "delete"];

// "/classes" + "/:id/book" -> "/classes/{id}/book"; "/" + "/" -> "/".
function joinPath(mount, routePath) {
  const joined = `${mount}/${routePath}`.replace(/\/+/g, "/").replace(/(.)\/$/, "$1");
  return joined.replace(/:(\w+)/g, "{$1}");
}

function appRoutes() {
  const routes = [];
  for (const [mount, router] of apiMounts) {
    for (const layer of router.stack) {
      // Every API router only defines routes directly (no nested routers).
      assert.ok(layer.route, `unexpected middleware or nested router under ${mount}`);
      for (const method of Object.keys(layer.route.methods)) {
        if (METHODS.includes(method)) routes.push(`${method.toUpperCase()} ${joinPath(mount, layer.route.path)}`);
      }
    }
  }
  return routes.sort();
}

function specRoutes() {
  const routes = [];
  for (const [path, item] of Object.entries(openapiSpec.paths)) {
    for (const method of METHODS) {
      if (item[method]) routes.push(`${method.toUpperCase()} ${path}`);
    }
  }
  return routes.sort();
}

test("openapi.yaml documents every registered route, and only those", () => {
  const app = appRoutes();
  const spec = specRoutes();
  const missing = app.filter((r) => !spec.includes(r));
  const extra = spec.filter((r) => !app.includes(r));
  assert.deepEqual(missing, [], `routes missing from openapi.yaml:\n  ${missing.join("\n  ")}`);
  assert.deepEqual(extra, [], `routes in openapi.yaml that don't exist:\n  ${extra.join("\n  ")}`);
  assert.ok(app.length > 20, `found only ${app.length} routes; is the route listing broken?`);
});

test("every operation has a summary, a known tag and responses", () => {
  const tags = new Set(openapiSpec.tags.map((t) => t.name));
  for (const [path, item] of Object.entries(openapiSpec.paths)) {
    for (const method of METHODS.filter((m) => item[m])) {
      const op = item[method];
      const name = `${method.toUpperCase()} ${path}`;
      assert.ok(op.summary, `${name} has no summary`);
      assert.ok(op.tags?.length && op.tags.every((t) => tags.has(t)), `${name} has a missing or unknown tag`);
      assert.ok(op.responses && Object.keys(op.responses).length > 0, `${name} has no responses`);
    }
  }
});

test("every $ref in openapi.yaml points at something that exists", () => {
  const refs = [];
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") {
      if (typeof node.$ref === "string") refs.push(node.$ref);
      Object.values(node).forEach(walk);
    }
  };
  walk(openapiSpec);
  for (const ref of new Set(refs)) {
    const target = ref
      .replace(/^#\//, "")
      .split("/")
      .reduce((obj, key) => obj?.[key], openapiSpec);
    assert.ok(target, `${ref} doesn't resolve`);
  }
});
