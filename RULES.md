# Lightsquare: hard rules

Lightsquare exists for one reason: a chessboard that stays smooth on every
phone, including old ones and phones in Low Power Mode. Every rule below
protects that. They are not style preferences. A change that breaks one is a
regression, however good it looks on a desktop.

Why they exist (measured 2026-11-12, iPhone, iOS 18.7, Safari, Low Power
Mode): Safari limits page scripts to at most 30 frames a second there, and
unevenly (gaps of 33 and 50 ms).

- cm-chessboard, the board Kibitzo used, steps every animation from script
  and rewrites a transform inside one SVG drawing on each step, so the whole
  drawing is repainted every frame. On that phone it felt "terrible".
- chessground, the Lichess board, also steps its animations from script
  (`anim.ts`: a `requestAnimationFrame` loop), but each step only sets the
  CSS transform of a separate element. The browser moves that element
  without repainting anything: cheap frames, and it stays snappy.
- Lightsquare goes one step further: a move is one style change and a CSS
  transition, so no script runs per frame at all. Whether that also escapes
  the 30-frame cap on a given phone is measured, never assumed (rule 11).

## The rules

1. **Pieces move with CSS transforms only.** A moving piece changes its
   `transform` and nothing else: never `left`/`top`, never width or height,
   never an SVG attribute. Transforms are composited by the GPU.

2. **No animation loop.** No `requestAnimationFrame` loop and no timer drives
   a piece animation, a fade, or anything that moves. Animations are CSS
   transitions (or the Web Animations API on `transform`/`opacity`). A single
   `requestAnimationFrame` to start a transition after a style change is
   allowed; a loop is not.

3. **Nothing animates when nothing moves.** No infinite animation, no idle
   timer, no polling. A board at rest does no work: zero paints, zero frames.

4. **Positions in percent.** A piece is placed with `translate(N * 100%,
   M * 100%)` relative to its own size. Resizing the board needs no script,
   no measuring, no re-render.

5. **One background for the squares.** The 64 squares are one CSS background,
   not 64 elements and not an SVG. Highlights and markers are a few
   elements on their own layer, created only while they are shown.

6. **One set of input listeners for the whole board.** Pointer events on the
   board element, never one listener per piece or per square. During a drag
   the board's rectangle is measured once, at pointer down.

7. **Touch only what changed.** Setting a position pairs pieces with the
   ones already shown (`pairPieces`); a piece that did not move is not
   touched, a moved piece keeps its element and slides. Never rebuild the
   whole board for a move.

8. **No layout reads during a move or a drag.** No `getBoundingClientRect`,
   `offsetWidth` or `getComputedStyle` between pointer down and pointer up,
   or while a position is applied, except the single measure in rule 6.

9. **Zero dependencies.** No runtime dependency, ever. No framework: the core
   is plain TypeScript and the DOM; framework wrappers live outside the core.

10. **Small on purpose.** The core stays under 6 kB minified and gzipped.
    A feature that does not fit is an optional module the user imports.

11. **Prove it on a phone.** A change to rendering, animation or input ships
    only after it was measured on a real phone in Low Power Mode (or a
    weaker phone) against the previous version, with the numbers in the pull
    request. A desktop profile is not evidence for this library.

## When a rule seems to be in the way

Change the design, not the rule. If a feature truly cannot exist under these
rules, it does not belong in Lightsquare. Open an issue with the measurement
that shows why, before any code.
