/**
 * What the board tells about a change of the pieces (`onChange`), and the
 * sound module that listens to it, in every browser profile.
 *
 * The sounds are checked against a stand-in for the browser's audio, so a
 * test can see which sound was started and a machine without a sound card
 * gives the same answer. One test at the end plays through the real audio
 * of Chromium, to see that the calls made to it are valid.
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

/** How long each built-in sound is, in milliseconds: that is how a test tells them apart. */
const LENGTH = { move: 180, capture: 240, castle: 270, check: 280, promote: 470, end: 1450, file: 50 };

type Change = { kind: string; from?: string; to?: string; captured?: string; by: string; animated: boolean };
type W = { changes: Change[]; board: { set(o: unknown, how?: unknown): void; move(a: string, b: string): void; use(m: unknown): any }; set(o: unknown, how?: unknown): void }; // eslint-disable-line @typescript-eslint/no-explicit-any
declare const T: W;
declare const M: { sounds(o?: unknown): unknown };

/** A stand-in for the browser's audio. Every started sound is noted by its length in milliseconds. */
const FAKE_AUDIO = `
  window.S = { started: [], gains: [], closed: 0 };
  window.AudioContext = class {
    constructor() { this.state = "suspended"; this.sampleRate = 8000; this.destination = {}; }
    resume() { this.state = "running"; return Promise.resolve(); }
    close() { S.closed++; return Promise.resolve(); }
    createBuffer(channels, length, rate) { return { duration: length / rate, getChannelData: () => new Float32Array(length) }; }
    decodeAudioData(bytes) { return Promise.resolve({ duration: bytes.byteLength / 1000 }); }
    createGain() { return { gain: { value: 1 }, connect: (to) => to }; }
    createBufferSource() {
      const source = { buffer: null, connect: (to) => { S.gains.push(to.gain.value); return to; }, start: () => S.started.push(Math.round(source.buffer.duration * 1000)) };
      return source;
    }
  };
`;

let site: { server: Server; origin: string };
beforeAll(async () => {
  site = await serve();
});
afterAll(() => site.server.close());

