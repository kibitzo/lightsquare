// docs/architecture.png: the picture of docs/architecture.html, for places
// that cannot show a web page (the README on GitHub and on npm).
//   node scripts/diagram.mjs
// Run it after a change to docs/architecture.html. It needs the network once,
// for the page's fonts.
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const docs = new URL("../docs/", import.meta.url);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
await page.goto(new URL("architecture.html", docs).href);
await page.evaluate(() => document.fonts.ready);
await page.locator("svg").screenshot({ path: fileURLToPath(new URL("architecture.png", docs)) });
await browser.close();
console.log("docs/architecture.png written");
