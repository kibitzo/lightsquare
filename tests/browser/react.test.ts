/** The React component, in StrictMode, in Chromium and WebKit. */
import type { Server } from "node:http";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROFILES, open, serve } from "./helpers";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR";
type R = { ref: { current: { position(): string } | null }; moves: unknown[]; setProps(p: unknown): void; unmount(): void };
const marks = (page: Page): Promise<string[]> => page.evaluate(() => [...document.querySelectorAll(".ls-mark")].map((el) => el.className.replace("ls-mark ls-mark-", "")).sort());
const frames = (page: Page): Promise<void> => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

let site: { server: Server; origin: string };
beforeAll(async () => {
  site = await serve();
});
afterAll(() => site.server.close());

describe.each([PROFILES[0], PROFILES[3]])("React component in $name", (profile) => {
  let browser: Browser;
  let page: Page;
  let errors: string[];

  beforeAll(async () => {
    ({ browser, page, errors } = await open(profile, site.origin, "/tests/browser/react.html"));
  });
  afterAll(() => browser.close());

  it("renders one board, even though StrictMode mounts it twice", async () => {
    const dom = await page.evaluate(() => ({
      boards: document.querySelectorAll(".ls-board").length,
      inside: !!document.querySelector(".mine > .ls-board"),
      layers: document.querySelector(".ls-board")!.children.length,
      pieces: document.querySelectorAll(".ls-piece").length,
      fen: (window as unknown as { R: R }).R.ref.current!.position(),
    }));
    expect(dom).toEqual({ boards: 1, inside: true, layers: 3, pieces: 32, fen: AFTER_E4 });
    expect(await marks(page)).toEqual(["check", "last", "last"]);
  });

  it("a new position prop slides the pieces; a prop that is left out goes back to its default", async () => {
    await page.evaluate((fen) => (window as unknown as { R: R }).R.setProps({ className: "mine", position: fen }), START);
    await frames(page);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(1);
    expect(await marks(page)).toEqual([]);
    await page.waitForFunction("document.getAnimations().length === 0");
    expect(await page.evaluate(() => (window as unknown as { R: R }).R.ref.current!.position())).toBe(START);
  });

  it("animate={false} places the pieces at once, and a new className keeps the board", async () => {
    await page.evaluate((fen) => (window as unknown as { R: R }).R.setProps({ className: "other", position: fen, animate: false }), AFTER_E4);
    await frames(page);
    expect(await page.evaluate(() => [document.getAnimations().length, !!document.querySelector(".other > .ls-board"), document.querySelectorAll(".ls-piece").length])).toEqual([0, true, 32]);
  });

  it("re-rendering with the same props touches nothing", async () => {
    const log = await page.evaluate(async (fen) => {
      const watch = P.watch(document.querySelector(".ls-board")!);
      for (let i = 0; i < 3; i++) {
        (window as unknown as { R: R }).R.setProps({ className: "other", position: fen, animate: false });
        await new Promise((r) => setTimeout(r, 20));
      }
      return watch.stop();
    }, AFTER_E4);
    expect(log).toEqual([]);
  });

  it("the user's move reaches onMove, and unmounting removes everything", async () => {
    await page.evaluate((fen) => (window as unknown as { R: R }).R.setProps({ position: fen, movable: "white" }), START);
    await frames(page);
    const squares = await page.evaluate(() => {
      const r = document.querySelector(".ls-board")!.getBoundingClientRect();
      const s = r.width / 8;
      return { from: { x: r.left + 4.5 * s, y: r.top + 6.5 * s }, to: { x: r.left + 4.5 * s, y: r.top + 4.5 * s } };
    });
    await page.mouse.click(squares.from.x, squares.from.y);
    await page.mouse.click(squares.to.x, squares.to.y);
    expect(await page.evaluate(() => (window as unknown as { R: R }).R.moves)).toEqual([{ from: "e2", to: "e4", piece: "wp" }]);
    await page.evaluate(() => (window as unknown as { R: R }).R.unmount());
    expect(await page.evaluate(() => document.getElementById("root")!.children.length)).toBe(0);
    expect(errors).toEqual([]);
  });
});
