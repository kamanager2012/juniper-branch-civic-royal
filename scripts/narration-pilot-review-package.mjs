#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  NARRATION_PILOT_ID,
  NARRATION_PILOT_STORY_ID,
  validateCurrentNarrationPilot,
} from "./narration-pilot-approval.mjs";
import { buildNarrationPlan } from "./narration-plan.mjs";
import { repoRoot } from "./story-model.mjs";

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function shortSha(value) {
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

export function buildPilotReviewManifest(options = {}) {
  const validation = options.validation ?? validateCurrentNarrationPilot();
  if (!validation.valid) {
    throw new Error(`Refusing review package because pilot evidence is invalid:\n${validation.problems.join("\n")}`);
  }

  const plan = options.plan ?? buildNarrationPlan({ story: NARRATION_PILOT_STORY_ID });
  if (!Array.isArray(plan.items) || plan.items.length !== 9) {
    throw new Error("Installed pilot review package requires exactly 9 narration items");
  }

  const evidence = validation.evidence;
  const items = plan.items.map((item) => {
    const expectedAudioSha256 = evidence.audioSha256?.[item.key];
    if (item.status !== "current") throw new Error(`${item.key}: installed pilot narration is not current`);
    if (item.audioSha256 !== expectedAudioSha256) {
      throw new Error(`${item.key}: release audio SHA does not match pilot evidence`);
    }
    if (typeof item.text !== "string" || item.text.trim() === "") {
      throw new Error(`${item.key}: narration text is empty`);
    }

    const sourcePath = join(repoRoot, item.output);
    const sourceSha256 = sha256File(sourcePath);
    if (sourceSha256 !== expectedAudioSha256) {
      throw new Error(`${item.key}: installed MP3 bytes changed while building review package`);
    }

    return {
      key: item.key,
      pageId: item.pageId,
      kind: item.kind,
      text: item.text,
      textSha256: item.textSha256,
      audioSha256: expectedAudioSha256,
      source: item.output,
      reviewFile: `audio/${basename(item.output)}`,
    };
  });

  return {
    schemaVersion: 1,
    packageType: "installed-narration-pilot-listening-review",
    pilotId: NARRATION_PILOT_ID,
    storyId: NARRATION_PILOT_STORY_ID,
    storyTitle: items[0]?.key.startsWith(`${NARRATION_PILOT_STORY_ID}/`) ? plan.items[0].storyTitle : null,
    canonicalSource: plan.canonicalSource,
    installedBatch: evidence.installedBatch,
    technicalQc: evidence.technicalQc,
    qualityReview: evidence.qualityReview,
    itemCount: items.length,
    items,
    reviewPolicy: {
      humanListeningRequired: true,
      packageCannotApproveExpansion: true,
      approvalCommand: "npm run narration:pilot:review -- --decision approve --reviewer-role <ROLE> --note <20+ CHAR NOTE> --write",
      rejectionCommand: "npm run narration:pilot:review -- --decision reject --reviewer-role <ROLE> --note <20+ CHAR NOTE> --write",
    },
  };
}

export function renderPilotReviewHtml(manifest) {
  const itemCards = manifest.items
    .map(
      (item, index) => `
      <section class="item" data-key="${escapeHtml(item.key)}">
        <div class="item-head">
          <div><strong>${index + 1}. ${escapeHtml(item.pageId)}</strong> <span class="kind">${escapeHtml(item.kind)}</span></div>
          <code title="${escapeHtml(item.audioSha256)}">${escapeHtml(shortSha(item.audioSha256))}</code>
        </div>
        <p class="text">${escapeHtml(item.text)}</p>
        <audio controls preload="metadata" src="${escapeHtml(item.reviewFile)}"></audio>
        <div class="checks">
          <label><input type="checkbox" data-check="pronunciation"> 发音/多音字正确</label>
          <label><input type="checkbox" data-check="prosody"> 断句/语气自然</label>
          <label><input type="checkbox" data-check="pace"> 节奏适合儿童故事</label>
          <label><input type="checkbox" data-check="artifact"> 无爆音/吞字/异响</label>
          <label><input type="checkbox" data-check="match"> 与上方文本一致</label>
          <label class="pass"><input type="checkbox" data-check="pass"> 本条通过</label>
        </div>
        <textarea rows="2" placeholder="可选：记录这一条的问题或修改建议"></textarea>
      </section>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; media-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:">
<title>${escapeHtml(manifest.storyTitle)} · Narration Pilot Review</title>
<style>
  :root{font-family:system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#171717;background:#f5f5f3}
  body{max-width:980px;margin:0 auto;padding:28px 18px 64px;line-height:1.65}
  header,.item,.decision{background:#fff;border:1px solid #ddd;border-radius:14px;padding:20px;margin:0 0 16px}
  h1{margin:.1em 0}.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;font-size:14px}.warn{padding:12px 14px;background:#fff7d6;border-radius:10px}
  .item-head{display:flex;justify-content:space-between;gap:12px}.kind{font-size:12px;padding:2px 8px;background:#eee;border-radius:999px}.text{font-size:18px}.item audio{width:100%}.checks{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin:14px 0}.pass{font-weight:700}textarea{box-sizing:border-box;width:100%;padding:8px}.decision code{display:block;white-space:pre-wrap;word-break:break-all;background:#f5f5f5;padding:10px;border-radius:8px}.progress{position:sticky;bottom:12px;background:#171717;color:#fff;padding:10px 14px;border-radius:999px;text-align:center;box-shadow:0 6px 24px #0003}
</style>
</head>
<body>
<header>
  <div>Installed release audio · human listening gate</div>
  <h1>${escapeHtml(manifest.storyTitle)}（${escapeHtml(manifest.pilotId)}）</h1>
  <div class="meta">
    <div>Batch: <code>${escapeHtml(manifest.installedBatch.batchId)}</code></div>
    <div>Receipt: <code>${escapeHtml(shortSha(manifest.installedBatch.receiptSha256))}</code></div>
    <div>Items: <strong>${manifest.itemCount}</strong></div>
    <div>Current review: <strong>${escapeHtml(manifest.qualityReview.listeningStatus)}</strong></div>
  </div>
  <p class="warn"><strong>审核对象固定：</strong>本包只复制仓库当前已安装的 release MP3，并在打包前逐条校验 pilot evidence SHA。它不会调用 Kokoro、不会重新生成音频，也不能自行批准扩容。</p>
  <p>建议逐条核对：发音、多音字、断句、语气、节奏、吞字/异响、与文本一致性，以及整体是否适合儿童故事播放。</p>
</header>
${itemCards}
<section class="decision">
  <h2>最终人工决定</h2>
  <p>只有你完成试听后，才在仓库执行下面其中一个命令。HTML 本身不会写 evidence。</p>
  <strong>通过并允许扩容：</strong>
  <code>${escapeHtml(manifest.reviewPolicy.approvalCommand)}</code>
  <strong>拒绝并保持扩容锁：</strong>
  <code>${escapeHtml(manifest.reviewPolicy.rejectionCommand)}</code>
</section>
<div class="progress" id="progress">0 / ${manifest.itemCount} 条标记通过</div>
<script>
(() => {
  const key = ${JSON.stringify(`pilot-review:${manifest.pilotId}:${manifest.installedBatch.receiptSha256}`)};
  const controls = [...document.querySelectorAll('input[type="checkbox"], textarea')];
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    controls.forEach((el, i) => {
      if (el.type === 'checkbox') el.checked = Boolean(saved[i]);
      else if (typeof saved[i] === 'string') el.value = saved[i];
    });
  } catch {}
  function update() {
    const state = {};
    controls.forEach((el, i) => { state[i] = el.type === 'checkbox' ? el.checked : el.value; });
    try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
    const passed = document.querySelectorAll('input[data-check="pass"]:checked').length;
    document.getElementById('progress').textContent = passed + ' / ${manifest.itemCount} 条标记通过';
  }
  controls.forEach((el) => el.addEventListener('input', update));
  update();
})();
</script>
</body>
</html>`;
}

export function writePilotReviewPackage(options = {}) {
  const outDir = resolve(options.outDir ?? join(repoRoot, "pilot-review-artifact"));
  if (outDir === repoRoot || !outDir.startsWith(`${repoRoot}/`)) {
    throw new Error("review package output must be a dedicated directory inside the repository workspace");
  }

  const manifest = options.manifest ?? buildPilotReviewManifest();
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, "audio"), { recursive: true });
  mkdirSync(join(outDir, "evidence"), { recursive: true });

  for (const item of manifest.items) {
    const sourcePath = join(repoRoot, item.source);
    const targetPath = join(outDir, item.reviewFile);
    copyFileSync(sourcePath, targetPath);
    if (sha256File(targetPath) !== item.audioSha256) {
      throw new Error(`${item.key}: copied review MP3 SHA mismatch`);
    }
  }

  const validation = validateCurrentNarrationPilot();
  const pilotEvidenceSource = join(repoRoot, "content/evidence/narration/pilots/shou-zhu-v1.json");
  const receiptSource = join(repoRoot, validation.evidence.installedBatch.receiptPath);
  const pilotEvidenceTarget = join(outDir, "evidence/pilot.json");
  const receiptTarget = join(outDir, "evidence/receipt.json");
  copyFileSync(pilotEvidenceSource, pilotEvidenceTarget);
  copyFileSync(receiptSource, receiptTarget);
  if (sha256File(receiptTarget) !== manifest.installedBatch.receiptSha256) {
    throw new Error("copied pilot receipt SHA mismatch");
  }

  const manifestPath = join(outDir, "manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(outDir, "review.html"), renderPilotReviewHtml(manifest));
  writeFileSync(
    join(outDir, "README.txt"),
    [
      `${manifest.storyTitle} narration pilot listening review`,
      "",
      "Open review.html in a browser and listen to all 9 installed release MP3 files.",
      "The package generator verifies every MP3 against durable pilot evidence before copying it.",
      "This package never generates audio and never approves expansion.",
      "",
      `manifest sha256: ${sha256File(manifestPath)}`,
      `pilot receipt sha256: ${manifest.installedBatch.receiptSha256}`,
      "",
    ].join("\n"),
  );

  return {
    outDir,
    pilotId: manifest.pilotId,
    storyId: manifest.storyId,
    itemCount: manifest.itemCount,
    manifestSha256: sha256File(manifestPath),
    receiptSha256: manifest.installedBatch.receiptSha256,
    listeningStatus: manifest.qualityReview.listeningStatus,
    expansionApproved: manifest.qualityReview.expansionApproved,
  };
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (process.argv[1]?.endsWith("narration-pilot-review-package.mjs")) {
  try {
    const result = writePilotReviewPackage({ outDir: argValue("--out-dir") ?? undefined });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
