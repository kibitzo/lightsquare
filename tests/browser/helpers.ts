import { build } from "esbuild";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices, webkit, type Browser, type BrowserContextOptions, type BrowserType, type Page } from "playwright";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

/** Static server over the package, plus /lightsquare.js bundled from src. */
export async function serve(): Promise<{ server: Server; origin: string }> {
  const bundle = await build({ absWorkingDir: ROOT, entryPoints: ["src/index.ts"], bundle: true, format: "esm", target: "es2020", write: false });
  const js = bundle.outputFiles[0].text;
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]));
    if (path === "/lightsquare.js") return void res.writeHead(200, { "content-type": MIME[".js"] }).end(js);
    if (path.includes("..")) return void res.writeHead(403).end();
    try {
      const body = await readFile(join(ROOT, path));
      res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  return { server, origin: `http://127.0.0.1:${addr.port}` };
}

export interface Profile {
  name: string;
  engine: BrowserType;
  context: BrowserContextOptions;
  touch: boolean;
}

/**
 * The environments every browser test runs in. The two phone profiles are
 * desktop engines with a phone's viewport, pixel density, touch and user
 * agent: they catch engine and touch bugs, not a phone's speed. Speed on a
 * real phone is measured with bench/ (RULES.md, rule 11).
 */
export const PROFILES: Profile[] = [
  { name: "Chromium desktop", engine: chromium, context: { viewport: { width: 900, height: 700 } }, touch: false },
  { name: "Chromium as Pixel 7", engine: chromium, context: devices["Pixel 7"], touch: true },
  { name: "WebKit as iPhone 13", engine: webkit, context: devices["iPhone 13"], touch: true },
  { name: "WebKit desktop", engine: webkit, context: { viewport: { width: 900, height: 700 } }, touch: false },
];

/** Counters installed before any page script runs, to catch what the rules forbid. */
const PROBES = `
  window.P = { raf: 0, timers: 0, reads: 0 };
  for (const name of ["requestAnimationFrame", "setTimeout", "setInterval"]) {
    const real = window[name];
    window[name] = function (...args) { window.P[name === "requestAnimationFrame" ? "raf" : "timers"]++; return real.apply(this, args); };
  }
  for (const [proto, names] of [[Element.prototype, ["getBoundingClientRect", "getClientRects"]]]) {
    for (const name of names) {
      const real = proto[name];
      proto[name] = function (...args) { window.P.reads++; return real.apply(this, args); };
    }
  }
  for (const name of ["offsetWidth", "offsetHeight", "offsetLeft", "offsetTop", "clientWidth", "clientHeight"]) {
    const proto = name.startsWith("offset") ? HTMLElement.prototype : Element.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, name);
    if (d && d.get) Object.defineProperty(proto, name, { ...d, get() { window.P.reads++; return d.get.call(this); } });
  }
  { const real = window.getComputedStyle; window.getComputedStyle = function (...args) { window.P.reads++; return real.apply(this, args); }; }
  window.P.reset = () => { window.P.raf = 0; window.P.timers = 0; window.P.reads = 0; };
  window.P.watch = (root) => {
    const log = [];
    const observer = new MutationObserver((records) => { for (const r of records) log.push(r.type + ":" + (r.attributeName || (r.addedNodes.length ? "add" : "remove"))); });
    observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
    return { log, stop() { for (const r of observer.takeRecords()) log.push(r.type + ":" + (r.attributeName || (r.addedNodes.length ? "add" : "remove"))); observer.disconnect(); return log; } };
  };
`;

export async function open(profile: Profile, origin: string): Promise<{ browser: Browser; page: Page; errors: string[] }> {
  const browser = await profile.engine.launch();
  const context = await browser.newContext(profile.context);
  await context.addInitScript(PROBES);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`${origin}/tests/browser/fixture.html`);
  await page.waitForFunction("window.ready === true");
  return { browser, page, errors };
}

/** Wait until every slide and fade has ended and been cleaned up. */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction("T.settled()", undefined, { timeout: 5000 });
}

/** Rebuild the board from scratch for the next test, and let the browser draw it. */
export async function fresh(page: Page, options: Record<string, unknown> = {}): Promise<void> {
  await page.evaluate(async (o) => {
    const w = window as unknown as { T: { board: { destroy(): void } | null; make(o: unknown): void } };
    w.T.board?.destroy();
    w.T.make(o);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, options);
}

declare global {
  // The page-side helpers of fixture.html and the probes above.
  // eslint-disable-next-line no-var
  var T: {
    events: Array<Record<string, unknown>>;
    board: { set(o: unknown, how?: unknown): void; move(a: string, b: string): void; select(s: string | null): void; position(): string; playPremove(): boolean; use<M>(module: (surface: unknown) => M): M; destroy(): void };
    make(o?: unknown): void;
    set(o: unknown, how?: unknown): void;
    pieces(orientation?: string): Array<{ code: string; square: string; off: number }>;
    seen(orientation?: string): string;
    marks(orientation?: string): string[];
    coords(): string[];
    pieceAt(square: string, orientation?: string): HTMLElement | null;
    tag(square: string, name: string): void;
    tagAt(square: string, orientation?: string): string | null;
    point(square: string, orientation?: string): { x: number; y: number; size: number };
    pointer(type: string, x: number, y: number, kind?: string): void;
    settled(): boolean;
  };
  // eslint-disable-next-line no-var
  var P: { raf: number; timers: number; reads: number; reset(): void; watch(root: Element): { log: string[]; stop(): string[] } };
}
