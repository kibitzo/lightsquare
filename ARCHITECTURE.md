# Lightsquare: architecture

A chessboard that stays smooth on every phone. This document is the design.
The hard rules it must obey are in [RULES.md](RULES.md); the diagram is
[docs/architecture.html](docs/architecture.html).

Status: design, 2026-11-12. `src/position.ts` and `src/lightsquare.css` exist
as a first sketch. Nothing else is built.

## 1. Goals

1. Smooth on a weak phone and in Low Power Mode. That is the reason to exist.
2. Everything cm-chessboard offers, and everything Kibitzo built on top of it.
3. Small: a core under 6 kB gzipped, features you pay for only when you
   import them.
4. No chess rules inside. The app says which moves are allowed.
5. MIT, zero dependencies, typed.

Not goals: chess rules or engines, 3D boards, chess variants with other
board sizes, server rendering of an interactive board.

## 2. The one idea

    state  ->  reconcile  ->  a few DOM writes  ->  the browser animates

- There is one **state**: a plain object (position, orientation, selection,
  marks, shapes, what the user may move).
- Everything that changes the board produces a new state: a call from the
  app, or the user's finger.
- The **reconciler** compares the new state with what is on screen and
  writes only the differences.
- A moved piece gets one new `transform`. The CSS transition does the rest.
  No script runs while it slides.
- The app hears about what happened through **events** and decides what it
  means. Lightsquare never decides whether a move is legal.

## 3. What is on screen: six layers

Bottom to top. Each layer is one element; only the layers in use exist.

| Layer | Holds | Technique |
|---|---|---|
| surface | the 64 squares, coordinates | one CSS background; 16 text elements for coordinates |
| marks | last move, selected square, check, move dots, any custom square mark | one small element per mark, placed by transform |
| pieces | one element per piece | placed by `translate(col * 100%, row * 100%)`, moved by transition |
| shapes | arrows, circles, labels | one SVG overlay, redrawn only when shapes change |
| overlay | promotion picker, move-quality badges, any HTML the app anchors to a square | HTML placed by transform |
| drag | the piece under the finger | the piece itself, lifted; follows the pointer |

A piece is promoted to its own GPU layer (`will-change: transform`) only
while it moves or is dragged. A board at rest holds no extra layers.

## 4. Modules

The core is one import. Everything else is a separate entry point, so an app
that shows a static position downloads only the core.

