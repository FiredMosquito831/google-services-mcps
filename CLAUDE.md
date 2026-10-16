# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

google-services-mcps is a set of MCP servers for Google products, packaged as Claude Code plugins in one marketplace, with an installer (`gsm`) for Codex, OpenCode and Antigravity (`agy`). One plugin per product (23 in total), and each plugin runs one MCP server with the same name as the plugin. Public repository: https://github.com/FiredMosquito831/google-services-mcps (owner FiredMosquito831). Licence Apache-2.0 with NOTICE. The website is GitHub Pages from `site/`.

Status: built and tested offline (513 tests on Windows: 512 pass, 1 opt-in test skipped; the Linux count is checked before each release), smoke test over all servers, plugin validation. The npm package is `google-services-mcps`, one package. 0.1.4 is live under that name (GitHub release v0.1.4, published with provenance). The scoped name `@firedmosquito831/google-services-mcps` (0.1.3 is its latest) is still to be deprecated: the owner runs `npm deprecate` in a terminal, because it needs a one-time password. The `npm` workflow publishes the package when a GitHub release is published (trusted publishing, with provenance). Not yet run against live Google accounts. Treat any claim about live behaviour as unverified until a live test has run.

## Stack and versions

- Node 20 or newer (`engines`); developed on Node v24.6.0. npm 11. The publish workflow uses Node 24 and npm 11.5.1 or newer (trusted publishing).
- TypeScript `~5.9.3` (not 7). Compiles to `dist/` (ESM, NodeNext).
- `@modelcontextprotocol/sdk` 1.29.x, `zod` ^3.25 (v3 API), `google-auth-library` ^11, per-API `@googleapis/*` packages (admin, apikeys, calendar, cloudresourcemanager, drive, gmail, searchconsole, serviceusage, webmasters), `esbuild` ^0.28 (bundles everything; plugins need no `node_modules`).
- Dependencies are dev-only in `package.json` on purpose: the bundles are self-contained.
- Claude Code CLI (`claude plugin ...`); the installer shells out to it.
- One npm package, `google-services-mcps`. The `files` list in `package.json` is the whole shipped payload: `gsm.mjs`, `plugins/`, `config/`, the install scripts, README, LICENSE, NOTICE and `docs/TUTORIAL.md`.

## Commands

Run from the repository root.

- `npx tsc --noEmit`: typecheck.
- `npx tsc -p tsconfig.json`: compile to `dist/`. Tests import from `dist/`, so compile before running a single test file.
- `npm run build`: bundle the 23 plugins and the root `gsm.mjs` (`scripts/bundle.mjs`). Rewrites `plugins/**`.
- `npm test`: compile, then `node --test tests/*.test.mjs`.
- One test file: `npx tsc -p tsconfig.json` then `node --test tests/gate.test.mjs`.
- `node scripts/smoke.mjs`: starts every bundled server over stdio (needs a build).
- `claude plugin validate .` and `claude plugin validate plugins/<id>`: manifest checks.
- Generators (never hand-edit their output): `npm run surfaces` (`docs/SURFACES.md`), `node scripts/gen-capabilities.mjs` (`docs/CAPABILITIES.md`, `docs/capabilities/`), `node scripts/gen-readme.mjs --check` (README products block), `node scripts/gen-site.mjs` (site product section, sitemap), `node scripts/gen-servers.mjs` (`config/servers.json` from `config/products.json`), `node scripts/build-catalog.mjs` (`data/catalog.json`), `node scripts/snapshot-discovery.mjs` (`data/discovery/`, `data/scopes.json`).
- `npm run pack:check` or `npm publish --dry-run --access public --ignore-scripts`: what would be published. Without `--ignore-scripts`, `prepublishOnly` runs the build and tests.
- Bump: `node scripts/bump.mjs patch|minor|major` (or `X.Y.Z`) moves `package.json` and `package-lock.json` together. Release: publish a GitHub release `vX.Y.Z` (not a draft) after the bump is on main. `.github/workflows/npm.yml` checks the tag against `package.json` and publishes the package. Nothing publishes on a push.
- Installer, always with a temp home in tests: `node gsm.mjs install --agent <claude|codex|opencode|agy|all> --plugin <id,...>|all [--scope global|project|local] [--path <dir>] [--dry-run] [--home <dir>]`, and `node gsm.mjs uninstall ...` or `uninstall --all --yes`, `node gsm.mjs list`.
- For Claude Code tests, set `CLAUDE_CONFIG_DIR` to a fresh temp folder. This isolates Claude's own state (verified).

