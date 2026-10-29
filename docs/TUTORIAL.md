# Tutorial: install and use the Google services MCP suite

This walkthrough takes you from a fresh copy of the repository to a working Google product server in Claude Code, Codex, OpenCode or Antigravity. It assumes you have not used MCP or a command line much. Every install uses the same command, and only the agent name changes.

**How this was checked.** Each command in this tutorial was run while the tutorial was written, in a temporary folder, or as a `--dry-run`. A command that was not run is marked **UNVERIFIED**, with the reason. Nothing here calls Google, and no real account or credential was used. The Google sign-in and the live agent sessions were not run.

## 1. What you will have at the end

- One or more Google products (for example Gmail) installed into the agent you use.
- A sign-in for each product's login group, using your own OAuth client, API key or service account.
- A read-only setup first. Changes stay off until you turn them on, and every change asks first by default.
- A way to check each step, and a way to remove everything again.

## 2. Concepts in one minute

| Term | What it means here |
|---|---|
| **Product** | One Google product, for example Gmail. Each product has a short id, such as `gmail`. There are 23 of them (section 10). |
| **MCP server** | The small program that an agent talks to, to use one product. It offers the agent a list of tools, such as "list my messages". Each product has one server with the same name as the product. The server calls Google as you. |
| **Agent (harness)** | The AI tool you install into: Claude Code, Codex, OpenCode or Antigravity (`agy`). The `--agent` flag picks one. |
| **Marketplace** | The catalogue of plugins inside this repository. Its name is `google-services-mcps`. Only Claude Code uses it. |
| **Scope** | Where an install is recorded: `global` (your user account), `project` (one project folder) or `local` (one folder, not shared). |
| **Login group** | The sign-in a product uses. Products in one group share one login: `cloud`, `workspace-user`, `workspace-admin`, `searchconsole`, `business`, `developer` or `apikey`. |
| **Token directory** | `~/.google-services-mcps` (on Windows, `C:\Users\<you>\.google-services-mcps`). It holds your OAuth client, your logins and your API key. Install and uninstall never change it. |

## 3. Prerequisites

- **Node.js 20 or newer.** Check with `node --version`. The suite was checked with Node v24.6.0.
- **Git**, to get the code. **UNVERIFIED** here: git was not run.
- **The agent you want.** Claude Code (checked with version 2.1.300), Codex, OpenCode or Antigravity (`agy`). The agent must be installed, and its command must work in your terminal.
- **For Google products:** a Google account (a Workspace account is best), and the setup each product needs. That setup is in [SETUP.md](SETUP.md): a Desktop OAuth client for most products, a service account with domain-wide delegation for `gadmin`, and an API key for `gsearch`.

You do not need `npm`, and there is no build step for the installer.

## 4. Get the code

The steps below use the npm package. The paths in the sample output are from the author's machine, so yours will differ. The one-line installers in the README's Quick start need no npm and no clone; they download the suite to `google-services-mcps` in your home folder. See [INSTALL.md](INSTALL.md), "Without a clone".

```
git clone https://github.com/FiredMosquito831/google-services-mcps.git
cd google-services-mcps
```

**UNVERIFIED:** git was not run for this tutorial. The same two commands work in PowerShell and in a POSIX shell.

The installer is one file in the repository root, `gsm.mjs`. **No build is needed.** Run it from that folder as `npx google-services-mcps <command>`. Check that it works:

```
npx google-services-mcps --help
```

From any other folder, give the full path to the file:

```
node D:\Projects2\Google-services-mcps\gsm.mjs --help
```

In this tutorial, `npx google-services-mcps` means the installer. You can run it from any folder.

Examples in this tutorial use Windows paths such as `D:\Projects2\Google-services-mcps`. Use your own path. In a POSIX shell, forward slashes work too, for example `D:/Projects2/Google-services-mcps`.

## 5. The install command

Every agent uses the same command. Only the agent name changes: `npx google-services-mcps install --agent <agent> --plugin <product>`. From a clone, the same command is `node gsm.mjs install --agent <agent> --plugin <product>`. The two are identical in what they do.

```
npx google-services-mcps install --agent <agent> --plugin <product>
```

