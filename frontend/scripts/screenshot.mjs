// Screenshot the app at 1440 and 390 px against the Vite preview build (mock snapshot, no backend needed).
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const port = 4173;
const server = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));
mkdirSync("../screenshots", { recursive: true });
const exe = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
try {
  for (const [w, h, name] of [[1440, 1300, "desktop"], [390, 1400, "phone"]]) {
    for (const mode of ["simple", "detailed"]) {
      for (const theme of ["dark", "light"]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, timezoneId: "America/New_York" });
        const page = await ctx.newPage();
        await page.addInitScript(({ mode, theme }) => {
          localStorage.setItem("mode", JSON.stringify(mode));
          localStorage.setItem("theme", JSON.stringify(theme));
          localStorage.setItem("instr", JSON.stringify("NQ"));
        }, { mode, theme });
        await page.goto(`http://localhost:${port}/`);
        await page.waitForSelector("section[aria-label='The brief']");
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `../screenshots/${name}-${mode}-${theme}.png`, fullPage: true });
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
  server.kill();
}
console.log("screenshots written to screenshots/");
