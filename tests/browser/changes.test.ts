/**
 * What the board tells about a change of the pieces (`onChange`), in every
 * browser profile: a move, a capture, castling, a promotion or a new
 * position, by the user or by the app. A sound, a move list or a clock
 * listens to this.
 */
import type { Server } from "node:http";
import type { Browser, Page } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PROFILES, fresh, open, serve } from "./helpers";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR";
const AFTER_E4_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR";
const CASTLING = "r3k2r/8/8/8/8/8/8/R3K2R";
const CASTLED = "r3k2r/8/8/8/8/8/8/R4RK1";
const PASSING = "4k3/8/8/3pP3/8/8/8/4K3";
const PASSED = "4k3/8/3P4/8/8/8/8/4K3";
const PROMOTING = "3r4/4P3/8/8/8/8/8/k3K3";
const PROMOTED = "3rQ3/8/8/8/8/8/8/k3K3";
const PROMOTED_TAKING = "3Q4/8/8/8/8/8/8/k3K3";

type Change = { kind: string; from?: string; to?: string; captured?: string; by: string; animated: boolean };
type W = { changes: Change[]; board: { set(o: unknown, how?: unknown): void; move(a: string, b: string): void }; set(o: unknown, how?: unknown): void };
declare const T: W;

let site: { server: Server; origin: string };
beforeAll(async () => {
  site = await serve();
});
afterAll(() => site.server.close());

