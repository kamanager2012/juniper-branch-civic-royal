import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const artwork = {
  "public/favicon.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="成语故事">
  <rect width="100" height="100" rx="22" fill="#F4EAD8"/>
  <rect x="14" y="18" width="72" height="64" rx="8" fill="#B33828"/>
  <rect x="20" y="24" width="60" height="52" rx="5" fill="#FFF8EC"/>
  <path d="M50 28v44" stroke="#D9C4A4" stroke-width="3"/>
  <circle cx="38" cy="48" r="7" fill="#3F7A5A"/>
  <circle cx="62" cy="52" r="5" fill="#C7922B"/>
  <rect x="28" y="66" width="18" height="4" rx="2" fill="#B33828"/>
</svg>
`,
  "public/icon-180.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="成语故事">
  <rect width="180" height="180" rx="40" fill="#F4EAD8"/>
  <rect x="25" y="32" width="130" height="116" rx="15" fill="#B33828"/>
  <rect x="36" y="43" width="108" height="94" rx="10" fill="#FFF8EC"/>
  <path d="M90 50v80" stroke="#D9C4A4" stroke-width="5"/>
  <circle cx="68" cy="86" r="13" fill="#3F7A5A"/>
  <circle cx="112" cy="94" r="10" fill="#C7922B"/>
  <rect x="50" y="118" width="33" height="7" rx="3.5" fill="#B33828"/>
</svg>
`,
  "public/og.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="成语故事">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFF8EC"/>
      <stop offset="1" stop-color="#E7D5B5"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#F4EAD8"/>
  <circle cx="1040" cy="95" r="170" fill="#C7922B" opacity=".12"/>
  <circle cx="110" cy="560" r="210" fill="#3F7A5A" opacity=".10"/>
  <rect x="95" y="95" width="1010" height="440" rx="42" fill="url(#paper)" stroke="#D9C4A4" stroke-width="4"/>
  <rect x="150" y="155" width="250" height="320" rx="26" fill="#B33828"/>
  <rect x="178" y="185" width="194" height="260" rx="18" fill="#FFF8EC"/>
  <path d="M275 200v230" stroke="#D9C4A4" stroke-width="8"/>
  <circle cx="235" cy="285" r="24" fill="#3F7A5A"/>
  <circle cx="320" cy="320" r="18" fill="#C7922B"/>
  <text x="475" y="285" fill="#2C2118" font-size="108" font-weight="700" font-family="serif">成语故事</text>
  <text x="480" y="370" fill="#5C4A3A" font-size="42" font-family="sans-serif">给小朋友听的中国成语有声绘本</text>
  <rect x="480" y="410" width="300" height="8" rx="4" fill="#B33828"/>
</svg>
`,
  "public/ui/bookshelf-paper.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800" role="img" aria-label="纸张纹理背景">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFF8EC"/>
      <stop offset="1" stop-color="#F4EAD8"/>
    </linearGradient>
    <pattern id="fiber" width="72" height="72" patternUnits="userSpaceOnUse">
      <path d="M2 18C16 11 27 25 42 17S62 12 70 20" fill="none" stroke="#D9C4A4" stroke-width="1.2" opacity=".28"/>
      <path d="M8 52c13-8 24 6 39-2s18-5 23-1" fill="none" stroke="#C9B08A" stroke-width="1" opacity=".18"/>
      <circle cx="18" cy="35" r="1.2" fill="#B99A6D" opacity=".20"/>
      <circle cx="55" cy="61" r="1" fill="#B99A6D" opacity=".16"/>
    </pattern>
  </defs>
  <rect width="1200" height="800" fill="url(#base)"/>
  <rect width="1200" height="800" fill="url(#fiber)"/>
  <path d="M0 130C210 95 350 160 560 122S930 88 1200 138" fill="none" stroke="#FFFFFF" stroke-width="3" opacity=".18"/>
  <path d="M0 650C240 610 420 690 670 642s350-18 530 2" fill="none" stroke="#C9B08A" stroke-width="2" opacity=".10"/>
</svg>
`,
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function generatedProductArtwork() {
  return Object.entries(artwork).map(([path, content]) => ({
    path,
    content,
    sha256: sha256(content),
  }));
}

export function writeProductArtwork() {
  for (const item of generatedProductArtwork()) {
    const absolute = join(repoRoot, item.path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, item.content, "utf8");
  }
}

export function checkProductArtwork() {
  const problems = [];
  for (const item of generatedProductArtwork()) {
    const absolute = join(repoRoot, item.path);
    if (!existsSync(absolute)) {
      problems.push(`${item.path}: missing generated artwork`);
      continue;
    }
    const actual = readFileSync(absolute, "utf8");
    if (actual !== item.content) problems.push(`${item.path}: committed bytes do not match deterministic generator`);
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes("--write");
  const check = process.argv.includes("--check");
  if (write) writeProductArtwork();
  const items = generatedProductArtwork().map(({ path, sha256 }) => ({ path, sha256 }));
  const problems = check ? checkProductArtwork() : [];
  console.log(JSON.stringify({ schemaVersion: 1, items, problems }, null, 2));
  if (check && problems.length > 0) process.exitCode = 1;
}
