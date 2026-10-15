# Install, update, check and remove

This guide gives the exact steps for each agent and scope. Read [GUIDE.md](GUIDE.md) first for the big picture.

Each command in this guide is marked with how it was checked:

- **Checked** means the command was run, or run in `--dry-run` mode, and the output matched.
- **Help only** means the flag or command is in the CLI's own `--help` text, but was not run here.
- **UNVERIFIED** means it could not be checked here. The reason is given.

## Before you start

- **Node.js 20 or newer.** `package.json` requires `>=20`. This machine runs Node v24.6.0.
- **Claude Code** on your PATH. The `claude plugin` commands in this guide were checked against Claude Code 2.1.300.
- **A copy of this repository.** The marketplace is the repository. You can also use its GitHub address (`<owner>/<repo>`).
- **A build, for the full CLI.** Run these from the repository folder:

  ```
  npm install
  npm run build
  ```

  `npm run build` compiles the source into `dist/` and bundles the 23 plugins into `plugins/<id>/`. `dist/` is not in git, so a fresh clone needs this step. (`npm run build` is checked from `package.json` and `scripts/bundle.mjs`. Running it was not part of this check.)

### Two command lines

The suite has one installer, `gsm`. It comes in two forms:

| Form | Run from | Knows | Use it for |
|---|---|---|---|
| `node dist/cli/gsm.js <command>` | The repository folder, after the build | All 23 products | Installing several products. Logging in a whole group. |
| `node plugins/<id>/bin/gsm.mjs <command>` | The repository folder, no build needed | Only the product `<id>` | Working with one product when you have not built. |

**Warning.** A login from a plugin folder covers only that product's scopes. It also replaces the group's token file. If you log in to `gmail` from `plugins/gmail`, then to `gdrive` from `plugins/gdrive`, the second login removes the Gmail scopes. Use `dist/cli/gsm.js` for logins. Pass `--servers` with every product in the group you use.

In the rest of this guide, `gsm` means `node dist/cli/gsm.js`, run from the repository folder.

---

## Claude Code

### 1. Add the marketplace (once)

```
claude plugin marketplace add D:\Projects2\Google-services-mcps
claude plugin marketplace list
```

For a GitHub copy, use `claude plugin marketplace add <owner>/<repo>` instead. **Checked:** `add` accepts a local path or a GitHub owner and repo (from `claude plugin marketplace add --help`). **Checked:** `list` runs and shows configured marketplaces. The marketplace name is `google-services-mcps`.

`--scope` decides where the marketplace is declared: `user` (the default), `project` or `local` (**help only**).

The `gsm install --agent claude` command adds the marketplace for you, but only if `google-services-mcps` is not registered yet. You can use either route.

### 2. Install a product

```
claude plugin install gmail@google-services-mcps --scope user
```

Scope choices:

| `--scope` | Applies to | Shared with others? |
|---|---|---|
| `user` | All your projects. This is the default. | No |
| `project` | The project. It is written to the project's `.claude/settings.json`. | Yes, through the project's settings file |
| `local` | This folder only. | No |

Install other products the same way, one at a time:

```
claude plugin install gcalendar@google-services-mcps --scope user
claude plugin install gchat@google-services-mcps --scope user
```

The product ids are listed in [SURFACES.md](SURFACES.md).

**Help only:** you can set options during install with `--config`:

```
claude plugin install gmail@google-services-mcps --scope user --config confirmation=destructive-only
```

`--config` takes `key=value` for any option the plugin declares. Values are checked against the plugin's schema. This form was not run here.

### 3. Set the plugin options

Every plugin has these options:

| Option | Default | What it does |
|---|---|---|
| **Allow write tools** (`allow_writes`) | Off | Lists the tools that change or delete data. Off means only reads are listed. |
| **Confirm before changes** (`confirmation`) | `every-change` | When to ask. Values: `every-change`, `destructive-only`, `off`. See [USING.md](USING.md). |
| **Token directory** (`token_dir`) | Empty | Where logins are kept. Empty means `~/.google-services-mcps`. |

Two products have more options:

- `gadmin`: **Workspace super admin email** (`admin_subject`) and **Service account key file** (`service_account_key_file`).
- `gads`: **Google Ads developer token** (`ads_developer_token`, optional, sensitive) and **Manager (login) customer ID** (`ads_login_customer_id`, optional). See [SETUP.md](SETUP.md).

