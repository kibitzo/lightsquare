/**
 * Lightsquare for React.
 *
 *   <Lightsquare position={fen} movable="white" targets={targets} onMove={play} ref={board} />
 *
 * The props are the board's options. A prop that is left out means its
 * default, so removing `check` or `lastMove` clears the mark. The ref gives
 * the board itself (`move`, `playPremove`, `use`, ...).
 */
import { createElement, forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, type CSSProperties } from "react";
import { lightsquare, type Board, type Options } from "./index.js";

export interface LightsquareProps extends Options {
  className?: string;
  style?: CSSProperties;
  /** Slide pieces when the position changes. Default true. */
  animate?: boolean;
}

const useBrowserLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

/** Left-out props mean the default, except the two the board owns between renders. */
function complete(o: Options): Options {
  return {
    ...(o.position !== undefined && { position: o.position }),
    ...(o.premove !== undefined && { premove: o.premove }),
    orientation: o.orientation ?? "white",
    movable: o.movable ?? "none",
    targets: o.targets ?? null,
    premovable: o.premovable ?? "none",
    premoveTargets: o.premoveTargets ?? null,
    lastMove: o.lastMove ?? null,
    check: o.check ?? null,
    marks: o.marks ?? null,
    coordinates: o.coordinates ?? true,
    onMove: o.onMove ?? null,
    onSelect: o.onSelect ?? null,
    onPremove: o.onPremove ?? null,
    onTap: o.onTap ?? null,
  };
}

export const Lightsquare = forwardRef<Board, LightsquareProps>(function Lightsquare({ className, style, animate, ...options }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const board = useRef<Board | null>(null);
  const latest = useRef(options);
  latest.current = options;

  useBrowserLayoutEffect(() => {
    const made = lightsquare(host.current!, complete(latest.current));
    board.current = made;
    return () => {
      made.destroy();
      board.current = null;
    };
  }, []);

  useBrowserLayoutEffect(() => {
    board.current?.set(complete(options), { animate });
  });

  useImperativeHandle(ref, () => board.current!, []);

  // The board owns the inner element's classes; React owns the outer one.
  return createElement("div", { className, style }, createElement("div", { ref: host }));
});
