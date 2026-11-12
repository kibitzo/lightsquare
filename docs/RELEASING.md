# Releasing Lightsquare to npm

The package is `@kibitzo/lightsquare`. A release takes two acts:

1. A version tag is pushed. GitHub tests, builds, checks the packed file and
   hands it to npm (`.github/workflows/publish.yml`), where it waits,
   unseen by users: it is staged.
2. A maintainer approves it on npmjs.com with two-factor authentication.
   Only then is it published.

So nothing reaches users on the word of the repository alone: a stolen
GitHub login, or a mistaken tag, can stage a version but not publish it.
No npm token is stored anywhere. npm trusts that one workflow of this
repository (a Trusted Publisher), and shows on the package's page which
commit each version was built from (provenance).

## Set up once

Done 2026-11-12 on npmjs.com, in the package's Settings:

- Trusted Publisher, GitHub Actions: organisation `kibitzo`, repository
  `lightsquare`, workflow filename `publish.yml`. Allowed actions: staging
  only (direct publishing is not allowed).
- Publishing access: two-factor authentication required, tokens that
  bypass it not allowed.

Version 0.1.0 was published by hand from the tagged commit, before the
package existed for a Trusted Publisher to be set on.

## Every release

1. Decide the number. Until 1.0: a change that breaks a user's code raises
   the middle number (0.1.0 to 0.2.0), anything else the last one.
2. Set it in `package.json`, then `npm install` so `package-lock.json`
   agrees.
3. Run what GitHub will run:

       npx tsc -p tsconfig.json --noEmit
       npm run test:all
       npm run build
       npm run check:package

4. Commit, then tag and push:

       git tag v0.1.0
       git push origin main v0.1.0

5. Watch the run (`gh run watch -R kibitzo/lightsquare`). When it is green
   the version is staged.
6. A maintainer signs in to npmjs.com, opens Staged Packages (in the
   account's settings), looks at the version and its checksum, and clicks
   Approve; npm asks for the second factor. (`npm stage approve <stage-id>`
   does the same from a terminal.)
7. npm checks a new version before it serves it: for some minutes `npm view
   @kibitzo/lightsquare version` still shows the old number (0.1.0 took
   five minutes; others have waited an hour). Then it shows the new one.

The registry also lists a version `0.0.0-stage`. npm made it itself as a
placeholder while 0.1.0 was being checked; it is not ours and holds
nothing.

The workflow does nothing if that version is on npm already. A staged
version that should not go out is rejected in the same place it would be
approved; its number can then be staged again.

A version that is on npm cannot be replaced. If a release is wrong, fix it
and release the next number; `npm deprecate` marks the wrong one.

## What `npm run check:package` holds

It packs the library, unpacks the file into a small project of its own, and
there:

- the file holds only `dist/`, the README, the licence and the manifest, and
  nothing of the Staunty piece set (rule 12);
- every entry of `exports` names a file that is in it;
- Node imports every script entry by the package's name without a page, as a
  server that renders pages does;
- a TypeScript file that uses every entry compiles, with the library's own
  declarations checked, under each way TypeScript finds modules (`bundler`,
  `node16` and the old `node`).

CI runs it on every push, so a change that would break the package is seen
long before a release.
