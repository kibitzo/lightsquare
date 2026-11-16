/**
 * The playground: play on the board, change its looks, and measure it on a
 * real phone (RULES.md, rule 11). Everything that ticks here (the frame
 * meter, the auto-play timer, the stuck-script stress, the script's lane of
 * the race) belongs to this page, not to the library.
 */
import { Chess, type Square as ChessSquare } from "chess.js";
import { lightsquare, type PieceCode } from "../src/index";
import { a11y } from "../src/modules/a11y";
import { editor, type Editor, type EditorTool } from "../src/modules/editor";
import { premoveTargets } from "../src/modules/premove";
import { overlay } from "../src/modules/overlay";
import { promotion } from "../src/modules/promotion";
import { shapes, type Arrow, type Circle } from "../src/modules/shapes";
import { applyTheme, themes, type Theme } from "../src/modules/theme";

const OPERA = "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#".split(" ");
/** Move-quality badges for the replay, by ply. Their look is this page's CSS, not the library's. */
const BADGES: Record<number, string> = { 5: "book", 12: "inaccuracy", 16: "mistake", 19: "great", 20: "forced", 23: "excellent", 25: "great", 27: "best", 28: "blunder", 31: "brilliant", 33: "great" };
const BADGE_KINDS = ["brilliant", "great", "excellent", "best", "inaccuracy", "mistake", "blunder", "book", "forced", "mate"];
/** "All": every badge at once, with the corner, the top row and the right column covered. */
const BADGE_SQUARES = ["h8", "a8", "h4", "c5", "d5", "e5", "f5", "b4", "g4", "e8"];
type BoardMark = { square: string; name: string; above?: boolean };
/** The eight sparks of the checkmate badge, a little off the axes so they read as a burst. */
const MATE_SPARKS = [10, 55, 100, 145, 190, 235, 280, 325];
/** The names of the colours and what each is for: the app's two, then the user's three. */
const SHAPE_NAMES: Array<[string, string, string]> = [["default", "plan", "#ea580c"], ["red", "threat", "#b91c1c"], ["green", "pen", "#047857"], ["blue", "Alt", "#1d4ed8"], ["yellow", "Shift", "#ca8a04"]];
const SAMPLE_ARROWS: Arrow[] = [{ from: "b1", to: "c3" }, { from: "c8", to: "g4", name: "red" }, { from: "d1", to: "d4", name: "green", label: "1" }, { from: "f1", to: "b5", name: "blue", label: "2" }, { from: "h7", to: "h5", name: "yellow" }];
const SAMPLE_CIRCLES: Circle[] = [{ square: "e5", name: "red" }, { square: "a4" }, { square: "g6", name: "green" }];

/** An element by its id, or by a selector that starts with a dot. */
const $ = (id: string): HTMLElement => (id.startsWith(".") ? document.querySelector<HTMLElement>(id)! : document.getElementById(id)!);
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
  // Whatever shows the game again (a step, the computer, a played position) ends the editing.
  if (editing) leaveEditor();
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
    check: chess.isCheckmate() ? null : kingSquare(),
    marks: badges(last?.to),
  } as const;
  const began = performance.now();
  board.set(next);
  samples.set.push(performance.now() - began);
  counts.moves++;
  showMate(last?.to);
  showShapes();
  // Against the computer, Black answers whenever it is Black's turn: after a move of the player, and also when
  // the computer is switched on, or a step through the game ends, on Black's turn.
  clearTimeout(replyTimer);
  if (versus && !whiteToMove && !chess.isGameOver()) replyTimer = window.setTimeout(reply, 900);
}

/** Where the badges go: the replay's own, one kind on the last move, or all of them at once. */
function badgePlaces(to: string | undefined): Array<[string, string]> {
  if (editing) return [];
  if (look.badge === "all") return BADGE_KINDS.map((name, i) => [name, BADGE_SQUARES[i]]);
  if (look.badge !== "auto") return [[look.badge, to ?? "e4"]];
  const places: Array<[string, string]> = to && BADGES[ply] ? [[BADGES[ply], to]] : [];
  const mated = chess.isCheckmate() ? kingSquare() : null;
  if (mated) places.push(["mate", mated]);
  return places;
}

