/**
 * Where a piece could go if the squares in its way were empty: the usual
 * limits for a premove, when the position will have changed before the
 * move is played. This is geometry, not chess rules: it does not know
 * about check, pins or whose turn it is. The app still decides whether
 * the premove is legal when its turn comes.
 *
 *   board.set({ premovable: "white", premoveTargets: premoveTargets(fen, "white") });
 */
import { readFen, type Color, type PieceCode, type Square } from "../position.js";

export interface PremoveOptions {
  /**
   * Allow squares that hold the mover's own pieces (default true). A premove
   * to such a square is a recapture: it works if the piece there is taken.
   */
  own?: boolean;
}

const LINES: Record<string, Array<[number, number]>> = {
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  n: [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]],
};
LINES.q = LINES.k = [...LINES.r, ...LINES.b];

const name = (file: number, rank: number): Square => `${"abcdefgh"[file]}${rank + 1}`;
const inside = (file: number, rank: number): boolean => file >= 0 && file < 8 && rank >= 0 && rank < 8;

function pawn(file: number, rank: number, white: boolean): Array<[number, number]> {
  const step = white ? 1 : -1;
  const out: Array<[number, number]> = [[file, rank + step], [file - 1, rank + step], [file + 1, rank + step]];
  if (rank === (white ? 1 : 6)) out.push([file, rank + 2 * step]);
  return out;
}

function reach(code: PieceCode, file: number, rank: number, pieces: ReadonlyMap<Square, PieceCode>): Array<[number, number]> {
  const kind = code[1];
  if (kind === "p") return pawn(file, rank, code[0] === "w");
  const out: Array<[number, number]> = [];
  const far = kind === "n" || kind === "k" ? 1 : 7;
  for (const [df, dr] of LINES[kind]) for (let i = 1; i <= far; i++) out.push([file + df * i, rank + dr * i]);
  const home = code[0] === "w" ? 0 : 7;
  if (kind === "k" && file === 4 && rank === home) {
    if (pieces.get(name(7, home)) === `${code[0]}r`) out.push([6, home]);
    if (pieces.get(name(0, home)) === `${code[0]}r`) out.push([2, home]);
  }
  return out;
}

export function premoveTargets(position: string, color: Color, options: PremoveOptions = {}): Map<Square, Square[]> {
  const pieces = readFen(position);
  const side = color[0];
  const targets = new Map<Square, Square[]>();
  for (const [square, code] of pieces) {
    if (code[0] !== side) continue;
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]) - 1;
    const squares = new Set<Square>();
    for (const [f, r] of reach(code, file, rank, pieces)) {
      if (!inside(f, r)) continue;
      const to = name(f, r);
      if (options.own === false && pieces.get(to)?.[0] === side) continue;
      squares.add(to);
    }
    if (squares.size) targets.set(square, [...squares]);
  }
  return targets;
}