Run `npx google-services-mcps` with no arguments in a terminal (or `npx google-services-mcps` with no arguments) for the guided menu. It asks for the agent, the scope, the products and the write settings, shows the command it will run, previews it, and installs after you confirm. Give `install` some flags and the menu asks only for the rest. Scripts always use flags. The full option table is in [INSTALL.md](INSTALL.md#npm-and-npx-commands).

| Part | What to write | Default |
|---|---|---|
| `install` | The command. | Required. |
| `--agent` | `claude`, `codex`, `opencode`, `agy` or `all`. | Required. |
| `--plugin` | A product id, such as `gmail`. Several ids separated by commas, such as `gmail,gcalendar`. Or `all` for every product. | Required. |
| `--scope` | `global`, `project` or `local`. | `global` |
| `--path` | The folder for `project` and `local`. | The folder you run the command in. |

**Scopes.** The scope decides where the install is recorded.

| Agent | `global` (the default) | `project` | `local` |
|---|---|---|---|
| Claude Code | `--scope user`: all your projects | `.claude\settings.json` in the `--path` folder | `.claude\settings.local.json` in the `--path` folder, not shared |
| Codex | `~/.codex/config.toml` | `.codex\config.toml` in the `--path` folder | Same file as `project` |
| OpenCode | `~/.config/opencode/opencode.json` | `opencode.json` in the `--path` folder | Same file as `project` |
| Antigravity (`agy`) | `~/.gemini/config/mcp_config.json` | **Refused** (exit code 2) | **Refused** (exit code 2) |

`folder` is an accepted alias of `local`. Codex and OpenCode have no separate local file, so `local` writes the same file as `project`. The gsm output says so.

**Other flags.** The full list is in section 13.

| Flag | What it does |
|---|---|
| `--dry-run` | Prints every planned change and command, and writes nothing. Use it first. |
| `--home <dir>` | Uses another home folder, for tests. Not for `claude`. |
| `--marketplace <path or owner/repo>` | Claude Code only. Where the marketplace comes from. Default: this checkout. |
| `--allow-writes` | Codex, OpenCode and Antigravity: turns on write tools (`GSM_ALLOW_WRITES=true`). For Claude Code this flag is not applied. Use the plugin option instead (section 6.1). |
| `--confirmation <every-change\|destructive-only\|off>` | Codex, OpenCode and Antigravity: sets `GSM_CONFIRMATION`. For Claude Code this flag is not applied. Use the plugin option instead. |
| `--servers <a,b>` | Keeps only these servers from the chosen products. Each product has one server with the same name. |

**Always run `--dry-run` first.** It shows what would change. Example output, trimmed, for Codex (checked):

```
dry-run: nothing will be written or run.
would copy runtime: D:\Projects2\Google-services-mcps\plugins\gmail -> ...\.google-services-mcps\runtime\gmail
[codex] install (dry-run)
  file: ...\.codex\config.toml (create)
    added keys: gsm-gmail
summary: would install 1 products, 1 servers, 97 tools; confirmation: not set (plugin default every-change); writes: not set (write tools stay off)
```

Several products, and all of them (checked: 3 products, then 23 products):

```
npx google-services-mcps install --agent codex --plugin gmail,gcalendar,gcontacts --dry-run
npx google-services-mcps install --agent codex --plugin all --dry-run
```

## 6. Install into each agent

The sections below follow one order for each agent: the global command (the default), the project command, the local command, the files written, how to restart, and how to check.

### 6.1 Claude Code

Claude Code gets its plugins from the marketplace in this repository. The first time you install, gsm adds the marketplace for you, and only if it is not there yet (checked).

**Global (the default).** This makes the product available in all your projects:

```
npx google-services-mcps install --agent claude --plugin gmail
```

Output, trimmed (checked):

```
[claude] installed
  ran: claude plugin marketplace add D:\Projects2\Google-services-mcps
  ran: claude plugin install gmail@google-services-mcps --scope user
  restart Claude Code to load the servers
```

**Project.** This is recorded for one project folder. Give the folder with `--path`:

```
npx google-services-mcps install --agent claude --plugin gmail --scope project --path "C:\work\my-project"
```

It writes `.claude\settings.json` in that folder (checked).

**Local.** This is recorded for one folder, and it is not shared:

```
npx google-services-mcps install --agent claude --plugin gmail --scope local --path "C:\work\my-project"
```

It writes `.claude\settings.local.json` in that folder (checked).

**Files.**

- Claude Code's own settings. The `claude` command writes them. gsm does not edit them.
- For project and local, the `.claude` file in the folder (above).
- A record of the install in `~/.google-services-mcps/runtime/installs.json`. gsm writes this even for Claude Code, and `npx google-services-mcps list` reads it (checked with a temporary profile).
- Claude Code loads the plugin from the repository itself (`Read from: ...\plugins\gmail`). Keep the clone where it is. If you move it, run the install again from the new place. **UNVERIFIED** for Claude Code specifically: the move was not tested.

**Restart.** Restart Claude Code, which the installer asks you to do. **UNVERIFIED** in a live session.

**Check.**

```
claude plugin list
npx google-services-mcps list
npx google-services-mcps doctor --plugin gmail
```

- `claude plugin list` shows `gmail@google-services-mcps` with `Scope: user` and `Status: ✔ enabled` (checked). For project and local installs, run it from inside the project folder. From another folder the project plugin shows as disabled (checked).
- In Claude Code, run `/mcp`. The `gmail` server should show as connected. **UNVERIFIED** in a live session.
- `npx google-services-mcps list` shows the install and where it is. `npx google-services-mcps doctor` checks the plugin files. Its output is in section 11.

**Plugin options.** Each plugin has options. Install prints `3 userConfig options not yet set` (checked). The options and their defaults:

| Option | Default | What it does |
|---|---|---|
| **Allow write tools** (`allow_writes`) | Off | Lists the tools that change or delete data. Off means only reads are listed. |
| **Confirm before changes** (`confirmation`) | `every-change` | When to ask: `every-change`, `destructive-only` or `off`. Section 9. |
| **Token directory** (`token_dir`) | Empty | Where logins are kept. Empty means `~/.google-services-mcps`. |

`gadmin` also has **Workspace super admin email** (`admin_subject`) and **Service account key file** (`service_account_key_file`). `gads` has an optional **Google Ads developer token** (`ads_developer_token`) and **Manager (login) customer ID** (`ads_login_customer_id`). See [SETUP.md](SETUP.md).

To set an option, use either route:

- In Claude Code: run `/plugin`, open **Installed**, select the plugin and choose **Configure options**. **UNVERIFIED** in a live session.
- From a terminal, the `claude` command (checked):

  ```
  claude plugin configure gmail@google-services-mcps
  printf '%s' '{"confirmation":"destructive-only"}' | claude plugin configure gmail@google-services-mcps --values-stdin
  ```

  PowerShell:

  ```
  claude plugin configure gmail@google-services-mcps
  '{"confirmation":"destructive-only"}' | claude plugin configure gmail@google-services-mcps --values-stdin
  ```

The values are JSON strings. A JSON boolean is refused, so turn on writes with `"allow_writes":"true"` (checked). The `--allow-writes` and `--confirmation` flags of gsm set these options during the install, through `claude plugin install --config` (checked). Options you do not give keep their values.

You can also pass an option when the plugin is installed with the `claude` command: `claude plugin install gmail@google-services-mcps --scope user --config confirmation=destructive-only` (checked).

**The manual route.** This is the same install with the `claude` command only, without gsm. Pick the scope with `--scope` on both commands, so the marketplace and the plugin are declared together:

```
claude plugin marketplace add FiredMosquito831/google-services-mcps --scope user
claude plugin marketplace list
claude plugin install gmail@google-services-mcps --scope user
```

Checked. For project and local, use `--scope project` or `--scope local` and run the command from inside the project folder. The marketplace name is `google-services-mcps`.

### 6.2 Codex

**Global (the default):**

```
npx google-services-mcps install --agent codex --plugin gmail
```

It writes `~/.codex/config.toml` (checked in a temporary home). gsm writes one managed block in that file, and leaves the rest of the file as it was:

```
# >>> google-services-mcps (managed by gsm) >>>
[mcp_servers.gsm-gmail]
command = "node"
...
# <<< google-services-mcps (managed by gsm) <<<
```

**Project:**

```
npx google-services-mcps install --agent codex --plugin gmail --scope project --path "C:\work\my-project"
```

It writes `.codex\config.toml` in that folder (checked). Codex reads a project config only for a trusted folder. Trust the folder in Codex, or its servers stay off (the installer prints this note, checked).

**Local:**

```
npx google-services-mcps install --agent codex --plugin gmail --scope local --path "C:\work\my-project"
```

Codex has no separate local file, so this writes the same `.codex\config.toml` as `project` (checked).

**Files.** The config file (above), a runtime copy in `~/.google-services-mcps/runtime/gmail/`, and the install record in `runtime\installs.json`. Codex's servers point at that copy. Before gsm changes an existing config file, it copies it to `<file>.gsm-backup-<date-time>` (checked on uninstall).

**Restart.** Restart Codex, which the installer asks you to do. **UNVERIFIED** in a live session.

**Check.**

```
npx google-services-mcps list
npx google-services-mcps doctor --plugin gmail
```

Then open Codex's MCP list and look for `gsm-gmail`. **UNVERIFIED:** how Codex shows the list in your version.

**A note on paths.** The entries in a project or local config contain the absolute paths of the server files on your machine. Do not commit a project or local config file for a team.

### 6.3 OpenCode

**Global (the default):**

```
npx google-services-mcps install --agent opencode --plugin gmail
```

It writes `~/.config/opencode/opencode.json` (checked). Each server is under `mcp`, with the key `gsm-gmail`.

**Project:**

```
npx google-services-mcps install --agent opencode --plugin gmail --scope project --path "C:\work\my-project"
```

It writes `opencode.json` in that folder (checked).

**Local:**

```
npx google-services-mcps install --agent opencode --plugin gmail --scope local --path "C:\work\my-project"
```

OpenCode has no separate local file, so this writes the same `opencode.json` as `project` (checked).

**Files.** The config file, a runtime copy under `~/.google-services-mcps/runtime/`, and the install record. The config file must be plain JSON. A file with comments or trailing commas is refused and not changed (checked: `is not strict JSON`).

**Restart.** Restart OpenCode. **UNVERIFIED** in a live session.

**Check.** `npx google-services-mcps list`, `npx google-services-mcps doctor --plugin gmail`, then look for `gsm-gmail` in OpenCode's MCP list. **UNVERIFIED:** how OpenCode shows it.

Do not commit a project or local `opencode.json` for a team. It contains absolute paths on your machine.

### 6.4 Antigravity (agy)

Antigravity supports **global scope only**.

```
npx google-services-mcps install --agent agy --plugin gmail
```

It writes `~/.gemini/config/mcp_config.json` (checked, with the folder present).

**Before you install:** the folder `~/.gemini/config` must already exist. Without it the install stops with an error and changes nothing (checked: `agy config folder not found ... Run agy once so it creates its folder, then retry`). Run `agy` once to create the folder. **UNVERIFIED:** how `agy` creates it, since `agy` was not run.

**Project and local are refused**, with exit code 2 (checked):

```
gsm: agy supports only --scope global: no project or local MCP config file is verified for agy. Use --scope global.
```

**Files.** The config file above, a runtime copy under `~/.google-services-mcps/runtime/`, and the install record.

**Restart.** Restart `agy`. **UNVERIFIED** in a live session.

**Check.** `agy mcp list` should list the `gsm-` servers. **UNVERIFIED:** not run here, because it reads the real `agy` configuration. Also run `npx google-services-mcps list`.

## 7. Choose your products

Pick the products you need by goal. [CHOOSING.md](CHOOSING.md) has a table by goal, the login group of each product, and the risk of each.

Install several products in one command, separated by commas. Each product is recorded separately, and uninstalling one keeps the others (checked for Codex):

```
npx google-services-mcps install --agent claude --plugin gmail,gcalendar,gcontacts
```

`--plugin all` installs all 23 products (checked: 23 products, 3,334 tools). Install only what you use. Every installed product adds its tools to each session.

## 8. Sign in

Installing a product is not enough. Each product needs its login group set up, once, before its tools can call Google. Logins are stored in the token directory.

**UNVERIFIED:** every `login` command in this section. A login starts Google's sign-in, and this check did not run one. The `setup-client`, `setup-apikey`, `setup-admin`, `scopes` and `status` commands were run, with test files and no Google call.

### 8.1 The common steps

1. **Create a Desktop OAuth client** in the Google Cloud console, and download its JSON file. [SETUP.md](SETUP.md) has the steps. For `gsearch` and `gadmin` the setup is different; see sections 8.6 and 8.7.
2. **Save the client file** with gsm. It copies the file into the token directory, and the client secret is never printed:

   ```
   npx google-services-mcps setup-client "C:\Users\you\Downloads\client_secret.json"
   ```

   Checked with a test file. The file must be a Desktop app client (it needs an `installed` block with `client_id` and `client_secret`). A second run refuses to replace the file. Add `--force` to replace it; the old file is backed up first (checked).

3. **Log in** for the group, with the products you use:

   ```
   npx google-services-mcps login workspace-user --profile readonly --servers gmail,gcalendar
   ```

   **UNVERIFIED:** not run. A login opens Google's sign-in page, and this check did not call Google. Use `--no-browser` to print the sign-in address instead of opening a browser.

4. **Check the status:**

   ```
   npx google-services-mcps status
   ```

   Output, with a test client file and no login (checked):

   ```
   token directory: ...\.google-services-mcps
   OAuth client file: ...\.google-services-mcps\client_secret.json
   cloud: not logged in (run: gsm login cloud)
   workspace-user: not logged in (run: gsm login workspace-user)
   ...
   apikey: API key saved in ...\apikey.json (the value is not shown)
   ```

**Profiles.** A profile is the set of tools a login allows:

| Profile | What it allows |
|---|---|
| `readonly` (the default) | Read tools, with read-only scopes only. |
| `readwrite` | Read, write and delete tools, with the narrowest scopes that cover them. |
| `full` | Every tool. |

Compare the profiles before you log in (checked):

```
npx google-services-mcps scopes workspace-user --servers gmail
```

`--scopes <url,url>` asks for an exact list of scopes instead of a profile. Then nothing else is added.

**Merge, `--account` and `--replace`.** A login **merges** the scopes it asks for with the scopes the same account already holds for its group. Name the account with `--account <email>` (in the chat: `auth_login` with `account`). Google preselects it, and only that account's stored scopes are merged, and only the ones a server of the group uses. So logging in for `gmail` with `--account` keeps the scopes of `gcalendar` that this account stored earlier, and drops a scope that no server of the group uses (such as a Cloud scope that came from another sign-in). Without `--account`, nothing is merged: the login asks only for its own scopes. A save never takes scopes away from an account that is already signed in, unless that account was named (and you unticked them on Google's consent screen) or you pass `--replace`. Otherwise the login saves nothing, leaves the token as it was, and says how to try again. This also covers naming one account and picking another one in the browser.

