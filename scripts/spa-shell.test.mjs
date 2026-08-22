import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("runtime is a static Vite + TanStack Router SPA", () => {
  const pkg = JSON.parse(read("package.json"));
  const vite = read("vite.config.ts");
  const main = read("src/main.tsx");

  assert.equal(pkg.dependencies?.["@tanstack/react-start"], undefined);
  assert.equal(pkg.devDependencies?.nitro, undefined);
  assert.equal(vite.includes("tanstackStart"), false);
  assert.equal(vite.includes("nitro("), false);
  assert.equal(vite.includes("grokPwaPlugin"), false);
  assert.match(vite, /tanstackRouter\s*\(/);
  assert.match(main, /RouterProvider/);
  assert.match(main, /createRoot/);
  assert.equal(existsSync(join(root, "index.html")), true);
  assert.equal(existsSync(join(root, "server")), false);
});

test("PWA metadata is static and product-owned", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  const html = read("index.html");

  assert.equal(manifest.name, "成语故事");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);
  assert.match(html, /href="\/manifest\.webmanifest"/);
  assert.equal(existsSync(join(root, "public/__grok")), false);
});
