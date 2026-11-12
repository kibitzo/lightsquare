import { lightsquare } from "../../../src/index";
import type { Create } from "./types";

export const create: Create = (el, { fen, ms }) => {
  el.style.setProperty("--ls-move-ms", `${ms}ms`);
  const board = lightsquare(el, { position: fen });
  return {
    ready: Promise.resolve(),
    set: (next, animate) => board.set({ position: next }, { animate }),
    movable: () => board.set({ movable: "both" }),
    destroy: () => board.destroy(),
  };
};
