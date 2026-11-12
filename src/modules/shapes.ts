/**
 * Arrows and circles, shown by the app or drawn by the user with the right
 * mouse button.
 *
 *   const drawing = board.use(shapes({ arrows: [{ from: "e2", to: "e4" }], draw: true }));
 *   drawing.set({ arrows: [] });
 *
 * Everything is one SVG layer in board units (8 by 8), so it scales with
 * the board without script. A shape is drawn once, when it appears, and is
 * not touched again: pieces can slide under it at no cost.
 */
import type { Module, ModuleHooks, Square } from "../index";

export interface Arrow {
  from: Square;
  to: Square;
  /** Picks the colour: the class `ls-arrow-<name>`. Leave out for the default. */
  name?: string;
  /** A short text on the arrow, such as "1". */
  label?: string;
}

export interface Circle {
  square: Square;
  /** Picks the colour: the class `ls-circle-<name>`. */
  name?: string;
}

export interface Drawing {
  arrows: Arrow[];
  circles: Circle[];
}

export interface ShapesOptions {
  arrows?: readonly Arrow[];
  circles?: readonly Circle[];
  /** Let the user draw: right-drag for an arrow, right-click for a circle, a left press clears. */
  draw?: boolean;
  /** The name a drawing gets from the keys held down. */
  nameFor?: (keys: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }) => string | undefined;
  /** The user's drawing changed. */
  onDraw?: (drawing: Drawing) => void;
}

export interface Shapes extends ModuleHooks {
  set(options: ShapesOptions): void;
  /** What the user has drawn. */
  drawing(): Drawing;
  /** Remove what the user has drawn. */
  clear(): void;
}

const NS = "http://www.w3.org/2000/svg";
/** In squares: where an arrow starts and ends, measured from the square centres, and its shape. */
const TAIL = 0.3;
const TIP = 0.08;
const WIDTH = 0.15;
const HEAD_LENGTH = 0.36;
const HEAD_WIDTH = 0.4;

const defaultName: NonNullable<ShapesOptions["nameFor"]> = (k) => (k.shiftKey && k.altKey ? "green" : k.shiftKey ? "red" : k.altKey ? "blue" : undefined);

function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const key in attrs) el.setAttribute(key, String(attrs[key]));
  return el;
}

const n = (value: number): number => Math.round(value * 1000) / 1000;

/** One outline for shaft and head, so a see-through arrow has no darker joint. */
function arrowOutline(from: [number, number], to: [number, number]): { d: string; mid: [number, number] } {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const at = (along: number, across: number): string => `${n(from[0] + 0.5 + ux * along - uy * across)} ${n(from[1] + 0.5 + uy * along + ux * across)}`;
  const tip = length - TIP;
  const neck = tip - HEAD_LENGTH;
  const d = `M${at(TAIL, WIDTH / 2)}L${at(neck, WIDTH / 2)}L${at(neck, HEAD_WIDTH / 2)}L${at(tip, 0)}L${at(neck, -HEAD_WIDTH / 2)}L${at(neck, -WIDTH / 2)}L${at(TAIL, -WIDTH / 2)}Z`;
  const middle = (TAIL + neck) / 2;
  return { d, mid: [n(from[0] + 0.5 + ux * middle), n(from[1] + 0.5 + uy * middle)] };
}

