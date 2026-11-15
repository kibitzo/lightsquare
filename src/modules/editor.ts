/**
 * A position editor: move any piece anywhere, take pieces off, put new
 * ones on. The app keeps the position; the module says what it became.
 *
 *   const board = lightsquare(el, { movable: "both" });
 *   const edit = board.use(editor({
 *     onChange(placement, how) { board.set({ position: placement }, how); },
 *   }));
 *   edit.pick("erase");      // a press takes the piece under it off
 *   edit.pick("wq");         // a press puts a white queen there
 *   edit.pick("move");       // the hand again (the default)
 *   spare.onpointerdown = (e) => edit.drag("wq", e);   // carry a new piece onto the board
 *
 * The hand is the board's own: a drag or two taps move a piece, and the
 * board must let both sides move (`movable: "both"`, no `targets`). A piece
 * dropped outside the board is taken off. With the eraser or a piece in
 * hand, a press does its work on the square, and a drag does it on every
 * square it passes.
 */
import type { Module, ModuleHooks, PieceCode, Square } from "../index.js";

/** "move" is the hand; "erase" takes pieces off; a piece code stamps that piece. */
export type EditorTool = "move" | "erase" | PieceCode;

export interface EditorOptions {
  /**
   * The placement after an edit, as the first field of a FEN. Show it:
   * `board.set({ position: placement }, how)`.
   */
  onChange(placement: string, how: { animate: boolean }): void;
  /** The tool to begin with. Default "move". */
  tool?: EditorTool;
  /**
   * The mouse pointer of a tool, as a CSS `cursor` value. Without one the
   * eraser is a red disc with a cross and a piece in hand is the "copy"
   * pointer; an app that knows its piece set can show the piece itself.
   */
  cursors?: Partial<Record<EditorTool, string>>;
}

export interface Editor extends ModuleHooks {
  /** The tool in hand. */
  tool(): EditorTool;
  /** Take a tool in hand. */
  pick(tool: EditorTool): void;
  /**
   * Carry a new piece from the app's own palette onto the board. Call it
   * from the palette's `pointerdown`; the piece follows that pointer and is
   * put on the square it is released over. On a touch screen the palette
   * needs `touch-action: none`, or the browser scrolls instead.
   */
  drag(piece: PieceCode, event: PointerEvent): void;
}

const FILES = "abcdefgh";
/** As the board's own drags: how far a press may wander and still be a tap, and how a carried piece is shown. */
const DRAG_AFTER = 6;
const TOUCH_LIFT = 0.75;
const GROW_MOUSE = 1.1;
const GROW_TOUCH = 1.7;

/** A waste bin, red on white so that it shows on a light and on a dark square, pointing with its middle. */
const ERASE_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='30' height='30' viewBox='0 0 28 28' fill='none' stroke-linecap='round' stroke-linejoin='round'%3E%3Cg stroke='%23fff' stroke-width='5'%3E%3Cpath d='M6.2 9h15.6'/%3E%3Cpath d='M11 9V7.4a1.4 1.4 0 0 1 1.4-1.4h3.2A1.4 1.4 0 0 1 17 7.4V9'/%3E%3Cpath d='M8.1 9l.9 12.2a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8L19.9 9Z'/%3E%3C/g%3E%3Cpath d='M8.1 9l.9 12.2a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8L19.9 9Z' fill='%23fff'/%3E%3Cg stroke='%23e11d48' stroke-width='2.1'%3E%3Cpath d='M6.2 9h15.6'/%3E%3Cpath d='M11 9V7.4a1.4 1.4 0 0 1 1.4-1.4h3.2A1.4 1.4 0 0 1 17 7.4V9'/%3E%3Cpath d='M8.1 9l.9 12.2a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8L19.9 9'/%3E%3Cpath d='M12.2 12.6v6.6M15.8 12.6v6.6'/%3E%3C/g%3E%3C/svg%3E\") 15 15, not-allowed";

interface Frame {
  left: number;
  top: number;
  size: number;
}

