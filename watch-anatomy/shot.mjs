// Screenshot a built page with headless Chrome, no CDP needed.
// node shot.mjs <page.html> [out.png] [width] [height]
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [page, out = "shots/page.png", width = "1100", height = "900"] = process.argv.slice(2);
const chrome = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
mkdirSync(dirname(resolve(out)), { recursive: true });
const result = spawnSync(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    `--user-data-dir=${resolve(".chrome-shot")}`,
    `--window-size=${width},${height}`,
    `--screenshot=${resolve(out)}`,
    "--virtual-time-budget=4000",
    `file://${resolve(page)}`,
  ],
  { stdio: "ignore" },
);
if (result.error) throw result.error;
console.log("wrote", out);
