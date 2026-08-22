import { expect, test } from "@playwright/test";

const PROGRESS_KEY = "chengyu-progress-v1";
const SETTINGS_KEY = "chengyu-settings-v1";

async function firstStory(page: import("@playwright/test").Page) {
  await page.goto("/", { waitUntil: "networkidle" });
  const link = page.locator('a[href^="/story/"]').first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/story\/[a-z0-9-]+$/);
  return { link, href: href!, storyId: href!.split("/").pop()! };
}

test("reading state survives pause, page turns, reload and completion", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());

  const { link, storyId } = await firstStory(page);
  await link.click();

  await page.getByRole("button", { name: "开始听故事" }).click();
  await expect(page.getByRole("button", { name: "暂停" })).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(
        ({ key, id }) => JSON.parse(localStorage.getItem(key) ?? "{}")[id] ?? null,
        { key: PROGRESS_KEY, id: storyId },
      ),
    )
    .toEqual({ stars: 0, heard: true });

  await page.getByRole("button", { name: "暂停" }).click();
  await expect(page.getByRole("button", { name: "播放" })).toBeVisible();
  await page.getByRole("button", { name: "播放" }).click();
  await expect(page.getByRole("button", { name: "暂停" })).toBeVisible();

  await page.getByRole("button", { name: "自动翻页 开" }).click();
  await expect(page.getByRole("button", { name: "自动翻页 关" })).toBeVisible();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), SETTINGS_KEY)).toMatchObject({
    autoFlip: false,
  });

  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.getByText(/^2 \/ \d+$/)).toBeVisible({ timeout: 3_000 });

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "开始听故事" })).toBeVisible();
  await page.getByRole("button", { name: "开始听故事" }).click();
  await expect(page.getByRole("button", { name: "自动翻页 关" })).toBeVisible();

  const pageDots = page.locator('footer button[aria-label^="第 "]');
  expect(await pageDots.count()).toBeGreaterThan(2);
  await pageDots.last().click();
  await expect(page.getByText("成语的意思", { exact: true })).toBeVisible({ timeout: 3_000 });

  await expect
    .poll(() =>
      page.evaluate(
        ({ key, id }) => JSON.parse(localStorage.getItem(key) ?? "{}")[id] ?? null,
        { key: PROGRESS_KEY, id: storyId },
      ),
    )
    .toEqual({ stars: 3, heard: true });

  await page.getByRole("link", { name: "回书架", exact: true }).click();
  await expect(page.getByText("已经听过 1 本有声故事", { exact: true })).toBeVisible();
  await expect(page.locator(`a[href="/story/${storyId}"]`).getByLabel("3 颗星")).toBeVisible();
});

test("corrupt persisted state fails safe instead of poisoning the reader", async ({ page }) => {
  const { href, storyId } = await firstStory(page);

  await page.evaluate(
    ({ progressKey, settingsKey, id }) => {
      localStorage.setItem(progressKey, JSON.stringify({ [id]: { stars: 99, heard: "yes" }, junk: "broken" }));
      localStorage.setItem(settingsKey, JSON.stringify({ autoFlip: "no", music: 123 }));
    },
    { progressKey: PROGRESS_KEY, settingsKey: SETTINGS_KEY, id: storyId },
  );

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(`a[href="${href}"]`).getByLabel("0 颗星")).toBeVisible();

  await page.goto(href, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "开始听故事" }).click();
  await expect(page.getByRole("button", { name: "自动翻页 开" })).toBeVisible();
  await expect(page.getByRole("button", { name: "关闭音乐" })).toBeVisible();
});
