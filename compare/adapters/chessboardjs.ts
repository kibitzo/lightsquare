import "./jquery-global";
import "@chrisoakman/chessboardjs/dist/chessboard-1.0.0.js";
import type { Create } from "./types";

interface OldBoard {
  position(fen: string, animate: boolean): void;
  destroy(): void;
}
declare const Chessboard: (el: HTMLElement, config: Record<string, unknown>) => OldBoard;

/** The npm package has no piece pictures: it gets the Cburnett set, the one its own site uses. */
const pieceTheme = (piece: string): string => `/assets/cburnett/${piece.toLowerCase()}.svg`;

export const create: Create = (el, { fen, ms }) => {
  let now = fen;
  const make = (draggable: boolean): OldBoard => Chessboard(el, { position: now, moveSpeed: ms, showNotation: true, draggable, pieceTheme });
  let board = make(false);
  return {
    ready: Promise.resolve(),
    set(next, animate) {
      now = next;
      board.position(next, animate);
    },
    // Dragging is a choice made when the board is built.
    movable() {
      board.destroy();
      board = make(true);
    },
    destroy: () => board.destroy(),
  };
};
