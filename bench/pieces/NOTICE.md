# Chess pieces: Staunty (shown on the demo page only)

`staunty.svg` is the "Staunty" chess piece set by sadsnake1, as published
with Lichess (`public/piece/staunty` in
https://github.com/lichess-org/lila, listed in its COPYING.md), with its
colours changed for Kibitzo (the dark pieces and the shading), and put into
one file with one group per piece.

Licence: Creative Commons Attribution-NonCommercial-ShareAlike 4.0
International (CC BY-NC-SA 4.0),
https://creativecommons.org/licenses/by-nc-sa/4.0/

- You may share and change it, with credit to its author, for purposes
  that are not commercial, and only under this same licence.
- This file, with our colour changes, is under that same licence. It is
  not under the MIT licence of Lightsquare.

Where it is used: only by the presentation page in `bench/` (the demo at
https://kibitzo.github.io/lightsquare/), to show the board with a second
piece set. It is not part of the library: it is not in `src/`, not in
`dist/`, and not in the npm package, which ships the Cburnett set
(`assets/cburnett/NOTICE.md`). RULES.md, rule 12, names this one exception,
and `tests/unit/rules.test.ts` holds it there.
