import { attachInput, type Input } from "./input";
import { coordView, layer, markView, squares, type CoordView, type MarkView } from "./marks";
import { pieceView, type PieceView } from "./pieces";
import { EMPTY, START, cellSquare, oneMove, pairPieces, readFen, screenCell, whatChanged, writeFen, type PieceCode, type Placed, type Square, type Told } from "./position";
import { allows, at, canMove, canPremove, initial, wantedMarks, type State } from "./state";
import type { Board, Change, ModuleHooks, Options, Surface } from "./types";

interface Core {
  s: State;
  host: HTMLElement;
  piecesLayer: HTMLElement;
  pieces: PieceView;
  marks: MarkView;
  coords: CoordView;
  modules: ModuleHooks[];
  spot(square: Square): string;
  anchor(el: HTMLElement, square: Square): void;
  renderMarks(): void;
  /** Tell the modules that the board changed, and what the pieces did, if they did anything. */
  notify(change?: Change | null): void;
}

interface Acts {
  /** Change the selection. Returns the callback to run once the page is written. */
  choose(square: Square | null): () => void;
  select(square: Square | null): void;
  /** A move of the user, or a premove if the piece's turn has not come. */
  play(from: Square, to: Square, slide: boolean): void;
  dropPremove(): void;
  /** The same as a tap on the square. */
  tap(square: Square): void;
}

const pickable = (s: State, p: Placed): boolean => canMove(s, p) || canPremove(s, p);

/** Copy the plain options into the state. Returns whether the board was flipped. */
function take(s: State, o: Options): boolean {
  const flipped = o.orientation !== undefined && o.orientation !== s.orientation;
  if (flipped) s.orientation = o.orientation!;
  if (o.movable !== undefined) s.movable = o.movable;
  if (o.targets !== undefined) s.targets = o.targets;
  if (o.premovable !== undefined) s.premovable = o.premovable;
  if (o.premoveTargets !== undefined) s.premoveTargets = o.premoveTargets;
  if (o.premove !== undefined) s.premove = o.premove;
  if (o.lastMove !== undefined) s.lastMove = o.lastMove;
  if (o.check !== undefined) s.check = o.check;
  if (o.marks !== undefined) s.marks = o.marks ?? [];
  if (o.coordinates !== undefined) s.coordinates = o.coordinates;
  if (o.onMove !== undefined) s.onMove = o.onMove;
  if (o.onSelect !== undefined) s.onSelect = o.onSelect;
  if (o.onPremove !== undefined) s.onPremove = o.onPremove;
  if (o.onTap !== undefined) s.onTap = o.onTap;
  if (o.onChange !== undefined) s.onChange = o.onChange;
  return flipped;
}

function makeCore(host: HTMLElement): Core {
  const s = initial();
  host.classList.add("ls-board");
  squares(host);
  const marksLayer = layer(host, "ls-marks");
  const piecesLayer = layer(host, "ls-pieces");
  // Places are fractions of the board's width (cqw): exact at every size in
  // every engine, and nothing to recompute on a resize. Percent of the
  // element's own box is the fallback; Safari measures that on the
  // pixel-snapped box, which lets pieces drift at odd board widths.
  const wide = typeof CSS !== "undefined" && CSS.supports("width", "1cqw");
  const place = (col: number, row: number): string => (wide ? `translate(${col * 12.5}cqw,${row * 12.5}cqw)` : `translate(${col * 100}%,${row * 100}%)`);
  const spot = (square: Square): string => place(...screenCell(square, s.orientation));
  // Marks and an app's own HTML are placed with the separate `translate`
  // property where the browser has it, so their `transform` stays free: an
  // app's stylesheet can pulse or pop a mark without moving it off its square.
  const free = typeof CSS !== "undefined" && CSS.supports("translate", "1px 1px");
  const anchor = (el: HTMLElement, square: Square): void => {
    if (!free) return void (el.style.transform = spot(square));
    const [col, row] = screenCell(square, s.orientation);
    el.style.translate = wide ? `${col * 12.5}cqw ${row * 12.5}cqw` : `${col * 100}% ${row * 100}%`;
  };
  const marks = markView(host, marksLayer, anchor, (square) => screenCell(square, s.orientation));
  const modules: ModuleHooks[] = [];
  return {
    s,
    host,
    piecesLayer,
    pieces: pieceView(piecesLayer, spot),
    marks,
    coords: coordView(host, piecesLayer, place),
    modules,
    spot,
    anchor,
    renderMarks: () => marks.render(wantedMarks(s)),
    notify: (change) => modules.forEach((m) => m.update?.(change ?? undefined)),
  };
}

function makeActs(c: Core): Acts {
  const { s } = c;

  function choose(square: Square | null): () => void {
    if (s.selected === square) return () => {};
    s.selected = square;
    return () => s.onSelect?.(square);
  }

  function select(square: Square | null): void {
    const tell = choose(square);
    c.renderMarks();
    tell();
  }

  function play(from: Square, to: Square, slide: boolean): void {
    const mover = at(s, from)!;
    const tell = choose(null);
    s.hover = null;
    if (!canMove(s, mover)) {
      s.premove = [from, to];
      if (!slide) c.pieces.put(mover, true);
      c.renderMarks();
      tell();
      s.onPremove?.(s.premove);
      return;
    }
    s.asked = { before: [...s.pieces], from, to };
    const taken = c.pieces.shift(s.pieces, from, to, slide);
    const change: Change = { ...oneMove(mover, to, taken), by: "user", animated: true };
    s.lastMove = [from, to];
    c.renderMarks();
    c.notify(change);
    tell();
    s.onChange?.(change);
    s.onMove?.({ from, to, piece: mover.code, ...(taken && { captured: taken.code }) });
  }

  function dropPremove(): void {
    if (!s.premove) return;
    s.premove = null;
    c.renderMarks();
    s.onPremove?.(null);
  }

  function tap(square: Square): void {
    dropPremove();
    const piece = at(s, square);
    if (s.selected && s.selected !== square && allows(s, s.selected, square)) play(s.selected, square, true);
    else select(piece && pickable(s, piece) && s.selected !== square ? square : null);
  }

  return { choose, select, play, dropPremove, tap };
}

