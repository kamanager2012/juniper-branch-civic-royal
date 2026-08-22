import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function literalText(node) {
  return node && ts.isStringLiteralLike(node) ? node.text : null;
}

function propertyName(node) {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return null;
}

function objectProperties(node) {
  const map = new Map();
  if (!node || !ts.isObjectLiteralExpression(node)) return map;
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = propertyName(property.name);
    if (name) map.set(name, property.initializer);
  }
  return map;
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function formatDiagnostic(diagnostic) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}

export function loadStoryModel(options = {}) {
  const root = options.root ? resolve(options.root) : repoRoot;
  const sourcePath = join(root, "src/data/stories.ts");
  const source = readFileSync(sourcePath, "utf8");
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const errors = sourceFile.parseDiagnostics.map((diagnostic) => ({
    line: diagnostic.start == null
      ? null
      : sourceFile.getLineAndCharacterOfPosition(diagnostic.start).line + 1,
    message: `TypeScript parse error: ${formatDiagnostic(diagnostic)}`,
  }));

  let storiesArray = null;
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === "stories" &&
        declaration.initializer &&
        ts.isArrayLiteralExpression(declaration.initializer)
      ) {
        storiesArray = declaration.initializer;
      }
    }
  }

  if (!storiesArray) {
    errors.push({ line: null, message: "Could not find canonical `stories` array in src/data/stories.ts" });
  }

  const stories = [];
  if (storiesArray) {
    for (const storyNode of storiesArray.elements) {
      if (!ts.isObjectLiteralExpression(storyNode)) {
        errors.push({ line: lineOf(sourceFile, storyNode), message: "Story entries must be object literals" });
        continue;
      }

      const props = objectProperties(storyNode);
      const requiredFields = ["id", "title", "pinyin", "tagline", "meaning", "moral", "tone", "cover"];
      const values = {};
      for (const field of requiredFields) {
        const value = literalText(props.get(field));
        if (!value) {
          errors.push({ line: lineOf(sourceFile, storyNode), message: `Story ${field} must be a non-empty string literal` });
        }
        values[field] = value;
      }

      const storyId = values.id;
      const pagesNode = props.get("pages");
      const pages = [];
      if (!pagesNode || !ts.isArrayLiteralExpression(pagesNode)) {
        errors.push({ line: lineOf(sourceFile, storyNode), message: `Story ${storyId ?? "<unknown>"} pages must be an array literal` });
      } else {
        for (const pageNode of pagesNode.elements) {
          if (
            !ts.isCallExpression(pageNode) ||
            !ts.isIdentifier(pageNode.expression) ||
            pageNode.expression.text !== "page"
          ) {
            errors.push({ line: lineOf(sourceFile, pageNode), message: `Story ${storyId ?? "<unknown>"} pages must use page(...) calls` });
            continue;
          }

          const [storyArg, pageArg, kindArg, textArg, imageArg] = pageNode.arguments;
          const parsed = {
            storyId: literalText(storyArg),
            id: literalText(pageArg),
            kind: literalText(kindArg),
            text: literalText(textArg),
            imageFile: literalText(imageArg),
            line: lineOf(sourceFile, pageNode),
          };

          if (!parsed.storyId || !parsed.id || !parsed.text || !parsed.imageFile || !["cover", "story", "moral"].includes(parsed.kind)) {
            errors.push({ line: parsed.line, message: `page(...) structural fields must remain string literals` });
            continue;
          }
          if (storyId && parsed.storyId !== storyId) {
            errors.push({ line: parsed.line, message: `page story id ${parsed.storyId} does not match parent story ${storyId}` });
          }

          pages.push({
            ...parsed,
            image: `/stories/${parsed.storyId}/${parsed.imageFile}`,
            audio: `/audio/${parsed.storyId}/${parsed.id}.mp3`,
          });
        }
      }

      stories.push({ ...values, pages, line: lineOf(sourceFile, storyNode) });
    }
  }

  if (errors.length > 0 && options.allowErrors !== true) {
    const detail = errors.map((error) => `${error.line ?? "?"}: ${error.message}`).join("\n");
    throw new Error(`Invalid canonical story model:\n${detail}`);
  }

  return {
    schemaVersion: 1,
    sourcePath,
    errors,
    stories,
    pages: stories.flatMap((story) => story.pages),
  };
}
