// Icon drafts in the notebook style: chess pieces as an ink study on
// parchment, in front of a circle in a square. Writes docs/icons/*.svg and
// the sheet docs/icons/options.html that shows them side by side.
//   node scripts/icons.mjs
// The pieces are the Cburnett shapes of assets/cburnett (BSD, see its NOTICE).
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const out = new URL("docs/icons/", root);
const INK = "#5a3719";
const PAPER = "#f1e3c0";

/**
 * The variants. Pieces are listed from the back to the front. `grow` makes
 * a piece taller about the middle of its base; `dx` moves it sideways, in
 * the piece's own units (a piece is 45 wide).
 */
const tall = { k: 1.08, q: 1.12, r: 1.16, b: 1.22, n: 1.12, p: 1.05 };
const NAMES = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
const list = (codes) => codes.map((c) => NAMES[c]).join(", ").replace(/, ([^,]*)$/, " and $1");
const capital = (text) => text[0].toUpperCase() + text.slice(1);

/** Pieces on one spot: the first, at the back, stands tall; the others a little smaller in front of it. */
const stacked = (codes) => codes.split("").map((p, i) => ({ p, grow: i === 0 ? tall[p] : p === "p" ? 0.92 : 0.97 }));
/** The same pieces spread sideways, so each one shows more of itself. */
const fanned = (codes, spread) => stacked(codes).map((piece, i, all) => ({ ...piece, dx: all.length === 1 ? 0 : (i === all.length - 1 && all.length > 2 ? 0 : (i % 2 ? 1 : -1) * spread) }));

const variant = (codes, how, why) => ({
  id: `${codes.split("").map((c) => NAMES[c]).join("-")}${how === "fanned" ? "-fanned" : ""}`,
  title: `${capital(list(codes.split("")))}${how === "fanned" ? ", fanned" : ""}`,
  why,
  pieces: how === "fanned" ? fanned(codes, codes.length > 2 ? 6.5 : 7) : how === "alone" ? [{ p: codes, grow: { k: 1.12, q: 1.2, r: 1.25, b: 1.25, n: 1.22, p: 1.3 }[codes] }] : stacked(codes),
});

/** The variants, in groups. Pieces are named from the back to the front. */
const GROUPS = [
  ["One piece", [
    variant("n", "alone", "One piece, drawn large. The easiest to read when the icon is tiny."),
    variant("b", "alone", "A single tall shape with a pointed top."),
    variant("p", "alone", "The smallest piece, alone on the page."),
    variant("k", "alone", "The cross on top makes it unmistakable."),
    variant("q", "alone", "The crown, alone."),
    variant("r", "alone", "A tower: the most geometric of the six."),
  ]],
  ["Two pieces", [
    variant("np", "stacked", "The pawn in front of the knight, on one spot."),
    variant("np", "fanned", "The knight to one side, the pawn in front of it to the other."),
    variant("bp", "stacked", "The plainest pair: one tall shape, one small one."),
    variant("bn", "stacked", "The two minor pieces, the knight in front."),
    variant("bn", "fanned", "Bishop and knight side by side."),
    variant("kp", "stacked", "The greatest and the least."),
    variant("kn", "stacked", "The king behind his knight."),
    variant("qn", "stacked", "The queen's crown behind the knight."),
    variant("qp", "stacked", "Queen and pawn: what the pawn may become."),
    variant("rn", "stacked", "A tower behind the knight."),
    variant("rp", "stacked", "A tower and a pawn."),
    variant("kq", "fanned", "King and queen side by side."),
  ]],
  ["Three pieces", [
    variant("bnp", "stacked", "A tall bishop behind, the knight and the pawn in front of it."),
    variant("bnp", "fanned", "The same three, spread a little."),
    variant("knp", "stacked", "The king's cross gives the shape its top."),
    variant("knp", "fanned", "King, knight and pawn, spread a little."),
    variant("qnp", "stacked", "The queen's crown behind the knight and the pawn."),
    variant("rnp", "stacked", "A tower behind the knight and the pawn."),
    variant("kbp", "stacked", "King, bishop and pawn: three pointed tops."),
    variant("rbp", "stacked", "Rook, bishop and pawn."),
    variant("qbn", "stacked", "Queen, bishop and knight: no pawn."),
    variant("kqp", "fanned", "King and queen with a pawn in front."),
  ]],
  ["More", [
    variant("kqnp", "stacked", "King, queen, knight and pawn."),
    variant("rbnp", "stacked", "Rook, bishop, knight and pawn."),
    { id: "all-six", title: "All six", why: "The whole set on one spot. The fullest, and the busiest.", pieces: "kqrbnp".split("").map((p) => ({ p })) },
  ]],
];
const VARIANTS = GROUPS.flatMap(([, variants]) => variants);

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

