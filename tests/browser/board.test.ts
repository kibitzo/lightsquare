/**
 * What the board shows, read from a real browser the way a user sees it:
 * by where each piece is on screen.
 */
import { Chess } from "chess.js";
import type { Server } from "node:http";
import type { Browser, Page } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PROFILES, fresh, open, serve, settle } from "./helpers";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR";

let site: { server: Server; origin: string };
beforeAll(async () => {
  site = await serve();
});
afterAll(() => site.server.close());

describe.each(PROFILES)("board in $name", (profile) => {
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

  it("shows the starting position, every piece exactly on its square", async () => {
    await fresh(page);
    const pieces = await page.evaluate(() => T.pieces());
    expect(pieces).toHaveLength(32);
    expect(Math.max(...pieces.map((p) => p.off))).toBeLessThan(0.02);
    expect(await page.evaluate(() => T.seen())).toBe(START);
    expect(await page.evaluate(() => T.board.position())).toBe(START);
  });

  it("paints the corner squares the right colour: a1 and h8 dark, a8 and h1 light", async () => {
    await fresh(page, { position: "empty" });
    const colours = await page.evaluate(async () => {
      const host = document.getElementById("board")!;
      const style = getComputedStyle(host);
      const light = style.getPropertyValue("--ls-light").trim();
      const dark = style.getPropertyValue("--ls-dark").trim();
      return { light, dark };
    });
    const shot = await page.locator("#board").screenshot();
    const sample = await page.evaluate(
      async ({ data, squares }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const size = img.width / 8;
        return squares.map(([col, row]) => {
          const [r, g, b] = ctx.getImageData(Math.round((col + 0.5) * size), Math.round((row + 0.5) * size), 1, 1).data;
          return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
        });
      },
      { data: shot.toString("base64"), squares: [[0, 0], [7, 0], [0, 7], [7, 7], [1, 0], [3, 4]] },
    );
    const want = [colours.light, colours.dark, colours.dark, colours.light, colours.dark, colours.dark];
    const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    sample.forEach((got, i) => {
      const far = Math.max(...channels(got).map((v, c) => Math.abs(v - channels(want[i])[c])));
      expect(far, `square ${i}: ${got} against ${want[i]}`).toBeLessThanOrEqual(2);
    });
  });

  it("a move keeps every element: the moved piece is the same node, the rest untouched", async () => {
    await fresh(page);
    const result = await page.evaluate(async (fen) => {
      const host = document.getElementById("board")!;
      const before = [...host.querySelectorAll(".ls-piece")];
      T.tag("e2", "the e-pawn");
      const watch = P.watch(host);
      T.set({ position: fen }, { animate: false });
      const log = watch.stop();
      const after = [...host.querySelectorAll(".ls-piece")];
      return { same: before.length === after.length && before.every((el, i) => el === after[i]), tag: T.tagAt("e4"), log, seen: T.seen() };
    }, AFTER_E4);
    expect(result.same).toBe(true);
    expect(result.tag).toBe("the e-pawn");
    expect(result.seen).toBe(AFTER_E4);
    expect(result.log.sort()).toEqual(["attributes:class", "attributes:style"]);
  });

  it("slides a moved piece and ends exactly on the square", async () => {
    await fresh(page);
    await page.evaluate((fen) => T.set({ position: fen }), AFTER_E4);
    const mid = await page.evaluate(() => document.getAnimations().length);
    expect(mid).toBe(1);
    await settle(page);
    const pieces = await page.evaluate(() => T.pieces());
    expect(Math.max(...pieces.map((p) => p.off))).toBeLessThan(0.02);
    expect(await page.evaluate(() => T.seen())).toBe(AFTER_E4);
  });

  it("a capture fades the taken piece and then removes its element", async () => {
    await fresh(page, { position: "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR" });
    await page.evaluate(() => {
      T.tag("e4", "taker");
      T.set({ position: "rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR" });
    });
    expect(await page.evaluate(() => document.querySelectorAll(".ls-piece").length)).toBe(32);
    expect(await page.evaluate(() => document.querySelectorAll(".ls-gone").length)).toBe(1);
    await settle(page);
    expect(await page.evaluate(() => document.querySelectorAll(".ls-piece").length)).toBe(31);
    expect(await page.evaluate(() => T.tagAt("d5"))).toBe("taker");
  });

  it("castling slides the king and the rook, both keeping their elements", async () => {
    await fresh(page, { position: "r3k2r/8/8/8/8/8/8/R3K2R" });
    const log = await page.evaluate(() => {
      T.tag("e1", "king");
      T.tag("h1", "rook");
      const watch = P.watch(document.getElementById("board")!);
      T.set({ position: "r3k2r/8/8/8/8/8/8/R4RK1" }, { animate: false });
      return watch.stop();
    });
    expect(log.sort()).toEqual(["attributes:class", "attributes:class", "attributes:style", "attributes:style"]);
    expect(await page.evaluate(() => [T.tagAt("g1"), T.tagAt("f1")])).toEqual(["king", "rook"]);
  });

  it("en passant removes the pawn that was passed", async () => {
    await fresh(page, { position: "4k3/8/8/3pP3/8/8/8/4K3" });
    await page.evaluate(() => {
      T.tag("e5", "taker");
      T.set({ position: "4k3/8/3P4/8/8/8/8/4K3" });
    });
    await settle(page);
    expect(await page.evaluate(() => T.seen())).toBe("4k3/8/3P4/8/8/8/8/4K3");
    expect(await page.evaluate(() => T.tagAt("d6"))).toBe("taker");
  });

  it("a promotion turns the pawn's own element into the new piece", async () => {
    await fresh(page, { position: "4k3/P7/8/8/8/8/8/4K3" });
    await page.evaluate(() => {
      T.tag("a7", "pawn");
      T.set({ position: "Q3k3/8/8/8/8/8/8/4K3" });
    });
    await settle(page);
    expect(await page.evaluate(() => T.tagAt("a8"))).toBe("pawn");
    expect(await page.evaluate(() => T.pieceAt("a8")!.classList.contains("ls-wq"))).toBe(true);
  });

  it("flips: every piece and mark mirrors, instantly", async () => {
    await fresh(page, { lastMove: ["e2", "e4"], check: "e8", position: AFTER_E4 });
    await page.evaluate(() => T.set({ orientation: "black" }));
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    expect(await page.evaluate(() => T.seen("black"))).toBe(AFTER_E4);
    expect(await page.evaluate(() => T.marks("black"))).toEqual(["check e8", "last e2", "last e4"]);
    const corner = await page.evaluate(() => T.pieceAt("h1", "black")!.getBoundingClientRect().top - document.getElementById("board")!.getBoundingClientRect().top);
    expect(Math.abs(corner)).toBeLessThan(1);
  });

  it("shows the last move and check, and clears them", async () => {
    await fresh(page, { lastMove: ["g1", "f3"], check: "e8" });
    expect(await page.evaluate(() => T.marks())).toEqual(["check e8", "last f3", "last g1"]);
    await page.evaluate(() => T.set({ lastMove: ["b8", "c6"], check: null }));
    expect(await page.evaluate(() => T.marks())).toEqual(["last b8", "last c6"]);
    await page.evaluate(() => T.set({ lastMove: null }));
    expect(await page.evaluate(() => T.marks())).toEqual([]);
  });

  it("shows the app's own marks: tints under the pieces, badges over them, moved with the same write", async () => {
    await fresh(page, { position: AFTER_E4, marks: [{ square: "e4", name: "hint" }, { square: "e4", name: "brilliant", above: true }] });
    const layers = await page.evaluate(() => {
      const host = document.getElementById("board")!;
      const order = [...host.children].map((el) => el.className.replace("ls-layer ", ""));
      const parent = (name: string) => host.querySelector(`.ls-mark-${name}`)!.parentElement!.className.replace("ls-layer ", "");
      return { order, hint: parent("hint"), badge: parent("brilliant"), marks: T.marks() };
    });
    expect(layers).toEqual({ order: ["ls-marks", "ls-coords", "ls-pieces", "ls-over"], hint: "ls-marks", badge: "ls-over", marks: ["brilliant e4", "hint e4"] });
    const log = await page.evaluate(() => {
      const watch = P.watch(document.getElementById("board")!);
      T.set({ position: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR", marks: [{ square: "e5", name: "best", above: true }] }, { animate: false });
      return { log: watch.stop().sort(), marks: T.marks() };
    });
    expect(log.marks).toEqual(["best e5"]);
    expect(log.log).toEqual(["attributes:class", "attributes:style", "childList:add", "childList:remove", "childList:remove"]);
    await page.evaluate(() => T.set({ marks: null }));
    expect(await page.evaluate(() => T.marks())).toEqual([]);
  });

  it("shows coordinates on the edge squares, and turns them with the board", async () => {
    await fresh(page);
    const white = await page.evaluate(() => T.coords());
    expect(white).toEqual(["8@a8", "7@a7", "6@a6", "5@a5", "4@a4", "3@a3", "2@a2", "1@a1", "a@a1", "b@b1", "c@c1", "d@d1", "e@e1", "f@f1", "g@g1", "h@h1"]);
    const flipped = await page.evaluate(() => {
      const watch = P.watch(document.querySelector(".ls-coords")!);
      T.set({ orientation: "black" });
      return { log: watch.stop(), coords: T.coords().map((c) => c.split("@")[0]).join("") };
    });
    expect(flipped.coords).toBe("12345678hgfedcba");
    expect(flipped.log.filter((l) => l.startsWith("attributes"))).toEqual([]);
    const colours = await page.evaluate(() => {
      const host = document.getElementById("board")!;
      const style = getComputedStyle(host);
      const probe = document.createElement("div");
      host.appendChild(probe);
      const resolve = (v: string) => ((probe.style.color = v), getComputedStyle(probe).color);
      const out = { light: resolve(style.getPropertyValue("--ls-light")), dark: resolve(style.getPropertyValue("--ls-dark")), first: getComputedStyle(host.querySelector(".ls-coord")!).color, second: getComputedStyle(host.querySelectorAll(".ls-coord")[1]).color };
      probe.remove();
      return out;
    });
    expect(colours.first).toBe(colours.dark);
    expect(colours.second).toBe(colours.light);
    await page.evaluate(() => T.set({ coordinates: false }));
    expect(await page.evaluate(() => document.querySelectorAll(".ls-coords, .ls-coord").length)).toBe(0);
    await page.evaluate(() => T.set({ coordinates: true }));
    expect(await page.evaluate(() => T.coords().length)).toBe(16);
  });

  it("setting the position it already shows touches nothing, even in the middle of a slide", async () => {
    await fresh(page);
    const result = await page.evaluate(async (fen) => {
      T.set({ position: fen, lastMove: ["e2", "e4"] });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const watch = P.watch(document.getElementById("board")!);
      for (let i = 0; i < 5; i++) T.set({ position: fen, lastMove: ["e2", "e4"], movable: "none", marks: [] });
      return { log: watch.stop(), running: document.getAnimations().length, top: document.querySelectorAll(".ls-top").length };
    }, AFTER_E4);
    expect(result).toEqual({ log: [], running: 1, top: 1 });
  });

  it("a module joins the board: it is updated after every change and destroyed with it", async () => {
    await fresh(page);
    const calls = await page.evaluate((fen) => {
      const log: string[] = [];
      const api = T.board.use((surface: unknown) => {
        const s = surface as { orientation(): string; cell(q: string): number[]; square(c: number, r: number): string | null; spot(q: string): string; pieces(): unknown[]; lastMove(): unknown };
        return {
          hello: () => `${s.orientation()} ${s.cell("e2")} ${s.square(4, 6)} ${s.square(8, 0)} ${s.spot("h1")} ${s.pieces().length}`,
          update: () => log.push(`update ${s.orientation()} ${JSON.stringify(s.lastMove())}`),
          destroy: () => log.push("destroy"),
        };
      });
      const hello = api.hello();
      T.set({ position: fen, lastMove: ["e2", "e4"] });
      T.set({ orientation: "black" });
      T.board.move("g8", "f6");
      T.board.destroy();
      T.make();
      return { hello, log };
    }, AFTER_E4);
    expect(calls.hello).toBe("white 4,6 e2 null translate(700%,700%) 32");
    expect(calls.log).toEqual(["update white null", 'update white ["e2","e4"]', 'update black ["e2","e4"]', 'update black ["e2","e4"]', "destroy"]);
  });

  it("resizing the board needs no script: no writes, pieces still on their squares", async () => {
    await fresh(page);
    const result = await page.evaluate(async () => {
      const host = document.getElementById("board")!;
      const watch = P.watch(host);
      const wrap = document.getElementById("wrap")!;
      const seen: Array<{ width: number; off: number; fen: string }> = [];
      for (const width of [203, 317, 151]) {
        wrap.style.width = `${width}px`;
        seen.push({ width: host.getBoundingClientRect().width, off: Math.max(...T.pieces().map((p) => p.off)), fen: T.seen() });
      }
      wrap.style.width = "";
      return { seen, log: watch.stop() };
    });
    expect(result.log).toEqual([]);
    expect(result.seen.map((s) => s.width)).toEqual([200, 312, 144]);
    for (const s of result.seen) {
      expect(s.off).toBeLessThan(0.02);
      expect(s.fen).toBe(START);
    }
  });

  it("move() slides one piece and takes what stands on the target", async () => {
    await fresh(page, { position: "4k3/8/8/3p4/4P3/8/8/4K3" });
    await page.evaluate(() => {
      T.tag("e4", "pawn");
      T.board.move("e4", "d5");
    });
    await settle(page);
    expect(await page.evaluate(() => T.seen())).toBe("4k3/8/8/3P4/8/8/8/4K3");
    expect(await page.evaluate(() => T.board.position())).toBe("4k3/8/8/3P4/8/8/8/4K3");
    expect(await page.evaluate(() => T.tagAt("d5"))).toBe("pawn");
    expect(await page.evaluate(() => T.events)).toEqual([]);
  });

  it("a new position in the middle of a slide just retargets: no queue, no leftovers", async () => {
    await fresh(page);
    await page.evaluate(async (fen) => {
      T.set({ position: fen });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      T.set({ position: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR" });
      await new Promise((r) => requestAnimationFrame(r));
      T.set({ position: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R" });
    }, AFTER_E4);
    await settle(page);
    expect(await page.evaluate(() => T.seen())).toBe("r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R");
    expect(await page.evaluate(() => document.querySelectorAll(".ls-piece").length)).toBe(32);
  });

  it("stepping fast through captures never leaves a ghost behind", async () => {
    await fresh(page);
    const fens = ["rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR", "rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR", "rnb1kbnr/ppp1pppp/8/3q4/8/8/PPPP1PPP/RNBQKBNR", START, "8/8/8/8/8/8/8/8", START];
    await page.evaluate((list) => {
      for (const fen of list) T.set({ position: fen });
    }, fens);
    await settle(page);
    expect(await page.evaluate(() => document.querySelectorAll(".ls-piece").length)).toBe(32);
    expect(await page.evaluate(() => T.seen())).toBe(START);
  });

  it("follows whole random games, and jumps between them, without ever showing a wrong board", async () => {
    const fens: string[] = [];
    let seed = 7;
    const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let game = 0; game < 4; game++) {
      const chess = new Chess();
      for (let ply = 0; ply < 140 && !chess.isGameOver(); ply++) {
        const moves = chess.moves();
        chess.move(moves[Math.floor(random() * moves.length)]);
        fens.push(chess.fen().split(" ")[0]);
      }
    }
    const jumps = Array.from({ length: 150 }, () => fens[Math.floor(random() * fens.length)]);
    await fresh(page);
    const wrong = await page.evaluate((list) => {
      const bad: string[] = [];
      for (const fen of list) {
        T.set({ position: fen }, { animate: false });
        if (T.seen() !== fen || T.board.position() !== fen) bad.push(`${fen} shown as ${T.seen()}`);
      }
      return bad;
    }, [...fens, ...jumps]);
    expect(wrong).toEqual([]);
    expect(fens.length).toBeGreaterThan(300);
    expect(await page.evaluate(() => document.querySelectorAll(".ls-piece").length)).toBe(await page.evaluate(() => T.pieces().length));
  });

  it("rejects a bad position without breaking the board", async () => {
    await fresh(page);
    const message = await page.evaluate(() => {
      try {
        T.set({ position: "not a fen" });
        return "no error";
      } catch (e) {
        return String(e);
      }
    });
    expect(message).toMatch(/lightsquare/);
    expect(await page.evaluate(() => T.seen())).toBe(START);
  });

  it("destroy leaves the host as it found it", async () => {
    await fresh(page, { movable: "white" });
    const left = await page.evaluate(() => {
      const host = document.getElementById("board")!;
      T.board.destroy();
      const state = { children: host.children.length, classes: host.className };
      const p = T.point("e2");
      T.pointer("pointerdown", p.x, p.y, "mouse");
      T.pointer("pointerup", p.x, p.y, "mouse");
      const after = { ...state, events: T.events.length, marks: host.querySelectorAll(".ls-mark").length };
      T.make();
      return after;
    });
    expect(left).toEqual({ children: 0, classes: "", events: 0, marks: 0 });
  });
});
