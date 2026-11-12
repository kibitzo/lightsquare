// dist/: one minified ESM file, the stylesheets, the type declarations.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
rmSync(`${root}dist`, { recursive: true, force: true });
mkdirSync(`${root}dist/pieces`, { recursive: true });

await build({ absWorkingDir: root, entryPoints: ["src/index.ts"], bundle: true, format: "esm", minify: true, target: "es2020", outfile: "dist/index.js" });
await build({ absWorkingDir: root, entryPoints: ["src/lightsquare.css"], minify: true, outfile: "dist/lightsquare.css" });
await build({ absWorkingDir: root, entryPoints: ["src/pieces/cburnett.css"], minify: true, outfile: "dist/pieces/cburnett.css" });
execFileSync("npx", ["tsc", "-p", "tsconfig.build.json", "--emitDeclarationOnly"], { cwd: root, stdio: "inherit" });

for (const file of ["index.js", "lightsquare.css", "pieces/cburnett.css"]) {
  const bytes = readFileSync(`${root}dist/${file}`);
  console.log(`${file.padEnd(22)} ${String(bytes.length).padStart(6)} B   gzip ${String(gzipSync(bytes, { level: 9 }).length).padStart(5)} B`);
}
