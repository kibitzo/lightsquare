/**
 * The speed rules of RULES.md as tests. They do not time anything on this
 * machine's fast processor and call it proof: they count the work the
 * board asks the browser to do, which is the same on every device, and
 * they run the processor-bound parts slowed down six times.
 *
 * What these cannot show is how a real phone feels in Low Power Mode.
 * That is measured with bench/ (rule 11).
 */
import { Chess } from "chess.js";
import type { Server } from "node:http";
import type { Browser, CDPSession, Page } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PROFILES, fresh, open, serve, settle } from "./helpers";

const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR";
const AFTER_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR";

/** Positions of one long random legal game, with the move that led to each. */
function game(plies: number): Array<{ fen: string; move: [string, string] }> {
  let seed = 11;
  const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const out: Array<{ fen: string; move: [string, string] }> = [];
  let chess = new Chess();
  while (out.length < plies) {
    if (chess.isGameOver()) chess = new Chess();
    const moves = chess.moves({ verbose: true });
    const move = moves[Math.floor(random() * moves.length)];
    chess.move(move);
    out.push({ fen: chess.fen().split(" ")[0], move: [move.from, move.to] });
  }
  return out;
}

let site: { server: Server; origin: string };
beforeAll(async () => {
  site = await serve();
});
afterAll(() => site.server.close());