You can change options in either of these ways:

1. **In Claude Code.** Run `/plugin`, open the **Installed** tab, select the plugin and choose **Configure options**. The `/config` panel also lists each option. (**Checked against the Claude Code docs, not run here.**)
2. **From the shell.** Show the options and which are unset:

   ```
   claude plugin configure gmail@google-services-mcps
   ```

   Save values from stdin. Pass a JSON object of single-line strings. Options you leave out keep their values:

   ```
   printf '%s' '{"confirmation":"destructive-only"}' | claude plugin configure gmail@google-services-mcps --values-stdin
   ```

   In PowerShell, pipe the same text directly: `'{"confirmation":"destructive-only"}' | claude plugin configure gmail@google-services-mcps --values-stdin`.

   **Help only** for `configure` and `--values-stdin`. `configure` only works once the plugin is installed. Writing a true or false value this way is **UNVERIFIED**. Use the `/plugin` dialog for **Allow write tools**.

After you change an option, apply it with `/reload-plugins`, or restart Claude Code. The dialog says which one applies.

### 4. Check the install

```
claude plugin list
claude plugin list --json
claude plugin details gmail@google-services-mcps
claude plugin validate ./plugins/gmail
```

- `list` shows each plugin with its scope and status, such as `Status: enabled` (the output may show a check mark before the word). Look for the id ending in `@google-services-mcps`. **Checked.**
- `list --json` prints the same data as JSON. **Help only.**
- `details` shows the plugin's components and its projected token cost. **Help only.**
- `validate` checks a manifest. Run it from the repository folder. **Checked:** `./plugins/gmail` passes, and the marketplace manifest at `.` passes.

After an install, `gsm install` also prints the login steps that are still missing. It only reads the token directory to check this. It does not change it.

Then, inside Claude Code, run `/mcp`. The `gmail` server should show as connected. (`/mcp` lists the servers and lets you reconnect or turn one off for the session. **Checked against the Claude Code docs.**)

### 5. Update

1. Pull the new code, or rebuild with `npm run build`.
2. Refresh the marketplace and update the plugin:

   ```
   claude plugin marketplace update google-services-mcps
   claude plugin update gmail@google-services-mcps --scope user
   ```

   **Help only.** `update` says that a restart is needed to apply the change.

