/**
 * The playground: play on the board, change its looks, and measure it on a
 * real phone (RULES.md, rule 11). Everything that ticks here (the frame
 * meter, the auto-play timer, the stuck-script stress) belongs to this
 * page, not to the library.
 */
import { Chess, type Square as ChessSquare } from "chess.js";
import { lightsquare } from "../src/index";
import { a11y } from "../src/modules/a11y";
import { premoveTargets } from "../src/modules/premove";
import { promotion } from "../src/modules/promotion";
import { shapes, type Arrow, type Circle } from "../src/modules/shapes";
import { applyTheme, themes, type Theme } from "../src/modules/theme";

const OPERA = "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#".split(" ");
/** Move-quality badges for the replay, by ply. Their look is this page's CSS, not the library's. */
const BADGES: Record<number, string> = { 5: "book", 12: "inaccuracy", 16: "mistake", 19: "great", 20: "forced", 23: "excellent", 25: "great", 27: "best", 28: "blunder", 31: "brilliant", 33: "great" };
const BADGE_KINDS = ["brilliant", "great", "excellent", "best", "inaccuracy", "mistake", "blunder", "book", "forced"];
/** "All": every badge at once, with the corner, the top row and the right column covered. */
const BADGE_SQUARES = ["h8", "a8", "h4", "c5", "d5", "e5", "f5", "b4", "g4"];
/** The names of the colours and what each is for: the app's two, then the user's three. */
const SHAPE_NAMES: Array<[string, string, string]> = [["default", "plan", "#ea580c"], ["red", "threat", "#b91c1c"], ["green", "pen", "#047857"], ["blue", "Alt", "#1d4ed8"], ["yellow", "Shift", "#ca8a04"]];
const SAMPLE_ARROWS: Arrow[] = [{ from: "b1", to: "c3" }, { from: "c8", to: "g4", name: "red" }, { from: "d1", to: "d4", name: "green", label: "1" }, { from: "f1", to: "b5", name: "blue", label: "2" }, { from: "h7", to: "h5", name: "yellow" }];
const SAMPLE_CIRCLES: Circle[] = [{ square: "e5", name: "red" }, { square: "a4" }, { square: "g6", name: "green" }];

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const host = $("board");
let chess = new Chess();
let ply = 0;
let orientation: "white" | "black" = "white";

/** The switches of the page, readable before their buttons are wired. */
const toggles: Record<string, boolean> = {};
const samples = { set: [] as number[], input: [] as number[], gaps: [] as number[], slides: [] as number[] };
const counts = { moves: 0, presses: 0 };

// ── the game ───────────────────────────────────────────────────────────

function kingSquare(): string | null {
  if (!chess.inCheck()) return null;
  for (const row of chess.board()) for (const cell of row) if (cell && cell.type === "k" && cell.color === chess.turn()) return cell.square;
  return null;
}

function targets(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const m of chess.moves({ verbose: true })) map.set(m.from, [...(map.get(m.from) ?? []), m.to]);
  return map;
}

function show(): void {
  const last = chess.history({ verbose: true }).at(-1);
  const fen = chess.fen();
  const whiteToMove = chess.turn() === "w";
  const versus = toggles.versus;
  const next = {
    position: fen,
    movable: versus ? (whiteToMove ? "white" : "none") : whiteToMove ? "white" : "black",
    targets: targets(),
    premovable: versus && !whiteToMove ? "white" : "none",
    premoveTargets: versus ? premoveTargets(fen, "white") : null,
    lastMove: last ? ([last.from, last.to] as const) : null,
    check: kingSquare(),
    marks: badges(last?.to),
  } as const;
  const began = performance.now();
  board.set(next);
  samples.set.push(performance.now() - began);
  counts.moves++;
  showShapes();
}