/**
 * The board's marks for the badges. Checkmate is a glow under the king; its
 * "#" is HTML (showMate). The blush of a king in check is the board's own
 * check mark. Both sit under the piece, so the king stays crisp; the page's
 * stylesheet makes them strong enough to show around it.
 */
function badges(to: string | undefined): BoardMark[] {
  return badgePlaces(to).map(([name, square]) => (name === "mate" ? { square, name: "mated" } : { square, name, above: true }));
}

/** The "#" with its sparks, put on the mated king's square. It is rebuilt only when the square changes, so it lands once. */
let mateAt: string | null = null;
function showMate(to: string | undefined): void {
  const square = badgePlaces(to).find(([name]) => name === "mate")?.[1] ?? null;
  if (square === mateAt) return;
  mateAt = square;
  if (!square) return html.remove("mate");
  const el = document.createElement("div");
  el.className = "mate";
  el.innerHTML = `<span class="mate-badge" role="img" aria-label="Checkmate"><span class="mate-sparks" aria-hidden="true">${MATE_SPARKS.map((angle, i) => `<i class="mate-spark mate-spark-${i % 3}" style="--a:${angle}deg"></i>`).join("")}</span></span>`;
  html.put("mate", square, el);
}

/** The hint arrow is the next move of the Opera game; the samples show every colour at once. */
function showShapes(): void {
  const arrows: Arrow[] = toggles.samples ? [...SAMPLE_ARROWS] : [];
  const san = toggles.hints && ply >= 0 && !editing ? OPERA[ply] : undefined;
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
    // In the editor a piece goes where it is put: the editor module tells the new position.
    if (editing) return;
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
  },
});
const picker = board.use(promotion());
const drawing = board.use(shapes({ draw: true }));
const html = board.use(overlay());
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
$("flip").onclick = () => {
  board.set({ orientation: (orientation = orientation === "white" ? "black" : "white") });
  fillSpares();
};
toggle("versus", show);
toggle("hints", showShapes, true);
toggle("samples", showShapes);

/** ← → step through the game, ↑ or Home goes to the start, ↓ or End to the end. Keys used by a slider or by the board's own keyboard cursor are left alone. */
const KEYS: Record<string, () => void> = {
  ArrowRight: () => goTo(ply < 0 ? 1 : ply + 1),
  ArrowLeft: () => goTo(ply < 0 ? 0 : ply - 1),
  ArrowUp: () => goTo(0),
  Home: () => goTo(0),
  ArrowDown: () => goTo(OPERA.length),
  End: () => goTo(OPERA.length),
  f: () => $("flip").click(),
};
document.addEventListener("keydown", (e) => {
  const step = KEYS[e.key];
  if (!step || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest("input, textarea, select")) return;
  e.preventDefault();
  step();
});

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
toggle("layers", (on) => $("page").classList.toggle("own-layers", on));

// ── the position editor ────────────────────────────────────────────────
// The board's part is the editor module. The palette (two rows: the hand, six
// pieces of one colour, the bin) is this page's own, as it is any app's.

const HAND_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M14 11V6a1.5 1.5 0 0 1 3 0v6"/><path d="M17 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.6a6 6 0 0 1-4.9-2.5L4.4 14a1.6 1.6 0 0 1 2.5-2L8 13"/></svg>`;
const BIN_ICON = `<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.2 9h15.6"/><path d="M11 9V7.4a1.4 1.4 0 0 1 1.4-1.4h3.2A1.4 1.4 0 0 1 17 7.4V9"/><path d="M8.1 9l.9 12.2a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8L19.9 9"/><path d="M12.2 12.6v6.6M15.8 12.6v6.6"/></svg>`;
const PIECE_NAMES: Record<string, string> = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };

/** The editor module while the editor is on, and the placement it last told. */
let editing: Editor | null = null;
let edited = "";

