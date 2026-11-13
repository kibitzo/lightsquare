// Checks the npm package as a user of it would meet it, before it is published.
// It packs the library, unpacks the file into a small project of its own, and there:
//   1. the file holds only what it should (dist/, the README, the licence, the manifest);
//   2. every entry of "exports" names a file that is in it;
//   3. Node can import every script entry by the package's name, without a page (server rendering);
//   4. a TypeScript file that uses every entry compiles, with the library's own declarations checked,
//      under each way TypeScript finds modules: "bundler", "node16" and the old "node".
// Run after a build: npm run build && npm run check:package
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(`${root}package.json`, "utf8"));
const work = `${root}.tmp/check-package/`;
const home = `${work}node_modules/${manifest.name}/`;
const problems = [];
const check = (ok, text) => {
  if (!ok) problems.push(text);
};

rmSync(work, { recursive: true, force: true });
mkdirSync(home, { recursive: true });
// (--dry-run=false: inside "npm publish --dry-run" the setting is passed on, and the pack would write no file.)
const packed = execFileSync("npm", ["pack", "--silent", "--ignore-scripts", "--dry-run=false", "--pack-destination", work], { cwd: root, encoding: "utf8" }).trim().split("\n").pop();
const listing = execFileSync("tar", ["-tzf", work + packed], { encoding: "utf8" }).trim().split("\n").map((line) => line.replace(/^package\//, ""));
execFileSync("tar", ["-xzf", work + packed, "-C", home, "--strip-components=1"]);

// 1. What is in the file.
const stray = listing.filter((file) => !/^(dist\/|README\.md$|LICENSE$|package\.json$)/.test(file));
check(stray.length === 0, `files that do not belong in the package: ${stray.join(", ")}`);
check(listing.includes("LICENSE") && listing.includes("README.md"), "the licence or the README is missing");
// Only the package's own piece sets, Cburnett and Kibitzo: nothing of another set, and the Kibitzo set (CC BY 4.0) with its credit and its notice.
const sets = listing.filter((file) => file.startsWith("dist/pieces/")).sort();
check(sets.join() === "dist/pieces/cburnett.css,dist/pieces/kibitzo-NOTICE.md,dist/pieces/kibitzo.css", `dist/pieces/ holds ${sets.join(", ")} (rule 12)`);
const notOurs = listing.filter((file) => /staunty|piece-sets/i.test(file) || /staunty/i.test(readFileSync(home + file, "utf8")));
check(notOurs.length === 0, `a piece set that is not the package's own is in the package (rule 12): ${notOurs.join(", ")}`);
const kibitzoCss = existsSync(`${home}dist/pieces/kibitzo.css`) ? readFileSync(`${home}dist/pieces/kibitzo.css`, "utf8") : "";
check(/^\/\*! Kibitzo chess pieces, kibitzo\.com\. \(c\) 2026 Danubian Research AG\. Licence: CC BY 4\.0/.test(kibitzoCss), "dist/pieces/kibitzo.css does not begin with the credit of the set");
check(existsSync(`${home}dist/pieces/kibitzo-NOTICE.md`) && readFileSync(`${home}dist/pieces/kibitzo-NOTICE.md`, "utf8").includes("CC BY 4.0"), "the notice of the Kibitzo set is not in the package");

// 2. Every entry names a file in it.
const entries = Object.entries(manifest.exports).map(([name, target]) => ({ name, files: typeof target === "string" ? [target] : Object.values(target) }));
for (const { name, files } of entries) for (const file of files) check(existsSync(home + file), `"exports" ${name} names ${file}, which is not in the package`);
for (const field of ["main", "types"]) check(existsSync(home + manifest[field]), `"${field}" names ${manifest[field]}, which is not in the package`);
for (const [name, paths] of Object.entries(manifest.typesVersions?.["*"] ?? {})) for (const file of paths) check(existsSync(home + file), `"typesVersions" ${name} names ${file}, which is not in the package`);

// 3. Node imports every script entry by name, with no page. (React is found in the repository's own node_modules.)
const scripts = entries.filter(({ files }) => files.some((file) => file.endsWith(".js"))).map(({ name }) => manifest.name + name.slice(1));
writeFileSync(`${work}import.mjs`, `const out = {};\nfor (const name of ${JSON.stringify(scripts)}) out[name] = Object.keys(await import(name)).sort();\nconsole.log(JSON.stringify(out));\n`);
let exported = {};
try {
  exported = JSON.parse(execFileSync("node", [`${work}import.mjs`], { cwd: work, encoding: "utf8" }));
} catch (error) {
  problems.push(`Node could not import the package: ${String(error.stderr || error).trim().split("\n").slice(0, 6).join(" | ")}`);
}
for (const name of scripts) check((exported[name] ?? []).length > 0, `${name} exports nothing when imported in Node`);
check(typeof (await import(pathToFileURL(`${home}dist/index.js`).href)).lightsquare === "function", "the core does not export lightsquare()");

// 4. A TypeScript user of every entry.
const n = manifest.name;
writeFileSync(
  `${work}user.ts`,
  `import { lightsquare, START, EMPTY, type Board, type Change, type Module, type ModuleHooks, type Options, type Square, type UserMove } from "${n}";
import { shapes, type Arrow } from "${n}/shapes";
import { promotion } from "${n}/promotion";
import { overlay } from "${n}/overlay";
import { a11y } from "${n}/a11y";
import { premoveTargets } from "${n}/premove";
import { applyTheme, themes, themeVariables, type Theme } from "${n}/theme";
import { Lightsquare, type LightsquareProps } from "${n}/react";

const options: Options = {
  movable: "white",
  targets: new Map<Square, Square[]>([["e2", ["e3", "e4"]]]),
  onMove(move: UserMove): void {
    void move.from;
  },
  onChange(change: Change): void {
    void change.kind;
  },
};
export const board: Board = lightsquare(document.createElement("div"), options);
board.set({ position: START });
board.set({ position: EMPTY });
const arrow: Arrow = { from: "e2", to: "e4" };
export const drawn = board.use(shapes({ arrows: [arrow] }));
export type AnyModule = Module<ModuleHooks>;
export const theme: Theme | undefined = Object.values(themes)[0];
export const others = [promotion, overlay, a11y, premoveTargets, applyTheme, themeVariables, Lightsquare];
export type Props = LightsquareProps;
`,
);
const tsc = `${root}node_modules/typescript/bin/tsc`;
const ways = { bundler: { module: "ESNext", moduleResolution: "bundler" }, node16: { module: "Node16", moduleResolution: "Node16" }, node: { module: "ESNext", moduleResolution: "Node10", ignoreDeprecations: "5.0" } };
for (const [way, options] of Object.entries(ways)) {
  writeFileSync(`${work}package.json`, JSON.stringify({ name: "user", private: true, type: "module" }));
  writeFileSync(`${work}tsconfig.${way}.json`, JSON.stringify({ compilerOptions: { target: "ES2022", lib: ["ES2022", "DOM", "DOM.Iterable"], strict: true, noEmit: true, skipLibCheck: false, types: [], ...options }, files: ["user.ts"] }));
  try {
    execFileSync("node", [tsc, "-p", `${work}tsconfig.${way}.json`], { cwd: work, encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    problems.push(`TypeScript ("${way}") does not accept a user of the package:\n    ${String(error.stdout || error).trim().split("\n").slice(0, 8).join("\n    ")}`);
  }
}

const size = readFileSync(work + packed).length;
if (problems.length) {
  console.error(`The package is not fit to publish:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`${manifest.name} ${manifest.version}: ${listing.length} files, ${(size / 1024).toFixed(1)} kB packed; ${scripts.length} script entries import in Node; types hold under ${Object.keys(ways).join(", ")}.`);
