# Google services MCP suite

MCP servers for Google APIs, packaged as one Claude Code plugin per Google product (23 plugins) in one marketplace. Install the products you need, then turn each plugin's server on or off for a session with `/mcp`. Each plugin bundles one MCP server, its consent hook, its tool map, its catalog subset and a skill. Everything is generated from `config/products.json`.

## Products

Per-method tools are generated from Google's Discovery documents: one tool per method of the product's APIs. Gateway APIs are reached through three generic tools (`api_search`, `api_describe`, `api_call`), so their methods do not each take a tool. Total tools also include the hand-written tools of the curated products (Cloud, Search Console, Gmail, Drive, Calendar and Workspace Admin).

| Plugin | Product | Login group | Per-method tools | Gateway APIs | Total tools |
|---|---|---|---|---|---|
| `gcloud` | Google Cloud | cloud | 350 | 277 | 374 |
| `gai` | AI and ML | cloud | 350 | 45 | 354 |
| `gsc` | Search Console | searchconsole | 20 | 0 | 31 |
| `gsearch` | Search and Web Quality | apikey | 47 | 2 | 51 |
| `gdrive` | Google Drive and Docs | workspace-user | 175 | 2 | 185 |
| `gmail` | Gmail | workspace-user | 87 | 2 | 97 |
| `gcalendar` | Google Calendar | workspace-user | 38 | 0 | 46 |
| `gchat` | Google Chat | workspace-user | 60 | 0 | 61 |
| `gmeet` | Google Meet | workspace-user | 24 | 0 | 25 |
| `gcontacts` | Contacts and Profile | workspace-user | 59 | 2 | 63 |
| `gtasks` | Tasks and Keep | workspace-user | 21 | 0 | 22 |
| `gclassroom` | Google Classroom | workspace-user | 104 | 0 | 105 |
| `gapps` | Apps Script | workspace-user | 18 | 0 | 19 |
| `gadmin` | Workspace Admin | workspace-admin | 339 | 4 | 362 |
| `ganalytics` | Google Analytics | business | 66 | 1 | 70 |
| `gtm` | Tag Manager | business | 106 | 1 | 110 |
| `gyoutube` | YouTube and Blogger | business | 124 | 0 | 125 |
| `gbusiness` | Business Profile | business | 51 | 0 | 52 |
| `gads` | Ads and Publisher | business | 350 | 23 | 354 |
| `gmerchant` | Merchant Center | business | 154 | 12 | 158 |
| `gplay` | Google Play | developer | 349 | 7 | 353 |
| `gfirebase` | Firebase | developer | 297 | 9 | 301 |
| `gmaps` | Maps and Location | developer | 35 | 0 | 36 |

The counts are from the last `npm run build`. The per-method count is at most 350 for every plugin, the cap for generated tools.

## Install

In Claude Code, add this repository as a marketplace once, then install one product per plugin:

```
claude plugin marketplace add <path-or-github-url-of-this-repo>
claude plugin install gmail@google-services-mcps --scope user
```

