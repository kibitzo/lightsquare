# The comparison

Lightsquare measured next to other chessboards: the same game, the same
browser, each board driven the same way. The numbers are in
[RESULTS.md](RESULTS.md), with the method and its limits.

This folder is a project of its own, kept apart from the library on purpose:

- It has its own `package.json`, lockfile and type check. The other boards
  (chessground, which is GPL, and cm-chessboard) are installed only here.
- Lightsquare's manifest, scripts, type check, tests and CI do not reach
  into this folder. A test of the library holds that line
  (`tests/unit/rules.test.ts`, "the comparison is a project of its own").
- Nothing here is part of Lightsquare or of its npm package.
- It measures Lightsquare as it is built for npm (`../dist`), not its
  source, as it measures the other boards as they are published.

The one thing that crosses over is data: the playground (`../bench`) shows
the numbers of `results.json` in a table.

## Run it

    cd compare
    npm install
    npx playwright install chromium     once
    npm run measure

`npm run measure` builds Lightsquare first (the library's own tools must be
installed at the top of the repository: `npm install` there), then measures
the three boards and writes `results.json` and `RESULTS.md`. It takes a few
minutes. Run nothing else in a browser on the machine meanwhile: it disturbs
the times.

- `npm run sizes`: measure only the download sizes again.
- `npm run report`: write `RESULTS.md` again from `results.json`.
- `node run.mjs --only perMove`: measure one group again (`atRest`,
  `perMove`, `whileStuck`, `whileBusy`, `replay` or `drag`) and keep the
  rest of the last run.
- `node run.mjs --paints`: where each board's rendering time goes for a
  move (painting, rastering, compositing), with a trial of Lightsquare
  keeping every piece on a layer of its own. A diagnosis tool; it writes
  nothing.

## Layout

| File | What |
|------|------|
| `run.mjs` | the measurements and the report |
| `adapters/` | one small file per board, so that each is driven the same way (`types.ts` says how) |
| `page.html` | the page a board is measured on: one 400 by 400 pixel box |
| `results.json` | the numbers of the last run |
| `RESULTS.md` | the report, written from them |

## Add a board

Install it here, write its adapter in `adapters/`, add it to `LIBS` in
`run.mjs` and its stylesheets to `page.html`.
