# Lightsquare: architecture

A chessboard that stays smooth on every phone. This document is the design.
The hard rules it must obey are in [RULES.md](RULES.md); the diagram is
[docs/architecture.html](docs/architecture.html).

Status, 2026-11-12: the first milestone (M0) is built and tested in desktop
browsers: pieces, marks, tap and drag, events. It still has to pass on a real
phone in Low Power Mode (section 12). Coordinates, premove and the modules
are not built yet.

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
| over | the app's marks that sit above the pieces: move-quality badges, verdicts | one small element per mark, placed by transform |
| overlay | promotion picker, any HTML the app anchors to a square | HTML placed by transform |
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

## 5. The API

```ts
import { lightsquare } from "lightsquare";
import "lightsquare/lightsquare.css";
import "lightsquare/pieces/cburnett.css";

const board = lightsquare(element, {
  position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",  // a FEN, "start" or "empty"
  orientation: "white",
  movable: "white",                 // "white" | "black" | "both" | "none"
  targets,                          // Map<Square, Square[]>: where each piece may go
  lastMove: ["e2", "e4"],
  check: "e8",
  marks: [{ square: "e4", name: "brilliant", above: true }],   // the app's own
  onMove({ from, to, piece, captured }) {},   // the user moved a piece
  onSelect(square) {},
});

board.set({ position, lastMove });  // one call changes anything
board.move("g1", "f3");             // slide one piece
board.position();                   // the placement on show
board.destroy();
```

- **One `set()` for everything.** The app never has to learn an order of
  calls, and a batch of changes is one write pass.
- **The board shows a user's move at once and reports it.** The app answers
  with `set({ position })`: the true position after the move (the rook of a
  castling move slides, a pawn taken en passant fades), or the old position
  to take the move back. The app is the authority; the board never judges.
- **A board is look-only until told otherwise** (`movable: "none"`), and a
  look-only board lets the page scroll under the finger.
- **The app's own marks** (hints, verdicts, move-quality badges) go through
  `marks`. The board supplies the mechanism: an element with the class
  `ls-mark-<name>` on the square, under or over the pieces, placed in the
  same write as the move and never measured. The app's stylesheet supplies
  the look. That split is what makes a badge fast: it is drawn by the same
  pass as the pieces, whoever designed it. The badge pictures themselves
  stay in the app, so the library stays small and every site keeps its own
  style.
- Not built yet: `board.use(module)` for the modules of section 4.

## 6. Input

One set of pointer listeners on the board. Pointer down measures the board
once; from then on a square is arithmetic.

    pointer events -> gesture (tap or drag) -> intent -> state -> events

- **Tap, tap** and **drag** both move. A press becomes a drag after a few
  pixels, so a tap never jitters the piece.
- During a drag the piece follows the pointer: one `transform` write per
  pointer event, no layout read.
- A piece held by a finger is drawn larger and above the fingertip, and the
  square under the finger gets a halo, so the finger hides neither.
- A new position that arrives during a drag (the opponent moved) does not
  interrupt the drag, unless the held piece itself is gone.
- **Premove** (not built yet) is state: the reconciler shows it; the app
  confirms or drops it when the opponent has moved.
- The page does not scroll while pieces can be moved (`touch-action: none`
  on a movable board only).

## 7. Animation

- **Move:** the piece gets a class that carries the transition and its new
  transform, in the same write. The browser starts the slide by itself: no
  forced style flush, no `requestAnimationFrame`, no timer.
- **Without animation:** the same write without the class.
- **Capture:** the captured piece fades (opacity transition); its element is
  removed when the fade ends, or by the next change at the latest.
- **Promotion:** the pawn's own element slides to the last rank and changes
  its picture.
- **Several pieces at once** (castling, a jump to another position, a flip):
  each piece gets its new transform in the same write; the browser runs
  them together.
- **Interrupted:** a new position during a slide just sets new transforms.
  The transition continues from where the piece is. No queue.

Pieces are paired between positions (`pairPieces`): a piece that stays is not
touched; a moved piece keeps its element; the nearest piece of the same kind
takes each new square, which resolves castling, recaptures and en passant.

## 8. Looks

- Colours, timings and sizes are CSS variables on the board element.
- A piece set is a stylesheet with 12 rules. Changing the set is a class.
- Sizing is CSS: the board takes the width of its container, rounded down
  to a multiple of 8 pixels (`round(down, 100%, 8px)`), pieces are 12.5%
  wide and placed in percent. A resize runs no script. Whole pixels per
  square keep the pieces sharp, and they are needed in Safari, which
  measures a percent transform on the pixel-snapped box: on a board 203 px
  wide the h-file pieces sat 2.6 px off their squares until the width was
  rounded (found by the resize test).

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

## 10. How it is tested

`npm test` (unit, in Node) and `npm run test:browser` (Playwright: Chromium
and WebKit, each as a desktop and as a phone profile with touch).

