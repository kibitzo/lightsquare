/**
 * Pairing checked against real chess: random legal games from chess.js.
 * After every move the paired position must equal the true position, and
 * the board must have touched only what a move can touch.
 */
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { pairPieces, readFen, writeFen, type Placed } from "../../src/position";

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const placement = (chess: Chess): string => chess.fen().split(" ")[0];

describe("pairing through random legal games", () => {
  it("60 games: every move is exact and minimal", () => {
    const seen = { castle: 0, enPassant: 0, promotion: 0, capture: 0, moves: 0 };
    for (let game = 0; game < 60; game++) {
      const random = rng(game + 1);
      const chess = new Chess();
      let id = 0;
      let cur: Placed[] = pairPieces([], readFen(placement(chess)), () => ++id).placed;
      for (let ply = 0; ply < 160 && !chess.isGameOver(); ply++) {
        const moves = chess.moves({ verbose: true });
        const move = moves[Math.floor(random() * moves.length)];
        const moverId = cur.find((p) => p.square === move.from)!.id;
        chess.move(move);
        const d = pairPieces(cur, readFen(placement(chess)), () => ++id);
        cur = d.placed;
        seen.moves++;

        expect(writeFen(cur)).toBe(placement(chess));
        expect(new Set(cur.map((p) => p.id)).size).toBe(cur.length);
        expect(cur.find((p) => p.square === move.to)!.id).toBe(moverId);
        expect(d.added).toHaveLength(0);

        const castle = move.isKingsideCastle() || move.isQueensideCastle();
        const takes = move.isCapture() || move.isEnPassant();
        expect(d.moved).toHaveLength(castle ? 2 : 1);
        expect(d.removed).toHaveLength(takes ? 1 : 0);
        if (castle) seen.castle++;
        if (move.isEnPassant()) seen.enPassant++;
        if (move.isPromotion()) seen.promotion++;
        if (takes) seen.capture++;
      }
    }
    expect(seen.moves).toBeGreaterThan(4000);
    expect(seen.capture).toBeGreaterThan(300);
    expect(seen.castle).toBeGreaterThan(0);
    expect(seen.enPassant).toBeGreaterThan(0);
    expect(seen.promotion).toBeGreaterThan(0);
  }, 60_000);

  it("jumping between unrelated positions always lands on the right one", () => {
    const random = rng(99);
    const fens: string[] = [];
    for (let game = 0; game < 8; game++) {
      const chess = new Chess();
      for (let ply = 0; ply < 120 && !chess.isGameOver(); ply++) {
        const moves = chess.moves();
        chess.move(moves[Math.floor(random() * moves.length)]);
        fens.push(placement(chess));
      }
    }
    let id = 0;
    let cur: Placed[] = [];
    for (let i = 0; i < 2000; i++) {
      const fen = fens[Math.floor(random() * fens.length)];
      const d = pairPieces(cur, readFen(fen), () => ++id);
      cur = d.placed;
      expect(writeFen(cur)).toBe(fen);
      expect(d.placed.length).toBe(readFen(fen).size);
    }
  });
});