```
npx google-services-mcps login workspace-user --account you@example.com --servers gmail
```

Use `--replace` to drop the stored scopes, so that only this login's scopes remain. A merge can leave write scopes from an earlier `readwrite` login in place. When you want a read-only token again, log in with `--replace`:

```
npx google-services-mcps login workspace-user --profile readonly --replace --servers gmail,gcalendar
```

**UNVERIFIED:** not run, for the same reason as the login in step 3. The merge rule is from the `login` help text and the offline tests.

**Restart the server.** A new login needs a restart of the server (in Claude Code, `/mcp`, or restart the agent). **UNVERIFIED** in a live session.

### 8.2 cloud: gcloud, gai

Desktop OAuth client, then:

```
npx google-services-mcps login cloud --profile readonly --servers gcloud,gai
```

### 8.3 searchconsole: gsc

Desktop OAuth client, then:

```
npx google-services-mcps login searchconsole --profile readonly --servers gsc
```

### 8.4 workspace-user: gdrive, gmail, gcalendar, gchat, gmeet, gcontacts, gtasks, gclassroom, gapps

Desktop OAuth client, then one login for the products you use:

```
npx google-services-mcps login workspace-user --profile readonly --servers gmail,gcalendar
```

### 8.5 business: ganalytics, gtm, gyoutube, gbusiness, gads, gmerchant

