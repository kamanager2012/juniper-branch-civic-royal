import { expect, test } from "@playwright/test";

const PROGRESS_KEY = "chengyu-progress-v1";
const SETTINGS_KEY = "chengyu-settings-v1";

async function firstIllustratedStory(page: import("@playwright/test").Page) {
  await page.goto("/", { waitUntil: "networkidle" });
  const link = page.locator('a[data-media-story="true"]').first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/story\/[a-z0-9-]+$/);
  return { link, href: href!, storyId: href!.split("/").pop()! };
}

test("illustrated reading flow reaches the moral without creating listening progress", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());

  const { link, storyId } = await firstIllustratedStory(page);
  await link.click();
  await expect(page.locator('[data-illustrated-story="true"]')).toBeVisible();
  await expect(page.getByText("图文故事 · 旁白重制中", { exact: true })).toBeVisible();
  await expect(page.locator("audio")).toHaveCount(0);

  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.getByText("2 / 9", { exact: true })).toBeVisible();

  const pageDots = page.getByLabel("页码").getByRole("button");
  await expect(pageDots).toHaveCount(9);
  await pageDots.last().click();
  await expect(page.getByText("成语的意思", { exact: true })).toBeVisible();
  await expect(page.getByText("小道理", { exact: true })).toBeVisible();

  const progress = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), PROGRESS_KEY);
  expect(progress[storyId], "illustrated reading must not be recorded as heard narration").toBeUndefined();

  await page.getByRole("link", { name: "回书架", exact: true }).click();
  await expect(page.getByRole("heading", { name: "成语故事", exact: true })).toBeVisible();
  await expect(page.getByText(/已经听过/)).toHaveCount(0);
});

test("legacy listening settings cannot re-enable retired narration UI", async ({ page }) => {
  const { href, storyId } = await firstIllustratedStory(page);

  await page.evaluate(
    ({ progressKey, settingsKey, id }) => {
      localStorage.setItem(progressKey, JSON.stringify({ [id]: { stars: 3, heard: true }, junk: "broken" }));
      localStorage.setItem(settingsKey, JSON.stringify({ autoFlip: true, music: true }));
    },
    { progressKey: PROGRESS_KEY, settingsKey: SETTINGS_KEY, id: storyId },
  );

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText(/已经听过/)).toHaveCount(0);
  await expect(page.locator(`a[href="${href}"]`).getByLabel(/颗星/)).toHaveCount(0);

  await page.goto(href, { waitUntil: "networkidle" });
  await expect(page.locator('[data-illustrated-story="true"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /播放|暂停|开始听故事|听讲解/ })).toHaveCount(0);
  await expect(page.locator("audio")).toHaveCount(0);
});
