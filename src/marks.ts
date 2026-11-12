import type { Color, Square } from "./position";
import type { Wanted } from "./state";

const SVG = "http://www.w3.org/2000/svg";

/** The dark squares as one shape, exact at every size. The light ones are the board's background. */
export function squares(host: HTMLElement): SVGElement {
  const el = host.appendChild(document.createElementNS(SVG, "svg"));
  el.setAttribute("class", "ls-layer ls-squares");
  el.setAttribute("viewBox", "0 0 8 8");
  el.setAttribute("preserveAspectRatio", "none");
  el.setAttribute("aria-hidden", "true");
  let d = "";
  for (let row = 0; row < 8; row++) for (let col = 1 - (row % 2); col < 8; col += 2) d += `M${col} ${row}h1v1h-1z`;
  el.appendChild(document.createElementNS(SVG, "path")).setAttribute("d", d);
  return el;
}

export function layer(host: HTMLElement, name: string): HTMLElement {
  const el = document.createElement("div");
  el.className = `ls-layer ${name}`;
  host.appendChild(el);
  return el;
}

export interface MarkView {
  render(want: Map<string, Wanted>): void;
  /** After a flip: every mark goes to its square's new place. */
  replace(): void;
  destroy(): void;
}

export function markView(host: HTMLElement, under: HTMLElement, spot: (square: Square) => string, cell: (square: Square) => [number, number]): MarkView {
  const marks = new Map<string, { el: HTMLElement; square: Square; name: string; above: boolean }>();

  /**
   * Put a mark on its square. A mark over the pieces that is on the top
   * row or the right column says so (ls-at-top, ls-at-right), so a badge
   * that hangs over its square's corner can stay inside the board there.
   * Marks under the pieces only ever get their transform written.
   */
  function place(el: HTMLElement, name: string, square: Square, above: boolean): void {
    el.style.transform = spot(square);
    if (!above && el.className) return;
    const [col, row] = above ? cell(square) : [0, 1];
    el.className = `ls-mark ls-mark-${name}${row === 0 ? " ls-at-top" : ""}${col === 7 ? " ls-at-right" : ""}`;
  }
  /** For marks drawn over the pieces. Made when the first one is shown. */
  let over: HTMLElement | null = null;

  return {
    render(want) {
      for (const [key, mark] of marks) {
        if (want.has(key)) continue;
        mark.el.remove();
        marks.delete(key);
      }
      for (const [key, { square, above }] of want) {
        const mark = marks.get(key);
        if (mark) {
          if (mark.square !== square) place(mark.el, mark.name, (mark.square = square), mark.above);
          continue;
        }
        const el = document.createElement("div");
        const name = key.split(" ")[0];
        place(el, name, square, !!above);
        (above ? (over ??= layer(host, "ls-over")) : under).appendChild(el);
        marks.set(key, { el, square, name, above: !!above });
      }
    },
    replace() {
      for (const mark of marks.values()) place(mark.el, mark.name, mark.square, mark.above);
    },
    destroy() {
      over?.remove();
    },
  };
}

export interface CoordView {
  /** Show or hide the letters and numbers, for the side at the bottom. */
  render(shown: boolean, orientation: Color): void;
}

/** File letters along the bottom row, rank numbers down the left column. */
export function coordView(host: HTMLElement, before: HTMLElement, place: (col: number, row: number) => string): CoordView {
  let el: HTMLElement | null = null;
  let drawnFor: Color | null = null;

  return {
    render(shown, orientation) {
      if (!shown) {
        el?.remove();
        el = drawnFor = null;
        return;
      }
      if (drawnFor === orientation) return;
      if (!el) {
        el = document.createElement("div");
        el.className = "ls-layer ls-coords";
        el.setAttribute("aria-hidden", "true");
        for (let i = 0; i < 16; i++) {
          const label = el.appendChild(document.createElement("div"));
          const [col, row] = i < 8 ? [0, i] : [i - 8, 7];
          label.className = `ls-coord ls-coord-${i < 8 ? "rank" : "file"} ls-coord-${(col + row) % 2 ? "dark" : "light"}`;
          label.style.transform = place(col, row);
        }
        host.insertBefore(el, before);
      }
      const white = orientation === "white";
      [...el.children].forEach((label, i) => {
        label.textContent = i < 8 ? String(white ? 8 - i : i + 1) : "abcdefgh"[white ? i - 8 : 15 - i];
      });
      drawnFor = orientation;
    },
  };
}
