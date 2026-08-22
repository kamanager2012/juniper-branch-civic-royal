import { statSync } from "node:fs";
import { join } from "node:path";
import { loadStoryModel, repoRoot } from "./story-model.mjs";

function stats(paths) {
  const values = [...paths].map((path) => ({ path, bytes: statSync(join(repoRoot, "public", path)).size }));
  const sorted = [...values].sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
  const totalBytes = values.reduce((sum, item) => sum + item.bytes, 0);
  return {
    count: values.length,
    totalBytes,
    averageBytes: values.length === 0 ? 0 : Math.round(totalBytes / values.length),
    largestBytes: sorted[0]?.bytes ?? 0,
    largest: sorted.slice(0, 5),
  };
}

export function buildMediaPerformanceReport() {
  const model = loadStoryModel();
  const covers = new Set(model.stories.map((story) => story.cover.replace(/^\//, "")));
  const storyImages = new Set(model.pages.map((page) => page.image.replace(/^\//, "")));
  const narration = new Set(model.pages.map((page) => page.audio.replace(/^\//, "")));
  const hero = "ui/bookshelf-paper.jpg";
  const heroBytes = statSync(join(repoRoot, "public", hero)).size;
  const coverStats = stats(covers);

  return {
    schemaVersion: 1,
    homepage: {
      hero,
      heroBytes,
      coverCount: coverStats.count,
      potentialCoverBytes: coverStats.totalBytes,
      potentialHeroPlusCoverBytes: heroBytes + coverStats.totalBytes,
      averageCoverBytes: coverStats.averageBytes,
      largestCoverBytes: coverStats.largestBytes,
      largestCovers: coverStats.largest,
    },
    library: {
      storyImages: stats(storyImages),
      narration: stats(narration),
    },
  };
}

if (process.argv[1]?.endsWith("media-performance.mjs")) {
  const report = buildMediaPerformanceReport();
  console.log(JSON.stringify(report, null, 2));
}
