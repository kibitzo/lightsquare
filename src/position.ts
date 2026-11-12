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

export interface Pairing {
  /** The whole next position. Pieces that stay are the same objects as before. */
  placed: Placed[];
  /** Kept their element, changed square (and, for a promotion, their code). */
  moved: Placed[];
  added: Placed[];
  removed: Placed[];
}

const FILES = "abcdefgh";
export const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
export const EMPTY = "8/8/8/8/8/8/8/8";

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
    if (f !== 8) throw new Error(`lightsquare: bad FEN row "${row}"`);
  });
  return out;
}

/** The placement field of a FEN for the given pieces. */
export function writeFen(pieces: Iterable<{ square: Square; code: PieceCode }>): string {
  const grid = new Map<Square, PieceCode>();
  for (const p of pieces) grid.set(p.square, p.code);
  const rows: string[] = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = "";
    let gap = 0;
    for (const file of FILES) {
      const code = grid.get(`${file}${rank}`);
      if (!code) {
        gap++;
        continue;
      }
      if (gap) row += gap;
      gap = 0;
      row += code[0] === "w" ? code[1].toUpperCase() : code[1];
    }
    rows.push(gap ? row + gap : row);
  }
  return rows.join("/");
}

/** Column and row on screen (0..7 from the top-left) for a square. */
export function screenCell(square: Square, orientation: Color): [number, number] {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  return orientation === "white" ? [file, 8 - rank] : [7 - file, rank - 1];
}

/** The square under a screen cell, the inverse of screenCell. */
export function cellSquare(col: number, row: number, orientation: Color): Square | null {
  if (!(col >= 0 && col <= 7 && row >= 0 && row <= 7)) return null;
  return orientation === "white" ? `${FILES[col]}${8 - row}` : `${FILES[7 - col]}${row + 1}`;
}

function distance(a: Square, b: Square): number {
  return Math.abs(a.charCodeAt(0) - b.charCodeAt(0)) + Math.abs(Number(a[1]) - Number(b[1]));
}

/** A pawn one step from the last rank can turn into the new piece on it. */
function promotes(pawn: Placed, square: Square, code: PieceCode): boolean {
  const white = code[0] === "w";
  return (
    pawn.code === `${code[0]}p` &&
    code[1] !== "p" &&
    code[1] !== "k" &&
    pawn.square[1] === (white ? "7" : "2") &&
    square[1] === (white ? "8" : "1") &&
    Math.abs(pawn.square.charCodeAt(0) - square.charCodeAt(0)) <= 1
  );
}

/**
 * Pair the pieces of the next position with the current ones, so moved
 * pieces keep their element and slide instead of being redrawn:
 * 1. a piece already on its square stays (same object, untouched);
 * 2. every other target takes the nearest free piece of the same kind
 *    (castling rook, recapture, en passant all resolve to the right one);
 * 3. a new piece on the last rank takes the pawn that stood in front of it
 *    (promotion: the pawn's element slides and changes its picture);
 * 4. what is left is new (set-up) or gone (captured).
 */
export function pairPieces(current: readonly Placed[], next: ReadonlyMap<Square, PieceCode>, newId: () => number): Pairing {
  const bySquare = new Map(current.map((p) => [p.square, p]));
  const free = new Set(current);
  const placed: Placed[] = [];
  const open: [Square, PieceCode][] = [];
  for (const [square, code] of next) {
    const stay = bySquare.get(square);
    if (stay && stay.code === code) {
      free.delete(stay);
      placed.push(stay);
    } else open.push([square, code]);
  }
  const moved: Placed[] = [];
  const added: Placed[] = [];
  const unmatched: [Square, PieceCode][] = [];
  for (const [square, code] of open) {
    let best: Placed | null = null;
    for (const p of free) {
      if (p.code === code && (!best || distance(p.square, square) < distance(best.square, square))) best = p;
    }
    if (best) {
      free.delete(best);
      moved.push({ id: best.id, square, code });
    } else unmatched.push([square, code]);
  }
  for (const [square, code] of unmatched) {
    let pawn: Placed | null = null;
    for (const p of free) if (promotes(p, square, code)) pawn = p;
    if (pawn) {
      free.delete(pawn);
      moved.push({ id: pawn.id, square, code });
    } else added.push({ id: newId(), square, code });
  }
  placed.push(...moved, ...added);
  return { placed, moved, added, removed: [...free] };
}
