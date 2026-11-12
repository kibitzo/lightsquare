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

The element becomes the board. It takes the width of its container (rounded
down to a multiple of 8 pixels) and is square. Give the container a width.

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
as the move. Your stylesheet draws it:

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

`name` picks the colour through the class `ls-arrow-<name>` or
`ls-circle-<name>`. Built in: the default (amber), `red`, `green`, `blue`.
Add your own by setting `--ls-shape` on such a class. While drawing, Shift
gives `red`, Alt `blue`, both `green`; change this with `nameFor`. A left
press on the board clears the user's drawing.

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

Set these on the board element or any ancestor:

| Variable | Default | What |
|---|---|---|
| `--ls-light`, `--ls-dark` | `#ecdab9`, `#c5a076` | The squares. |
| `--ls-move-ms` | `180ms` | How long a slide takes. `0ms` under "reduce motion". |
| `--ls-ease` | a soft ease-out | The slide's curve. |
| `--ls-last`, `--ls-select`, `--ls-check`, `--ls-premove` | | The built-in marks. |
| `--ls-target`, `--ls-hover` | | Move dots and the square under a dragged piece. |

A piece set is a stylesheet with twelve rules, `.ls-wk` to `.ls-bp`, each a
`background-image`. `node scripts/sprite-to-css.mjs sprite.svg pieces.css`
makes one from a cm-chessboard sprite.

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
