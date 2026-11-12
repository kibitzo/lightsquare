<p align="center"><img src="docs/icons/icon.svg" width="112" height="112" alt=""></p>

# Lightsquare

A chessboard for the web that stays smooth on every phone, including old
ones and phones in Low Power Mode.

**[Try the demo](https://kibitzo.github.io/lightsquare/)**: play on it,
change its looks, and measure it on your own phone.

- Pieces are moved by the browser, not by script: a move is one style change
  and a CSS transition. A slide keeps going even while the page's script is
  busy (a test shows this in Chromium; real phones are measured with the
  bench page).
- At rest the board does nothing: no timers, no frames, no paints.
- Small: the core is 5.2 kB (minified and gzipped) with no dependencies.
  Arrows, the promotion picker, sounds, screen-reader support and the React
  component are separate imports of about 1 kB each.
- Sounds in one line: `board.use(sounds())`. The board tells what every
  change was (a move, a capture, castling, a promotion), so a sound, a move
  list or a clock needs no work of its own to find out.
- No chess rules inside: your app says which moves are allowed.
- MIT.

Status: the library is complete for our needs and tested in Chromium and
WebKit; it has not run in production yet and is not on npm.

```ts
import { lightsquare } from "lightsquare";
import { shapes } from "lightsquare/shapes";
import "lightsquare/lightsquare.css";
import "lightsquare/pieces/cburnett.css";

const board = lightsquare(document.getElementById("board")!, {
  movable: "white",
  targets: new Map([["e2", ["e3", "e4"]]]),
  onMove({ from, to }) {
    // check the move with your chess rules, then confirm or take back:
    board.set({ position: fenAfterTheMove });
  },
});
board.use(shapes({ arrows: [{ from: "e2", to: "e4" }], draw: true }));
```

What it has: sliding pieces, captures, castling, en passant and promotion
worked out from two positions; tap and drag; premove; last move, check,
selection and move dots; coordinates; your own marks and badges; arrows and
circles, drawn by the app or by the user; a promotion picker; HTML on
squares; screen-reader text and moves by keyboard; a React component;
themes as data (squares, pieces, arrows) that one call applies to a whole
page.

## Read first

- [docs/API.md](docs/API.md): everything the library offers.
- `npm run bench`: the playground. Play, change the looks, measure on a
  phone. `npm run demo` builds the same page as plain files (`site/`); it
  is published at https://kibitzo.github.io/lightsquare/ on every push.
- [compare/RESULTS.md](compare/RESULTS.md): Lightsquare measured next to
  four other boards (Lichess's chessground, cm-chessboard, react-chessboard
  and chessboard.js), with the method and its limits. The
  comparison is a project of its own in `compare/`; the library does not
  depend on it.
- [RULES.md](RULES.md): the hard rules every change obeys.
- [ARCHITECTURE.md](ARCHITECTURE.md): the design, the comparison with other
  boards, how it is tested, the order of work.

## Work on it

    npm test                 unit tests
    npm run test:browser     Chromium and WebKit, desktop and phone profiles
    npm run build            dist/ and the sizes
    npm run bench            a page for a real phone, on the local network

## Credits

Chess pieces by Colin M.L. Burnett (Cburnett), from Wikimedia Commons, used
under the BSD licence: [assets/cburnett/NOTICE.md](assets/cburnett/NOTICE.md).