function showTool(): void {
  const tool = editing?.tool();
  for (const el of document.querySelectorAll<HTMLElement>(".spare")) el.setAttribute("aria-pressed", String(el.dataset.tool === tool));
  $("placement").textContent = `onChange("${edited}")`;
}

/** The far side's pieces above the board, the near side's below, whichever way the board is turned. */
function fillSpares(): void {
  const near = orientation === "white" ? "w" : "b";
  for (const [id, colour] of [["spares-top", near === "w" ? "b" : "w"], ["spares-bottom", near]]) {
    const side = colour === "w" ? "White" : "Black";
    const pieces = [..."kqrbnp"].map((kind) => `<button class="spare" data-tool="${colour}${kind}" data-piece aria-label="${side} ${PIECE_NAMES[kind]}"><i style="background-image:var(--ls-${colour}${kind})"></i></button>`);
    $(id).setAttribute("aria-label", `Tools and ${side.toLowerCase()} pieces`);
    $(id).innerHTML = `<button class="spare" data-tool="move" aria-label="Move pieces">${HAND_ICON}</button>${pieces.join("")}<button class="spare" data-tool="erase" aria-label="Remove pieces">${BIN_ICON}</button>`;
  }
  showTool();
}

/** A press on a spare piece that then travels carries a new piece onto the board; one that stays put takes the piece in hand. */
function carryFrom(down: PointerEvent): void {
  const piece = (down.target as HTMLElement).closest<HTMLElement>(".spare[data-piece]")?.dataset.tool as PieceCode | undefined;
  if (!piece || down.button > 0) return;
  const moved = (e: PointerEvent): void => {
    if (e.pointerId !== down.pointerId || Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < 5) return;
    done();
    editing?.drag(piece, e);
  };
  const done = (): void => {
    for (const name of ["pointermove", "pointerup", "pointercancel"] as const) removeEventListener(name, name === "pointermove" ? moved : done);
  };
  for (const name of ["pointermove", "pointerup", "pointercancel"] as const) addEventListener(name, name === "pointermove" ? moved : done);
}

for (const id of ["spares-top", "spares-bottom"]) {
  $(id).addEventListener("pointerdown", carryFrom);
  $(id).addEventListener("click", (e) => {
    const tool = (e.target as HTMLElement).closest<HTMLElement>(".spare")?.dataset.tool as EditorTool | undefined;
    if (!tool || !editing) return;
    editing.pick(tool);
    showTool();
  });
}

function showEditor(on: boolean): void {
  $("editor").setAttribute("aria-pressed", String(on));
  for (const id of ["spares-top", "spares-bottom", "placement"]) $(id).hidden = !on;
  $(".board-side").classList.toggle("editing", on);
}

function startEditing(): void {
  for (const id of ["play", "versus"]) if (toggles[id]) $(id).click();
  clearTimeout(replyTimer);
  edited = chess.fen().split(" ")[0];
  editing = board.use(
    editor({
      onChange(next, how) {
        edited = next;
        // A piece moved with the hand is not a move of a game: no last move is marked.
        board.set({ position: next, lastMove: null }, how);
        showTool();
      },
    }),
  );
  board.set({ movable: "both", targets: null, premovable: "none", premoveTargets: null, premove: null, lastMove: null, check: null, marks: [] });
  showMate(undefined);
  showShapes();
  $("editor-note").textContent = "";
  showEditor(true);
  showTool();
  // On a phone the button is under the board: bring the board and its palette back into sight.
  $(".frame").scrollIntoView({ block: "nearest" });
}

/** The board is a board to play on again. The module cannot be taken off a board, only switched off for good: `destroy` does that. */
function leaveEditor(): void {
  editing?.destroy?.();
  editing = null;
  showEditor(false);
}

/** The editor is switched off: White plays on from the position that was made, if chess can be played from it. */
function playEdited(): void {
  leaveEditor();
  try {
    if (new Chess(`${edited} b - - 0 1`).inCheck()) throw new Error("Black is in check and it is White's move");
    chess = new Chess(`${edited} w - - 0 1`);
    ply = -1;
  } catch {
    $("editor-note").textContent = "That position cannot be played: it needs one king each, no pawn on the first or last rank, and a black king that is not in check. The game is back as it was.";
  }
  show();
}

