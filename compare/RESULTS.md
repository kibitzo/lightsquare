# Lightsquare next to other boards

Measured 2026-11-12. Written by `npm run measure` in `compare/`; do not edit by hand.

Three boards show the same game in the same browser, each driven the same
way, and the browser's own counters are read. The best number in each row is
in bold; where every board has the same number, none is.

| | Lightsquare 0.0.1 | chessground (Lichess) 10.5.0 | cm-chessboard 8.15.4 |
|---|---:|---:|---:|
| Licence | MIT | GPL-3.0 | MIT |
| **To download** |  |  |  |
| Script, gzipped | **4.7 kB** | 11.9 kB | 8.1 kB |
| Script with arrows, drawing by the user and premove | **6.8 kB** | 11.9 kB | 10.9 kB |
| Styles, gzipped, without piece pictures | 1.9 kB | 1.6 kB | **1.0 kB** |
| **At rest** |  |  |  |
| Elements on the page (starting position, with coordinates) | **53** | 68 | 154 |
| Paints, script calls, frames and timers in two seconds | 0 | 0 | 0 |
| **One sliding move (middle value of 20 moves)** |  |  |  |
| Frames asked of the script | **0** | 25 | 25 |
| Writes to the page | **4** | 51 | 162 |
| Layout reads | 0 | 0 | 0 |
| Script time | **0.05 ms** | 2.31 ms | 1.87 ms |
| Style and layout time | **0.79 ms** | 1.29 ms | 3.13 ms |
| Paints | 7.3 | **4.3** | 48.4 |
| Paint time | 0.65 ms | **0.12 ms** | 7.64 ms |
| Raster time, off the main thread | 4.23 ms | **0.03 ms** | 9.55 ms |
| Compositing time: layers, commit, drawing | **5.40 ms** | 13.33 ms | 9.57 ms |
| **When the page's script is not free** |  |  |  |
| Pictures drawn of a 900 ms slide while the script is frozen for 600 ms | **51** | 0 | 0 |
| Pictures drawn of 12 moves while the script is busy half the time | **246** | 172 | 166 |
| **A processor slowed six times** |  |  |  |
| Main-thread work to show one position, no slide | 0.009 ms | **0.005 ms** | 3.365 ms |
| **One piece dragged two squares with the mouse, in 42 steps** |  |  |  |
| Script time | **3.8 ms** | 4.0 ms | 4.9 ms |
| Style and layout time | 3.3 ms | **1.8 ms** | 4.4 ms |
| Layout reads | 1 | **0** | **0** |

## Where another board is ahead

- **To download, styles, gzipped, without piece pictures:** cm-chessboard has 1.0 kB, Lightsquare 1.9 kB.
- **One sliding move, paints:** chessground (Lichess) has 4.3, Lightsquare 7.3.
- **One sliding move, paint time:** chessground (Lichess) has 0.12 ms, Lightsquare 0.65 ms.
- **One sliding move, raster time, off the main thread:** chessground (Lichess) has 0.03 ms, Lightsquare 4.23 ms.
- **A processor slowed six times, main-thread work to show one position, no slide:** chessground (Lichess) has 0.005 ms, Lightsquare 0.009 ms.
- **One piece dragged two squares with the mouse, in 42 steps, style and layout time:** chessground (Lichess) has 1.8 ms, Lightsquare 3.3 ms.
- **One piece dragged two squares with the mouse, in 42 steps, layout reads:** chessground (Lichess) and cm-chessboard have 0, Lightsquare 1.

## How it was measured

- **Browser:** Chromium 149.0.7827.55 (headless), phone profile (Pixel 7: 412 by 915, 2.6x, touch).
- **Machine:** Apple M4 Max, 14 cores.
- **Same conditions:** every board gets the same 400 by 400 pixel box, the
  starting position with coordinates, a 200 ms slide, and the first moves of
  Morphy's Opera game. Everything else is the board's own default.
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
