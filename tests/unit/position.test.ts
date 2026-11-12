import { describe, expect, it } from "vitest";
import { EMPTY, START, cellSquare, isSquare, pairPieces, readFen, screenCell, writeFen, type PieceCode, type Placed, type Square } from "../../src/position";

function setUp(fen: string): Placed[] {
  let id = 0;
  return pairPieces([], readFen(fen), () => ++id).placed;
}

function step(current: Placed[], fen: string) {
  let id = 1000;
  return pairPieces(current, readFen(fen), () => ++id);
}

const idAt = (pieces: Placed[], square: Square): number | undefined => pieces.find((p) => p.square === square)?.id;

describe("readFen", () => {
  it("reads the starting position", () => {
    const pos = readFen(START);
    expect(pos.size).toBe(32);
    expect(pos.get("a1")).toBe("wr");
    expect(pos.get("e1")).toBe("wk");
    expect(pos.get("d8")).toBe("bq");
    expect(pos.get("h7")).toBe("bp");
    expect(pos.get("e4")).toBeUndefined();
  });

  it("reads only the placement field of a full FEN", () => {
    const pos = readFen("r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3");
    expect(pos.get("c6")).toBe("bn");
    expect(pos.get("f3")).toBe("wn");
    expect(pos.size).toBe(32);
  });

  it("reads an empty board", () => {
    expect(readFen(EMPTY).size).toBe(0);
  });

  it.each(["", "8/8/8", "9/8/8/8/8/8/8/8", "8/8/8/8/8/8/8/7", "8/8/8/8/8/8/8/x7", "rnbqkbnrr/8/8/8/8/8/8/8", "8/8/8/8/8/8/8/8/8"])("rejects %j", (bad) => {
    expect(() => readFen(bad)).toThrow(/lightsquare/);
  });
});

describe("writeFen", () => {
  it.each([
    START,
    EMPTY,
    "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R",
    "8/8/8/3k4/8/3K4/8/7R",
    "k7/8/8/8/8/8/8/7K",
    "1n1q1b1r/p1p1p1p1/8/8/8/8/1P1P1P1P/R1B1K1N1",
  ])("round-trips %s", (fen) => {
    const pieces = [...readFen(fen)].map(([square, code]) => ({ square, code }));
    expect(writeFen(pieces)).toBe(fen);
  });
});

describe("screen cells", () => {
  it("puts a8 top-left for White and h1 top-left for Black", () => {
    expect(screenCell("a8", "white")).toEqual([0, 0]);
    expect(screenCell("h1", "white")).toEqual([7, 7]);
    expect(screenCell("h1", "black")).toEqual([0, 0]);
    expect(screenCell("a8", "black")).toEqual([7, 7]);
    expect(screenCell("e2", "white")).toEqual([4, 6]);
    expect(screenCell("e2", "black")).toEqual([3, 1]);
  });

  it("cellSquare is the inverse of screenCell for all 64 squares, both sides", () => {
    for (const orientation of ["white", "black"] as const) {
      const seen = new Set<string>();
      for (let col = 0; col < 8; col++) {
        for (let row = 0; row < 8; row++) {
          const square = cellSquare(col, row, orientation)!;
          expect(isSquare(square)).toBe(true);
          expect(screenCell(square, orientation)).toEqual([col, row]);
          seen.add(square);
        }
      }
      expect(seen.size).toBe(64);
    }
  });

  it("has no square outside the board", () => {
    for (const [col, row] of [[-1, 0], [0, -1], [8, 0], [0, 8], [NaN, 0], [0, Infinity]]) {
      expect(cellSquare(col, row, "white")).toBeNull();
    }
  });
});