describe.each(PROFILES)("changes and sounds in $name", (profile) => {
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
  const started = (): Promise<number[]> => page.evaluate(() => (window as unknown as { S: { started: number[] } }).S.started.splice(0));
  /** A fresh board with the sound module on the stand-in audio, already let free by one press. */
  const withSound = async (options: Record<string, unknown>, sound: Record<string, unknown> = {}): Promise<void> => {
    await fresh(page, options);
    await page.evaluate(
      ([fake, o]) => {
        new Function(fake as string)();
        (window as unknown as { A: unknown }).A = T.board.use(M.sounds(o));
      },
      [FAKE_AUDIO, sound] as const,
    );
    await page.keyboard.press("Shift");
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  };

  beforeAll(async () => {
    ({ browser, page, errors } = await open(profile, site.origin));
  });
  afterAll(() => browser.close());
  afterEach(() => {
    expect(errors).toEqual([]);
  });

  describe("what the board tells", () => {
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

  describe("the sound module", () => {
    it("is silent until the user has pressed something", async () => {
      await fresh(page, { position: START });
      await page.evaluate(
        ([fake, fen]) => {
          new Function(fake)();
          T.board.use(M.sounds());
          T.set({ position: fen });
        },
        [FAKE_AUDIO, AFTER_E4],
      );
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
      expect(await started()).toEqual([]);
    });

    it("gives each kind of move of the user its own sound, once", async () => {
      for (const [position, from, to, sound] of [
        [START, "e2", "e4", LENGTH.move],
        ["4k3/8/8/3p4/4P3/8/8/4K3", "e4", "d5", LENGTH.capture],
        [CASTLING, "e1", "g1", LENGTH.castle],
        [PROMOTING, "e7", "e8", LENGTH.promote],
      ] as const) {
        await withSound({ position, movable: "white" });
        await play(from, to);
        expect(await started(), `${from}${to}`).toEqual([sound]);
      }
    });

    it("the app's answer to a move makes no second sound", async () => {
      await withSound({ position: CASTLING, movable: "white" });
      await page.evaluate((fen) => T.board.set({ onMove: () => T.board.set({ position: fen }) }), CASTLED);
      await play("e1", "g1");
      expect(await started()).toEqual([LENGTH.castle]);
    });

    it("a check takes the place of the move's sound, when the app says so in its answer", async () => {
      await withSound({ position: START, movable: "white" });
      await page.evaluate((fen) => T.board.set({ onMove: () => T.board.set({ position: fen, check: "e8" }) }), AFTER_E4);
      await play("e2", "e4");
      expect(await started()).toEqual([LENGTH.check]);
    });

    it("a king that only stays in check does not sound like a new check", async () => {
      await withSound({ position: START, movable: "white", check: "e1" });
      await page.evaluate((fen) => T.board.set({ onMove: () => T.board.set({ position: fen, check: "e1" }) }), AFTER_E4);
      await play("e2", "e4");
      expect(await started()).toEqual([LENGTH.move]);
    });

    it("a check that the app tells later, on its own, has its sound", async () => {
      await withSound({ position: START, movable: "white" });
      await play("e2", "e4");
      expect(await started()).toEqual([LENGTH.move]);
      await page.evaluate(() => T.set({ check: "e8" }));
      expect(await started()).toEqual([LENGTH.check]);
      await page.evaluate(() => T.set({ check: "e8", orientation: "black" }));
      expect(await started()).toEqual([]);
    });

    it("a position the app slides in sounds; one shown at once, or a jump, does not", async () => {
      await withSound({ position: START });
      await page.evaluate((fen) => T.set({ position: fen }), AFTER_E4);
      await page.evaluate(() => Promise.resolve());
      expect(await started()).toEqual([LENGTH.move]);
      await page.evaluate((fen) => T.set({ position: fen }, { animate: false }), AFTER_E4_E5);
      await page.evaluate((fen) => T.set({ position: fen, check: "e1" }, { animate: false }), START);
      await page.evaluate((fen) => T.set({ position: fen }), CASTLING);
      await page.evaluate(() => Promise.resolve());
      expect(await started()).toEqual([]);
    });

    it("play() takes the place of the sound of a change made in the same task, and any name without a sound is left alone", async () => {
      await withSound({ position: START });
      await page.evaluate(() => {
        const audio = (window as unknown as { A: { play(n: string): void } }).A;
        T.board.move("e2", "e4");
        audio.play("end");
        audio.play("no such sound");
      });
      await page.evaluate(() => Promise.resolve());
      expect(await started()).toEqual([LENGTH.end]);
    });

    it("can be muted and made quieter", async () => {
      await withSound({ position: START }, { volume: 0.25 });
      await page.evaluate((fen) => T.set({ position: fen }), AFTER_E4);
      await page.evaluate(() => Promise.resolve());
      expect(await page.evaluate(() => (window as unknown as { S: { gains: number[] } }).S.gains)).toEqual([0.25]);
      await started();
      await page.evaluate((fen) => {
        (window as unknown as { A: { set(o: unknown): void } }).A.set({ muted: true });
        T.set({ position: fen });
      }, AFTER_E4_E5);
      await page.evaluate(() => Promise.resolve());
      expect(await started()).toEqual([]);
    });

    it("plays the app's own file for a name, and keeps the built-in sound for the others", async () => {
      const file = `data:application/octet-stream;base64,${Buffer.alloc(LENGTH.file).toString("base64")}`;
      await withSound({ position: "4k3/8/8/3p4/4P3/8/8/4K3", movable: "white" }, { files: { move: file } });
      await page.waitForTimeout(150);
      await play("e1", "e2");
      expect(await started()).toEqual([LENGTH.file]);
      await page.evaluate(() => T.set({ position: "4k3/8/8/3p4/4P3/8/8/4K3" }, { animate: false }));
      await play("e4", "d5");
      expect(await started()).toEqual([LENGTH.capture]);
    });

    it("leaves nothing behind when the board is destroyed", async () => {
      await withSound({ position: START });
      await page.evaluate(() => (T.board as unknown as { destroy(): void }).destroy());
      expect(await page.evaluate(() => (window as unknown as { S: { closed: number } }).S.closed)).toBe(1);
      await page.keyboard.press("Shift");
      await fresh(page, { position: START });
    });
  });

  it.runIf(profile.name === "Chromium desktop")("plays through the browser's real audio without an error", async () => {
    await page.reload();
    await page.waitForFunction("window.ready === true");
    await fresh(page, { position: START, movable: "white" });
    await page.evaluate(() => {
      const w = window as unknown as { real: number[] };
      w.real = [];
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args: []) {
        w.real.push(Math.round(this.buffer!.duration * 1000));
        return start.apply(this, args);
      };
      T.board.use(M.sounds());
    });
    await play("e2", "e4");
    await page.waitForTimeout(100);
    await page.evaluate(() => T.board.move("d7", "d5"));
    await page.waitForTimeout(100);
    const real = await page.evaluate(() => (window as unknown as { real: number[] }).real);
    // The first press both frees the audio and makes the move: its sound may come too early to be heard. The next one must play.
    expect(real.at(-1)).toBe(LENGTH.move);
  });
});