| Suite | What it proves |
|---|---|
| `tests/unit/position.test.ts` | FEN reading and writing, bad FENs, square and screen maths for both sides, pairing for moves, captures, all four castlings, en passant, promotions |
| `tests/unit/games.test.ts` | pairing through 60 random legal games (chess.js): every move exact, the mover keeps its element, never more touched than a move can touch; 2,000 jumps between unrelated positions |
| `tests/unit/rules.test.ts` | RULES.md read against the source: no timers or animation loop, transform and opacity only, one measuring call, five listeners, no imports, under 6 kB |
| `tests/browser/board.test.ts` | what a user sees, read from where the pieces are on screen: positions, square colours, slides, fades, flip, resize, hundreds of positions of random games |
| `tests/browser/input.test.ts` | tap and drag with a real mouse, real touch points (Chromium) and synthetic touch (WebKit): selection, targets, drops, snap back, cancel, a second finger, a position change in the middle of a drag |
| `tests/browser/perf.test.ts` | the work asked of the browser: nothing at rest (no paint, layout, frame, timer or write for two seconds), five writes per move, zero layout reads per position, one per drag, no script during a slide, script cost with the processor slowed six times |

Two tests carry the design:

- **A slide keeps moving while the page's script is stuck.** The test starts
  a slide, freezes the script for 600 ms and counts the pictures the browser
  still draws: 50 for Lightsquare in our run in Chromium (the test demands
  20). The control, a slide driven from script frame by frame (how
  cm-chessboard and chessground animate), draws none.
- **Resizing needs no script** and leaves every piece exactly on its square.

For comparison, chessground's own test suite (read 2026-11-12) is two unit
files, FEN and premove geometry, run in jsdom; it has no browser, speed or
phone tests. Our equivalent of its FEN tests is in `position.test.ts`; the
premove tests arrive with premove (M1).

What the suite cannot show: how a real phone feels. The phone profiles are
desktop engines with a phone's screen and touch. `npm run bench` serves a
page on the local network for a real phone and records what it measures and
what the tester reports (rule 11).

## 11. Risks and open questions

1. **Does a CSS transition stay smooth in Low Power Mode?** In Chromium the
   slide is shown to run without the page's script (section 10). Whether
   iOS Safari in Low Power Mode also draws it at full rate is not yet
   shown. The bench exists to answer it on a real phone, next to Lichess,
   before anything else is built.
2. **Piece images at 3x pixel density.** SVG pieces as backgrounds are
   rasterised by the browser; the proof must show this costs nothing per
   move. Fallback: pre-rendered PNG sets.
3. **Safari details:** pointer capture, the long-press menu, scroll locking
   during a drag. Each needs a test on a phone.
4. **Arrows in SVG.** Drawn once when the arrows change, in one layer, and
   left alone between changes, so they cost nothing while pieces move. They
   may fade in and out (an opacity transition on the layer's elements). An
   arrow that moves or grows frame by frame from script would break the
   rules and is out.

## 12. Order of work

| Step | What | Done when |
|---|---|---|
| M0 proof | core pieces and input (built), tested on the bench page, then on Kibitzo's puzzle board behind a switch | it feels like Lichess on the founder's phone in Low Power Mode |
| M1 core | marks, coordinates, flip, premove, events, the speed tests | the speed tests pass; cm-chessboard core parity |
| M2 modules | shapes, promotion, overlay | Kibitzo's arrows, badges and promotion work |
| M3 | a11y module, React wrapper | Kibitzo's board component runs on Lightsquare with the same props |
| M4 | Kibitzo pages one at a time: puzzles, lessons, coach, vision, play | each passes its browser tests and a phone check |
| M5 | fenshot's board; cm-chessboard removed | no import of cm-chessboard is left |
| M6 | publish 1.0: docs and demo at kibitzo.com/lightsquare, npm | after some weeks in production |

If M0 fails, the design is wrong and we stop there.

## 13. Our own work

Lightsquare is written from scratch and shares no code, styles or pictures
with any other board.

- **chessground (GPL-3.0)** was read to learn how Lichess's board behaves
  and to fill the comparison table above. Nothing was taken from it: not
  code, not class names, not colour values. The mechanisms differ at every
  core point: how a piece is animated (a CSS transition instead of a script
  loop), how it is positioned (percent instead of measured pixels), how a
  position change is applied, the API and its vocabulary.
- **Ideas that every board shares** are not anyone's property: a board with
  no chess rules inside, pieces as elements, pairing a moved piece with the
  nearest piece of the same kind (cm-chessboard, MIT, does the same), dots
  on the squares a piece may go to.
- **Pictures:** the one piece set in the package is Cburnett's, taken from
  Wikimedia Commons under its BSD licence (`assets/cburnett/NOTICE.md`).
  Piece sets under GPL or non-commercial licences (many of the sets on
  Lichess, Staunty among them) must not be added.
- Rule 12 of RULES.md keeps it that way for contributors.

