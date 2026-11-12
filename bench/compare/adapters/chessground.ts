import { Chessground } from "@lichess-org/chessground";
import type { Create } from "./types";

export const create: Create = (el, { fen, ms }) => {
  const ground = Chessground(el, { fen, coordinates: true, animation: { enabled: true, duration: ms }, highlight: { lastMove: false, check: false }, movable: { free: false }, draggable: { enabled: true } });
  return {
    ready: Promise.resolve(),
    set(next, animate) {
      if (!animate) ground.set({ animation: { enabled: false } });
      ground.set({ fen: next });
      if (!animate) ground.set({ animation: { enabled: true, duration: ms } });
    },
    movable: () => ground.set({ movable: { free: true, color: "both" } }),
    destroy: () => ground.destroy(),
  };
};