export function editor(options: EditorOptions): Module<Editor> {
  return (surface) => {
    const host = surface.host;
    let tool: EditorTool = options.tool ?? "move";
    /** False once the module is taken away: the board keeps calling `update`, and an editor that is gone says nothing. */
    let alive = true;
    /** A press of the hand on a piece: it is taken off if it is let go outside the board. */
    let carried: (Frame & { pointer: number; from: Square; code: PieceCode; x: number; y: number; far: boolean }) | null = null;
    /** A press of the eraser or of a piece in hand, and the last square it worked on. */
    let stroke: (Frame & { pointer: number; over: Square | null; put: PieceCode | null }) | null = null;
    /** A new piece on its way from the app's palette. */
    let fresh: (Frame & { pointer: number; el: HTMLElement; code: PieceCode; touch: boolean }) | null = null;

    const frame = (): Frame => {
      const box = host.getBoundingClientRect();
      return { left: box.left, top: box.top, size: box.width / 8 };
    };
    const squareAt = (e: PointerEvent, f: Frame): Square | null =>
      surface.square(Math.floor((e.clientX - f.left) / f.size), Math.floor((e.clientY - f.top) / f.size));
    const codeAt = (square: Square): PieceCode | undefined => surface.pieces().find((p) => p.square === square)?.code;

    /** The placement on show, or what it becomes with one square changed. */
    function placement(square?: Square, code: PieceCode | null = null): string {
      const at = new Map<Square, PieceCode>(surface.pieces().map((p) => [p.square, p.code]));
      if (square && code) at.set(square, code);
      else if (square) at.delete(square);
      const rows: string[] = [];
      for (let rank = 8; rank >= 1; rank--) {
        let row = "";
        let gap = 0;
        for (const file of FILES) {
          const c = at.get(file + rank);
          if (!c) {
            gap++;
            continue;
          }
          row += (gap || "") + (c[0] === "w" ? c[1].toUpperCase() : c[1]);
          gap = 0;
        }
        rows.push(row + (gap || ""));
      }
      return rows.join("/");
    }

    /** The eraser or the piece in hand, at work on one square. */
    function work(square: Square): void {
      if (!stroke) return;
      const there = codeAt(square);
      if (there === (stroke.put ?? undefined)) return;
      options.onChange(placement(square, stroke.put), { animate: true });
    }

    /** Runs before the board's own handler: the eraser and the piece in hand take the press for themselves. */
    function down(e: PointerEvent): void {
      if (!e.isPrimary || e.button > 0 || fresh) return;
      const f = frame();
      const square = squareAt(e, f);
      if (!square) return;
      if (tool === "move") {
        const chosen = surface.selected();
        const code = codeAt(square);
        // A press on another square while a piece is selected is the second tap of a move, not a carry.
        carried = code && !(chosen && chosen !== square) ? { ...f, pointer: e.pointerId, from: square, code, x: e.clientX, y: e.clientY, far: false } : null;
        return;
      }
      e.stopImmediatePropagation();
      e.preventDefault();
      // A press with the piece in hand on that same piece takes it off, and so does the rest of the stroke.
      const put = tool === "erase" || codeAt(square) === tool ? null : tool;
      stroke = { ...f, pointer: e.pointerId, over: null, put };
      try {
        host.setPointerCapture(e.pointerId);
      } catch {
        /* a synthetic or already released pointer cannot be captured */
      }
      move(e);
    }

    function move(e: PointerEvent): void {
      if (carried && e.pointerId === carried.pointer) {
        if (!carried.far && Math.hypot(e.clientX - carried.x, e.clientY - carried.y) >= DRAG_AFTER) carried.far = true;
        return;
      }
      if (!stroke || e.pointerId !== stroke.pointer) return;
      const square = squareAt(e, stroke);
      if (square === stroke.over) return;
      stroke.over = square;
      if (square) work(square);
    }

    function up(e: PointerEvent): void {
      if (stroke && e.pointerId === stroke.pointer) stroke = null;
      if (!carried || e.pointerId !== carried.pointer) return;
      const { from, code, far } = carried;
      const outside = !squareAt(e, carried);
      carried = null;
      // The board has put the piece back on its square by now; it goes at once, not in a fade from there.
      if (far && outside && codeAt(from) === code) options.onChange(placement(from, null), { animate: false });
    }

    function cancel(e: PointerEvent): void {
      if (stroke && e.pointerId === stroke.pointer) stroke = null;
      if (carried && e.pointerId === carried.pointer) carried = null;
    }

    function carry(e: PointerEvent): void {
      if (!fresh || e.pointerId !== fresh.pointer) return;
      const x = e.clientX - fresh.left - fresh.size / 2;
      const y = e.clientY - fresh.top - fresh.size / 2 - (fresh.touch ? fresh.size * TOUCH_LIFT : 0);
      fresh.el.style.transform = `translate(${x}px,${y}px) scale(${fresh.touch ? GROW_TOUCH : GROW_MOUSE})`;
    }

    function drop(e: PointerEvent): void {
      if (!fresh || e.pointerId !== fresh.pointer) return;
      const { code } = fresh;
      // As with a piece dragged on the board: it goes to the square under the pointer, also when a finger holds it lifted.
      const square = e.type === "pointerup" ? squareAt(e, fresh) : null;
      endCarry();
      if (square && codeAt(square) !== code) options.onChange(placement(square, code), { animate: false });
    }

    function endCarry(): void {
      if (!fresh) return;
      fresh.el.parentElement?.remove();
      fresh = null;
      window.removeEventListener("pointermove", carry);
      window.removeEventListener("pointerup", drop);
      window.removeEventListener("pointercancel", drop);
    }

    /** The mouse pointer says which tool is in hand: over the squares and over the pieces alike. */
    function showTool(): void {
      const cursor = options.cursors?.[tool] ?? (tool === "move" ? "" : tool === "erase" ? ERASE_CURSOR : "copy");
      host.style.cursor = cursor;
      if (cursor) host.style.setProperty("--ls-piece-cursor", cursor);
      else host.style.removeProperty("--ls-piece-cursor");
    }

    host.addEventListener("pointerdown", down, true);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerup", up);
    host.addEventListener("pointercancel", cancel);
    showTool();

    return {
      tool: () => tool,
      pick(next) {
        if (next === tool) return;
        tool = next;
        stroke = null;
        carried = null;
        showTool();
      },
      drag(piece, e) {
        endCarry();
        const layer = document.createElement("div");
        layer.className = "ls-layer";
        layer.style.zIndex = "9";
        const el = layer.appendChild(document.createElement("div"));
        el.className = `ls-piece ls-${piece} ls-dragging`;
        fresh = { ...frame(), pointer: e.pointerId, el, code: piece, touch: e.pointerType === "touch" };
        carry(e);
        host.appendChild(layer);
        window.addEventListener("pointermove", carry);
        window.addEventListener("pointerup", drop);
        window.addEventListener("pointercancel", drop);
        e.preventDefault();
      },
      update(change) {
        // A move made with the hand: the board shows it already, the app hears what the position is now.
        if (alive && change?.by === "user") options.onChange(placement(), { animate: true });
      },
      destroy() {
        alive = false;
        endCarry();
        host.removeEventListener("pointerdown", down, true);
        host.removeEventListener("pointermove", move);
        host.removeEventListener("pointerup", up);
        host.removeEventListener("pointercancel", cancel);
        host.style.cursor = "";
        host.style.removeProperty("--ls-piece-cursor");
      },
    };
  };
}
