/**
 * The editor module, in every browser profile: the hand moves any piece and
 * takes one off when it is dropped outside the board, the eraser and a
 * piece in hand work on the squares they are pressed or dragged over, and a
 * new piece can be carried in from the app's own palette.
 */
import type { Server } from "node:http";
import type { Browser, Page } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PROFILES, fresh, handFor, open, serve, settle, type Hand, type Point } from "./helpers";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
type Edit = { tool(): string; pick(tool: string): void; drag(piece: string, e: PointerEvent): void; destroy(): void };
type W = { E: Edit; edits: Array<[string, boolean]> };

let site: { server: Server; origin: string };
beforeAll(async () => {
  site = await serve();
});
afterAll(() => site.server.close());

describe.each(PROFILES)("editor in $name", (profile) => {
  let browser: Browser;
  let page: Page;
  let errors: string[];
  let hand: Hand;

  const at = (square: string, orientation = "white"): Promise<Point & { size: number }> => page.evaluate(([s, o]) => T.point(s, o), [square, orientation]);
  const seen = (orientation = "white"): Promise<string> => page.evaluate((o) => T.seen(o), orientation);
  const edits = (): Promise<Array<[string, boolean]>> => page.evaluate(() => (window as unknown as W).edits);
  const pick = (tool: string): Promise<void> => page.evaluate((t) => (window as unknown as W).E.pick(t), tool);
  /** A board both sides may move on, with the editor: the app shows every placement it is told. */
  const editing = async (options: Record<string, unknown> = {}, editorOptions: Record<string, unknown> = {}): Promise<void> => {
    await fresh(page, { movable: "both", ...options });
    await page.evaluate((o) => {
      const w = window as unknown as W;
      w.edits = [];
      w.E = T.board.use(
        M.editor({
          ...o,
          onChange(placement: string, how: { animate: boolean }) {
            w.edits.push([placement, how.animate]);
            T.board.set({ position: placement }, how);
          },
        }),
      );
    }, editorOptions);
  };
  const drag = async (from: Point, to: Point): Promise<void> => {
    await hand.down(from);
    await hand.move(to);
    await hand.up();
  };

  beforeAll(async () => {
    ({ browser, page, errors } = await open(profile, site.origin));
    hand = await handFor(profile, page);
  });
  afterAll(() => browser.close());
  afterEach(() => {
    expect(errors).toEqual([]);
  });

  it("the hand moves any piece of either side, by a drag or by two taps, and tells the placement each time", async () => {
    await editing();
    expect(await page.evaluate(() => (window as unknown as W).E.tool())).toBe("move");
    await drag(await at("e2"), await at("e5"));
    await settle(page);
    await drag(await at("d8"), await at("d2"));
    await settle(page);
    await hand.tap(await at("b8"));
    await hand.tap(await at("c6"));
    await settle(page);
    const after = "r1b1kbnr/pppppppp/2n5/4P3/8/8/PPPq1PPP/RNBQKBNR";
    expect(await seen()).toBe(after);
    expect((await edits()).map((e) => e[0])).toEqual(["rnbqkbnr/pppppppp/8/4P3/8/8/PPPP1PPP/RNBQKBNR", "rnb1kbnr/pppppppp/8/4P3/8/8/PPPq1PPP/RNBQKBNR", after]);
    expect(await page.evaluate(() => T.board.position())).toBe(after);
  });

  it("a piece dropped outside the board is taken off at once; a press without a drag, and a drag that ends on the board, take nothing off", async () => {
    await editing();
    const a1 = await at("a1");
    await drag(a1, { x: a1.x, y: a1.y + a1.size * 1.6 });
    expect(await seen()).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/1NBQKBNR");
    expect(await edits()).toEqual([["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/1NBQKBNR", false]]);
    // Gone at once: nothing slides back and nothing fades.
    expect(await page.evaluate(() => [document.getAnimations().length, document.querySelectorAll(".ls-piece").length])).toEqual([0, 31]);
    await hand.tap(await at("h1"));
    await hand.tap(await at("h1"));
    const g1 = await at("g1");
    await drag(g1, { x: g1.x + 3, y: g1.y - 2 });
    await settle(page);
    expect(await seen()).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/1NBQKBNR");
    expect((await edits()).length).toBe(1);
  });

  it("the eraser: a press takes a piece off, a drag takes off every piece it passes, an empty square is left alone, and no piece is picked up", async () => {
    await editing();
    await pick("erase");
    await hand.tap(await at("e2"));
    await settle(page);
    expect(await seen()).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPP1PPP/RNBQKBNR");
    await drag(await at("a7"), await at("d7"));
    await settle(page);
    expect(await seen()).toBe("rnbqkbnr/4pppp/8/8/8/8/PPPP1PPP/RNBQKBNR");
    await hand.tap(await at("e4"));
    await drag(await at("a5"), await at("c5"));
    expect((await edits()).length).toBe(5);
    expect(await page.evaluate(() => [T.events, T.marks()])).toEqual([[], []]);
  });

  it("a piece in hand: a press puts it down, also in place of another piece; on that same piece it takes it off; a drag does the same along its way", async () => {
    await editing();
    await pick("wq");
    await hand.tap(await at("e4"));
    await hand.tap(await at("e7"));
    expect(await seen()).toBe("rnbqkbnr/ppppQppp/8/8/4Q3/8/PPPPPPPP/RNBQKBNR");
    await hand.tap(await at("e4"));
    await settle(page);
    expect(await seen()).toBe("rnbqkbnr/ppppQppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
    await drag(await at("a3"), await at("c3"));
    expect(await seen()).toBe("rnbqkbnr/ppppQppp/8/8/8/QQQ5/PPPPPPPP/RNBQKBNR");
    // Begun on a queen, the stroke takes queens off, and leaves other pieces alone.
    await drag(await at("c3"), await at("a3"));
    await settle(page);
    expect(await seen()).toBe("rnbqkbnr/ppppQppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
    expect(await page.evaluate(() => [T.events, T.marks()])).toEqual([[], []]);
  });

  it("works on the squares as they are seen when Black is at the bottom", async () => {
    await editing({ orientation: "black" });
    await pick("erase");
    await hand.tap(await at("e2", "black"));
    await pick("bn");
    await hand.tap(await at("e4", "black"));
    await settle(page);
    expect(await seen("black")).toBe("rnbqkbnr/pppppppp/8/8/4n3/8/PPPP1PPP/RNBQKBNR");
  });

  it("the mouse pointer says which tool is in hand, over squares and pieces alike, and an app can give its own", async () => {
    const cursors = (): Promise<string[]> =>
      page.evaluate(() => {
        const host = document.getElementById("board")!;
        return [host.style.cursor, host.style.getPropertyValue("--ls-piece-cursor")];
      });
    await editing({}, { cursors: { bq: "crosshair" } });
    expect(await cursors()).toEqual(["", ""]);
    await pick("erase");
    const [eraser, overPieces] = await cursors();
    expect(eraser).toContain("data:image/svg+xml");
    expect(eraser).toContain("15 15, not-allowed");
    expect(overPieces).toBe(eraser);
    await pick("wn");
    expect(await cursors()).toEqual(["copy", "copy"]);
    await pick("bq");
    expect(await cursors()).toEqual(["crosshair", "crosshair"]);
    await pick("move");
    expect(await cursors()).toEqual(["", ""]);
  });

  it("a new piece carried from the app's palette follows the pointer and lands on the square it is let go over; let go beside the board, it is dropped", async () => {
    await editing();
    await page.evaluate(() => {
      document.getElementById("spare")?.remove();
      const spare = document.createElement("button");
      spare.id = "spare";
      spare.style.cssText = "display:block;width:60px;height:60px;margin:16px;touch-action:none";
      spare.onpointerdown = (e) => (window as unknown as W).E.drag("bn", e);
      document.getElementById("wrap")!.after(spare);
    });
    const from = await page.evaluate(() => {
      const r = document.getElementById("spare")!.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    // Pointer events made in the page reach the palette and then the window, as a real pointer's do.
    const made = (type: string, p: Point, target: "spare" | "window"): Promise<void> =>
      page.evaluate(
        ([t, x, y, where]) => {
          const e = new PointerEvent(t as string, { pointerId: 9, pointerType: "touch", isPrimary: true, clientX: x as number, clientY: y as number, button: 0, bubbles: true, cancelable: true });
          (where === "spare" ? document.getElementById("spare")! : window).dispatchEvent(e);
        },
        [type, p.x, p.y, target],
      );
    const real = !(profile.touch && profile.engine.name() === "webkit");
    const carry = async (to: Point): Promise<void> => {
      if (real) {
        await hand.down(from);
        await hand.move(to);
      } else {
        await made("pointerdown", from, "spare");
        await made("pointermove", to, "window");
      }
    };
    const letGo = async (to: Point): Promise<void> => (real ? hand.up() : made("pointerup", to, "window"));

    const e4 = await at("e4");
    await carry(e4);
    // On its way: one piece more on the page, under the pointer (above it, for a finger), and nothing changed yet.
    const flying = await page.evaluate(() => {
      const el = document.querySelector(".ls-layer > .ls-piece.ls-bn.ls-dragging:only-child")!;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, n: document.querySelectorAll(".ls-piece").length };
    });
    expect(flying.n).toBe(33);
    expect(Math.abs(flying.x - e4.x)).toBeLessThan(2);
    expect(flying.y - e4.y).toBeCloseTo(profile.touch ? -e4.size * 0.75 : 0, 0);
    expect(await edits()).toEqual([]);
    await letGo(e4);
    expect(await seen()).toBe("rnbqkbnr/pppppppp/8/8/4n3/8/PPPPPPPP/RNBQKBNR");
    expect(await edits()).toEqual([["rnbqkbnr/pppppppp/8/8/4n3/8/PPPPPPPP/RNBQKBNR", false]]);
    expect(await page.evaluate(() => [document.querySelectorAll(".ls-piece").length, document.getAnimations().length])).toEqual([33, 0]);

    const beside = { x: e4.x, y: (await at("e1")).y + e4.size * 1.3 };
    await carry(beside);
    await letGo(beside);
    expect((await edits()).length).toBe(1);
    expect(await page.evaluate(() => document.querySelectorAll(".ls-piece").length)).toBe(33);
    await page.evaluate(() => document.getElementById("spare")!.remove());
  });

  it("at rest it does nothing, and taken away it leaves the board as it was", async () => {
    await editing();
    await pick("erase");
    await page.evaluate(() => P.reset());
    await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
    expect(await page.evaluate(() => ({ raf: P.raf, timers: P.timers, reads: P.reads, animations: document.getAnimations().length }))).toEqual({ raf: 0, timers: 1, reads: 0, animations: 0 });
    await page.evaluate(() => (window as unknown as W).E.destroy());
    expect(await page.evaluate(() => [document.getElementById("board")!.style.cursor, document.getElementById("board")!.style.getPropertyValue("--ls-piece-cursor")])).toEqual(["", ""]);
    // The eraser is gone with the module: a press selects the piece again, as on any board.
    await hand.tap(await at("e2"));
    expect(await seen()).toBe(START);
    expect(await page.evaluate(() => T.marks())).toEqual(["select e2"]);
    expect(await edits()).toEqual([]);
    // And a move made on the board is the board's alone again: the editor that is gone tells nothing.
    await hand.tap(await at("e4"));
    await settle(page);
    expect(await seen()).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");
    expect(await edits()).toEqual([]);
  });
});
