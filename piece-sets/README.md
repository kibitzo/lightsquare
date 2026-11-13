# Kibitzo, a chess piece set

A piece set drawn for [Kibitzo](https://kibitzo.com) and for this board.
It is the first set of the demo page and is in the npm package
(`@kibitzo/lightsquare/pieces/kibitzo.css`) since version 0.1.5, next to
Cburnett.

`kibitzo.svg` is one sprite with a group per piece (`wk` ... `bp`), the
shape `scripts/sprite-to-css.mjs` turns into a Lightsquare piece set.

## Licence

CC BY 4.0: use the pieces, change them, sell what you build with them, and
give credit ("Kibitzo chess pieces, kibitzo.com"). The full statement is in
[NOTICE.md](NOTICE.md). © 2026 Danubian Research AG.

After a change to the set, `npm run pieces` writes it into the package's
source (`src/pieces/kibitzo.css`); a test fails while the two disagree.

## Where it comes from

Every shape is drawn from scratch in `make.mjs`, as numbers: no file of
another piece set was traced, copied or edited. Other sets were looked at
the way a draughtsman looks at them, for proportions on the square and for
where shade and light sit; proportions and a way of shading are ideas, not
drawings.

## The pieces

- King: a crown of three lines (an arc across the top, a straight line down
  each side) with a short cross behind the arc.
- Queen: a crown with a rim of five slim prongs, a dome behind it, one ball.
- Rook: the tank. A broad block of battlements in front of a thick body.
- Bishop: one full mitre that runs into the foot, a cup on top, a cut on
  the edge with a line running on from its point.
- Knight: muscular. The back is one arc from the tip of the ear; a long jaw
  climbs to a deep throat; the jaw bone is modelled in the shade tone.
- Pawn: a ball on a collar on a waisted body.
- Every piece stands on a foot whose side leans out a little towards the
  square; every piece but the pawn has a fine line where the foot begins.

## How a piece is drawn

- A symmetric part is given as its right half and mirrored (`lathe`). Its
  curves run through a few stations with no kink at any of them (`smooth`).
  A shape with no axis (the knight) is a list of runs: smooth inside a run,
  a corner where two runs meet (`outline`).
- Parts in one group are one shape with one outline: no line where they
  meet.
- The light comes from the upper left and the shade is one flat tone: a
  band along the right edge of every part, three tenths of the part's half
  width there, so it is broad on a broad form and thin on a thin one. A
  thinner band of light on the left edge. Under a part that lies over
  another, a short shadow in the same tone.
- Only shapes and clips, never a mask: Safari draws an SVG mask at low
  resolution, which looks pixelled on a phone.

## Make it again

    node piece-sets/make.mjs

It writes `kibitzo.svg`, and working pages (`knights.html`,
`bishops.html`, `rooks.html`, `kings.html`, `queens.html`, `bases.html`;
not kept in git) on which candidates for a piece stand side by side on
light and dark squares and on a whole board. `npm run bench` serves them
at `/knights` and so on. A candidate is one more entry in the list of that
page in `make.mjs`.