$("editor").onclick = () => (editing ? playEdited() : startEditing());
fillSpares();

// ── the race ───────────────────────────────────────────────────────────
// The same slide twice: by Lightsquare (one write, then the browser moves the
// rook) and by script (a new place every frame). Half a second in, the script
// is stopped. The left lane is a whole Lightsquare board of which the first
// rank shows.

const RACE = { slideMs: 2400, stopAfterMs: 500, stopMs: 1500, from: "8/8/8/8/8/8/8/R7", to: "8/8/8/8/8/8/8/7R" };
const lane = lightsquare($("race-board"), { position: RACE.from, coordinates: false });

function race(): void {
  const go = $("race-go") as HTMLButtonElement;
  const rook = $("race-piece");
  go.disabled = true;
  lane.set({ position: RACE.from }, { animate: false });
  rook.style.transform = "";
  // Both rooks stand at the start for a frame; then they are sent off in the same task.
  requestAnimationFrame(() =>
    requestAnimationFrame((began) => {
      lane.set({ position: RACE.to });
      let last = began;
      let longest = 0;
      const step = (now: number): void => {
        longest = Math.max(longest, now - last);
        last = now;
        const done = Math.min(1, (now - began) / RACE.slideMs);
        rook.style.transform = `translateX(${done * 700}%)`;
        if (done < 1) return void requestAnimationFrame(step);
        go.disabled = false;
        const still = matchMedia("(prefers-reduced-motion: reduce)").matches ? " This device asks for less motion, so Lightsquare shows the move without a slide." : "";
        $("race-note").textContent = `The script stood still for ${Math.round(longest)} ms. The rook on the right waited for it and then jumped. The rook on the left needs no script once it is under way.${still}`;
      };
      requestAnimationFrame(step);
      setTimeout(() => {
        const until = performance.now() + RACE.stopMs;
        while (performance.now() < until);
      }, RACE.stopAfterMs);
    }),
  );
}
$("race-go").onclick = race;

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
  /** How often the halo under a king in check breathes: "3" times, or "infinite". */
  checkLoops: string;
  /** The board's size, as a share of the largest that fits: 0.4 to 1. */
  boardScale: number;
  /** How strong the glow under a king in check or mated is, in percent. */
  glow: number;
  arrowColours: Record<string, string>;
  circleColours: Record<string, string>;
}

