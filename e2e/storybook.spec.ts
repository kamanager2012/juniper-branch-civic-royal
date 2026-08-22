import { expect, test } from "@playwright/test";

test("bookshelf, deep link, media assets and viewport stay healthy", async ({ page, request }) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (req) => failedRequests.push(`${req.method()} ${req.url()}`));

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "成语故事", exact: true })).toBeVisible();

  const firstStory = page.locator('a[href^="/story/"]').first();
  await expect(firstStory).toBeVisible();

  const href = await firstStory.getAttribute("href");
  const title = (await firstStory.locator("h3").innerText()).trim();
  expect(href).toMatch(/^\/story\/[a-z0-9-]+$/);

  const storyId = href!.split("/").pop()!;
  const coverResponse = await request.get(`/stories/${storyId}/cover.jpg`);
  const narrationResponse = await request.get(`/audio/${storyId}/p0.mp3`);
  expect(coverResponse.ok(), `cover request failed: ${coverResponse.status()}`).toBeTruthy();
  expect(narrationResponse.ok(), `narration request failed: ${narrationResponse.status()}`).toBeTruthy();

  // Direct navigation, not a client-side click: validates static-host SPA fallback.
  await page.goto(href!, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "开始听故事" })).toBeVisible();

  const heroImage = page.locator(".book-stage img").first();
  await expect(heroImage).toBeVisible();
  expect(
    await heroImage.evaluate((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0),
    "story image did not decode",
  ).toBeTruthy();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `horizontal overflow: ${overflow}px`).toBeLessThanOrEqual(1);
  expect(failedRequests, `failed requests: ${failedRequests.join(", ")}`).toEqual([]);
  expect(consoleErrors, `console errors: ${consoleErrors.join(" | ")}`).toEqual([]);
});
