import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { repoRoot } from "./story-model.mjs";

function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (entry.isFile()) out.push(path);
  }
  return out.sort();
}

export function buildStoryImageReleaseSet() {
  const root = join(repoRoot, "public/stories");
  const entries = walk(root)
    .filter((path) => /\.jpe?g$/i.test(path))
    .map((path) => ({
      path: relative(repoRoot, path).replaceAll("\\", "/"),
      sha256: sha256Buffer(readFileSync(path)),
      bytes: statSync(path).size,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const fingerprintEntries = entries.map(({ path, sha256 }) => ({ path, sha256 }));
  const digestSha256 = sha256Buffer(Buffer.from(JSON.stringify(fingerprintEntries), "utf8"));
  return {
    schemaVersion: 1,
    entries,
    count: entries.length,
    digestSha256,
  };
}

if (process.argv[1]?.endsWith("story-image-release-set.mjs")) {
  const set = buildStoryImageReleaseSet();
  console.log(JSON.stringify({ schemaVersion: set.schemaVersion, count: set.count, digestSha256: set.digestSha256 }, null, 2));
}
