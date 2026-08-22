import { expect, test } from "@playwright/test";

test("76 text-ready stories are readable and never fabricate media", async ({ page }) => {
  const forbiddenMediaRequests: string[] = [];
  let draftId = "";

  page.on("request", (request) => {
    if (!draftId) return;
    const url = new URL(request.url());
    if (url.pathname.startsWith(`/stories/${draftId}/`) || url.pathname.startsWith(`/audio/${draftId}/`)) {
      forbiddenMediaRequests.push(url.pathname);
    }
  });

  await page.goto("/", { waitUntil: "networkidle" });
  const mediaLinks = page.locator('a[data-media-story="true"]');
  const textLinks = page.locator('a[data-text-story="true"]');
  expect(await mediaLinks.count()).toBe(24);
  expect(await textLinks.count()).toBe(76);
  expect(await page.locator('a[href^="/story/"]').count()).toBe(100);

  const firstTextStory = textLinks.first();
  const href = await firstTextStory.getAttribute("href");
  expect(href).toMatch(/^\/story\/[a-z0-9-]+$/);
  draftId = href!.split("/").pop()!;

  await firstTextStory.click();
  await expect(page.getByText("文字版 · 插图与旁白制作中", { exact: true })).toBeVisible();
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.getByRole("heading", { name: "这个成语是什么意思？" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "故事告诉我们" })).toBeVisible();
  await expect(page.locator("article section")).toHaveCount(6);
  await expect(page.locator("img")).toHaveCount(0);
  await expect(page.locator("audio")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "开始听故事" })).toHaveCount(0);
  expect(forbiddenMediaRequests, "text-only story attempted to load fabricated image/audio media").toEqual([]);
});
