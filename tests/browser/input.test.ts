/**
 * Moving pieces by hand. Each profile is driven by the truest input the
 * engine allows: a real mouse on desktop, real touch points through the
 * DevTools protocol in Chromium's phone profile, and synthetic touch
 * pointer events in WebKit's phone profile (Playwright cannot drag a real
 * finger there).
 */
import type { Server } from "node:http";
import type { Browser, CDPSession, Page } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PROFILES, fresh, open, serve, settle, type Profile } from "./helpers";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
const OPENING = { movable: "white", targets: { e2: ["e3", "e4"], g1: ["f3", "h3"], d2: ["d3", "d4"] } };

interface Point {
  x: number;
  y: number;
}

interface Hand {
  kind: "mouse" | "touch";
  down(at: Point): Promise<void>;
  move(to: Point, steps?: number): Promise<void>;
  up(): Promise<void>;
  tap(at: Point): Promise<void>;
}

function path(from: Point, to: Point, steps: number): Point[] {
  return Array.from({ length: steps }, (_, i) => ({ x: from.x + ((to.x - from.x) * (i + 1)) / steps, y: from.y + ((to.y - from.y) * (i + 1)) / steps }));
}

function mouseHand(page: Page): Hand {
  return {
    kind: "mouse",
    down: async (at) => {
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
    },
    move: (to, steps = 6) => page.mouse.move(to.x, to.y, { steps }),
    up: () => page.mouse.up(),
    tap: (at) => page.mouse.click(at.x, at.y),
  };
}

function touchHand(page: Page, cdp: CDPSession): Hand {
  let last: Point = { x: 0, y: 0 };
  const send = (type: string, points: Point[]) => cdp.send("Input.dispatchTouchEvent", { type: type as "touchStart", touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: 1 })) });
  return {
    kind: "touch",
    down: async (at) => {
      last = at;
      await send("touchStart", [at]);
    },
    move: async (to, steps = 6) => {
      for (const p of path(last, to, steps)) await send("touchMove", [p]);
      last = to;
      // Chromium hands touch moves to the page once per frame: wait for the last one.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    },
    up: async () => void (await send("touchEnd", [])),
    tap: (at) => page.touchscreen.tap(at.x, at.y),
  };
}

/** Pointer events made in the page. Works everywhere; used where nothing truer exists. */
function syntheticHand(page: Page, kind: "mouse" | "touch"): Hand {
  let last: Point = { x: 0, y: 0 };
  const send = (type: string, at: Point) => page.evaluate(([t, x, y, k]) => T.pointer(t as string, x as number, y as number, k as string), [type, at.x, at.y, kind]);
  return {
    kind,
    down: async (at) => {
      last = at;
      await send("pointerdown", at);
    },
    move: async (to, steps = 6) => {
      for (const p of path(last, to, steps)) await send("pointermove", p);
      last = to;
    },
    up: () => send("pointerup", last),
    tap: async (at) => {
      await send("pointerdown", at);
      await send("pointerup", at);
    },
  };
}

async function handFor(profile: Profile, page: Page): Promise<Hand> {
  if (!profile.touch) return mouseHand(page);
  if (profile.engine.name() === "chromium") return touchHand(page, await page.context().newCDPSession(page));
  return syntheticHand(page, "touch");
}

let site: { server: Server; origin: string };
beforeAll(async () => {
  site = await serve();
});
afterAll(() => site.server.close());

