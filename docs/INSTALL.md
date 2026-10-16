# Install, update, check and remove

This guide gives the exact steps for each agent and scope. For the full walkthrough, with the reasons for each step, see [TUTORIAL.md](TUTORIAL.md). Read [GUIDE.md](GUIDE.md) first for the big picture.

Each command in this guide is marked with how it was checked:

- **Checked** means the command was run, or run in `--dry-run` mode, and the output matched. Runs used temporary folders and temporary homes, and no real account.
- **Help only** means the flag or command is in the CLI's own `--help` text, but was not run here.
- **UNVERIFIED** means it could not be checked here. The reason is given.

## Before you start

- **Node.js 20 or newer.** `package.json` requires `>=20`. The checks ran on Node v24.6.0.
- **Claude Code** on your PATH, if you use it. The `claude plugin` commands in this guide were checked against Claude Code 2.1.300.
- **A copy of this repository, or the one-line installer,** which downloads it (see "Without a clone" below). The installer and the marketplace are both in it.
- **No build step.** `gsm.mjs` in the repository root is the installer, and it runs without `npm install` or `npm run build`. **Checked.**

### One command for every agent

Run this from any folder:

```
npx google-services-mcps install --agent <agent> --plugin <product>
```

In the rest of this guide, `npx google-services-mcps` is the command, and it works from any folder. `<agent>` is `claude`, `codex`, `opencode` or `agy`. `<product>` is a product id such as `gmail`, a comma list such as `gmail,gcalendar`, or `all`. Only the agent name changes between agents. The same file works from any folder when you give its full path, for example `node D:\Projects2\Google-services-mcps\gsm.mjs ...`. **Checked.**

**Without a clone.** The same command, with the download done for you. Each line is for one shell: Windows PowerShell, Windows Command Prompt, and Linux, macOS or WSL. Add `--dry-run` at the end to check first.

```
& ([scriptblock]::Create((irm "https://raw.githubusercontent.com/FiredMosquito831/google-services-mcps/main/scripts/install.ps1"))) install --agent <agent> --plugin <product>
curl -fsSL -o "%TEMP%\install-gsm.cmd" https://raw.githubusercontent.com/FiredMosquito831/google-services-mcps/main/scripts/install.cmd && "%TEMP%\install-gsm.cmd" install --agent <agent> --plugin <product>
curl -fsSL "https://raw.githubusercontent.com/FiredMosquito831/google-services-mcps/main/scripts/install.sh" | sh -s -- install --agent <agent> --plugin <product>
```

Each run downloads the repository again and replaces the folder `google-services-mcps` in your home folder. `GSM_DIR` changes that folder, and `GSM_REF` picks a branch, tag or commit (default `main`). Tokens and logins live in the token folder, not in that folder, so a new download does not touch them. Uninstalling does not delete the download; remove the folder yourself when you no longer need it. Sign in from that folder with `npx google-services-mcps login <group>`.

Scopes:

| Agent | `global` (default) | `project` | `local` |
|---|---|---|---|
| `claude` | `--scope user` | `.claude/settings.json` in `--path` | `.claude/settings.local.json` in `--path` |
| `codex` | `~/.codex/config.toml` | `.codex/config.toml` in `--path` | same file as `project` |
| `opencode` | `~/.config/opencode/opencode.json` | `opencode.json` in `--path` | same file as `project` |
| `agy` | `~/.gemini/config/mcp_config.json` | refused, exit code 2 | refused, exit code 2 |

`--path` is the folder for `project` and `local`. It defaults to the folder you run the command in. `folder` is an alias of `local`. **Checked.**

---

## npm and npx commands

The old name `@firedmosquito831/google-services-mcps` is deprecated. Use `google-services-mcps`: it is the same installer, with the same options. The old name still installs the same version, and npm shows a deprecation message when you use it.

The same installer runs in three ways. The commands and flags are the same in each.

| Way | Command |
|---|---|
| npx, no install | `npx google-services-mcps <command> [options]`. A global install (`npm install -g google-services-mcps`) gives the commands `google-services-mcps` and `gsm`. |
| Global install | `npm install -g google-services-mcps`, then `google-services-mcps <command> [options]` |
| From a clone | `node gsm.mjs <command> [options]`, in the repository folder |

With no command, the program prints its help. In a terminal, with no command, it opens a menu instead.

**Interactive or with flags.** In a terminal the program asks questions, and each answer shows the exact command it will run, so you can type that command next time:

