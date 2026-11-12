# Lightsquare: API

Everything the library offers, in one page. The reasons behind it are in
[ARCHITECTURE.md](../ARCHITECTURE.md).

## Start

```ts
import { lightsquare } from "lightsquare";
import "lightsquare/lightsquare.css";
import "lightsquare/pieces/cburnett.css";

const board = lightsquare(document.getElementById("board")!, { movable: "white" });
```

The element becomes the board. It takes the width of its container and is
square, at any size. Give the container a width.

Lightsquare knows no chess rules. Your app (with a library such as chess.js)
says which moves are allowed and what the position is after a move.

## Options

All are optional, at creation and in `board.set()`.

| Option | Type | Default | What |
|---|---|---|---|
| `position` | FEN, `"start"`, `"empty"` | `"start"` | Only the placement field of a FEN is read. |
| `orientation` | `"white"` \| `"black"` | `"white"` | The side at the bottom. |
| `movable` | `"white"` \| `"black"` \| `"both"` \| `"none"` | `"none"` | Whose pieces the user may move now. `"none"` is a board to look at; the page scrolls under the finger. |
| `targets` | `Map<Square, Square[]>` \| `null` | `null` | Where each piece may go. `null` allows any square. Shown as dots when a piece is selected. |
| `lastMove` | `[Square, Square]` \| `null` | `null` | Two squares to tint. Set by the board after a move of the user. |
| `check` | `Square` \| `null` | `null` | The square of a king in check. |
| `marks` | `{ square, name, above? }[]` \| `null` | `null` | Your own marks: see below. |
| `coordinates` | `boolean` | `true` | File letters and rank numbers on the edge squares. |
| `premovable` | `"white"` \| `"black"` \| `"none"` | `"none"` | Whose pieces may be moved ahead of their turn. |
| `premoveTargets` | `Map<Square, Square[]>` \| `null` | `null` | Limits for premoves. See the `premove` module. |
| `premove` | `[Square, Square]` \| `null` | | The premove in waiting. Set `null` to drop it. |
| `onMove` | `({ from, to, piece, captured? }) => void` | | The user moved a piece. |
| `onSelect` | `(square \| null) => void` | | The selection changed. |
| `onPremove` | `([from, to] \| null) => void` | | The user set or cancelled a premove. |
| `onTap` | `(square) => void` | | A press and release on one square, on any board. |

## The board

| Call | What |
|---|---|
| `board.set(options, { animate? })` | Change anything. One call is one write pass. Pieces slide unless `animate` is false. Setting what is already shown touches nothing. |
| `board.move(from, to)` | Slide one piece, taking what stands on the target. No event. |
| `board.select(square \| null)` | Select or unselect. |
| `board.position()` | The placement on show, as the first field of a FEN. |
| `board.playPremove()` | Play the premove in waiting, if `movable` and `targets` allow it. Returns whether it was played. |
| `board.use(module)` | Add a module. Returns the module's own API. |
| `board.destroy()` | Remove everything the board added. |

## A move of the user

The board shows the move at once and calls `onMove`. Answer with the true
position, or with the old one to take the move back:

```ts
onMove({ from, to }) {
  const move = chess.move({ from, to });          // your rules
  board.set({ position: chess.fen(), targets: targetsOf(chess), check: kingInCheck(chess) });
}
```

A castling rook slides, a pawn taken en passant fades, a promoted pawn turns
into its new piece: the board works these out from the two positions.

## Premove

```ts
import { premoveTargets } from "lightsquare/premove";

// while the opponent thinks
board.set({ movable: "none", premovable: "white", premoveTargets: premoveTargets(fen, "white") });

// when the opponent has moved
board.set({ position: fen, movable: "white", premovable: "none", targets });
board.playPremove();       // plays it through onMove if it is allowed now
```

A premove does not move the piece: its two squares are marked until it is
played or the user cancels it with a press on the board.
`premoveTargets` is geometry only (where a piece could go if nothing stood in
its way); it does not know about check or pins.

