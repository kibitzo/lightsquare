/**
 * Looks, as data. A theme is a plain object: an app can keep one per user
 * and apply it to the page, and every board under that element follows.
 *
 *   import { applyTheme, themes } from "lightsquare/theme";
 *   applyTheme(document.documentElement, { ...themes.ocean, pieces: "cburnett", shapes: { default: "#7c3aed" } });
 *
 * A theme only sets CSS variables and one class, so it costs no script per
 * board, and the same variables can style the rest of the app: a tray of
 * captured pieces can use `background-image: var(--ls-wq)`.
 */

export interface Theme {
  /** The light and the dark squares: any CSS colour. */
  light?: string;
  dark?: string;
  /**
   * A picture under the squares, as a CSS image (`url(...)`). For a picture
   * of a whole board, also set `dark: "transparent"`.
   */
  boardImage?: string;
  /** The tints of the built-in marks. */
  lastMove?: string;
  /** The selected square: its tint and its frame. */
  selected?: string;
  selectedEdge?: string;
  check?: string;
  premove?: string;
  /** The keyboard cursor's corner brackets. */
  cursor?: string;
  /** Move dots and rings. */
  target?: string;
  /** The square under a dragged piece. */
  hover?: string;
  /** The piece set: the name of a loaded piece stylesheet (its class is `ls-set-<name>`). */
  pieces?: string;
  /** How much of its square a piece fills: 1 is all of it. */
  pieceSize?: number;
  /** How long a slide takes, in milliseconds. */
  moveMs?: number;
  /** Arrow and circle colours by name. `default` is the colour of an arrow with no name. */
  shapes?: Record<string, string>;
  /** Circle colours by name, where they should differ from the arrows. */
  circles?: Record<string, string>;
  /** How strong an arrow is at its tail and at its head, 0 to 1. */
  arrowTail?: number;
  arrowHead?: number;
}

const PLAIN: Array<[keyof Theme, string, (value: never) => string]> = [
  ["light", "--ls-light", String],
  ["dark", "--ls-dark", String],
  ["boardImage", "--ls-board-image", String],
  ["lastMove", "--ls-last", String],
  ["selected", "--ls-select", String],
  ["selectedEdge", "--ls-select-edge", String],
  ["cursor", "--ls-cursor", String],
  ["check", "--ls-check", String],
  ["premove", "--ls-premove", String],
  ["target", "--ls-target", String],
  ["hover", "--ls-hover", String],
  ["pieceSize", "--ls-piece-size", (v: number) => `${v * 100}%`],
  ["moveMs", "--ls-move-ms", (v: number) => `${v}ms`],
  ["arrowTail", "--ls-tail-opacity", String],
  ["arrowHead", "--ls-head-opacity", String],
];

/** The CSS variables of a theme, for an inline style (React's `style`, a server-rendered page). */
export function themeVariables(theme: Theme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, variable, format] of PLAIN) {
    const value = theme[key];
    if (value !== undefined) out[variable] = format(value as never);
  }
  for (const [name, colour] of Object.entries(theme.shapes ?? {})) out[name === "default" ? "--ls-shape" : `--ls-shape-${name}`] = colour;
  for (const [name, colour] of Object.entries(theme.circles ?? {})) out[name === "default" ? "--ls-circle" : `--ls-circle-${name}`] = colour;
  return out;
}

/**
 * Put a theme on an element: a board, a wrapper, or the page's root. What a
 * theme applied before had set and this one does not is taken away again.
 */
export function applyTheme(element: HTMLElement, theme: Theme): void {
  for (const name of [...element.style]) if (name.startsWith("--ls-")) element.style.removeProperty(name);
  for (const [name, value] of Object.entries(themeVariables(theme))) element.style.setProperty(name, value);
  for (const name of [...element.classList]) if (name.startsWith("ls-set-")) element.classList.remove(name);
  if (theme.pieces) element.classList.add(`ls-set-${theme.pieces}`);
}

/** Board colours to start from. `wood` is what a board looks like with no theme. */
export const themes = {
  wood: { light: "#ecdab9", dark: "#c5a076" },
  sand: { light: "#f2e6cf", dark: "#b89b72" },
  forest: { light: "#e6ead2", dark: "#6f8f5a" },
  ocean: { light: "#dde8f1", dark: "#6a8fb5" },
  slate: { light: "#dfe3e8", dark: "#8794a6" },
  rose: { light: "#f4e3dd", dark: "#c48c82" },
  night: { light: "#8f99aa", dark: "#465064", lastMove: "rgba(250, 204, 21, 0.38)" },
} satisfies Record<string, Theme>;