// The number goes up when a saved look must not outlive a change of the page (4: Kibitzo became the first piece set).
const LOOK_KEY = "lightsquare-playground-look-4";
const plainColours = (): Record<string, string> => Object.fromEntries(SHAPE_NAMES.map(([name, , colour]) => [name, colour]));
const look: Look = { board: "wood", pieces: "kibitzo", labels: "on", pieceSize: 100, moveMs: 180, arrowWidth: 20, arrowHead: 82, badge: "auto", checkLoops: "3", boardScale: 1, glow: 82, arrowColours: plainColours(), circleColours: plainColours() };

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
  const lastTo = chess.history({ verbose: true }).at(-1)?.to;
  board.set({ coordinates: look.labels === "on", marks: badges(lastTo) });
  showMate(lastTo);
  $("page").style.setProperty("--check-loops", look.checkLoops);
  $("page").style.setProperty("--glow", String(look.glow / 100));
  const width = look.arrowWidth / 100;
  drawing.set({ look: { width, headWidth: width * 2.7, headLength: width * 2.3 } });
  $("theme").textContent = `applyTheme(element, ${JSON.stringify(theme, null, 1).replace(/\n\s*/g, " ")})`;
  for (const el of document.querySelectorAll<HTMLElement>("[data-look]")) el.setAttribute("aria-pressed", String(String(look[el.dataset.look as keyof Look]) === el.dataset.value));
  for (const id of ["pieceSize", "moveMs", "arrowWidth", "arrowHead", "glow"] as const) {
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

/** The piece sets of this page. Kibitzo is our own (CC BY 4.0, piece-sets/NOTICE.md); Cburnett is Colin M.L. Burnett's (BSD). Both are in the package. */
const PIECE_SETS: Record<string, string> = { kibitzo: "Kibitzo", cburnett: "Cburnett" };

/** True on a static host (the published demo): nothing there can take what a phone reports. */
let onStaticHost = false;

/** The saved look, or the defaults. */
function restoreLook(): void {
  try {
    Object.assign(look, JSON.parse(localStorage.getItem(LOOK_KEY) ?? "{}"));
  } catch {
    /* a broken saved look is ignored */
  }
  if (!(look.board in themes)) look.board = "wood";
  if (!(look.pieces in PIECE_SETS)) look.pieces = "kibitzo";
}

async function buildLooks(): Promise<void> {
  // The look goes on before the first wait: until then the page showed the stylesheet's default pieces and squares
  // (Cburnett, the plain colours) for the frames the settings file took to arrive.
  restoreLook();
  boardScale(look.boardScale);
  applyLook();
  const config = (await fetch("config.json").then((r) => r.json()).catch(() => ({}))) as { static?: boolean };
  onStaticHost = !!config.static;
  if (onStaticHost) for (const el of document.querySelectorAll("[data-needs-server]")) el.remove();
  for (const [name, t] of Object.entries(themes)) choice("boards", "board", name, `<i style="background:linear-gradient(135deg, ${t.light} 50%, ${t.dark} 50%)"></i>`, "swatch");
  choice("checks", "checkLoops", "3", "Settles", "");
  choice("checks", "checkLoops", "infinite", "Forever", "");
  choice("badges", "badge", "auto", "Auto", "");
  choice("badges", "badge", "all", "All", "");
  for (const kind of BADGE_KINDS) choice("badges", "badge", kind, `<i class="q-${kind}"></i>`, "pick");
  choice("labels", "labels", "on", "On", "");
  choice("labels", "labels", "off", "Off", "");
  for (const [set, name] of Object.entries(PIECE_SETS)) choice("sets", "pieces", set, name, "");
  for (const id of ["pieceSize", "moveMs", "arrowWidth", "arrowHead", "glow"] as const) {
    $(id).oninput = () => {
      look[id] = Number(($(id) as HTMLInputElement).value);
      applyLook();
    };
  }
  wireResize();
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

// ── the board's size ───────────────────────────────────────────────────

/** The dimension line under the board follows its width as it changes. */
new ResizeObserver(() => ($("where").textContent = `${Math.round(host.getBoundingClientRect().width)} px · ${devicePixelRatio}x`)).observe(host);

/** The grip at the board's corner: drag to make the board smaller or larger, double-click for full size, arrow keys step 5%. */
function boardScale(scale: number): void {
  look.boardScale = Math.round(Math.min(1, Math.max(0.4, scale)) * 100) / 100;
  ($(".board-side") as HTMLElement).style.setProperty("--board-scale", String(look.boardScale));
  $("resize").setAttribute("aria-valuenow", String(Math.round(look.boardScale * 100)));
  localStorage.setItem(LOOK_KEY, JSON.stringify(look));
}

function wireResize(): void {
  const grip = $("resize");
  let pull: { x: number; y: number; start: number; full: number } | null = null;
  grip.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const width = grip.parentElement!.getBoundingClientRect().width;
    pull = { x: e.clientX, y: e.clientY, start: width, full: width / look.boardScale };
  });
  grip.addEventListener("pointermove", (e) => {
    if (!pull) return;
    // A corner is pulled along both axes: take the mean of the two.
    boardScale((pull.start + (e.clientX - pull.x + (e.clientY - pull.y)) / 2) / pull.full);
  });
  for (const end of ["pointerup", "pointercancel", "lostpointercapture"]) grip.addEventListener(end, () => (pull = null));
  grip.addEventListener("dblclick", () => boardScale(1));
  grip.addEventListener("keydown", (e) => {
    const step = e.key === "ArrowUp" || e.key === "ArrowRight" ? 0.05 : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -0.05 : 0;
    if (!step) return;
    e.preventDefault();
    boardScale(look.boardScale + step);
  });
}

