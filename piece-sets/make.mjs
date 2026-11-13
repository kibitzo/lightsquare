// Kibitzo, a piece set of our own (a draft), drawn at its final size. Run: node piece-sets/make.mjs
// It began as full Staunton figures (base, waist, collar, head; "classic" in this file is that first drawing) and
// was changed piece by piece: each change is dated and reasoned where it is made, below.
// The finish: a flat fill, one black outline round each shape, one flat tone of shade in a band along the right
// edge of every part and a thinner band of light along its left edge.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("./", import.meta.url));

const f = (n) => +n.toFixed(3);

/** A part: its path, half its width (the shade and the light are sized by it) and whether it stands on the square. */
function lathe(start, segs, cx = 25) {
  const pts = [start];
  let hw = Math.abs(start[0]);
  let d = `M${f(cx + start[0])},${f(start[1])}`;
  for (const s of segs) {
    const line = typeof s[0] === "number";
    d += line ? `L${f(cx + s[0])},${f(s[1])}` : `C${s.map(([x, y]) => `${f(cx + x)},${f(y)}`).join(" ")}`;
    const end = line ? s : s[2];
    hw = Math.max(hw, Math.abs(end[0]));
    pts.push(end);
  }
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    const from = pts[i];
    d += typeof s[0] === "number" ? `L${f(cx - from[0])},${f(from[1])}` : `C${f(cx - s[1][0])},${f(s[1][1])} ${f(cx - s[0][0])},${f(s[0][1])} ${f(cx - from[0])},${f(from[1])}`;
  }
  return { d: d + "Z", hw, cx, foot: pts.some(([, y]) => y >= 44.9) };
}
/** The side of a foot from its shoulder down, then the round bottom corner and the flat underside. */
/**
 * The foot of every piece, as a style. `side` are the stations of its side when a body runs into it, `loose` when
 * it is a part of its own (under a crown, under the knight), `corner` its bottom corner and flat underside.
 */
const FEET = {
  // Round: a mound. The side bulges out and turns under in a wide corner.
  round: { side: (bw) => [[bw - 1.7, 37.8], [bw - 0.2, 40.4], [bw, 43]], loose: (bw) => [[bw - 1.8, 38.2], [bw - 0.3, 40.4], [bw, 43]], corner: (bw) => [[[bw, 44.1], [bw - 0.9, 45], [bw - 2, 45]], [0, 45]] },
  // Firmer: the shoulder turns down sooner, the side stands upright longer, the bottom corner is tighter.
  firm: { side: (bw) => [[bw - 1.3, 37.9], [bw - 0.3, 39.6], [bw, 43.6]], loose: (bw) => [[bw - 1.4, 38.2], [bw - 0.3, 39.8], [bw, 43.6]], corner: (bw) => [[[bw, 44.5], [bw - 0.5, 45], [bw - 1.1, 45]], [0, 45]] },
  // Planted: the side leans out a little towards the square and meets it in a tight corner, so the piece stands on its full width.
  planted: { side: (bw) => [[bw - 1.6, 37.9], [bw - 0.7, 39.4], [bw - 0.1, 43.4]], loose: (bw) => [[bw - 1.7, 38.1], [bw - 0.7, 39.6], [bw - 0.1, 43.4]], corner: (bw) => [[[bw + 0.05, 44.4], [bw - 0.2, 45], [bw - 0.8, 45]], [0, 45]] },
};
let FOOT = FEET.round;
const mound = (shoulder, bw) => [...smooth([[shoulder, 37.2], ...FOOT.loose(bw)]), ...FOOT.corner(bw)];
const base = (bw, cx = 25) => lathe([0, 37.2], [[bw - 4, 37.2], ...mound(bw - 4, bw)], cx);
/** A smooth run through stations (the first is where the outline already is): no kink at any of them. */
function smooth(pts) {
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? pts[i + 1];
    segs.push([[p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6], p2]);
  }
  return segs;
}
const circle = (x, y, r) => ({ d: `M${f(x - r)},${y}a${r},${r} 0 1,0 ${f(2 * r)},0a${r},${r} 0 1,0 ${f(-2 * r)},0Z`, hw: r, cx: x });
const balls = (list) => list.map(([x, y, r]) => circle(x, y, r));
const raw = (d, hw, cx = 25) => ({ d, hw, cx });
/**
 * What stands on the bishop's mitre (from version 10): a cup, thinner at its base and wider higher up, as a
 * bishop's hat is, with curved sides and a domed top. A narrow band of shade and a short shadow: with more, half of
 * it was dark and its shadow ran down the tip of the mitre like a stem.
 */
const cup = () => ({ ...lathe([0, 5.4], [[[1.6, 5.2], [3.2, 5.4], [3.2, 6.6]], ...smooth([[3.2, 6.6], [2.7, 8.4], [2, 9.6], [1.8, 10.8]]), [0, 10.8]]), band: 0.64, glow: 0.86, throw: [0.3, 1.1] });
/** A box with eased corners, from `top` to `bottom`, `w` to each side of the axis. */
const box = (top, bottom, w, r) => lathe([0, top], [[w - r, top], [[w - 0.45 * r, top], [w, top + 0.45 * r], [w, top + r]], [w, bottom - r], [[w, bottom - 0.45 * r], [w - 0.45 * r, bottom], [w - r, bottom]], [0, bottom]]);
/** A shape with no axis, from runs of stations: smooth inside a run, a corner where two runs meet. */
const outline = (runs, hw) => ({ d: `M${runs[0][0].map(f).join(",")}` + runs.map((run) => smooth(run).map((seg) => `C${seg.map((pt) => pt.map(f).join(",")).join(" ")}`).join("")).join("") + "Z", hw, free: true });

/**
 * The knight: a proud horse facing left. An arched crest from the ears over to the back, one pointed ear, a long
 * face down to a round muzzle, a strong jaw with the cheek behind it, the throat tucked in, a full chest.
 */
const STYLE = { w: "#f0f0f0", b: "#5f5955" };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** A colour mixed with black or white: the tones are plain colours, so nothing is see-through and nothing needs a mask. */
function mix(hex, other, amount) {
  const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(other.slice(i, i + 2), 16));
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, "0")).join("");
}

