/** "wk", "bp", ...: colour then piece letter, lowercase. */
export type PieceCode = `${"w" | "b"}${"k" | "q" | "r" | "b" | "n" | "p"}`;
/** "a1" .. "h8". */
export type Square = string;
export type Color = "white" | "black";

export interface Placed {
  /** Stable across moves: the element that shows this piece keeps it. */
  id: number;
  square: Square;
  code: PieceCode;
}

const FILES = "abcdefgh";

export function isSquare(s: string): boolean {
  return /^[a-h][1-8]$/.test(s);
}

/** Piece placement of a FEN (the first field is enough). */
export function readFen(fen: string): Map<Square, PieceCode> {
  const out = new Map<Square, PieceCode>();
  const rows = fen.trim().split(/\s+/)[0].split("/");
  if (rows.length !== 8) throw new Error(`lightsquare: not a FEN placement: ${fen}`);
  rows.forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (ch >= "1" && ch <= "8") {
        f += Number(ch);
        continue;
      }
      const lower = ch.toLowerCase();
      if (!"kqrbnp".includes(lower) || f > 7) throw new Error(`lightsquare: bad FEN row "${row}"`);
      out.set(`${FILES[f]}${8 - r}`, `${ch === lower ? "b" : "w"}${lower}` as PieceCode);
      f++;
    }
  });
  return out;
}

/** Column and row on screen (0..7 from the top-left) for a square. */
export function screenCell(square: Square, orientation: Color): [number, number] {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  return orientation === "white" ? [file, 8 - rank] : [7 - file, rank - 1];
}

/** The square under a screen cell, the inverse of screenCell. */
export function cellSquare(col: number, row: number, orientation: Color): Square | null {
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  return orientation === "white" ? `${FILES[col]}${8 - row}` : `${FILES[7 - col]}${row + 1}`;
}

function distance(a: Square, b: Square): number {
  return Math.abs(a.charCodeAt(0) - b.charCodeAt(0)) + Math.abs(Number(a[1]) - Number(b[1]));
}

/**
 * Pair the pieces of the next position with the current ones, so moved
 * pieces keep their element and slide instead of being redrawn:
 * 1. a piece already on its square stays;
 * 2. every other target takes the nearest free piece of the same kind
 *    (castling rook, recapture, en passant all resolve to the right one);
 * 3. what is left is new (promotion, set-up) or gone (captured).
 */
export function pairPieces(
  current: Placed[],
  next: Map<Square, PieceCode>,
  newId: () => number,
): { placed: Placed[]; moved: Placed[]; added: Placed[]; removed: Placed[] } {
  const free = new Map(current.map((p) => [p.id, p]));
  const placed: Placed[] = [];
  const open: [Square, PieceCode][] = [];
  for (const [square, code] of next) {
    const stay = current.find((p) => p.square === square && p.code === code && free.has(p.id));
    if (stay) {
      free.delete(stay.id);
      placed.push(stay);
    } else open.push([square, code]);
  }
  const moved: Placed[] = [];
  const added: Placed[] = [];
  for (const [square, code] of open) {
    let best: Placed | null = null;
    for (const p of free.values()) {
      if (p.code === code && (!best || distance(p.square, square) < distance(best.square, square))) best = p;
    }
    if (best) {
      free.delete(best.id);
      const m = { ...best, square };
      placed.push(m);
      moved.push(m);
    } else {
      const a = { id: newId(), square, code };
      placed.push(a);
      added.push(a);
    }
  }
  return { placed, moved, added, removed: [...free.values()] };
}