- `npx google-services-mcps` (no arguments): the menu. It covers installing, uninstalling, signing in to a Google group (the client file, the profile, the API key, the admin setup), signing out, the install list, the sign-in status, the products, the APIs and methods, the scopes, the checks, the version and the help.
- `install` or `uninstall` without `--agent` or `--plugin`: asks for what is missing, and keeps the flags you gave. The install shows a preview with `--dry-run` first, and changes nothing until you confirm.
- `login` with no group: starts the sign-in questions.

With all the flags given, or with no terminal (a script, a pipe, a CI job), nothing is asked: the command runs as it is written, and a missing flag is a usage error with the valid values. The API key is typed without echo and is never printed or put in a command.

The install and uninstall commands:

```
install    --agent <claude|codex|opencode|agy|all> --plugin <id[,id...]|all> [options]
uninstall  --agent <claude|codex|opencode|agy|all> --plugin <id[,id...]|all> [options]
uninstall  --all [--dry-run] [--yes]
list       [--json] [--home <dir>]
```

Options:

| Option | Used by | What it does |
|---|---|---|
| `--agent` | install, uninstall | `claude` (Claude Code), `codex`, `opencode`, `agy` (Antigravity), or `all`. Required, except with `uninstall --all`. |
| `--plugin` | install, uninstall | A product id such as `gmail`, a comma list such as `gmail,gcalendar`, or `all`. Required. An unknown id is refused, and the error lists the valid ones. |
| `--scope` | install, uninstall | `global` (the default: your user account), `project` (the folder given by `--path`, or the current folder), or `local` (that folder only, not shared). `folder` means `local`. |
| `--path` | install, uninstall | The folder for `project` and `local`. It must exist. Not allowed with `global`. |
| `--dry-run` | all | Prints every change and command. Writes nothing and runs nothing. Use it first. |
| `--allow-writes` | install | For `codex`, `opencode` and `agy`: sets `GSM_ALLOW_WRITES=true`. For `claude`: passed to the plugin as the option `allow_writes=true` (`claude plugin install --config`). |
| `--confirmation` | install | `every-change` (the default), `destructive-only` or `off`. For `codex`, `opencode` and `agy`: sets `GSM_CONFIRMATION`. For `claude`: passed to the plugin as the option `confirmation` (`--config`). |
| `--install-missing` | install | Installs the requirements gsm can install (npm for Claude Code, Codex and OpenCode; winget or brew for git), then checks again. Without it, a missing requirement stops the install. |
| `--marketplace` | install (claude) | Where Claude Code gets the marketplace: `owner/repo`, a URL, or a path. The default is the repository folder when it is a git clone. Otherwise (npm package, zip download) it is `FiredMosquito831/google-services-mcps` on GitHub. |
| `--servers` | install | Keeps only these servers of the chosen products (`a,b`). For `claude`, which installs whole plugins, gsm installs the plugins that contain them. |
| `--keep-data` | uninstall (claude) | Keeps the plugin's data folder. |
| `--all` | uninstall | Removes every install gsm recorded, for every agent and scope. It prints the list first. Without `--yes` it asks in a terminal, and outside a terminal it stops and asks you to rerun with `--yes`. It cannot be combined with `--agent`, `--plugin`, `--scope`, `--path` or `--servers`. |
| `--yes` | uninstall --all | Skips the question. |
| `--home` | install, uninstall, list | Another home folder, for tests. Not allowed with `claude`. |
| `--json` | list | Prints JSON. |

What each agent does:

| Agent | Scope and where it writes | Install | Uninstall |
|---|---|---|---|
| `claude` | `global` = user, `project` = project, `local` = local. Claude Code writes its own settings files. | Declares the marketplace in the same scope (for `global`, once, if it is not registered yet), then runs `claude plugin install <id>@google-services-mcps --scope ...`, with `--config` for the options you set. | Runs `claude plugin uninstall ...`. The marketplace stays registered. Logins are never touched. |
| `codex` | `global` = `~/.codex/config.toml`. `project` and `local` = `.codex/config.toml` in the folder (Codex reads it only for trusted projects). `local` writes the same file as `project`. | Writes one block that gsm owns, between marker lines. Text outside the block is never changed. | Removes gsm's entries and its block. Keeps a backup of the file. If gsm created the file, it stays behind empty. |
| `opencode` | `global` = `~/.config/opencode/opencode.json`. `project` and `local` = `opencode.json` in the folder. `local` writes the same file as `project`. | Adds gsm's keys under `mcp`. | Removes those keys. Keeps a backup. |
| `agy` | `global` only: `~/.gemini/config/mcp_config.json`. A project or local scope is refused (exit code 2). | Adds gsm's keys under `mcpServers`. If the agy config folder is missing, the install stops. With `--agent all` it is skipped with a note. | Removes those keys. Keeps a backup. |

