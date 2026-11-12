import type { Color, PieceCode, Square } from "./position";

/** For each square a piece stands on, the squares it may go to. */
export type Targets = ReadonlyMap<Square, readonly Square[]>;

export interface UserMove {
  from: Square;
  to: Square;
  piece: PieceCode;
  captured?: PieceCode;
}

/**
 * Anything the app wants to show on a square: a hint, a verdict, a
 * move-quality badge. The board places an element with the class
 * `ls-mark-<name>` on the square, in the same write as the move; the app's
 * stylesheet decides what it looks like.
 */
export interface SquareMark {
  square: Square;
  /** Lowercase letters, digits and hyphens. */
  name: string;
  /** Draw it over the pieces (a badge) instead of under them (a tint). */
  above?: boolean;
}

export interface Options {
  /** A FEN (only the placement field is read), or "start" / "empty". */
  position?: string;
  /** The side at the bottom of the board. */
  orientation?: Color;
  /** Whose pieces the user may move. Default "none": a board to look at. */
  movable?: Color | "both" | "none";
  /**
   * Where each piece may go. Lightsquare knows no chess rules: the app
   * supplies the allowed moves. Leave out (or null) to allow any square.
   */
  targets?: Targets | null;
  /** The two squares to tint as the last move. */
  lastMove?: readonly [Square, Square] | null;
  /** The square of a king in check. */
  check?: Square | null;
  /** The app's own marks. The whole list is replaced on every set. */
  marks?: readonly SquareMark[] | null;
  /**
   * The user moved a piece. The board already shows the move; answer with
   * `set({ position })` to confirm it (castling, en passant, promotion) or
   * to take it back.
   */
  onMove?: ((move: UserMove) => void) | null;
  onSelect?: ((square: Square | null) => void) | null;
}

export interface Board {
  /** Change anything. One call, one write pass. */
  set(options: Options, how?: { animate?: boolean }): void;
  /** Slide the piece on `from` to `to`, taking what stands there. */
  move(from: Square, to: Square): void;
  select(square: Square | null): void;
  /** The placement field of the FEN on show. */
  position(): string;
  destroy(): void;
}