/** The badges to show: the replay's own, one kind on the last move, or all nine at once. */
function badges(to: string | undefined): Array<{ square: string; name: string; above: true }> | null {
  if (look.badge === "all") return BADGE_KINDS.map((name, i) => ({ square: BADGE_SQUARES[i], name, above: true }));
  const name = look.badge === "auto" ? BADGES[ply] : look.badge;
  return name ? [{ square: to ?? "e4", name, above: true }] : null;
}

/** The hint arrow is the next move of the Opera game; the samples show every colour at once. */
function showShapes(): void {
  const arrows: Arrow[] = toggles.samples ? [...SAMPLE_ARROWS] : [];
  const san = toggles.hints && ply >= 0 ? OPERA[ply] : undefined;
  if (san) {
    const move = new Chess(chess.fen()).move(san);
    arrows.push({ from: move.from, to: move.to });
  }
  drawing.set({ arrows, circles: toggles.samples ? SAMPLE_CIRCLES : [] });
}

let replyTimer = 0;
function reply(): void {
  const moves = chess.moves();
  if (!moves.length || chess.turn() !== "b") return;
  chess.move(moves[Math.floor(Math.random() * moves.length)]);
  show();
  board.playPremove();
}

const board = lightsquare(host, {
  async onMove({ from, to, piece }) {
    let promoteTo: string | undefined;
    if (piece[1] === "p" && (to[1] === "8" || to[1] === "1")) {
      const picked = await picker.ask(to, piece[0] === "w" ? "white" : "black");
      if (!picked) return show();
      promoteTo = picked;
    }
    try {
      chess.move({ from: from as ChessSquare, to: to as ChessSquare, promotion: promoteTo });
      ply = -1;
    } catch {
      /* not legal: show() puts the piece back */
    }
    show();
    clearTimeout(replyTimer);
    if (toggles.versus && chess.turn() === "b") replyTimer = window.setTimeout(reply, 900);
  },
});
const picker = board.use(promotion());
const drawing = board.use(shapes({ draw: true }));
board.use(a11y({ label: "Lightsquare playground board" }));

function goTo(target: number): void {
  const next = Math.max(0, Math.min(OPERA.length, target));
  chess = new Chess();
  for (const san of OPERA.slice(0, next)) chess.move(san);
  ply = next;
  show();
}

// ── buttons ────────────────────────────────────────────────────────────

function toggle(id: string, onChange: (on: boolean) => void, start = false): void {
  const button = $(id);
  const set = (on: boolean): void => {
    toggles[id] = on;
    button.setAttribute("aria-pressed", String(on));
  };
  set(start);
  button.onclick = () => {
    set(!toggles[id]);
    onChange(toggles[id]);
  };
}

$("next").onclick = () => goTo(ply < 0 ? 1 : ply + 1);
$("back").onclick = () => goTo(ply < 0 ? 0 : ply - 1);
$("flip").onclick = () => board.set({ orientation: (orientation = orientation === "white" ? "black" : "white") });
toggle("versus", () => {
  clearTimeout(replyTimer);
  show();
});
toggle("hints", showShapes, true);
toggle("samples", showShapes);

let autoTimer = 0;
toggle("play", (on) => {
  clearInterval(autoTimer);
  if (on) autoTimer = window.setInterval(() => goTo(ply < 0 || ply >= OPERA.length ? 0 : ply + 1), 450);
});

let stressTimer = 0;
toggle("stress", (on) => {
  clearInterval(stressTimer);
  if (!on) return;
  stressTimer = window.setInterval(() => {
    const until = performance.now() + 220;
    while (performance.now() < until);
  }, 320);
});
toggle("lpm", () => {});

// ── looks ──────────────────────────────────────────────────────────────

interface Look {
  board: keyof typeof themes;
  pieces: string;
  labels: "on" | "off";
  pieceSize: number;
  moveMs: number;
  arrowWidth: number;
  arrowHead: number;
  /** "auto" follows the replay, "all" shows every badge, else one kind on the last move. */
  badge: string;
  arrowColours: Record<string, string>;
  circleColours: Record<string, string>;
}