describe("pairPieces", () => {
  it("sets up from nothing: everything is new", () => {
    const d = step([], START);
    expect(d.added).toHaveLength(32);
    expect(d.moved).toHaveLength(0);
    expect(d.removed).toHaveLength(0);
    expect(new Set(d.placed.map((p) => p.id)).size).toBe(32);
  });

  it("the same position touches nothing and keeps every object", () => {
    const cur = setUp(START);
    const d = step(cur, START);
    expect(d.moved).toHaveLength(0);
    expect(d.added).toHaveLength(0);
    expect(d.removed).toHaveLength(0);
    expect(new Set(d.placed)).toEqual(new Set(cur));
  });

  it("a quiet move moves one piece and keeps its id", () => {
    const cur = setUp(START);
    const pawn = idAt(cur, "e2");
    const d = step(cur, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");
    expect(d.moved).toEqual([{ id: pawn, square: "e4", code: "wp" }]);
    expect(d.added).toHaveLength(0);
    expect(d.removed).toHaveLength(0);
    expect(d.placed).toHaveLength(32);
  });

  it("a capture moves the taker and removes the taken piece", () => {
    const cur = setUp("rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR");
    const taker = idAt(cur, "e4");
    const taken = idAt(cur, "d5");
    const d = step(cur, "rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR");
    expect(d.moved).toEqual([{ id: taker, square: "d5", code: "wp" }]);
    expect(d.removed.map((p) => p.id)).toEqual([taken]);
    expect(d.added).toHaveLength(0);
  });

  it("a recapture by the same kind of piece removes the right one", () => {
    const cur = setUp("4k3/8/8/3n4/8/2N5/8/4K3");
    const white = idAt(cur, "c3");
    const black = idAt(cur, "d5");
    const d = step(cur, "4k3/8/8/3N4/8/8/8/4K3");
    expect(d.moved).toEqual([{ id: white, square: "d5", code: "wn" }]);
    expect(d.removed.map((p) => p.id)).toEqual([black]);
  });

  it.each([
    ["White short", "r3k2r/8/8/8/8/8/8/R3K2R", "r3k2r/8/8/8/8/8/8/R4RK1", ["e1", "g1"], ["h1", "f1"]],
    ["White long", "r3k2r/8/8/8/8/8/8/R3K2R", "r3k2r/8/8/8/8/8/8/2KR3R", ["e1", "c1"], ["a1", "d1"]],
    ["Black short", "r3k2r/8/8/8/8/8/8/R3K2R", "r4rk1/8/8/8/8/8/8/R3K2R", ["e8", "g8"], ["h8", "f8"]],
    ["Black long", "r3k2r/8/8/8/8/8/8/R3K2R", "2kr3r/8/8/8/8/8/8/R3K2R", ["e8", "c8"], ["a8", "d8"]],
  ])("castling %s moves the king and the nearer rook, nothing else", (_n, before, after, king, rook) => {
    const cur = setUp(before);
    const kingId = idAt(cur, king[0]);
    const rookId = idAt(cur, rook[0]);
    const d = step(cur, after);
    expect(d.moved).toHaveLength(2);
    expect(idAt(d.placed, king[1])).toBe(kingId);
    expect(idAt(d.placed, rook[1])).toBe(rookId);
    expect(d.added).toHaveLength(0);
    expect(d.removed).toHaveLength(0);
  });

  it("en passant moves the pawn and removes the pawn beside it", () => {
    const cur = setUp("4k3/8/8/3pP3/8/8/8/4K3");
    const taker = idAt(cur, "e5");
    const taken = idAt(cur, "d5");
    const d = step(cur, "4k3/8/3P4/8/8/8/8/4K3");
    expect(d.moved).toEqual([{ id: taker, square: "d6", code: "wp" }]);
    expect(d.removed.map((p) => p.id)).toEqual([taken]);
  });

  it.each([
    ["White queens", "4k3/P7/8/8/8/8/8/4K3", "Q3k3/8/8/8/8/8/8/4K3", "a7", "a8", "wq"],
    ["White takes and makes a knight", "1r2k3/P7/8/8/8/8/8/4K3", "1N2k3/8/8/8/8/8/8/4K3", "a7", "b8", "wn"],
    ["Black queens", "4k3/8/8/8/8/8/7p/4K3", "4k3/8/8/8/8/8/8/4K2q", "h2", "h1", "bq"],
  ])("promotion: %s, the pawn's element becomes the new piece", (_n, before, after, from, to, code) => {
    const cur = setUp(before);
    const pawn = idAt(cur, from);
    const d = step(cur, after);
    expect(d.moved).toContainEqual({ id: pawn, square: to, code });
    expect(d.added).toHaveLength(0);
    expect(d.removed.every((p) => p.code[1] !== "p")).toBe(true);
  });

  it("a second queen on the last rank does not steal a pawn from elsewhere", () => {
    const cur = setUp("4k3/8/8/8/8/P7/8/4K3");
    const d = step(cur, "Q3k3/8/8/8/8/P7/8/4K3");
    expect(d.moved).toHaveLength(0);
    expect(d.added.map((p) => p.square)).toEqual(["a8"]);
  });

  it("with two candidates the nearer one moves", () => {
    const cur = setUp("4k3/8/8/8/8/8/8/RN2K1NR");
    const near = idAt(cur, "g1");
    const d = step(cur, "4k3/8/8/8/8/5N2/8/RN2K2R");
    expect(d.moved).toEqual([{ id: near, square: "f3", code: "wn" }]);
  });

  it("clearing the board removes everything", () => {
    const cur = setUp(START);
    const d = step(cur, EMPTY);
    expect(d.removed).toHaveLength(32);
    expect(d.placed).toHaveLength(0);
  });

  it("never reuses or loses an id", () => {
    const fens = [START, "8/8/8/8/8/8/8/8", "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR", "QQQQQQQQ/8/8/8/8/8/8/qqqqqqqq", START];
    let cur: Placed[] = [];
    let id = 0;
    for (const fen of fens) {
      const d = pairPieces(cur, readFen(fen), () => ++id);
      cur = d.placed;
      expect(new Set(cur.map((p) => p.id)).size).toBe(cur.length);
      expect(writeFen(cur)).toBe(fen);
      const kept = new Set([...d.moved, ...d.added].map((p) => p.id));
      for (const gone of d.removed) expect(kept.has(gone.id)).toBe(false);
    }
  });

  it("types stay honest", () => {
    const code: PieceCode = "wk";
    expect(code).toBe("wk");
  });
});
