/** The page script of react.html: the component in StrictMode, with its props settable from a test. */
import { StrictMode, createElement, createRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Board } from "../../src/index";
import { Lightsquare, type LightsquareProps } from "../../src/react";

interface Harness {
  ref: { current: Board | null };
  moves: unknown[];
  renders: number;
  setProps(props: LightsquareProps): void;
  unmount(): void;
}

const R: Harness = { ref: createRef<Board>(), moves: [], renders: 0, setProps: () => {}, unmount: () => {} };
(window as unknown as { R: Harness }).R = R;

function App() {
  const [props, setProps] = useState<LightsquareProps>({ className: "mine", check: "e8", lastMove: ["e2", "e4"], position: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR" });
  R.setProps = setProps;
  R.renders++;
  return createElement(Lightsquare, { ...props, ref: R.ref, onMove: (m) => R.moves.push(m) });
}

const root = createRoot(document.getElementById("root")!);
R.unmount = () => root.unmount();
root.render(createElement(StrictMode, null, createElement(App)));
requestAnimationFrame(() => requestAnimationFrame(() => ((window as unknown as { ready: boolean }).ready = true)));