Desktop OAuth client, then:

```
npx google-services-mcps login business --profile readonly --servers ganalytics,gtm
```

For `gads`, also read the Google Ads notes in [SETUP.md](SETUP.md). The developer token is an optional plugin option (section 6.1).

### 8.6 developer: gplay, gfirebase, gmaps

Desktop OAuth client, then:

```
npx google-services-mcps login developer --profile readonly --servers gplay,gfirebase,gmaps
```

### 8.7 workspace-admin: gadmin

`gadmin` does not use the Desktop client. It uses a **service account with domain-wide delegation**, and a **super admin** email in your domain. Set both up as [SETUP.md](SETUP.md) describes. Then:

```
npx google-services-mcps setup-admin --subject admin@example.com --key-file "C:\Users\you\Downloads\service-account.json" --profile readonly --servers gadmin
```

Checked with a test service account file. The command checks that the file has a `client_email`, saves the setup in the token directory, and prints the scopes to authorize for the service account's client ID under **Google Admin console > Security > API controls > Domain-wide delegation**. It does not call Google. The key file is referenced where it is, and it is not copied. Use `--replace` to drop the stored scopes, as for `login`.

### 8.8 apikey: gsearch

`gsearch` uses an API key and has no login.

```
npx google-services-mcps setup-apikey
```

The key is read from the environment variable `GSM_API_KEY_INPUT`, or from standard input. It is never a command-line argument and is never printed. Checked with a test key:

PowerShell:

```
$env:GSM_API_KEY_INPUT = "<your key>"
npx google-services-mcps setup-apikey
Remove-Item Env:GSM_API_KEY_INPUT
```

POSIX shell:

```
GSM_API_KEY_INPUT="<your key>" npx google-services-mcps setup-apikey
```