Scopes: `user` (all your projects), `project` (shared through the project's settings), `local` (this folder only, not shared).

Plugin settings (asked at install, and changeable later in the plugin settings): **Allow write tools** (off by default), **Confirm before changes** (`every-change` by default), and an optional token directory. `gadmin` also asks for the super admin email and the service account key file.

To turn a plugin's server on or off for the current session, use `/mcp`.

Other agents (Codex, OpenCode, Antigravity) use the same plugins through the CLI in each plugin folder:

```
node <plugin folder>/bin/gsm.mjs install --agent codex --plugin gmail --scope global
node <plugin folder>/bin/gsm.mjs uninstall --agent codex --plugin gmail --scope global
```

`<plugin folder>` is the folder with `bin/gsm.mjs`. From a checkout it is `plugins/<id>`. Run `gsm --help` for every flag. Each config file is backed up before it changes, and `--dry-run` prints the changes without writing.

## Log in

Each plugin logs in to one auth group, and the login covers only that plugin's server. Run these from the plugin folder (`<plugin folder>` as above).

**OAuth desktop client** (groups `cloud`, `workspace-user`, `searchconsole`, `business`, `developer`). Create an OAuth client of type **Desktop app** in the Google Cloud console, download its JSON, then:

```
node <plugin folder>/bin/gsm.mjs setup-client <client_secret.json>
node <plugin folder>/bin/gsm.mjs login <group>
node <plugin folder>/bin/gsm.mjs status
```

`login` takes `--profile readonly|readwrite|full` (default `readonly`), or `--scopes <urls>` for an exact scope list. Restart the MCP server after a login so the new scopes apply.

**Service account** (group `workspace-admin`, plugin `gadmin`). The service account needs domain-wide delegation for the admin scopes. Then:

```
node <plugin folder>/bin/gsm.mjs setup-admin --subject <super admin email> --key-file <service account JSON>
```

The same two values can be set in the plugin settings instead.

**API key** (group `apikey`, plugin `gsearch`). No sign-in. Store the key once. It is read from `GSM_API_KEY_INPUT` or from stdin, never from a command argument:

```
node <plugin folder>/bin/gsm.mjs setup-apikey
```

Tokens are stored in `~/.google-services-mcps` (mode 0600), or in the token directory set in the plugin settings or `GSM_TOKEN_DIR`. `gsm logout <group>` removes one group's token.

## Safety model

- **Reads never ask.** A read tool runs without an approval.
- **Changes are off until you allow them.** Modifying and deleting tools are listed only when **Allow write tools** is on (`GSM_ALLOW_WRITES=true`).
- **The approval gate.** Each change (a write) and each delete, disable or send (destructive) goes through the gate before it runs. A call the gate refuses is not run, and the audit line records the decision. A client that cannot ask for approval gets a refusal, not a silent run.
- **The confirmation setting.** `every-change` (default) asks before every change and every destructive action. `destructive-only` asks only before destructive actions and lets changes run. `off` asks for nothing. Change it in the plugin settings (`GSM_CONFIRMATION`). Deny rules still apply in every mode.
- **Policy rules.** `policy.json` in the token directory holds `{"confirmation": "...", "rules": [{"match": "...", "action": "allow|ask|deny"}]}`. A rule matches a tool name or a method id, by glob (`*`, `?`) or by a regular expression written `re:...`. A matching `deny` always wins. A matching `ask` asks even when the mode would not. A matching `allow` skips the default question, but never overrides a `deny`.
- **Scope profiles.** `readonly` (default) registers read tools with read-only scopes. `readwrite` adds write and destructive tools with the narrowest scopes that cover them. `full` covers every tool with the broadest listed scope. A tool whose scopes the token lacks is not registered.
- **Audit.** Each decision is appended to `audit.log` in the token directory. It holds the time, tool, method and decision, never the argument values.

## Google organisation constraints

- An OAuth app in **Testing** status loses its refresh tokens after 7 days. Use an **Internal** consent screen (a Google Workspace organisation), or publish the app.
- Organisations created since 2024-05 block service account key creation by default. A Workspace or Cloud admin must allow it before `setup-admin` can use a key file.
- Restricted Gmail and Drive scopes need a verification and a security assessment for a public app. Internal apps are not affected.

## Development

```
npm install
npm run typecheck
node scripts/snapshot-discovery.mjs   # Discovery documents and scopes (needs network)
node scripts/gen-servers.mjs          # config/servers.json from config/products.json
npm run build                         # compile, then bundle the 23 plugins into plugins/<id>/
npm test                              # compile, then the unit and build tests
node scripts/smoke.mjs                # start every plugin server over stdio (after npm run build)
```

Run `gen-servers` before `snapshot-discovery`, because the snapshot reads the server map. To add a product, change `config/products.json` and run the steps above.

Layout:

- `config/products.json`: the source of truth. One entry per product, with its group, curated module, generated APIs and gateway APIs.
- `config/servers.json`: generated from it (do not edit). `config/tool-kinds.json`: safety overrides for Discovery methods.
- `data/discovery/`, `data/catalog.json`, `data/scopes.json`: committed snapshots that the build copies into each plugin.
- `src/core/`: config, auth, the tool runner and approval gate, the Discovery engine, the gateway.
- `src/servers/`: curated tools (Cloud, Search Console, Gmail, Drive, Calendar, Workspace Admin).
- `src/cli/`: the installer and login CLI. `src/hook/`: the PreToolUse consent hook.
- `plugins/<id>/`: one generated plugin per product: `servers/`, `bin/`, `discovery/`, `tool-map.json`, `method-kinds.json`, `catalog.json`, `hooks/`, `skills/`, `.mcp.json` and `.claude-plugin/plugin.json`.
- `build/` (not committed): the generated server entries that `npm run build` bundles.

Check a plugin with `claude plugin validate ./plugins/<id>`.

## Status

Built and tested with unit tests, build-output tests and a stdio smoke test over every plugin server. Not yet run against live Google accounts. Test each product with a read tool first.

## License

Not chosen yet.
