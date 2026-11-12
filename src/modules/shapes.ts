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
  /** A short text in the arrow's head, such as "1". The head grows a little to hold it. */
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

/** The shape of every arrow, in squares. */
export interface ArrowLook {
  /** How thick the shaft is. Default 0.2. */
  width?: number;
  /** How long and how wide the head is. Defaults 0.46 and 0.54. */
  headLength?: number;
  headWidth?: number;
}

export interface ShapesOptions {
  arrows?: readonly Arrow[];
  circles?: readonly Circle[];
  /** Thicker or thinner arrows, larger or smaller heads. */
  look?: ArrowLook;
  /**
   * Let the user draw: right-drag for an arrow, right-click for a circle, a
   * left press clears. The arrow is slim while it is aimed and fills out
   * when it is let go.
   */
  draw?: boolean;
  /** The name a drawing gets from the keys held down. Default: green, Alt blue, Shift yellow. */
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
/**
 * The shape of an arrow, in squares. It runs from the centre of its first
 * square to the centre of its last one, where its point stops. Its colour
 * grows from faint at the tail, so the piece there stays readable, to
 * strong at the head.
 */
const LOOK: Required<ArrowLook> = { width: 0.2, headLength: 0.46, headWidth: 0.54 };
/** An arrow still being drawn is slimmer; it fills out when it is let go. */
const PREVIEW = 0.7;
/** Deep, calm tones: a wide arrow in a bright colour shouts. */
const TONES: Record<string, string> = { red: "#b91c1c", green: "#047857", blue: "#1d4ed8", yellow: "#ca8a04" };
const PLAIN = "var(--ls-shape,#ea580c)";
let lastGradient = 0;

/** A shape's colour: the page's variable for its name, else the built-in tone, else the plain colour. */
const colour = (name?: string): string => (name ? `var(--ls-shape-${name},${TONES[name] ?? PLAIN})` : PLAIN);
/** A circle may have a colour of its own (--ls-circle, --ls-circle-<name>); else it follows the arrows. */
const circleColour = (name?: string): string => `var(--ls-circle${name ? `-${name}` : ""},${colour(name)})`;

/** Plain is green, Alt blue, Shift yellow: orange and red are left for the app's own arrows. */
const defaultName: NonNullable<ShapesOptions["nameFor"]> = (k) => (k.shiftKey ? "yellow" : k.altKey ? "blue" : "green");

function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const key in attrs) el.setAttribute(key, String(attrs[key]));
  return el;
}

const n = (value: number): number => Math.round(value * 1000) / 1000;

interface Outline {
  /** Shaft and head as one outline, with a round end at the tail. */
  d: string;
  tail: [number, number];
  tip: [number, number];
  /** Where a label sits: the centre of the largest circle that fits in the head. */
  label: [number, number];
  /** The radius of that circle. */
  room: number;
}

/** A head that carries a label is a little larger, so the text has room. */
const LABELLED = 1.2;

function arrowOutline(from: [number, number], to: [number, number], look: Required<ArrowLook>, scale: number, labelled = false): Outline {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const point = (along: number, across: number): [number, number] => [n(from[0] + 0.5 + ux * along - uy * across), n(from[1] + 0.5 + uy * along + ux * across)];
  const at = (along: number, across: number): string => point(along, across).join(" ");
  const half = (look.width * scale) / 2;
  const grown = scale * (labelled ? LABELLED : 1);
  const wing = (look.headWidth * grown) / 2;
  const headLength = Math.min(length, look.headLength * grown);
  const neck = length - headLength;
  // The largest circle that fits in the head: where a label sits, and how much room it has.
  const room = (2 * wing * headLength) / (2 * wing + 2 * Math.hypot(wing, headLength));
  return {
    d: `M${at(0, half)}L${at(neck, half)}L${at(neck, wing)}L${at(length, 0)}L${at(neck, -wing)}L${at(neck, -half)}L${at(0, -half)}A${n(half)} ${n(half)} 0 0 0 ${at(0, half)}Z`,
    tail: point(0, 0),
    tip: point(length, 0),
    label: point(neck + room, 0),
    room,
  };
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

    function arrowElement(a: Arrow, preview = false): SVGElement {
      const { d, tail, tip, label, room } = arrowOutline(surface.cell(a.from), surface.cell(a.to), { ...LOOK, ...o.look }, preview ? PREVIEW : 1, !!a.label);
      const group = svg("g", { class: `ls-arrow${a.name ? ` ls-arrow-${a.name}` : ""}${preview ? " ls-arrow-preview" : ""}`, style: `--_shape:${colour(a.name)};transform-origin:${tail[0]}px ${tail[1]}px` });
      const id = `ls-fade-${++lastGradient}`;
      const fade = group.appendChild(svg("linearGradient", { id, gradientUnits: "userSpaceOnUse", x1: tail[0], y1: tail[1], x2: tip[0], y2: tip[1] }));
      fade.appendChild(svg("stop", { offset: 0 }));
      fade.appendChild(svg("stop", { offset: 1 }));
      group.appendChild(svg("path", { d, fill: `url(#${id})` }));
      if (a.label) {
        const size = n((room * 1.55) / Math.max(1, a.label.length * 0.62));
        group.appendChild(svg("text", { x: label[0], y: label[1], dy: "0.35em", style: `font-size:${size}px` })).textContent = a.label;
      }
      return group;
    }

    function circleElement(c: Circle): SVGElement {
      const [col, row] = surface.cell(c.square);
      return svg("circle", { class: `ls-circle${c.name ? ` ls-circle-${c.name}` : ""}`, cx: col + 0.5, cy: row + 0.5, r: 0.43, style: `--_shape:${circleColour(c.name)};transform-origin:${col + 0.5}px ${row + 0.5}px` });
    }

    function render(): void {
      const want = new Map<string, () => SVGElement>();
      for (const c of [...(o.circles ?? []), ...drawn.circles]) want.set(`c ${c.square} ${c.name ?? ""}`, () => circleElement(c));
      for (const a of [...(o.arrows ?? []), ...drawn.arrows]) {
        if (a.from !== a.to) want.set(`a ${a.from} ${a.to} ${a.name ?? ""} ${a.label ?? ""}`, () => arrowElement(a));
      }
      const aim = preview;
      if (aim) want.set(`p ${aim.from} ${aim.to}`, () => arrowElement(aim, true));
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
        const reshaped = next.look !== undefined && next.look !== o.look;
        o = { ...o, ...next };
        if (reshaped) {
          for (const el of shown.values()) el.remove();
          shown.clear();
        }
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