| Entry point | What | Replaces in cm-chessboard |
|---|---|---|
| `lightsquare` (core) | position, pieces, marks, coordinates, orientation, tap and drag input, premove, events, plugin host | Chessboard, Markers, AutoBorderNone |
| `lightsquare/shapes` | arrows, circles, arrow labels, drawing by the user | Arrows, RightClickAnnotator |
| `lightsquare/promotion` | promotion picker | PromotionDialog |
| `lightsquare/overlay` | HTML anchored to squares | HtmlLayer |
| `lightsquare/a11y` | screen-reader description, move announcements, keyboard moves | Accessibility |
| `lightsquare/react` | React component and hook | (Kibitzo's 1,451-line wrapper) |
| later: `lightsquare/editor` | spare pieces, drag pieces on and off | (not in cm-chessboard) |

A module is a plugin: a function that receives the board and returns
`update(state, previous)` and `destroy()`. It may create its own layer. It
runs in the same update as the core, so there is one write pass per change.

## 5. The API (sketch)

```ts
import { lightsquare } from "lightsquare";
import "lightsquare/lightsquare.css";

const board = lightsquare(element, {
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
  orientation: "white",
  movable: { color: "white", dests },      // dests: Map<Square, Square[]>
  lastMove: ["e2", "e4"],
  check: "e8",
  events: {
    move(from, to, info) {},               // the user moved a piece
    select(square) {},
  },
});

board.set({ fen, lastMove });              // one call reconfigures anything
board.move("g1", "f3");                    // slide one piece
board.use(shapes({ arrows }));             // add a module
board.destroy();
```

One `set()` for everything, as in chessground: the app never has to learn an
order of calls, and a batch of changes is one update.

## 6. Input

One set of pointer listeners on the board. Pointer down measures the board
once; from then on a square is arithmetic.

    pointer events -> gesture (tap or drag) -> intent -> state -> events

- **Tap, tap** and **drag** both move. A press becomes a drag after a few
  pixels, so a tap never jitters the piece.
- During a drag the piece follows the pointer: one `transform` write per
  pointer event, no layout read.
- **Premove** is state: the reconciler shows it; the app confirms or drops it
  when the opponent has moved.
- The page does not scroll while a piece is held (`touch-action: none` on
  the board only).

## 7. Animation

- **Move:** new transform, CSS transition.
- **Capture:** the captured piece fades (opacity transition), then its
  element is removed.
- **Several pieces at once** (castling, a jump to another position, a flip):
  each piece gets its new transform in the same write; the browser runs
  them together.
- **Interrupted:** a new position during a slide just sets new transforms.
  The transition continues from where the piece is. No queue.
- **Instant:** one class on the board turns transitions off for a set-up.

Pieces are paired between positions (`pairPieces`): a piece that stays is not
touched; a moved piece keeps its element; the nearest piece of the same kind
takes each new square, which resolves castling, recaptures and en passant.

## 8. Looks

- Colours, timings and sizes are CSS variables on the board element.
- A piece set is a stylesheet with 12 rules. Changing the set is a class.
- Sizing is CSS: the board is `width: 100%; aspect-ratio: 1`, pieces are
  12.5% wide and placed in percent. A resize runs no script.

## 9. Compared

Read from the source and READMEs on 2026-11-12.

| | cm-chessboard 8.15 | chessground (Lichess) | Lightsquare (this design) |
|---|---|---|---|
| Drawn as | one SVG drawing | elements, plus SVG for shapes | elements, plus SVG for shapes |
| A piece slides by | script loop, SVG transform rewritten per frame, drawing repainted | script loop, CSS transform set per frame | one CSS transition, no script per frame |
| Positions | SVG units | pixels from the measured board; recomputed on resize | percent; nothing to recompute |
| Size, gzipped | 8.5 kB core, extensions extra | 10 kB | under 6 kB core, modules extra |
| Chess rules inside | no | no | no |
| Premove | no | yes | yes |
| User-drawn arrows | extension | yes | module |
| Promotion picker | extension | not in its feature list | module |
| Screen readers, keyboard | extension | not checked | module |
| Spare pieces, editor | no | yes | later module |
| 3D, variants | no | yes | no |
| Licence | MIT | GPL-3.0 | MIT |

Where chessground is ahead today: years of use on Lichess, variants, 3D, an
editor, freehand arrows. Lightsquare does not try to match all of that.

Where this design aims to do better, each to be proven:

1. No script per animation frame.
2. No work on resize.
3. A smaller core; features are opt-in.
4. Accessibility and promotion as first-party modules.
5. MIT.

## 10. How it stays fast

Checked by the test suite, not by promise:

- **Size:** the build fails above 6 kB gzipped for the core.
- **At rest:** a browser test records 3 seconds of an idle board and fails
  on any paint or animation frame.
- **Per move:** a test counts DOM writes for one move; more than a handful
  fails.
- **No loops:** a test fails if the core calls `requestAnimationFrame` more
  than once per update.
- **On a phone:** rule 11 of RULES.md. Numbers from a real phone in Low
  Power Mode go in the pull request.

## 11. Risks and open questions

1. **Does a CSS transition stay smooth in Low Power Mode?** Expected, not
   yet shown. The first milestone exists to answer it on a real phone,
   next to Lichess, before anything else is built.
2. **Piece images at 3x pixel density.** SVG pieces as backgrounds are
   rasterised by the browser; the proof must show this costs nothing per
   move. Fallback: pre-rendered PNG sets.
3. **Safari details:** pointer capture, the long-press menu, scroll locking
   during a drag. Each needs a test on a phone.
4. **Arrows in SVG.** Static between changes, so cheap; an arrow that
   animates would break the rules and is out.

## 12. Order of work

| Step | What | Done when |
|---|---|---|
| M0 proof | core pieces and input, on Kibitzo's puzzle board behind a switch | it feels like Lichess on the founder's phone in Low Power Mode |
| M1 core | marks, coordinates, flip, premove, events, the speed tests | the speed tests pass; cm-chessboard core parity |
| M2 modules | shapes, promotion, overlay | Kibitzo's arrows, badges and promotion work |
| M3 | a11y module, React wrapper | Kibitzo's board component runs on Lightsquare with the same props |
| M4 | Kibitzo pages one at a time: puzzles, lessons, coach, vision, play | each passes its browser tests and a phone check |
| M5 | fenshot's board; cm-chessboard removed | no import of cm-chessboard is left |
| M6 | publish 1.0: docs and demo at kibitzo.com/lightsquare, npm | after some weeks in production |

If M0 fails, the design is wrong and we stop there.
