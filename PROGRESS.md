# PROGRESS — google-services-mcps docs site (branch `revamp`)

Base: `b8f114ef45e6d3a2550619438e4529912bca28ca` (main). Worktree: `D:\Projects2\githubStuff\_tmp\google-services-mcps-site`.

## Plan

1. Skeleton: `site-revamp/`, `scripts/build_site.py`, `requirements-site.txt`, `.github/workflows/site.yml`, `.gitignore` append.
2. Tokens, templates, CSS, JS, favicon.
3. Three original SVG diagrams.
4. Content data, one JSON per page, with a claims list per page.
5. Generated product reference from `plugins/*/` (23 folders).
6. OG image (1200x630) generated once from an HTML mock, committed as a source asset.
7. Gates, `--check`, local serve, HTTP sweep, browser matrix.
8. README site link, draft PR.

## Decisions

- **Output directory.** The brief says the new output goes in `docs/`. In this repository `docs/` already holds the product's 62 Markdown docs (`docs/*.md`, `docs/products/*.md`, `docs/capabilities/*.md`, `docs/limits/*.md`), which the plugin manifests link to. The builder therefore writes only its own paths under `docs/` and never touches a `.md` file. The gate fails if an HTML file, asset, `sitemap.xml`, `robots.txt`, `og.png`, `favicon.svg` or `CNAME` under `docs/` is not in the fresh build. Recorded as a deviation.
- **Source directory.** `site-revamp/` (the brief's collision rule), because `site/` is the old generated output and is read-only.
- **Tool count.** The product's own rule (`src/core/runtime-tools.ts`, `registersEntry`): runtime tools only for the server's sign-in group; for the service-account group, only tools whose scopes the key holds. Replicated in Python and checked against all 23 `docs/capabilities/*.md` pages: every total and kind count matches. Published total: 3,558.
- **Numbers not published.** The README says 3,334 tools in one place and 3,558 in another; the installer says 3,334. The site publishes the computed 3,558 and records the discrepancy in the claims ledger.
- **No screenshots.** The repository has one tracked image and no product UI captures. Diagrams and generated tables carry the pages.

## Log

- 2026-11-10: read the brief, spec, recon, playbook references; inspected the repository data model; wrote the analysis scripts under `_revamp/google-services-mcps/`; created the worktree skeleton.
- 2026-11-10: builder, tokens, templates, CSS, JS, favicon, three diagrams, og.png, all 11 static pages, 23 generated product pages. All gates pass; `--check` byte-identical.
- 2026-11-10: 17 gate proofs, each on a deliberately broken input; all fail as expected.
- 2026-11-10: local serve on 8130; 113 paths, all 200; responsive matrix 34 pages at 390/768/1440 plus 8 pages at 360/1024/1280/1920, no overflow; accessibility checks clean; screenshots reviewed at 390/768/1440.
- 2026-11-10: claims ledger generated (244 rows); README site link added.

## Commits

- `ee84ce5f` site: add the revamp source, builder and site workflow
- `1e4342bb` site: generate the docs site into docs/
- `624160ca` site: add section headings before the product cards and the FAQ
- next: README site link and progress notes, then push and the draft PR.