For `codex`, `opencode` and `agy`, install also copies each product's server files to `~/.google-services-mcps/runtime/<product>/`, and the config points there. Uninstall removes a copy when no other install uses it.

Install and uninstall never touch the login tokens. To remove a login, use `logout`, which revokes it at Google first.

**Requirements.** An install checks what it needs on this machine before it writes anything. A missing requirement stops the install, and the message says what to install:

| Requirement | Needed for | Installed by gsm (with `--install-missing`, or yes in the menu) | By hand |
|---|---|---|---|
| Claude Code (`claude`) | `--agent claude` | `npm install -g @anthropic-ai/claude-code` | the native installer: see https://code.claude.com/docs/en/setup |
| Codex (`codex`) | `--agent codex` | `npm install -g @openai/codex` | the same command |
| OpenCode (`opencode`) | `--agent opencode` | `npm install -g opencode-ai` | the same command |
| git | `--agent claude` when the marketplace comes from GitHub (the default for the npm package and the one-line installers) | Windows: `winget install --id Git.Git -e --source winget`. macOS: `brew install git`. Linux: not installed by gsm (it needs sudo). | Windows: the installer at https://git-scm.com/downloads/win. Linux: for example `sudo apt-get install -y git`. |

Antigravity (`agy`) has its own installer, and gsm writes its config only when the agy config folder exists (start Antigravity once).

`--install-missing` installs what gsm can install and checks again. Without it, a missing requirement stops the install, and nothing is changed. A `--dry-run` only lists what is missing. In the menu, the same question is asked before the install, with the commands shown.

Examples:

```
npx google-services-mcps install --agent claude --plugin gmail
npx google-services-mcps install --agent codex --plugin gmail,gcalendar --dry-run
npx google-services-mcps install --agent claude --plugin gcalendar --scope project --path "C:\work\my-project"
npx google-services-mcps install --agent claude --plugin gmail --marketplace FiredMosquito831/google-services-mcps
npx google-services-mcps uninstall --agent claude --plugin gmail
npx google-services-mcps uninstall --all --dry-run
npx google-services-mcps uninstall --all --yes
npx google-services-mcps list
```

Known issues:

- **Version 0.1.1 only:** Claude Code through the npm package needed `--marketplace FiredMosquito831/google-services-mcps`, because the install tried to use the package folder as the marketplace. Version 0.1.2 and later use the GitHub marketplace by default, so the option is not needed.
- Every message now shows the command for your route: `node gsm.mjs ...` from the repository, `npx google-services-mcps ...` for the npm package, and `node "<full path>\gsm.mjs" ...` from any other folder.
- The Claude Code marketplace comes from the `main` branch on GitHub, not from the npm version. The two can differ.

## Claude Code

### 1. Add the marketplace (once)

gsm declares the marketplace `google-services-mcps` in the same scope as the plugin. For the user scope (`global`), it is added once, if it is not registered yet. For `project` and `local`, it is declared in that scope's settings on every install, because repeating the add is safe. **Checked:** a project install in an isolated Claude Code config wrote both `extraKnownMarketplaces` and `enabledPlugins` into the project's `.claude/settings.json`.

To add it yourself, choose the scope with `--scope`:

```
claude plugin marketplace add FiredMosquito831/google-services-mcps --scope user
claude plugin marketplace add FiredMosquito831/google-services-mcps --scope project
claude plugin marketplace list
```

A folder works too: `claude plugin marketplace add D:\path\to\google-services-mcps --scope project`. A folder records that path in the project settings, so commit that file only when teammates have the same path. **Checked** for the folder form, and the GitHub form **checked** with a project scope.

### 2. Install a product

The examples below use `npx google-services-mcps`. From a clone, the same options work with `node gsm.mjs`.

```
npx google-services-mcps install --agent claude --plugin gmail
```

This declares the marketplace if it is needed, then runs `claude plugin install gmail@google-services-mcps --scope user`. **Checked.** For a project or a folder:

```
npx google-services-mcps install --agent claude --plugin gmail --scope project --path "C:\work\my-project"
npx google-services-mcps install --agent claude --plugin gmail --scope local --path "C:\work\my-project"
```

| Scope | Records the install in | Shared with others? |
|---|---|---|
| `global` (`--scope user`) | Claude Code's user settings. The default. | No |
| `project` | `.claude/settings.json` in the `--path` folder. **Checked.** | Only if you commit that file |
| `local` | `.claude/settings.local.json` in the `--path` folder. **Checked.** | No |