## Your own marks and badges

```ts
board.set({ marks: [
  { square: "e4", name: "hint" },                    // under the pieces
  { square: "e4", name: "brilliant", above: true },  // over the pieces
] });
```

The board places an element with the class `ls-mark-hint` (or
`ls-mark-brilliant`) on the square, the size of the square, in the same write
as the move. A mark over the pieces that is on the top row or the right
column of the screen also gets `ls-at-top` or `ls-at-right`, so a badge that
hangs over its square's corner can stay inside the board there. Your
stylesheet draws it:

```css
.ls-mark-hint { background: rgba(16, 185, 129, 0.28); }
.ls-mark-brilliant::after {
  content: "!!"; position: absolute; top: -16%; right: -16%; width: 46%; height: 46%;
  border-radius: 50%; display: grid; place-items: center; background: #14b8a6; color: #fff;
}
```

## Modules

Each is a separate import. A page that does not import a module does not
download it.

### Arrows and circles: `lightsquare/shapes`

```ts
import { shapes } from "lightsquare/shapes";

const drawing = board.use(shapes({
  arrows: [{ from: "e2", to: "e4" }, { from: "g8", to: "f6", name: "red", label: "1" }],
  circles: [{ square: "d5", name: "green" }],
  draw: true,                     // right-drag draws an arrow, right-click a circle
  onDraw(drawn) {},               // the user's drawing changed
}));
drawing.set({ arrows: [] });      // replace what the app shows
drawing.drawing();                // what the user drew
drawing.clear();
```

`name` picks the colour. Built in: the default (orange), `red`, `green`,
`blue`, `yellow`. Change one, or add your own name, with a variable:
`--ls-shape-red: crimson`, `--ls-shape-mine: #7c3aed` (see Looks). Each shape
also carries the class `ls-arrow-<name>` or `ls-circle-<name>`.

A label is set into the arrow's head, which grows a little to hold it:
upright, light, with a rim in a deeper tone of the arrow's colour
(`--ls-label-text`, `--ls-label-rim`).

An arrow runs from the centre of its first square to the centre of its
last one, where its point stops. Its colour grows from faint at the tail, so
the piece there stays readable, to strong at the head (`--ls-tail-opacity`,
`--ls-head-opacity`). It grows out of its tail as it appears.

What the user draws is green; Alt gives blue and Shift yellow, so the user's
arrows never look like the app's orange and red ones. Change this with
`nameFor`. An arrow is slim while it is aimed and fills out when the button
is let go. A left press on the board clears the user's drawing.

### Promotion picker: `lightsquare/promotion`

```ts
import { promotion } from "lightsquare/promotion";

const picker = board.use(promotion());
const piece = await picker.ask("e8", "white");   // "q" | "r" | "b" | "n", or null if cancelled
```

### HTML on a square: `lightsquare/overlay`

```ts
import { overlay } from "lightsquare/overlay";

const html = board.use(overlay());
html.put("tip", "e4", element);    // the same key again moves or replaces it
html.remove("tip");
```

### Screen readers and keyboard: `lightsquare/a11y`

```ts
import { a11y } from "lightsquare/a11y";

board.use(a11y({ label: "Puzzle board", words: { white: "Blanc" } }));
```

Names the board, lists every piece for screen readers, announces each move,
and lets a keyboard user move: arrow keys, Enter or Space, Escape.

### React: `lightsquare/react`

```tsx
import { Lightsquare } from "lightsquare/react";

<Lightsquare position={fen} movable="white" targets={targets} onMove={play} ref={boardRef} className="w-full" />
```

The props are the options above. A prop that is left out means its default.
The ref gives the board (`move`, `playPremove`, `use`, ...).

## Looks

Looks are CSS variables and one class. Set them on the board, on a wrapper,
or on the page's root: every board below follows, and the nearest setting
wins. Nothing here costs script per board.

### Themes: `lightsquare/theme`