describe.each(PROFILES)("what the board tells in $name", (profile) => {
  let browser: Browser;
  let page: Page;
  let errors: string[];

  const press = async (square: string): Promise<void> => {
    const p = await page.evaluate((s) => (T as unknown as { point(s: string): { x: number; y: number } }).point(s), square);
    if (profile.touch) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
  };
  const play = async (from: string, to: string): Promise<void> => {
    await press(from);
    await press(to);
  };
  const changes = (): Promise<Change[]> => page.evaluate(() => T.changes.map((c) => ({ ...c })));

  beforeAll(async () => {
    ({ browser, page, errors } = await open(profile, site.origin));
  });
  afterAll(() => browser.close());
  afterEach(() => {
    expect(errors).toEqual([]);
  });

  it("says nothing when it is made, and nothing when the same position is set again", async () => {
    await fresh(page, { position: START });
    await page.evaluate((fen) => T.set({ position: fen, orientation: "black" }), START);
    expect(await changes()).toEqual([]);
  });

  it("a move of the user is told once; the app's answer that confirms it is not a second change", async () => {
    await fresh(page, { position: START, movable: "white" });
    await play("e2", "e4");
    await page.evaluate((fen) => T.set({ position: fen }), AFTER_E4);
    expect(await changes()).toEqual([{ kind: "move", from: "e2", to: "e4", by: "user", animated: true }]);
  });

  it("a capture names the piece that was taken", async () => {
    await fresh(page, { position: "4k3/8/8/3p4/4P3/8/8/4K3", movable: "white" });
    await play("e4", "d5");
    expect(await changes()).toEqual([{ kind: "capture", from: "e4", to: "d5", captured: "bp", by: "user", animated: true }]);
  });

  it("castling is told when the king takes its long step, and the rook the app then moves is part of it", async () => {
    await fresh(page, { position: CASTLING, movable: "white" });
    await play("e1", "g1");
    await page.evaluate((fen) => T.set({ position: fen }), CASTLED);
    expect(await changes()).toEqual([{ kind: "castle", from: "e1", to: "g1", by: "user", animated: true }]);
  });

  it("taking in passing is a capture, and the pawn the app then removes is part of it", async () => {
    await fresh(page, { position: PASSING, movable: "white" });
    await play("e5", "d6");
    await page.evaluate((fen) => T.set({ position: fen }), PASSED);
    expect(await changes()).toEqual([{ kind: "capture", from: "e5", to: "d6", captured: "bp", by: "user", animated: true }]);
  });

  it("a pawn on the last row is a promotion, also when it takes, and the piece the app then sets is part of it", async () => {
    await fresh(page, { position: PROMOTING, movable: "white" });
    await play("e7", "e8");
    await page.evaluate((fen) => T.set({ position: fen }), PROMOTED);
    expect(await changes()).toEqual([{ kind: "promote", from: "e7", to: "e8", by: "user", animated: true }]);
    await fresh(page, { position: PROMOTING, movable: "white" });
    await play("e7", "d8");
    await page.evaluate((fen) => T.set({ position: fen }), PROMOTED_TAKING);
    expect(await changes()).toEqual([{ kind: "promote", from: "e7", to: "d8", captured: "br", by: "user", animated: true }]);
  });

  it("a move the app takes back is not a second change", async () => {
    await fresh(page, { position: START, movable: "white" });
    await play("e2", "e4");
    await page.evaluate((fen) => T.set({ position: fen }), START);
    expect((await changes()).map((c) => c.kind)).toEqual(["move"]);
  });

  it("the opponent's reply is a change of its own, with or without an answer before it", async () => {
    await fresh(page, { position: START, movable: "white" });
    await play("e2", "e4");
    await page.evaluate((fen) => T.set({ position: fen }), AFTER_E4_E5);
    expect(await changes()).toEqual([
      { kind: "move", from: "e2", to: "e4", by: "user", animated: true },
      { kind: "move", from: "e7", to: "e5", by: "app", animated: true },
    ]);
    await fresh(page, { position: START, movable: "white" });
    await play("e2", "e4");
    await page.evaluate(([one, two]) => (T.set({ position: one }), T.set({ position: two })), [AFTER_E4, AFTER_E4_E5]);
    expect((await changes()).map((c) => `${c.by} ${c.from}${c.to}`)).toEqual(["user e2e4", "app e7e5"]);
  });

  it("a position set by the app is told with what it was: a move, a capture, castling, a promotion", async () => {
    const told = async (from: string, to: string, how?: { animate: boolean }): Promise<Change[]> => {
      await fresh(page, { position: from });
      await page.evaluate(([fen, h]) => T.set({ position: fen }, h), [to, how] as const);
      return changes();
    };
    expect(await told(START, AFTER_E4)).toEqual([{ kind: "move", from: "e2", to: "e4", by: "app", animated: true }]);
    expect(await told(START, AFTER_E4, { animate: false })).toEqual([{ kind: "move", from: "e2", to: "e4", by: "app", animated: false }]);
    expect(await told(CASTLING, CASTLED)).toEqual([{ kind: "castle", from: "e1", to: "g1", by: "app", animated: true }]);
    expect(await told(PASSING, PASSED)).toEqual([{ kind: "capture", from: "e5", to: "d6", captured: "bp", by: "app", animated: true }]);
    expect(await told(PROMOTING, PROMOTED)).toEqual([{ kind: "promote", from: "e7", to: "e8", by: "app", animated: true }]);
    expect(await told(PROMOTING, PROMOTED_TAKING)).toEqual([{ kind: "promote", from: "e7", to: "d8", captured: "br", by: "app", animated: true }]);
  });

  it("a jump of several moves is a position, not a move", async () => {
    await fresh(page, { position: START });
    await page.evaluate((fen) => T.set({ position: fen }), AFTER_E4_E5);
    await page.evaluate((fen) => T.set({ position: fen }), CASTLING);
    expect(await changes()).toEqual([
      { kind: "position", by: "app", animated: true },
      { kind: "position", by: "app", animated: true },
    ]);
  });

  it("board.move() is a change by the app", async () => {
    await fresh(page, { position: START });
    await page.evaluate(() => T.board.move("g1", "f3"));
    expect(await changes()).toEqual([{ kind: "move", from: "g1", to: "f3", by: "app", animated: true }]);
  });
});