Run `claude plugin list` from inside the project folder to see a project or local install. From another folder, it shows as disabled. **Checked.**

Install other products the same way, one at a time or as a comma list:

```
npx google-services-mcps install --agent claude --plugin gcalendar,gchat
```

The product ids are in [SURFACES.md](SURFACES.md).

The manual route, with the `claude` command only:

```
claude plugin install gmail@google-services-mcps --scope user
```

**Checked** (with `--scope user`). Add `--config KEY=VALUE` to set an option at install time, for example `--config confirmation=destructive-only`. **Checked.**

### 3. Set the plugin options

Every plugin has these options:

| Option | Default | What it does |
|---|---|---|
| **Allow write tools** (`allow_writes`) | Off | Lists the tools that change or delete data. Off means only reads are listed. |
| **Confirm before changes** (`confirmation`) | `every-change` | When to ask: `every-change`, `destructive-only` or `off`. See [USING.md](USING.md). |
| **Token directory** (`token_dir`) | Empty | Where logins are kept. Empty means `~/.google-services-mcps`. |

`gadmin` also has **Workspace super admin email** (`admin_subject`) and **Service account key file** (`service_account_key_file`). `gads` has **Google Ads developer token** (`ads_developer_token`, optional) and **Manager (login) customer ID** (`ads_login_customer_id`, optional). See [SETUP.md](SETUP.md).

Change them in either of these ways:

1. **In Claude Code.** Run `/plugin`, open **Installed**, select the plugin and choose **Configure options**. **UNVERIFIED** in a live session.
2. **From a terminal.** Show the options and which are set:

   ```
   claude plugin configure gmail@google-services-mcps
   ```

   Save values from standard input. The input is a JSON object whose values are strings. Options you leave out keep their values. **Checked.**

   ```
   printf '%s' '{"confirmation":"destructive-only"}' | claude plugin configure gmail@google-services-mcps --values-stdin
   ```

   PowerShell: `'{"confirmation":"destructive-only"}' | claude plugin configure gmail@google-services-mcps --values-stdin`. **Checked.**

   Turn writes on with the string `"true"`: `{"allow_writes":"true"}`. A JSON boolean such as `true` is refused. **Checked.**

After a change, the CLI says to restart Claude Code to apply it. **Checked** (the text is printed). A restart itself is **UNVERIFIED** in a live session.

**Applied by gsm.** `--allow-writes` and `--confirmation` are sent to `claude plugin install` as `--config allow_writes=true` and `--config confirmation=<mode>`, so the install sets them. Options you do not give keep their values. **Checked:** after an install with both flags, `claude plugin configure` lists `allow_writes` and `confirmation` as set. The summary says `writes: enabled for claude as the plugin option allow_writes=true`.

### 4. Check the install

```
claude plugin list
npx google-services-mcps list
npx google-services-mcps doctor --plugin gmail
```

- `claude plugin list` shows each plugin with its scope and status, such as `Status: ✔ enabled`. Look for the id ending in `@google-services-mcps`. **Checked.**
- `claude plugin details gmail@google-services-mcps` shows the plugin's parts and its token cost. **Checked.**
- `claude plugin validate` checks a manifest. Run `claude plugin validate D:\Projects2\Google-services-mcps\plugins\gmail` for the plugin, or give the repository folder for the marketplace. **Checked:** both print `Validation passed`.
- `npx google-services-mcps list` shows the install and where it is. **Checked.**
- `npx google-services-mcps doctor --plugin gmail` checks the plugin folder and the credentials. **Checked** (sample below).

Then, inside Claude Code, run `/mcp`. The `gmail` server should show as connected. **UNVERIFIED** in a live session.

### 5. Update

1. Pull the new code. There is nothing to build.
2. Refresh the marketplace and update the plugin:

   ```
   claude plugin marketplace update google-services-mcps
   claude plugin update gmail@google-services-mcps --scope user
   ```

   **Checked.** The plugin is read from its folder in the repository, so an update picks up edits there. `update` reports `nothing to update` when the version is unchanged.