3. If the plugin still shows the old version, uninstall it and install it again. Logins are kept, because uninstall does not touch the token directory (see [Remove everything](#remove-everything)).

**UNVERIFIED:** whether `update` picks up a change when the version number stays the same. All plugins in this repository are at version `0.1.0`.

### 6. Turn a plugin off without removing it

```
claude plugin disable gmail@google-services-mcps --scope user
claude plugin enable gmail@google-services-mcps --scope user
```

**Help only.** For one session only, use `/mcp` instead. It does not change the install.

---

## Other agents: Codex, OpenCode, Antigravity

Use the `gsm install` command. It writes the server entries into the agent's own config file. It does not change the plugins.

### Install

Always run a dry run first. It prints every change and writes nothing.

```
node dist/cli/gsm.js install --agent codex --plugin gmail --scope global --dry-run
node dist/cli/gsm.js install --agent codex --plugin gmail --scope global
```

**Checked (dry-run).** The dry run for `codex` printed:

```
[codex] install (dry-run)
  file: <home>\.codex\config.toml (create)
    added keys: gsm-gmail
  note: Restart Codex to load the servers.
summary: would install 1 products, 1 servers, 97 tools; confirmation: not set (plugin default every-change); writes: not set (write tools stay off)
```

For several products, list them with commas:

```
node dist/cli/gsm.js install --agent opencode --plugin gmail,gcalendar,gcontacts --scope global --dry-run
```

`--plugin all` installs all 23 products. Use it only if you need them all.

### Where each agent reads its config

| Agent | `--scope global` | `--scope project` | `--scope folder --path <dir>` | Restart |
|---|---|---|---|---|
| Codex | `~/.codex/config.toml` | `./.codex/config.toml` in the current folder | `<dir>/.codex/config.toml` | Restart Codex |
| OpenCode | `~/.config/opencode/opencode.json` | `./opencode.json` | `<dir>/opencode.json` | Restart OpenCode |
| Antigravity (`agy`) | `~/.gemini/config/mcp_config.json` | Not supported | Not supported | Restart `agy` |

On Windows, `~` is `C:\Users\<you>`. **Checked (dry runs):** all three paths. `agy` only accepts `--scope global`, and `--scope project` returns `agy supports only global scope in this build`.

Notes for each agent:

- **Codex.** All gsm entries live in one managed block, between `# >>> google-services-mcps (managed by gsm) >>>` and `# <<< ... <<<`. Text outside the block is not touched. Codex reads a project `.codex/config.toml` only in trusted projects. Trust the folder in Codex, or the servers stay off.
- **OpenCode.** Each entry is under `mcp` with the key `gsm-<name>`. The file must be plain JSON. A file with comments or trailing commas is refused.
- **Antigravity (`agy`).** The config folder `~/.gemini/config` must already exist. Run `agy` once so that it creates the folder. Then check with `agy mcp list`. The `agy` adapter notes that the file it writes was **not** verified end to end. Confirm with `agy mcp list` after you install.

### Known gap: `--allow-writes` and Claude Code

**Found while writing this guide.** With `--agent claude`, `--allow-writes` is not applied. The install writes no option. The install summary still says `writes: enabled`. For Claude Code, set **Allow write tools** in the plugin options instead (see [Set the plugin options](#3-set-the-plugin-options)). `--confirmation` is also not written for Claude. The install prints a note that tells you to use `claude plugin configure`.

For Codex, OpenCode and Antigravity, both flags work. They write `GSM_ALLOW_WRITES` and `GSM_CONFIRMATION` into each server's environment.

### Uninstall

```
node dist/cli/gsm.js uninstall --agent codex --plugin gmail --scope global --dry-run
node dist/cli/gsm.js uninstall --agent codex --plugin gmail --scope global
```

Uninstall removes only the gsm entries. Your other config is kept.

---

## Flags of `gsm install` and `gsm uninstall`

**Checked:** every flag below appears in `gsm --help`. The behaviour notes come from the same help text and from a dry run.

| Flag | Meaning |
|---|---|
| `--agent claude\|codex\|opencode\|agy\|all` | The agent to write to. |
| `--plugin <id[,id...]>\|all` | Product ids. An unknown id is refused, and the error lists the valid ids. |
| `--scope global\|project\|folder` | `global` is your home config. `project` is the current folder. `folder` needs `--path`. |
| `--path <dir>` | The folder for `--scope folder`. It must exist. |
| `--servers <a,b>` | Keep only these servers from the chosen products. Each product has one server, with the same name as the product. |
| `--allow-writes` | Set `GSM_ALLOW_WRITES=true` for Codex, OpenCode and Antigravity. **Not applied to Claude Code.** See the known gap above. |
| `--confirmation every-change\|destructive-only\|off` | Set `GSM_CONFIRMATION` for Codex, OpenCode and Antigravity. For Claude Code, it prints how to set the option. |
| `--dry-run` | Print every planned change and command. Write nothing. |
| `--home <dir>` | Use another home folder for Codex, OpenCode and Antigravity. **Does not apply to Claude Code.** Passing it with `--agent claude` stops with an error. |
| `--keep-data` | Uninstall only. Keep Claude Code's plugin data folder, `~/.claude/plugins/data/<id>/`. |

Scope mapping for Claude Code: `global` becomes `--scope user`, `project` becomes `--scope project`, and `folder` becomes `--scope local`. The local scope applies only inside the `--path` folder.

Other commands:

| Command | Purpose |
|---|---|
| `gsm login <group> [--profile readonly\|readwrite\|full] [--scopes <urls>] [--servers <a,b>] [--client-secret <file>] [--no-browser]` | Log in one group. Help only. |
| `gsm scopes <group> [--profile ...] [--servers ...] [--json]` | Show what each profile would enable. Checked. |
| `gsm setup-client <client_secret.json> [--force]` | Save the OAuth desktop client file. Help only. |
| `gsm setup-apikey [--force]` | Save the API key. Help only. |
| `gsm setup-admin --subject <email> --key-file <json> [--profile ...] [--servers ...]` | Set up the workspace admin group. Help only. |
| `gsm status` | Show logins, the API key and the setup of each group. Checked. |
| `gsm logout <group>` | Remove one group's token file. Help only. |
| `gsm products [--json]` | List the products. Checked. |
| `gsm apis [<product>] [--search <text>] [--json] [--limit <n>]` | List the APIs of a product. Checked. |
| `gsm methods <api> [<version>] [--search <text>] [--json] [--limit <n>]` | List the methods of one gateway API. Checked. |
| `gsm doctor [--plugin <id>] [--token-dir <dir>]` | Check the plugin folders, hooks, tool names and credentials. Checked. |
| `gsm version` | Show the suite version and the Node version. Checked. |

`gsm login` and `gsm setup-*` run in a terminal. They open a browser or ask for a key. Read [SETUP.md](SETUP.md) before you run them.

---

## Check the install

For Claude Code, see [4. Check the install](#4-check-the-install).

For the suite itself:

```
node dist/cli/gsm.js doctor --plugin gmail
node dist/cli/gsm.js status
```

`doctor` checks each plugin folder: the required files, the hook, the server files and the tool names. It prints `PASS` or `FAIL` for each check. It exits with code 1 if any check fails. It creates nothing. **Checked output:**

```
PASS gmail: hooks/hooks.json matches ^mcp__plugin_gmail_ and runs bin/gsm-hook.mjs
PASS gmail: tool-map.json has 97 tools, all named mcp__plugin_gmail_* and at most 64 characters
FAIL OAuth client file missing: C:\Users\<you>\.google-services-mcps\client_secret.json (needed by gmail). Run: gsm setup-client <client_secret.json>
doctor: 5 passed, 1 failed
```

`doctor` does not read the agent config files. For Codex, OpenCode or Antigravity, restart the agent and look for the `gsm-` servers in its MCP list. For `agy`, use `agy mcp list`.

---

## Where the files go

| What | Where | Written by |
|---|---|---|
| Claude Code plugin registry and the plugin copy | Managed by Claude Code. The exact folder on your machine is **UNVERIFIED**. | `claude plugin` commands. `gsm` does not edit Claude's settings files. |
| Claude Code plugin data | `~/.claude/plugins/data/<id>/` (the folder that `--keep-data` keeps) | Claude Code |
| Codex config | `~/.codex/config.toml` (global) | `gsm install --agent codex` |
| OpenCode config | `~/.config/opencode/opencode.json` (global) | `gsm install --agent opencode` |
| Antigravity config | `~/.gemini/config/mcp_config.json` (global) | `gsm install --agent agy` |
| Token directory | `~/.google-services-mcps` (Windows: `C:\Users\<you>\.google-services-mcps`) | `setup-client`, `login`, `setup-apikey`, `setup-admin`. Also `audit.log` when the suite runs. |

**Install never writes to the token directory.** Each agent install writes only its own config file. The installer reads the token directory only to print the login steps that are still missing (`src/cli/install.ts`).

The server files used by Codex, OpenCode and Antigravity are inside your checkout, for example `D:\Projects2\Google-services-mcps\plugins\gmail\servers\gmail.mjs`. **Checked (dry run).** If you move or delete the checkout, these entries stop working. Run `gsm install` again from the new location.

## Backups

- Before `gsm` changes an existing agent config file, it copies the file to `<file>.gsm-backup-<YYYYMMDD-HHMMSS>` (**help text**). The dry run shows which files would be created or changed.
- `gsm` does not back up Claude Code's files, because it does not edit them.
- `gsm setup-client --force` backs up the old client file first. `gsm setup-apikey --force` replaces the saved key and keeps no backup (**help text and code**).

---

## Remove everything

Work through these steps in order.

### 1. Log out of each login group

```
node dist/cli/gsm.js status
node dist/cli/gsm.js logout workspace-user
node dist/cli/gsm.js logout cloud
```

Use the groups you actually logged in to: `cloud`, `searchconsole`, `workspace-user`, `business` or `developer`. `logout` removes that group's token file only. It does not revoke the access at Google. The command prints the link to revoke it: `https://myaccount.google.com/permissions`.

`logout` does not remove the API key. `gsm logout apikey` tells you where the key file is. Delete that file yourself.

### 2. Remove the agent entries

For Claude Code, uninstall each plugin:

```
claude plugin uninstall gmail@google-services-mcps --scope user
```

Add `--keep-data` to keep the plugin's data folder (**help only**). Repeat for each product.

For Codex, OpenCode or Antigravity:

```
node dist/cli/gsm.js uninstall --agent codex --plugin gmail --scope global
```

### 3. Remove the marketplace

Remove the plugins first. Then remove the marketplace:

```
claude plugin marketplace remove google-services-mcps
```

**Help only.** The effect on plugins that are still installed is **UNVERIFIED**.

### 4. Delete the token directory

Delete `~/.google-services-mcps` by hand. It holds `client_secret.json`, the login tokens, `policy.json` and `audit.log`. Keep `audit.log` if you need the record. No `gsm` command deletes this folder.

### 5. Delete the OAuth client (optional)

In the Google Cloud console, delete the Desktop OAuth client if you no longer need it.

---

## Troubleshooting: install and login

**"Marketplace not found" when you install a plugin.**
Claude Code cannot find `google-services-mcps`. Add the marketplace first:

```
claude plugin marketplace add D:\Projects2\Google-services-mcps
claude plugin marketplace list
```

The exact error text is **UNVERIFIED**.

**The plugin is installed but its tools do not appear.**

1. Run `claude plugin list`. If the status is `disabled`, enable it: `claude plugin enable gmail@google-services-mcps --scope user`.
2. Run `claude plugin validate D:\Projects2\Google-services-mcps\plugins\gmail`.
3. Run `/mcp` in Claude Code. If the server shows as failed, read the message there.
4. Run `gsm doctor --plugin gmail` and fix each `FAIL` line.

**The server shows no tools.** Check these causes in order:

- The server is switched off for this session. Turn it on in `/mcp`.
- The plugin is disabled. See the first point above.
- You logged in with `readonly`. Then only read tools with read-only scopes are listed. This is expected. Log in with `--profile readwrite` if you need changes.
- You have not logged in. In this case every tool is listed, but each call fails with:

  ```
  Not logged in for "workspace-user". Run: node <plugin>/bin/gsm.mjs login workspace-user (after setting up the OAuth desktop client with setup-client).
  ```

  Set up the client, then log in. See [SETUP.md](SETUP.md).

**`setup-client` says the file already exists.** Use `--force`. The old client file is backed up first.

**`gsm doctor` says the OAuth client file is missing.** Run `gsm setup-client <client_secret.json>` with the file you downloaded from the Google Cloud console.

**The browser does not open for `login`.** Run the same login with `--no-browser`. The command prints the URL. Open that URL in a browser on the same machine. The redirect goes to `127.0.0.1`, so the browser must run on the machine where the login command runs.

**Login works, but the tools still fail.** Restart the server in `/mcp`, or restart Claude Code. A new login needs a restart to apply the new scopes.

**Login from another product replaced the earlier scopes.** Each login replaces the group's token. Log in again from `dist/cli/gsm.js` and list every product of the group in `--servers`. For example:

```
node dist/cli/gsm.js login workspace-user --profile readonly --servers gmail,gcalendar,gdrive
```

**`HTTP 403 | reason=insufficientPermissions | ... | The token lacks a scope for this tool.`** The login does not cover this tool. Log in again with a wider profile, then restart the server:

```
node dist/cli/gsm.js login <group> --profile readwrite --servers <list>
```

For the workspace admin group, run `gsm setup-admin --subject <email> --key-file <file> --profile readwrite`. The error format and the rest of the errors are in [USING.md](USING.md#10-common-errors).

**Rate limits and quota errors.** The suite retries throttled requests on its own. It makes up to three attempts in all. The waits are about 0.5 seconds and then about 1 second, with jitter. A `Retry-After` header is used instead, up to 60 seconds. After the last attempt, the error text is returned. A quota that is used up resets on Google's schedule. See [LIMITS-AND-COSTS.md](LIMITS-AND-COSTS.md). Do not run a loop that retries on its own.

**`unknown plugin id`.** Use one of the 23 ids in [SURFACES.md](SURFACES.md). The plugin-folder form of `gsm` knows only its own product.

**`--home does not apply to claude`.** Remove `--home` when you use `--agent claude`.

**`agy config folder not found`.** Run Antigravity once so that it creates `~/.gemini/config`. Then run the install again.

**Codex ignores a project config.** Codex reads a project `.codex/config.toml` only in trusted projects. Trust the folder in Codex.