`setup-apikey` refuses to replace a saved key unless you add `--force`, and then it keeps no backup. `npx google-services-mcps status` shows where the key file is, and not the value. `gsearch` has no login step, so `status` shows it as set when the key is saved.

## 9. Use it

### 9.1 Reads and changes

Every tool is one of four kinds:

| Kind | Examples | Asks? |
|---|---|---|
| Read | List, get, search, report | Never. |
| Write | Create, update, send a draft, add a label | Yes, unless confirmation is `off`. |
| Destructive | Delete, remove, send, disable | Yes, twice (see 9.2). |
| Dynamic | `api_call`, and Google Ads mutate calls | Yes, when the call is a change. |

**Write tools are hidden** until **Allow write tools** (`allow_writes`) is on. Write and delete tools are not listed at all. The gateway tool `api_call` is still listed, and a write that goes through it is refused by the server while writes are off, so nothing changes. For Codex, OpenCode and Antigravity, turn writes on with `--allow-writes` (checked: `GSM_ALLOW_WRITES=true`).

### 9.2 Approval prompts

Claude Code shows two steps for a change or delete:

1. **Claude Code's permission prompt.** The suite's hook asks, and gives the reason, for example `Changes data. Confirmation mode is "every-change", so it asks first.` The buttons are Claude Code's. **No** refuses the call, and nothing changes.
2. **"Approve this action?"** This is asked by the server, for a delete, a send or a disable. It has one yes-or-no answer. **Accept** runs the action. **Decline** cancels it, and the agent receives "You declined this action. Nothing was changed."

**UNVERIFIED:** how Claude Code draws step 2 and its buttons in your version. The text is from the code and from [USING.md](USING.md) section 3. The prompts were not seen in a live session.

Codex, OpenCode and Antigravity have no approval hook in this suite. A change is refused when the client cannot ask for approval, and the error says so.

### 9.3 Confirmation settings

The **Confirm before changes** option (`confirmation`), or `--confirmation` for the other agents:

| Mode | Asks before |
|---|---|
| `every-change` (the default) | Every change, and every delete or send. |
| `destructive-only` | Deletes and sends only. Changes run without asking. |
| `off` | Nothing. Deny rules in `policy.json` still apply. |

Use `off` only on an account you fully control. See [SECURITY.md](SECURITY.md).

### 9.4 Tool names

Claude Code names each tool like this:

```
mcp__plugin_<plugin>_<server>__<tool>
```

For Gmail, the plugin and the server are both `gmail`, so a list tool is `mcp__plugin_gmail_gmail__gmail_users_messages_list` (checked in the tool map). Codex, OpenCode and Antigravity name the server `gsm-<product>`, for example `gsm-gmail` (checked in the config). Tool names are at most 64 characters (checked by `npx google-services-mcps doctor`).

### 9.5 The gateway tools

Thirteen products also have **gateway APIs**: `gcloud`, `gsearch`, `gdrive`, `gmail`, `gcontacts`, `gadmin`, `ganalytics`, `gtm`, `gads`, `gmerchant`, `gplay`, `gfirebase` and `gai`. They reach the methods that have no tool of their own, through three tools (checked in the tool maps):

- `api_search`: find a method by a text search.
- `api_describe`: show a method's parameters.
- `api_call`: run a method. A change or delete through `api_call` goes through the approval steps above.

Every product also has `api_methods`, a read tool that lists its generated methods (checked).

### 9.6 Worked examples

Each example names the tool an agent would call. The tool names are checked. The results are not, because no live Google account was used. Reads never ask.

- **Gmail (workspace-user):** "Show the subjects of my five most recent Gmail messages." The agent calls `gmail_users_messages_list`.
- **Calendar (workspace-user):** "What is on my calendar tomorrow?" The agent calls `calendar_events_list`.
- **Drive (workspace-user):** "List the files in my Drive." The agent calls `drive_files_list`.
- **Search Console (searchconsole):** "Which sites are in my Search Console?" The agent calls `sc_sites_list`.
- **Google Cloud (cloud):** "List the BigQuery projects I can see." The agent calls `bigquery_projects_list`.
- **Workspace admin (workspace-admin):** "List the users in my domain." The agent calls `admin_users_list`. This needs the `setup-admin` step.
- **Business (business):** "List my YouTube channels." The agent calls `youtube_channels_list`.
- **Developer (developer):** "List my Firebase projects." The agent calls `firebase_projects_list`.
- **API key (apikey):** "Run a PageSpeed test on this site." The agent calls `pagespeedo_pagespeedap_runpagespeed`.

## 10. Every product

The 23 products, from `config/products.json`. The descriptions are copied from that file, and the login groups match [SURFACES.md](SURFACES.md). The install column is the gsm form of the install for Claude Code. For another agent, change `--agent claude`.

