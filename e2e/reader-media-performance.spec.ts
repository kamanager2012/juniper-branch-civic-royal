import { expect, test } from "@playwright/test";

test("illustrated reader loads pages on demand and never requests unverified narration", async ({ page }, testInfo) => {
  const imageResponses = new Set<string>();
  const audioRequests: string[] = [];
  let storyId = "";

  page.on("response", (response) => {
    if (!response.ok() || !storyId) return;
    const path = new URL(response.url()).pathname;
    if (path.startsWith(`/stories/${storyId}/`) && /\.(?:jpg|jpeg|png|webp)$/.test(path)) imageResponses.add(path);
  });
  page.on("request", (request) => {
    if (!storyId) return;
    const path = new URL(request.url()).pathname;
    if (path.startsWith(`/audio/${storyId}/`)) audioRequests.push(path);
  });

  await page.goto("/", { waitUntil: "networkidle" });
  const href = await page.locator('a[data-media-story="true"]').first().getAttribute("href");
  expect(href).toMatch(/^\/story\/[a-z0-9-]+$/);
  storyId = href!.split("/").pop()!;
  imageResponses.clear();
  audioRequests.length = 0;

  await page.goto(href!, { waitUntil: "networkidle" });
  await expect(page.locator('[data-illustrated-story="true"]')).toBeVisible();
  await expect(page.getByText("图文故事 · 旁白重制中", { exact: true })).toBeVisible();
  expect(imageResponses.size, "reader should initially load the visible cover only").toBe(1);
  expect(audioRequests, "unverified narration must never be requested").toEqual([]);

  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.getByText(/^2 \/ 9$/)).toBeVisible();
  await expect.poll(() => imageResponses.size, { timeout: 5_000 }).toBeGreaterThanOrEqual(2);
  expect(audioRequests, "page turns must not trigger unverified narration").toEqual([]);

  console.log(`[reader-media-baseline] ${testInfo.project.name}: images=${imageResponses.size}, audioRequests=${audioRequests.length}`);
});
