import { expect, test } from "@playwright/test";

test("bookshelf, deep link, illustrated assets, attribution and viewport stay healthy", async ({ page, request }) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const badResponses: string[] = [];
  const audioRequests: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (req) => failedRequests.push(`${req.method()} ${req.url()}`));
  page.on("request", (req) => {
    if (new URL(req.url()).pathname.startsWith("/audio/")) audioRequests.push(req.url());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "成语故事", exact: true })).toBeVisible();
  await expect(page.locator('a[href^="/story/"]')).toHaveCount(100);
  await expect(page.locator('[data-grok-attribution="true"]')).toContainText("Created with Grok");

  const bookshelfHero = page.locator('img[src="/ui/bookshelf-paper.svg"]').first();
  await expect(bookshelfHero).toBeVisible();
  expect(await bookshelfHero.evaluate((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBeTruthy();

  const firstStory = page.locator('a[data-media-story="true"]').first();
  await expect(firstStory).toBeVisible();
  const href = await firstStory.getAttribute("href");
  const title = (await firstStory.locator("h3").innerText()).trim();
  expect(href).toMatch(/^\/story\/[a-z0-9-]+$/);

  const storyId = href!.split("/").pop()!;
  const coverResponse = await request.get(`/stories/${storyId}/cover.jpg`);
  expect(coverResponse.ok(), `cover request failed: ${coverResponse.status()}`).toBeTruthy();

  await page.goto(href!, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.locator('[data-illustrated-story="true"]')).toBeVisible();
  await expect(page.getByText("图文故事 · 旁白重制中", { exact: true })).toBeVisible();
  await expect(page.locator('[data-grok-attribution="true"]')).toContainText("Created with Grok");
  await expect(page.locator("audio")).toHaveCount(0);

  const heroImage = page.locator(".book-stage img").first();
  await expect(heroImage).toBeVisible();
  expect(await heroImage.evaluate((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBeTruthy();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `horizontal overflow: ${overflow}px`).toBeLessThanOrEqual(1);
  expect(audioRequests, "published story route must not request retired narration").toEqual([]);
  expect(failedRequests, `failed requests: ${failedRequests.join(", ")}`).toEqual([]);
  expect(badResponses, `HTTP errors: ${badResponses.join(", ")}`).toEqual([]);
  expect(consoleErrors, `console errors: ${consoleErrors.join(" | ")}`).toEqual([]);
});
