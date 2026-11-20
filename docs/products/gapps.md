# Apps Script (`gapps`)

Install with the simplest command: `npx google-services-mcps install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Apps Script projects: their files, versions, deployments and process history, plus running a script function. It also reads Google Workspace Marketplace license data. It has 27 registered tools (1 curated `appsscript_get_content`, 18 per-method, 7 runtime and 1 `api_methods` listing) and no gateway.

## When to install it

- You read or change the code of an Apps Script project.
- You create versions and deployments of a script.
- You run a script function and check its result or recent executions.
- Wrong choice: you need to schedule a script. Triggers are not in the tool list.

## Install and set up

```
claude plugin install gapps@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-client <client_secret.json>
node <plugin>/bin/gsm.mjs login workspace-user --profile readonly
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gapps`).

1. In a Google Cloud project, enable the Apps Script API.
2. Set up the OAuth consent screen. Use Internal for a Workspace domain. Create an OAuth client ID of type Desktop app and download the JSON file.
3. In the Apps Script dashboard at https://script.google.com/home/usersettings, turn on Apps Script API access for the Google account you will use with gsm. This user-level grant is separate from enabling the API in Cloud and is required for calls that create or modify script projects and deployments. The same dashboard can revoke that access at any time.
4. Run `setup-client`, then `login workspace-user`. Restart the MCP server (`/mcp`) after login.

Start with `--profile readonly`. Writes need a `readwrite` login and the plugin option `allow_writes`.

The dashboard grant in step 3 is required for creating or modifying script projects and deployments; running a function has the separate prerequisites listed below.

Running a function needs more than a sign-in. Google's guide, "Execute functions with the Google Apps Script API" (https://developers.google.com/apps-script/api/how-tos/execute, read 2026-11-01), lists what `scripts.run` needs before a call works:

- the script is deployed as an API executable, and the call passes the **deployment id**, not the script id (the new editor keeps one per deployment);
- the script and this OAuth client share a **standard** Google Cloud project with the Apps Script API enabled; a default Apps Script project is not enough;
- the sign-in holds every scope the script uses, not only the scope of the function called (`readwrite` asks for one of them, `userinfo.email`; sign in with an explicit scope list for the rest);
- a run may take six minutes, passes and returns basic types only, and the Apps Script API does not work with service accounts.

Since 2.5.0 that text is in the `appsscript_scripts_run` tool itself (a method note), so the model sees it without this page.

`appsscript_scripts_run` also accepts an optional, preview-only `previewProjectId`: the script project's Drive ID. It is read only before the approval and never sent with the run. When it is supplied, the approval shows the entry point and the last-modified time of the code that governs the run, read from Google with bounded, read-only GETs; when it is absent, no extra read is made and the approval says `version not read`. Google's `devMode=true` runs the most recently saved version rather than the version deployed for use with the Apps Script API (only when the sign-in owns the script); `devMode=false` runs the deployed version. The preview is best effort: a failed, slow or unscoped read shows a warning and the run still asks as before. The double ask, the request bytes and the twelve scopes of the run tool are unchanged; the preview reads may need `script.projects.readonly` or `script.deployments.readonly` on the login, and the `google` toolset already asks for both.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Projects (read) | get, get content, get metrics | read | Read project details, files and metrics |
| Versions and deployments (read) | versions and deployments list and get | read | Read versions and deployments |
| Processes (read) | process list, script process list | read | List recent and running executions |
| Projects (write) | `appsscript_projects_create`, `appsscript_projects_update_content` | write | Create a project, replace its files |
| | `appsscript_projects_versions_create`, deployment create and update | write | Make a version, create or change a deployment |
| Run (destructive) | `appsscript_scripts_run` | destructive | Run a function in a script |
| Deployments (destructive) | `appsscript_projects_deployments_delete` | destructive | Delete a deployment |
| Marketplace (read) | customer and user license get | read | Check a customer's or user's license |
| Gateway | none | | No gateway tools. All methods are per-method tools. |

The full list is in `docs/capabilities/gapps.md`.

Google has no official MCP server for Apps Script (none was found on 2026-10-29). With the plugin option `toolset: google`, the server lists a small set chosen here instead: `appsscript_projects_get`, `appsscript_get_content` (curated reader with `file_name` filter, `include_source: false` index, and `offset`/`max_chars` paging), `appsscript_projects_update_content`, `appsscript_projects_versions_create`, `appsscript_projects_versions_list` (2.5.0), `appsscript_projects_deployments_list`, `appsscript_projects_deployments_create`, `appsscript_projects_deployments_update` (2.5.0), `appsscript_processes_list` and `appsscript_scripts_run` (destructive: it asks twice) (10 tools), plus `health` and the sign-in tools. A `readonly` login with that toolset asks for `script.projects.readonly`, `script.deployments.readonly` and, since 1.32.1, `script.processes` (Google: "View Google Apps Script processes"), so recent runs load too; with the `all` toolset it also asks for `script.metrics` ("View Google Apps Script project's metrics"); a `readwrite` login for `script.projects`, `script.deployments`, `script.processes` and `userinfo.email`. The two tools 2.5.0 adds need no new scope: their scopes are already in the cover. A function run with `appsscript_scripts_run` needs the scopes the script itself uses; sign in with those as an explicit scope list.

**Large project reads (`appsscript_get_content`).** Google's REST `projects.getContent` has no server-side offset or file filter. The curated `appsscript_get_content` tool fetches the project content and lets you pass `include_source: false` to list all file names and sizes, `file_name` to read one file, and `offset` + `max_chars` (`next_offset` continues) so large projects never silently lose files before `appsscript_projects_update_content`. Check every file before calling `appsscript_projects_update_content`, which clears any omitted files (including the `appsscript` manifest).

`appsscript_projects_deployments_create` makes a **new** deployment every time, with a new id and a new web-app URL. To ship a new version of an existing deployment, read the version number from `appsscript_projects_versions_list` and pass it to `appsscript_projects_deployments_update`: the deployment id and its URL stay the same. That flow is what the plugin's skill describes.

**The full Gmail scope is an optional part (since 1.36.0).** `scripts.run` lists twelve scopes Google accepts for it, among them `https://mail.google.com/` (read, send and delete all mail). Until 1.36.0 a `full` login picked that one, the shortest, so every `--profile full` gapps sign-in asked for the whole mailbox only to run scripts. Now `full` asks for `userinfo.email` for `scripts.run`, as `readwrite` does, and the full Gmail scope only when you name the part:

