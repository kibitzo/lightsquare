// Turns a cm-chessboard piece sprite (one SVG with <g id="wk"> ... <g id="bp">)
// into a Lightsquare piece stylesheet, so a site that moves over from
// cm-chessboard keeps its pieces.
//   node scripts/sprite-to-css.mjs sprite.svg pieces.css
// The licence of the pictures stays what it was: check it before you publish.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CODES = ["wk", "wq", "wr", "wb", "wn", "wp", "bk", "bq", "br", "bb", "bn", "bp"];

/** The whole <g id="..."> element, nested groups included. */
function group(svg, id) {
  const start = svg.indexOf(`<g id="${id}"`);
  if (start < 0) throw new Error(`sprite has no <g id="${id}">`);
  const tags = /<g[\s>]|<\/g>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let m = tags.exec(svg); m; m = tags.exec(svg)) {
    depth += m[0] === "</g>" ? -1 : 1;
    if (depth === 0) return svg.slice(start, m.index + 4);
  }
  throw new Error(`<g id="${id}"> is not closed`);
}

export function spriteToCss(svg) {
  const box = /viewBox="([^"]+)"/.exec(svg)?.[1];
  if (!box) throw new Error("sprite has no viewBox");
  const defs = /<defs[\s\S]*?<\/defs>/.exec(svg)?.[0] ?? "";
  return CODES.map((code) => {
    const picture = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">${defs}${group(svg, code)}</svg>`.replace(/>\s+</g, "><").replace(/\s+/g, " ");
    const uri = encodeURIComponent(picture).replace(/%20/g, " ").replace(/%3D/g, "=").replace(/%3A/g, ":").replace(/%2F/g, "/").replace(/%2C/g, ",");
    return `.ls-${code} { background-image: url("data:image/svg+xml,${uri}"); }`;
  }).join("\n") + "\n";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [from, to] = process.argv.slice(2);
  if (!from || !to) throw new Error("usage: node scripts/sprite-to-css.mjs sprite.svg pieces.css");
  const css = spriteToCss(readFileSync(from, "utf8"));
  writeFileSync(to, css);
  console.log(`${to} ${css.length} bytes`);
}
