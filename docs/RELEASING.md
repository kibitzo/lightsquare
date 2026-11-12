# Releasing Lightsquare to npm

The package is `@kibitzo/lightsquare`. A release is made by pushing a version
tag; GitHub then tests, builds, checks the packed file and publishes it
(`.github/workflows/publish.yml`). Nobody publishes from a laptop, so every
version on npm was built from a commit anyone can read, and npm shows that
(provenance).

## Once, before the first release

1. On npmjs.com, the organisation `kibitzo` must exist and you must be a
   member of it (Add organisation, the free plan: public packages cost
   nothing).
2. Make an access token that may publish: npmjs.com, Access Tokens, Generate
   New Token, Granular Access Token, Read and write, limited to the
   organisation `kibitzo`.
3. Give it to the repository as the secret `NPM_TOKEN`:

       gh secret set NPM_TOKEN -R kibitzo/lightsquare

   (it asks for the token; it is never written to a file here).

After the first release the token can go: on npmjs.com, in the package's
settings, name this repository and `publish.yml` as a Trusted Publisher,
remove `NODE_AUTH_TOKEN` from the workflow and delete the secret.

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