// ── measuring ──────────────────────────────────────────────────────────

/** A round of measuring starts clean: when "Measure" is switched on, and after each verdict. */
function newRound(): void {
  for (const list of Object.values(samples)) list.length = 0;
  counts.moves = 0;
  counts.presses = 0;
  lastFrame = 0;
}

let lastFrame = 0;
toggle("measure", (on) => {
  newRound();
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
    ownLayers: toggles.layers,
    measuring: toggles.measure,
    board: Math.round(host.getBoundingClientRect().width),
    dpr: devicePixelRatio,
    screen: `${screen.width}x${screen.height}`,
    look,
    ua: navigator.userAgent,
  };
}

function send(kind: string): void {
  if (onStaticHost) return;
  const body = JSON.stringify({ kind, ...summary() });
  newRound();
  void fetch("log", { method: "POST", body, keepalive: true })
    .then(() => ($("sent").textContent = `Sent "${kind}" at ${new Date().toLocaleTimeString()}.`))
    .catch(() => ($("sent").textContent = "Could not reach the computer that serves this page."));
}

setInterval(() => {
  const s = summary();
  $("s-fps").textContent = s.fps === null ? "–" : String(s.fps);
  $("s-gap").textContent = s.fps === null ? "–" : String(s.worstGap);
  $("s-set").textContent = counts.moves > 1 ? String(s.setMedian) : "–";
  $("s-input").textContent = samples.input.length ? String(s.inputMedian) : "–";
  for (const list of Object.values(samples)) if (list.length > 600) list.splice(0, list.length - 600);
}, 1000);

// ── the comparison ─────────────────────────────────────────────────────

/** The comparison, as the benchmark wrote it (compare/results.json): every row with its printed cells. This page only shows it. */
interface Comparison {
  date: string;
  browser: string;
  machine: string;
  slideMs: number;
  runs: number;
  boards: Record<string, { name: string; version: string; licence: string }>;
  table: Array<{ group: string } | { label: string; note: string; cells: Array<{ text: string; best: boolean }> }>;
}

async function showComparison(): Promise<void> {
  const results = (await fetch("results.json").then((r) => (r.ok ? r.json() : null)).catch(() => null)) as Comparison | null;
  if (!results?.table?.length) return;
  const boards = Object.values(results.boards);
  const head = `<thead><tr><th></th>${boards.map((b, i) => `<th${i === 0 ? ' class="us"' : ""}>${b.name}<br>${b.version} · ${b.licence}</th>`).join("")}</tr></thead>`;
  const body = results.table
    .map((row) => {
      if ("group" in row) return `<tr class="group"><td colspan="${boards.length + 1}">${row.group}</td></tr>`;
      return `<tr><td>${row.label}${row.note ? `<small>${row.note}</small>` : ""}</td>${row.cells.map((c) => `<td${c.best ? ' class="best"' : ""}>${c.text}</td>`).join("")}</tr>`;
    })
    .join("");
  $("bench").innerHTML = `${head}<tbody>${body}</tbody>`;
  $("bench-note").textContent = `Measured ${results.date} in ${results.browser}, on a ${results.machine}. Every board had the same 400 pixel box, the same game and a ${results.slideMs} ms slide; each number is the middle one of ${results.runs} runs. The best in each row is marked. This is a desktop computer, not a phone: the frozen-script rows stand in for a phone that holds the script back, and are not a measurement of one.`;
}

$("smooth").onclick = () => send("feels smooth");
$("rough").onclick = () => send("not smooth");
addEventListener("pagehide", () => send("leaving"));

void showComparison();
// The page says when it is fully built: its tests wait for this.
const built = buildLooks();
show();
void built.then(() => ((window as unknown as { ready: boolean }).ready = true));