/**
 * The light comes from the upper left, and the shade is one flat tone, the way Staunty does it:
 *   a band of shade along the right edge of every part, as wide as three tenths of the part there, so it is broad
 *   where the part is broad, thin where it is thin, and runs out to nothing at the top and bottom of a ball;
 *   a much thinner band of light along the left edge;
 *   under a part that lies over another one (a collar, a ball), a short shadow in the same tone.
 * Every tone is the part itself, moved or narrowed and cut to the part's own outline: shapes and clips only, so
 * each edge is as sharp as the outline. Each group of parts is one shape with one outline.
 */
function piece(set, side, code, { parts, groups = [parts], lines = [], dots = [], cuts = [], marks = [], soft = [] }) {
  const fill = STYLE[side];
  const shade = mix(fill, "#000000", side === "w" ? 0.15 : 0.22);
  const light = side === "w" ? "#ffffff" : mix(fill, "#ffffff", 0.22);
  const id = (n) => `${set}${side}${code}${n}`;
  const order = groups.flat();
  const axes = [...new Set(order.filter((p) => !p.free).map((p) => p.cx))];
  const defs = [
    ...order.map((p, n) => `<path id="${id(n)}" d="${p.d}"/><clipPath id="${id(n)}c"><use href="#${id(n)}"/></clipPath>${p.free ? `<clipPath id="${id(n)}r"><use href="#${id(n)}" transform="translate(0.9 0)"/></clipPath>` : ""}`),
    ...axes.map((cx, n) => `<clipPath id="${id("R")}${n}"><rect x="${cx}" y="-10" width="70" height="70"/></clipPath><clipPath id="${id("L")}${n}"><rect x="${cx - 70}" y="-10" width="70" height="70"/></clipPath>`),
  ];
  const body = [];
  for (const group of groups) {
    body.push(group.map((p) => `<use href="#${id(order.indexOf(p))}" fill="#000" stroke="#000" stroke-width="2.4" stroke-linejoin="miter" stroke-miterlimit="2.5"/>`).join(""));
    for (const p of group) {
      const n = order.indexOf(p);
      const me = (attrs) => `<use href="#${id(n)}" ${attrs}/>`;
      const narrowed = (k) => `transform="translate(${f(p.cx)} 0) scale(${k} 1) translate(${f(-p.cx)} 0)"`;
      const axis = axes.indexOf(p.cx);
      const tones = p.free
        ? [me(`fill="${light}"`), `<g clip-path="url(#${id(n)}r)">`, me(`fill="${shade}"`), me(`transform="translate(${f(-0.28 * p.hw)} 0)" fill="${fill}"`), `</g>`]
        : [me(`fill="${fill}"`), `<g clip-path="url(#${id("R")}${axis})">`, me(`fill="${shade}"`), me(`${narrowed(p.band ?? 0.7)} fill="${fill}"`), `</g>`, `<g clip-path="url(#${id("L")}${axis})">`, me(`fill="${light}"`), me(`${narrowed(p.glow ?? 0.9)} fill="${fill}"`), `</g>`];
      // A part may say how far its shadow falls (`throw`), how much of its right side is in shade (`band`: 0.7 leaves three tenths) and of its left in light (`glow`).
      const shadows = order.slice(n + 1).map((q) => `<use href="#${id(order.indexOf(q))}" transform="translate(${(q.throw ?? [0.4, 1.3]).join(" ")})" fill="${shade}"/>`);
      body.push(`<g clip-path="url(#${id(n)}c)">`, ...tones, ...shadows, `</g>`);
    }
  }
  return [
    `<defs>${defs.join("")}</defs><g transform="translate(25 45) scale(0.95) translate(-25 -46.2)">`,
    ...body,
    // Modelling inside a shape (the edge of a cheek): a stroke in the shade tone, never a black line.
    ...soft.map(([d, width]) => `<path d="${d}" fill="none" stroke="${shade}" stroke-width="${width}" stroke-linecap="round"/>`),
    ...lines.map((l) => (typeof l === "string" ? [l, 1.1] : l)).map(([d, width]) => `<path d="${d}" fill="none" stroke="#000" stroke-width="${width}" stroke-linecap="round"/>`),
    ...cuts.map((d) => `<path d="${d}" fill="#000"/>`),
    // The eye and the nostril: soft and greyish, a darker tone of the piece's own colour, never plain black.
    ...marks.map((m) => (typeof m === "string" ? [m, 0] : m)).map(([d, dx]) => `<path d="${d}"${dx ? ` transform="translate(${f(dx)} 0)"` : ""} fill="${mix(fill, "#000000", side === "w" ? 0.36 : 0.42)}"/>`),
    ...dots.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${side === "w" ? "#000" : "#e8e4de"}"/>`),
    `</g>`,
  ].join("");
}