| Product | What it manages | Login group | Install command |
|---|---|---|---|
| `gcloud` | Google Cloud console APIs: projects, service enablement, API keys, billing, monitoring, storage, BigQuery and IAM, plus the rest of the infrastructure, data, devops, networking, security and governance APIs. | `cloud` | `npx google-services-mcps install --agent claude --plugin gcloud` |
| `gsc` | Search Console sites, sitemaps, search analytics, URL indexing and site verification. | `searchconsole` | `npx google-services-mcps install --agent claude --plugin gsc` |
| `gsearch` | Public search and web-quality APIs (Custom Search, PageSpeed, CrUX, Safe Browsing, Web Risk, Fact Check) that take an API key instead of OAuth. The Custom Search JSON API is closed to new customers and is scheduled to be discontinued on 2027-01-01. | `apikey` | `npx google-services-mcps install --agent claude --plugin gsearch` |
| `gdrive` | Google Drive files, labels and activity, plus Docs, Sheets, Slides, Forms and Books. | `workspace-user` | `npx google-services-mcps install --agent claude --plugin gdrive` |
| `gmail` | Gmail mailboxes, messages, labels and settings, plus Gmail Postmaster Tools. | `workspace-user` | `npx google-services-mcps install --agent claude --plugin gmail` |
| `gcalendar` | Google Calendar calendars, events and calendar settings. | `workspace-user` | `npx google-services-mcps install --agent claude --plugin gcalendar` |
| `gchat` | Google Chat spaces, messages and members, plus Workspace Events subscriptions. | `workspace-user` | `npx google-services-mcps install --agent claude --plugin gchat` |
| `gmeet` | Google Meet spaces, conference records, participants and recordings. | `workspace-user` | `npx google-services-mcps install --agent claude --plugin gmeet` |
| `gcontacts` | Google Contacts and People, personal health metrics, Data Portability, and the OAuth2 userinfo endpoints. | `workspace-user` | `npx google-services-mcps install --agent claude --plugin gcontacts` |
| `gtasks` | Google Tasks task lists and tasks, plus Google Keep notes. | `workspace-user` | `npx google-services-mcps install --agent claude --plugin gtasks` |
| `gclassroom` | Google Classroom courses, coursework, submissions, students and teachers. | `workspace-user` | `npx google-services-mcps install --agent claude --plugin gclassroom` |
| `gapps` | Apps Script projects and execution, plus the Workspace Marketplace SDK. | `workspace-user` | `npx google-services-mcps install --agent claude --plugin gapps` |
| `gadmin` | Google Workspace administration: Cloud Identity, Chrome management and policy, Groups Settings, licensing, reports, alerts, Vault, reseller and Cloud Search admin. | `workspace-admin` | `npx google-services-mcps install --agent claude --plugin gadmin` |
| `ganalytics` | Google Analytics admin and data APIs for GA4 properties, configuration and reports. | `business` | `npx google-services-mcps install --agent claude --plugin ganalytics` |
| `gtm` | Google Tag Manager accounts, containers, tags, triggers and variables. | `business` | `npx google-services-mcps install --agent claude --plugin gtm` |
| `gyoutube` | YouTube Data, YouTube Analytics and YouTube Reporting APIs, plus Blogger. | `business` | `npx google-services-mcps install --agent claude --plugin gyoutube` |
| `gbusiness` | Business Profile accounts, locations, verifications, lodging, place actions, notifications and performance. | `business` | `npx google-services-mcps install --agent claude --plugin gbusiness` |
| `gads` | Google Ads API (accounts, campaigns, ad groups, ads, keywords, budgets, conversions, assets and GAQL reporting, with every other method through the gateway), plus advertising and publisher APIs: Search Ads 360, Display & Video 360, Campaign Manager, Ad Exchange, AdSense, AdMob, Real-time Bidding and more. | `business` | `npx google-services-mcps install --agent claude --plugin gads` |
| `gmerchant` | Merchant Center: Merchant API, Comparison Shopping Service and Manufacturer Center. | `business` | `npx google-services-mcps install --agent claude --plugin gmerchant` |
| `gplay` | Google Play developer publishing and reporting, Play Games Services, Android Enterprise and Management, Play Integrity and device APIs. | `developer` | `npx google-services-mcps install --agent claude --plugin gplay` |
| `gfirebase` | Firebase management, App Check, App Distribution, Crashlytics, Hosting, Data Connect, Rules, Test Lab, FCM and Identity Toolkit. | `developer` | `npx google-services-mcps install --agent claude --plugin gfirebase` |
| `gmaps` | Maps Platform and location APIs: Places, Address Validation, Solar, Air Quality, Pollen, Street View Publish and related datasets. | `developer` | `npx google-services-mcps install --agent claude --plugin gmaps` |
| `gai` | Generative and classic AI APIs: Discovery Engine, Vertex AI, Dialogflow, Vision, Speech, Translate, Document AI and agent services. | `cloud` | `npx google-services-mcps install --agent claude --plugin gai` |

## 11. Check and troubleshoot

### 11.1 Commands for checking

```
npx google-services-mcps list
npx google-services-mcps doctor --plugin gmail
npx google-services-mcps status
```

- `npx google-services-mcps list` shows every install gsm made: agent, scope, folder, products, and whether it is in place. Checked output:

  ```
  AGENT   SCOPE   FOLDER  PRODUCTS  STATE     CONFIG FILE
  claude  global  -       gmail     recorded  -
  ```

- `npx google-services-mcps doctor --plugin <id>` checks the plugin folder, the hook, the tool names, the token directory and the OAuth client file. It prints PASS or FAIL for each check, and it exits with code 1 if any check fails. It creates nothing. Checked output, with a test client file:

  ```
  PASS gmail: plugin folder has the 9 required files
  PASS gmail: hooks/hooks.json matches ^mcp__plugin_gmail_ and runs bin/gsm-hook.mjs
  PASS gmail: every server in .mcp.json (gmail) has a file under servers/
  PASS gmail: tool-map.json has 97 tools, all named mcp__plugin_gmail_* and at most 64 characters
  PASS token directory exists: ...\.google-services-mcps
  PASS OAuth client file exists: ...\.google-services-mcps\client_secret.json (needed by gmail)
  doctor: 6 passed, 0 failed
  ```

- `npx google-services-mcps status` shows the logins, the API key and the setup of each group (section 8.1).

For Claude Code, also run `claude plugin list`, and `/mcp` inside Claude Code. For `agy`, run `agy mcp list`.

