// dist/: the core and each module as its own minified ESM file, the
// stylesheets, the type declarations. Prints the sizes.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const modules = ["shapes", "promotion", "overlay", "a11y", "premove"];
const common = { absWorkingDir: root, bundle: true, format: "esm", minify: true, target: "es2020" };

rmSync(`${root}dist`, { recursive: true, force: true });
mkdirSync(`${root}dist/pieces`, { recursive: true });

await build({ ...common, entryPoints: ["src/index.ts"], outfile: "dist/index.js" });
for (const name of modules) await build({ ...common, entryPoints: [`src/modules/${name}.ts`], outfile: `dist/modules/${name}.js` });
// The React wrapper imports the core file next to it instead of carrying a second copy.
await build({ ...common, entryPoints: ["src/react.ts"], outfile: "dist/react.js", external: ["react", "./index.js"] });
await build({ absWorkingDir: root, entryPoints: ["src/lightsquare.css"], minify: true, outfile: "dist/lightsquare.css" });
await build({ absWorkingDir: root, entryPoints: ["src/pieces/cburnett.css"], minify: true, outfile: "dist/pieces/cburnett.css" });
execFileSync("npx", ["tsc", "-p", "tsconfig.build.json", "--emitDeclarationOnly"], { cwd: root, stdio: "inherit" });

for (const file of ["index.js", ...modules.map((m) => `modules/${m}.js`), "react.js", "lightsquare.css", "pieces/cburnett.css"]) {
  const bytes = readFileSync(`${root}dist/${file}`);
  console.log(`${file.padEnd(22)} ${String(bytes.length).padStart(6)} B   gzip ${String(gzipSync(bytes, { level: 9 }).length).padStart(5)} B`);
}
