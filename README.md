# Lightsquare

A chessboard for the web that stays smooth on every phone, including old
ones and phones in Low Power Mode.

- Pieces are moved by the browser, not by script: a move is one style change
  and a CSS transition. A slide keeps going even while the page's script is
  busy (a test shows this in Chromium; real phones are measured with the
  bench page).
- At rest the board does nothing: no timers, no frames, no paints.
- About 3 kB of script (minified and gzipped), no dependencies.
- No chess rules inside: your app says which moves are allowed.
- MIT.

Status: early. The core (pieces, marks, the app's own marks and badges, tap
and drag, events) is built and tested; coordinates, premove, arrows, the
promotion picker and the React wrapper are next. Not on npm yet.

```ts
import { lightsquare } from "lightsquare";
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
```

## Read first

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
