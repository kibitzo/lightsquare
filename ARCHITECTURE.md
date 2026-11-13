# Lightsquare: architecture

A chessboard that stays smooth on every phone. This document is the design.
The hard rules it must obey are in [RULES.md](RULES.md); the diagram is
[docs/architecture.html](docs/architecture.html).

Status, 2026-11-12: the library is built and tested: the core (pieces,
marks, coordinates, tap and drag, premove, events) and the modules (arrows
and circles, promotion picker, HTML on squares, screen readers and keyboard,
premove geometry, React). The founder's phone test in Low Power Mode passed
by feel ("excellent"); numbers from that phone are still to be recorded.
Not built: the board editor. Not done: Kibitzo's move to it (section 12).

The API is in [docs/API.md](docs/API.md).

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

## 3. What is on screen: layers

Bottom to top. Each layer is one element; only the layers in use exist.

| Layer | Holds | Technique |
|---|---|---|
| surface | the 64 squares | one CSS background on the board element |
| marks | last move, selected square, check, premove, move dots, the app's marks under the pieces | one small element per mark, placed by transform |
| coords | file letters and rank numbers | 16 text elements, written once per orientation |
| pieces | one element per piece | placed by `translate(col * 100%, row * 100%)`, moved by transition |
| shapes | arrows, circles, labels (module) | one SVG in board units, a shape drawn once when it appears |
| over | the app's marks above the pieces: move-quality badges, verdicts | one small element per mark, placed by transform |
| overlay | any HTML the app anchors to a square (module) | HTML placed by transform |
| promotion | the promotion picker (module) | four buttons, while it is open |

A piece is promoted to its own GPU layer (`will-change: transform`) only
while it is dragged; a slide needs none, the browser handles a transition by
itself. A board at rest holds no extra layers. While a piece is dragged, the
pieces layer is lifted above the arrows and badges, so the piece in the hand
is never hidden.

## 4. Modules

The core is one import. Everything else is a separate entry point, so an app
that shows a static position downloads only the core.

