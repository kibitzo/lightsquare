# Lightsquare: notes for agents and contributors

A chessboard for the web that stays smooth on every phone (MIT). The design
is in [ARCHITECTURE.md](ARCHITECTURE.md).

## Hard rules

- **Read [RULES.md](RULES.md) before any change.** Pieces move only with CSS
  transforms, no animation loop, no timers, nothing animates at rest, zero
  dependencies, the core under 6 kB gzipped. A change that breaks a rule is
  a regression, however good it looks on a desktop.
- **Every rendering, animation or input change is measured on a real phone
  in Low Power Mode before it ships** (`npm run bench`), with the numbers in
  the pull request. A weak phone is the target device, not an edge case.
- **Our own work only.** Never copy code, stylesheet values, class names or
  pictures from chessground (GPL) or from any GPL or non-commercial source.
  Every picture in the package has a NOTICE file with its author and licence.
  The demo page shows Kibitzo, a piece set of our own drawn in `piece-sets/`
  (CC BY 4.0, see its NOTICE and README), next to the package's Cburnett. It
  is not in `src/` or the build until a release takes it in with its NOTICE.
  Never add a picture of anyone else's to the demo page.
- **Every rule has a test.** A new rule comes with its test; never weaken a
  test to make a change pass.
- **No chess rules inside.** The app says which moves are allowed.
- No em dashes, en dashes or double hyphens in documentation.

## Before a commit

    npx tsc -p tsconfig.json --noEmit
    npm test                 unit tests and the rules read against the source
    npm run test:browser     Chromium and WebKit, desktop and phone profiles
    npm run build            dist/ and the sizes
    npm run check:package    the packed npm file, met as a user meets it (after a build)

## Layout

| Path | What |
|------|------|
| `src/` | the core: `position.ts` (FEN, pairing), `state.ts`, `pieces.ts`, `marks.ts`, `input.ts` (pointer), `board.ts` (puts them together), `lightsquare.css` |
| `src/modules/` | optional modules: `shapes`, `promotion`, `overlay`, `a11y`, `premove`, `theme`. They import only types from the core |
| `src/react.ts` | the React component |
| `docs/API.md` | the reference; update it with every change of the API |
| `src/pieces/`, `assets/` | the piece set and its source pictures |
| `tests/unit/`, `tests/browser/` | see ARCHITECTURE.md, section 10 |
| `bench/` | the playground: play, change the looks, measure on a real phone; served on the local network and published as the demo (`npm run demo`, the Demo workflow) |
| `compare/` | Lightsquare measured next to other boards. A project of its own (own `package.json`, lockfile, type check; see its README). Never import from it, never add its dependencies or a script for it to the library |
| `scripts/` | build, piece stylesheet tools |
