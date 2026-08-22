import { expect, test } from "@playwright/test";

const INITIAL_COVER_REQUEST_BUDGET = 8;

test("bookshelf defers below-fold cover media and still decodes it on demand", async ({ page }, testInfo) => {
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

  const policies = await coverImages.evaluateAll((images) =>
    images.map((image) => (image instanceof HTMLImageElement ? image.dataset.coverLoading : undefined)),
  );
  expect(policies.filter((policy) => policy === "eager")).toHaveLength(4);
  expect(policies.filter((policy) => policy === "deferred")).toHaveLength(total - 4);

  const initialRequested = requestedCovers.size;
  console.log(
    `[media-baseline] ${testInfo.project.name}: initial cover requests ${initialRequested}/${total} (budget <= ${INITIAL_COVER_REQUEST_BUDGET})`,
  );
  expect(initialRequested, `initial cover request budget exceeded: ${initialRequested}/${total}`).toBeLessThanOrEqual(
    INITIAL_COVER_REQUEST_BUDGET,
  );

  // Move through the shelf so every deferred image intersects the controlled
  // loading boundary, then verify the full library can still decode.
  for (let index = 0; index < total; index += 2) {
    await coverImages.nth(index).scrollIntoViewIfNeeded();
    await page.waitForTimeout(60);
  }
  await coverImages.last().scrollIntoViewIfNeeded();

  await expect
    .poll(() => requestedCovers.size, { timeout: 10_000 })
    .toBe(total);

  await expect
    .poll(
      () =>
        coverImages.evaluateAll((images) =>
          images.filter((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0).length,
        ),
      { timeout: 10_000 },
    )
    .toBe(total);

  console.log(`[media-baseline] ${testInfo.project.name}: final cover requests ${requestedCovers.size}/${total}`);
});
