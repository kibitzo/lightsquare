import { createElement, useEffect, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { Chessboard, type ChessboardOptions } from "react-chessboard";
import type { Create } from "./types";

/** The board inside a shell that says when React has put a change on the page. */
function Shell({ options, done }: { options: ChessboardOptions; done: () => void }): ReactElement {
  useEffect(done);
  return createElement(Chessboard, { options });
}

export const create: Create = (el, { fen, ms }) => {
  const root = createRoot(el);
  let options: ChessboardOptions = { position: fen, animationDurationInMs: ms, showAnimations: true, showNotation: true, allowDragging: false };
  // Each change is one React update, as when an app sets its state. It ends when React has put it on the page.
  const render = (change: ChessboardOptions): Promise<void> =>
    new Promise((done) => {
      options = { ...options, ...change };
      root.render(createElement(Shell, { options, done }));
    });
  return {
    ready: render({}),
    set: (next, animate) => render({ position: next, showAnimations: animate }),
    movable: () => void render({ allowDragging: true }),
    destroy: () => root.unmount(),
  };
};