## Architecture (big picture)

Four layers, and the generated plugin folders are the join point.

1. **Product map** (`config/products.json`, the source of truth). Each product has a group, a server name (equal to its id), a curated module or none, a list of generated APIs (per-method tools, capped at 350 tools per server) and a list of gateway APIs. `config/servers.json` is generated from it.
2. **Tool generation.** Curated tools are hand-written in `src/servers/*.ts` (each exports `buildTools(cfg)`). Generated per-method tools come from Google's Discovery documents (`src/core/discovery/`, snapshots in `data/discovery/`). Gateway tools (`api_search`, `api_describe`, `api_call`, in `src/core/gateway.ts`) reach every other API of the product through the catalog (`data/catalog.json`, 533 entries and about 29,000 methods). `scripts/bundle.mjs` merges curated, generated and gateway tools into one entry per server.
3. **Runtime** (`plugins/<id>/`, generated). `servers/<id>.mjs` is the MCP server. `hooks/hooks.json` runs `bin/gsm-hook.mjs` before each call to the plugin's tools. `tool-map.json` and `method-kinds.json` tell the hook the safety class of each tool and method. `.mcp.json` passes plugin options (allow_writes, confirmation, token_dir) to the server as env vars.
4. **Installer** (`src/cli/`, bundled into `gsm.mjs` at the root and into each plugin's `bin/`). Installs into Claude Code via the `claude plugin` CLI, and into Codex, OpenCode and agy by writing their config files. Each install copies the product's files to `<home>/.google-services-mcps/runtime/<product>/` and points the agent config there.

**Consent and safety flow.** Reads never prompt. Write and destructive tools are only listed when `GSM_ALLOW_WRITES=true`. Writes prompt through the hook. Destructive tools prompt twice: the hook, then an MCP elicitation with an exact preview from `ctx.gate()` (`src/core/approval.ts`). Clients with neither hooks nor elicitation fail closed. Policy rules (`policy.json` in the token directory) allow, ask or deny by tool or method. Audit lines hold a hash of the arguments, never the values. The model cannot bypass any of this: there is no model-controlled `confirm` argument, and it must not be reintroduced.

**Scopes.** Logins request a profile (`readonly` default, `readwrite`, `full`, or an explicit list). Tools the stored token cannot use are not registered. Logins merge with stored scopes by default; `--replace` drops them. Gateway methods count toward login coverage too (`src/core/scopes.ts`, `src/core/registry.ts`).

**Shared rules that live in two places.** `src/core/discovery/methods.ts` (`classifyMethod`) and `src/cli/method-kinds.ts` (a copy, used by the plugin bundles) must agree. `tests/cli-surface.test.mjs` checks every catalog method.

## Rules (repository-specific)

- Versioning: a commit on `main` that changes a production file bumps the version in the same commit, with `node scripts/bump.mjs patch|minor|major`. Production files: `src/**`, `config/**`, `scripts/bundle.mjs`, `scripts/install.*`, and `package.json` (name, bin, files, dependencies). Tests, docs, `site/`, README, this file and `.github/**` need no bump on their own. A commit that mixes both still bumps.
- Semver: PATCH for fixes, refactors with no visible change, dependency updates and install fixes. MINOR for new commands, options, tools, products or behaviour. MAJOR for breaking changes: removed or renamed commands, options, environment variables or config keys, or anything users must act on. When unsure between PATCH and MINOR, pick PATCH for a fix and MINOR for new capability.
- Release: after the bump is on `main`, publish a GitHub release `vX.Y.Z` (not a draft). That starts the npm publish. A push does not. Plugin manifests keep `MANIFEST_VERSION` in `scripts/bundle.mjs` and change only when plugin content changes.
- Keep this file current. When the stack, a command, a rule, a preference or a non-obvious fact changes, update the matching section in the same change. Correct a stale line rather than adding a contradiction.
- Do not hand-edit generated output: `plugins/**`, `gsm.mjs`, `dist/`, `build/`, `config/servers.json`, `docs/SURFACES.md`, `docs/CAPABILITIES.md`, `docs/capabilities/`, the README products block, the site product section. Change the source (`config/products.json`, `src/**`, `scripts/**`) and regenerate.
- Tool names must fit 64 characters including the prefix `mcp__plugin_<plugin>_<server>__`. Budget = 49 minus the lengths of the plugin id and the server name. Keep plugin ids short; the generator enforces the budget for generated names.
- Writes and destructive actions go through `ctx.gate()`. Never call a Google API that changes state from a path that skips the gate.
- Anything that reads a method's kind must use `classifyMethod`. A POST counts as a read only for the narrow verb list and exact names in `src/core/discovery/methods.ts`. Credential names (token, credential, secret, password, authorization, key) are always writes.
- Scopes merge by default. Never make a login overwrite stored scopes unless the user passes `--replace`.
- Installer tests always pass `--home <temp dir>`. Claude tests always set `CLAUDE_CONFIG_DIR`. Never let a test write into the real home folder or the real Claude config.
- Never commit tokens, client secret files, `HANDOFF.md`, `reference/`, `session/` or `.remember/` (all gitignored). Scan before any push that might expose something new.
- In docs and messages, write commands as `node gsm.mjs ...` from the repository. A bare `gsm` works after `npm install -g google-services-mcps`, which also gives the command `google-services-mcps`.
- Do not publish to npm, push, force-push, change repository visibility, deprecate a package, or send anything outward without the owner's explicit go-ahead in the current conversation. Committing locally is fine.
- Commit messages end with `by FiredMosquito831`. Commit author is the GitHub no-reply address (repository-local `user.email`).
- On Windows, write commit messages to a file and use `git commit -F`. Redirect git's CRLF warnings with `2>$null`.

## Learnings

Append a dated bullet whenever you learn something non-obvious about this repository. Keep it short and true.

- 2026-10-15: `git filter-branch` keeps the original commits under `refs/original`; delete those refs and run `git reflog expire --expire=now --all && git gc --prune=now` before judging whether an old value is still present.
- 2026-10-15: `npm publish --dry-run` runs `prepublishOnly` (build and tests). Use `--ignore-scripts` for quick dry runs.
- 2026-10-15: the installer records installs in the gsm home (`runtime/installs.json`) even when `CLAUDE_CONFIG_DIR` is set. A test once wrote into the real home. Always pass `--home`.
- 2026-10-15: the Google Discovery directory lists only preferred versions. The Admin SDK is one name (`admin`) with several versions, and some APIs (cloudquotas, generativelanguage, googleads v26) need direct discovery URLs. Webmasters is covered by the `searchconsole` document.
- 2026-10-15: Discovery endpoints that fail (contentwarehouse and poly return 502; area120tables, datalabeling and mybusinessqanda return 404) stay unassigned in `config/products.json` with a reason.
- 2026-10-15: plugin bundles need the `createRequire` banner, because some dependencies are CommonJS.
- 2026-10-15: Google Ads developer tokens were sunset on 2026-09-09. Access now belongs to the Cloud project of the OAuth client, and the suite treats the token as optional.
- 2026-10-15: Custom Search JSON API is reported closed to new customers and to be discontinued on 2027-01-01. Not confirmed; check in the Cloud console before relying on it.
- 2026-10-15: a local directory marketplace makes Claude read plugin files straight from the repository (per Claude Code docs). A GitHub marketplace uses a copy in the plugin cache.
- 2026-10-15: subagent reports were wrong more than once (stale counts, a flag that did not exist). Verify the state yourself before reporting it.
- 2026-10-16: in Git Bash on Windows, `curl` can resolve to `C:\Windows\System32\curl.exe`, which cannot write to a `/tmp` path. `scripts/install.sh` passes curl a `cygpath -w` path for that reason. Regression test `4c` puts System32 first on PATH.
- 2026-10-16: `.gitattributes` has `* text=auto eol=lf`. The owner's Windows git has `core.autocrlf=true`, and `install.sh` must stay LF for Linux `sh`.
- 2026-10-16: `npx <file.tgz> ...` exits 0 and runs nothing. Test a tarball with `npm install -g --prefix <dir> <tgz>` (then `<dir>\gsm.cmd`) or `npm exec --package=<tgz> -- gsm ...`.
- 2026-10-16: in `cmd`, `move` of a folder from `%TEMP%` to another drive fails with "Access is denied". `scripts/install.cmd` uses `xcopy` for that step. Test `5. cmd: ... another drive` runs when a second drive exists.
- 2026-10-16: `npm publish` from this shell stops at `EOTP` (browser approval). The owner runs `npm publish --access public` in a terminal and approves in the browser. `prepublishOnly` runs the build and the tests first (about 6 minutes).
- 2026-10-16: on this machine the `sh` on PATH is msys64's, not Git for Windows'. In a test, the `sh` that a piped `curl | sh` starts did not see `USERPROFILE`, `CLAUDE_CONFIG_DIR` or `GSM_DIR` exported by the parent script. The cause was not fully established, and that run wrote a marketplace and folders into the real profile. Before a one-liner test, probe the environment inside the pipeline, and check the real Claude config afterwards with `claude plugin marketplace list`.
- 2026-10-16: the runner (`src/cli/exec.ts`) never uses a shell, and Node cannot start a `.cmd` or `.ps1` shim without one. On Windows, npm, codex and opencode are shims, so `src/cli/requirements.ts` runs them as `cmd.exe /d /c <program> <args>`. Tests of the requirement check run a fake runner, and give `requirements` a stub in the install environment, so they do not depend on this machine's programs.
- 2026-10-16: every printed command starts with `invocation()` (`src/core/invocation.ts`). The `node gsm.mjs` text in messages is replaced at print time, so the same message says `npx google-services-mcps` from npm, `node "<full path>"` from another folder, and `node gsm.mjs` in the repository. Add new messages with `node gsm.mjs` and do not build the prefix by hand.
- 2026-10-16: the interactive layer (`src/cli/prompt.ts`, `src/cli/guided.ts`) only runs in a terminal (stdin and stdout are TTYs). A guided flow builds the same argv a person would type, shows it, and runs it through the same dispatcher. Keep new guided steps the same way, and never put a secret in an argv.
- 2026-10-16: the Claude Code marketplace is the repository folder only when it is a git checkout (`checkoutRootFor` in `src/cli/paths.ts`). An npm package or a zip download has the same files without `.git`, and npm's package has no root `.claude-plugin/marketplace.json`, so those installs use `FiredMosquito831/google-services-mcps` on GitHub. The published 0.1.1 predates this rule, so it needs `--marketplace` for Claude Code.
- 2026-10-16: a test that writes an executable fake (such as a fake `node` on PATH) must `chmod` it. Linux skips a non-executable PATH entry, and the test then runs the real program.
- 2026-10-16: to run the suite on Linux, use WSL (Ubuntu 24.04 here): copy the tree and `.git` into a fixed folder under `$HOME`, then `npm ci && npm test`. The bootstrap tests call `git archive`, which fails without `.git`. Do this from a script file with `set -u`. A copy that never happened left `$NEW` empty, and the repository was extracted into the WSL home folder, which holds the owner's own files. Check every destination variable is set before a `tar -x`, and never extract into `$HOME`.
- 2026-10-16: a published GitHub release starts the npm publish (`.github/workflows/npm.yml`). A push to `main` does not. The tag must equal the version in `package.json`, and a version already on npm is skipped. A release runs the workflow file at its tag's commit, so the workflow must exist there. The release trigger has run for v0.1.2 and v0.1.3.
- 2026-10-16: a publish that fails with `E404 ... PUT` (no permission) is a login problem, not a name problem. `npm login` in the terminal fixed it for `google-services-mcps` (the name is free, and `google-services-mcp` without the "s" is a different package). Do not assume a name is blocked from one 404.
- 2026-10-16: npx and npm cache a package's metadata. After a publish, a `No matching version found` can stay until `npx --prefer-online <package> ...` (or `npm cache clean --force`).
- 2026-10-16: trusted publishing is set on each package's page on npmjs.com, so the package must exist first. The first publish of a name is manual (the owner's terminal, with two-factor). After that `npm.yml` publishes each new version. The `npm.yml` workflow was copied from ase-moodle-mcp.
- 2026-10-16: the package is one name now, `google-services-mcps` (`NPM_PACKAGE` in `src/core/invocation.ts`). The scoped name was the installer, and the unscoped name was a thin wrapper that depended on it. Deprecating the scoped name while the wrapper depended on it would print a deprecation warning on every `npx google-services-mcps` install, so the wrapper was removed first. Rule: deprecate a package name only after nothing you ship depends on it.
- 2026-10-16: a publish is accepted before it is visible. npm printed "Your package is being processed and may take a few minutes to become available". The unscoped name was visible at once; the scoped name took a few minutes. A green step is not proof: check the registry (`https://registry.npmjs.org/<name>/<version>`) and the `+ name@version` line in the log.
- 2026-10-16: `gh run list --workflow` returns the newest run of an event. Right after a release, it can return the previous release's run. Select the run by `headSha`.
- 2026-10-16: npm printed "npm tokens that bypass 2FA are being restricted for account changes and direct publishing" during a publish. Trusted publishing uses no token, but a token fallback (as in my-claude-code) may stop working.
- 2026-10-16: PowerShell's `ConvertFrom-Json` fails on `package-lock.json`, which has an empty-string key (`""`). Edit JSON with `node` instead.
- 2026-10-16: `npm deprecate` needs a one-time password like `npm publish`. From this shell it prints a "deprecating" notice for each version, then stops at `EOTP`, and the registry shows no flag. Check the registry (`versions.<v>.deprecated`) before saying a deprecation happened. The owner runs the command in a terminal.
- 2026-10-16: `gsm install --home <dir>` is refused for `--agent claude`, which always uses the real Claude Code configuration. A dry run into a temp home must use codex, opencode or agy.

## Preferences (the owner)

- Plain, direct English. Short sentences. No marketing tone.
- Safety defaults over convenience: reads never prompt; changes and deletions prompt; the owner accepted the double prompt for destructive actions. The confirmation can be turned off in plugin settings.
- The simplest install is the priority: one command, global by default, scopes global, project and local, the same pattern in every harness, with one-liners per shell (style of the owner's other repos).
- Full coverage of Google APIs, with a separate MCP per product so each can be enabled or disabled.
- Verify before claiming. Say what is unverified.
- Global is the default scope everywhere.
- One npm package, one version, one bump. The owner does not want a second package to keep in step (decided 2026-10-16).
- Releases are approved by version, for example "approve 1.3 for both". An approval covers that release and the publish it starts, not later steps such as a deprecation or a new version.
- Keep this file current as the project changes, and write down what is learned.