describe.each(PROFILES)("work done in $name", (profile) => {
  let browser: Browser;
  let page: Page;
  let errors: string[];

  beforeAll(async () => {
    ({ browser, page, errors } = await open(profile, site.origin));
  });
  afterAll(() => browser.close());
  afterEach(() => {
    expect(errors).toEqual([]);
  });

  it("rule 3: a board at rest does nothing: no frames asked for, no timers, no writes, no animations", async () => {
    await fresh(page, { movable: "white", lastMove: ["e2", "e4"], check: "e8", position: AFTER_E4 });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      P.reset();
      (window as unknown as { W: unknown }).W = P.watch(document.getElementById("board")!);
    });
    await page.waitForTimeout(1500);
    const rest = await page.evaluate(() => ({ raf: P.raf, timers: P.timers, reads: P.reads, writes: (window as unknown as { W: { stop(): string[] } }).W.stop(), animations: document.getAnimations().length }));
    expect(rest).toEqual({ raf: 0, timers: 0, reads: 0, writes: [], animations: 0 });
  });

  it("rule 7: a move is five small writes, whatever the position", async () => {
    await fresh(page, { position: AFTER_E4, lastMove: ["e2", "e4"] });
    const log = await page.evaluate((fen) => {
      const watch = P.watch(document.getElementById("board")!);
      T.set({ position: fen, lastMove: ["e7", "e5"] });
      return watch.stop();
    }, AFTER_E5);
    expect(log.sort()).toEqual(["attributes:class", "attributes:style", "attributes:style", "attributes:style"]);
    await settle(page);
    const second = await page.evaluate(() => {
      const watch = P.watch(document.getElementById("board")!);
      T.set({ position: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R", lastMove: ["g1", "f3"] });
      return watch.stop();
    });
    expect(second.sort()).toEqual(["attributes:class", "attributes:class", "attributes:style", "attributes:style", "attributes:style"]);
  });

  it("rules 2 and 8: applying a position reads no layout, asks for no frame, starts no timer", async () => {
    await fresh(page);
    const counts = await page.evaluate((fens) => {
      P.reset();
      for (const fen of fens) T.set({ position: fen, lastMove: ["e2", "e4"], check: "e8" });
      T.set({ orientation: "black" });
      T.board.move("g1", "f3");
      return { raf: P.raf, timers: P.timers, reads: P.reads };
    }, [AFTER_E4, AFTER_E5]);
    expect(counts).toEqual({ raf: 0, timers: 0, reads: 0 });
  });

  it("rule 2: while a piece slides, no script runs and nothing is written", async () => {
    await fresh(page);
    await page.evaluate((fen) => {
      T.set({ position: fen, lastMove: ["e2", "e4"] });
      P.reset();
      const w = window as unknown as { W: unknown; ended: number };
      w.W = P.watch(document.getElementById("board")!);
      w.ended = 0;
      document.getElementById("board")!.addEventListener("transitionend", () => w.ended++, { once: true });
    }, AFTER_E4);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(1);
    await page.waitForTimeout(500);
    const slide = await page.evaluate(() => {
      const w = window as unknown as { W: { stop(): string[] }; ended: number };
      return { raf: P.raf, timers: P.timers, reads: P.reads, writes: w.W.stop(), ended: w.ended, animations: document.getAnimations().length };
    });
    expect(slide).toEqual({ raf: 0, timers: 0, reads: 0, writes: [], ended: 1, animations: 0 });
  });

  it("rules 6 and 8: a whole drag measures the board once, at pointer down", async () => {
    await fresh(page, { movable: "white", targets: { e2: ["e3", "e4"] } });
    const reads = await page.evaluate(() => {
      const from = T.point("e2");
      const to = T.point("e4");
      P.reset();
      T.pointer("pointerdown", from.x, from.y);
      for (let i = 1; i <= 40; i++) T.pointer("pointermove", from.x + ((to.x - from.x) * i) / 40, from.y + ((to.y - from.y) * i) / 40 + Math.sin(i) * 9);
      T.pointer("pointerup", to.x, to.y);
      return { reads: P.reads, raf: P.raf, timers: P.timers, moves: T.events.filter((e) => e.type === "move").length };
    });
    expect(reads).toEqual({ reads: 1, raf: 0, timers: 0, moves: 1 });
  });

  it("a drag writes the piece's transform once per pointer event and nothing else while over one square", async () => {
    await fresh(page, { movable: "white", targets: { e2: ["e3", "e4"] } });
    const log = await page.evaluate(() => {
      const from = T.point("e2");
      const to = T.point("e4");
      T.pointer("pointerdown", from.x, from.y);
      T.pointer("pointermove", to.x, to.y);
      const watch = P.watch(document.getElementById("board")!);
      for (let i = 0; i < 25; i++) T.pointer("pointermove", to.x + Math.cos(i) * 6, to.y + Math.sin(i) * 6);
      const writes = watch.stop();
      T.pointer("pointerup", to.x, to.y);
      return writes;
    });
    expect(log).toHaveLength(25);
    expect(new Set(log)).toEqual(new Set(["attributes:style"]));
  });

  it("the page holds one element per piece and per mark, and no more", async () => {
    await fresh(page, { movable: "white", lastMove: ["e2", "e4"], position: AFTER_E4 });
    const counts = await page.evaluate(() => {
      const host = document.getElementById("board")!;
      return { all: host.querySelectorAll("*").length, pieces: host.querySelectorAll(".ls-piece").length, marks: host.querySelectorAll(".ls-mark").length, layers: host.children.length };
    });
    expect(counts).toEqual({ all: 53, pieces: 32, marks: 2, layers: 3 });
    await page.evaluate(() => T.set({ coordinates: false }));
    expect(await page.evaluate(() => document.getElementById("board")!.querySelectorAll("*").length)).toBe(36);
  });

  it("300 moves of a game leave no element behind", async () => {
    const plies = game(300);
    await fresh(page);
    const result = await page.evaluate((list) => {
      for (const ply of list) T.set({ position: ply.fen, lastMove: ply.move });
      const host = document.getElementById("board")!;
      return { fen: T.board.position(), all: host.querySelectorAll("*").length, pieces: T.pieces().length };
    }, plies);
    await settle(page);
    const all = await page.evaluate(() => document.getElementById("board")!.querySelectorAll("*").length);
    expect(result.fen).toBe(plies[plies.length - 1].fen);
    expect(all).toBe(result.pieces + 2 + 3 + 16);
  });
});