describe.each(PROFILES)("moving pieces in $name", (profile) => {
  let browser: Browser;
  let page: Page;
  let errors: string[];
  let hand: Hand;

  const at = (square: string, orientation = "white"): Promise<Point & { size: number }> => page.evaluate(([s, o]) => T.point(s, o), [square, orientation]);
  const events = (): Promise<Array<Record<string, unknown>>> => page.evaluate(() => T.events);
  const marks = (): Promise<string[]> => page.evaluate(() => T.marks());
  const seen = (): Promise<string> => page.evaluate(() => T.seen());
  const moves = async () => (await events()).filter((e) => e.type === "move");

  beforeAll(async () => {
    ({ browser, page, errors } = await open(profile, site.origin));
    hand = await handFor(profile, page);
  });
  afterAll(() => browser.close());
  afterEach(() => {
    expect(errors).toEqual([]);
  });

  it("a board to look at ignores taps and lets the page scroll", async () => {
    await fresh(page);
    await hand.tap(await at("e2"));
    expect(await events()).toEqual([]);
    expect(await marks()).toEqual([]);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById("board")!).touchAction)).toBe("auto");
    await page.evaluate(() => T.set({ movable: "white" }));
    expect(await page.evaluate(() => getComputedStyle(document.getElementById("board")!).touchAction)).toBe("none");
  });

  it("a tap selects a piece and shows where it may go", async () => {
    await fresh(page, OPENING);
    await hand.tap(await at("e2"));
    expect(await marks()).toEqual(["dot e3", "dot e4", "select e2"]);
    expect(await events()).toEqual([{ type: "select", square: "e2" }]);
  });

  it("a target that holds a piece is marked on its four corners, with nothing drawn over the piece", async () => {
    await fresh(page, { position: "4k3/8/8/3p4/4P3/8/8/4K3", movable: "white", targets: { e4: ["e5", "d5"] } });
    await hand.tap(await at("e4"));
    expect(await marks()).toEqual(["dot e5", "select e4", "take d5"]);
    const corners = await page.evaluate(() => getComputedStyle(document.querySelector(".ls-mark-take")!).backgroundImage.match(/linear-gradient/g)?.length);
    expect(corners).toBe(4);
  });

  it("a move dot is three tenths of its square wide, and --ls-dot-size changes that", async () => {
    await fresh(page, OPENING);
    await hand.tap(await at("e2"));
    // The dot is a round gradient measured from the square's nearest side: its edge is at the dot's width, as a share of the square.
    const edge = (): Promise<number> =>
      page.evaluate(() => {
        const stops = [...getComputedStyle(document.querySelector(".ls-mark-dot")!).backgroundImage.matchAll(/([\d.]+)%/g)].map((m) => Number(m[1]));
        return Math.max(...stops);
      });
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".ls-mark-dot")!).backgroundImage)).toContain("closest-side");
    expect(await edge()).toBeCloseTo(30, 0);
    await page.evaluate(() => document.getElementById("board")!.style.setProperty("--ls-dot-size", "0.4"));
    expect(await edge()).toBeCloseTo(40, 0);
    await page.evaluate(() => document.getElementById("board")!.style.removeProperty("--ls-dot-size"));
  });

  it.skipIf(profile.touch)("a mouse over a piece that can be picked up shows a hand; over any other piece it does not", async () => {
    const cursors = (): Promise<Record<string, string>> =>
      page.evaluate(() => {
        const of = (sel: string): string => {
          const style = getComputedStyle(document.querySelector(sel)!);
          return style.pointerEvents === "none" ? "none" : style.cursor;
        };
        return { white: of(".ls-piece.ls-wp"), black: of(".ls-piece.ls-bp") };
      });
    await fresh(page);
    expect(await cursors(), "a board to look at").toEqual({ white: "none", black: "none" });
    await page.evaluate(() => T.set({ movable: "white" }));
    expect(await cursors(), "White to move").toEqual({ white: "pointer", black: "none" });
    await page.evaluate(() => T.set({ movable: "none", premovable: "black" }));
    expect(await cursors(), "Black may premove").toEqual({ white: "none", black: "pointer" });
    await page.evaluate(() => T.set({ movable: "both", premovable: "none" }));
    expect(await cursors(), "both sides").toEqual({ white: "pointer", black: "pointer" });
    await page.evaluate(() => document.getElementById("board")!.style.setProperty("--ls-piece-cursor", "grab"));
    expect((await cursors()).white).toBe("grab");
    await page.evaluate(() => document.getElementById("board")!.style.removeProperty("--ls-piece-cursor"));
    // The piece takes the pointer, and a press on it still reaches the board: it is picked up and carried.
    await page.evaluate(() => T.set({ movable: "white" }));
    const from = await at("e2");
    const to = await at("e4");
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 5 });
    expect(await page.evaluate(() => getComputedStyle(document.getElementById("board")!).cursor), "while a piece is carried").toBe("grabbing");
    await page.mouse.up();
    expect((await events()).at(-1)).toMatchObject({ type: "move", from: "e2", to: "e4" });
    await page.evaluate(() => (T.board as unknown as { destroy(): void }).destroy());
    expect(await page.evaluate(() => document.getElementById("board")!.className.includes("-moves"))).toBe(false);
    await fresh(page);
  });

  it.skipIf(profile.touch)("under a mouse, the square the piece would go to is shaded whole, and no script runs for it", async () => {
    await fresh(page, { position: "4k3/8/8/3p4/4P3/8/8/4K3", movable: "white", targets: { e4: ["e5", "d5"] } });
    await hand.tap(await at("e4"));
    const look = (name: string): Promise<{ image: string; colour: string }> =>
      page.evaluate((n) => {
        const style = getComputedStyle(document.querySelector(`.ls-mark-${n}`)!);
        return { image: style.backgroundImage, colour: style.backgroundColor };
      }, name);
    const shade = await page.evaluate(() => getComputedStyle(document.getElementById("board")!).getPropertyValue("--_target").trim());
    await page.evaluate(() => {
      P.reset();
      (window as unknown as { writes: number }).writes = 0;
      new MutationObserver((records) => ((window as unknown as { writes: number }).writes += records.length)).observe(document.getElementById("board")!, { subtree: true, childList: true, attributes: true });
    });
    for (const [square, name] of [["e5", "dot"], ["d5", "take"]] as const) {
      const p = await at(square);
      await page.mouse.move(p.x, p.y);
      expect(await look(name), `${name} under the mouse`).toEqual({ image: "none", colour: shade.replace(/,\s*/g, ", ") });
    }
    const away = await at("a1");
    await page.mouse.move(away.x, away.y);
    expect((await look("dot")).image).toContain("radial-gradient");
    expect((await look("take")).image).toContain("linear-gradient");
    expect(await page.evaluate(() => ({ frames: P.raf, timers: P.timers, writes: (window as unknown as { writes: number }).writes }))).toEqual({ frames: 0, timers: 0, writes: 0 });
    // The marks take the pointer for the shade, and a press on them still reaches the board.
    await hand.tap(await at("d5"));
    expect((await events()).at(-1)).toMatchObject({ type: "move", from: "e4", to: "d5" });
  });

  it("tap, tap moves the piece with a slide and reports the move", async () => {
    await fresh(page, OPENING);
    await hand.tap(await at("e2"));
    await hand.tap(await at("e4"));
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(1);
    expect(await events()).toEqual([
      { type: "select", square: "e2" },
      { type: "select", square: null },
      { type: "move", from: "e2", to: "e4", piece: "wp" },
    ]);
    await settle(page);
    expect(await seen()).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");
    expect(await marks()).toEqual(["last e2", "last e4"]);
  });

  it("a tap on a square the piece may not go to unselects and moves nothing", async () => {
    await fresh(page, OPENING);
    await hand.tap(await at("e2"));
    await hand.tap(await at("e5"));
    expect(await marks()).toEqual([]);
    expect(await moves()).toEqual([]);
    expect(await seen()).toBe(START);
  });

  it("a second tap on the selected piece unselects it", async () => {
    await fresh(page, OPENING);
    await hand.tap(await at("e2"));
    await hand.tap(await at("e2"));
    expect(await marks()).toEqual([]);
    expect(await events()).toEqual([
      { type: "select", square: "e2" },
      { type: "select", square: null },
    ]);
  });

  it("a tap on another piece of the same side switches the selection", async () => {
    await fresh(page, OPENING);
    await hand.tap(await at("e2"));
    await hand.tap(await at("g1"));
    expect(await marks()).toEqual(["dot f3", "dot h3", "select g1"]);
    expect(await moves()).toEqual([]);
  });

  it("only the movable side can be picked up", async () => {
    await fresh(page, OPENING);
    await hand.tap(await at("e7"));
    expect(await marks()).toEqual([]);
    await page.evaluate(() => T.set({ movable: "black", targets: { e7: ["e5"] } }));
    await hand.tap(await at("e7"));
    expect(await marks()).toEqual(["dot e5", "select e7"]);
  });

  it("a capture by tap reports what was taken", async () => {
    await fresh(page, { position: "4k3/8/8/3p4/4P3/8/8/4K3", movable: "white", targets: { e4: ["e5", "d5"] } });
    await hand.tap(await at("e4"));
    await hand.tap(await at("d5"));
    expect(await moves()).toEqual([{ type: "move", from: "e4", to: "d5", piece: "wp", captured: "bp" }]);
    await settle(page);
    expect(await seen()).toBe("4k3/8/8/3P4/8/8/8/4K3");
  });

  it("without targets any square is allowed, except taking your own piece", async () => {
    await fresh(page, { movable: "both" });
    await hand.tap(await at("b1"));
    await hand.tap(await at("b5"));
    await hand.tap(await at("a1"));
    await hand.tap(await at("a2"));
    await settle(page);
    expect(await moves()).toEqual([{ type: "move", from: "b1", to: "b5", piece: "wn" }]);
    expect(await marks()).toEqual(["last b1", "last b5", "select a2"]);
  });

  it("a drag carries the piece under the pointer and drops it without a slide", async () => {
    await fresh(page, OPENING);
    const from = await at("e2");
    const to = await at("e4");
    await hand.down(from);
    await hand.move({ x: to.x + 3, y: to.y - 2 });
    const mid = await page.evaluate(() => {
      const el = document.querySelector(".ls-dragging")!;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, lifted: el.classList.contains("ls-lifted"), marks: T.marks() };
    });
    expect(Math.abs(mid.x - (to.x + 3))).toBeLessThan(1.5);
    const lift = hand.kind === "touch" ? from.size * 0.75 : 0;
    expect(Math.abs(mid.y - (to.y - 2 - lift))).toBeLessThan(1.5);
    expect(mid.lifted).toBe(hand.kind === "touch");
    expect(mid.marks).toEqual(["dot e3", "dot e4", "hover e4", "select e2"]);
    await hand.up();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    expect(await page.evaluate(() => document.querySelectorAll(".ls-dragging").length)).toBe(0);
    expect(await moves()).toEqual([{ type: "move", from: "e2", to: "e4", piece: "wp" }]);
    expect(await seen()).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");
    expect(await marks()).toEqual(["last e2", "last e4"]);
    expect(Math.max(...(await page.evaluate(() => T.pieces())).map((p) => p.off))).toBeLessThan(0.02);
  });

  it("a drag to a square that is not allowed slides the piece back", async () => {
    await fresh(page, OPENING);
    await hand.down(await at("e2"));
    await hand.move(await at("e6"));
    expect(await marks()).toEqual(["dot e3", "dot e4", "select e2"]);
    await hand.up();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(1);
    await settle(page);
    expect(await moves()).toEqual([]);
    expect(await seen()).toBe(START);
    expect(await marks()).toEqual([]);
  });

  it("a drag off the board and back onto its own square keeps the piece selected", async () => {
    await fresh(page, OPENING);
    const from = await at("e2");
    await hand.down(from);
    await hand.move({ x: from.x, y: from.y + from.size * 3 });
    await hand.move({ x: from.x + 2, y: from.y + 2 });
    await hand.up();
    await settle(page);
    expect(await moves()).toEqual([]);
    expect(await seen()).toBe(START);
    expect(await marks()).toEqual(["dot e3", "dot e4", "select e2"]);
  });

  it("a drag released outside the board puts the piece back", async () => {
    await fresh(page, OPENING);
    const from = await at("e2");
    await hand.down(from);
    await hand.move({ x: from.x, y: from.y + from.size * 2.5 });
    await hand.up();
    await settle(page);
    expect(await moves()).toEqual([]);
    expect(await seen()).toBe(START);
  });

  it("a press that barely moves is a tap, not a drag", async () => {
    await fresh(page, OPENING);
    const from = await at("e2");
    await hand.down(from);
    await hand.move({ x: from.x + 2, y: from.y + 1 }, 2);
    expect(await page.evaluate(() => document.querySelectorAll(".ls-dragging").length)).toBe(0);
    await hand.up();
    expect(await marks()).toEqual(["dot e3", "dot e4", "select e2"]);
  });

  it("the opponent's move arriving in the middle of a drag does not break the drag", async () => {
    await fresh(page, OPENING);
    await hand.down(await at("e2"));
    await hand.move(await at("e3"));
    await page.evaluate(() => T.set({ position: "rnbqkb1r/pppppppp/5n2/8/8/8/PPPPPPPP/RNBQKBNR", lastMove: ["g8", "f6"] }));
    expect(await page.evaluate(() => document.querySelectorAll(".ls-dragging").length)).toBe(1);
    await hand.move(await at("e4"));
    await hand.up();
    await settle(page);
    expect(await moves()).toEqual([{ type: "move", from: "e2", to: "e4", piece: "wp" }]);
    expect(await seen()).toBe("rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR");
  });

  it("a dragged piece that is taken mid-drag is let go", async () => {
    await fresh(page, OPENING);
    await hand.down(await at("e2"));
    await hand.move(await at("e3"));
    await page.evaluate(() => T.set({ position: "rnbqkbnr/pppppppp/8/8/8/8/PPPP1PPP/RNBQKBNR" }, { animate: false }));
    await hand.move(await at("e4"));
    await hand.up();
    expect(await moves()).toEqual([]);
    expect(await seen()).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPP1PPP/RNBQKBNR");
    expect(await page.evaluate(() => document.querySelectorAll(".ls-dragging").length)).toBe(0);
  });

  it("works the same with Black at the bottom", async () => {
    await fresh(page, { orientation: "black", movable: "black", targets: { e7: ["e6", "e5"], g8: ["f6"] } });
    await hand.tap(await at("g8", "black"));
    await hand.tap(await at("f6", "black"));
    await settle(page);
    await page.evaluate(() => T.set({ targets: { e7: ["e6", "e5"] } }));
    await hand.down(await at("e7", "black"));
    await hand.move(await at("e5", "black"));
    await hand.up();
    expect(await moves()).toEqual([
      { type: "move", from: "g8", to: "f6", piece: "bn" },
      { type: "move", from: "e7", to: "e5", piece: "bp" },
    ]);
    expect(await page.evaluate(() => T.seen("black"))).toBe("rnbqkb1r/pppp1ppp/5n2/4p3/8/8/PPPPPPPP/RNBQKBNR");
  });

  it("the app completes a castling move: the rook follows", async () => {
    await fresh(page, { position: "r3k2r/8/8/8/8/8/8/R3K2R", movable: "white", targets: { e1: ["g1", "c1", "f1", "d1"] } });
    await page.evaluate(() => T.tag("h1", "rook"));
    await hand.tap(await at("e1"));
    await hand.tap(await at("g1"));
    await page.evaluate(() => T.set({ position: "r3k2r/8/8/8/8/8/8/R4RK1" }));
    await settle(page);
    expect(await seen()).toBe("r3k2r/8/8/8/8/8/8/R4RK1");
    expect(await page.evaluate(() => T.tagAt("f1"))).toBe("rook");
  });

  it("the app takes a move back: the piece returns and the taken piece is there again", async () => {
    const before = "4k3/8/8/3p4/4P3/8/8/4K3";
    await fresh(page, { position: before, movable: "white", targets: { e4: ["e5", "d5"] } });
    await hand.down(await at("e4"));
    await hand.move(await at("d5"));
    await hand.up();
    expect(await seen()).toBe("4k3/8/8/3P4/8/8/8/4K3");
    await page.evaluate((fen) => T.set({ position: fen, lastMove: null }), before);
    await settle(page);
    expect(await seen()).toBe(before);
    expect(await marks()).toEqual([]);
  });

  it("a cancelled touch puts the piece back and reports nothing", async () => {
    await fresh(page, OPENING);
    const finger = syntheticHand(page, "touch");
    const from = await at("e2");
    const to = await at("e4");
    await finger.down(from);
    await finger.move(to);
    await page.evaluate(([x, y]) => T.pointer("pointercancel", x, y), [to.x, to.y]);
    expect(await page.evaluate(() => document.querySelectorAll(".ls-dragging").length)).toBe(0);
    expect(await seen()).toBe(START);
    await finger.up();
    expect(await moves()).toEqual([]);
  });

  it("a second finger and the right mouse button are ignored", async () => {
    await fresh(page, OPENING);
    const e2 = await at("e2");
    const d2 = await at("d2");
    await page.evaluate(
      ([a, b]) => {
        const host = document.getElementById("board")!;
        const fire = (type: string, id: number, primary: boolean, p: { x: number; y: number }, button = 0) =>
          host.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: primary ? "touch" : "touch", isPrimary: primary, clientX: p.x, clientY: p.y, button, bubbles: true }));
        fire("pointerdown", 21, false, b);
        fire("pointerup", 21, false, b);
        host.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, pointerType: "mouse", isPrimary: true, clientX: b.x, clientY: b.y, button: 2, bubbles: true }));
        fire("pointerdown", 20, true, a);
        fire("pointerdown", 21, false, b);
        fire("pointermove", 21, false, { x: b.x, y: b.y - 200 });
        fire("pointerup", 21, false, { x: b.x, y: b.y - 200 });
      },
      [e2, d2],
    );
    expect(await marks()).toEqual(["dot e3", "dot e4", "select e2"]);
    expect(await page.evaluate(() => document.querySelectorAll(".ls-dragging").length)).toBe(0);
    expect(await moves()).toEqual([]);
  });

  it("reports a tap on any square, on a look-only board too, without taking the touch from the page", async () => {
    await fresh(page, { taps: true });
    await hand.tap(await at("e4"));
    await hand.tap(await at("a8"));
    expect(await events()).toEqual([
      { type: "tap", square: "e4" },
      { type: "tap", square: "a8" },
    ]);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById("board")!).touchAction)).toBe("auto");
  });

  it("a drag to another square is not a tap; a tap that moves a piece is", async () => {
    await fresh(page, { ...OPENING, taps: true });
    await hand.down(await at("e2"));
    await hand.move(await at("e4"));
    await hand.up();
    expect((await events()).filter((e) => e.type === "tap")).toEqual([]);
    await hand.tap(await at("g1"));
    await hand.tap(await at("f3"));
    expect((await events()).filter((e) => e.type === "tap")).toEqual([
      { type: "tap", square: "g1" },
      { type: "tap", square: "f3" },
    ]);
  });

  it("premove by taps: the piece stays, the two squares are marked, nothing is played", async () => {
    await fresh(page, { movable: "none", premovable: "white" });
    expect(await page.evaluate(() => getComputedStyle(document.getElementById("board")!).touchAction)).toBe("none");
    await hand.tap(await at("e2"));
    await hand.tap(await at("e4"));
    expect(await events()).toEqual([
      { type: "select", square: "e2" },
      { type: "select", square: null },
      { type: "premove", squares: ["e2", "e4"] },
    ]);
    expect(await marks()).toEqual(["premove e2", "premove e4"]);
    expect(await seen()).toBe(START);
  });

  it("premove by drag: the piece slides back and the premove waits", async () => {
    await fresh(page, { movable: "black", premovable: "white" });
    await hand.down(await at("g1"));
    await hand.move(await at("f3"));
    await hand.up();
    await settle(page);
    expect(await seen()).toBe(START);
    expect(await marks()).toEqual(["premove f3", "premove g1"]);
    expect(await moves()).toEqual([]);
  });

  it("a press on the board cancels the premove", async () => {
    await fresh(page, { movable: "none", premovable: "white" });
    await hand.tap(await at("e2"));
    await hand.tap(await at("e4"));
    await hand.tap(await at("a5"));
    expect(await marks()).toEqual([]);
    expect((await events()).filter((e) => e.type === "premove")).toEqual([
      { type: "premove", squares: ["e2", "e4"] },
      { type: "premove", squares: null },
    ]);
  });

  it("premove targets limit a premove and show as dots", async () => {
    await fresh(page, { movable: "none", premovable: "white", premoveTargets: { e2: ["e3", "e4", "d3", "f3"] } });
    await hand.tap(await at("e2"));
    expect(await marks()).toEqual(["dot d3", "dot e3", "dot e4", "dot f3", "select e2"]);
    await hand.tap(await at("e5"));
    expect((await events()).filter((e) => e.type === "premove")).toEqual([]);
    await hand.tap(await at("e2"));
    await hand.tap(await at("d3"));
    expect(await marks()).toEqual(["premove d3", "premove e2"]);
  });

  it("when its turn comes, the premove is played as a move of the user", async () => {
    await fresh(page, { movable: "none", premovable: "white" });
    await hand.tap(await at("e2"));
    await hand.tap(await at("e4"));
    const played = await page.evaluate(() => {
      T.set({ position: "rnbqkbnr/pppp1ppp/8/4p3/8/8/PPPPPPPP/RNBQKBNR", lastMove: ["e7", "e5"], movable: "white", premovable: "none", targets: { e2: ["e3", "e4"] } });
      return T.board.playPremove();
    });
    expect(played).toBe(true);
    await settle(page);
    expect(await moves()).toEqual([{ type: "move", from: "e2", to: "e4", piece: "wp" }]);
    expect(await seen()).toBe("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR");
    expect(await marks()).toEqual(["last e2", "last e4"]);
    expect(await page.evaluate(() => T.board.playPremove())).toBe(false);
  });

  it("a premove that is no longer allowed is dropped, not played", async () => {
    await fresh(page, { movable: "none", premovable: "white" });
    await hand.tap(await at("e2"));
    await hand.tap(await at("e4"));
    const played = await page.evaluate(() => {
      T.set({ movable: "white", premovable: "none", targets: { e2: ["e3"] } });
      return T.board.playPremove();
    });
    expect(played).toBe(false);
    expect(await moves()).toEqual([]);
    expect(await marks()).toEqual([]);
    expect(await seen()).toBe(START);
  });

  it("a premove whose piece is taken is cancelled; the app can also drop one quietly", async () => {
    await fresh(page, { movable: "none", premovable: "white" });
    await hand.tap(await at("e2"));
    await hand.tap(await at("e4"));
    await page.evaluate(() => T.set({ position: "rnbqkbnr/pppppppp/8/8/8/8/PPPP1PPP/RNBQKBNR" }, { animate: false }));
    expect(await marks()).toEqual([]);
    expect((await events()).filter((e) => e.type === "premove").at(-1)).toEqual({ type: "premove", squares: null });
    await hand.tap(await at("d2"));
    await hand.tap(await at("d4"));
    const before = (await events()).length;
    await page.evaluate(() => T.set({ premove: null }));
    expect(await marks()).toEqual([]);
    expect((await events()).length).toBe(before);
  });

  it("switching the board to look-only in the middle of a drag lets go", async () => {
    await fresh(page, OPENING);
    await hand.down(await at("e2"));
    await hand.move(await at("e4"));
    await page.evaluate(() => T.set({ movable: "none" }));
    await hand.up();
    expect(await moves()).toEqual([]);
    expect(await seen()).toBe(START);
    expect(await marks()).toEqual([]);
  });
});
