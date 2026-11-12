import type { Color, PieceCode, Placed, Square } from "./position";

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
  /** File letters and rank numbers on the edge squares. Default true. */
  coordinates?: boolean;
  /**
   * Whose pieces may be moved ahead of their turn. A premove is not played:
   * the board marks its two squares and keeps it until the app calls
   * `playPremove()` or the user cancels it with a press on the board.
   */
  premovable?: Color | "none";
  /** Where each piece may premove to. Leave out to allow any square. */
  premoveTargets?: Targets | null;
  /** The premove in waiting. Set null to drop it. */
  premove?: readonly [Square, Square] | null;
  /**
   * The user moved a piece. The board already shows the move; answer with
   * `set({ position })` to confirm it (castling, en passant, promotion) or
   * to take it back.
   */
  onMove?: ((move: UserMove) => void) | null;
  onSelect?: ((square: Square | null) => void) | null;
  /** The user set a premove, or cancelled it (null). */
  onPremove?: ((premove: readonly [Square, Square] | null) => void) | null;
  /** A press and release on one square, on any board, movable or not. */
  onTap?: ((square: Square) => void) | null;
}

/** What a module gets from the board. Modules import nothing from the core. */
export interface Surface {
  host: HTMLElement;
  orientation(): Color;
  /** Column and row on screen, 0..7 from the top-left. */
  cell(square: Square): [number, number];
  /** The square at a screen column and row, or null outside the board. */
  square(col: number, row: number): Square | null;
  /** The transform that puts a square-sized element on a square. */
  spot(square: Square): string;
  /**
   * Put a square-sized element on a square and leave its `transform` free,
   * so a stylesheet may animate it (a pulse, a pop) without moving it.
   */
  anchor(el: HTMLElement, square: Square): void;
  pieces(): readonly Placed[];
  lastMove(): readonly [Square, Square] | null;
  selected(): Square | null;
  /** The same as a tap on the square: select, move or unselect. */
  tap(square: Square): void;
}

/** What a module may give back. The board calls these; the rest is the module's own API. */
export interface ModuleHooks {
  /** After every change of the board, in the same task. */
  update?(): void;
  destroy?(): void;
}

export type Module<T extends ModuleHooks> = (surface: Surface) => T;

export interface Board {
  /** Change anything. One call, one write pass. */
  set(options: Options, how?: { animate?: boolean }): void;
  /** Slide the piece on `from` to `to`, taking what stands there. */
  move(from: Square, to: Square): void;
  select(square: Square | null): void;
  /** The placement field of the FEN on show. */
  position(): string;
  /**
   * Play the premove in waiting as a move of the user, if the board's
   * current `movable` and `targets` allow it. Returns whether it was played.
   * Call it after setting the position that follows the opponent's move.
   */
  playPremove(): boolean;
  /** Add a module (arrows, promotion picker, ...). Returns the module's own API. */
  use<T extends ModuleHooks>(module: Module<T>): T;
  destroy(): void;
}
