## What this changes

## Why

## Checks

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build` and then `node scripts/smoke.mjs`
- [ ] Regenerated the generated docs, if products or tools changed: `npm run surfaces`, `node scripts/gen-capabilities.mjs`, `node scripts/gen-readme.mjs`

## Safety

- [ ] Writes and deletes still pass the approval gate. No new path returns `allow` for a change.
- [ ] No tokens, client files, API keys or account data in the diff or the test fixtures.
- [ ] No live Google calls were needed. If they were, say what was called below.

## Notes for the reviewer
