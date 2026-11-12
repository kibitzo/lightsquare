/**
 * The promotion picker: four pieces on the promotion square and the three
 * squares behind it.
 *
 *   const picker = board.use(promotion());
 *   const piece = await picker.ask("e8", "white");   // "q" | "r" | "b" | "n" | null
 *
 * The pieces are buttons: they can be reached with the keyboard, and Escape
 * or a press beside them cancels. While the picker is open the board under
 * it does not react.
 */
import type { Color, Module, ModuleHooks, Square } from "../index";

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

    function close(piece: PromotionPiece | null): void {
      if (!open) return;
      const { layer, done } = open;
      open = null;
      layer.remove();
      done(piece);
    }

    function show(square: Square, color: Color, done: (piece: PromotionPiece | null) => void): void {
      const layer = document.createElement("div");
      layer.className = "ls-layer ls-promotion";
      const [col, row] = surface.cell(square);
      const step = row < 4 ? 1 : -1;
      (options.pieces ?? ["q", "n", "r", "b"]).forEach((piece, i) => {
        const button = layer.appendChild(document.createElement("button"));
        button.type = "button";
        button.className = `ls-choice ls-${color[0]}${piece}`;
        button.dataset.piece = piece;
        button.setAttribute("aria-label", options.labels?.[piece] ?? LABELS[piece]);
        button.style.transform = `translate(${col * 100}%,${(row + step * i) * 100}%)`;
      });
      layer.addEventListener("pointerdown", (e) => e.stopPropagation());
      layer.addEventListener("click", (e) => close(((e.target as Element).closest<HTMLElement>(".ls-choice")?.dataset.piece as PromotionPiece) ?? null));
      layer.addEventListener("keydown", (e) => e.key === "Escape" && close(null));
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
