import type { Color, Square } from "./position";
import type { Wanted } from "./state";

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

export function markView(host: HTMLElement, under: HTMLElement, spot: (square: Square) => string): MarkView {
  const marks = new Map<string, { el: HTMLElement; square: Square }>();
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
          if (mark.square !== square) mark.el.style.transform = spot((mark.square = square));
          continue;
        }
        const el = document.createElement("div");
        el.className = `ls-mark ls-mark-${key.split(" ")[0]}`;
        el.style.transform = spot(square);
        (above ? (over ??= layer(host, "ls-over")) : under).appendChild(el);
        marks.set(key, { el, square });
      }
    },
    replace() {
      for (const mark of marks.values()) mark.el.style.transform = spot(mark.square);
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
export function coordView(host: HTMLElement, before: HTMLElement): CoordView {
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
          label.style.transform = `translate(${col * 100}%,${row * 100}%)`;
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
