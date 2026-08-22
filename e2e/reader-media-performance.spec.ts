import { expect, test } from "@playwright/test";

test("reader media boundary is measured before and after the user starts", async ({ page }, testInfo) => {
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

  const beforeImages = imageResponses.size;
  const beforeAudio = audioResponses.size;
  expect(beforeImages).toBeGreaterThanOrEqual(1);

  await page.getByRole("button", { name: "开始听故事" }).click();
  await page.waitForTimeout(700);

  console.log(
    `[reader-media-baseline] ${testInfo.project.name}: after start images=${imageResponses.size}, audio=${audioResponses.size}`,
  );

  expect(imageResponses.size).toBeGreaterThanOrEqual(beforeImages);
  expect(audioResponses.size).toBeGreaterThanOrEqual(beforeAudio);
});
