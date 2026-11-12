// The presentation page as plain files, for a static host (GitHub Pages):
//   node scripts/demo.mjs            writes site/
// It is the same page `npm run bench` serves, built once. A static host
// cannot take what a phone reports, so the page leaves those buttons out
// (config.json says `static`).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { files, made } from "../bench/server.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = `${root}site/`;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const [path, [file]] of Object.entries(files)) writeFileSync(out + (path === "/" ? "index.html" : path.slice(1)), readFileSync(root + file));
for (const [path, [make]] of Object.entries(made)) writeFileSync(out + path.slice(1), await make());
writeFileSync(`${out}config.json`, JSON.stringify({ static: true }));
// The notice of the second piece set goes where the set goes.
cpSync(`${root}bench/pieces/NOTICE.md`, `${out}pieces-staunty-NOTICE.md`);
cpSync(`${root}docs/icons/social-preview.png`, `${out}social-preview.png`);
// The design as one picture, linked from the page and from the README.
cpSync(`${root}docs/architecture.html`, `${out}architecture.html`);
// GitHub Pages runs Jekyll over a site unless told not to.
writeFileSync(`${out}.nojekyll`, "");
console.log("site/ written");
