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
   transitions on `transform` and `opacity`. The core calls neither
   `requestAnimationFrame` nor `setTimeout`: a slide starts because the
   class that carries the transition and the new transform arrive in the
   same write.

3. **Nothing animates when nothing moves.** No infinite animation, no idle
   timer, no polling. A board at rest does no work: zero paints, zero frames.

4. **Places are fractions of the board's width.** A piece is placed with
   `translate(N * 12.5cqw, M * 12.5cqw)`: the board is a CSS container, so
   the browser works the place out at every size. Resizing the board needs
   no script, no measuring, no re-render, and the board may have any width.
   Percent of the piece's own box (`translate(N * 100%, ...)`) is only the
   fallback for browsers without container units: Safari measures it on the
   pixel-snapped box, and pieces drift by up to 3 pixels at odd widths
   (measured 2026-11-12). Never add the separate `scale`, `rotate` or
   `translate` properties to a piece or a mark: they multiply the transform
   that places it. A piece at rest carries no transition, or a resize would
   make it trail behind.

5. **The squares are one static shape.** The light squares are the board's
   background colour; the dark ones are a single path, drawn once and never
   touched. Not 64 elements, and not a tiled background: browsers snap
   tiles to whole pixels, which puts the squares up to 1.5 pixels away from
   the pieces at odd widths (measured 2026-11-12). Highlights and markers
   are a few elements on their own layer, created only while they are shown.

6. **One set of input listeners for the whole board.** Pointer events on the
   board element, never one listener per piece or per square. During a drag
   the board's rectangle is measured once, at pointer down. A module that
   needs input of its own (the drawing pen) follows the same rule: its
   listeners on the board element, one measure per press.

7. **Touch only what changed.** Setting a position pairs pieces with the
   ones already shown (`pairPieces`); a piece that did not move is not
   touched, a moved piece keeps its element and slides. Never rebuild the
   whole board for a move.

8. **No layout reads during a move or a drag.** No `getBoundingClientRect`,
   `offsetWidth` or `getComputedStyle` between pointer down and pointer up,
   or while a position is applied, except the single measure in rule 6.

9. **Zero dependencies.** No runtime dependency, ever. No framework: the core
   is plain TypeScript and the DOM; framework wrappers live outside the core.
   Other boards are installed only in `compare/`, which is a project of its
   own: the library's manifest, lockfile, scripts, type check, tests and CI
   never reach into it. The one thing that crosses over is data: the
   playground shows the numbers of `compare/results.json`.

10. **Small on purpose.** The core stays under 6 kB minified and gzipped.
    A feature that does not fit is an optional module the user imports.

11. **Prove it on a phone.** A change to rendering, animation or input ships
    only after it was measured on a real phone in Low Power Mode (or a
    weaker phone) against the previous version, with the numbers in the pull
    request. A desktop profile is not evidence for this library.

12. **Our own work only.** No code, stylesheet values, class names or
    pictures from a GPL project (chessground and most of Lichess are GPL) or
    from anything with a non-commercial licence. Read other boards to learn
    how they behave; write what you learned in your own words and code.
    Every picture in the package has a NOTICE file that names its author and
    licence. See ARCHITECTURE.md, section 13.

13. **Every rule has a test.** `tests/unit/rules.test.ts` reads the source
    against this file and `tests/browser/perf.test.ts` counts the work asked
    of the browser. A new rule comes with its test; a change that needs a
    test weakened is a change to this file first.

## When a rule seems to be in the way

Change the design, not the rule. If a feature truly cannot exist under these
rules, it does not belong in Lightsquare. Open an issue with the measurement
that shows why, before any code.