/** All the shapes, drawn with the foot that is set at the moment. */
function build() {
const HORSE = outline(
  [
    [[36.8, 38], [37.9, 33], [38.4, 26], [37.4, 19], [34.4, 13.6], [30, 10.4], [25.6, 9.6]],
    [[25.6, 9.6], [23.4, 6.8]],
    [[23.4, 6.8], [20.6, 10.2]],
    [[20.6, 10.2], [17, 13.4], [13.4, 17.6], [10, 21.6], [7.4, 24.6], [6.2, 27], [7.2, 29.6], [9.8, 30.6], [12.6, 29.8], [15.6, 28], [18.6, 26.6], [21.4, 26.8], [22.8, 28.6]],
    [[22.8, 28.6], [22, 31.6], [19.2, 34.4], [16.6, 36.6], [15.6, 38]],
    [[15.6, 38], [36.8, 38]],
  ],
  16,
);
const horse = { lines: [["M29,13.2 C31.2,13.9 33,15.6 33.9,18 C34.4,19.4 34.7,20.8 34.8,22.4", 0.8]], dots: [[18.4, 15.8, 1.1], [8.8, 26.2, 0.6]] };
const crossOf = (d) => raw(d, 4.2);

/** The side of a crown from its rim down: one even taper to a waist just above the base. */
const taper = (from, waist) => [...smooth([from, [from[0] - 1.1, from[1] + 3.8], [from[0] - 3.8, from[1] + 8.4], [waist + 1.6, 31.6], [waist + 0.1, 35], [waist, 37.4]]), [0, 37.4]];

/** The rims of the two crowns, from the middle outwards: the queen's five slim prongs, the king's two broad lobes. */
const Q_RIM = [[[1, 13.8], [1.3, 18.6], [2.9, 18.6]], [5.5, 18.9], [[7.1, 18.9], [7.4, 14.8], [8.4, 14.8]], [[9.4, 14.8], [9.7, 19.3], [11.3, 19.3]], [13.9, 19.7], [[15.5, 19.7], [15.6, 16.4], [16.7, 16.4]], [[17.5, 16.4], [17.9, 17.6], [17.7, 19]]];
const K_RIM = [[[3, 17.6], [4.6, 14.6], [8.6, 14.6]], [[12.4, 14.6], [15.2, 16.4], [15, 19.6]]];

/** The queen of both sets: a crown whose rim is five slim prongs with round tips and wide dips between them (no balls on it), a dome behind it with one ball on top, on a base. */
const QUEEN = [
  lathe([0, 10.6], [[[5.4, 10.6], [9.6, 15], [9.6, 20.5]], [0, 20.5]]),
  circle(25, 7.4, 2.5),
  lathe([0, 13.8], [...Q_RIM, ...taper([17.7, 19], 9.8)]),
  base(14.4),
];
const [qDome, qBall, qCrown, qBase] = QUEEN;
/** Only the wavy rim needs a line of its own (without it the waves melt into the dome). In Classic her base is part of her, as for every other piece; in Emblem it is a plinth with its own outline, as for every other piece. */
const queenOf = (set) => ({ parts: QUEEN, groups: set === "classic" ? [[qDome, qBall], [qCrown, qBase]] : [[qDome, qBall], [qCrown], [qBase]] });

/** The king of both sets, built like the queen: a crown that flares from the base, its rim two broad lobes, a dome behind it with a broad cross on top. */
const KING = [
  raw("M23.3,3.4h3.4v2.6h3.5v3.4h-3.5v4.4h-3.4v-4.4h-3.5v-3.4h3.5z", 5.2),
  lathe([0, 11.8], [[[4.6, 11.8], [8, 15], [8, 19.5]], [0, 19.5]]),
  lathe([0, 17.6], [...K_RIM, ...taper([15, 19.6], 9.9)]),
  base(15.2),
];
const [kCross, kDome, kCrown, kBase] = KING;
const kingOf = (set) => ({ parts: KING, groups: set === "classic" ? [[kCross, kDome], [kCrown, kBase]] : [[kCross, kDome], [kCrown], [kBase]] });

// ── classic ──
/** A body: a neck that widens in one even curve into a round foot. No step, no kink. */
const cBody = (top, neck, bw) => {
  const h = 37.8 - top;
  const w = bw - neck;
  return lathe([0, top], [[neck, top], ...smooth([[neck, top], [neck + 0.3, top + 0.28 * h], [neck + 0.2 * w, top + 0.6 * h], [neck + 0.52 * w, top + 0.84 * h], ...FOOT.side(bw)]), ...FOOT.corner(bw)]);
};
const cCollar = (y, w, h = 2.8) => lathe([0, y], [[w - h / 2, y], [[w + 0.3, y], [w + 0.3, y + h], [w - h / 2, y + h]], [0, y + h]]);
const classic = {
  p: { parts: [cBody(25, 3.4, 12.9), circle(25, 18, 6.2), cCollar(23.2, 7)] },
  r: {
    parts: [lathe([0, 9.4], [[2.4, 9.4], [2.4, 12.8], [5.5, 12.8], [5.5, 9.4], [9.8, 9.4], [9.8, 16.6], [7.8, 18.4], ...smooth([[7.8, 18.4], [7.9, 24], [8.5, 30], [9.8, 34.6], ...FOOT.side(13.4)]), ...FOOT.corner(13.4)])],
    lines: ["M18.4,15.8H31.6"],
  },
  b: { parts: [cBody(26.6, 4.6, 13.4), lathe([0, 10.2], [...smooth([[0, 10.2], [3.6, 12.4], [7.6, 16], [8.8, 20], [7.6, 23.6], [4.6, 25.6]]), [0, 25.8]]), circle(25, 8.1, 2.4), cCollar(24.8, 9)], lines: ["M29.2,14.8 L25,20.2"] },
  q: queenOf("classic"),
  k: kingOf("classic"),
  n: { parts: [HORSE, base(13.4, 26)], ...horse },
};


// ── Classic, version 2: the bishop and the knight of version 1 are replaced (founder 2026-11-13) ──

/**
 * The bishop, in the way of Staunty's (the idea, not its shape): no neck and no collar. One full mitre, egg shaped
 * and widest low, runs into the foot, with a big ball on top (bigger from version 6: the founder's pick) and a cut: a wedge that
 * opens on the outline.
 * `k` is how wide the mitre is (1: as first drawn). The foot is the foot of every other piece, whatever k is.
 */
const bishopOf = (k) => ({
  parts: [
    lathe([0, 9.6], [...smooth([[0, 9.6], [3.2 * k, 12], [6.6 * k, 16], [9.6 * k, 21], [11.2 * k, 26], [11 * k, 30.5], [9.9 * k, 34.2], [4.6 + 0.52 * (13.4 - 4.6), 26.6 + 0.84 * (37.8 - 26.6)], ...FOOT.side(13.4)]), ...FOOT.corner(13.4)]),
    cup(),
  ],
  cuts: [`M${f(25.7 + 5.9 * k)},15.2 L${f(25.7 + 7.2 * k)},16.9 L${f(25 + 2.2 * k)},20.4 Z`],
  // A simple line runs on from the point of the cut into the mitre, along the same slant (from version 10).
  lines: ["M29,18.85 L24.6,22.6"],
});

/**
 * The knight, mighty: a war horse, not a pony. A compact head carried high on a thick, arched neck; one pointed
 * ear; a brow over a calm almond eye, grey and not small; a short, strong muzzle; a jaw that ends in a corner
 * above a tucked throat; a chest pushed forward.
 */
const HORSE3 = outline(
  [
    [[37.4, 38], [38.8, 30.5], [38.4, 22], [36, 15.6], [32.4, 11.6], [27.2, 10]],
    [[27.2, 10], [25.2, 6.9]],
    [[25.2, 6.9], [23, 10.6]],
    [[23, 10.6], [20.4, 11.6], [18, 13.2]],
    [[18, 13.2], [13.4, 17.4], [9, 21.6]],
    [[9, 21.6], [7, 23.8], [6.6, 26.4]],
    [[6.6, 26.4], [8.4, 28.2]],
    [[8.4, 28.2], [12.6, 27.8], [17, 26.6], [20.8, 26.6]],
    [[20.8, 26.6], [23.4, 25]],
    [[23.4, 25], [22.6, 28.6], [20, 31.8], [16.6, 34.8], [14.2, 38]],
    [[14.2, 38], [37.4, 38]],
  ],
  16.4,
);
const knight = {
  parts: [HORSE3, base(13.4, 26)],
  lines: [["M30.6,13.2 C32.6,14.2 34.4,16.4 35.2,19.4", 0.8]],
  // The eye: an almond, only slightly tilted, and grey. A small black dot read as dull, a slanted black wedge as aggressive.
  marks: ["M18.04,16.5 A1.9,1.35 -12 1,1 21.76,15.7 A1.9,1.35 -12 1,1 18.04,16.5 Z", "M8,23.7 L10.3,24.7 L8.2,25.6 Z"],
};

const classic2 = { ...classic, b: bishopOf(1), n: knight };
  return { classic2 };
}