const LOOK_KEY = "lightsquare-playground-look-2";
const plainColours = (): Record<string, string> => Object.fromEntries(SHAPE_NAMES.map(([name, , colour]) => [name, colour]));
const look: Look = { board: "wood", pieces: "cburnett", labels: "on", pieceSize: 100, moveMs: 180, arrowWidth: 20, arrowHead: 82, badge: "auto", arrowColours: plainColours(), circleColours: plainColours() };

/** The look as the theme an app would store for a user. */
function themeOf(l: Look): Theme {
  const builtIn = plainColours();
  const changed = (colours: Record<string, string>, base: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(colours).filter(([name, colour]) => colour !== base[name]));
  const shapeColours = changed(l.arrowColours, builtIn);
  const circleColours = changed(l.circleColours, l.arrowColours);
  return {
    ...themes[l.board],
    pieces: l.pieces,
    pieceSize: l.pieceSize / 100,
    moveMs: l.moveMs,
    ...(Object.keys(shapeColours).length && { shapes: shapeColours }),
    ...(Object.keys(circleColours).length && { circles: circleColours }),
    arrowTail: Math.round(l.arrowHead * 0.17) / 100,
    arrowHead: l.arrowHead / 100,
  };
}

function applyLook(): void {
  const theme = themeOf(look);
  applyTheme($("page"), theme);
  board.set({ coordinates: look.labels === "on", marks: badges(chess.history({ verbose: true }).at(-1)?.to) });
  const width = look.arrowWidth / 100;
  drawing.set({ look: { width, headWidth: width * 2.7, headLength: width * 2.3 } });
  $("theme").textContent = `applyTheme(element, ${JSON.stringify(theme, null, 1).replace(/\n\s*/g, " ")})`;
  for (const el of document.querySelectorAll<HTMLElement>("[data-look]")) el.setAttribute("aria-pressed", String(String(look[el.dataset.look as keyof Look]) === el.dataset.value));
  for (const id of ["pieceSize", "moveMs", "arrowWidth", "arrowHead"] as const) {
    ($(id) as HTMLInputElement).value = String(look[id]);
    $(`${id}Out`).textContent = id === "moveMs" ? `${look[id]} ms` : `${look[id]}%`;
  }
  localStorage.setItem(LOOK_KEY, JSON.stringify(look));
}

function choice(parent: string, key: keyof Look, value: string, content: string, className: string): void {
  const button = $(parent).appendChild(document.createElement("button"));
  button.className = className;
  button.dataset.look = key;
  button.dataset.value = value;
  button.innerHTML = content;
  button.setAttribute("aria-label", `${key} ${value}`);
  button.onclick = () => {
    (look as unknown as Record<string, string>)[key] = value;
    applyLook();
  };
}

async function buildLooks(): Promise<void> {
  const config = (await fetch("/config.json").then((r) => r.json()).catch(() => ({}))) as { extraPieces?: boolean };
  for (const [name, t] of Object.entries(themes)) choice("boards", "board", name, `<i style="background:linear-gradient(135deg, ${t.light} 50%, ${t.dark} 50%)"></i>`, "swatch");
  choice("badges", "badge", "auto", "Auto", "");
  choice("badges", "badge", "all", "All", "");
  for (const kind of BADGE_KINDS) choice("badges", "badge", kind, `<i class="q-${kind}"></i>`, "pick");
  choice("labels", "labels", "on", "On", "");
  choice("labels", "labels", "off", "Off", "");
  choice("sets", "pieces", "cburnett", "Cburnett", "");
  if (config.extraPieces) {
    choice("sets", "pieces", "extra", "Kibitzo", "");
    look.pieces = "extra";
  }
  try {
    Object.assign(look, JSON.parse(localStorage.getItem(LOOK_KEY) ?? "{}"));
  } catch {
    /* a broken saved look is ignored */
  }
  if (!(look.board in themes)) look.board = "wood";
  if (look.pieces === "extra" && !config.extraPieces) look.pieces = "cburnett";
  for (const id of ["pieceSize", "moveMs", "arrowWidth", "arrowHead"] as const) {
    $(id).oninput = () => {
      look[id] = Number(($(id) as HTMLInputElement).value);
      applyLook();
    };
  }
  wells("arrowColours", look.arrowColours);
  wells("circleColours", look.circleColours);
  applyLook();
}

