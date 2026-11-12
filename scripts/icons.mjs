// The Lightsquare icon: a bishop as an ink study on parchment, in front of
// a circle in a square, in the manner of a Renaissance notebook page.
//   node scripts/icons.mjs
// Writes docs/icons/icon.svg (full detail, for large sizes), icon-small.svg
// (fewer and heavier lines, for 32 pixels and below), their PNG sizes, and
// social-preview.png (1280 by 640: the picture GitHub shows when a link to
// the repository is shared; it is uploaded by hand in the repository's
// settings, GitHub has no other way).
// The piece is the Cburnett bishop of assets/cburnett (BSD, see its NOTICE).
// To try another piece, change PIECE: k, q, r, b, n or p.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const out = new URL("docs/icons/", root);
const PIECE = "b";
const INK = "#5a3719";
const PAPER = "#f1e3c0";

/** What is inside a piece's <svg>, with its two colours replaced. */
function piece(code, dark, light, strokeWidth) {
  let s = readFileSync(new URL(`assets/cburnett/${code}.svg`, root), "utf8")
    .replace(/<\?xml[^>]*\?>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->/g, "")
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/\sid="[^"]*"/g, "")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/#000000|#000(?![0-9a-fA-F])/g, "@D").replace(/#ffffff|#fff(?![0-9a-fA-F])|#ececec/gi, "@L");
  s = s.replaceAll("@D", dark).replaceAll("@L", light);
  return s.replace(/stroke-width:\s*[\d.]+/g, `stroke-width:${strokeWidth}`).replace(/stroke-width="[\d.]+"/g, `stroke-width="${strokeWidth}"`);
}

/**
 * The icon. `small` is the version for tiny sizes: a heavier outline, a
 * larger piece, and of the page only the square.
 */
function icon(small) {
  const grow = small ? 1.36 : 1.25;
  const outline = piece(`w${PIECE}`, INK, PAPER, small ? 1.7 : 1);
  const hatching = piece(`b${PIECE}`, "url(#hatch)", "none", 0.01);
  const page = small
    ? `<rect x="9" y="9" width="46" height="46" rx="2" stroke-width="1.2" opacity=".4"/>`
    : `<g stroke-width=".45" opacity=".42">
        <rect x="11" y="9" width="42" height="42"/>
        <circle cx="32" cy="30" r="21"/>
        <path d="M32 6v48M8 30h48" stroke-width=".3"/>
      </g>
      <path d="M44 58.200c.8-.9 1.300.9 2.100 0s1.200.9 2 0 1.300.9 2.100 0 1.200.9 2 0 1.300.9 2.100 0" stroke-width=".4" opacity=".5"/>
      <path d="M7 54.200h50" stroke-width=".6" opacity=".7"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <title>Lightsquare</title>
  <defs>
    <radialGradient id="pp" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="#f8eccd"/><stop offset=".6" stop-color="#ead8ad"/><stop offset="1" stop-color="#cfb27a"/></radialGradient>
    <pattern id="hatch" width="1.3" height="1.3" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><line x1="0" y1="0" x2="0" y2="1.3" stroke="${INK}" stroke-width=".3"/></pattern>
    <linearGradient id="fade" x1="0" x2="1"><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".95"/></linearGradient>
    <mask id="shade" maskUnits="userSpaceOnUse" x="0" y="0" width="45" height="45"><rect width="45" height="45" fill="url(#fade)"/></mask>
    <clipPath id="tile"><rect width="64" height="64" rx="14"/></clipPath>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#pp)"/>
  <g clip-path="url(#tile)">
    <g fill="none" stroke="${INK}" stroke-linecap="round">
      ${page}
    </g>
    <g transform="translate(7.200 ${small ? 11.4 : 9.3}) scale(1.1)">
      <g transform="translate(22.500 39.500) scale(${grow}) translate(-22.500 -39.500)"><g>${outline}</g>${small ? "" : `<g mask="url(#shade)" opacity=".8">${hatching}</g>`}</g>
    </g>
  </g>
</svg>
`;
}

/** Each PNG, from which drawing, at which size. */
const PNGS = [
  ["icon-512.png", "icon.svg", 512],
  ["icon-192.png", "icon.svg", 192],
  ["apple-touch-icon.png", "icon.svg", 180],
  ["favicon-32.png", "icon-small.svg", 32],
  ["favicon-16.png", "icon-small.svg", 16],
];

async function pngs() {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  for (const [file, from, size] of PNGS) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.goto(new URL(from, out).href);
    await page.screenshot({ path: fileURLToPath(new URL(file, out)), omitBackground: true });
    await page.close();
  }
  await browser.close();
}

/** The picture for shared links: the mark, the name in the mark's two tones, one line. */
async function socialPreview() {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
  await page.setContent(`<!doctype html><style>
    html, body { margin: 0; height: 100%; }
    body { display: flex; align-items: center; justify-content: center; gap: 56px; background: #0c1117 linear-gradient(rgba(148, 163, 184, 0.045) 1px, transparent 1px) 0 0 / 100% 40px, #0c1117 linear-gradient(90deg, rgba(148, 163, 184, 0.045) 1px, transparent 1px) 0 0 / 40px 100%; background-color: #0c1117; font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; }
    svg { width: 300px; height: 300px; border-radius: 64px; box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6); }
    h1 { margin: 0 0 22px; font-size: 124px; line-height: 1; font-weight: 800; letter-spacing: -0.038em; color: #fdf3d8; }
    h1 span { color: #d9ae5c; }
    p { margin: 0; font-size: 33px; line-height: 1.3; color: #94a3b8; }
    small { display: block; margin-top: 30px; font: 300 22px/1 ui-monospace, "SF Mono", Menlo, Consolas, monospace; letter-spacing: 0.14em; text-transform: uppercase; color: #64748b; }
  </style>${icon(false)}<div><h1>Light<span>square</span></h1><p>A chessboard for the web that<br>stays smooth on every phone.</p><small>MIT &nbsp;/&nbsp; no dependencies &nbsp;/&nbsp; kibitzo</small></div>`);
  await page.screenshot({ path: fileURLToPath(new URL("social-preview.png", out)) });
  await browser.close();
}

mkdirSync(out, { recursive: true });
for (const file of readdirSync(out)) rmSync(new URL(file, out));
writeFileSync(new URL("icon.svg", out), icon(false));
writeFileSync(new URL("icon-small.svg", out), icon(true));
await pngs();
await socialPreview();
console.log(`docs/icons/: ${readdirSync(out).join(", ")}`);