### 11.2 Common problems

| What you see | What it means | What to do |
|---|---|---|
| `Not logged in for "<group>". Run: node <plugin>/bin/gsm.mjs login <group> ...` | The group has no token yet. The server prints the plugin-folder form of the command. The same login is `npx google-services-mcps login <group> ...`. | Set up the OAuth client with `setup-client` (section 8.1), then log in. |
| `The token lacks a scope for this tool. Log in again with a broader profile: gsm login <group> --profile readwrite.` (or an HTTP 403 with `insufficientPermissions`) | The login does not cover this tool. | Log in again with `--profile readwrite` for that group, then restart the server. For `gadmin`, run `setup-admin` again with `--profile readwrite`. |
| An HTTP 429 or a reason of `rateLimitExceeded`, `userRateLimitExceeded` or `quotaExceeded` | Google throttled the call, or your quota is used up. | The suite retries on its own: at most 3 attempts in all, with waits that start at 0.5 seconds and double, and a `Retry-After` header is used up to 60 seconds. Then the error is returned. Wait, or try later. Quotas reset on Google's schedule. See [LIMITS-AND-COSTS.md](LIMITS-AND-COSTS.md). Do not script a retry loop. |
| The server shows no tools | Check these in order. The server is off for this session (turn it on in `/mcp`). The plugin is disabled (`claude plugin list`). The login is `readonly`, so only read tools with read-only scopes are listed. Write tools are off (**Allow write tools**). The group is not logged in, in which case each tool is listed but every call fails with the message above. | Fix the first cause you find, then restart the server. |
| No approval prompt appears | A read never asks. Changes do not ask when confirmation is `destructive-only` or `off`. A write that is off is refused, with no prompt. A client that cannot ask is refused, with the message "This client cannot ask for confirmation". | Check the confirmation setting (section 9.3) and **Allow write tools**. For Codex, OpenCode and Antigravity there is no prompt in this suite. |
| `unknown plugin id` | The id is not one of the 23. | Use an id from section 10. |
| `--home does not apply to claude` | `--home` was used with Claude Code. | Remove `--home`. Claude Code always uses your real Claude Code configuration. |
| `agy config folder not found` | Antigravity has not created `~/.gemini/config`. | Run `agy` once, then install again. |
| `--path must be an existing directory` | The folder given to `--path` does not exist. | Create the folder, or fix the path. |
| `Marketplace not found` | Claude Code does not know `google-services-mcps`. | Run `npx google-services-mcps install --agent claude --plugin <id>` again, which adds it, or add it by hand (section 6.1). **UNVERIFIED:** the exact text Claude Code prints. |

## 12. Uninstall and remove everything

Work through these steps in order. Each one has a dry run first.

### 12.1 Remove the installs

Preview, then remove. Claude Code, global scope (checked):

```
npx google-services-mcps uninstall --agent claude --plugin gmail --scope global --dry-run
npx google-services-mcps uninstall --agent claude --plugin gmail --scope global
```

That runs `claude plugin uninstall gmail@google-services-mcps --scope user`. For project and local installs, give the same `--scope` and `--path` that you used to install (checked for both).

Codex, OpenCode and Antigravity (checked for global, project and local for Codex and OpenCode, and for global for Antigravity):

```
npx google-services-mcps uninstall --agent codex --plugin gmail --scope global
npx google-services-mcps uninstall --agent codex --plugin gmail --scope project --path "C:\work\my-project"
```

Uninstall removes only the gsm entries and the runtime copy, when no other install uses it. Your other config stays. It leaves a `*.gsm-backup-*` file next to each changed config file (checked), and it never changes the token directory.

To keep Claude Code's plugin data folder, add `--keep-data` to the Claude uninstall. This flag was accepted (checked with the `claude` command), but no data folder existed to show its effect.

### 12.2 Remove every install at once

```
npx google-services-mcps uninstall --all --dry-run
npx google-services-mcps uninstall --all --yes
```

The first command prints the list of installs and removes nothing (checked). The second removes them all (checked for Claude Code, Codex, OpenCode and Antigravity). Without `--yes`, gsm prints the list and asks first, according to the help text. **UNVERIFIED:** the question itself was not run.

### 12.3 Log out of each login group

```
npx google-services-mcps logout workspace-user
```

`logout` removes that group's token file only. It does not revoke the access at Google. Checked: with no token, it prints `workspace-user: not logged in (no token file)`. **UNVERIFIED:** with a real token, because no login was run.

`npx google-services-mcps logout apikey` prints where the key file is. Delete that file yourself.

### 12.4 Remove the marketplace (Claude Code)

Remove the plugins first, then the marketplace (checked):

```
claude plugin marketplace remove google-services-mcps
```

### 12.5 Delete the token folder

Delete `~/.google-services-mcps` by hand. It holds your OAuth client, the logins, the API key, the admin setup, `policy.json` and `audit.log`. No gsm command deletes it. Keep `audit.log` if you need the record.

### 12.6 Revoke the access, and delete the OAuth client

Revoke the suite's access at [myaccount.google.com/permissions](https://myaccount.google.com/permissions). **UNVERIFIED:** not visited here; the address is the one that `npx google-services-mcps` prints. In the Google Cloud console, delete the Desktop OAuth client if you no longer need it.

## 13. Flags reference

Run `npx google-services-mcps --help` for the full text. Each flag in each command, from the CLI's parser, is below.

### install