/** One colour well per shape name. Changing one shows the samples, so the change is seen. */
function wells(parent: string, colours: Record<string, string>): void {
  for (const [name, caption] of SHAPE_NAMES) {
    const label = $(parent).appendChild(document.createElement("label"));
    label.className = "well";
    label.innerHTML = `<input type="color" value="${colours[name]}" aria-label="${parent} ${caption}"><small>${caption}</small>`;
    (label.firstChild as HTMLInputElement).oninput = (e) => {
      colours[name] = (e.target as HTMLInputElement).value;
      if (!toggles.samples) $("samples").click();
      applyLook();
    };
  }
}

// ── measuring ──────────────────────────────────────────────────────────

let lastFrame = 0;
toggle("measure", (on) => {
  lastFrame = 0;
  if (on) requestAnimationFrame(frame);
});
function frame(now: number): void {
  if (!toggles.measure) return;
  if (lastFrame) samples.gaps.push(now - lastFrame);
  lastFrame = now;
  requestAnimationFrame(frame);
}

host.addEventListener("pointermove", (e) => samples.input.push(Math.max(0, performance.now() - e.timeStamp)), true);
host.addEventListener("pointerdown", () => counts.presses++, true);
const slideBegan = new WeakMap<EventTarget, number>();
host.addEventListener("transitionrun", (e) => e.propertyName === "transform" && slideBegan.set(e.target!, performance.now()));
host.addEventListener("transitionend", (e) => {
  const began = slideBegan.get(e.target!);
  if (began && e.propertyName === "transform") samples.slides.push(performance.now() - began);
});

const median = (a: number[]): number => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
const worst = (a: number[]): number => (a.length ? Math.max(...a) : 0);
const round = (n: number): number => Math.round(n * 10) / 10;

function summary(): Record<string, unknown> {
  const gap = median(samples.gaps);
  return {
    fps: gap ? round(1000 / gap) : null,
    worstGap: round(worst(samples.gaps)),
    setMedian: round(median(samples.set)),
    setWorst: round(worst(samples.set)),
    inputMedian: round(median(samples.input)),
    inputWorst: round(worst(samples.input)),
    slideMedian: round(median(samples.slides)),
    slideWorst: round(worst(samples.slides)),
    moves: counts.moves,
    presses: counts.presses,
    lowPower: toggles.lpm,
    stuckScript: toggles.stress,
    measuring: toggles.measure,
    board: Math.round(host.getBoundingClientRect().width),
    dpr: devicePixelRatio,
    screen: `${screen.width}x${screen.height}`,
    look,
    ua: navigator.userAgent,
  };
}

function send(kind: string): void {
  void fetch("/log", { method: "POST", body: JSON.stringify({ kind, ...summary() }), keepalive: true })
    .then(() => ($("sent").textContent = `Sent "${kind}" at ${new Date().toLocaleTimeString()}.`))
    .catch(() => ($("sent").textContent = "Could not reach the computer that serves this page."));
}

setInterval(() => {
  const s = summary();
  $("s-fps").textContent = s.fps === null ? "–" : String(s.fps);
  $("s-gap").textContent = s.fps === null ? "–" : String(s.worstGap);
  $("s-set").textContent = counts.moves > 1 ? String(s.setMedian) : "–";
  $("s-input").textContent = samples.input.length ? String(s.inputMedian) : "–";
  $("where").textContent = `${s.board} px · ${devicePixelRatio}x`;
  for (const list of Object.values(samples)) if (list.length > 600) list.splice(0, list.length - 600);
}, 1000);

$("smooth").onclick = () => send("feels smooth");
$("rough").onclick = () => send("not smooth");
addEventListener("pagehide", () => send("leaving"));

show();
void buildLooks();