function write(file, name, set) {
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50"><!-- Kibitzo chess pieces, kibitzo.com. (c) 2026 Danubian Research AG. CC BY 4.0, https://creativecommons.org/licenses/by/4.0/ --><defs></defs>\n`;
  for (const side of ["w", "b"]) for (const code of ["k", "q", "r", "b", "n", "p"]) out += `<g id="${side}${code}">${piece(name, side, code, set[code])}</g>\n`;
  writeFileSync(`${here}${file}`, out + "</svg>\n");
}

// ── Classic, version 15: version 14 with the king narrower. Version 14: version 13 with the queen a bit narrower. Version 13: version 12 with the king's crown a little lower. Version 12: version 11 with the king a bit less wide. Version 11: version 10 with Arc for a king. Version 10: version 9 with the cup on the bishop and a line running on from his cut. Version 9: version 8 with a slimmer waist on the rook and, on trial, a block on top of the bishop. Version 8: version 7 on the planted foot. Version 7: version 6 with the tank for a rook. Version 6: version 5 with a bigger ball on the bishop. Version 5: version 4 with the second Bow (a thinner chest, the throat further back). Version 4: version 3 with Bow for a knight. Version 3: the waists are slimmer (founder 2026-11-13: more supple, and supple means the waist line
// only). Each piece is drawn narrower only around its waist: the narrowing grows from nothing below the head or the
// rim to its most at the waist, and is back to nothing at the shoulder of the foot. The knight has no waist.
const WAIST = {
  // where the narrowing starts, where it is strongest, where it ends
  p: [26, 30.5, 37.4],
  b: [29, 35, 37.7],
  r: [19, 27, 36.8],
  q: [25, 34.4, 37.5],
  k: [25, 34.4, 37.5],
};
/** One piece with its waist drawn narrower by `amount` at the narrowest point. */
function waistOf(code, def, amount) {
  const [y0, yc, y1] = WAIST[code];
  const bump = (y) => (y <= y0 || y >= y1 ? 0 : y <= yc ? 0.5 - 0.5 * Math.cos((Math.PI * (y - y0)) / (yc - y0)) : 0.5 + 0.5 * Math.cos((Math.PI * (y - yc)) / (y1 - yc)));
  /** Narrows a path made only of absolute M, L and C with "x,y" pairs (what lathe writes). */
  const narrow = (d, cx) => d.replace(/(-?[\d.]+),(-?[\d.]+)/g, (_, x, y) => `${f(cx + (+x - cx) * (1 - amount * bump(+y)))},${y}`);
  const made = new Map(def.parts.map((p) => [p, /[aAhHvVqQ]/.test(p.d) ? p : { ...p, d: narrow(p.d, p.cx) }]));
  return { ...def, parts: def.parts.map((p) => made.get(p)), ...(def.groups ? { groups: def.groups.map((g) => g.map((p) => made.get(p))) } : {}) };
}
function waisted(set, amount) {
  const out = { ...set };
  for (const code of Object.keys(WAIST)) out[code] = waistOf(code, set[code], amount);
  return out;
}
/**
 * A muscular knight, from the points an artist would set first. What makes Staunty's knight mighty was read from
 * it and is kept as rules, in our own drawing:
 *   the back is one arc that starts at the tip of the ear and swings out to the right at once, so there is mass
 *   over the head and behind it (the ear is the end of that line, not a part of its own);
 *   the jaw is a long line that climbs back to a throat set deep in the neck, and the chest falls from that
 *   throat in one line, so the space under the jaw is a clean wedge;
 *   the edge of the jaw bone is modelled in the shade tone.
 * `back` are the stations of the arc from the ear to the foot, `chest` from the foot up to the throat, `jaw` from
 * the throat to the lower lip, `muzzle` round to the nose, `face` up to the brow. `eye` is where the eye sits.
 */
function mighty({ ear, back, chest, jaw, under, muzzle, face, eye, nostril, bone }) {
  // `under`, in place of `chest` and `jaw`: one run from the foot up the chest, round the throat and along the jaw, so the throat is a curve and not a corner.
  const front = under ? [under] : [chest, jaw];
  const brow = face[face.length - 1];
  // The back leaves the tip of the ear at a slope (the first station below), so the ear is a point and not a flat cap.
  const horse = outline([[ear, [ear[0] + 2.3, ear[1] + 1.5], ...back], [back[back.length - 1], front[0][0]], ...front, muzzle, face, [brow, ear]], 11);
  const [ex, ey] = eye;
  const tilt = (20 * Math.PI) / 180;
  const dx = 1.8 * Math.cos(tilt);
  const dy = 1.8 * Math.sin(tilt);
  const almond = `M${f(ex - dx)},${f(ey + dy)} A1.8,1.25 -20 1,1 ${f(ex + dx)},${f(ey - dy)} A1.8,1.25 -20 1,1 ${f(ex - dx)},${f(ey + dy)} Z`;
  const [nx, ny] = nostril;
  return { parts: [horse, base(13.4, 26)], soft: [[bone, 1.8]], marks: [almond, `M${f(nx - 1)},${f(ny - 0.9)} L${f(nx + 1.3)},${f(ny)} L${f(nx - 0.8)},${f(ny + 1)} Z`] };
}
/**
 * The knight of Classic (the founder's picks on the knight page): Bow. The back is a drawn bow, widest half way
 * up, and comes in again towards the foot; a smaller head. From version 5 ("Bow 3") the chest is a little thinner
 * and the throat sits further back; it stays a corner.
 */
