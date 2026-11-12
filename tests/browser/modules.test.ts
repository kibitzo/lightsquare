/**
 * The optional modules, in every browser profile: arrows and circles, the
 * promotion picker, HTML on squares, and the screen-reader and keyboard
 * support.
 */
import type { Server } from "node:http";
import type { Browser, Page } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PROFILES, fresh, open, serve, settle } from "./helpers";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
type W = { A: any; drawn: unknown[]; picked: unknown[] }; // eslint-disable-line @typescript-eslint/no-explicit-any

let site: { server: Server; origin: string };
beforeAll(async () => {
  site = await serve();
});
afterAll(() => site.server.close());

describe.each(PROFILES)("modules in $name", (profile) => {
  let browser: Browser;
  let page: Page;
  let errors: string[];

  const press = async (square: string, orientation = "white"): Promise<void> => {
    const p = await page.evaluate(([s, o]) => T.point(s, o), [square, orientation]);
    if (profile.touch) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
  };
  /** Where an element is, in squares from the board's top-left. */
  const box = (selector: string, index = 0): Promise<{ left: number; top: number; right: number; bottom: number }> =>
    page.evaluate(
      ([sel, i]) => {
        const host = document.getElementById("board")!.getBoundingClientRect();
        const r = document.querySelectorAll(sel as string)[i as number].getBoundingClientRect();
        const size = host.width / 8;
        const round = (v: number) => Math.round(v * 100) / 100;
        return { left: round((r.left - host.left) / size), top: round((r.top - host.top) / size), right: round((r.right - host.left) / size), bottom: round((r.bottom - host.top) / size) };
      },
      [selector, index],
    );
  /** A right-button stroke made of pointer events, from one square to another. */
  const stroke = (from: string, to: string, keys: Record<string, boolean> = {}): Promise<void> =>
    page.evaluate(
      ([a, b, k]) => {
        const host = document.getElementById("board")!;
        const p = T.point(a as string);
        const q = T.point(b as string);
        const fire = (type: string, at: { x: number; y: number }) => host.dispatchEvent(new PointerEvent(type, { pointerId: 3, pointerType: "mouse", isPrimary: true, button: 2, clientX: at.x, clientY: at.y, bubbles: true, ...(k as object) }));
        fire("pointerdown", p);
        fire("pointermove", { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
        fire("pointermove", q);
        fire("pointerup", q);
      },
      [from, to, keys],
    );

  beforeAll(async () => {
    ({ browser, page, errors } = await open(profile, site.origin));
  });
  afterAll(() => browser.close());
  afterEach(() => {
    expect(errors).toEqual([]);
  });

  describe("shapes", () => {
    it("draws arrows from square to square, with a colour name and a label, and circles", async () => {
      await fresh(page);
      await page.evaluate(() => {
        (window as unknown as W).A = T.board.use(M.shapes({ arrows: [{ from: "e2", to: "e4" }, { from: "g1", to: "f3", name: "red", label: "1" }], circles: [{ square: "d4", name: "green" }] }));
      });
      await settle(page);
      const arrow = await box(".ls-arrow path");
      expect((arrow.left + arrow.right) / 2).toBeCloseTo(4.5, 1);
      expect(arrow.right - arrow.left).toBeCloseTo(0.54, 1);
      expect(Math.abs(arrow.top - 4.5), "the point stops in the centre of e4").toBeLessThan(0.03);
      expect(Math.abs(arrow.bottom - 6.6), "the tail is round, about the centre of e2").toBeLessThan(0.03);
      const knight = await box(".ls-arrow-red path");
      expect(Math.abs(knight.top - 5.5), "the point stops in the centre of f3").toBeLessThan(0.03);
      expect(knight.left).toBeLessThan(5.55);
      expect(knight.right).toBeGreaterThan(6.5);
      expect(knight.bottom).toBeGreaterThan(7.5);
      const label = await page.evaluate(() => {
        const group = document.querySelector(".ls-arrow-red")!;
        const head = group.querySelector("path")!.getBoundingClientRect();
        const text = group.querySelector("text")!.getBoundingClientRect();
        const size = document.getElementById("board")!.getBoundingClientRect().width / 8;
        const tip = T.point("f3");
        const centre = { x: text.left + text.width / 2, y: text.top + text.height / 2 };
        return {
          text: group.querySelector("text")!.textContent,
          discs: group.querySelectorAll("circle").length,
          light: (getComputedStyle(group.querySelector("text")!).fill.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).every((v, _i, all) => v > (Math.max(...all) <= 1 ? 0.8 : 205)),
          softEdge: Number(getComputedStyle(group.querySelector("text")!).strokeOpacity) < 0.6,
          inHead: Math.hypot(centre.x - tip.x, centre.y - tip.y) / size < 0.5 && centre.x > head.left && centre.x < head.right && centre.y > head.top && centre.y < head.bottom,
          fits: text.height / size < 0.42 && text.width / size < 0.34,
        };
      });
      expect(label).toEqual({ text: "1", discs: 0, light: true, softEdge: true, inHead: true, fits: true });
      const circle = await box(".ls-circle-green");
      expect((circle.left + circle.right) / 2).toBeCloseTo(3.5, 1);
      expect((circle.top + circle.bottom) / 2).toBeCloseTo(4.5, 1);
      const paint = await page.evaluate(() => {
        const stops = [...document.querySelectorAll(".ls-arrow stop")].slice(0, 2).map((el) => getComputedStyle(el));
        const red = getComputedStyle(document.querySelector(".ls-arrow-red stop")!);
        const path = document.querySelector(".ls-arrow path")!;
        return { colour: stops[0].stopColor, red: red.stopColor, grows: Number(stops[0].stopOpacity) < Number(stops[1].stopOpacity), filled: !!document.querySelector(path.getAttribute("fill")!.slice(4, -1)) };
      });
      expect(paint).toEqual({ colour: "rgb(234, 88, 12)", red: "rgb(185, 28, 28)", grows: true, filled: true });
    });

    it("an arrow runs from the centre of its first square to the centre of its last, in every direction", async () => {
      await fresh(page, { position: "empty" });
      const far = await page.evaluate(async () => {
        const targets = ["d8", "h8", "h4", "h1", "d1", "a1", "a4", "a7", "f5", "e6", "c3", "b5"];
        T.board.use(M.shapes({ arrows: targets.map((to) => ({ from: "d4", to })) }));
        await new Promise((r) => setTimeout(r, 400));
        const size = document.getElementById("board")!.getBoundingClientRect().width / 8;
        const origin = T.point("d4");
        const round = (v: number): number => Math.round(v * 100) / 100;
        return [...document.querySelectorAll(".ls-arrow path")].map((el, i) => {
          const tip = T.point(targets[i]);
          const r = el.getBoundingClientRect();
          const beyond = Math.max(tip.x - r.right, r.left - tip.x, tip.y - r.bottom, r.top - tip.y) / size;
          const short = Math.min(Math.abs(tip.x - r.right), Math.abs(tip.x - r.left), Math.abs(tip.y - r.bottom), Math.abs(tip.y - r.top)) / size;
          const holdsOrigin = origin.x > r.left && origin.x < r.right && origin.y > r.top && origin.y < r.bottom;
          return { to: targets[i], beyond: round(beyond), short: round(short), holdsOrigin };
        });
      });
      for (const a of far) {
        expect(a.beyond, `${a.to}: nothing reaches past the centre of the target`).toBeLessThanOrEqual(0.02);
        expect(a.short, `${a.to}: the point reaches the centre of the target`).toBeLessThanOrEqual(0.02);
        expect(a.holdsOrigin, `${a.to}: the tail covers the centre of the first square`).toBe(true);
      }
    });

    it("a change touches only the shapes that changed", async () => {
      await fresh(page);
      const log = await page.evaluate(() => {
        const A = T.board.use(M.shapes({ arrows: [{ from: "e2", to: "e4" }, { from: "d2", to: "d4" }] }));
        const first = document.querySelector(".ls-arrow")!;
        const watch = P.watch(document.querySelector(".ls-shapes")!);
        A.set({ arrows: [{ from: "e2", to: "e4" }, { from: "b1", to: "c3" }] });
        A.set({ arrows: [{ from: "e2", to: "e4" }, { from: "b1", to: "c3" }] });
        return { log: watch.stop().sort(), same: document.querySelector(".ls-arrow") === first, count: document.querySelectorAll(".ls-arrow").length };
      });
      expect(log).toEqual({ log: ["childList:add", "childList:remove"], same: true, count: 2 });
    });

    it("pieces move under the shapes without the shapes being touched", async () => {
      await fresh(page);
      const log = await page.evaluate(() => {
        T.board.use(M.shapes({ arrows: [{ from: "e2", to: "e4" }], circles: [{ square: "e4" }] }));
        const watch = P.watch(document.querySelector(".ls-shapes")!);
        T.set({ position: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR", lastMove: ["e2", "e4"] });
        T.board.move("g8", "f6");
        T.set({ movable: "white" });
        return watch.stop();
      });
      expect(log).toEqual([]);
    });

    it("turns with the board and scales with it, with no script on resize", async () => {
      await fresh(page);
      await page.evaluate(() => {
        T.board.use(M.shapes({ arrows: [{ from: "e2", to: "e4" }] }));
        T.set({ orientation: "black" });
      });
      await settle(page);
      const flipped = await box(".ls-arrow path");
      expect((flipped.left + flipped.right) / 2).toBeCloseTo(3.5, 1);
      expect(flipped.top).toBeCloseTo(1.4, 1);
      expect(flipped.bottom).toBeCloseTo(3.5, 1);
      const log = await page.evaluate(() => {
        const watch = P.watch(document.getElementById("board")!);
        document.getElementById("wrap")!.style.width = "240px";
        return watch.stop();
      });
      const small = await box(".ls-arrow path");
      await page.evaluate(() => (document.getElementById("wrap")!.style.width = ""));
      expect(log).toEqual([]);
      expect(small.top).toBeCloseTo(1.4, 1);
      expect(small.bottom).toBeCloseTo(3.5, 1);
    });

    it("the user draws with the right button: arrows and circles toggle, a left press clears", async () => {
      await fresh(page, { movable: "white" });
      await page.evaluate(() => {
        const w = window as unknown as W;
        w.drawn = [];
        w.A = T.board.use(M.shapes({ draw: true, onDraw: (d: unknown) => w.drawn.push(d) }));
      });
      await stroke("e2", "e4");
      await stroke("d5", "d5");
      await stroke("g1", "f3", { shiftKey: true });
      expect(await page.evaluate(() => (window as unknown as W).A.drawing())).toEqual({
        arrows: [{ from: "e2", to: "e4", name: "green" }, { from: "g1", to: "f3", name: "yellow" }],
        circles: [{ square: "d5", name: "green" }],
      });
      expect(await page.evaluate(() => [document.querySelectorAll(".ls-arrow").length, document.querySelectorAll(".ls-circle").length, document.querySelectorAll(".ls-arrow-yellow").length])).toEqual([2, 1, 1]);
      expect(await page.evaluate(() => T.events)).toEqual([]);
      await stroke("e2", "e4");
      await stroke("d5", "d5");
      expect(await page.evaluate(() => (window as unknown as W).A.drawing())).toEqual({ arrows: [{ from: "g1", to: "f3", name: "yellow" }], circles: [] });
      await press("a5");
      expect(await page.evaluate(() => (window as unknown as W).A.drawing())).toEqual({ arrows: [], circles: [] });
      expect(await page.evaluate(() => document.querySelectorAll(".ls-arrow, .ls-circle").length)).toBe(0);
      expect(await page.evaluate(() => (window as unknown as W).drawn.length)).toBe(6);
    });

    it("shows the arrow being drawn, and keeps the browser's menu away only while drawing is on", async () => {
      await fresh(page);
      const result = await page.evaluate(() => {
        const host = document.getElementById("board")!;
        const menu = (): boolean => !host.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
        const before = menu();
        const A = T.board.use(M.shapes({ draw: true }));
        const p = T.point("a2");
        const q = T.point("a4");
        const fire = (type: string, at: { x: number; y: number }) => host.dispatchEvent(new PointerEvent(type, { pointerId: 3, pointerType: "mouse", isPrimary: true, button: 2, clientX: at.x, clientY: at.y, bubbles: true }));
        fire("pointerdown", p);
        fire("pointermove", q);
        const aimed = document.querySelector(".ls-arrow-preview");
        const preview = document.querySelectorAll(".ls-arrow").length;
        const slim = aimed!.querySelector("path")!.getBoundingClientRect().width;
        const stored = A.drawing().arrows.length;
        fire("pointerup", q);
        const full = document.querySelector(".ls-arrow path")!.getBoundingClientRect().width;
        return { before, during: menu(), preview, stored, after: A.drawing().arrows.length, left: document.querySelectorAll(".ls-arrow-preview").length, grows: full > slim };
      });
      expect(result).toEqual({ before: false, during: true, preview: 1, stored: 0, after: 1, left: 0, grows: true });
    });

    it("is still at rest once drawn, and leaves nothing behind when the board is destroyed", async () => {
      await fresh(page);
      await page.evaluate(() => void T.board.use(M.shapes({ arrows: [{ from: "e2", to: "e4" }], draw: true })));
      await page.waitForTimeout(400);
      await page.evaluate(() => P.reset());
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => ({ raf: P.raf, timers: P.timers, reads: P.reads, animations: document.getAnimations().length }))).toEqual({ raf: 0, timers: 0, reads: 0, animations: 0 });
      const left = await page.evaluate(() => {
        const host = document.getElementById("board")!;
        T.board.destroy();
        const out = { svg: host.querySelectorAll("svg").length, menu: !host.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })) };
        T.make();
        return out;
      });
      expect(left).toEqual({ svg: 0, menu: false });
    });
  });

  describe("promotion", () => {
    const ask = (square: string, color: string): Promise<void> =>
      page.evaluate(
        ([s, c]) => {
          const w = window as unknown as W;
          w.picked = [];
          w.A ??= null;
          void w.A.ask(s, c).then((piece: unknown) => w.picked.push(piece));
        },
        [square, color],
      );
    const picked = (): Promise<unknown[]> => page.evaluate(() => (window as unknown as W).picked);
    const use = (): Promise<void> => page.evaluate(() => void ((window as unknown as W).A = T.board.use(M.promotion())));

    it("the picker is one panel, a square wide and four squares tall, carved from the board", async () => {
      await fresh(page, { position: "8/4P3/8/8/8/8/8/k6K" });
      await use();
      await ask("e8", "white");
      const panel = await box(".ls-picker");
      expect([panel.left, panel.top, panel.right, panel.bottom]).toEqual([4, 0, 5, 4]);
      expect(await page.evaluate(() => getComputedStyle(document.querySelector(".ls-promotion")!).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
      await page.evaluate(() => (window as unknown as W).A.cancel());
      await ask("d1", "white");
      const up = await box(".ls-picker");
      expect([up.left, up.top, up.right, up.bottom]).toEqual([3, 4, 4, 8]);
      await page.evaluate(() => (window as unknown as W).A.cancel());
    });

    it("offers four pieces from the promotion square inwards, as buttons with names", async () => {
      await fresh(page, { position: "8/4P3/8/8/8/8/8/k6K" });
      await use();
      await ask("e8", "white");
      const choices = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>(".ls-choice")].map((el) => `${el.tagName} ${el.className.replace("ls-choice ", "")} ${el.getAttribute("aria-label")} ${T.squareOf(el)} ${getComputedStyle(el).backgroundImage !== "none"}`),
      );
      expect(choices).toEqual(["BUTTON ls-wq Queen e8 true", "BUTTON ls-wn Knight e7 true", "BUTTON ls-wr Rook e6 true", "BUTTON ls-wb Bishop e5 true"]);
      expect(await page.evaluate(() => document.activeElement?.className)).toBe("ls-choice ls-wq");
      expect(await page.evaluate(() => (window as unknown as W).A.isOpen())).toBe(true);
      await press("e6");
      expect(await picked()).toEqual(["r"]);
      expect(await page.evaluate(() => document.querySelectorAll(".ls-promotion, .ls-choice").length)).toBe(0);
    });

    it("opens towards the middle from the bottom edge too", async () => {
      await fresh(page, { position: "K6k/8/8/8/8/8/3p4/8" });
      await use();
      await ask("d1", "black");
      expect(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".ls-choice")].map((el) => `${el.className.slice(-2)} ${T.squareOf(el)}`))).toEqual(["bq d1", "bn d2", "br d3", "bb d4"]);
      await press("d2");
      expect(await picked()).toEqual(["n"]);
    });

    it("a press beside the pieces cancels, and the board underneath does not react", async () => {
      await fresh(page, { movable: "white" });
      await use();
      await ask("e8", "white");
      await press("e2");
      expect(await picked()).toEqual([null]);
      expect(await page.evaluate(() => T.events)).toEqual([]);
      expect(await page.evaluate(() => T.marks())).toEqual([]);
    });

    it("Escape cancels, a second question cancels the first, a flip cancels, destroy cancels", async () => {
      await fresh(page);
      await use();
      await ask("e8", "white");
      await page.keyboard.press("Escape");
      expect(await picked()).toEqual([null]);
      const order = await page.evaluate(async () => {
        const A = (window as unknown as W).A;
        const out: unknown[] = [];
        void A.ask("a8", "white").then((p: unknown) => out.push(["first", p]));
        void A.ask("h8", "white").then((p: unknown) => out.push(["second", p]));
        await Promise.resolve();
        const open = document.querySelectorAll(".ls-choice").length;
        T.set({ orientation: "black" });
        await Promise.resolve();
        void A.ask("h8", "white").then((p: unknown) => out.push(["third", p]));
        T.board.destroy();
        await Promise.resolve();
        T.make();
        return { out, open };
      });
      expect(order).toEqual({ out: [["first", null], ["second", null], ["third", null]], open: 4 });
    });
  });

  describe("overlay", () => {
    it("puts your HTML on a square, follows a flip, and takes its own presses", async () => {
      await fresh(page, { movable: "white" });
      await page.evaluate(() => {
        const w = window as unknown as W & { clicks: number };
        w.clicks = 0;
        w.A = T.board.use(M.overlay());
        const button = document.createElement("button");
        button.id = "mine";
        button.textContent = "?";
        button.style.cssText = "width:100%;height:100%";
        button.onclick = () => w.clicks++;
        w.A.put("tip", "e2", button);
      });
      const at = await box("#mine");
      expect([at.left, at.top, at.right, at.bottom]).toEqual([4, 6, 5, 7]);
      await press("e2");
      expect(await page.evaluate(() => (window as unknown as { clicks: number }).clicks)).toBe(1);
      expect(await page.evaluate(() => T.events)).toEqual([]);
      await page.evaluate(() => T.set({ orientation: "black" }));
      const flipped = await box("#mine");
      expect([flipped.left, flipped.top]).toEqual([3, 1]);
      await page.evaluate(() => (window as unknown as W).A.put("tip", "a1", document.getElementById("mine")));
      const moved = await box("#mine");
      expect([moved.left, moved.top]).toEqual([7, 0]);
      expect(await page.evaluate(() => document.querySelectorAll(".ls-anchor").length)).toBe(1);
      expect(await page.evaluate(() => document.querySelector(".ls-anchor")!.className), "in the screen's top-right corner it says so").toBe("ls-anchor ls-at-top ls-at-right");
      expect(await page.evaluate(() => getComputedStyle(document.getElementById("board")!).containerName), "an app's stylesheet can ask for the board's size by name").toBe("lightsquare");
      await page.evaluate(() => (window as unknown as W).A.remove("tip"));
      expect(await page.evaluate(() => document.querySelectorAll(".ls-anchor, #mine").length)).toBe(0);
    });
  });

  describe("a11y", () => {
    it("names the board and describes every piece for a screen reader", async () => {
      await fresh(page);
      const result = await page.evaluate(() => {
        const A = T.board.use(M.a11y({ label: "Puzzle board" }));
        const host = document.getElementById("board")!;
        return { role: host.getAttribute("role"), label: host.getAttribute("aria-label"), described: document.getElementById(host.getAttribute("aria-describedby")!)!.textContent, same: A.description(), tab: host.tabIndex };
      });
      expect(result.role).toBe("group");
      expect(result.label).toBe("Puzzle board");
      expect(result.tab).toBe(0);
      expect(result.described).toBe(result.same);
      expect(result.described).toBe(
        "White: king e1, queen d1, rook a1, rook h1, bishop c1, bishop f1, knight b1, knight g1, pawn a2, pawn b2, pawn c2, pawn d2, pawn e2, pawn f2, pawn g2, pawn h2. " +
          "Black: king e8, queen d8, rook a8, rook h8, bishop c8, bishop f8, knight b8, knight g8, pawn a7, pawn b7, pawn c7, pawn d7, pawn e7, pawn f7, pawn g7, pawn h7.",
      );
    });

    it("announces each move, in your words if you give them", async () => {
      await fresh(page, { position: "4k3/8/8/3p4/4P3/8/8/4K3" });
      const said = await page.evaluate(() => {
        T.board.use(M.a11y({ words: { white: "Blanc", p: "pion", takes: "prend" } }));
        const live = document.querySelector("[aria-live]")!;
        const out: Array<string | null> = [];
        T.set({ position: "4k3/8/8/3p4/4P3/8/8/3K4", lastMove: ["e1", "d1"] });
        out.push(live.textContent);
        T.set({ position: "4k3/8/8/3P4/8/8/8/3K4", lastMove: ["e4", "d5"] });
        out.push(live.textContent);
        return { out, text: document.querySelector(".ls-sr")!.textContent };
      });
      expect(said.out).toEqual(["Blanc king, e1 to d1", "Blanc pion, e4 prend d5"]);
      expect(said.text).toBe("Blanc: king d1, pion d5. Black: king e8.");
    });

    it("plays a move with the keyboard: arrows, Enter, Enter", async () => {
      await fresh(page, { movable: "white", targets: { e2: ["e3", "e4"] } });
      await page.evaluate(() => {
        T.board.use(M.a11y());
        document.getElementById("board")!.focus();
      });
      await page.keyboard.press("ArrowUp");
      expect(await page.evaluate(() => [(document.querySelector(".ls-cursor") as HTMLElement).style.transform, document.querySelector("[aria-live]")!.textContent])).toEqual(["translate(50cqw, 75cqw)", "e2, White pawn"]);
      await page.keyboard.press("Enter");
      expect(await page.evaluate(() => T.marks())).toEqual(["dot e3", "dot e4", "select e2"]);
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press(" ");
      await settle(page);
      expect(await page.evaluate(() => T.events.filter((e) => e.type === "move"))).toEqual([{ type: "move", from: "e2", to: "e4", piece: "wp" }]);
      expect(await page.evaluate(() => T.seen())).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");
      expect(await page.evaluate(() => document.querySelector("[aria-live]")!.textContent)).toBe("a4, empty");
    });

    it("after a press with the mouse or a finger, the arrow keys are left to the page", async () => {
      await fresh(page, { movable: "white" });
      await page.evaluate(() => {
        T.board.use(M.a11y());
        const w = window as unknown as { pageKeys: string[] };
        w.pageKeys = [];
        document.addEventListener("keydown", (e) => !e.defaultPrevented && w.pageKeys.push(e.key));
        document.getElementById("board")!.focus();
      });
      await page.keyboard.press("ArrowUp");
      expect(await page.evaluate(() => [document.querySelectorAll(".ls-cursor").length, (window as unknown as { pageKeys: string[] }).pageKeys.length])).toEqual([1, 0]);
      await press("a5");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowRight");
      expect(await page.evaluate(() => [document.querySelectorAll(".ls-cursor").length, (window as unknown as { pageKeys: string[] }).pageKeys])).toEqual([0, ["ArrowLeft", "ArrowRight"]]);
      // The whole window loses focus and gets it back (the user looked at another app): the board stays the page's active element, and the keys stay the page's.
      await page.evaluate(() => {
        const board = document.getElementById("board")!;
        board.dispatchEvent(new FocusEvent("blur"));
        board.dispatchEvent(new FocusEvent("focus"));
      });
      await page.keyboard.press("ArrowRight");
      expect(await page.evaluate(() => [document.querySelectorAll(".ls-cursor").length, (window as unknown as { pageKeys: string[] }).pageKeys])).toEqual([0, ["ArrowLeft", "ArrowRight", "ArrowRight"]]);
      await page.evaluate(() => {
        document.getElementById("board")!.blur();
        document.getElementById("board")!.focus();
      });
      await page.keyboard.press("ArrowUp");
      expect(await page.evaluate(() => document.querySelectorAll(".ls-cursor").length)).toBe(1);
    });

    it("the keyboard cursor is four corner brackets in the selection's colour, not a browser-blue frame", async () => {
      await fresh(page, { movable: "white" });
      const look = await page.evaluate(() => {
        T.board.use(M.a11y());
        document.getElementById("board")!.focus();
        document.getElementById("board")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
        const style = getComputedStyle(document.querySelector(".ls-cursor")!);
        return { layers: style.backgroundImage.split("linear-gradient").length - 1, amber: style.backgroundImage.includes("245, 158, 11"), border: style.borderTopWidth, outline: getComputedStyle(document.getElementById("board")!).outlineStyle };
      });
      expect(look).toEqual({ layers: 8, amber: true, border: "0px", outline: "none" });
    });

    it("Escape unselects, and the board is as it was once the module is gone", async () => {
      await fresh(page, { movable: "white" });
      await page.evaluate(() => {
        T.board.use(M.a11y());
        document.getElementById("board")!.focus();
      });
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      expect(await page.evaluate(() => T.marks())).toEqual(["select e2"]);
      await page.keyboard.press("Escape");
      expect(await page.evaluate(() => T.marks())).toEqual([]);
      const left = await page.evaluate(() => {
        const host = document.getElementById("board")!;
        T.board.destroy();
        const out = { attrs: host.getAttributeNames().sort().join(" "), extra: host.children.length };
        T.make();
        return out;
      });
      expect(left).toEqual({ attrs: "class id", extra: 0 });
      const off = await page.evaluate(() => {
        T.board.use(M.a11y({ keyboard: false }));
        return document.getElementById("board")!.hasAttribute("tabindex");
      });
      expect(off).toBe(false);
    });
  });

  describe("looks", () => {
    const look = (): Promise<Record<string, string>> =>
      page.evaluate(() => {
        const host = document.getElementById("board")!;
        const piece = getComputedStyle(host.querySelector(".ls-wk")!);
        return {
          light: getComputedStyle(host).backgroundColor,
          dark: getComputedStyle(host.querySelector(".ls-squares")!).fill,
          last: getComputedStyle(host.querySelector(".ls-mark-last")!).backgroundColor,
          king: piece.backgroundImage.slice(0, 23),
          size: piece.backgroundSize,
          arrow: getComputedStyle(host.querySelector(".ls-arrow stop")!).stopColor,
          red: getComputedStyle(host.querySelector(".ls-arrow-red stop")!).stopColor,
          mine: getComputedStyle(host.querySelector(".ls-arrow-mine stop")!).stopColor,
          tail: getComputedStyle(host.querySelector(".ls-arrow stop")!).stopOpacity,
        };
      });
    const setUp = async (): Promise<void> => {
      await fresh(page, { lastMove: ["e2", "e4"] });
      await page.evaluate(() => void T.board.use(M.shapes({ arrows: [{ from: "a2", to: "a4" }, { from: "b2", to: "b4", name: "red" }, { from: "c2", to: "c4", name: "mine" }] })));
    };

    it("out of the box: the wood board, the Cburnett pieces, orange and deep red arrows", async () => {
      await setUp();
      expect(await look()).toEqual({
        light: "rgb(236, 218, 185)",
        dark: "rgb(197, 160, 118)",
        last: "rgba(255, 235, 0, 0.5)",
        king: 'url("data:image/svg+xml',
        size: "100% 100%",
        arrow: "rgb(234, 88, 12)",
        red: "rgb(185, 28, 28)",
        mine: "rgb(234, 88, 12)",
        tail: "0.14",
      });
    });

    it("a theme on any element above the board changes squares, marks, pieces and arrows, with no script per board", async () => {
      await setUp();
      const log = await page.evaluate(() => {
        const watch = P.watch(document.getElementById("board")!);
        M.applyTheme(document.documentElement, { ...M.themes().ocean, lastMove: "rgba(0, 200, 0, 0.4)", pieces: "discs", pieceSize: 0.8, shapes: { default: "#7c3aed", red: "#ff0000", mine: "#00ffff" }, arrowTail: 0.3 });
        return watch.stop();
      });
      expect(log).toEqual([]);
      expect(await look()).toEqual({
        light: "rgb(221, 232, 241)",
        dark: "rgb(106, 143, 181)",
        last: "rgba(0, 200, 0, 0.4)",
        king: "radial-gradient(rgb(255",
        size: "80% 80%",
        arrow: "rgb(124, 58, 237)",
        red: "rgb(255, 0, 0)",
        mine: "rgb(0, 255, 255)",
        tail: "0.3",
      });
    });

    it("the next theme replaces the one before; an empty theme brings the defaults back", async () => {
      await setUp();
      await page.evaluate(() => {
        M.applyTheme(document.documentElement, { ...M.themes().ocean, pieces: "discs", shapes: { red: "#ff0000" } });
        M.applyTheme(document.documentElement, M.themes().forest);
      });
      const forest = await look();
      expect([forest.light, forest.dark, forest.king, forest.red]).toEqual(["rgb(230, 234, 210)", "rgb(111, 143, 90)", 'url("data:image/svg+xml', "rgb(185, 28, 28)"]);
      await page.evaluate(() => M.applyTheme(document.documentElement, {}));
      const plain = await look();
      expect([plain.light, plain.dark]).toEqual(["rgb(236, 218, 185)", "rgb(197, 160, 118)"]);
      expect(await page.evaluate(() => [document.documentElement.getAttribute("style") ?? "", document.documentElement.className])).toEqual(["", ""]);
    });

    it("a theme on the board itself wins over one on the page", async () => {
      await setUp();
      await page.evaluate(() => {
        M.applyTheme(document.documentElement, M.themes().ocean);
        M.applyTheme(document.getElementById("board")!, M.themes().rose);
      });
      expect((await look()).dark).toBe("rgb(196, 140, 130)");
      await page.evaluate(() => {
        M.applyTheme(document.documentElement, {});
        M.applyTheme(document.getElementById("board")!, {});
      });
    });

    it("circles follow the arrows' colours unless they are given their own", async () => {
      await fresh(page);
      const seen = await page.evaluate(() => {
        T.board.use(M.shapes({ circles: [{ square: "a4" }, { square: "b4", name: "red" }, { square: "c4", name: "green" }] }));
        const read = (): string[] => [...document.querySelectorAll(".ls-circle")].map((el) => getComputedStyle(el).stroke);
        const before = read();
        M.applyTheme(document.getElementById("wrap")!, { shapes: { default: "rgb(1, 1, 1)", red: "rgb(2, 2, 2)" }, circles: { red: "rgb(3, 3, 3)", green: "rgb(4, 4, 4)" } });
        const after = read();
        M.applyTheme(document.getElementById("wrap")!, {});
        return { before, after };
      });
      expect(seen.before).toEqual(["rgb(234, 88, 12)", "rgb(185, 28, 28)", "rgb(4, 120, 87)"]);
      expect(seen.after).toEqual(["rgb(1, 1, 1)", "rgb(3, 3, 3)", "rgb(4, 4, 4)"]);
    });

    it("the selected square has a tint and a frame, both in the theme", async () => {
      await fresh(page, { movable: "white" });
      const seen = await page.evaluate(() => {
        T.board.select("e2");
        const read = (): string[] => {
          const style = getComputedStyle(document.querySelector(".ls-mark-select")!);
          return [style.backgroundColor, style.boxShadow.replace(/\s+/g, " ").includes("inset") ? "framed" : "plain", style.boxShadow.match(/rgba?\([^)]+\)/)?.[0] ?? ""];
        };
        const before = read();
        M.applyTheme(document.getElementById("wrap")!, { selected: "rgba(0, 0, 255, 0.3)", selectedEdge: "rgb(0, 0, 255)" });
        const after = read();
        M.applyTheme(document.getElementById("wrap")!, {});
        return { before, after };
      });
      expect(seen.before).toEqual(["rgba(245, 158, 11, 0.2)", "framed", "rgba(245, 158, 11, 0.9)"]);
      expect(seen.after).toEqual(["rgba(0, 0, 255, 0.3)", "framed", "rgb(0, 0, 255)"]);
    });

    it("arrows can be made thicker and their heads larger", async () => {
      await fresh(page);
      const widths = await page.evaluate(() => {
        const A = T.board.use(M.shapes({ arrows: [{ from: "a2", to: "a5" }] }));
        const width = (): number => Math.round((document.querySelector(".ls-arrow path") as SVGPathElement).getBBox().width * 100) / 100;
        const before = width();
        A.set({ look: { width: 0.3, headWidth: 0.8, headLength: 0.6 } });
        return { before, after: width(), count: document.querySelectorAll(".ls-arrow").length };
      });
      expect(widths).toEqual({ before: 0.54, after: 0.8, count: 1 });
    });
  });

  it("premove targets from the geometry module drive the board", async () => {
    await fresh(page, { movable: "none", premovable: "white" });
    await page.evaluate((fen) => T.board.set({ premoveTargets: M.premoveTargets(fen, "white") }), START);
    await press("g1");
    expect(await page.evaluate(() => T.marks())).toEqual(["dot f3", "dot h3", "ring e2", "select g1"]);
    await press("e2");
    expect(await page.evaluate(() => T.marks())).toEqual(["premove e2", "premove g1"]);
  });
});