| Entry point | What | Replaces in cm-chessboard | Size, gzipped |
|---|---|---|---|
| `lightsquare` (core) | position, pieces, marks, coordinates, orientation, tap and drag, premove, events (also what each change of the pieces was), module host | Chessboard, Markers, AutoBorderNone | 5.2 kB |
| `@kibitzo/lightsquare/shapes` | arrows, circles, arrow labels, drawing by the user | Arrows, RightClickAnnotator | 2.0 kB |
| `@kibitzo/lightsquare/promotion` | promotion picker | PromotionDialog | 0.6 kB |
| `@kibitzo/lightsquare/overlay` | HTML anchored to squares | HtmlLayer | 0.4 kB |
| `@kibitzo/lightsquare/a11y` | screen-reader description, move announcements, keyboard moves | Accessibility | 1.1 kB |
| `@kibitzo/lightsquare/premove` | where a piece could premove to (geometry only) | (not in cm-chessboard) | 0.8 kB |
| `@kibitzo/lightsquare/theme` | looks as data: `applyTheme`, built-in board colours | (not in cm-chessboard) | 0.6 kB |
| `@kibitzo/lightsquare/react` | React component | (Kibitzo's 1,451-line wrapper, in part) | 0.5 kB |
| later: `lightsquare/editor` | spare pieces, drag pieces on and off | (not in cm-chessboard) | |

The stylesheet for all of it is 2.0 kB. Everything together is about 13 kB.

A module is a function that receives a `surface` (the board element, the
orientation, square and screen maths, the pieces, `tap`) and returns its own
API plus two optional hooks, `update()` and `destroy()`. `update()` runs in
the same task as every change of the board. Modules import only types from
the core, so each one stands alone. cm-chessboard features left out on
purpose: PieceRotation (pieces turned for two players at one tablet) and
Persistence (the app can store a FEN itself).

## 5. The API

The full reference is [docs/API.md](docs/API.md). The shape of it:

```ts
const board = lightsquare(element, {
  position, orientation, movable, targets,     // what is shown, what may move
  lastMove, check, marks, coordinates,         // marks
  premovable, premoveTargets,                  // moving ahead of the turn
  onMove, onSelect, onPremove, onTap,          // what the user did
});

board.set({ position, lastMove });  // one call changes anything
board.move("g1", "f3");             // slide one piece
board.playPremove();                // the premove in waiting, if allowed now
board.use(shapes({ arrows }));      // add a module
board.destroy();
```

- **One `set()` for everything.** The app never has to learn an order of
  calls, and a batch of changes is one write pass. Setting what is already
  shown touches nothing, so a framework may call it on every render.
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
- **A premove is state, not a move.** The piece stays; the two squares are
  marked; the app calls `playPremove()` when the turn comes, and the board
  plays it as a user's move only if the current targets allow it.

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
- **Premove** is state: the reconciler shows it; a press on the board
  cancels it; the app plays or drops it when the opponent has moved.
- **A tap** on any square can be reported to the app (`onTap`), also on a
  look-only board, without taking the touch from the page.
- **Modules bring their own input** where they need it (the drawing pen
  listens for the right mouse button), always on the board element, never
  per piece or square.
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

Looks are CSS, so they cost no script and one setting reaches every board.

- **Variables.** Colours, timings and sizes are CSS variables (`--ls-light`,
  `--ls-dark`, `--ls-move-ms`, `--ls-shape`, ...). The stylesheet reads each
  one with its default as a fallback and declares none of them itself, so a
  variable set on the board, on a wrapper or on the page's root all work,
  and the nearest one wins.
- **Piece sets.** A piece set is twelve variables, `--ls-wk` to `--ls-bp`,
  on a class (`ls-set-<name>`). Switching sets is switching one class, on
  any element above the boards. The rest of an app can use the same
  variables: a tray of captured pieces shows the user's set with
  `background-image: var(--ls-wq)`.
- **Themes as data** (`@kibitzo/lightsquare/theme`). A theme is a plain object
  (squares, marks, piece set, piece size, slide time, arrow colours and
  strength). `applyTheme(element, theme)` writes the variables and the
  class. An app stores one theme per user and applies it to the page.
- **Arrows.** Colours are variables per name (`--ls-shape-red`); the
  thickness and the head are numbers given to the shapes module.
- **Sizing is CSS.** The board is square and takes the width of its
  container, rounded down to a multiple of 8 pixels (`round(down, 100%,
  8px)`: at most 7 pixels less). Pieces, marks and coordinates are placed
  in fractions of the board's width (`cqw`), so a resize runs no script.
  The history, because it went back and forth: the first version placed
  pieces in percent of their own box and rounded the board to a multiple
  of 8 pixels in script, because Safari measures such a transform on the
  pixel-snapped box (on a board 203 px wide the h-file pieces sat 2.6 px
  off). Container units removed the drift, and the rounding went with it:
  every place was exact at every width. The places were; the painting was
  not. On kibitzo.com in Safari (2026-11-12) a thin line of the bare
  square showed beside the yellow of the last move: at a width where a
  square is not a whole number of pixels, the drawing of the dark squares
  and a mark placed by a transform are rounded differently. Measured in
  Chromium and WebKit at 1, 2 and 3 device pixels to a pixel: thousands of
  such pixels at odd widths, none with whole squares
  (`tests/browser/seams.test.ts`). So the rounding is back, now done by
  the browser. Where a square cannot be a whole number of device pixels (a
  zoomed page, an Android phone at 2.625) an edge pixel is shared between
  a square and its neighbour, but no line of the bare square shows.
  Rounding to whole device pixels (`8px` divided by the pixel density) was tried and was
  worse: the board's width in CSS pixels is then a fraction, and the
  places go off again. The dark squares are one path for the same reason
  as before: a tiled background is snapped to whole pixels by the browser.

## 9. Compared

Read from the source and READMEs on 2026-11-12.

| | cm-chessboard 8.15 | chessground (Lichess) | Lightsquare (this design) |
|---|---|---|---|
| Drawn as | one SVG drawing | elements, plus SVG for shapes | elements, plus SVG for shapes |
| A piece slides by | script loop, SVG transform rewritten per frame, drawing repainted | script loop, CSS transform set per frame | one CSS transition, no script per frame |
| Positions | SVG units | pixels from the measured board; recomputed on resize | fractions of the board's width (container units); nothing to recompute |
| Size, gzipped | 8.5 kB core, extensions extra | 10 kB | 5.2 kB core; about 13 kB with every module and the stylesheet |
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
| `tests/unit/premove.test.ts` | premove geometry for every piece, castling, both colours, the board's edges |
| `tests/unit/rules.test.ts` | RULES.md read against the source, core and modules: no timers or animation loop, transform and opacity only, one measuring call, five listeners, no imports, size limits |
| `tests/browser/board.test.ts` | what a user sees, read from where the pieces are on screen: positions, square colours, slides, fades, flip, resize, hundreds of positions of random games |
| `tests/browser/input.test.ts` | tap and drag with a real mouse, real touch points (Chromium) and synthetic touch (WebKit): selection, targets, drops, snap back, cancel, a second finger, a position change in the middle of a drag |
| `tests/browser/modules.test.ts` | arrows and circles (geometry, colours, drawing with the right button, untouched while pieces move), the promotion picker, HTML on squares, screen-reader text, moves by keyboard |
| `tests/browser/react.test.ts` | the React component in StrictMode: one board, props to positions, nothing touched on a re-render |
| `tests/browser/perf.test.ts` | the work asked of the browser: nothing at rest (no paint, layout, frame, timer or write for two seconds), five writes per move, zero layout reads per position, one per drag, no script during a slide, script cost with the processor slowed six times |

Two tests carry the design:

- **A slide keeps moving while the page's script is stuck.** The test starts
  a slide, freezes the script for 600 ms and counts the pictures the browser
  still draws: 50 for Lightsquare in our run in Chromium (the test demands
  20). The control, a slide driven from script frame by frame (how
  cm-chessboard and chessground animate), draws none.
- **Resizing needs no script** and leaves every piece exactly on its
  square, at any width, with no animation started.

For comparison, chessground's own test suite (read 2026-11-12) is two unit
files, FEN and premove geometry, run in jsdom; it has no browser, speed or
phone tests. Our equivalents are `position.test.ts` for FEN and
`premove.test.ts` for premove geometry.

The comparison in `compare/` runs the same counters on Lightsquare,
chessground, cm-chessboard, react-chessboard and chessboard.js side by side
and writes
[compare/RESULTS.md](compare/RESULTS.md). It is a project of its own, with
its own dependencies; see its README. The page
itself (`bench/`) has its own tests in `tests/browser/playground.test.ts`.

What the suite cannot show: how a real phone feels. The phone profiles are
desktop engines with a phone's screen and touch. `npm run bench` serves a
page on the local network for a real phone and records what it measures and
what the tester reports (rule 11).

The first recorded phone rounds (2026-11-12, an iPhone with a 402 by 874
point screen at 3x, Safari 27.2, Low Power Mode on, the game replayed
automatically with a 180 ms slide):

| Round | Every piece on its own layer | Script runs a second | Longest pause of the script | Slide, typical and longest, as the script saw it | Moves | Tester |
|---|---|---:|---:|---:|---:|---|
| 1 | no (as shipped) | 24.4 | 106 ms | 209 and 245 ms | 41 | smooth |
| 2 | yes (the trial of the bench page) | 29.4 | 104 ms | 200 and 249 ms | 42 | smooth |
| 3 | no (as shipped) | 24.4 | 107 ms | 194 and 216 ms | 21 | smooth |

What they show: with the page's script held to about 24 to 29 runs a second
and stopped for a tenth of a second at times, the slides were smooth to the
tester. And keeping every piece on a layer of its own all the time (as
chessground does, which is why it paints less often per move, see
compare/RESULTS.md) could not be told apart from a layer for the moving
piece only; so the library keeps the cheaper way (rule: only what is shown
to help ships). What they do not show: dragging (no round had a drag), any
other phone, and a frame rate; a page cannot count the frames Safari draws
on its own, so "smooth" is the tester's eye. The slide times are as the
held-back script heard of them, not the slide's true length.

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

| Step | What | State |
|---|---|---|
| M0 proof | core pieces and input, on a bench page for the phone | done; passed by feel on the founder's phone, numbers still to be recorded |
| M1 core | marks, coordinates, flip, premove, events, the speed tests | done |
| M2 modules | shapes, promotion, overlay | done |
| M3 | a11y module, React component | done |
| M4 | Kibitzo: an adapter with the props of its current board component, then every page (puzzles, lessons, coach, vision, play) | done; live on kibitzo.com since 2026-11-12, and the old board is removed there. The founder's judgement of production on the phone is still to come |
| M5 | fenshot's board; cm-chessboard removed | no import of cm-chessboard is left |
| M6 | npm: `@kibitzo/lightsquare`, with the demo at kibitzo.github.io/lightsquare | done; 0.1.0 is on npm since 2026-11-12. How a release is made is in [docs/RELEASING.md](docs/RELEASING.md) |
| M7 | 1.0: the API is frozen | after some weeks in production |
| later | the board editor module | when a product needs it |

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
- **Pictures:** the package has two piece sets. Cburnett's is taken from
  Wikimedia Commons under its BSD licence (`assets/cburnett/NOTICE.md`).
  Kibitzo is our own, drawn in `piece-sets/` (CC BY 4.0,
  `piece-sets/NOTICE.md`), in the package since 0.1.5 with its notice.
  Piece sets under GPL or non-commercial licences (many of the sets on
  Lichess) must not be added to the package, nor shown on the demo page.
  The demo page shows the same two sets.
- Rule 12 of RULES.md keeps it that way for contributors.

