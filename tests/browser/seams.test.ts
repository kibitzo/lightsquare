/**
 * The squares, and what is drawn on them, cover the same pixels.
 *
 * Seen 2026-11-12 in Safari on kibitzo.com: beside the yellow of the last
 * move, a thin line of the bare square. The dark squares are one drawing,
 * the marks are elements placed by a transform, and at a width where a
 * square is not a whole number of pixels the two were rounded differently.
 * Now the board takes a width that gives whole squares (lightsquare.css).
 *
 * The test paints marks in a colour no square has and reads the picture
 * pixel by pixel.
 */
import type { Server } from "node:http";
import { chromium, webkit, type Browser, type BrowserType, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fresh, open, serve } from "./helpers";

let site: { server: Server; origin: string };
beforeAll(async () => {
  site = await serve();
});
afterAll(() => site.server.close());

/** Container widths, most of them not a multiple of 8, as real layouts give. */
const WIDTHS = [320, 333, 375, 394, 402, 414, 430, 607, 690];
const FILES = "abcdefgh";
const ALL = [...FILES].flatMap((f) => [1, 2, 3, 4, 5, 6, 7, 8].map((r) => `${f}${r}`));
const DARK = ALL.filter((s) => (FILES.indexOf(s[0]) + Number(s[1])) % 2 === 1);
/** Light squares green, dark squares blue, marks magenta; the board starts at a place that is not a whole pixel, as a centred layout gives. */
const LOOKS = ".ls-mark-probe { background: rgb(255, 0, 255); } #wrap { margin: 7.4px 0 0 13.4px; } .ls-board { --ls-light: rgb(0, 255, 0); --ls-dark: rgb(0, 0, 255); }";

interface Seen {
  mark: number;
  light: number;
  dark: number;
  mixed: number;
}

/** The board's picture, counted by colour. */
async function look(page: Page, width: number, marked: string[]): Promise<Seen> {
  await page.evaluate((w) => (document.getElementById("wrap")!.style.width = `${w}px`), width);
  await fresh(page, { position: "empty", coordinates: false, marks: marked.map((square) => ({ square, name: "probe" })) });
  const shot = await page.locator("#board").screenshot({ type: "png" });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const g = canvas.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
    const seen = { mark: 0, light: 0, dark: 0, mixed: 0 };
    // The outermost pixels are left out: the picture is cut at the board's edge, which may fall inside a pixel.
    const rim = Math.ceil(2 * devicePixelRatio);
    for (let y = rim; y < canvas.height - rim; y++) {
      for (let x = rim; x < canvas.width - rim; x++) {
        const i = (y * canvas.width + x) * 4;
        const [r, gr, b] = [d[i], d[i + 1], d[i + 2]];
        if (r > 235 && gr < 20 && b > 235) seen.mark++;
        else if (r < 20 && gr > 235 && b < 20) seen.light++;
        else if (r < 20 && gr < 20 && b > 235) seen.dark++;
        else seen.mixed++;
      }
    }
    return seen;
  }, shot.toString("base64"));
}

describe.each([["Chromium", chromium], ["WebKit", webkit]] as Array<[string, BrowserType]>)("squares and marks in %s", (_name, engine) => {
  const browsers: Browser[] = [];
  const at = async (density: number): Promise<Page> => {
    const { browser, page } = await open({ name: "seams", engine, context: { viewport: { width: 800, height: 800 }, deviceScaleFactor: density }, touch: false }, site.origin);
    browsers.push(browser);
    await page.addStyleTag({ content: LOOKS });
    return page;
  };
  afterAll(() => Promise.all(browsers.map((b) => b.close())));

  it("the board takes the widest width that gives whole squares, also when the app gives the element all of the width", async () => {
    const page = await at(2);
    const widths = async (): Promise<Array<[number, number]>> => {
      const out: Array<[number, number]> = [];
      for (const width of [...WIDTHS, 400, 7]) {
        out.push(await page.evaluate((w) => {
          document.getElementById("wrap")!.style.width = `${w}px`;
          return [w, document.getElementById("board")!.getBoundingClientRect().width] as [number, number];
        }, width));
      }
      return out;
    };
    await fresh(page);
    const expected = [...WIDTHS, 400, 7].map((w) => [w, Math.floor(w / 8) * 8]);
    expect(await widths()).toEqual(expected);
    await page.evaluate(() => (document.getElementById("board")!.style.width = "100%"));
    expect(await widths(), "with width: 100% on the element").toEqual(expected);
    await page.evaluate(() => document.getElementById("board")!.style.removeProperty("width"));
    const box = await page.evaluate(() => {
      document.getElementById("wrap")!.style.width = "333px";
      const r = document.getElementById("board")!.getBoundingClientRect();
      return [r.width, r.height];
    });
    expect(box, "still a square").toEqual([328, 328]);
  });

  it.each([1, 2, 3])("at %s device pixels to a pixel, a mark covers its square exactly: no pixel of the square shows beside it, none is half covered", async (density) => {
    const page = await at(density);
    for (const width of WIDTHS) {
      const dark = await look(page, width, DARK);
      expect({ width, ...dark }, "marks on the dark squares: nothing but marks and light squares").toMatchObject({ width, dark: 0, mixed: 0 });
      // Marks and light squares each take half of the board. (Not to the pixel: the picture's rim is cut off
      // unevenly. A mark one pixel too wide on all 32 squares would be off by four board widths.)
      expect(Math.abs(dark.mark - dark.light), `marks reach onto the light squares at ${width}px`).toBeLessThan((Math.floor(width / 8) * density) / 2);
      const all = await look(page, width, ALL);
      expect({ width, ...all }, "marks on every square: nothing but marks").toMatchObject({ width, light: 0, dark: 0, mixed: 0 });
    }
  }, 120_000);

  it.each([1.5, 2.625, 2.75, 3.5])("at %s device pixels to a pixel (a zoomed page, many Android phones), no line of the bare square shows beside a mark", async (density) => {
    const page = await at(density);
    for (const width of WIDTHS) {
      // A square is not a whole number of device pixels here, so an edge pixel may be shared (mixed); what must not be is a pixel of the bare dark square.
      const dark = await look(page, width, DARK);
      expect({ width, dark: dark.dark }).toEqual({ width, dark: 0 });
    }
  }, 120_000);
});
