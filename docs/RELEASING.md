# Releasing Lightsquare to npm

The package is `@kibitzo/lightsquare`. A release is made by pushing a version
tag; GitHub then tests, builds, checks the packed file and publishes it
(`.github/workflows/publish.yml`). No npm token is stored anywhere: npm
trusts that one workflow of this repository (a Trusted Publisher), and shows
on the package's page which commit each version was built from
(provenance).

## Set up once

Done by a member of the organisation `kibitzo` on npmjs.com, in the
package's Settings, under Trusted Publisher, GitHub Actions:

- Organisation or user: `kibitzo`
- Repository: `lightsquare`
- Workflow filename: `publish.yml`

Version 0.1.0 is the one exception: npm sets a Trusted Publisher only for a
package that exists, so the first version was published by hand from the
tagged commit (`npm publish --access public`, approved in the browser).

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

5. Watch the run (`gh run watch -R kibitzo/lightsquare`). When it is green:
   `npm view @kibitzo/lightsquare version` shows the new number.

The workflow does nothing if that version is on npm already, so pushing a
tag twice is harmless.

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
