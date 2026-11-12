/**
 * Your own HTML on a square: a tooltip, a clock, a button.
 *
 *   const html = board.use(overlay());
 *   html.put("tip", "e4", element);
 *   html.remove("tip");
 *
 * The element sits in a box the size of the square and follows the square
 * when the board is flipped or resized. On the top row or the right column
 * of the screen the box also has the class `ls-at-top` or `ls-at-right`. For a plain tint or badge, use the
 * board's `marks` option: it needs no module.
 */
import type { Module, ModuleHooks, Square } from "../index";

export interface Overlay extends ModuleHooks {
  /** Show `content` on a square. The same key again moves or replaces it. */
  put(key: string, square: Square, content: HTMLElement): void;
  remove(key: string): void;
  clear(): void;
}

export function overlay(): Module<Overlay> {
  return (surface) => {
    let layer: HTMLElement | null = null;
    const items = new Map<string, { box: HTMLElement; square: Square }>();
    let orientation = surface.orientation();

    /** Put a box on its square. On the top row or the right column it says so, as marks do. */
    function place(box: HTMLElement, square: Square): void {
      const [col, row] = surface.cell(square);
      box.className = `ls-anchor${row === 0 ? " ls-at-top" : ""}${col === 7 ? " ls-at-right" : ""}`;
      surface.anchor(box, square);
    }

    function remove(key: string): void {
      items.get(key)?.box.remove();
      items.delete(key);
    }

    return {
      put(key, square, content) {
        if (!layer) {
          layer = document.createElement("div");
          layer.className = "ls-layer ls-overlay";
          // A press on your HTML is yours: the board under it does not react.
          layer.addEventListener("pointerdown", (e) => e.stopPropagation());
          surface.host.appendChild(layer);
        }
        const item = items.get(key) ?? { box: layer.appendChild(document.createElement("div")), square };
        item.square = square;
        place(item.box, square);
        if (item.box.firstChild !== content) item.box.replaceChildren(content);
        items.set(key, item);
      },
      remove,
      clear() {
        for (const key of [...items.keys()]) remove(key);
      },
      update() {
        if (orientation === surface.orientation()) return;
        orientation = surface.orientation();
        for (const item of items.values()) place(item.box, item.square);
      },
      destroy() {
        layer?.remove();
        items.clear();
      },
    };
  };
}
