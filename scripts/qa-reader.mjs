import { chromium } from "playwright";
import { mkdirSync } from "fs";
mkdirSync("/workspace/screenshots", { recursive: true });
const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE", m.text());
});
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle" });
await page.locator("a", { hasText: "守株待兔" }).first().click();
await page.waitForTimeout(900);
await page.screenshot({ path: "/workspace/screenshots/reader-cover.png" });
await page.getByRole("button", { name: "开始听故事" }).click();
await page.waitForTimeout(2000);
await page.screenshot({ path: "/workspace/screenshots/reader-playing.png" });
const nexts = page.getByRole("button", { name: "下一页" });
const n = await nexts.count();
console.log("next buttons", n);
if (n > 0) await nexts.last().click();
await page.waitForTimeout(1400);
await page.screenshot({ path: "/workspace/screenshots/reader-page2.png" });
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
mobile.on("console", (m) => {
  if (m.type() === "error") console.log("MCONSOLE", m.text());
});
await mobile.goto("http://127.0.0.1:8080/story/hu-jia", { waitUntil: "networkidle" });
await mobile.waitForTimeout(700);
await mobile.screenshot({ path: "/workspace/screenshots/reader-mobile.png" });
const text = await page.locator("body").innerText();
console.log("BODY", JSON.stringify(text.slice(0, 500)));
await browser.close();
console.log("QA_OK");
