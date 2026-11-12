/**
 * The page for rule 11: feel and measure Lightsquare on a real phone.
 * Everything that ticks here (the frame meter, the auto-play timer, the
 * stuck-script stress) belongs to this page, not to the library.
 */
import { Chess, type Square as ChessSquare } from "chess.js";
import { lightsquare } from "../src/index";

const OPERA = "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#".split(" ");

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const host = $("board");
let chess = new Chess();
let ply = 0;
let orientation: "white" | "black" = "white";

const samples = { set: [] as number[], input: [] as number[], gaps: [] as number[], slides: [] as number[] };
const counts = { moves: 0, drags: 0 };

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
  const next = { position: chess.fen(), movable: chess.turn() === "w" ? "white" : "black", targets: targets(), lastMove: last ? ([last.from, last.to] as const) : null, check: kingSquare() } as const;
  const began = performance.now();
  board.set(next);
  samples.set.push(performance.now() - began);
  counts.moves++;
}

const board = lightsquare(host, {
  onMove({ from, to }) {
    try {
      chess.move({ from: from as ChessSquare, to: to as ChessSquare, promotion: "q" });
      ply = -1;
    } catch {
      /* not legal: show() puts the piece back */
    }
    show();
  },
});

function goTo(target: number): void {
  const next = Math.max(0, Math.min(OPERA.length, target));
  chess = new Chess();
  for (const san of OPERA.slice(0, next)) chess.move(san);
  ply = next;
  show();
}

$("next").onclick = () => goTo(ply < 0 ? 1 : ply + 1);
$("back").onclick = () => goTo(ply < 0 ? 0 : ply - 1);
$("flip").onclick = () => board.set({ orientation: (orientation = orientation === "white" ? "black" : "white") });

function toggle(id: string, onChange: (on: boolean) => void): () => boolean {
  const button = $(id);
  let on = false;
  button.onclick = () => {
    on = !on;
    button.setAttribute("aria-pressed", String(on));
    onChange(on);
  };
  return () => on;
}

let autoTimer = 0;
toggle("play", (on) => {
  clearInterval(autoTimer);
  if (on) autoTimer = window.setInterval(() => goTo(ply < 0 || ply >= OPERA.length ? 0 : ply + 1), 450);
});

let stressTimer = 0;
const stressed = toggle("stress", (on) => {
  clearInterval(stressTimer);
  if (!on) return;
  stressTimer = window.setInterval(() => {
    const until = performance.now() + 220;
    while (performance.now() < until);
  }, 320);
});

const lowPower = toggle("lpm", () => {});

let lastFrame = 0;
const measuring = toggle("measure", (on) => {
  lastFrame = 0;
  if (on) requestAnimationFrame(frame);
});
function frame(now: number): void {
  if (!measuring()) return;
  if (lastFrame) samples.gaps.push(now - lastFrame);
  lastFrame = now;
  requestAnimationFrame(frame);
}

host.addEventListener("pointermove", (e) => samples.input.push(Math.max(0, performance.now() - e.timeStamp)), true);
host.addEventListener("pointerdown", () => counts.drags++, true);
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
    presses: counts.drags,
    lowPower: lowPower(),
    stuckScript: stressed(),
    measuring: measuring(),
    board: host.getBoundingClientRect().width,
    dpr: devicePixelRatio,
    screen: `${screen.width}x${screen.height}`,
    ua: navigator.userAgent,
  };
}

function send(kind: string): void {
  const body = JSON.stringify({ kind, ...summary() });
  void fetch("/log", { method: "POST", body, keepalive: true })
    .then(() => ($("sent").textContent = `Sent "${kind}" at ${new Date().toLocaleTimeString()}.`))
    .catch(() => ($("sent").textContent = "Could not reach the Mac."));
}

setInterval(() => {
  const s = summary();
  $("s-fps").textContent = s.fps === null ? "–" : String(s.fps);
  $("s-gap").textContent = s.fps === null ? "–" : String(s.worstGap);
  $("s-set").textContent = counts.moves > 1 ? String(s.setMedian) : "–";
  $("s-input").textContent = samples.input.length ? String(s.inputMedian) : "–";
  for (const list of Object.values(samples)) if (list.length > 600) list.splice(0, list.length - 600);
}, 1000);

$("smooth").onclick = () => send("feels smooth");
$("rough").onclick = () => send("not smooth");
addEventListener("pagehide", () => send("leaving"));

$("where").textContent = `${Math.round(host.getBoundingClientRect().width)} px · ${devicePixelRatio}x`;
($("old") as HTMLAnchorElement).href = `http://${location.hostname}:3009/perf-board?kind=cm`;
show();
