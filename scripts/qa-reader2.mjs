import { chromium } from "playwright";
const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text()); });
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto("http://127.0.0.1:8080/story/shou-zhu", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.screenshot({ path: "/workspace/screenshots/cover-direct.png" });
const btn = page.getByRole("button", { name: "开始听故事" });
console.log("start visible", await btn.isVisible());
await btn.click();
await page.waitForTimeout(800);
await page.screenshot({ path: "/workspace/screenshots/after-start.png" });
// jump to moral via last dot
const dots = page.locator("footer button[aria-label^='第']");
console.log("dots", await dots.count());
await dots.last().click();
await page.waitForTimeout(600);
await page.screenshot({ path: "/workspace/screenshots/moral.png" });
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto("http://127.0.0.1:8080/story/jing-di", { waitUntil: "networkidle" });
await mobile.waitForTimeout(400);
await mobile.screenshot({ path: "/workspace/screenshots/cover-mobile.png" });
await browser.close();
console.log("QA2_OK");
