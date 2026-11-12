import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { themeVariables, themes } from "../../src/modules/theme";

const css = readFileSync(fileURLToPath(new URL("../../src/lightsquare.css", import.meta.url)), "utf8");

describe("themes", () => {
  it("turns a theme into CSS variables", () => {
    expect(themeVariables({ light: "#fff", dark: "#000", lastMove: "yellow", pieceSize: 0.9, moveMs: 120, arrowTail: 0.2, arrowHead: 1, shapes: { default: "orange", red: "crimson", mine: "#0ff" }, circles: { default: "teal", red: "pink" } })).toEqual({
      "--ls-light": "#fff",
      "--ls-dark": "#000",
      "--ls-last": "yellow",
      "--ls-piece-size": "90%",
      "--ls-move-ms": "120ms",
      "--ls-tail-opacity": "0.2",
      "--ls-head-opacity": "1",
      "--ls-shape": "orange",
      "--ls-shape-red": "crimson",
      "--ls-shape-mine": "#0ff",
      "--ls-circle": "teal",
      "--ls-circle-red": "pink",
    });
  });

  it("leaves out what the theme does not say, the piece set included (that is a class)", () => {
    expect(themeVariables({})).toEqual({});
    expect(themeVariables({ pieces: "cburnett", moveMs: 0 })).toEqual({ "--ls-move-ms": "0ms" });
  });

  it("every variable a theme can set is read by the stylesheet or the shapes module", () => {
    const all = themeVariables({ light: "a", dark: "a", boardImage: "a", lastMove: "a", selected: "a", selectedEdge: "a", check: "a", premove: "a", target: "a", hover: "a", pieceSize: 1, moveMs: 1, arrowTail: 1, arrowHead: 1 });
    for (const name of Object.keys(all)) expect(css, name).toContain(`var(${name}`);
    const shapes = readFileSync(fileURLToPath(new URL("../../src/modules/shapes.ts", import.meta.url)), "utf8");
    expect(shapes).toContain("var(--ls-shape,");
    expect(shapes).toContain("var(--ls-shape-${name},");
    expect(shapes).toContain("var(--ls-circle${name ? `-${name}` : \"\"},");
  });

  it("the wood theme is exactly what a board looks like with no theme", () => {
    expect(css).toContain(`var(--ls-light, ${themes.wood.light})`);
    expect(css).toContain(`var(--ls-dark, ${themes.wood.dark})`);
  });

  it("every built-in theme has two different square colours", () => {
    for (const [name, theme] of Object.entries(themes)) {
      expect(theme.light, name).toMatch(/^#[0-9a-f]{6}$/);
      expect(theme.dark, name).toMatch(/^#[0-9a-f]{6}$/);
      expect(theme.light).not.toBe(theme.dark);
    }
  });
});