const BOW = {
  ear: [20.6, 7.2],
  back: [[27, 10], [32, 13], [36.2, 17.6], [38.8, 24], [38.4, 31], [36.4, 38]],
  chest: [[15.6, 38], [17.8, 33.8], [21.4, 29.8], [24.4, 27], [26.2, 25], [26.8, 22.9]],
  jaw: [[26.8, 22.9], [21.6, 24.6], [16.6, 26.2], [13, 27.8], [10.8, 28.4]],
  muzzle: [[10.8, 28.4], [8.4, 27], [7.6, 24.6], [8.6, 22.2]],
  face: [[8.6, 22.2], [14.2, 16.2], [20.4, 9.8]],
  eye: [20.2, 15],
  nostril: [9.8, 24.4],
  bone: "M13.6,26 C16.8,24.8 20.4,23.6 23.4,22.2 C25.2,21.2 26,19.4 25.6,17.2",
};

/**
 * The rook as the tank of the set (founder 2026-11-13: the upper part wider, the waist wider too; then: too flat,
 * add some lines). Looked at as characters, the rook of the set was a slim tower on a wide skirt with shallow
 * battlements; Staunty's is a broad block of battlements, nearly as wide as the foot, on a thick body.
 * In our own drawing: `cap` is half the width of the battlements, `crenel` how deep the gaps are, `teeth` where
 * the gaps are, `block` where the battlements end, `neck` and `hip` half the width of the body under them and
 * above the foot. The block of battlements is a shape of its own in front of the body, so there is a line where
 * they meet and the block throws a short shadow on the body. `floor` adds a line under the teeth (the walk behind
 * the battlements), `ring` one above the foot; both stop short of the edges.
 */
function tank({ cap = 11.6, crenel = 4.2, teeth = [2.5, 7], block = 19.4, neck = 9, hip = 10.4, floor = true, ring = false }) {
  // The gaps are wide: each side of a gap carries an outline 1.2 wide, so a gap of 3 shows as a slit, one of 4.5 as a gap.
  const top = 9.4;
  const [g1, g2] = teeth;
  const r = 1.2;
  const battlements = lathe([0, top], [[g1, top], [g1, top + crenel], [g2, top + crenel], [g2, top], [cap, top], [cap, block - r], [[cap, block - 0.45 * r], [cap - 0.45 * r, block], [cap - r, block]], [0, block]]);
  const body = lathe([0, block - 3], [[neck, block - 3], ...smooth([[neck, block - 3], [neck, block + 0.9], [neck + 0.1, 25.5], [(neck + hip) / 2 + 0.1, 31], [hip, 35], ...FOOT.side(13.4)]), ...FOOT.corner(13.4)]);
  const across = (y, half) => [`M${f(25 - half)},${y}H${f(25 + half)}`, 0.9];
  // Under the overhang of the block, a band of shade on the body (the block's own outline would hide a shorter shadow).
  const shadow = [`M${f(25 - neck + 1.3)},${f(block + 1.9)}H${f(25 + neck - 1.3)}`, 1.4];
  return { parts: [body, battlements], groups: [[body], [battlements]], soft: [shadow], lines: [...(floor ? [across(f(top + crenel + 1.7), cap - 2.6)] : []), ...(ring ? [across(37.4, hip - 0.9)] : [])] };
}
/**
 * The king in simple lines (founder 2026-11-13: the top only the line of a circle; the sides one line each, without
 * the waist; "simple lines is the name of the game"). Looked at as characters, the king of the first versions had a
 * busy top (two lobes, a dome between them, a small cross) and sides that went in and out again. Here the crown is
 * three lines: an arc across the top and one straight line down each side to the foot, with a cross standing behind
 * the arc. `w` is half the width at the shoulders (17.4: as wide as the queen), `rise` where the top of the arc is
 * (lower: a shorter crown and a longer cross), `crossTop` where the cross ends, `arm` half the length of its arms.
 */
function simpleKing({ w = 17.4, rise = 13.2, crossTop = 3.4, arm = 6.4, on = null }) {
  const crown = lathe([0, rise], [[[0.36 * w, rise], [0.7 * w, rise + 1.1], [w, rise + 3.4]], [[w + 0.5, rise + 3.9], [w + 0.6, rise + 4.7], [w + 0.2, rise + 5.6]], [10.2, 37.4], [0, 37.4]]);
  const foot = base(15.2);
  // What stands on the crown. By default the cross alone, its stem as long as it takes to reach the crown. With a low
  // crown that stem is long and the thing reads as a cross on a grave, so `on` puts something under a short cross:
  // a collar on a neck, an orb, or a dome.
  const plus = raw("M22.9,3.4h4.2v3.1h3.5v4.2h-3.5v3.1h-4.2v-3.1h-3.5v-4.2h3.5z", 5.6);
  const small = raw("M23.4,3.4h3.2v2.6h2.8v3.2h-2.8v3h-3.2v-3h-2.8v-3.2h2.8z", 4.4);
  const stem = f(rise + 1.4 - (crossTop + 6.4));
  const finial = {
    collar: [plus, lathe([0, 13.4], [[2.8, 13.4], [[3.6, 13.4], [3.6, 15.4], [2.8, 15.4]], [2.3, 15.8], [2.3, rise + 1.4], [0, rise + 1.4]])],
    orb: [small, circle(25, 14.2, 3.2)],
    dome: [plus, lathe([0, 12.8], [[[3.6, 12.8], [6, 15.2], [6, rise + 1.4]], [0, rise + 1.4]])],
  }[on] ?? [raw(`M23.1,${crossTop}h3.8v2.8h${f(arm - 1.9)}v3.6h${f(-(arm - 1.9))}v${stem}h-3.8v${-stem}h${f(-(arm - 1.9))}v-3.6h${f(arm - 1.9)}z`, arm)];
  return { parts: [...finial, crown, foot], groups: [finial, [crown, foot]] };
}

/**
 * The queen, one more round (founder 2026-11-13): cut a bit from her sides; and her five prongs need not be five
 * equal ones side by side, flat. Seen in the round, the ones at the margins may take more room. Looked at as
 * characters, the queen of the set has five equal thin fingers, the outer two standing far out like horns.
 * `k` is her width (1: the set's), `centre`, `mid` and `outer` her prongs: `tip` how high a prong reaches, `half`
 * half its width at the foot, `at` where it stands, `lean` how far its tip leans outwards, `feet` how low the dips
 * beside it are. `curl` turns the outer prong into a broad curl of the rim. `sides`: "waist" as in the set, or
 * "straight" like the king's.
 */
