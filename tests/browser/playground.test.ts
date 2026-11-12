/**
 * The presentation page itself (bench/): what a visitor sees and does. The
 * library's tests prove the board; these prove the page built on it, where
 * the page's own stylesheet and script can break things the library cannot
 * know about (a check halo drawn on the wrong square was the first such bug).
 */
import type { Server } from "node:http";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PROFILES, open } from "./helpers";

let site: { server: Server; port: number };
beforeAll(async () => {
  const { startServer } = (await import("../../bench/server.mjs" as string)) as { startServer(o: object): Promise<{ server: Server; port: number }> };
  site = await startServer({ port: 0, host: "127.0.0.1", pieces: undefined, quiet: true });
});
afterAll(() => site.server.close());

describe.each([PROFILES[0], PROFILES[1], PROFILES[2]])("the page in $name", (profile) => {
  let browser: Browser;
  let page: Page;
  let errors: string[];

  /** The square under the centre of the first element that matches, as a user sees it. */
  const squareOf = (selector: string): Promise<string | null> =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const host = document.getElementById("board")!.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const size = host.width / 8;
      return `${"abcdefgh"[Math.floor((r.left + r.width / 2 - host.left) / size)]}${8 - Math.floor((r.top + r.height / 2 - host.top) / size)}`;
    }, selector);
  const pieceOn = (square: string, code: string): Promise<boolean> =>
    page.evaluate(
      ([sq, c]) => {
        const host = document.getElementById("board")!.getBoundingClientRect();
        const size = host.width / 8;
        return [...document.querySelectorAll(`.ls-piece.ls-${c}:not(.ls-gone)`)].some((el) => {
          const r = el.getBoundingClientRect();
          return `${"abcdefgh"[Math.round((r.left - host.left) / size)]}${8 - Math.round((r.top - host.top) / size)}` === sq;
        });
      },
      [square, code],
    );
  const steps = async (count: number): Promise<void> => {
    await page.evaluate((n) => {
      for (let i = 0; i < n; i++) document.getElementById("next")!.click();
    }, count);
    await page.waitForTimeout(350);
  };

  beforeAll(async () => {
    ({ browser, page, errors } = await open(profile, `http://127.0.0.1:${site.port}`, "/"));
  });
  afterAll(() => browser.close());
  beforeEach(async () => {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction("document.querySelectorAll('.ls-piece').length === 32 && document.querySelectorAll('#boards button').length > 0");
    errors.length = 0;
  });

  it("opens clean: the board, its labels, the name, the controls, and no errors", async () => {
    const seen = await page.evaluate(() => ({
      pieces: document.querySelectorAll(".ls-piece").length,
      coords: document.querySelectorAll(".ls-coord").length,
      name: document.querySelector("h1")!.textContent,
      themes: document.querySelectorAll("#boards button").length,
      badges: document.querySelectorAll("#badges button").length,
      wells: document.querySelectorAll(".well input").length,
      icon: (document.querySelector(".brand img") as HTMLImageElement).naturalWidth > 0,
      size: document.getElementById("where")!.textContent,
    }));
    expect(seen).toMatchObject({ pieces: 32, coords: 16, name: "Lightsquare", themes: 7, badges: 12, wells: 10, icon: true });
    expect(seen.size).toMatch(/^\d+ px · [\d.]+x$/);
    expect(errors).toEqual([]);
  });

  it("the check halo is under the king, all the time it breathes and after", async () => {
    await steps(21);
    expect(await pieceOn("e8", "bk")).toBe(true);
    const during: Array<string | null> = [];
    for (const wait of [0, 350, 700]) {
      await page.waitForTimeout(wait);
      during.push(await squareOf(".ls-mark-check"));
    }
    expect(during).toEqual(["e8", "e8", "e8"]);
    expect(await page.evaluate(() => document.getAnimations().some((a) => (a as CSSAnimation).animationName === "check-pulse"))).toBe(true);
    await page.waitForFunction("!document.getAnimations().length", undefined, { timeout: 8000 });
    expect(await squareOf(".ls-mark-check")).toBe("e8");
  });

  it("checkmate: the glow is under the mated king and the # stays on its square and inside the board", async () => {
    await steps(33);
    expect(await pieceOn("e8", "bk")).toBe(true);
    expect(await squareOf(".ls-mark-mated")).toBe("e8");
    expect(await page.evaluate(() => document.querySelectorAll(".ls-mark-check").length)).toBe(0);
    await page.waitForFunction("!document.getAnimations().length", undefined, { timeout: 8000 });
    const badge = await page.evaluate(() => {
      const host = document.getElementById("board")!.getBoundingClientRect();
      const r = document.querySelector(".mate-badge")!.getBoundingClientRect();
      const size = host.width / 8;
      return { inside: r.left >= host.left - 1 && r.top >= host.top - 1 && r.right <= host.right + 1 && r.bottom <= host.bottom + 1, col: (r.left + r.width / 2 - host.left) / size, row: (r.top + r.height / 2 - host.top) / size, sign: getComputedStyle(document.querySelector(".mate-badge")!).backgroundImage, share: Math.round((r.width / size) * 100), fromTop: ((r.top - host.top) / size) * 100, small: host.width <= 460 };
    });
    expect(badge.inside).toBe(true);
    expect(badge.sign, "the # is a drawn sign").toContain("svg");
    // The same disc as the other badges, at the same distance from the board's edge.
    expect(badge.share).toBe(badge.small ? 46 : 38);
    expect(Math.abs(badge.fromTop - 4), "4% of a square from the top edge").toBeLessThan(1);
    expect(badge.col, "near the right edge of e8").toBeGreaterThan(4.5);
    expect(badge.col).toBeLessThan(5.1);
    expect(badge.row, "near the top of e8, inside the board").toBeLessThan(0.5);
    expect(await squareOf(".ls-mark-mated")).toBe("e8");
  });

  it("every badge sits on its own square's corner and none leaves the board", async () => {
    await page.evaluate(() => (document.querySelector('[data-look="badge"][data-value="all"]') as HTMLElement).click());
    await page.waitForTimeout(900);
    const badges = await page.evaluate(() => {
      const host = document.getElementById("board")!.getBoundingClientRect();
      const size = host.width / 8;
      return [...document.querySelectorAll(".ls-over .ls-mark")].map((el) => {
        const mark = el.getBoundingClientRect();
        const after = getComputedStyle(el, "::after");
        const width = parseFloat(after.width);
        const left = mark.right - parseFloat(after.right) - width;
        const top = mark.top + parseFloat(after.top);
        const fromEdge = (at: string, gap: number): number | null => (el.classList.contains(at) ? (gap / size) * 100 : null);
        return { name: el.className, sign: after.backgroundImage, small: host.width <= 460, fromTop: fromEdge("ls-at-top", top - host.top), fromRight: fromEdge("ls-at-right", host.right - left - width), inside: left >= host.left - 1 && top >= host.top - 1 && left + width <= host.right + 1 && top + width <= host.bottom + 1, share: Math.round((width / size) * 100), onOwnSquare: Math.abs(left + width / 2 - mark.right) <= width && Math.abs(top + width / 2 - mark.top) <= width };
      });
    });
    expect(badges).toHaveLength(9);
    for (const b of badges) {
      expect(b.inside, `${b.name} inside the board`).toBe(true);
      expect(b.onOwnSquare, `${b.name} on its square's corner`).toBe(true);
      expect(b.sign, `${b.name} has a drawn sign`).toContain("svg");
      expect(b.share, `${b.name} is a good third of a square`).toBe(b.small ? 46 : 38);
      for (const gap of [b.fromTop, b.fromRight]) if (gap !== null) expect(Math.abs(gap - 4), `${b.name} is 4% of a square from the board's edge`).toBeLessThan(1);
    }
  });

  it("the arrow keys step through the game, also after a press on the board, and leave a slider alone", async () => {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    expect(await pieceOn("e4", "wp")).toBe(true);
    const box = (await page.locator("#board").boundingBox())!;
    if (profile.touch) await page.touchscreen.tap(box.x + box.width / 16, box.y + (box.height * 7) / 16);
    else await page.mouse.click(box.x + box.width / 16, box.y + (box.height * 7) / 16);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    expect(await pieceOn("e5", "bp")).toBe(true);
    expect(await page.evaluate(() => document.querySelectorAll(".ls-cursor").length)).toBe(0);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(300);
    expect(await pieceOn("e2", "wp")).toBe(true);
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.querySelectorAll(".mate-badge").length)).toBe(1);
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(300);
    await page.focus("#moveMs");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);
    expect(await pieceOn("e2", "wp")).toBe(true);
    expect(errors).toEqual([]);
  });

  it("the looks panel changes the board, shows the theme as data, and remembers it", async () => {
    await page.evaluate(() => {
      (document.querySelector('[data-look="board"][data-value="ocean"]') as HTMLElement).click();
      (document.getElementById("samples") as HTMLElement).click();
      const well = document.querySelector("#arrowColours input") as HTMLInputElement;
      well.value = "#123456";
      well.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const read = (): Promise<{ dark: string; arrow: string; theme: string }> =>
      page.evaluate(() => ({ dark: getComputedStyle(document.querySelector(".ls-squares")!).fill, arrow: getComputedStyle(document.querySelector(".ls-arrow:not([class*='ls-arrow-']) stop")!).stopColor, theme: document.getElementById("theme")!.textContent ?? "" }));
    const changed = await read();
    expect(changed.dark).toBe("rgb(106, 143, 181)");
    expect(changed.arrow).toBe("rgb(18, 52, 86)");
    expect(changed.theme).toContain('"dark": "#6a8fb5"');
    expect(changed.theme).toContain('"default": "#123456"');
    await page.reload();
    await page.waitForFunction("document.querySelectorAll('#boards button').length > 0");
    await page.evaluate(() => (document.getElementById("samples") as HTMLElement).click());
    expect((await read()).dark).toBe("rgb(106, 143, 181)");
    expect((await read()).arrow).toBe("rgb(18, 52, 86)");
  });

  it("the grip at the board's corner makes the board smaller and larger; on a phone there is none", async () => {
    const shown = await page.evaluate(() => getComputedStyle(document.getElementById("resize")!).display !== "none");
    expect(shown).toBe(!profile.touch);
    if (!shown) return;
    const width = (): Promise<number> => page.evaluate(() => document.getElementById("board")!.getBoundingClientRect().width);
    // The hint arrow fades in when the page opens: let that end, so that an animation seen later is the resize's doing.
    await page.waitForFunction("!document.getAnimations().length");
    const full = await width();
    const grip = (await page.locator("#resize").boundingBox())!;
    // The grip sits beside the board, in the frame's corner: no part of a square is under it.
    const board = (await page.locator("#board").boundingBox())!;
    expect(grip.x).toBeGreaterThanOrEqual(board.x + board.width - 0.5);
    expect(grip.y).toBeGreaterThanOrEqual(board.y + board.height - 0.5);
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x - 110, grip.y - 110, { steps: 6 });
    await page.mouse.up();
    const small = await width();
    expect(small).toBeLessThan(full - 80);
    expect(small).toBeGreaterThan(full - 150);
    await page.waitForTimeout(100);
    const state = await page.evaluate(() => {
      const host = document.getElementById("board")!.getBoundingClientRect();
      const size = host.width / 8;
      const off = Math.max(...[...document.querySelectorAll(".ls-piece")].map((el) => { const r = el.getBoundingClientRect(); const c = (r.left - host.left) / size; return Math.abs(c - Math.round(c)); }));
      return { off, label: document.getElementById("where")!.textContent, running: document.getAnimations().length };
    });
    expect(state.off).toBeLessThan(0.02);
    expect(state.label).toContain(`${Math.round(small)} px`);
    expect(state.running).toBe(0);
    await page.locator("#resize").dblclick();
    expect(Math.abs((await width()) - full)).toBeLessThan(1.5);
  });

  it("at rest the page animates nothing and asks for no frame", async () => {
    await page.waitForTimeout(700);
    await page.evaluate(() => P.reset());
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => ({ animations: document.getAnimations().length, raf: P.raf }))).toEqual({ animations: 0, raf: 0 });
  });

  it("shows the comparison with other boards when it has been measured", async () => {
    const table = await page.evaluate(async () => {
      const results = await fetch("/results.json").then((r) => (r.ok ? r.json() : null));
      await new Promise((r) => setTimeout(r, 200));
      return { measured: !!results, boards: document.querySelectorAll("#bench thead th").length - 1, rows: document.querySelectorAll("#bench tbody tr:not(.group)").length, best: document.querySelectorAll("#bench td.best").length, note: document.getElementById("bench-note")!.textContent ?? "" };
    });
    if (!table.measured) return;
    expect(table.boards).toBe(3);
    expect(table.rows).toBeGreaterThanOrEqual(14);
    expect(table.best).toBeGreaterThanOrEqual(table.rows);
    expect(table.note).toContain("not a phone");
  });
});
