# Google services MCP suite

MCP servers for Google Cloud, Google Workspace, Google Search and Google Business, packaged as four Claude Code plugins (one per category) in one marketplace. The same servers can be installed into Codex, OpenCode and Antigravity (`agy`).

| Plugin | Servers | Covers |
|---|---|---|
| `google-cloud` | `gcloud`, `gcloud-ops`, `gcloud-data`, `gcloud-compute` | Projects, APIs, API keys, IAM, monitoring, logging, billing, BigQuery, Storage, Cloud Run, Compute Engine and more |
| `google-workspace` | `gws-user`, `gws-admin` | Gmail, Drive, Calendar (curated); Docs, Sheets, Slides, Forms, Tasks, People, Chat, Apps Script, Meet; admin users, org units, groups, reports, licensing, Vault |
| `google-search` | `gsc` | Search Console sites, sitemaps, analytics, URL inspection; Custom Search, site verification, Indexing API |
| `google-business` | `gbiz` | Google Analytics admin and data, Tag Manager, YouTube, Business Profile |

Curated servers have hand-written tools with safety rules. Generated servers expose every method of their APIs, built from Google's Discovery documents, and classify each method as read, write or destructive.

## Install

**Claude Code** (marketplace):

```
claude plugin marketplace add <path-or-github-url-of-this-repo>
claude plugin install google-cloud@google-services-mcps --scope user
```

Scopes: `user` (global), `project` (shared through the project), `local` (this folder, not shared).

**Codex, OpenCode, Antigravity** (CLI, from this repo):

```
node plugins/google-cloud/bin/gsm.mjs install --agent codex --scope global
node plugins/google-cloud/bin/gsm.mjs install --agent opencode --scope project
node plugins/google-cloud/bin/gsm.mjs install --agent agy --scope global
node plugins/google-cloud/bin/gsm.mjs uninstall --agent codex --scope global
```

Scopes: `global` (your home config), `project` (current folder), `folder` (with `--path <dir>`). `--dry-run` shows the changes without writing. Each config file is backed up before it is changed.

## One-time login

Create a Google Cloud OAuth client of type **Desktop app**, then:

```
node plugins/google-cloud/bin/gsm.mjs setup-client <client_secret.json>
node plugins/google-cloud/bin/gsm.mjs login cloud
node plugins/google-cloud/bin/gsm.mjs status
```

Login groups: `cloud`, `workspace-user`, `searchconsole`, `business`. Admin tools use a service account with domain-wide delegation instead (set the admin email and key file in the plugin settings). Tokens are stored in `~/.google-services-mcps` (mode 0600) unless `GSM_TOKEN_DIR` is set.

## Safety model

- **Read-only by default.** Write tools are not registered unless the plugin's "Allow write tools" setting (or `GSM_ALLOW_WRITES=true`) is on.
- **Destructive tools need confirmation.** Delete, disable, send, trash and remove tools return a preview unless the call passes `confirm: true`.
- **Least privilege.** Each login group requests only the scopes its servers need, computed from the server map.
- **No secrets in config files.** Credentials live in the token directory, never in the plugin or agent config.
- **Clear boundaries.** Calendar on/off per org unit and the Indexing API for ordinary pages are not available through any Google API; the docs say so.

## Development

```
npm install
npm run typecheck
node scripts/snapshot-discovery.mjs   # refresh Discovery documents and scopes (needs network)
npm run compile && npm test           # tests run against compiled output
npm run build                         # bundle the four plugins into plugins/<name>/
claude plugin validate ./plugins/google-cloud
```

Layout:

- `config/servers.json`: the single source of truth for plugins, auth groups, servers, and the APIs each server exposes.
- `src/core/`: config, auth, tool runner with the safety gating, and the Discovery engine.
- `src/servers/`: one entry per MCP server.
- `src/cli/`: the installer and login CLI, bundled into each plugin.
- `data/discovery/`: committed Discovery snapshots (compact).
- `plugins/<name>/`: generated bundles plus the plugin manifest and skill.
- `reference/` (not committed): clones of community projects used for research. See `docs/reference-review.md`.

## Status

Built and tested with mocks and schema tests. Not yet run against live Google accounts, because no OAuth client or service account was configured while building. Test each server with a read tool first.

## License

Not chosen yet.
