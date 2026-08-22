import { expect, test } from "@playwright/test";

const INITIAL_COVER_REQUEST_BUDGET = 5;
const EAGER_COVER_COUNT = 2;
const MEDIA_STORY_COUNT = 24;
const TEXT_STORY_COUNT = 76;

test("bookshelf defers only real media covers and keeps the 100-story catalog media-safe", async ({ page }, testInfo) => {
  const requestedCovers = new Set<string>();
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (/^\/stories\/[^/]+\/cover\.jpg$/.test(url.pathname) && response.ok()) {
      requestedCovers.add(url.pathname);
    }
  });

  await page.goto("/", { waitUntil: "networkidle" });

  const mediaLinks = page.locator('a[data-media-story="true"]');
  const textLinks = page.locator('a[data-text-story="true"]');
  const coverImages = mediaLinks.locator("img");
  const total = await mediaLinks.count();
  expect(total).toBe(MEDIA_STORY_COUNT);
  expect(await textLinks.count()).toBe(TEXT_STORY_COUNT);
  expect(await page.locator('a[href^="/story/"]').count()).toBe(MEDIA_STORY_COUNT + TEXT_STORY_COUNT);
  expect(await coverImages.count()).toBe(total);
  expect(await textLinks.locator("img").count()).toBe(0);

  const policies = await coverImages.evaluateAll((images) =>
    images.map((image) => (image instanceof HTMLImageElement ? image.dataset.coverLoading : undefined)),
  );
  expect(policies.filter((policy) => policy === "eager")).toHaveLength(EAGER_COVER_COUNT);
  expect(policies.filter((policy) => policy === "deferred")).toHaveLength(total - EAGER_COVER_COUNT);

  const initialRequested = requestedCovers.size;
  console.log(
    `[media-baseline] ${testInfo.project.name}: initial cover requests ${initialRequested}/${total} (budget <= ${INITIAL_COVER_REQUEST_BUDGET})`,
  );
  expect(initialRequested, `initial cover request budget exceeded: ${initialRequested}/${total}`).toBeLessThanOrEqual(
    INITIAL_COVER_REQUEST_BUDGET,
  );

  for (let index = 0; index < total; index += 2) {
    await coverImages.nth(index).scrollIntoViewIfNeeded();
    await page.waitForTimeout(60);
  }
  await coverImages.last().scrollIntoViewIfNeeded();

  await expect.poll(() => requestedCovers.size, { timeout: 10_000 }).toBe(total);
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
