import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const sourcePath = join(root, "src/data/stories.ts");
const source = readFileSync(sourcePath, "utf8");
const sourceFile = ts.createSourceFile(
  sourcePath,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);

const pages = [];
const malformedCalls = [];

function literalText(node) {
  return ts.isStringLiteralLike(node) ? node.text : null;
}

function visit(node) {
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "page"
  ) {
    const [storyArg, pageArg, kindArg, , imageArg] = node.arguments;
    const storyId = storyArg ? literalText(storyArg) : null;
    const pageId = pageArg ? literalText(pageArg) : null;
    const kind = kindArg ? literalText(kindArg) : null;
    const imageFile = imageArg ? literalText(imageArg) : null;

    if (
      !storyId ||
      !pageId ||
      !["cover", "story", "moral"].includes(kind) ||
      !imageFile
    ) {
      malformedCalls.push({
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        text: node.getText(sourceFile).slice(0, 160),
      });
    } else {
      pages.push({ storyId, pageId, kind, imageFile });
    }
  }
  ts.forEachChild(node, visit);
}

visit(sourceFile);

function assertNonEmptyFile(path, label) {
  assert.equal(existsSync(path), true, `${label} is missing: ${path}`);
  assert.ok(statSync(path).size > 0, `${label} is empty: ${path}`);
}

test("story manifest uses statically verifiable page() calls", () => {
  assert.equal(
    sourceFile.parseDiagnostics.length,
    0,
    `stories.ts has parse errors: ${sourceFile.parseDiagnostics.map((d) => d.messageText).join("; ")}`,
  );
  assert.equal(
    malformedCalls.length,
    0,
    `page() calls must keep literal story/page/kind/image fields: ${JSON.stringify(malformedCalls)}`,
  );
  assert.ok(pages.length > 0, "stories.ts contains no page() calls");
});

test("every story page resolves to a non-empty image and narration file", () => {
  const seen = new Set();
  for (const page of pages) {
    const key = `${page.storyId}/${page.pageId}`;
    assert.equal(seen.has(key), false, `duplicate story/page id: ${key}`);
    seen.add(key);

    assertNonEmptyFile(
      join(root, "public/stories", page.storyId, page.imageFile),
      `image for ${key}`,
    );
    assertNonEmptyFile(
      join(root, "public/audio", page.storyId, `${page.pageId}.mp3`),
      `audio for ${key}`,
    );
  }
});

test("each story has exactly one cover page and one moral page", () => {
  const grouped = new Map();
  for (const page of pages) {
    const list = grouped.get(page.storyId) ?? [];
    list.push(page);
    grouped.set(page.storyId, list);
  }

  assert.ok(grouped.size > 0, "no stories discovered");
  for (const [storyId, storyPages] of grouped) {
    const covers = storyPages.filter((page) => page.kind === "cover");
    const morals = storyPages.filter((page) => page.kind === "moral");
    assert.equal(covers.length, 1, `${storyId} must contain exactly one cover page`);
    assert.equal(morals.length, 1, `${storyId} must contain exactly one moral page`);
  }
});