function makeInput(c: Core, acts: Acts): Input {
  const { s } = c;
  return attachInput({
    host: c.host,
    grid: c.piecesLayer,
    orientation: () => s.orientation,
    enabled: () => s.movable !== "none" || s.premovable !== "none" || !!s.onTap,
    selected: () => s.selected,
    at: (square) => at(s, square),
    holds: (p) => s.pieces.includes(p),
    element: c.pieces.element,
    canPick: (p) => pickable(s, p),
    allows: (from, to) => allows(s, from, to),
    select: acts.select,
    hover(square) {
      if (s.hover === square) return;
      s.hover = square;
      c.renderMarks();
    },
    settle: c.pieces.put,
    play: acts.play,
    lift: (on) => c.piecesLayer.classList.toggle("ls-lift", on),
    pressed: acts.dropPremove,
    tapped: (square) => s.onTap?.(square),
  });
}

/**
 * What the pieces did when the app set a position. The app's answer to a
 * move of the user is not a change of its own when it is that same move,
 * completed (the castling rook, the pawn taken in passing, the promoted
 * piece) or taken back.
 */
function changeOf(s: State, shown: readonly Placed[], next: ReadonlyMap<Square, PieceCode>, told: Told | null, animated: boolean): Change | null {
  const asked = s.asked;
  s.asked = null;
  if (!told) return null;
  if (asked) {
    const whole = whatChanged(asked.before, pairPieces(asked.before, next, () => 0));
    if (!whole || (whole.from === asked.from && whole.to === asked.to)) return null;
  }
  return { ...told, by: "app", animated };
}

function makeSet(c: Core, acts: Acts, input: Input): Board["set"] {
  const { s, pieces } = c;
  let drawn = false;
  return (o, how) => {
    let change: Change | null = null;
    const flipped = take(s, o);
    if (flipped) {
      input.abort();
      pieces.sweep();
      for (const p of s.pieces) pieces.put(p, false);
      c.marks.replace();
    }
    if (o.position !== undefined) {
      const fen = o.position === "start" ? START : o.position === "empty" ? EMPTY : o.position;
      const next = readFen(fen);
      const animated = drawn && !flipped && how?.animate !== false;
      const shown = s.pieces;
      const pairing = pieces.show(shown, next, animated);
      s.pieces = pairing.placed;
      change = drawn ? changeOf(s, shown, next, whatChanged(shown, pairing), animated) : null;
      input.sync();
    }
    const chosen = s.selected && at(s, s.selected);
    const tell = chosen && pickable(s, chosen) ? () => {} : acts.choose(null);
    const lostPremove = !!s.premove && !at(s, s.premove[0]);
    if (lostPremove) s.premove = null;
    const active = s.movable !== "none" || s.premovable !== "none";
    if (!active) input.abort();
    c.host.classList.toggle("ls-interactive", active);
    c.coords.render(s.coordinates, s.orientation);
    c.renderMarks();
    drawn = true;
    c.notify(change);
    tell();
    if (change) s.onChange?.(change);
    if (lostPremove) s.onPremove?.(null);
  };
}

function makeSurface(c: Core, acts: Acts): Surface {
  const { s } = c;
  return {
    host: c.host,
    orientation: () => s.orientation,
    cell: (square) => screenCell(square, s.orientation),
    square: (col, row) => cellSquare(col, row, s.orientation),
    spot: c.spot,
    anchor: c.anchor,
    pieces: () => s.pieces,
    lastMove: () => s.lastMove,
    check: () => s.check,
    selected: () => s.selected,
    tap: acts.tap,
  };
}

export function lightsquare(host: HTMLElement, options: Options = {}): Board {
  const c = makeCore(host);
  const { s, pieces } = c;
  const acts = makeActs(c);
  const input = makeInput(c, acts);
  const set = makeSet(c, acts, input);
  const surface = makeSurface(c, acts);
  set({ position: "start", ...options });

  return {
    set,
    move(from, to) {
      const mover = at(s, from);
      const taken = pieces.shift(s.pieces, from, to, true);
      const change: Change | null = mover && from !== to ? { ...oneMove(mover, to, taken), by: "app", animated: true } : null;
      s.asked = null;
      input.sync();
      c.renderMarks();
      c.notify(change);
      if (change) s.onChange?.(change);
    },
    select(square) {
      acts.select(square && at(s, square) ? square : null);
    },
    position: () => writeFen(s.pieces),
    playPremove() {
      const queued = s.premove;
      if (!queued) return false;
      s.premove = null;
      const mover = at(s, queued[0]);
      if (mover && canMove(s, mover) && allows(s, queued[0], queued[1])) {
        acts.play(queued[0], queued[1], true);
        return true;
      }
      c.renderMarks();
      return false;
    },
    use(module) {
      const made = module(surface);
      c.modules.push(made);
      made.update?.();
      return made;
    },
    destroy() {
      for (const m of c.modules) m.destroy?.();
      input.detach();
      pieces.destroy();
      c.marks.destroy();
      c.coords.render(false, s.orientation);
      for (const el of [...host.querySelectorAll(":scope > .ls-layer")]) el.remove();
      host.classList.remove("ls-board", "ls-interactive");
    },
  };
}
