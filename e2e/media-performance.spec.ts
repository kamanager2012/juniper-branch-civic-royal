import { expect, test } from "@playwright/test";

test("bookshelf defers below-fold cover media and still decodes it on demand", async ({ page }) => {
  const requestedCovers = new Set<string>();
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (/^\/stories\/[^/]+\/cover\.jpg$/.test(url.pathname) && response.ok()) {
      requestedCovers.add(url.pathname);
    }
  });

  await page.goto("/", { waitUntil: "networkidle" });

  const storyLinks = page.locator('a[href^="/story/"]');
  const coverImages = storyLinks.locator("img");
  const total = await storyLinks.count();
  expect(total).toBeGreaterThan(4);
  expect(await coverImages.count()).toBe(total);

  const lazyCount = await coverImages.evaluateAll((images) =>
    images.filter((image) => image instanceof HTMLImageElement && image.loading === "lazy").length,
  );
  expect(lazyCount).toBe(total - 4);

  const initialRequested = requestedCovers.size;
  expect(initialRequested, `initial page requested all ${total} story covers`).toBeLessThan(total);

  // Move through the shelf so every lazy image eventually becomes an on-demand
  // candidate, then verify the full library can still decode successfully.
  for (let index = 0; index < total; index += 3) {
    await coverImages.nth(index).scrollIntoViewIfNeeded();
    await page.waitForTimeout(40);
  }
  await coverImages.last().scrollIntoViewIfNeeded();

  await expect
    .poll(
      () =>
        coverImages.evaluateAll((images) =>
          images.filter((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0).length,
        ),
      { timeout: 10_000 },
    )
    .toBe(total);

  expect(requestedCovers.size).toBe(total);
});
