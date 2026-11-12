// @ts-expect-error cm-chessboard ships no type declarations
import { Chessboard } from "cm-chessboard/src/Chessboard.js";
import type { Create } from "./types";

interface CmBoard {
  setPosition(fen: string, animated: boolean): Promise<unknown>;
  enableMoveInput(handler: () => boolean): void;
  destroy(): void;
}

export const create: Create = (el, { fen, ms }) => {
  const board: CmBoard = new Chessboard(el, { position: fen, assetsUrl: "/compare/node_modules/cm-chessboard/assets/", style: { animationDuration: ms, pieces: { file: "pieces/standard.svg" } } });
  return {
    // The board draws itself in a later task: its first position is shown when a no-op change resolves.
    ready: board.setPosition(fen, false).then(() => undefined),
    set: (next, animate) => board.setPosition(next, animate),
    movable: () => board.enableMoveInput(() => true),
    destroy: () => board.destroy(),
  };
};