/** One piece of the study: an ink outline filled with paper, hatched on its right side. */
function drawn({ p, grow = 1, dx = 0 }) {
  const outline = piece(`w${p}`, INK, PAPER, 1);
  const hatching = piece(`b${p}`, "url(#hatch)", "none", 0.01);
  return `<g transform="translate(${22.5 + dx} 39.5) scale(${grow}) translate(-22.5 -39.5)"><g>${outline}</g><g mask="url(#shade)" opacity=".8">${hatching}</g></g>`;
}

function icon(variant) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
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
      <g stroke-width=".45" opacity=".42">
        <rect x="11" y="9" width="42" height="42"/>
        <circle cx="32" cy="30" r="21"/>
        <path d="M32 6v48M8 30h48" stroke-width=".3"/>
      </g>
      <path d="M44 58.200c.8-.9 1.300.9 2.100 0s1.200.9 2 0 1.300.9 2.100 0 1.200.9 2 0 1.300.9 2.100 0" stroke-width=".4" opacity=".5"/>
      <path d="M7 54.200h50" stroke-width=".6" opacity=".7"/>
    </g>
    <g transform="translate(7.200 9.300) scale(1.1)">${variant.pieces.map(drawn).join("")}</g>
  </g>
</svg>
`;
}

function sheet() {
  let number = 0;
  const card = (v) => {
    const file = `study-${v.id}.svg`;
    const sizes = (tone) => `<div class="row ${tone}">${[112, 56, 32, 16].map((s) => `<img src="${file}" width="${s}" height="${s}" alt="">`).join("")}</div>`;
    return `<div class="card"><h3>${++number}. ${v.title}</h3><p>${v.why}</p>${sizes("dark")}${sizes("light")}</div>`;
  };
  const sections = GROUPS.map(([heading, variants]) => `<h2>${heading}</h2>\n<div class="grid">\n${variants.map(card).join("\n")}\n</div>`).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lightsquare: icon options</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 28px; background: #0c1117; color: #cbd5e1; font: 15px/1.45 -apple-system, system-ui, "Segoe UI", sans-serif; }
  h1 { margin: 0 0 4px; font-size: 22px; color: #f59e0b; }
  h2 { margin: 30px 0 12px; font-size: 13px; letter-spacing: 0.09em; text-transform: uppercase; color: #f59e0b; }
  p.lead { margin: 0; color: #94a3b8; max-width: 72ch; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(268px, 1fr)); gap: 14px; }
  .card { border: 1px solid rgba(148, 163, 184, 0.16); border-radius: 16px; overflow: hidden; background: rgba(148, 163, 184, 0.04); }
  .card h3 { margin: 0; padding: 12px 14px 2px; font-size: 15px; color: #f8fafc; }
  .card p { margin: 0; padding: 0 14px 10px; font-size: 13px; color: #94a3b8; min-height: 3.1em; }
  .row { display: flex; align-items: center; gap: 14px; padding: 12px 14px; }
  .row.dark { background: #0c1117; }
  .row.light { background: #f8fafc; }
  .row img { display: block; }
</style>
</head>
<body>
<h1>Lightsquare: icon options</h1>
<p class="lead">One style, the notebook study, with ${VARIANTS.length} different choices of pieces. Each at 112, 56, 32 and 16 pixels, on our dark page and on white. Tell me the numbers you like.</p>
${sections}
</body>
</html>
`;
}

mkdirSync(out, { recursive: true });
for (const file of readdirSync(out)) if (file.endsWith(".svg") || file === "options.html") rmSync(new URL(file, out));
for (const variant of VARIANTS) writeFileSync(new URL(`study-${variant.id}.svg`, out), icon(variant));
writeFileSync(new URL("options.html", out), sheet());
console.log(`${VARIANTS.length} icons and the sheet written to docs/icons/`);