export function shapes(options: ShapesOptions = {}): Module<Shapes> {
  return (surface) => {
    const layer = svg("svg", { class: "ls-layer ls-shapes", viewBox: "0 0 8 8", "aria-hidden": "true" });
    surface.host.appendChild(layer);
    const shown = new Map<string, SVGElement>();
    const drawn: Drawing = { arrows: [], circles: [] };
    let o = options;
    let preview: Arrow | null = null;
    let orientation = surface.orientation();

    function arrowElement(a: Arrow): SVGElement {
      const group = svg("g", { class: `ls-arrow${a.name ? ` ls-arrow-${a.name}` : ""}` });
      const { d, mid } = arrowOutline(surface.cell(a.from), surface.cell(a.to));
      group.appendChild(svg("path", { d }));
      if (a.label) {
        group.appendChild(svg("circle", { cx: mid[0], cy: mid[1], r: 0.17 }));
        group.appendChild(svg("text", { x: mid[0], y: mid[1] })).textContent = a.label;
      }
      return group;
    }

    function circleElement(c: Circle): SVGElement {
      const [col, row] = surface.cell(c.square);
      return svg("circle", { class: `ls-circle${c.name ? ` ls-circle-${c.name}` : ""}`, cx: col + 0.5, cy: row + 0.5, r: 0.44 });
    }

    function render(): void {
      const want = new Map<string, () => SVGElement>();
      for (const c of [...(o.circles ?? []), ...drawn.circles]) want.set(`c ${c.square} ${c.name ?? ""}`, () => circleElement(c));
      for (const a of [...(o.arrows ?? []), ...drawn.arrows, ...(preview ? [preview] : [])]) {
        if (a.from !== a.to) want.set(`a ${a.from} ${a.to} ${a.name ?? ""} ${a.label ?? ""}`, () => arrowElement(a));
      }
      for (const [key, el] of shown) {
        if (want.has(key)) continue;
        el.remove();
        shown.delete(key);
      }
      for (const [key, make] of want) if (!shown.has(key)) shown.set(key, layer.appendChild(make()));
    }

    const pen = o.draw ? attachPen(surface, o.nameFor ?? defaultName, drawn, (next) => ((preview = next), render()), () => (render(), o.onDraw?.(api.drawing()))) : null;

    const api: Shapes = {
      set(next) {
        o = { ...o, ...next };
        render();
      },
      drawing: () => ({ arrows: [...drawn.arrows], circles: [...drawn.circles] }),
      clear() {
        if (!drawn.arrows.length && !drawn.circles.length) return;
        drawn.arrows = [];
        drawn.circles = [];
        render();
        o.onDraw?.(api.drawing());
      },
      update() {
        if (orientation === surface.orientation()) return;
        orientation = surface.orientation();
        for (const el of shown.values()) el.remove();
        shown.clear();
        render();
      },
      destroy() {
        pen?.();
        layer.remove();
      },
    };
    render();
    return api;
  };
}

/** Flip an entry of a list on or off. */
function toggle<T>(list: T[], item: T, same: (a: T, b: T) => boolean): T[] {
  return list.some((x) => same(x, item)) ? list.filter((x) => !same(x, item)) : [...list, item];
}

/** Right-button drawing. Returns the function that removes its listeners. */
function attachPen(
  surface: Parameters<Module<Shapes>>[0],
  nameFor: NonNullable<ShapesOptions["nameFor"]>,
  drawn: Drawing,
  setPreview: (arrow: Arrow | null) => void,
  changed: () => void,
): () => void {
  const host = surface.host;
  let stroke: { pointer: number; left: number; top: number; size: number; from: Square; over: Square; name?: string } | null = null;

  const squareAt = (e: PointerEvent, f: { left: number; top: number; size: number }): Square | null =>
    surface.square(Math.floor((e.clientX - f.left) / f.size), Math.floor((e.clientY - f.top) / f.size));

  function down(e: PointerEvent): void {
    if (e.button === 0 && (drawn.arrows.length || drawn.circles.length)) {
      drawn.arrows = [];
      drawn.circles = [];
      changed();
    }
    if (e.button !== 2 || stroke) return;
    const box = host.getBoundingClientRect();
    const frame = { left: box.left, top: box.top, size: box.width / 8 };
    const from = squareAt(e, frame);
    if (!from) return;
    stroke = { ...frame, pointer: e.pointerId, from, over: from, name: nameFor(e) };
    try {
      host.setPointerCapture(e.pointerId);
    } catch {
      /* a synthetic pointer cannot be captured */
    }
  }

  function move(e: PointerEvent): void {
    if (!stroke || e.pointerId !== stroke.pointer) return;
    const over = squareAt(e, stroke) ?? stroke.from;
    if (over === stroke.over) return;
    stroke.over = over;
    setPreview(over === stroke.from ? null : { from: stroke.from, to: over, name: stroke.name });
  }

  function up(e: PointerEvent): void {
    if (!stroke || e.pointerId !== stroke.pointer) return;
    const { from, over, name } = stroke;
    stroke = null;
    setPreview(null);
    if (from === over) drawn.circles = toggle(drawn.circles, { square: from, name }, (a, b) => a.square === b.square && a.name === b.name);
    else drawn.arrows = toggle(drawn.arrows, { from, to: over, name }, (a, b) => a.from === b.from && a.to === b.to && a.name === b.name);
    changed();
  }

  const noMenu = (e: Event): void => e.preventDefault();
  const cancel = (e: PointerEvent): void => {
    if (!stroke || e.pointerId !== stroke.pointer) return;
    stroke = null;
    setPreview(null);
  };

  host.addEventListener("pointerdown", down);
  host.addEventListener("pointermove", move);
  host.addEventListener("pointerup", up);
  host.addEventListener("pointercancel", cancel);
  host.addEventListener("contextmenu", noMenu);
  return () => {
    host.removeEventListener("pointerdown", down);
    host.removeEventListener("pointermove", move);
    host.removeEventListener("pointerup", up);
    host.removeEventListener("pointercancel", cancel);
    host.removeEventListener("contextmenu", noMenu);
  };
}
