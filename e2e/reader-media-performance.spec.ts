import { expect, test } from "@playwright/test";

test("reader defers narration and adjacent imagery until explicit start", async ({ page }, testInfo) => {
  const imageResponses = new Set<string>();
  const audioResponses = new Set<string>();
  let storyId = "";

  page.on("response", (response) => {
    if (!response.ok() || !storyId) return;
    const path = new URL(response.url()).pathname;
    if (path.startsWith(`/stories/${storyId}/`) && /\.(?:jpg|jpeg|png|webp)$/.test(path)) imageResponses.add(path);
    if (path.startsWith(`/audio/${storyId}/`) && path.endsWith(".mp3")) audioResponses.add(path);
  });

  await page.goto("/", { waitUntil: "networkidle" });
  const href = await page.locator('a[href^="/story/"]').first().getAttribute("href");
  expect(href).toMatch(/^\/story\/[a-z0-9-]+$/);
  storyId = href!.split("/").pop()!;
  imageResponses.clear();
  audioResponses.clear();

  await page.goto(href!, { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "开始听故事" })).toBeVisible();

  console.log(
    `[reader-media-baseline] ${testInfo.project.name}: before start images=${imageResponses.size}, audio=${audioResponses.size}`,
  );

  expect(imageResponses.size, "reader should load only the visible cover before start").toBe(1);
  expect(audioResponses.size, "reader must not transfer narration before explicit start").toBe(0);

  await page.getByRole("button", { name: "开始听故事" }).click();

  await expect.poll(() => imageResponses.size, { timeout: 5_000 }).toBeGreaterThanOrEqual(2);
  await expect.poll(() => audioResponses.size, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);

  console.log(
    `[reader-media-baseline] ${testInfo.project.name}: after start images=${imageResponses.size}, audio=${audioResponses.size}`,
  );
});
