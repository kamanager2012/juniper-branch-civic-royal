import { expect, test } from "@playwright/test";

test("installed app shell and a visited illustrated story remain readable offline", async ({ page, context }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) throw new Error("service worker did not become active");
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true });
      });
    }
  });

  expect(await page.evaluate(async () => Boolean(await caches.match("/ui/bookshelf-paper.svg")))).toBeTruthy();
  expect(await page.evaluate(async () => Boolean(await caches.match("/icon-180.svg")))).toBeTruthy();

  await page.reload({ waitUntil: "networkidle" });
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBeTruthy();

  const firstStory = page.locator('a[data-media-story="true"]').first();
  const href = await firstStory.getAttribute("href");
  const title = (await firstStory.locator("h3").innerText()).trim();
  expect(href).toMatch(/^\/story\/[a-z0-9-]+$/);
  const storyId = href!.split("/").pop()!;

  await firstStory.click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.locator('[data-illustrated-story="true"]')).toBeVisible();
  const heroImage = page.locator(".book-stage img").first();
  await expect(heroImage).toBeVisible();
  await expect.poll(() => heroImage.evaluate((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBeTruthy();

  expect(
    await page.evaluate(async (audioPath) => {
      for (const key of await caches.keys()) {
        if (await (await caches.open(key)).match(audioPath)) return true;
      }
      return false;
    }, `/audio/${storyId}/p0.mp3`),
    "retired narration must stay outside automatic offline caches",
  ).toBeFalsy();

  await context.setOffline(true);
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "成语故事", exact: true })).toBeVisible();
    const bookshelfHero = page.locator('img[src="/ui/bookshelf-paper.svg"]');
    await expect(bookshelfHero).toBeVisible();
    expect(await bookshelfHero.evaluate((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBeTruthy();

    await page.goto(href!, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.getByText("图文故事 · 旁白重制中", { exact: true })).toBeVisible();
    await expect(page.locator("audio")).toHaveCount(0);
    await expect(page.locator(".book-stage img").first()).toBeVisible();
    expect(
      await page.locator(".book-stage img").first().evaluate((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0),
      "visited story image should be available from the runtime cache",
    ).toBeTruthy();
  } finally {
    await context.setOffline(false);
  }
});
