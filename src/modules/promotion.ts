/**
 * The promotion picker: a panel with four pieces, on the promotion square
 * and the three squares behind it.
 *
 *   const picker = board.use(promotion());
 *   const piece = await picker.ask("e8", "white");   // "q" | "r" | "b" | "n" | null
 *
 * The pieces are buttons: they can be reached with the keyboard, and Escape
 * or a press beside them cancels. While the picker is open the board under
 * it does not react.
 */
import type { Color, Module, ModuleHooks, Square } from "../index.js";

export type PromotionPiece = "q" | "r" | "b" | "n";

export interface PromotionOptions {
  /** The choices, first on the promotion square. Default queen, knight, rook, bishop. */
  pieces?: readonly PromotionPiece[];
  /** Names for screen readers. */
  labels?: Partial<Record<PromotionPiece, string>>;
}

export interface Promotion extends ModuleHooks {
  /** Show the picker. Resolves with the piece, or null if the user cancels. */
  ask(square: Square, color: Color): Promise<PromotionPiece | null>;
  /** Close the picker as if the user had cancelled. */
  cancel(): void;
  isOpen(): boolean;
}

const LABELS: Record<PromotionPiece, string> = { q: "Queen", r: "Rook", b: "Bishop", n: "Knight" };

export function promotion(options: PromotionOptions = {}): Module<Promotion> {
  return (surface) => {
    let open: { layer: HTMLElement; done(piece: PromotionPiece | null): void; orientation: Color } | null = null;

    /**
     * Escape cancels wherever the focus is. The picker takes the focus when
     * it opens, but when it is opened by a press on the board (the move that
     * promotes), the browser gives the focus back to the board right after:
     * a key listener on the picker alone would then never hear the key.
     */
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") close(null);
    }

    function close(piece: PromotionPiece | null): void {
      if (!open) return;
      const { layer, done } = open;
      open = null;
      removeEventListener("keydown", onKey, true);
      layer.remove();
      done(piece);
    }

    function show(square: Square, color: Color, done: (piece: PromotionPiece | null) => void): void {
      const layer = document.createElement("div");
      layer.className = "ls-layer ls-promotion";
      const [col, row] = surface.cell(square);
      const pieces = options.pieces ?? ["q", "n", "r", "b"];
      const up = row >= 4;
      const panel = layer.appendChild(document.createElement("div"));
      panel.className = `ls-picker${up ? " ls-picker-up" : ""}`;
      panel.style.setProperty("--ls-picks", String(pieces.length));
      panel.style.transform = surface.spot(surface.square(col, up ? row - pieces.length + 1 : row)!);
      for (const piece of pieces) {
        const button = panel.appendChild(document.createElement("button"));
        button.type = "button";
        button.className = `ls-choice ls-${color[0]}${piece}`;
        button.dataset.piece = piece;
        button.setAttribute("aria-label", options.labels?.[piece] ?? LABELS[piece]);
      }
      // A click counts only if its press began on the picker (or it comes
      // from the keyboard, detail 0). A finger's tap on the promotion square
      // makes the move, which opens the picker under the finger, and then
      // ends with a click on that same spot: without this, that click chose
      // the first piece before the player had seen the picker.
      let pressed = false;
      layer.addEventListener("pointerdown", (e) => {
        pressed = true;
        e.stopPropagation();
      });
      layer.addEventListener("click", (e) => {
        if (pressed || !e.detail) close(((e.target as Element).closest<HTMLElement>(".ls-choice")?.dataset.piece as PromotionPiece) ?? null);
      });
      addEventListener("keydown", onKey, true);
      surface.host.appendChild(layer);
      open = { layer, done, orientation: surface.orientation() };
      layer.querySelector<HTMLElement>(".ls-choice")?.focus({ preventScroll: true });
    }

    return {
      ask(square, color) {
        close(null);
        return new Promise((resolve) => show(square, color, resolve));
      },
      cancel: () => close(null),
      isOpen: () => !!open,
      update() {
        if (open && open.orientation !== surface.orientation()) close(null);
      },
      destroy: () => close(null),
    };
  };
}
