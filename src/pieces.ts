import { pairPieces, type PieceCode, type Placed, type Square } from "./position";

export interface PieceView {
  element(p: Placed): HTMLElement;
  /** Place a piece on its square, with a slide or at once. */
  put(p: Placed, slide: boolean): void;
  /** Show the next position; returns its pieces. Nothing is touched if nothing changed. */
  show(current: readonly Placed[], next: ReadonlyMap<Square, PieceCode>, animate: boolean): Placed[];
  /** Move one piece, taking what stands on the target. Returns the taken piece. */
  shift(pieces: Placed[], from: Square, to: Square, slide: boolean): Placed | undefined;
  /** Finish what the change before left behind: fading pieces, the on-top mark. */
  sweep(): void;
  destroy(): void;
}

export function pieceView(layer: HTMLElement, spot: (square: Square) => string): PieceView {
  const elements = new Map<number, HTMLElement>();
  const fading = new Set<Element>();
  /** The pieces of the latest move: drawn above the others while they slide. */
  const onTop = new Set<Element>();
  let lastId = 0;

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
    layer.appendChild(el);
  }

  function remove(p: Placed, fade: boolean): void {
    const el = elements.get(p.id)!;
    elements.delete(p.id);
    if (!fade) return el.remove();
    el.className = `ls-piece ls-${p.code} ls-gone`;
    fading.add(el);
  }

  function sweep(): void {
    for (const el of fading) el.remove();
    fading.clear();
    for (const el of onTop) el.classList.remove("ls-top");
    onTop.clear();
  }

  /**
   * A fade ended: the piece is gone. A slide ended: the piece gives up its
   * transition, so that resizing the board cannot make it trail behind.
   */
  function onEnded(e: TransitionEvent): void {
    const el = e.target as Element;
    if (fading.delete(el)) el.remove();
    else if (e.propertyName === "transform") el.classList.remove("ls-slide", "ls-top");
  }
  layer.addEventListener("transitionend", onEnded);

  return {
    element: (p) => elements.get(p.id)!,
    put,
    sweep,
    show(current, next, animate) {
      const pairing = pairPieces(current, next, () => ++lastId);
      if (!pairing.moved.length && !pairing.added.length && !pairing.removed.length) return pairing.placed;
      sweep();
      for (const p of pairing.removed) remove(p, animate);
      for (const p of pairing.moved) put(p, animate);
      for (const p of pairing.added) add(p);
      return pairing.placed;
    },
    shift(pieces, from, to, slide) {
      const mover = pieces.find((p) => p.square === from);
      if (!mover || from === to) return undefined;
      sweep();
      const taken = pieces.find((p) => p.square === to);
      if (taken) {
        remove(taken, slide);
        pieces.splice(pieces.indexOf(taken), 1);
      }
      const moved = { ...mover, square: to };
      pieces[pieces.indexOf(mover)] = moved;
      put(moved, slide);
      return taken;
    },
    destroy() {
      layer.removeEventListener("transitionend", onEnded);
    },
  };
}