```ts
import { applyTheme, themes, themeVariables } from "lightsquare/theme";

applyTheme(document.documentElement, {
  ...themes.ocean,                   // wood, sand, forest, ocean, slate, rose, night
  pieces: "cburnett",                // a loaded piece set
  pieceSize: 0.92,                   // share of the square
  moveMs: 150,                       // slide time
  lastMove: "rgba(255, 235, 0, 0.5)",
  shapes: { default: "#ea580c", red: "#b91c1c", mine: "#7c3aed" },
  arrowTail: 0.14, arrowHead: 0.82,  // how strong an arrow is at each end
});
```

A theme is a plain object, so an app can store one per user. Applying the
next theme replaces the one before; `applyTheme(element, {})` takes it
away. `themeVariables(theme)` returns the variables for an inline style
(React's `style`, a server-rendered page).

| Theme key | Variable | Default |
|---|---|---|
| `light`, `dark` | `--ls-light`, `--ls-dark` | `#ecdab9`, `#c5a076` |
| `boardImage` | `--ls-board-image` | none. A CSS image under the squares; with a picture of a whole board, set `dark: "transparent"`. |
| `lastMove`, `check`, `premove` | `--ls-last`, `--ls-check`, `--ls-premove` | the built-in marks |
| `selected`, `selectedEdge` | `--ls-select`, `--ls-select-edge` | the selected square: a soft amber tint inside an amber frame |
| `target`, `hover` | `--ls-target`, `--ls-hover` | move dots; the square under a dragged piece |
| `pieces` | the class `ls-set-<name>` | the page's default set |
| `pieceSize` | `--ls-piece-size` | `100%` |
| `moveMs` | `--ls-move-ms` | `180ms` (`0ms` under "reduce motion") |
| `shapes.default`, `shapes.<name>` | `--ls-shape`, `--ls-shape-<name>` | arrows and circles: orange; deep red, green, blue, yellow |
| `circles.default`, `circles.<name>` | `--ls-circle`, `--ls-circle-<name>` | circles only, where they should differ from the arrows |
| `arrowTail`, `arrowHead` | `--ls-tail-opacity`, `--ls-head-opacity` | `0.14`, `0.82` |

Also: `--ls-ease` (the slide's curve) and `--ls-circle-stroke` (how thick a
circle's line is, in squares, default `0.05`).

Coordinates are small and quiet: over the pieces, in the colour of the
other squares a touch deeper, growing with the board (about 10 px on a
phone, 12 px at most). Change them with `--ls-coord-font`,
`--ls-coord-size`, `--ls-coord-weight`, `--ls-coord-on-light` and
`--ls-coord-on-dark`.

The board is a CSS container named `lightsquare`, so your own styles can
follow its size, whatever the window's:

```css
@container lightsquare (max-width: 460px) { .ls-mark-brilliant::after { width: 46%; } }
```

### Piece sets

A piece set is twelve variables, `--ls-wk` to `--ls-bp`, each a CSS image,
on the class `ls-set-<name>`:

```css
.ls-set-mine { --ls-wk: url(/pieces/wk.svg); /* ... */ --ls-bp: url(/pieces/bp.svg); }
```

`lightsquare/pieces/cburnett.css` is such a set and also the page's default.
`node scripts/sprite-to-css.mjs sprite.svg pieces.css mine` makes a set from
a cm-chessboard sprite. The same variables work outside the board:
`background-image: var(--ls-wq)` shows the user's queen anywhere in the app.

### Arrow shape

```ts
drawing.set({ look: { width: 0.2, headLength: 0.46, headWidth: 0.54 } });   // in squares
```

## Write a module

```ts
import type { Module, ModuleHooks } from "lightsquare";

export function ruler(): Module<ModuleHooks & { hello(): string }> {
  return (surface) => ({
    hello: () => `e4 is at ${surface.cell("e4")}`,
    update() {},     // after every change of the board
    destroy() {},
  });
}
```

`surface` gives the board element, the orientation, square and screen maths,
the pieces, the last move, the selection, and `tap(square)`. A module obeys
[RULES.md](../RULES.md) like the core.
