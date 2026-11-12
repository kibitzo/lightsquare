// Measures Lightsquare next to other chessboards, each driven the same way
// in the same browser, and writes the numbers to results.json and
// RESULTS.md in this folder.
//   npm run measure      (in compare/; see README.md)
// Lightsquare is measured as it is built (../dist), the other boards as
// they are published on npm. The method and its limits are written into
// RESULTS.md by this script.
import { Chess } from "chess.js";
import { build } from "esbuild";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { cpus } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { chromium, devices } from "playwright";

const here = fileURLToPath(new URL("./", import.meta.url));
const root = fileURLToPath(new URL("../", import.meta.url));
if (!existsSync(`${root}dist/index.js`)) {
  console.error("Lightsquare is not built: run `npm run build` at the top of the repository, or `npm run measure` here, which does it.");
  process.exit(1);
}
const version = (name) => JSON.parse(readFileSync(`${here}node_modules/${name}/package.json`, "utf8")).version;

/**
 * The boards, in the order of the report. `also` are the parts a board needs
 * for arrows, drawing by the user and premove: null when its one file has
 * them, false when it does not offer them. `needs` is what a board cannot
 * run without; `outside` of that is not counted in its size, because an app
 * that picks the board has it already.
 */
const LIBS = [
  { id: "lightsquare", name: "Lightsquare", version: JSON.parse(readFileSync(`${root}package.json`, "utf8")).version, licence: "MIT", entry: `export * from "../dist/index.js"`, also: `export * from "../dist/index.js"; export * from "../dist/modules/shapes.js"; export * from "../dist/modules/premove.js"`, css: ["dist/lightsquare.css"] },
  { id: "chessground", name: "chessground (Lichess)", version: version("@lichess-org/chessground"), licence: "GPL-3.0", entry: `export { Chessground } from "@lichess-org/chessground"`, also: null, css: ["compare/node_modules/@lichess-org/chessground/assets/chessground.base.css", "compare/node_modules/@lichess-org/chessground/assets/chessground.brown.css"] },
  { id: "cm-chessboard", name: "cm-chessboard", version: version("cm-chessboard"), licence: "MIT", entry: `export { Chessboard } from "cm-chessboard/src/Chessboard.js"`, also: `export { Chessboard } from "cm-chessboard/src/Chessboard.js"; export { Markers } from "cm-chessboard/src/extensions/markers/Markers.js"; export { Arrows } from "cm-chessboard/src/extensions/arrows/Arrows.js"; export { RightClickAnnotator } from "cm-chessboard/src/extensions/right-click-annotator/RightClickAnnotator.js"`, css: ["compare/node_modules/cm-chessboard/assets/chessboard.css"] },
  { id: "react-chessboard", name: "react-chessboard", version: version("react-chessboard"), licence: "MIT", needs: `React ${version("react")}`, outside: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"], entry: `export { Chessboard } from "react-chessboard"`, also: null, css: [] },
  { id: "chessboardjs", name: "chessboard.js", version: version("@chrisoakman/chessboardjs"), licence: "MIT", needs: `jQuery ${version("jquery")}`, entry: `import "./adapters/jquery-global.ts"; import "@chrisoakman/chessboardjs/dist/chessboard-1.0.0.js"`, also: false, css: ["compare/node_modules/@chrisoakman/chessboardjs/dist/chessboard-1.0.0.css"] },
];

const SLIDE_MS = 200;
const RUNS = 3;
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
const OPERA = "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#".split(" ");
/** The positions of the Opera game, after each move. */
const GAME = (() => {
  const chess = new Chess();
  return OPERA.map((san) => (chess.move(san), chess.fen().split(" ")[0]));
})();

/** One long slide for the "script is frozen" row: a queen alone crosses the board from a1 to h8. */
const LONG_SLIDE = { from: "4k3/8/8/8/8/8/8/Q3K3", to: "4k2Q/8/8/8/8/8/8/4K3" };

const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
const round = (n, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;
const gz = (bytes) => gzipSync(bytes, { level: 9 }).length;

/** One file out of an entry. Libraries that ask for it get their production build, as an app would ship them. */
async function bundle(contents, minify = true, external = []) {
  const out = await build({ stdin: { contents, resolveDir: here, loader: "ts" }, bundle: true, format: "esm", minify, external, define: { "process.env.NODE_ENV": '"production"' }, target: "es2020", write: false, logLevel: "silent" });
  return out.outputFiles[0].contents;
}

async function sizes(lib) {
  const css = Buffer.concat(lib.css.map((file) => readFileSync(root + file)));
  const minCss = (await build({ stdin: { contents: css.toString(), loader: "css" }, minify: true, write: false, logLevel: "silent" })).outputFiles[0].contents;
  // jsWith: a size, null when the one file has those parts already, false when the board does not offer them. css: null when the board has no stylesheet.
  return { js: gz(await bundle(lib.entry, true, lib.outside)), jsWith: lib.also ? gz(await bundle(lib.also, true, lib.outside)) : lib.also, css: lib.css.length ? gz(minCss) : null };
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

async function serve() {
  const adapters = new Map();
  for (const lib of LIBS) adapters.set(`/compare/${lib.id}.js`, Buffer.from(await bundle(`export * from "./adapters/${lib.id}.ts"`, false)));
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]));
    if (adapters.has(path)) return void res.writeHead(200, { "content-type": MIME[".js"] }).end(adapters.get(path));
    if (path.includes("..")) return void res.writeHead(403).end();
    try {
      const file = path.startsWith("/compare/") ? join(here, path.slice(9)) : join(root, path);
      res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" }).end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

/** Counters installed before any page script runs. */
const PROBES = `
  window.P = { raf: 0, timers: 0, reads: 0 };
  for (const name of ["requestAnimationFrame", "setTimeout", "setInterval"]) {
    const real = window[name];
    window[name] = function (...args) { if (!window.P.off) window.P[name === "requestAnimationFrame" ? "raf" : "timers"]++; return real.apply(this, args); };
  }
  for (const name of ["getBoundingClientRect", "getClientRects"]) {
    const real = Element.prototype[name];
    Element.prototype[name] = function (...args) { window.P.reads++; return real.apply(this, args); };
  }
  for (const name of ["offsetWidth", "offsetHeight", "offsetLeft", "offsetTop", "clientWidth", "clientHeight"]) {
    const proto = name.startsWith("offset") ? HTMLElement.prototype : Element.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, name);
    if (d && d.get) Object.defineProperty(proto, name, { ...d, get() { window.P.reads++; return d.get.call(this); } });
  }
  window.P.reset = () => { window.P.raf = 0; window.P.timers = 0; window.P.reads = 0; };
  window.P.watch = () => {
    let count = 0;
    const observer = new MutationObserver((records) => (count += records.length));
    observer.observe(document.getElementById("board"), { subtree: true, childList: true, attributes: true, characterData: true });
    return () => { count += observer.takeRecords().length; observer.disconnect(); return count; };
  };
`;

async function open(browser, origin, lib, setup = { fen: START, ms: SLIDE_MS }) {
  const context = await browser.newContext(devices["Pixel 7"]);
  await context.addInitScript(PROBES);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${origin}/compare/page.html?lib=${lib.id}`);
  await page.waitForFunction("window.ready === true");
  await page.evaluate((s) => window.make(s), setup);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  return { context, page, cdp, errors };
}

async function metrics(cdp) {
  const { metrics: list } = await cdp.send("Performance.getMetrics");
  return Object.fromEntries(list.map((m) => [m.name, m.value]));
}

/**
 * Rendering work after the page's own script, style and layout, in ms, by
 * where it is done. A count of paints alone does not compare boards: a board
 * that keeps every piece on a layer of its own paints less often and pays
 * for it in compositing on every frame.
 */
const RENDER = {
  paint: /^Paint$/,
  raster: /^RasterTask$/,
  composite: /^(Layerize|ProxyImpl::ReadyToCommit|ProxyImpl::ScheduledActionDraw)$/,
};

async function traced(browser, page, run) {
  await browser.startTracing(page, { categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "cc"] });
  await run();
  const events = JSON.parse((await browser.stopTracing()).toString()).traceEvents;
  const counts = { Paint: 0, Layout: 0, UpdateLayoutTree: 0, FireAnimationFrame: 0, TimerFire: 0, FunctionCall: 0 };
  for (const e of events) if (e.name in counts && e.ph !== "E") counts[e.name]++;
  const ms = Object.fromEntries(Object.entries(RENDER).map(([key, name]) => [key, events.filter((e) => e.ph === "X" && name.test(e.name)).reduce((t, e) => t + e.dur, 0) / 1000]));
  return { ...counts, ms };
}

/** At rest for two seconds: what the browser still does. */
async function atRest(browser, origin, lib) {
  const { context, page } = await open(browser, origin, lib);
  await page.waitForTimeout(800);
  const elements = await page.evaluate(() => document.querySelectorAll("#board *").length);
  const counts = await traced(browser, page, () => page.waitForTimeout(2000));
  await context.close();
  return { elements, paints: counts.Paint, layouts: counts.Layout, styleRecalcs: counts.UpdateLayoutTree, frames: counts.FireAnimationFrame, timers: counts.TimerFire, scriptCalls: counts.FunctionCall };
}

/** One sliding move, averaged over the first 20 moves of the game. */
async function perMove(browser, origin, lib) {
  const { context, page, cdp } = await open(browser, origin, lib);
  await page.waitForTimeout(500);
  const rows = [];
  for (const fen of GAME.slice(0, 20)) {
    await page.evaluate(() => { P.reset(); window.stopWatch = P.watch(); });
    const before = await metrics(cdp);
    await page.evaluate((f) => void window.handle.set(f, true), fen);
    await page.waitForTimeout(SLIDE_MS + 250);
    const after = await metrics(cdp);
    const counted = await page.evaluate(() => ({ raf: P.raf, timers: P.timers, reads: P.reads, writes: window.stopWatch() }));
    rows.push({ ...counted, script: (after.ScriptDuration - before.ScriptDuration) * 1000, style: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000, layout: (after.LayoutDuration - before.LayoutDuration) * 1000, layouts: after.LayoutCount - before.LayoutCount, styles: after.RecalcStyleCount - before.RecalcStyleCount });
  }
  await page.evaluate((s) => window.make(s), { fen: START, ms: SLIDE_MS });
  const painted = await traced(browser, page, async () => {
    for (const fen of GAME.slice(0, 20)) {
      await page.evaluate((f) => void window.handle.set(f, true), fen);
      await page.waitForTimeout(SLIDE_MS + 250);
    }
  });
  await context.close();
  const mid = (key) => median(rows.map((r) => r[key]));
  return { frameCallbacks: mid("raf"), timers: mid("timers"), layoutReads: mid("reads"), domWrites: mid("writes"), scriptMs: round(mid("script")), styleAndLayoutMs: round(median(rows.map((r) => r.style + r.layout))), styleRecalcs: mid("styles"), layouts: mid("layouts"), paints: round(painted.Paint / 20, 1), paintMs: round(painted.ms.paint / 20), rasterMs: round(painted.ms.raster / 20), compositeMs: round(painted.ms.composite / 20) };
}

/** Pictures the browser still draws of a slide while the page's script is frozen for 600 ms. */
async function whileStuck(browser, origin, lib, framesBefore = 4) {
  const { context, page, cdp } = await open(browser, origin, lib, { fen: LONG_SLIDE.from, ms: 900 });
  await page.waitForTimeout(500);
  const frames = [];
  cdp.on("Page.screencastFrame", (frame) => {
    frames.push({ at: (frame.metadata.timestamp ?? 0) * 1000, data: frame.data });
    void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
  const stuck = await page.evaluate(
    ([fen, framesBefore]) =>
      new Promise((resolve) => {
        void window.handle.set(fen, true);
        const wait = (n, then) => (n ? requestAnimationFrame(() => wait(n - 1, then)) : then());
        wait(framesBefore, () => {
          const from = Date.now();
          const until = performance.now() + 600;
          while (performance.now() < until);
          resolve({ from, to: Date.now() });
        });
      }),
    [LONG_SLIDE.to, framesBefore],
  );
  await page.waitForTimeout(700);
  await cdp.send("Page.stopScreencast");
  await context.close();
  return new Set(frames.filter((f) => f.at > stuck.from + 30 && f.at < stuck.to - 30).map((f) => f.data)).size;
}

/** Pictures drawn of 12 sliding moves while the page's script is busy half of the time. */
async function whileBusy(browser, origin, lib) {
  const { context, page, cdp } = await open(browser, origin, lib);
  await page.waitForTimeout(500);
  const frames = new Set();
  cdp.on("Page.screencastFrame", (frame) => {
    frames.add(frame.data);
    void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
  await page.evaluate(async (fens) => {
    P.off = true;
    const busy = setInterval(() => {
      const until = performance.now() + 50;
      while (performance.now() < until);
    }, 100);
    for (const fen of fens) {
      void window.handle.set(fen, true);
      await new Promise((r) => setTimeout(r, 320));
    }
    clearInterval(busy);
  }, GAME.slice(0, 12));
  await page.waitForTimeout(300);
  await cdp.send("Page.stopScreencast");
  await context.close();
  return frames.size;
}

/** 300 positions shown without sliding, with the processor slowed six times: main-thread time for each. */
async function replay(browser, origin, lib) {
  const { context, page, cdp } = await open(browser, origin, lib);
  await page.waitForTimeout(500);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  const fens = Array.from({ length: 300 }, (_, i) => GAME[i % GAME.length]);
  const before = await metrics(cdp);
  const wall = await page.evaluate(async (list) => {
    const began = performance.now();
    for (const fen of list) await window.handle.set(fen, false);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return performance.now() - began;
  }, fens);
  const after = await metrics(cdp);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await context.close();
  const work = (after.ScriptDuration - before.ScriptDuration + after.RecalcStyleDuration - before.RecalcStyleDuration + after.LayoutDuration - before.LayoutDuration) * 1000;
  return { workMs: round(work / fens.length, 3), wallMs: round(wall / fens.length, 3) };
}

/** One piece dragged two squares with a real mouse, in 40 steps. */
async function drag(browser, origin, lib) {
  const { context, page, cdp } = await open(browser, origin, lib);
  await page.evaluate(() => window.handle.movable());
  await page.waitForTimeout(400);
  const box = await page.locator("#board").boundingBox();
  const at = (col, row) => [box.x + (col + 0.5) * (box.width / 8), box.y + (row + 0.5) * (box.height / 8)];
  const [fx, fy] = at(4, 6);
  const [tx, ty] = at(4, 4);
  await page.mouse.move(fx, fy);
  await page.evaluate(() => { P.reset(); window.stopWatch = P.watch(); });
  const before = await metrics(cdp);
  await page.mouse.down();
  for (let i = 1; i <= 40; i++) await page.mouse.move(fx + ((tx - fx) * i) / 40 + Math.sin(i) * 6, fy + ((ty - fy) * i) / 40);
  await page.mouse.move(tx, ty);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await metrics(cdp);
  const counted = await page.evaluate(() => ({ raf: P.raf, reads: P.reads, writes: window.stopWatch() }));
  await context.close();
  return { scriptMs: round((after.ScriptDuration - before.ScriptDuration) * 1000), styleAndLayoutMs: round((after.RecalcStyleDuration - before.RecalcStyleDuration + after.LayoutDuration - before.LayoutDuration) * 1000), layoutReads: counted.reads, frameCallbacks: counted.raf, domWrites: counted.writes, moved: counted.writes > 0 };
}

/** Run a measurement RUNS times and keep, for every number, the middle one. */
async function steady(measure) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await measure());
  if (typeof runs[0] !== "object") return median(runs);
  return Object.fromEntries(Object.keys(runs[0]).map((key) => [key, typeof runs[0][key] === "number" ? median(runs.map((r) => r[key])) : runs[0][key]]));
}

const kB = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
/** A time too small to print is said to be so, not shown as zero. */
const ms = (digits) => (n) => (n < 10 ** -digits ? `under ${10 ** -digits} ms` : `${n.toFixed(digits)} ms`);
/**
 * The rows of the report: a heading, or a label, how to read a board's
 * number (null when the board has none), how to print it, which way is
 * better, and optionally a note for the page and what to print for "none".
 */
const ROWS = [
  "To download",
  ["Script, gzipped", (b) => b.size.js, kB, "low", { note: "the board as it ships, with what it cannot run without" }],
  ["Script with arrows, drawing by the user and premove", (b) => (b.size.jsWith === false ? null : b.size.jsWith ?? b.size.js), kB, "low", { note: "some boards need extra parts for these, some ship them in one file", none: "not offered" }],
  ["Styles, gzipped, without piece pictures", (b) => b.size.css, kB, "low", { none: "in the script" }],
  "At rest",
  ["Elements on the page (starting position, with coordinates)", (b) => b.atRest.elements, String, "low"],
  ["Paints, script calls, frames and timers in two seconds", (b) => b.atRest.paints + b.atRest.scriptCalls + b.atRest.frames + b.atRest.timers, String, "low"],
  "One sliding move (middle value of 20 moves)",
  ["Frames asked of the script", (b) => b.perMove.frameCallbacks, String, "low", { note: "how often the board's script must run during a slide" }],
  ["Writes to the page", (b) => b.perMove.domWrites, String, "low"],
  ["Layout reads", (b) => b.perMove.layoutReads, String, "low"],
  ["Script time", (b) => b.perMove.scriptMs, ms(2), "low"],
  ["Style and layout time", (b) => b.perMove.styleAndLayoutMs, ms(2), "low"],
  ["Paints", (b) => b.perMove.paints, (n) => n.toFixed(1), "low"],
  ["Paint time", (b) => b.perMove.paintMs, ms(2), "low"],
  ["Raster time, off the main thread", (b) => b.perMove.rasterMs, ms(2), "low", { note: "turning painted shapes into pixels" }],
  ["Compositing time: layers, commit, drawing", (b) => b.perMove.compositeMs, ms(2), "low", { note: "drawn in software here, so compare boards only" }],
  "When the page's script is not free",
  ["Pictures drawn of a 900 ms slide while the script is frozen for 600 ms", (b) => b.whileStuck, String, "high"],
  ["Pictures drawn of 12 moves while the script is busy half the time", (b) => b.whileBusy, String, "high", { note: "more means smoother" }],
  "A processor slowed six times",
  ["Main-thread work to show one position, no slide", (b) => b.replay.workMs, ms(3), "low"],
  "One piece dragged two squares with the mouse, in 42 steps",
  ["Script time", (b) => b.drag.scriptMs, ms(1), "low"],
  ["Style and layout time", (b) => b.drag.styleAndLayoutMs, ms(1), "low"],
  ["Layout reads", (b) => b.drag.layoutReads, String, "low"],
];

/** The report as data: every row with its printed cells and which of them are the best. The page shows exactly this. */
function table(results) {
  const boards = Object.values(results.boards);
  return ROWS.map((row) => {
    if (typeof row === "string") return { group: row };
    const [label, read, show, better, extra = {}] = row;
    const values = boards.map(read);
    const real = values.filter((v) => v !== null);
    const best = better === "low" ? Math.min(...real) : Math.max(...real);
    return { label, note: extra.note ?? "", cells: values.map((v) => ({ text: v === null ? extra.none ?? "none" : show(v), best: v !== null && v === best })) };
  });
}

const COUNT = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"];

/** RESULTS.md: the table, how it was measured, and what it cannot show. */
function report(results) {
  const boards = Object.values(results.boards);
  const lines = [`| | ${boards.map((b) => `${b.name} ${b.version}`).join(" | ")} |`, `|---|${boards.map(() => "---:").join("|")}|`, `| Licence | ${boards.map((b) => b.licence).join(" | ")} |`];
  /** Rows where Lightsquare does not have the best number: said in full, with who has it. */
  const behind = [];
  let heading = "";
  for (const row of table(results)) {
    if (row.group) {
      heading = row.group;
      lines.push(`| **${row.group}** | ${boards.map(() => "").join(" | ")} |`);
      continue;
    }
    const leaders = boards.filter((_, i) => row.cells[i].best);
    const all = leaders.length === boards.length;
    if (!row.cells[0].best) behind.push(`- **${heading.replace(/ \(.*\)$/, "")}, ${row.label[0].toLowerCase() + row.label.slice(1)}:** ${leaders.map((b) => b.name).join(" and ")} ${leaders.length > 1 ? "have" : "has"} ${row.cells[boards.indexOf(leaders[0])].text}, Lightsquare ${row.cells[0].text}.`);
    lines.push(`| ${row.label} | ${row.cells.map((c) => (c.best && !all ? `**${c.text}**` : c.text)).join(" | ")} |`);
  }
  const needs = boards.filter((b) => b.needs);
  return `# Lightsquare next to other boards

Measured ${results.date}. Written by \`npm run measure\` in \`compare/\`; do not edit by hand.

${COUNT[boards.length] ?? boards.length} boards show the same game in the same browser, each driven the same
way, and the browser's own counters are read. The best number in each row is
in bold; where every board has the same number, none is.

${lines.join("\n")}

## Where another board is ahead

${behind.length ? behind.join("\n") : "In this run, nowhere."}

## How it was measured

- **Browser:** ${results.browser}.
- **Machine:** ${results.machine}.
- **Same conditions:** every board gets the same 400 by 400 pixel box, the
  starting position with coordinates, a ${results.slideMs} ms slide, and the first moves of
  Morphy's Opera game. Everything else is the board's own default.
- **The frozen-script row** uses one long slide: a queen alone on the
  board goes from a1 to h8 in 900 ms, and the page's script is frozen for
  600 ms of it. (Before 2026-11-12 this row removed a pawn instead of
  sliding a piece, so it showed a fade, not a slide. The numbers for the
  boards measured then came out the same with a real slide.)
- **Each number** is the middle one of ${results.runs} runs.
- **Counters:** script, style and layout time and counts come from the
  browser's performance metrics; paints and the times of painting,
  rastering and compositing from its trace (compositing is the layer
  update, the commit and the drawing of each frame); frames asked of the
  script, timers, layout reads and writes to the page from counters placed
  in the page before the board loads. "Pictures drawn" are the distinct
  frames the browser sent to a screen recording.
- **What is measured:** Lightsquare as it is built for npm (\`dist/\`), the
  other boards as they are published on npm.
- **Sizes** are each board's public entry point bundled alone and minified
  with esbuild, then gzipped. chessground ships arrows, drawing and premove
  in its one file; for Lightsquare and cm-chessboard the second size row
  adds the parts that do the same (cm-chessboard has no premove).
  react-chessboard has arrows and drawing in its one file and no premove;
  its styles are written by its script, so it has no stylesheet.
  chessboard.js offers none of the three.
- **What a board cannot run without:** ${needs.length ? needs.map((b) => `${b.name} needs ${b.needs}`).join("; ") : "nothing"}. jQuery is counted in the size of chessboard.js, since
  few apps have it otherwise. React is not counted in the size of
  react-chessboard, since an app that picks it has React already; the drag
  library it brings along is counted. React runs in its production build,
  and every change of the position is one React update, as when an app
  sets its state.
  The time React spends is counted as the board's script time, because
  whoever uses the board pays it.
- **Piece pictures:** each board shows its own default set. chessboard.js
  has none in its npm package and is given the Cburnett set, which is the
  one its own site uses.
- **The code** is in this folder: \`run.mjs\` and one small adapter per
  board in \`adapters/\`.

## What this does not show

- **It is not a phone.** These numbers come from a desktop computer. The
  rows "while the script is frozen" and "busy half the time" stand in for a
  phone that holds a page's script back, as phones do in Low Power Mode.
  They are not a measurement of one. How a board feels on a real phone is
  judged on a real phone.
- **One browser engine.** The counters used here exist only in Chromium.
- **No real graphics chip.** Headless Chromium draws in software, so the
  compositing times are larger than on a device; compare them between
  boards, not with a phone.
- **One machine, one day.** Times in milliseconds will differ elsewhere;
  the counts (frames, writes, pictures) should not.
- **Defaults.** Each board runs as it comes. A board tuned by hand may do
  better than its row here.

This folder is a project of its own. The other boards are installed only
here (\`compare/package.json\`); Lightsquare's own manifest, scripts and tests
do not know them, and nothing of them is part of Lightsquare or of its npm
package.
`;
}

// --sizes: measure only the download sizes again (they change with every edit of the source) and rewrite the report.
if (process.argv.includes("--sizes")) {
  const results = JSON.parse(readFileSync(`${here}results.json`, "utf8"));
  for (const lib of LIBS) results.boards[lib.id].size = await sizes(lib);
  results.table = table(results);
  writeFileSync(`${here}results.json`, `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(`${here}RESULTS.md`, report(results));
  console.log(LIBS.map((lib) => `${lib.name} ${kB(results.boards[lib.id].size.js)}`).join(", "));
  process.exit(0);
}

if (process.argv.includes("--report")) {
  writeFileSync(`${here}RESULTS.md`, report(JSON.parse(readFileSync(`${here}results.json`, "utf8"))));
  console.log("RESULTS.md written from results.json");
  process.exit(0);
}

// --stuck: how each board slides, to read the "script is frozen" row rightly: what the browser itself animates during a slide, and the pictures drawn when the freeze starts 4 or 15 frames after the move.
if (process.argv.includes("--stuck")) {
  const { server, origin } = await serve();
  const browser = await chromium.launch();
  for (const lib of LIBS) {
    const { context, page } = await open(browser, origin, lib, { fen: LONG_SLIDE.from, ms: 900 });
    await page.waitForTimeout(500);
    const running = await page.evaluate(async (fen) => {
      void window.handle.set(fen, true);
      await new Promise((r) => setTimeout(r, 300));
      return document.getAnimations().map((a) => `${a.constructor.name} of ${a.transitionProperty ?? a.animationName ?? "?"}`);
    }, LONG_SLIDE.to);
    await context.close();
    console.log(`${lib.name.padEnd(24)} animated by the browser: ${running.length ? [...new Set(running)].join(", ") : "nothing (script moves it)"}; pictures while frozen, freeze after 4 frames: ${await whileStuck(browser, origin, lib, 4)}, after 15 frames: ${await whileStuck(browser, origin, lib, 15)}`);
  }
  await browser.close();
  server.close();
  process.exit(0);
}

// --shots: a picture of every board in the middle of a slow slide and after it, in ../.tmp/compare/, to see that each one really shows what is measured.
if (process.argv.includes("--shots")) {
  const { mkdirSync } = await import("node:fs");
  mkdirSync(`${root}.tmp/compare`, { recursive: true });
  const { server, origin } = await serve();
  const browser = await chromium.launch();
  for (const lib of LIBS) {
    const { context, page, errors } = await open(browser, origin, lib, { fen: START, ms: 900 });
    await page.waitForTimeout(500);
    await page.evaluate((f) => void window.handle.set(f, true), GAME[0]);
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${root}.tmp/compare/${lib.id}-mid.png`, clip: { x: 0, y: 0, width: 400, height: 400 } });
    await page.waitForTimeout(900);
    for (const fen of GAME.slice(1, 9)) await page.evaluate((f) => window.handle.set(f, false), fen);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${root}.tmp/compare/${lib.id}-end.png`, clip: { x: 0, y: 0, width: 400, height: 400 } });
    console.log(`${lib.name}: ${errors.length ? errors.join("; ") : "no errors"}`);
    await context.close();
  }
  await browser.close();
  server.close();
  process.exit(0);
}

// --paints: where each board's rendering time goes, move by move, and a trial
// of Lightsquare with every piece on a layer of its own all the time (as
// chessground has it). A diagnosis tool, not part of the report.
if (process.argv.includes("--paints")) {
  const { server, origin } = await serve();
  const browser = await chromium.launch();
  const trial = { ...LIBS[0], name: "Lightsquare, trial: every piece on its own layer", style: "#board .ls-piece { will-change: transform; }" };
  for (const lib of [...LIBS, trial]) {
    const { context, page } = await open(browser, origin, lib);
    if (lib.style) await page.addStyleTag({ content: lib.style });
    await page.waitForTimeout(500);
    const seen = await traced(browser, page, async () => {
      for (const fen of GAME.slice(0, 10)) {
        await page.evaluate((f) => void window.handle.set(f, true), fen);
        await page.waitForTimeout(SLIDE_MS + 250);
      }
    });
    await context.close();
    const per = (n) => (n / 10).toFixed(2);
    console.log(`${lib.name.padEnd(48)} per move: ${per(seen.Paint)} paints, paint ${per(seen.ms.paint)} ms, raster ${per(seen.ms.raster)} ms, compositing ${per(seen.ms.composite)} ms`);
  }
  await browser.close();
  server.close();
  process.exit(0);
}

const { server, origin } = await serve();
const browser = await chromium.launch();
// --only <name>: measure one group again (atRest, perMove, whileStuck, whileBusy, replay or drag) and keep the rest of the last run.
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
const MEASURES = { atRest, perMove, whileStuck, whileBusy, replay, drag };
if (only && !(only in MEASURES)) {
  console.error(`--only takes one of: ${Object.keys(MEASURES).join(", ")}`);
  process.exit(1);
}
const last = only ? JSON.parse(readFileSync(`${here}results.json`, "utf8")) : null;
const results = { table: [], date: new Date().toISOString().slice(0, 10), browser: `Chromium ${browser.version()} (headless), phone profile (Pixel 7: 412 by 915, 2.6x, touch)`, machine: `${cpus()[0].model}, ${cpus().length} cores`, slideMs: SLIDE_MS, runs: RUNS, boards: {} };
for (const lib of LIBS) {
  process.stdout.write(`${lib.name} ${lib.version}: `);
  const board = { ...last?.boards[lib.id], name: lib.name, version: lib.version, licence: lib.licence, ...(lib.needs && { needs: lib.needs }), size: await sizes(lib) };
  for (const [key, measure] of Object.entries(MEASURES)) {
    if (only && key !== only) continue;
    board[key] = await steady(() => measure(browser, origin, lib));
    process.stdout.write(`${key} `);
  }
  results.boards[lib.id] = board;
  process.stdout.write("\n");
}
await browser.close();
server.close();
results.table = table(results);
writeFileSync(`${here}results.json`, `${JSON.stringify(results, null, 2)}\n`);
writeFileSync(`${here}RESULTS.md`, report(results));
console.log(`results written to compare/results.json and compare/RESULTS.md`);