```
node <plugin>/bin/gsm.mjs login workspace-user --profile full --with mail
```

In the chat: `auth_login` with `"with": ["mail"]`. Without it, `gsm scopes` and the sign-in say so in a `Held back:` line. A script that sends or reads Gmail needs that scope (or another Gmail scope in an explicit scope list). An account that already holds `https://mail.google.com/` keeps it when you sign in again naming the account (`--account <email>`). `readonly` and `readwrite` ask for the same scopes as before.

## Example requests

- "Show me the code of my Sheets expense script." Claude runs the project content read tool. No prompt.
- "List the recent executions of my reporting script and any errors." Claude runs the process list tool. No prompt.
- "Create a new version of the Expenses project." Claude runs the version create tool. It asks first.
- "Ship that version to the deployment the team already uses." Claude lists the versions, then runs `appsscript_projects_deployments_update`: the deployment id and its web-app URL stay the same (a create would make a new deployment). It asks first.
- "Run the sendWeeklyReport function." Claude runs `appsscript_scripts_run`. It asks twice.

## Safety

- Reads never ask. Writes ask first. Running a script, replacing a project's files (update content, since 1.26.3: Google clears all the existing files) and deleting a deployment ask twice.
- Running a script executes code that can change Drive, Gmail, Sheets or other data. Read the code before you run it.
- Replacing a project's files overwrites them. Keep a copy first.
- The `confirmation` option defaults to `every-change`. Change it with `printf '%s' '{"confirmation":"destructive-only"}' | claude plugin configure gapps@google-services-mcps --values-stdin` (JSON on stdin), or `/plugin configure gapps@google-services-mcps` in Claude Code.

## Costs and limits

Apps Script is included with Google Workspace, and the fee was not fetched (UNVERIFIED). Quotas are per user and reset 24 hours after the first request. On Workspace, MailApp allows 1,500 recipients per day and trigger time is capped at 6 hours per day. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/workspace-cloud-search-ai.md`, section 10.

## Caveats

- Google says quotas and limits can change without notice.
- Quota error text and codes are UNVERIFIED.
- Add-on and Marketplace review rules are UNVERIFIED for the Apps Script API.
- Triggers are not in the tool list. Create or manage them in the Apps Script editor.
