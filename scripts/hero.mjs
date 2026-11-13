// docs/hero.png: the picture at the top of the README, taken of
// docs/hero.html (three boards of the built library).
//   npm run build && node scripts/hero.mjs
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const types = { html: "text/html", css: "text/css", js: "application/javascript" };
// A page's modules do not load from a file address: a server for the length of the picture.
const server = createServer((req, res) => {
  try {
    const file = root + req.url.split("?")[0].replace(/^\/+/, "").replace(/\.\.\//g, "");
    res.writeHead(200, { "content-type": types[file.split(".").pop()] ?? "text/plain" });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 600 }, deviceScaleFactor: 2 });
await page.goto(`http://localhost:${server.address().port}/docs/hero.html`);
await page.waitForFunction("window.ready && !document.getAnimations().length");
await page.locator("#hero").screenshot({ path: `${root}docs/hero.png` });
// What the picture must hold, read from the page: a picture nobody looked at is not sent out.
const seen = await page.evaluate(() => ({
  boards: document.querySelectorAll(".ls-board").length,
  pieces: document.querySelectorAll(".ls-piece").length,
  selected: document.querySelectorAll("#one .ls-mark-select").length,
  dots: document.querySelectorAll("#one .ls-mark-dot").length,
  lastMoves: document.querySelectorAll(".ls-mark-last").length,
  arrows: document.querySelectorAll("#two .ls-arrow").length,
  circles: document.querySelectorAll("#two .ls-circle").length,
  check: document.querySelectorAll("#three .ls-mark-check").length,
  badge: document.querySelectorAll("#three .ls-mark-mate").length,
  // Where the badge and the check mark are: the file and rank of their square, read from the screen.
  marksOn: [".ls-mark-mate", ".ls-mark-check"].map((sel) => {
    const board = document.getElementById("three").getBoundingClientRect();
    const mark = document.querySelector(`#three ${sel}`).getBoundingClientRect();
    return "abcdefgh"[Math.round((mark.left - board.left) / (board.width / 8))] + (8 - Math.round((mark.top - board.top) / (board.width / 8)));
  }).join(),
  badgeColour: getComputedStyle(document.querySelector("#three .ls-mark-mate"), "::after").backgroundColor,
  width: document.getElementById("hero").getBoundingClientRect().width,
  height: document.getElementById("hero").getBoundingClientRect().height,
}));
await browser.close();
server.close();
const wanted = { boards: 3, pieces: 95, selected: 1, dots: 3, lastMoves: 6, arrows: 2, circles: 1, check: 1, badge: 1, marksOn: "e8,e8", badgeColour: "rgb(190, 18, 60)" };
for (const [what, count] of Object.entries(wanted)) if (seen[what] !== count) throw new Error(`the picture shows ${seen[what]} ${what}, not ${count}`);
console.log("docs/hero.png written", JSON.stringify(seen));
