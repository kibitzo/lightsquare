// The presentation page as plain files, for a static host (GitHub Pages):
//   node scripts/demo.mjs            writes site/
// It is the same page `npm run bench` serves, built once. A static host
// cannot take what a phone reports, so the page leaves those buttons out
// (config.json says `static`).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bundle, files } from "../bench/server.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = `${root}site/`;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const [path, [file]] of Object.entries(files)) writeFileSync(out + (path === "/" ? "index.html" : path.slice(1)), readFileSync(root + file));
writeFileSync(`${out}bench.js`, await bundle());
writeFileSync(`${out}config.json`, JSON.stringify({ extraPieces: false, static: true }));
writeFileSync(`${out}pieces-extra.css`, "");
cpSync(`${root}docs/icons/social-preview.png`, `${out}social-preview.png`);
// GitHub Pages runs Jekyll over a site unless told not to.
writeFileSync(`${out}.nojekyll`, "");
console.log(`site/ written: ${Object.keys(files).length + 5} files`);
