import { attachInput } from "./input";
import { EMPTY, START, pairPieces, readFen, screenCell, writeFen, type Color, type PieceCode, type Placed, type Square } from "./position";
import type { Board, Options, Targets, UserMove } from "./types";

interface State {
  pieces: Placed[];
  orientation: Color;
  movable: Color | "both" | "none";
  targets: Targets | null;
  lastMove: readonly [Square, Square] | null;
  check: Square | null;
  selected: Square | null;
  hover: Square | null;
  onMove: ((move: UserMove) => void) | null;
  onSelect: ((square: Square | null) => void) | null;
}

interface Mark {
  el: HTMLElement;
  square: Square;
}

function layer(host: HTMLElement, name: string): HTMLElement {
  const el = document.createElement("div");
  el.className = `ls-layer ${name}`;
  host.appendChild(el);
  return el;
}

export function lightsquare(host: HTMLElement, options: Options = {}): Board {
  const s: State = { pieces: [], orientation: "white", movable: "none", targets: null, lastMove: null, check: null, selected: null, hover: null, onMove: null, onSelect: null };
  host.classList.add("ls-board");
  const marksLayer = layer(host, "ls-marks");
  const piecesLayer = layer(host, "ls-pieces");
  const elements = new Map<number, HTMLElement>();
  const marks = new Map<string, Mark>();
  const fading = new Set<Element>();
  /** The pieces of the latest move: drawn above the others while they slide. */
  const onTop = new Set<Element>();
  let lastId = 0;

  const spot = (square: Square): string => {
    const [col, row] = screenCell(square, s.orientation);
    return `translate(${col * 100}%,${row * 100}%)`;
  };
  const at = (square: Square): Placed | undefined => s.pieces.find((p) => p.square === square);
  const canPick = (p: Placed): boolean => s.movable === "both" || s.movable[0] === p.code[0];

  function allows(from: Square, to: Square): boolean {
    if (s.targets) return s.targets.get(from)?.includes(to) ?? false;
    const mover = at(from);
    return !!mover && from !== to && at(to)?.code[0] !== mover.code[0];
  }

  function put(p: Placed, slide: boolean): void {
    const el = elements.get(p.id)!;
    el.className = `ls-piece ls-${p.code}${slide ? " ls-slide ls-top" : ""}`;
    el.style.transform = spot(p.square);
    if (slide) onTop.add(el);
  }

  function add(p: Placed): void {
    const el = document.createElement("div");
    elements.set(p.id, el);
    put(p, false);
    piecesLayer.appendChild(el);
  }

  function remove(p: Placed, fade: boolean): void {
    const el = elements.get(p.id)!;
    elements.delete(p.id);
    if (!fade) return el.remove();
    el.className = `ls-piece ls-${p.code} ls-gone`;
    fading.add(el);
  }

  /** Before every change: finish what the change before it left behind. */
  function sweep(): void {
    for (const el of fading) el.remove();
    fading.clear();
    for (const el of onTop) el.classList.remove("ls-top");
    onTop.clear();
  }

  function show(next: ReadonlyMap<Square, PieceCode>, animate: boolean): void {
    sweep();
    const pairing = pairPieces(s.pieces, next, () => ++lastId);
    for (const p of pairing.removed) remove(p, animate);
    for (const p of pairing.moved) put(p, animate);
    for (const p of pairing.added) add(p);
    s.pieces = pairing.placed;
  }

  /**
   * Every mark to show, by key: "kind" or "kind name". A mark whose key
   * stays keeps its element; if only its square changed, it is moved.
   */
  function wantedMarks(): Map<string, Square> {
    const want = new Map<string, Square>();
    s.lastMove?.forEach((square, i) => want.set(`last ${i}`, square));
    if (s.check) want.set("check", s.check);
    if (s.selected) {
      want.set("select", s.selected);
      for (const t of s.targets?.get(s.selected) ?? []) want.set(`${at(t) ? "ring" : "dot"} ${t}`, t);
    }
    if (s.hover) want.set("hover", s.hover);
    return want;
  }

  function renderMarks(): void {
    const want = wantedMarks();
    for (const [key, mark] of marks) {
      if (want.has(key)) continue;
      mark.el.remove();
      marks.delete(key);
    }
    for (const [key, square] of want) {
      const mark = marks.get(key);
      if (mark) {
        if (mark.square !== square) mark.el.style.transform = spot((mark.square = square));
        continue;
      }
      const el = document.createElement("div");
      el.className = `ls-mark ls-mark-${key.split(" ")[0]}`;
      el.style.transform = spot(square);
      marksLayer.appendChild(el);
      marks.set(key, { el, square });
    }
  }

  function choose(square: Square | null): boolean {
    if (s.selected === square) return false;
    s.selected = square;
    return true;
  }

  function select(square: Square | null): void {
    if (!choose(square)) return;
    renderMarks();
    s.onSelect?.(square);
  }

  function shift(from: Square, to: Square, slide: boolean): Placed | undefined {
    const mover = at(from);
    if (!mover || from === to) return undefined;
    sweep();
    const taken = at(to);
    if (taken) {
      remove(taken, slide);
      s.pieces.splice(s.pieces.indexOf(taken), 1);
    }
    const moved = { ...mover, square: to };
    s.pieces[s.pieces.indexOf(mover)] = moved;
    put(moved, slide);
    return taken;
  }

  function play(from: Square, to: Square, slide: boolean): void {
    const piece = at(from)!.code;
    const taken = shift(from, to, slide);
    const unselected = choose(null);
    s.hover = null;
    s.lastMove = [from, to];
    renderMarks();
    if (unselected) s.onSelect?.(null);
    s.onMove?.({ from, to, piece, ...(taken && { captured: taken.code }) });
  }

  const input = attachInput({
    host,
    grid: piecesLayer,
    orientation: () => s.orientation,
    enabled: () => s.movable !== "none",
    selected: () => s.selected,
    at,
    holds: (p) => s.pieces.includes(p),
    element: (p) => elements.get(p.id)!,
    canPick,
    allows,
    select,
    hover(square) {
      if (s.hover === square) return;
      s.hover = square;
      renderMarks();
    },
    settle: put,
    play,
  });

  function onFaded(e: TransitionEvent): void {
    const el = e.target as Element;
    if (fading.delete(el)) el.remove();
  }
  piecesLayer.addEventListener("transitionend", onFaded);

  let drawn = false;

  function flip(orientation: Color): void {
    s.orientation = orientation;
    input.abort();
    sweep();
    for (const p of s.pieces) put(p, false);
    for (const mark of marks.values()) mark.el.style.transform = spot(mark.square);
  }

  function set(o: Options, how?: { animate?: boolean }): void {
    const flipped = o.orientation !== undefined && o.orientation !== s.orientation;
    if (flipped) flip(o.orientation!);
    if (o.movable !== undefined) s.movable = o.movable;
    if (o.targets !== undefined) s.targets = o.targets;
    if (o.lastMove !== undefined) s.lastMove = o.lastMove;
    if (o.check !== undefined) s.check = o.check;
    if (o.onMove !== undefined) s.onMove = o.onMove;
    if (o.onSelect !== undefined) s.onSelect = o.onSelect;
    if (o.position !== undefined) {
      const fen = o.position === "start" ? START : o.position === "empty" ? EMPTY : o.position;
      show(readFen(fen), drawn && !flipped && how?.animate !== false);
      input.sync();
    }
    const chosen = s.selected && at(s.selected);
    const unselected = !!s.selected && !(chosen && canPick(chosen)) && choose(null);
    if (s.movable === "none") input.abort();
    host.classList.toggle("ls-interactive", s.movable !== "none");
    renderMarks();
    drawn = true;
    if (unselected) s.onSelect?.(null);
  }

  set({ position: "start", ...options });

  return {
    set,
    move(from, to) {
      shift(from, to, true);
      input.sync();
      renderMarks();
    },
    select(square) {
      const piece = square && at(square);
      select(piece ? square : null);
    },
    position: () => writeFen(s.pieces),
    destroy() {
      input.detach();
      piecesLayer.removeEventListener("transitionend", onFaded);
      marksLayer.remove();
      piecesLayer.remove();
      host.classList.remove("ls-board", "ls-interactive");
    },
  };
}
