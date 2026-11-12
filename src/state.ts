import type { Color, Placed, Square } from "./position";
import type { Change, SquareMark, Targets, UserMove } from "./types";

export interface State {
  pieces: Placed[];
  orientation: Color;
  movable: Color | "both" | "none";
  targets: Targets | null;
  premovable: Color | "none";
  premoveTargets: Targets | null;
  premove: readonly [Square, Square] | null;
  lastMove: readonly [Square, Square] | null;
  check: Square | null;
  marks: readonly SquareMark[];
  coordinates: boolean;
  selected: Square | null;
  hover: Square | null;
  onMove: ((move: UserMove) => void) | null;
  onSelect: ((square: Square | null) => void) | null;
  onPremove: ((premove: readonly [Square, Square] | null) => void) | null;
  onTap: ((square: Square) => void) | null;
  onChange: ((change: Change) => void) | null;
  /** The pieces before a move of the user that the app has not answered yet, and that move's squares. */
  asked: { before: readonly Placed[]; from: Square; to: Square } | null;
}

export interface Wanted {
  square: Square;
  above?: boolean;
}

export const initial = (): State => ({
  pieces: [],
  orientation: "white",
  movable: "none",
  targets: null,
  premovable: "none",
  premoveTargets: null,
  premove: null,
  lastMove: null,
  check: null,
  marks: [],
  coordinates: true,
  selected: null,
  hover: null,
  onMove: null,
  onSelect: null,
  onPremove: null,
  onTap: null,
  onChange: null,
  asked: null,
});

export const at = (s: State, square: Square): Placed | undefined => s.pieces.find((p) => p.square === square);
export const canMove = (s: State, p: Placed): boolean => s.movable === "both" || s.movable[0] === p.code[0];
export const canPremove = (s: State, p: Placed): boolean => !canMove(s, p) && s.premovable[0] === p.code[0];

/** May the piece on `from` go to `to`, as a move or as a premove? */
export function allows(s: State, from: Square, to: Square): boolean {
  const mover = at(s, from);
  if (!mover || from === to) return false;
  const targets = canMove(s, mover) ? s.targets : canPremove(s, mover) ? s.premoveTargets : undefined;
  if (targets === undefined) return false;
  if (targets) return targets.get(from)?.includes(to) ?? false;
  return at(s, to)?.code[0] !== mover.code[0];
}

/**
 * Every mark to show, by key: "kind" or "kind name". A mark whose key
 * stays keeps its element; if only its square changed, it is moved.
 */
export function wantedMarks(s: State): Map<string, Wanted> {
  const want = new Map<string, Wanted>();
  s.lastMove?.forEach((square, i) => want.set(`last ${i}`, { square }));
  s.premove?.forEach((square, i) => want.set(`premove ${i}`, { square }));
  if (s.check) want.set("check", { square: s.check });
  for (const m of s.marks) want.set(`${m.name} ${m.square}${m.above ? " above" : ""}`, m);
  const chosen = s.selected && at(s, s.selected);
  if (chosen) {
    want.set("select", { square: chosen.square });
    const targets = canMove(s, chosen) ? s.targets : s.premoveTargets;
    for (const t of targets?.get(chosen.square) ?? []) want.set(`${at(s, t) ? "ring" : "dot"} ${t}`, { square: t });
  }
  if (s.hover) want.set("hover", { square: s.hover });
  return want;
}
