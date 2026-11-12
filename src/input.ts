import { cellSquare, type Color, type Placed, type Square } from "./position.js";

/** What the pointer code needs from the board. */
export interface InputHost {
  host: HTMLElement;
  /** The element whose box is exactly the 8 by 8 grid. */
  grid: HTMLElement;
  orientation(): Color;
  enabled(): boolean;
  selected(): Square | null;
  at(square: Square): Placed | undefined;
  holds(piece: Placed): boolean;
  element(piece: Placed): HTMLElement;
  canPick(piece: Placed): boolean;
  allows(from: Square, to: Square): boolean;
  select(square: Square | null): void;
  hover(square: Square | null): void;
  /** Put a piece back on its square. */
  settle(piece: Placed, slide: boolean): void;
  /** A move or a premove; `slide` is false when the piece is already under the pointer. */
  play(from: Square, to: Square, slide: boolean): void;
  /** Draw the pieces above everything else while one is dragged. */
  lift(on: boolean): void;
  /** A press began on the board. */
  pressed(): void;
  /** A press and release on one square. */
  tapped(square: Square): void;
}

interface Frame {
  left: number;
  top: number;
  size: number;
}

interface Press extends Frame {
  pointer: number;
  square: Square;
}

interface Gesture extends Frame {
  pointer: number;
  piece: Placed;
  x: number;
  y: number;
  touch: boolean;
  dragging: boolean;
  /** The piece was already selected when the press began: a tap unselects it. */
  again: boolean;
}

export interface Input {
  /** Drop the gesture in progress and put its piece back. */
  abort(): void;
  /** After a position change: keep the drag only if its piece is still there. */
  sync(): void;
  detach(): void;
}

const DRAG_AFTER_MOUSE = 4;
const DRAG_AFTER_TOUCH = 8;
/** A finger hides the piece it holds: lift the piece above it, in squares. */
const TOUCH_LIFT = 0.75;
/**
 * How much a held piece grows: a little under a mouse, more under a finger.
 * Written as plain numbers into the transform. Reading them from a CSS
 * variable there (`scale(var(--x))`) more than doubled the browser's style
 * work for every step of a drag (3.4 ms against 1.5 ms over one drag,
 * measured 2026-11-12).
 */
const GROW_MOUSE = 1.1;
const GROW_TOUCH = 1.7;

export function attachInput(b: InputHost): Input {
  let g: Gesture | null = null;
  let press: Press | null = null;

  const squareAt = (e: PointerEvent, f: Frame): Square | null =>
    cellSquare(Math.floor((e.clientX - f.left) / f.size), Math.floor((e.clientY - f.top) / f.size), b.orientation());

  function down(e: PointerEvent): void {
    if (g || !e.isPrimary || e.button > 0 || !b.enabled()) return;
    const box = b.grid.getBoundingClientRect();
    const frame = { left: box.left, top: box.top, size: box.width / 8 };
    const square = squareAt(e, frame);
    if (!square) return;
    press = { ...frame, pointer: e.pointerId, square };
    b.pressed();
    const chosen = b.selected();
    if (chosen && chosen !== square && b.allows(chosen, square)) {
      b.play(chosen, square, true);
      return;
    }
    const piece = b.at(square);
    if (!piece || !b.canPick(piece)) {
      b.select(null);
      return;
    }
    g = { ...frame, pointer: e.pointerId, piece, x: e.clientX, y: e.clientY, touch: e.pointerType === "touch", dragging: false, again: chosen === square };
    try {
      b.host.setPointerCapture(e.pointerId);
    } catch {
      /* a synthetic or already released pointer cannot be captured */
    }
    b.select(square);
  }

  function move(e: PointerEvent): void {
    if (!g || e.pointerId !== g.pointer) return;
    const el = b.element(g.piece);
    if (!g.dragging) {
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < (g.touch ? DRAG_AFTER_TOUCH : DRAG_AFTER_MOUSE)) return;
      g.dragging = true;
      b.lift(true);
      el.className = `ls-piece ls-${g.piece.code} ls-dragging${g.touch ? " ls-lifted" : ""}`;
    }
    const x = e.clientX - g.left - g.size / 2;
    const y = e.clientY - g.top - g.size / 2 - (g.touch ? g.size * TOUCH_LIFT : 0);
    el.style.transform = `translate(${x}px,${y}px) scale(${g.touch ? GROW_TOUCH : GROW_MOUSE})`;
    const over = squareAt(e, g);
    b.hover(over && b.allows(g.piece.square, over) ? over : null);
  }

  function release(e: PointerEvent): void {
    if (!g || e.pointerId !== g.pointer) return;
    const { piece, dragging, again } = g;
    const from = piece.square;
    const to = dragging ? squareAt(e, g) : null;
    g = null;
    if (dragging) b.lift(false);
    if (to && to !== from && b.allows(from, to)) {
      b.play(from, to, false);
      return;
    }
    b.hover(null);
    if (dragging) {
      b.settle(piece, true);
      if (to !== from) b.select(null);
    } else if (again) b.select(null);
  }

  function up(e: PointerEvent): void {
    const tapped = press && e.pointerId === press.pointer && squareAt(e, press) === press.square ? press.square : null;
    if (press && e.pointerId === press.pointer) press = null;
    release(e);
    if (tapped) b.tapped(tapped);
  }

  function abort(): void {
    press = null;
    if (!g) return;
    const { piece, dragging } = g;
    g = null;
    b.hover(null);
    if (!dragging) return;
    b.lift(false);
    if (b.holds(piece)) b.settle(piece, false);
  }

  const cancel = (e: PointerEvent): void => {
    if (press && e.pointerId === press.pointer) press = null;
    if (g && e.pointerId === g.pointer) abort();
  };

  b.host.addEventListener("pointerdown", down);
  b.host.addEventListener("pointermove", move);
  b.host.addEventListener("pointerup", up);
  b.host.addEventListener("pointercancel", cancel);

  return {
    abort,
    sync() {
      if (g && !b.holds(g.piece)) abort();
    },
    detach() {
      abort();
      b.host.removeEventListener("pointerdown", down);
      b.host.removeEventListener("pointermove", move);
      b.host.removeEventListener("pointerup", up);
      b.host.removeEventListener("pointercancel", cancel);
    },
  };
}