3. If the plugin still shows an old state, uninstall it and install it again. Logins are kept, because uninstall does not touch the token directory (see [Remove everything](#remove-everything)).

### 6. Turn a plugin off without removing it

```
claude plugin disable gmail@google-services-mcps --scope user
claude plugin enable gmail@google-services-mcps --scope user
```

**Checked.** For one session only, use `/mcp` instead. It does not change the install.

---

## Other agents: Codex, OpenCode, Antigravity

`npx google-services-mcps install` writes the server entries into the agent's own config file. It changes nothing else.

### Install

Always run a dry run first. It prints every change and writes nothing.

```
npx google-services-mcps install --agent codex --plugin gmail --dry-run
npx google-services-mcps install --agent codex --plugin gmail
```

**Checked.** The dry run printed:

```
dry-run: nothing will be written or run.
would copy runtime: D:\Projects2\Google-services-mcps\plugins\gmail -> ...\.google-services-mcps\runtime\gmail
[codex] install (dry-run)
  file: ...\.codex\config.toml (create)
    added keys: gsm-gmail
summary: would install 1 products, 1 servers, 97 tools; confirmation: not set (plugin default every-change); writes: not set (write tools stay off)
```

For a project or a folder, add the scope and the folder:

```
npx google-services-mcps install --agent opencode --plugin gmail,gcalendar,gcontacts --scope project --path "C:\work\my-project"
```

`--plugin all` installs all 23 products. Use it only if you need them all. **Checked:** 23 products, 3,334 tools.

### Where each agent reads its config

| Agent | `--scope global` | `--scope project` or `local` | Restart |
|---|---|---|---|
| Codex | `~/.codex/config.toml` | `.codex/config.toml` in `--path` (same file for both) | Restart Codex |
| OpenCode | `~/.config/opencode/opencode.json` | `opencode.json` in `--path` (same file for both) | Restart OpenCode |
| Antigravity (`agy`) | `~/.gemini/config/mcp_config.json` | **Refused**, exit code 2 | Restart `agy` |

On Windows, `~` is `C:\Users\<you>`. **Checked** (dry runs and real runs in temporary homes), for all three paths, and for the refusal:

```
gsm: agy supports only --scope global: no project or local MCP config file is verified for agy. Use --scope global.
```

Notes for each agent:

- **Codex.** All gsm entries live in one managed block, between `# >>> google-services-mcps (managed by gsm) >>>` and `# <<< google-services-mcps (managed by gsm) <<<`. Text outside the block is not touched. Codex reads a project `.codex/config.toml` only in trusted projects. Trust the folder in Codex, or its servers stay off. **Checked** (the installer prints this note).
- **OpenCode.** Each entry is under `mcp` with the key `gsm-<name>`. The file must be plain JSON. A file with comments or trailing commas is refused and not changed. **Checked.**
- **Antigravity (`agy`).** The folder `~/.gemini/config` must already exist. Without it the install stops with `agy config folder not found ... Run agy once so it creates its folder, then retry.` **Checked.** Run `agy` once to create it. **UNVERIFIED:** how `agy` creates the folder, because `agy` was not run. Then check with `agy mcp list` (**UNVERIFIED:** not run here).
- **Project and local files hold absolute paths.** The entries point at server files on your machine. Do not commit a project or local config file for a team. **Checked** (the paths appear in the file).

### Uninstall

```
npx google-services-mcps uninstall --agent codex --plugin gmail --scope global --dry-run
npx google-services-mcps uninstall --agent codex --plugin gmail --scope global
```

**Checked.** Uninstall removes only the gsm entries, and the runtime copy when no other install uses it. Your other config is kept. A `*.gsm-backup-<date-time>` copy of the changed file is left behind. **Checked.**

---

## Flags of `npx google-services-mcps install` and `npx google-services-mcps uninstall`

**Checked:** every flag below is accepted by the parser. The behaviour notes come from the help text and from runs.

| Flag | Meaning |
|---|---|
| `--agent claude\|codex\|opencode\|agy\|all` | The agent to write to. With `all`, an agent that cannot take the scope is skipped with a note. **Checked.** |
| `--plugin <id[,id...]>\|all` | Product ids. An unknown id is refused, and the error lists the valid ids. **Checked.** |
| `--scope global\|project\|local` | `global` (default) is your user-wide config. `project` and `local` act on the folder of `--path`. `folder` is an alias of `local`. |
| `--path <dir>` | The folder for `project` and `local`. Defaults to the current folder. It must exist. **Checked.** |
| `--servers <a,b>` | Keep only these servers from the chosen products. Each product has one server, with the same name as the product. **Checked.** |
| `--allow-writes` | Set `GSM_ALLOW_WRITES=true` for Codex, OpenCode and Antigravity. **Not applied to Claude Code**, which uses the plugin option. **Checked.** |
| `--confirmation every-change\|destructive-only\|off` | Set `GSM_CONFIRMATION` for Codex, OpenCode and Antigravity. **Not applied to Claude Code.** **Checked.** |
| `--marketplace <path or owner/repo>` | Claude Code only. Default: this checkout, else `FiredMosquito831/google-services-mcps`. **Checked** (the default was printed from a temporary folder). |
| `--dry-run` | Print every planned change and command. Write nothing. |
| `--home <dir>` | Use another home folder, for Codex, OpenCode and Antigravity. **Does not apply to Claude Code**: `--home` with `--agent claude` stops with an error. **Checked.** |
| `--all` | `uninstall` only. Removes every install in the list, after printing it. **Checked** (`--dry-run` and `--yes`). |
| `--yes` | `uninstall --all` only. Skips the question. |
| `--keep-data` | `uninstall` with Claude Code only. Keeps the plugin's data folder. **Checked:** accepted. The effect was not seen, because no data folder existed. |

Scope mapping for Claude Code: `global` becomes `--scope user`, `project` becomes `--scope project`, and `local` (or `folder`) becomes `--scope local`.

Other commands:

| Command | Purpose |
|---|---|
| `npx google-services-mcps list [--json] [--home <dir>]` | Show every install gsm made: agent, scope, folder, products and state. **Checked.** |
| `npx google-services-mcps login <group> [--profile readonly\|readwrite\|full] [--scopes <urls>] [--servers <a,b>] [--client-secret <file>] [--no-browser] [--replace]` | Log in one group. Merges with the scopes already stored, unless `--replace` drops them. **UNVERIFIED:** not run, because it starts Google's sign-in. Help text checked. |
| `npx google-services-mcps scopes <group> [--profile ...] [--servers ...] [--json]` | Show what each profile would enable. **Checked.** |
| `npx google-services-mcps setup-client <client_secret.json> [--force]` | Save the OAuth desktop client file. **Checked** with a test file. |
| `npx google-services-mcps setup-apikey [--force]` | Save the API key. The key comes from `GSM_API_KEY_INPUT` or standard input. **Checked** with a test key. |
| `npx google-services-mcps setup-admin --subject <email> --key-file <json> [--profile ...] [--servers ...] [--replace]` | Set up the workspace-admin group. **Checked** with a test service account file. |
| `npx google-services-mcps status` | Show logins, the API key and the setup of each group. **Checked.** |
| `npx google-services-mcps health` | One row per server: login, account, tool count. `--check` asks Google about each login. `--json` prints the rows. **Checked** offline. |
| `npx google-services-mcps logout <group>` | Revoke the login at Google, then remove the token file. `--local-only` removes the file only. **Checked** (no token case). |
| `npx google-services-mcps products [--json]` | List the products. **Checked.** |
| `npx google-services-mcps apis [<product>] [--search <text>] [--json] [--limit <n>]` | List the APIs of a product. **Checked.** |
| `npx google-services-mcps methods <api> [<version>] [--search <text>] [--json] [--limit <n>]` | List the methods of one API. **Checked.** |
| `npx google-services-mcps doctor [--plugin <id>] [--token-dir <dir>]` | Check the plugin folders, hooks, tool names and credentials. **Checked.** |
| `npx google-services-mcps version` | Show the suite version and the Node version. **Checked.** |

`npx google-services-mcps login` and `npx google-services-mcps setup-*` run in a terminal. They open a browser or read a key. Read [SETUP.md](SETUP.md) before you run them.

---

## Check the install

For Claude Code, see [4. Check the install](#4-check-the-install).

For the suite itself:

```
npx google-services-mcps doctor --plugin gmail
npx google-services-mcps status
```

`doctor` checks each plugin folder: the required files, the hook, the server files and the tool names. It prints `PASS` or `FAIL` for each check. It exits with code 1 if any check fails. It creates nothing. **Checked output**, with a test client file in a temporary token directory:

```
doctor: repo checkout D:\Projects2\Google-services-mcps, 1 product(s), token directory ...\.google-services-mcps
PASS gmail: plugin folder has the 9 required files
PASS gmail: hooks/hooks.json matches ^mcp__plugin_gmail_ and runs bin/gsm-hook.mjs
PASS gmail: every server in .mcp.json (gmail) has a file under servers/
PASS gmail: tool-map.json has 97 tools, all named mcp__plugin_gmail_* and at most 64 characters
PASS token directory exists: ...\.google-services-mcps
PASS OAuth client file exists: ...\.google-services-mcps\client_secret.json (needed by gmail)
doctor: 6 passed, 0 failed
```

Without a client file, the last check shows `FAIL OAuth client file missing ... Run: gsm setup-client <client_secret.json>`. **Checked** (the wording is from the source; the check is the same one).

`doctor` does not read the agent config files. For Codex, OpenCode or Antigravity, restart the agent and look for the `gsm-` servers in its MCP list. For `agy`, use `agy mcp list`.

---

## Where the files go

| What | Where | Written by |
|---|---|---|
| Claude Code plugin registry | Managed by Claude Code. | `claude plugin` commands. `npx google-services-mcps` does not edit Claude's settings files. |
| Claude Code project and local settings | `.claude/settings.json` and `.claude/settings.local.json` in `--path`. | Claude Code, through `npx google-services-mcps install --agent claude --scope project` or `local`. **Checked.** |
| Codex config | `~/.codex/config.toml`, or `.codex/config.toml` in `--path`. | `npx google-services-mcps install --agent codex` |
| OpenCode config | `~/.config/opencode/opencode.json`, or `opencode.json` in `--path`. | `npx google-services-mcps install --agent opencode` |
| Antigravity config | `~/.gemini/config/mcp_config.json` (global only). | `npx google-services-mcps install --agent agy` |
| Runtime copy | `~/.google-services-mcps/runtime/<product>/`. Codex, OpenCode and Antigravity point here. | `npx google-services-mcps install` (not for Claude Code, which reads the repository). **Checked.** |
| Install record | `~/.google-services-mcps/runtime/installs.json`. Read by `npx google-services-mcps list`. | `npx google-services-mcps install` and `npx google-services-mcps uninstall`, also for Claude Code. **Checked.** |
| Token directory | `~/.google-services-mcps` (Windows: `C:\Users\<you>\.google-services-mcps`). | `setup-client`, `login`, `setup-apikey`, `setup-admin`. Also `audit.log` when the suite runs. |

**Install and uninstall never write to the token directory.** Each agent install writes only its own config file, plus the runtime copy and the install record. The installer reads the token directory only to print the login steps that are still missing (`src/cli/install.ts`). **Checked** (the token folder was unchanged by install and uninstall in the runs).

The server files that Codex, OpenCode and Antigravity use are in `~/.google-services-mcps/runtime/<product>/`, a copy made at install time. Run `npx google-services-mcps install` again after you update the repository, so the copy is refreshed. **Checked** (the copy is made by the install).

## Backups

- Before `npx google-services-mcps` changes an existing agent config file, it copies the file to `<file>.gsm-backup-<YYYYMMDD-HHMMSS>`. **Checked** (on uninstall). A dry run shows which files would be created or changed.
- `npx google-services-mcps` does not back up Claude Code's files, because it does not edit them.
- `npx google-services-mcps setup-client --force` backs up the old client file first. **Checked.** `npx google-services-mcps setup-apikey --force` replaces the saved key and keeps no backup.
- Uninstall leaves the `*.gsm-backup-*` files in place. **Checked.**

---

## Remove everything

Work through these steps in order.

### 1. Log out of each login group

```
npx google-services-mcps status
npx google-services-mcps logout workspace-user
npx google-services-mcps logout cloud
```

Use the groups you actually logged in to: `cloud`, `searchconsole`, `workspace-user`, `business`, `developer` or `workspace-admin`. `logout` revokes that group's login at Google, then removes its token file. With `--local-only` it only removes the file, and it prints the page where you can revoke the login: `https://myaccount.google.com/permissions`. **Checked** (the message, with no token). **UNVERIFIED:** revoking a real login, because no login was run.

`logout` does not remove the API key. `npx google-services-mcps logout apikey` shows where the key file is. Delete that file yourself. **Checked.**

### 2. Remove the agent entries

For Claude Code, uninstall each plugin. Preview first, then remove:

```
npx google-services-mcps uninstall --agent claude --plugin gmail --scope global --dry-run
npx google-services-mcps uninstall --agent claude --plugin gmail --scope global
```

**Checked.** For a project or local install, use the same `--scope` and `--path` as the install. Add `--keep-data` to keep the plugin's data folder. For Codex, OpenCode or Antigravity:

```
npx google-services-mcps uninstall --agent codex --plugin gmail --scope global
```

To remove every install at once, preview and then remove:

```
npx google-services-mcps uninstall --all --dry-run
npx google-services-mcps uninstall --all --yes
```

**Checked** (the dry run lists the installs and removes nothing; `--yes` removes them). Without `--yes`, gsm asks first, according to the help text. **UNVERIFIED:** the question was not run.

### 3. Remove the marketplace

Remove the plugins first. Then remove the marketplace:

```
claude plugin marketplace remove google-services-mcps
```

**Checked.**

### 4. Delete the token directory

Delete `~/.google-services-mcps` by hand. It holds `client_secret.json`, the login tokens, `apikey.json`, `workspace-admin.scopes.json`, `policy.json` and `audit.log`. Keep `audit.log` if you need the record. No `npx google-services-mcps` command deletes this folder. **Checked:** uninstall leaves it in place.

### 5. Delete the OAuth client (optional)

In the Google Cloud console, delete the Desktop OAuth client if you no longer need it.

---

## Troubleshooting: install and login

**"Marketplace not found" when you install a plugin.** Claude Code cannot find `google-services-mcps`. Run the install again, which adds the marketplace, or add it by hand:

```
claude plugin marketplace add D:\Projects2\Google-services-mcps
claude plugin marketplace list
```

The exact error text is **UNVERIFIED**.

**The plugin is installed but its tools do not appear.**

1. Run `claude plugin list`. If the status is `disabled`, enable it: `claude plugin enable gmail@google-services-mcps --scope user`. **Checked.**
2. Run `claude plugin validate D:\Projects2\Google-services-mcps\plugins\gmail`. **Checked.**
3. Run `/mcp` in Claude Code. If the server shows as failed, read the message there. **UNVERIFIED** in a live session.
4. Run `npx google-services-mcps doctor --plugin gmail` and fix each `FAIL` line. **Checked.**

**The server shows no tools.** Check these causes in order:

- The server is switched off for this session. Turn it on in `/mcp`.
- The plugin is disabled. See the first point above.
- You logged in with `readonly`. Then only read tools with read-only scopes are listed. This is expected. Log in with `--profile readwrite` if you need changes.
- You have not logged in. In this case every tool is listed, but each call fails with:

  ```
  Not logged in for "workspace-user". Run: node <plugin>/bin/gsm.mjs login workspace-user (after setting up the OAuth desktop client with setup-client).
  ```

  The server prints the plugin-folder form of the command. The same login is `npx google-services-mcps login workspace-user`. Set up the client, then log in. See [SETUP.md](SETUP.md). **Checked** (the text is from the source; the message was not triggered in a live session).

**`setup-client` says the file already exists.** Use `--force`. The old client file is backed up first. **Checked.**

**`npx google-services-mcps doctor` says the OAuth client file is missing.** Run `npx google-services-mcps setup-client <client_secret.json>` with the file you downloaded from the Google Cloud console. **Checked** (the message).

**The browser does not open for `login`.** Run the same login with `--no-browser`. The command prints the URL. Open that URL in a browser on the same machine. The redirect goes to `127.0.0.1`, so the browser must run on the machine where the login command runs. **Help text.** **UNVERIFIED:** not run.

**Login works, but the tools still fail.** Restart the server in `/mcp`, or restart Claude Code. A new login needs a restart to apply the new scopes.

**Earlier scopes are still in the token.** A login merges with the scopes already stored for its group, so logging in for one product keeps the others. Use `--replace` to drop the stored scopes and keep only what this login requests. A merge can leave write scopes from an earlier readwrite login in place: when you want a readonly token again, log in with `--replace`. For example:

```
npx google-services-mcps login workspace-user --profile readonly --replace --servers gmail,gcalendar,gdrive
```

**UNVERIFIED:** not run, because it starts a sign-in.

**`The token lacks a scope for this tool.`** The login does not cover this tool. Log in again with a wider profile, then restart the server:

```
npx google-services-mcps login <group> --profile readwrite --servers <list>
```

For the workspace admin group, run `npx google-services-mcps setup-admin --subject <email> --key-file <file> --profile readwrite`. The error text is **checked** against the source. The rest of the errors are in [USING.md](USING.md#10-common-errors).

**Rate limits and quota errors.** The suite retries throttled requests on its own. It makes at most three attempts in all. The waits start at 0.5 seconds and double, with jitter. A `Retry-After` header is used instead, up to 60 seconds. After the last attempt, the error text is returned. A quota that is used up resets on Google's schedule. See [LIMITS-AND-COSTS.md](LIMITS-AND-COSTS.md). Do not run a loop that retries on its own. **Checked** (the constants are in `src/core/http.ts`).

**`unknown plugin id`.** Use one of the 23 ids in [SURFACES.md](SURFACES.md). **Checked.**

**`--home does not apply to claude`.** Remove `--home` when you use `--agent claude`. **Checked.**

**`agy config folder not found`.** Run Antigravity once so that it creates `~/.gemini/config`. Then run the install again. **Checked.**

**`--path must be an existing directory`.** Create the folder, or fix the path. **Checked.**

**`is not strict JSON`** (OpenCode). Remove the comments or trailing commas from `opencode.json`, or add the entry by hand. gsm does not change the file. **Checked.**

**Codex ignores a project config.** Codex reads a project `.codex/config.toml` only in trusted projects. Trust the folder in Codex. **Checked** (the installer's note; the trust itself was not tested in Codex).
