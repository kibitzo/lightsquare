import { describe, expect, it } from "vitest";
import { premoveTargets } from "../../src/modules/premove";
import { START } from "../../src/position";

const sorted = (list: readonly string[] | undefined): string[] => [...(list ?? [])].sort();
const from = (fen: string, color: "white" | "black", square: string, own = true): string[] => sorted(premoveTargets(fen, color, { own }).get(square));

describe("premoveTargets", () => {
  it("covers only the pieces of the given side", () => {
    const white = premoveTargets(START, "white");
    const black = premoveTargets(START, "black");
    expect(white.size).toBe(16);
    expect(black.size).toBe(16);
    expect([...white.keys()].every((s) => s[1] === "1" || s[1] === "2")).toBe(true);
    expect([...black.keys()].every((s) => s[1] === "7" || s[1] === "8")).toBe(true);
  });

  it("a knight jumps to all its squares on the board, own pieces included", () => {
    expect(from(START, "white", "g1")).toEqual(["e2", "f3", "h3"]);
    expect(from(START, "white", "b1")).toEqual(["a3", "c3", "d2"]);
    expect(from("8/8/8/4N3/8/8/8/8", "white", "e5")).toEqual(["c4", "c6", "d3", "d7", "f3", "f7", "g4", "g6"]);
    expect(from("N7/8/8/8/8/8/8/8", "white", "a8")).toEqual(["b6", "c7"]);
  });

  it("a bishop sees along its diagonals through every piece", () => {
    expect(from(START, "white", "c1")).toEqual(["a3", "b2", "d2", "e3", "f4", "g5", "h6"]);
    expect(from("8/8/8/8/3b4/8/8/8", "black", "d4")).toHaveLength(13);
  });

  it("a rook sees along its file and rank through every piece", () => {
    expect(from(START, "white", "a1")).toEqual(["a2", "a3", "a4", "a5", "a6", "a7", "a8", "b1", "c1", "d1", "e1", "f1", "g1", "h1"]);
    expect(from("8/8/8/8/3r4/8/8/8", "black", "d4")).toHaveLength(14);
  });

  it("a queen is a rook and a bishop", () => {
    expect(from("8/8/8/8/3Q4/8/8/8", "white", "d4")).toHaveLength(27);
    expect(from(START, "black", "d8")).toHaveLength(21);
  });

  it("a king steps one square, and castles from home when its rook stands in the corner", () => {
    expect(from("8/8/8/8/3K4/8/8/8", "white", "d4")).toEqual(["c3", "c4", "c5", "d3", "d5", "e3", "e4", "e5"]);
    expect(from(START, "white", "e1")).toEqual(["c1", "d1", "d2", "e2", "f1", "f2", "g1"]);
    expect(from("4k2r/8/8/8/8/8/8/4K3", "black", "e8")).toEqual(["d7", "d8", "e7", "f7", "f8", "g8"]);
    expect(from("r3k3/8/8/8/8/8/8/4K3", "black", "e8")).toEqual(["c8", "d7", "d8", "e7", "f7", "f8"]);
    expect(from("4k3/8/8/8/8/8/8/4K3", "white", "e1")).toEqual(["d1", "d2", "e2", "f1", "f2"]);
    expect(from("8/8/8/8/8/8/8/R2K3R", "white", "d1")).toEqual(["c1", "c2", "d2", "e1", "e2"]);
  });

  it("a white pawn goes one up, two from its first rank, and to both diagonals", () => {
    expect(from(START, "white", "e2")).toEqual(["d3", "e3", "e4", "f3"]);
    expect(from(START, "white", "a2")).toEqual(["a3", "a4", "b3"]);
    expect(from(START, "white", "h2")).toEqual(["g3", "h3", "h4"]);
    expect(from("8/8/8/4P3/8/8/8/8", "white", "e5")).toEqual(["d6", "e6", "f6"]);
    expect(from("8/4P3/8/8/8/8/8/8", "white", "e7")).toEqual(["d8", "e8", "f8"]);
  });

  it("a black pawn goes the other way", () => {
    expect(from(START, "black", "e7")).toEqual(["d6", "e5", "e6", "f6"]);
    expect(from("8/8/8/8/8/8/3p4/8", "black", "d2")).toEqual(["c1", "d1", "e1"]);
    expect(from("8/8/8/8/3p4/8/8/8", "black", "d4")).toEqual(["c3", "d3", "e3"]);
  });

  it("can leave out the squares that hold the mover's own pieces", () => {
    expect(from(START, "white", "g1", false)).toEqual(["f3", "h3"]);
    expect(from(START, "white", "a1", false)).toEqual(["a3", "a4", "a5", "a6", "a7", "a8"]);
    expect(premoveTargets(START, "white", { own: false }).has("e1")).toBe(false);
  });

  it("never names a square off the board or the piece's own square", () => {
    for (const fen of [START, "r3k2r/pppq1ppp/2n2n2/3pp3/3PP3/2N2N2/PPPQ1PPP/R3K2R", "8/P6p/8/8/8/8/p6P/K6k"]) {
      for (const color of ["white", "black"] as const) {
        for (const [square, targets] of premoveTargets(fen, color)) {
          expect(new Set(targets).size).toBe(targets.length);
          for (const t of targets) {
            expect(t).toMatch(/^[a-h][1-8]$/);
            expect(t).not.toBe(square);
          }
        }
      }
    }
  });

  it("takes a full FEN and reads only the placement", () => {
    expect(from("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1", "white", "e4")).toEqual(["d5", "e5", "f5"]);
  });
});