| Flag | Default | Meaning |
|---|---|---|
| `--agent claude\|codex\|opencode\|agy\|all` | required | The agent to install into. With `all`, an agent that cannot take the scope is skipped with a note. |
| `--plugin <id[,id...]>\|all` | required | Product ids, or all of them. An unknown id is refused. |
| `--scope global\|project\|local` | `global` | Where the install is recorded. `folder` is an alias of `local`. |
| `--path <dir>` | the current folder | The folder for `project` and `local`. It must exist. |
| `--servers <a,b>` | all servers of the products | Keeps only these servers. |
| `--allow-writes` | off | Codex, OpenCode and Antigravity only. Sets `GSM_ALLOW_WRITES=true`. Not applied to Claude Code. |
| `--confirmation every-change\|destructive-only\|off` | `every-change` | Codex, OpenCode and Antigravity only. Sets `GSM_CONFIRMATION`. Not applied to Claude Code. |
| `--marketplace <path or owner/repo>` | this checkout | Claude Code only. |
| `--dry-run` | off | Prints the plan and writes nothing. |
| `--home <dir>` | your user folder | Another home folder. Not for `claude`. |

### uninstall

| Flag | Default | Meaning |
|---|---|---|
| `--agent`, `--plugin`, `--scope`, `--path`, `--servers`, `--dry-run`, `--home` | as for `install` | The same meaning as for `install`. `--home` is not for `claude`. |
| `--all` | off | Removes every install in the list. Prints the list first. |
| `--yes` | off | With `--all`, skips the question. |
| `--keep-data` | off | Claude Code only. Keeps the plugin's data folder. |

### list

| Flag | Default | Meaning |
|---|---|---|
| `--json` | off | Prints JSON. |
| `--home <dir>` | your user folder | Lists the installs recorded in that home folder. |

### login

| Flag | Default | Meaning |
|---|---|---|
| `<group>` | required | `cloud`, `searchconsole`, `workspace-user`, `business` or `developer`. `apikey` only explains the key step. |
| `--profile readonly\|readwrite\|full` | `readonly` | The tools the login allows. |
| `--scopes <url,url>` | none | An exact list of scopes. Nothing else is added. |
| `--servers <a,b>` | all servers of the group | The servers to log in for. Each name must belong to the group. |
| `--client-secret <file>` | the saved client file | Uses this client file. |
| `--no-browser` | off | Prints the sign-in address instead of opening a browser. |
| `--replace` | off | Drops the stored scopes instead of merging with them. |
| `--account <email>` | none | The account to sign in. Google preselects it, and the login merges the scopes this account already holds for the group (only the ones a server of the group uses). Without it, nothing is merged. |

### setup-client

| Argument or flag | Default | Meaning |
|---|---|---|
| `<path-to-client_secret.json>` | required | The Desktop OAuth client file from Google Cloud. |
| `--force` | off | Replaces an existing client file. The old file is backed up first. |

### setup-apikey

| Flag | Default | Meaning |
|---|---|---|
| `--force` | off | Replaces the saved key. No backup is kept. The key comes from `GSM_API_KEY_INPUT` or standard input. |

### setup-admin

| Flag | Default | Meaning |
|---|---|---|
| `--subject <email>` | required | A super admin in your domain. |
| `--key-file <json>` | required | The service account key file. It is referenced, not copied. |
| `--profile readonly\|readwrite\|full` | `readonly` | The tools the setup allows. |
| `--servers <a,b>` | all servers of the group (`gadmin`) | The servers to set up. |
| `--replace` | off | Drops the stored scopes instead of merging with them. |

### Other commands

| Command | What it does |
|---|---|
| `status` | Shows the logins, the API key, the admin setup and the token directory. |
| `logout <group>` | Removes one group's token file. For `apikey`, shows the key file. |
| `scopes <group> [--profile] [--servers] [--json]` | Shows what each profile covers for a group. |
| `products [--json]` | Lists the products, with their groups and tool counts. |
| `apis [<product>] [--search <text>] [--json] [--limit <n>]` | Lists the APIs of a product. |
| `methods <api> [<version>] [--search <text>] [--json] [--limit <n>]` | Lists the methods of one API, with read, write or destructive kinds. |
| `doctor [--plugin <id>] [--token-dir <dir>]` | Checks the plugin folders and the credentials. |
| `version` | Shows the suite version and the Node version. |

## 14. Glossary

- **Agent**: the AI tool that uses the servers, such as Claude Code, Codex, OpenCode or Antigravity. Also called harness.
- **Approval**: a question asked before a change or delete. Accept or decline it.
- **Confirmation**: the setting that says when approvals are asked (`every-change`, `destructive-only`, `off`).
- **Dry run**: a run with `--dry-run`. It shows the plan and writes nothing.
- **Gateway tools**: `api_search`, `api_describe` and `api_call`. They reach the methods that have no tool of their own.
- **Hook**: a check that runs before each tool call. In Claude Code, the suite's hook asks before a change.
- **Login group**: the sign-in that a set of products shares.
- **Marketplace**: the catalogue of plugins in this repository, named `google-services-mcps`.
- **MCP (Model Context Protocol)**: the way an agent connects to a server that offers it tools.
- **MCP server**: the program that offers the tools of one product.
- **Plugin**: one product, packaged for Claude Code. Its id is the product id, such as `gmail`.
- **Product**: one Google product, such as Gmail, with its id and its server.
- **Profile**: `readonly`, `readwrite` or `full`. It decides which tools a login allows.
- **Runtime copy**: the server files gsm copies to `~/.google-services-mcps/runtime/<product>/` for Codex, OpenCode and Antigravity.
- **Scope**: where an install is recorded: `global`, `project` or `local`.
- **Token directory**: `~/.google-services-mcps`. It holds your client file, logins, API key and admin setup.
- **Write tool**: a tool that changes data. It is hidden until writes are turned on.