describe("work measured inside Chromium", () => {
  const profile = PROFILES[1];
  let browser: Browser;
  let page: Page;
  let cdp: CDPSession;

  beforeAll(async () => {
    ({ browser, page } = await open(profile, site.origin));
    cdp = await page.context().newCDPSession(page);
  });
  afterAll(() => browser.close());

  /** Counts of the browser's work during `run`, and when (ms after the first one) it painted. */
  async function traced(run: () => Promise<void>): Promise<Record<string, number> & { paintedAt: number[] }> {
    await browser.startTracing(page, { categories: ["devtools.timeline", "disabled-by-default-devtools.timeline"] });
    await run();
    const events = JSON.parse((await browser.stopTracing()).toString()).traceEvents as Array<{ name: string; ph: string; ts: number }>;
    const counts: Record<string, number> = { Paint: 0, Layout: 0, UpdateLayoutTree: 0, FunctionCall: 0, TimerFire: 0, FireAnimationFrame: 0 };
    const paints: number[] = [];
    for (const e of events) {
      if (!(e.name in counts) || e.ph === "E") continue;
      counts[e.name]++;
      if (e.name === "Paint") paints.push(e.ts / 1000);
    }
    const first = Math.min(...paints);
    return Object.assign(counts, { paintedAt: paints.map((t) => Math.round(t - first)).sort((a, b) => a - b) }) as Record<string, number> & { paintedAt: number[] };
  }

  it("rule 3: at rest the browser paints nothing, lays out nothing, runs nothing", async () => {
    await fresh(page, { movable: "white", lastMove: ["e2", "e4"], check: "e8", position: AFTER_E4 });
    await page.waitForTimeout(500);
    const counts = await traced(async () => void (await page.waitForTimeout(2000)));
    expect(counts).toEqual({ Paint: 0, Layout: 0, UpdateLayoutTree: 0, FunctionCall: 0, TimerFire: 0, FireAnimationFrame: 0, paintedAt: [] });
  });

  it("a slide is painted when it starts and when it ends, not once per frame", async () => {
    await fresh(page);
    await page.waitForTimeout(300);
    const counts = await traced(async () => {
      await page.evaluate((fen) => T.set({ position: fen, lastMove: ["e2", "e4"] }), AFTER_E4);
      await page.waitForTimeout(700);
    });
    const slide = 180;
    expect(counts.paintedAt.filter((ms) => ms > 40 && ms < slide - 40), `painted at ${counts.paintedAt} ms`).toEqual([]);
    expect(counts.Paint).toBeLessThanOrEqual(6);
    expect(counts.Layout).toBeLessThanOrEqual(1);
    expect(counts.FireAnimationFrame).toBe(0);
    expect(counts.TimerFire).toBe(0);
  });

  /**
   * Start a 900 ms slide of the a-pawn's element, freeze the page's script
   * for 600 ms, and count the different pictures the browser still draws.
   */
  async function framesWhileStuck(drive: "transition" | "script loop"): Promise<number> {
    await fresh(page);
    await page.evaluate(() => document.getElementById("board")!.style.setProperty("--ls-move-ms", "900ms"));
    await page.waitForTimeout(300);
    const frames: Array<{ at: number; data: string }> = [];
    const onFrame = (frame: { metadata: { timestamp?: number }; data: string; sessionId: number }): void => {
      frames.push({ at: (frame.metadata.timestamp ?? 0) * 1000, data: frame.data });
      void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
    };
    cdp.on("Page.screencastFrame", onFrame);
    await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
    const stuck = await page.evaluate(
      ([how]) =>
        new Promise<{ from: number; to: number }>((resolve) => {
          if (how === "transition") T.set({ position: "rnbqkbnr/pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNR" });
          else {
            const el = T.pieceAt("a2")!;
            const began = performance.now();
            const step = (now: number): void => {
              const k = Math.min(1, (now - began) / 900);
              el.style.transform = `translate(${k * 700}%,600%)`;
              if (k < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          }
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const from = Date.now();
              const until = performance.now() + 600;
              while (performance.now() < until);
              resolve({ from, to: Date.now() });
            }),
          );
        }),
      [drive],
    );
    await page.waitForTimeout(600);
    await cdp.send("Page.stopScreencast");
    cdp.off("Page.screencastFrame", onFrame);
    expect(stuck.to - stuck.from).toBeGreaterThanOrEqual(590);
    return new Set(frames.filter((f) => f.at > stuck.from + 30 && f.at < stuck.to - 30).map((f) => f.data)).size;
  }

  it("a slide keeps moving while the page's script is stuck", async () => {
    expect(await framesWhileStuck("transition")).toBeGreaterThanOrEqual(20);
  });

  it("control: a slide driven from script, frame by frame, stands still while the script is stuck", async () => {
    expect(await framesWhileStuck("script loop")).toBeLessThanOrEqual(1);
  });

  it("rule 6: the board carries the listeners; pieces and marks carry none", async () => {
    await fresh(page, { movable: "white", lastMove: ["e2", "e4"], position: AFTER_E4 });
    const listeners = async (selector: string): Promise<string[]> => {
      const { result } = await cdp.send("Runtime.evaluate", { expression: `document.querySelector(${JSON.stringify(selector)})` });
      const found = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId! });
      return found.listeners.map((l) => l.type).sort();
    };
    expect(await listeners("#board")).toEqual(["pointercancel", "pointerdown", "pointermove", "pointerup"]);
    expect(await listeners(".ls-pieces")).toEqual(["transitionend"]);
    expect(await listeners(".ls-piece")).toEqual([]);
    expect(await listeners(".ls-mark")).toEqual([]);
    expect(await listeners(".ls-marks")).toEqual([]);
  });

  it("on a processor six times slower, a move costs well under one frame of script", async () => {
    const plies = game(400);
    await fresh(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    try {
      const times = await page.evaluate((list) => {
        const out: number[] = [];
        for (const ply of list) {
          const t = performance.now();
          T.set({ position: ply.fen, lastMove: ply.move });
          out.push(performance.now() - t);
        }
        return out.sort((a, b) => a - b);
      }, plies);
      const median = times[Math.floor(times.length / 2)];
      const p99 = times[Math.floor(times.length * 0.99)];
      expect(median).toBeLessThan(1);
      expect(p99).toBeLessThan(4);
    } finally {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    }
  });

  it("on a processor six times slower, following the finger costs well under one frame of script", async () => {
    await fresh(page, { movable: "both" });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    try {
      const times = await page.evaluate(() => {
        const from = T.point("e2");
        const out: number[] = [];
        T.pointer("pointerdown", from.x, from.y);
        for (let i = 0; i < 300; i++) {
          const t = performance.now();
          T.pointer("pointermove", from.x + Math.cos(i / 9) * 150, from.y - 120 + Math.sin(i / 7) * 110);
          out.push(performance.now() - t);
        }
        T.pointer("pointerup", from.x, from.y);
        return out.sort((a, b) => a - b);
      });
      expect(times[Math.floor(times.length / 2)]).toBeLessThan(1);
      expect(times[Math.floor(times.length * 0.99)]).toBeLessThan(4);
    } finally {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    }
  });

  it("on a processor six times slower, replaying a game makes no long task", async () => {
    const plies = game(60);
    await fresh(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    try {
      const long = await page.evaluate(async (list) => {
        const tasks: number[] = [];
        const observer = new PerformanceObserver((entries) => {
          for (const e of entries.getEntries()) tasks.push(e.duration);
        });
        observer.observe({ entryTypes: ["longtask"] });
        for (const ply of list) {
          T.set({ position: ply.fen, lastMove: ply.move });
          await new Promise((r) => setTimeout(r, 60));
        }
        await new Promise((r) => setTimeout(r, 300));
        observer.disconnect();
        return tasks;
      }, plies);
      expect(long).toEqual([]);
    } finally {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    }
  });
});
