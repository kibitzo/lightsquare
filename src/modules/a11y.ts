/**
 * For screen readers and keyboards.
 *
 *   board.use(a11y({ label: "Puzzle board" }));
 *
 * - The board gets a name and a description that lists every piece.
 * - Each move is announced ("White knight, g1 to f3").
 * - For someone who reaches the board by keyboard (Tab), the arrow keys
 *   move a cursor, Enter or Space presses the square under it (select,
 *   then move), Escape unselects. After a press with a mouse or a finger
 *   the keys are left to the page.
 *
 * All words can be replaced for other languages.
 */
import type { Module, ModuleHooks, Placed, Square } from "../index.js";

export interface A11yWords {
  board: string;
  white: string;
  black: string;
  k: string;
  q: string;
  r: string;
  b: string;
  n: string;
  p: string;
  to: string;
  takes: string;
  empty: string;
  selected: string;
}

export interface A11yOptions {
  /** The board's name. Default "Chess board". */
  label?: string;
  words?: Partial<A11yWords>;
  /** Arrow keys, Enter, Space and Escape. Default true. */
  keyboard?: boolean;
}

export interface A11y extends ModuleHooks {
  /** The text a screen reader gets for the position. */
  description(): string;
}

const WORDS: A11yWords = { board: "Chess board", white: "White", black: "Black", k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn", to: "to", takes: "takes", empty: "empty", selected: "selected" };
const ORDER = "kqrbnp";
const STEPS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
let nextId = 0;

function hidden(host: HTMLElement, live: boolean): HTMLElement {
  const el = host.appendChild(document.createElement("div"));
  el.className = "ls-sr";
  if (live) el.setAttribute("aria-live", "polite");
  return el;
}

export function a11y(options: A11yOptions = {}): Module<A11y> {
  return (surface) => {
    const words = { ...WORDS, ...options.words };
    const host = surface.host;
    const text = hidden(host, false);
    const live = hidden(host, true);
    text.id = `ls-description-${++nextId}`;
    const before = { tabindex: host.getAttribute("tabindex"), role: host.getAttribute("role") };
    host.setAttribute("role", "group");
    host.setAttribute("aria-label", options.label ?? words.board);
    host.setAttribute("aria-describedby", text.id);
    let cursor: Square | null = null;
    let cursorEl: HTMLElement | null = null;
    let shown = "";
    let lastMove = surface.lastMove();
    let count = surface.pieces().length;

    const side = (p: Placed): string => (p.code[0] === "w" ? words.white : words.black);
    const piece = (p: Placed): string => `${side(p)} ${words[p.code[1] as "k"]}`;

    function description(): string {
      const list = (colour: string): string =>
        surface.pieces().filter((p) => p.code[0] === colour).sort((a, b) => ORDER.indexOf(a.code[1]) - ORDER.indexOf(b.code[1]) || a.square.localeCompare(b.square)).map((p) => `${words[p.code[1] as "k"]} ${p.square}`).join(", ");
      return `${words.white}: ${list("w") || words.empty}. ${words.black}: ${list("b") || words.empty}.`;
    }

    function moveCursor(to: Square): void {
      cursor = to;
      if (!cursorEl) {
        cursorEl = host.appendChild(document.createElement("div"));
        cursorEl.className = "ls-cursor";
      }
      cursorEl.style.transform = surface.spot(to);
      const on = surface.pieces().find((p) => p.square === to);
      live.textContent = `${to}, ${on ? piece(on) : words.empty}${surface.selected() === to ? `, ${words.selected}` : ""}`;
    }

    /**
     * The keys belong to the board only for someone who came to it by
     * keyboard. After a press with a mouse or a finger they are left to the
     * page (an app's own arrow keys step through the moves), until the focus
     * goes to something else on the page and comes back. When the whole
     * window loses focus the board is still the page's active element, and
     * nothing changes: coming back to the window is not coming to the board
     * by keyboard.
     */
    let byKeyboard = true;
    function onPress(): void {
      byKeyboard = false;
      cursor = null;
      cursorEl?.remove();
      cursorEl = null;
    }
    const onBlur = (): void => {
      if (document.activeElement !== host) byKeyboard = true;
    };

    function onKey(e: KeyboardEvent): void {
      if (!byKeyboard) return;
      const step = STEPS[e.key];
      if (step) {
        const [col, row] = cursor ? surface.cell(cursor) : [4 - step[0], 6 - step[1]];
        const to = surface.square(col + step[0], row + step[1]);
        if (to) moveCursor(to);
      } else if ((e.key === "Enter" || e.key === " ") && cursor) surface.tap(cursor);
      else if (e.key === "Escape" && surface.selected()) surface.tap(surface.selected()!);
      else return;
      e.preventDefault();
    }

    if (options.keyboard !== false) {
      host.tabIndex = 0;
      host.addEventListener("keydown", onKey);
      host.addEventListener("pointerdown", onPress);
      host.addEventListener("blur", onBlur);
    }

    return {
      description,
      update() {
        const now = description();
        if (now !== shown) text.textContent = shown = now;
        const move = surface.lastMove();
        const pieces = surface.pieces();
        if (move && move !== lastMove && (move[0] !== lastMove?.[0] || move[1] !== lastMove?.[1])) {
          const mover = pieces.find((p) => p.square === move[1]);
          if (mover) live.textContent = `${piece(mover)}, ${move[0]} ${pieces.length < count ? words.takes : words.to} ${move[1]}`;
        }
        lastMove = move;
        count = pieces.length;
        if (cursor && cursorEl) cursorEl.style.transform = surface.spot(cursor);
      },
      destroy() {
        host.removeEventListener("keydown", onKey);
        host.removeEventListener("pointerdown", onPress);
        host.removeEventListener("blur", onBlur);
        text.remove();
        live.remove();
        cursorEl?.remove();
        host.removeAttribute("aria-label");
        host.removeAttribute("aria-describedby");
        for (const [name, value] of Object.entries(before)) value === null ? host.removeAttribute(name) : host.setAttribute(name, value);
      },
    };
  };
}