function queenOf({ k = 0.93, centre = { tip: 13.8, half: 2.9, foot: 18.6 }, mid = { at: 8.4, tip: 14.8, half: 2.9, lean: 0, feet: [18.9, 19.3] }, outer = { at: 16.7, tip: 16.4, half: 2.8, lean: 0, foot: 19.7, edge: 1 }, curl = false, sides = "waist" }) {
  const x = (v) => v * k;
  const up = (cx, half, tipX, tip, foot) => [[x(cx - 0.45 * half), foot], [x(tipX - 0.34 * half), tip], [x(tipX), tip]];
  const down = (cx, half, tipX, tip, foot) => [[x(tipX + 0.34 * half), tip], [x(cx + 0.45 * half), foot], [x(cx + half), foot]];
  const rim = [down(0, centre.half, 0, centre.tip, centre.foot), [x(mid.at - mid.half), mid.feet[0]], up(mid.at, mid.half, mid.at + mid.lean, mid.tip, mid.feet[0]), down(mid.at, mid.half, mid.at + mid.lean, mid.tip, mid.feet[1])];
  let from;
  if (curl) {
    // The outer prong as a broad, low curl of the rim itself.
    const pts = [[x(mid.at + mid.half), mid.feet[1]], [x(13.4), 18.3], [x(15.8), 17.5], [x(17.3), 18.6], [x(17.5), 20.4]];
    rim.push(...smooth(pts));
    from = pts[pts.length - 1];
  } else {
    const tipX = outer.at + outer.lean;
    rim.push([x(outer.at - outer.half), outer.foot], up(outer.at, outer.half, tipX, outer.tip, outer.foot), [[x(tipX + 0.8 * outer.edge), outer.tip], [x(tipX + 1.2 * outer.edge), outer.tip + 1.2], [x(tipX + outer.edge), outer.tip + 2.6]]);
    from = [x(tipX + outer.edge), outer.tip + 2.6];
  }
  const side = sides === "straight" ? [[10, 37.4], [0, 37.4]] : [...smooth([from, [from[0] - 1.1, from[1] + 3.8], [from[0] - 3.8, from[1] + 8.4], [11.4, 31.6], [9.9, 35], [9.8, 37.4]]), [0, 37.4]];
  const crown = lathe([0, centre.tip], [...rim, ...side]);
  const dome = lathe([0, 10.6], [[[x(5.4), 10.6], [x(9.6), 15], [x(9.6), 20.5]], [0, 20.5]]);
  const ball = circle(25, 7.4, 2.5);
  const foot = base(14.4);
  const def = { parts: [dome, ball, crown, foot], groups: [[dome, ball], [crown, foot]] };
  return sides === "straight" ? def : waistOf("q", def, 0.12);
}
/** Every piece but the pawn has a fine line where its foot begins (from version 16: weight in the foot, the shape untouched). It stops short of the edges. */
const footHalf = { k: 15.2, q: 14.4, r: 13.4, b: 13.4, n: 13.4 };
const footLine = (def, c) => ({ ...def, lines: [...(def.lines ?? []), [`M${f((c === "n" ? 26 : 25) - footHalf[c] + 3.4)},38.2H${f((c === "n" ? 26 : 25) + footHalf[c] - 3.4)}`, 0.9]] });
const made = (foot) => {
  FOOT = FEET[foot];
  const { classic2 } = build();
  // The rook of the set from version 7 (the founder's pick on the rook page): the tank, with one line. From version 9 his waist is slimmer.
  // The queen of the set from version 14: the queen of before with a bit cut from each side.
  // The king of the set from version 11 (the founder's pick on the king page): Arc. From version 12 he is a bit less wide than the queen; from version 13 his crown is a little lower (and he with it); from version 15 he is narrower again, a little under the queen.
  const set = { ...waisted(classic2, 0.12), n: mighty(BOW), r: tank({ floor: false, neck: 7.8, hip: 9.8 }), k: simpleKing({ w: 15, rise: 15, crossTop: 5.2 }), q: queenOf({}) };
  return { classic: { ...set, ...Object.fromEntries(["k", "q", "r", "b", "n"].map((c) => [c, footLine(set[c], c)])) } };
};
// The set is called Kibitzo (it was "Classic" until its fifteenth version; a second set, Emblem, was dropped). It
// stands on the planted foot. Version 16, with the line at the foot, is where the founder wrapped it up.
const current = { kibitzo: made("planted").classic };
write("kibitzo.svg", "kibitzo", current.kibitzo);

