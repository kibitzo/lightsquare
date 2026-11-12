// Turns a cm-chessboard piece sprite (one SVG with <g id="wk"> ... <g id="bp">)
// into a Lightsquare piece set, so a site that moves over from
// cm-chessboard keeps its pieces.
//   node scripts/sprite-to-css.mjs sprite.svg pieces.css [name] [--default]
// The set applies to boards under an element with the class ls-set-<name>;
// with --default it also applies to the whole page.
// The licence of the pictures stays what it was: check it before you publish.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const CODES = ["wk", "wq", "wr", "wb", "wn", "wp", "bk", "bq", "br", "bb", "bn", "bp"];

/** An SVG as a CSS image. */
export function dataUri(svg) {
  const small = svg.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
  return `url("data:image/svg+xml,${encodeURIComponent(small).replace(/%20/g, " ").replace(/%3D/g, "=").replace(/%3A/g, ":").replace(/%2F/g, "/").replace(/%2C/g, ",")}")`;
}

/** A piece set: twelve CSS variables on a class. `images` maps "wk" ... "bp" to CSS images. */
export function pieceSet(name, images, isDefault = false) {
  const lines = CODES.map((code) => `  --ls-${code}: ${images[code]};`);
  return `${isDefault ? ":root,\n" : ""}.ls-set-${name} {\n${lines.join("\n")}\n}\n`;
}

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

export function spriteToCss(svg, name = "custom", isDefault = false) {
  const box = /viewBox="([^"]+)"/.exec(svg)?.[1];
  if (!box) throw new Error("sprite has no viewBox");
  const defs = /<defs[\s\S]*?<\/defs>/.exec(svg)?.[0] ?? "";
  const images = Object.fromEntries(CODES.map((code) => [code, dataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">${defs}${group(svg, code)}</svg>`)]));
  return pieceSet(name, images, isDefault);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const isDefault = args.includes("--default");
  const [from, to, name] = args.filter((a) => a !== "--default");
  if (!from || !to) throw new Error("usage: node scripts/sprite-to-css.mjs sprite.svg pieces.css [name] [--default]");
  const css = spriteToCss(readFileSync(from, "utf8"), name, isDefault);
  writeFileSync(to, css);
  console.log(`${to} ${css.length} bytes`);
}
