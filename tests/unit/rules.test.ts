/**
 * RULES.md, enforced. These read the source and the built bundle, so a rule
 * cannot be broken quietly.
 */
import { build } from "esbuild";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
/** The core: everything in src/ except the React wrapper. Modules live in src/modules/. */
const files = readdirSync(`${root}src`).filter((f) => f.endsWith(".ts") && f !== "react.ts");
const source = Object.fromEntries(files.map((f) => [f, readFileSync(`${root}src/${f}`, "utf8")]));
const code = Object.values(source).join("\n");
const moduleFiles = readdirSync(`${root}src/modules`).filter((f) => f.endsWith(".ts"));
const modules = Object.fromEntries(moduleFiles.map((f) => [f, readFileSync(`${root}src/modules/${f}`, "utf8")]));
const moduleCode = Object.values(modules).join("\n") + readFileSync(`${root}src/react.ts`, "utf8");
const css = readFileSync(`${root}src/lightsquare.css`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const count = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length;

describe("RULES.md", () => {
  it("rule 2: no animation loop and no timers in the core", () => {
    expect(count(code, /requestAnimationFrame|setInterval|setTimeout|\.animate\(/g)).toBe(0);
  });

  it("rule 3: the stylesheet has no keyframes and no infinite animation", () => {
    expect(count(css, /@keyframes|animation\s*:|infinite/g)).toBe(0);
  });

  it("rules 1 and 4: script places things with transform only, pieces in percent", () => {
    expect(count(code, /\.style\.(left|top|width|height|right|bottom|margin|padding)/g)).toBe(0);
    expect(source["board.ts"]).toContain("translate(${col * 12.5}cqw,${row * 12.5}cqw)");
    expect(source["board.ts"]).toContain("translate(${col * 100}%,${row * 100}%)");
  });

  it("rule 1: the stylesheet transitions transform and opacity, nothing else", () => {
    const transitions = [...css.matchAll(/transition\s*:\s*([^;]+);/g)].flatMap((m) => m[1].split(",").map((part) => part.trim().split(/\s+/)[0]));
    expect(transitions.length).toBeGreaterThan(0);
    for (const property of transitions) expect(["transform", "opacity", "none"]).toContain(property);
  });

  it("nothing is placed with a transform and then scaled or turned by a separate property", () => {
    // `scale` and `rotate` multiply the translate that puts a piece on its square.
    expect(count(css, /(^|[;{\s])(scale|rotate|translate)\s*:/g)).toBe(0);
  });

  it("no will-change at rest: only a dragged piece asks for a layer", () => {
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*will-change[^{}]*)\}/g)].map((m) => m[1].trim());
    expect(rules).toEqual([".ls-piece.ls-dragging"]);
  });

  it("rule 6: one set of listeners, on the board, not per piece or square", () => {
    expect(count(source["input.ts"], /addEventListener\(/g)).toBe(4);
    expect(count(source["pieces.ts"], /addEventListener\(/g)).toBe(1);
    expect(count(code, /addEventListener\(/g)).toBe(5);
  });

  it("rules 6 and 8: the board is measured in exactly one place, at pointer down", () => {
    expect(count(code, /getBoundingClientRect|getClientRects/g)).toBe(1);
    expect(source["input.ts"]).toMatch(/function down\([^)]*\): void \{[\s\S]{0,200}getBoundingClientRect/);
    expect(count(code, /offset(Width|Height|Left|Top)|client(Width|Height)|getComputedStyle|scroll(Width|Height|Top|Left)/g)).toBe(0);
  });

  it("rule 9: no imports from outside the package; React is wanted only by the React wrapper", () => {
    const imports = [...code.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const from of imports) expect(from.startsWith("./")).toBe(true);
    for (const text of Object.values(modules)) {
      for (const [, from] of text.matchAll(/^import[^;]*from\s+"([^"]+)"/gm)) expect(from.startsWith("../")).toBe(true);
    }
    const pkg = JSON.parse(readFileSync(`${root}package.json`, "utf8"));
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(Object.keys(pkg.peerDependencies ?? {})).toEqual(["react"]);
    expect(pkg.peerDependenciesMeta).toEqual({ react: { optional: true } });
  });

  it("the modules obey the same rules: no timers, no animation loop, transform only", () => {
    expect(count(moduleCode, /requestAnimationFrame|setInterval|setTimeout|\.animate\(/g)).toBe(0);
    expect(count(moduleCode, /\.style\.(left|top|width|height|right|bottom|margin|padding)/g)).toBe(0);
    expect(count(moduleCode, /offset(Width|Height|Left|Top)|client(Width|Height)|getComputedStyle|scroll(Width|Height|Top|Left)/g)).toBe(0);
  });

  it("a module measures the board at most once per press, and only the drawing pen does", () => {
    expect(count(moduleCode, /getBoundingClientRect|getClientRects/g)).toBe(1);
    expect(modules["shapes.ts"]).toMatch(/function down\([^)]*\): void \{[\s\S]{0,400}getBoundingClientRect/);
  });

  it("the modules import only types from the core, so each one stands alone", () => {
    for (const name of ["shapes.ts", "promotion.ts", "overlay.ts", "a11y.ts"]) {
      const imports = [...modules[name].matchAll(/^import\s+(type\s+)?[^;]+;/gm)];
      expect(imports.length).toBe(1);
      expect(imports[0][1]).toBe("type ");
    }
  });

  it("each module stays small", async () => {
    const limit: Record<string, number> = { "shapes.ts": 2200, "promotion.ts": 1000, "overlay.ts": 700, "a11y.ts": 1700, "premove.ts": 1100, "theme.ts": 900 };
    for (const [name, bytes] of Object.entries(limit)) {
      const out = await build({ absWorkingDir: root, entryPoints: [`src/modules/${name}`], bundle: true, format: "esm", minify: true, target: "es2020", write: false });
      expect(gzipSync(out.outputFiles[0].contents, { level: 9 }).length, name).toBeLessThan(bytes);
    }
  });

  it("rule 10: the core is under 6 kB minified and gzipped", async () => {
    const out = await build({ absWorkingDir: root, entryPoints: ["src/index.ts"], bundle: true, format: "esm", minify: true, target: "es2020", write: false });
    const gzipped = gzipSync(out.outputFiles[0].contents, { level: 9 }).length;
    expect(gzipped).toBeLessThan(6 * 1024);
  });

  it("rule 12: nothing borrowed from GPL boards", () => {
    const everything = code + moduleCode + css;
    expect(count(everything, /chessground|cg-wrap|cg-board|cg-container/gi)).toBe(0);
  });
});