// ── a page for one piece alone, with candidates to choose from (founder 2026-11-13) ──
// Each candidate on light and dark squares, large and at the size of a real board, next to the piece of the
// set. (Staunty's stood beside them for reference while the set was drawn; it is gone from the repository.) `node piece-sets/make.mjs`
// writes the pages; the playground serves them at /knights and /bishops. Nothing in a set changes until a
// candidate is picked.
FOOT = FEET.planted;
function page(file, title, code, candidates) {
  const uri = (def, side, tag, c = code) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">${piece(tag, side, c, def)}</svg>`)}`;
  const squares = (srcOf) => ["w", "b"].map((side) => ["l", "d"].map((sq) => `<i class="${sq}"${srcOf(side)}></i>`).join("")).join("");
  // Under each card, a button that shows the piece among all the others, on a board at the start of a game.
  const card = (name, note, cells, set) => `<section data-set="${set}"><h2>${name}</h2><div class="big">${cells}</div><div class="small">${cells}${cells}</div><p>${note}</p><button type="button">See on a board</button></section>`;
  const ours = (name, note, def, tag) => card(name, note, squares((side) => ` style="background-image:url('${uri(def, side, tag)}')"`), "ours");
  const pieces = ["k", "q", "r", "b", "n", "p"].flatMap((c) => ["w", "b"].map((side) => [side + c, uri(current.kibitzo[c], side, "s", c)]));
  const start = ["rnbqkbnr", "pppppppp", "", "", "", "", "PPPPPPPP", "RNBQKBNR"];
  const board = start.map((row, r) => Array.from({ length: 8 }, (_, f) => { const ch = row[f]; const on = ch ? ` style="background-image:var(--p-${ch === ch.toUpperCase() ? "w" : "b"}${ch.toLowerCase()})"` : ""; return `<i class="${(r + f) % 2 ? "d" : "l"}"${on}></i>`; }).join("")).join("");
  writeFileSync(
    `${here}${file}`,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>
body{margin:0;padding:16px;background:#0c1117;color:#cbd5e1;font:14px/1.45 -apple-system,system-ui,sans-serif}
h1{font-size:18px;margin:0 0 4px;color:#f8fafc}h1+p{margin:0 0 16px;color:#94a3b8}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:14px}
section{background:#141b24;border:1px solid #243041;border-radius:16px;padding:12px;display:flex;flex-direction:column}
h2{font-size:14px;margin:0 0 8px;color:#fbbf24}
p{margin:8px 0 10px;font-size:12.5px;color:#94a3b8;flex:1}
button{height:44px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font:500 14px -apple-system,system-ui,sans-serif;cursor:pointer}
.big,.small{display:grid;grid-template-columns:1fr 1fr;border-radius:8px;overflow:hidden}
.small{grid-template-columns:repeat(8,1fr);margin-top:8px;max-width:100%}
i{display:block;aspect-ratio:1;background-size:100% 100%;background-repeat:no-repeat}
i.l{background-color:#f0d9b5}i.d{background-color:#b58863}
#view{position:fixed;inset:0;background:#0c1117;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:12px}
#view.open{display:flex}
#view header{display:flex;align-items:center;justify-content:space-between;width:min(100%,calc(100vh - 110px),760px)}
#view .board{width:min(100%,calc(100vh - 110px),760px)}
#view h2{margin:0;font-size:16px}
#view button{padding:0 18px}
.board{display:grid;grid-template-columns:repeat(8,1fr);width:min(100%,480px);border-radius:8px;overflow:hidden}
.set-ours{${pieces.map(([k, u]) => `--p-${k}:url('${u}')`).join(";")}}
#mode{position:sticky;top:8px;z-index:1;width:100%;margin:0 0 14px;background:#fbbf24;border-color:#fbbf24;color:#0c1117;font-weight:600}
#all{display:none;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}
#all h2{margin:0 0 8px}
#all > div{cursor:zoom-in}
#all .board{width:100%}
body.all main{display:none}body.all #all{display:grid}
</style></head><body><h1>${title}</h1><p>Each one on light and dark squares, large and small. "See on a board" shows it among the other pieces of its set; "All boards" shows a board for every one, to scroll through; press a board there to see it big. Tell me the one you like, and what to change on it.</p><button type="button" id="mode">All boards</button><main>
${ours("Kibitzo now", "The one in the set.", current.kibitzo[code], "now")}
${candidates.map((c, n) => ours(c.name, c.note, c.def, `c${n}`)).join("\n")}
</main>
<div id="all"></div>
<div id="view"><header><h2></h2><button type="button">Close</button></header><div id="board" class="board">${board}</div></div>
<script>
const view = document.getElementById("view");
const all = document.getElementById("all");
const mode = document.getElementById("mode");
/** The piece of a card takes the place of the set's own, in both colours. */
function dress(el, section) {
  const cells = section.querySelectorAll(".big i");
  el.style.setProperty("--p-w${code}", getComputedStyle(cells[0]).backgroundImage);
  el.style.setProperty("--p-b${code}", getComputedStyle(cells[2]).backgroundImage);
}
/** One board, big, over the page. */
function show(section) {
  view.className = "open set-" + section.dataset.set;
  dress(view, section);
  view.querySelector("h2").textContent = section.querySelector("h2").textContent;
}
const hide = () => view.classList.remove("open");
for (const section of document.querySelectorAll("main section")) section.querySelector("button").onclick = () => show(section);
view.querySelector("button").onclick = hide;
// Also closed by Escape and by a press beside the board.
view.onclick = (event) => { if (event.target === view) hide(); };
addEventListener("keydown", (event) => { if (event.key === "Escape") hide(); });
// All boards: one board for every card, made the first time they are asked for.
mode.onclick = () => {
  if (!all.children.length) for (const section of document.querySelectorAll("main section")) {
    const one = document.createElement("div");
    one.className = "set-" + section.dataset.set;
    one.innerHTML = "<h2></h2>" + document.getElementById("board").outerHTML.replace(' id="board"', "");
    one.querySelector("h2").textContent = section.querySelector("h2").textContent;
    dress(one, section);
    // A press on a small board shows it big.
    one.onclick = () => show(section);
    all.append(one);
  }
  mode.textContent = document.body.classList.toggle("all") ? "Cards" : "All boards";
  scrollTo(0, 0);
};
</script></body></html>
`,
  );
}

// The knights to choose from. Empty when none is in question.
const KNIGHTS = [];
page("knights.html", "Knights", "n", KNIGHTS);

// The bishops to choose from. The set has the cup with the cut and the line; the cup with the cut alone is kept
// beside it (the founder: keep it as well).
const BISHOPS = [{ name: "Cup", note: "The cup with the cut alone, without the line.", def: { ...current.kibitzo.b, lines: [] } }];
page("bishops.html", "Bishops", "b", BISHOPS);

// The rooks to choose from. Empty when none is in question.
const ROOKS = [];
page("rooks.html", "Rooks", "r", ROOKS);

// The kings to choose from. Empty when none is in question.
const KINGS = [];
page("kings.html", "Kings", "k", KINGS);

// The queens to choose from. Empty when none is in question.
const QUEENS = [];
page("queens.html", "Queens", "q", QUEENS);

// ── a page for a change that goes through the whole set: every candidate is a set ──
function setPage(file, title, intro, candidates) {
  const uri = (def, side, tag, c) => `url('data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">${piece(tag, side, c, def)}</svg>`)}')`;
  const codes = ["k", "q", "r", "b", "n", "p"];
  const vars = (set, tag) => codes.flatMap((c) => ["w", "b"].map((side) => `--p-${side}${c}:${uri(set[c], side, tag, c)}`)).join(";");
  const strip = ["w", "b"].map((side) => codes.map((c, n) => `<i class="${(n + (side === "b" ? 1 : 0)) % 2 ? "d" : "l"}" style="background-image:var(--p-${side}${c})"></i>`).join("")).join("");
  const card = (name, note, attrs) => `<section ${attrs}><h2>${name}</h2><div class="strip">${strip}</div><p>${note}</p><button type="button">See on a board</button></section>`;
  const start = ["rnbqkbnr", "pppppppp", "", "", "", "", "PPPPPPPP", "RNBQKBNR"];
  const board = start.map((row, r) => Array.from({ length: 8 }, (_, n) => { const ch = row[n]; const on = ch ? ` style="background-image:var(--p-${ch === ch.toUpperCase() ? "w" : "b"}${ch.toLowerCase()})"` : ""; return `<i class="${(r + n) % 2 ? "d" : "l"}"${on}></i>`; }).join("")).join("");
  writeFileSync(
    `${here}${file}`,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>
body{margin:0;padding:16px;background:#0c1117;color:#cbd5e1;font:14px/1.45 -apple-system,system-ui,sans-serif}
h1{font-size:18px;margin:0 0 4px;color:#f8fafc}h1+p{margin:0 0 16px;color:#94a3b8}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
section{background:#141b24;border:1px solid #243041;border-radius:16px;padding:12px;display:flex;flex-direction:column}
h2{font-size:14px;margin:0 0 8px;color:#fbbf24}
p{margin:8px 0 10px;font-size:12.5px;color:#94a3b8;flex:1}
button{height:44px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font:500 14px -apple-system,system-ui,sans-serif;cursor:pointer}
.strip{display:grid;grid-template-columns:repeat(6,1fr);border-radius:8px;overflow:hidden}
i{display:block;aspect-ratio:1;background-size:100% 100%;background-repeat:no-repeat}
i.l{background-color:#f0d9b5}i.d{background-color:#b58863}
.board{display:grid;grid-template-columns:repeat(8,1fr);width:100%;border-radius:8px;overflow:hidden}
#view{position:fixed;inset:0;background:#0c1117;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:12px}
#view.open{display:flex}
#view header{display:flex;align-items:center;justify-content:space-between;width:min(100%,calc(100vh - 110px),760px)}
#view h2{margin:0;font-size:16px}
#view button{padding:0 18px}
#view .board{width:min(100%,calc(100vh - 110px),760px)}
#mode{position:sticky;top:8px;z-index:1;width:100%;margin:0 0 14px;background:#fbbf24;border-color:#fbbf24;color:#0c1117;font-weight:600}
#all{display:none;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}
#all h2{margin:0 0 8px}
#all > div{cursor:zoom-in}
body.all main{display:none}body.all #all{display:grid}
</style></head><body><h1>${title}</h1><p>${intro} "See on a board" shows a set on a board; "All boards" shows a board for every one, to scroll through; press a board there to see it big.</p><button type="button" id="mode">All boards</button><main>
${card("Kibitzo now", "The set as it is.", `style="${vars(current.kibitzo, "now")}"`)}
${candidates.map((c, n) => card(c.name, c.note, `style="${vars(c.set, `c${n}`)}"`)).join("\n")}
</main>
<div id="all"></div>
<div id="view"><header><h2></h2><button type="button">Close</button></header><div id="board" class="board">${board}</div></div>
<script>
const view = document.getElementById("view");
const all = document.getElementById("all");
const mode = document.getElementById("mode");
/** The pieces of a card. */
function dress(el, section, extra) {
  el.className = (extra + " " + section.className).trim();
  el.style.cssText = section.style.cssText;
}
function show(section) {
  dress(view, section, "open");
  view.querySelector("h2").textContent = section.querySelector("h2").textContent;
}
const hide = () => view.classList.remove("open");
for (const section of document.querySelectorAll("main section")) section.querySelector("button").onclick = () => show(section);
view.querySelector("button").onclick = hide;
view.onclick = (event) => { if (event.target === view) hide(); };
addEventListener("keydown", (event) => { if (event.key === "Escape") hide(); });
mode.onclick = () => {
  if (!all.children.length) for (const section of document.querySelectorAll("main section")) {
    const one = document.createElement("div");
    dress(one, section, "");
    one.innerHTML = "<h2></h2>" + document.getElementById("board").outerHTML.replace(' id="board"', "");
    one.querySelector("h2").textContent = section.querySelector("h2").textContent;
    one.onclick = () => show(section);
    all.append(one);
  }
  mode.textContent = document.body.classList.toggle("all") ? "Cards" : "All boards";
  scrollTo(0, 0);
};
</script></body></html>
`,
  );
}

/**
 * More weight in the foot (founder 2026-11-13: the base of every piece but the pawn). A piece with its foot drawn
 * `tall` units taller (the shoulder of the foot moves up by that much; everything above it is pressed together by
 * the same amount, a few percent) and `wide` units wider to each side at the square. Nothing is added: no step,
 * no line. Works on the drawing: every point of the piece is moved.
 */
function heavier(def, { tall = 0, wide = 0 }) {
  const top = 37.2;
  const moveY = (y) => (y <= top ? (y * (top - tall)) / top : top - tall + ((y - top) * (45 - top + tall)) / (45 - top));
  const spread = (y) => { const t = Math.min(1, Math.max(0, (y - top) / 2.4)); return 1 + (wide / 13.4) * t * t * (3 - 2 * t); };
  const point = (x, y, cx) => `${f(cx + (x - cx) * spread(y))},${f(moveY(y))}`;
  // A path of absolute points is moved point by point. One that goes on in relative steps (a ball, the cross, a mark with arcs) is moved as a whole, by its first point.
  const move = (d, cx) => (/[a-zA]/.test(d.replace(/^M/, "")) ? d.replace(/^M(-?[\d.]+),(-?[\d.]+)/, (_, x, y) => `M${point(+x, +y, cx)}`) : d.replace(/(-?[\d.]+),(-?[\d.]+)/g, (_, x, y) => point(+x, +y, cx)));
  const made = new Map(def.parts.map((p) => [p, { ...p, d: move(p.d, p.cx ?? 26) }]));
  const stroke = (l) => (typeof l === "string" ? move(l, 25) : [move(l[0], 25), l[1]]);
  return {
    ...def,
    parts: def.parts.map((p) => made.get(p)),
    ...(def.groups ? { groups: def.groups.map((g) => g.map((p) => made.get(p))) } : {}),
    ...(def.cuts ? { cuts: def.cuts.map((d) => move(d, 25)) } : {}),
    ...(def.lines ? { lines: def.lines.map(stroke) } : {}),
    ...(def.soft ? { soft: def.soft.map(stroke) } : {}),
    ...(def.marks ? { marks: def.marks.map((m) => (typeof m === "string" ? move(m, 25) : [move(m[0], 25), m[1]])) } : {}),
  };
}
// The feet to choose from. Empty when none is in question.
const BASES = [];
setPage("bases.html", "Bases", "More weight in the foot of every piece but the pawn. Each card is the whole set.", BASES);
