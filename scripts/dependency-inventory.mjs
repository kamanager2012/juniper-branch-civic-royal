import { readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const roots = ["src", "scripts", "server"];
const rootFiles = ["vite.config.ts", "eslint.config.mjs"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const imports = new Map();
const builtins = new Set(builtinModules);

function packageRoot(specifier) {
  if (
    specifier.startsWith("node:") ||
    builtins.has(specifier) ||
    specifier.startsWith("virtual:") ||
    specifier.startsWith("@/") ||
    specifier.startsWith("/") ||
    specifier.startsWith(".") ||
    specifier.startsWith("\\")
  ) {
    return null;
  }

  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function scan(path) {
  const text = readFileSync(path, "utf8");
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const pkg = packageRoot(match[1]);
      if (!pkg) continue;
      const files = imports.get(pkg) ?? new Set();
      files.add(relative(root, path));
      imports.set(pkg, files);
    }
  }
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else if (extensions.has(extname(path))) scan(path);
  }
}

for (const dir of roots) walk(join(root, dir));
for (const file of rootFiles) scan(join(root, file));

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const declared = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
]);

console.log("Imported package roots:");
for (const [name, files] of [...imports.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`- ${name}${declared.has(name) ? "" : " [UNDECLARED]"}`);
  for (const file of [...files].sort()) console.log(`    ${file}`);
}

const undeclared = [...imports.keys()].filter((name) => !declared.has(name)).sort();
if (undeclared.length) {
  console.error(`Undeclared imported dependencies: ${undeclared.join(", ")}`);
  process.exitCode = 1;
}
