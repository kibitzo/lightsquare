# Lightsquare next to other boards

Measured 2026-11-12. Written by `npm run measure` in `compare/`; do not edit by hand.

Five boards show the same game in the same browser, each driven the same
way, and the browser's own counters are read. The best number in each row is
in bold; where every board has the same number, none is.

| | Lightsquare 0.0.1 | chessground (Lichess) 10.5.0 | cm-chessboard 8.15.4 | react-chessboard 5.12.1 | chessboard.js 1.0.0 |
|---|---:|---:|---:|---:|---:|
| Licence | MIT | GPL-3.0 | MIT | MIT | MIT |
| **To download** |  |  |  |  |  |
| Script, gzipped | **5.2 kB** | 11.9 kB | 8.1 kB | 21.5 kB | 33.0 kB |
| Script with arrows, drawing by the user and premove | **7.3 kB** | 11.9 kB | 10.9 kB | 21.5 kB | not offered |
| Styles, gzipped, without piece pictures | 2.1 kB | 1.6 kB | 1.0 kB | in the script | **0.4 kB** |
| **At rest** |  |  |  |  |  |
| Elements on the page (starting position, with coordinates) | **53** | 68 | 154 | 515 | 130 |
| Paints, script calls, frames and timers in two seconds | 0 | 0 | 0 | 0 | 0 |
| **One sliding move (middle value of 20 moves)** |  |  |  |  |  |
| Frames asked of the script | **0** | 25 | 25 | **0** | 26 |
| Writes to the page | **4** | 51 | 162 | 6 | 59 |
| Layout reads | **0** | **0** | **0** | 1 | 4 |
| Script time | **0.06 ms** | 2.82 ms | 2.02 ms | 2.77 ms | 4.73 ms |
| Style and layout time | 0.81 ms | 1.61 ms | 3.19 ms | **0.78 ms** | 2.23 ms |
| Paints | 7.3 | **4.3** | 48.4 | 6.0 | 79.8 |
| Paint time | 0.71 ms | **0.16 ms** | 8.04 ms | 0.43 ms | 8.37 ms |
| Raster time, off the main thread | 3.79 ms | **0.04 ms** | 9.95 ms | 0.78 ms | 9.84 ms |
| Compositing time: layers, commit, drawing | 5.28 ms | 16.47 ms | 9.91 ms | **3.61 ms** | 7.08 ms |
| **When the page's script is not free** |  |  |  |  |  |
| Pictures drawn of a 900 ms slide while the script is frozen for 600 ms | **51** | 0 | 0 | **51** | 0 |
| Pictures drawn of 12 moves while the script is busy half the time | **248** | 172 | 169 | 246 | 144 |
| **A processor slowed six times** |  |  |  |  |  |
| Main-thread work to show one position, no slide | **0.005 ms** | 0.009 ms | 3.492 ms | 6.238 ms | 0.006 ms |
| **One piece dragged two squares with the mouse, in 42 steps** |  |  |  |  |  |
| Script time | **3.9 ms** | 3.9 ms | 5.0 ms | 36.8 ms | 8.6 ms |
| Style and layout time | 3.6 ms | **1.5 ms** | 4.5 ms | 2.0 ms | 1.6 ms |
| Layout reads | 1 | **0** | **0** | 138 | 130 |

## Where another board is ahead

- **To download, styles, gzipped, without piece pictures:** chessboard.js has 0.4 kB, Lightsquare 2.1 kB.
- **One sliding move, style and layout time:** react-chessboard has 0.78 ms, Lightsquare 0.81 ms.
- **One sliding move, paints:** chessground (Lichess) has 4.3, Lightsquare 7.3.
- **One sliding move, paint time:** chessground (Lichess) has 0.16 ms, Lightsquare 0.71 ms.
- **One sliding move, raster time, off the main thread:** chessground (Lichess) has 0.04 ms, Lightsquare 3.79 ms.
- **One sliding move, compositing time: layers, commit, drawing:** react-chessboard has 3.61 ms, Lightsquare 5.28 ms.
- **One piece dragged two squares with the mouse, in 42 steps, style and layout time:** chessground (Lichess) has 1.5 ms, Lightsquare 3.6 ms.
- **One piece dragged two squares with the mouse, in 42 steps, layout reads:** chessground (Lichess) and cm-chessboard have 0, Lightsquare 1.

## How it was measured

- **Browser:** Chromium 149.0.7827.55 (headless), phone profile (Pixel 7: 412 by 915, 2.6x, touch).
- **Machine:** Apple M4 Max, 14 cores.
- **Same conditions:** every board gets the same 400 by 400 pixel box, the
  starting position with coordinates, a 200 ms slide, and the first moves of
  Morphy's Opera game. Everything else is the board's own default.
- **The frozen-script row** uses one long slide: a queen alone on the
  board goes from a1 to h8 in 900 ms, and the page's script is frozen for
  600 ms of it. (Before 2026-11-12 this row removed a pawn instead of
  sliding a piece, so it showed a fade, not a slide. The numbers for the
  boards measured then came out the same with a real slide.)
- **Each number** is the middle one of 3 runs.
- **Counters:** script, style and layout time and counts come from the
  browser's performance metrics; paints and the times of painting,
  rastering and compositing from its trace (compositing is the layer
  update, the commit and the drawing of each frame); frames asked of the
  script, timers, layout reads and writes to the page from counters placed
  in the page before the board loads. "Pictures drawn" are the distinct
  frames the browser sent to a screen recording.
- **What is measured:** Lightsquare as it is built for npm (`dist/`), the
  other boards as they are published on npm.
- **Sizes** are each board's public entry point bundled alone and minified
  with esbuild, then gzipped. chessground ships arrows, drawing and premove
  in its one file; for Lightsquare and cm-chessboard the second size row
  adds the parts that do the same (cm-chessboard has no premove).
  react-chessboard has arrows and drawing in its one file and no premove;
  its styles are written by its script, so it has no stylesheet.
  chessboard.js offers none of the three.
- **What a board cannot run without:** react-chessboard needs React 19.3.1; chessboard.js needs jQuery 4.0.0. jQuery is counted in the size of chessboard.js, since
  few apps have it otherwise. React is not counted in the size of
  react-chessboard, since an app that picks it has React already; the drag
  library it brings along is counted. React runs in its production build,
  and every change of the position is one React update, as when an app
  sets its state.
  The time React spends is counted as the board's script time, because
  whoever uses the board pays it.
- **Piece pictures:** each board shows its own default set. chessboard.js
  has none in its npm package and is given the Cburnett set, which is the
  one its own site uses.
- **The code** is in this folder: `run.mjs` and one small adapter per
  board in `adapters/`.

## What this does not show

- **It is not a phone.** These numbers come from a desktop computer. The
  rows "while the script is frozen" and "busy half the time" stand in for a
  phone that holds a page's script back, as phones do in Low Power Mode.
  They are not a measurement of one. How a board feels on a real phone is
  judged on a real phone.
- **One browser engine.** The counters used here exist only in Chromium.
- **No real graphics chip.** Headless Chromium draws in software, so the
  compositing times are larger than on a device; compare them between
  boards, not with a phone.
- **One machine, one day.** Times in milliseconds will differ elsewhere;
  the counts (frames, writes, pictures) should not.
- **Defaults.** Each board runs as it comes. A board tuned by hand may do
  better than its row here.

This folder is a project of its own. The other boards are installed only
here (`compare/package.json`); Lightsquare's own manifest, scripts and tests
do not know them, and nothing of them is part of Lightsquare or of its npm
package.
