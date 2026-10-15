# Apps Script (`gapps`)

Install with the simplest command: `node gsm.mjs install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Apps Script projects: their files, versions, deployments and process history, plus running a script function. It also reads Google Workspace Marketplace license data. It has 19 tools and no gateway.

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
3. Run `setup-client`, then `login workspace-user`. Restart the MCP server (`/mcp`) after login.

Start with `--profile readonly`. Writes need a `readwrite` login and the plugin option `allow_writes`. The setup a script needs before `scripts.run` works is UNVERIFIED.

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

## Example requests

- "Show me the code of my Sheets expense script." Claude runs the project content read tool. No prompt.
- "List the recent executions of my reporting script and any errors." Claude runs the process list tool. No prompt.
- "Create a new version of the Expenses project." Claude runs the version create tool. It asks first.
- "Run the sendWeeklyReport function." Claude runs `appsscript_scripts_run`. It asks twice.

## Safety

- Reads never ask. Writes ask first. Running a script and deleting a deployment ask twice.
- Running a script executes code that can change Drive, Gmail, Sheets or other data. Read the code before you run it.
- Replacing a project's files overwrites them. Keep a copy first.
- The `confirmation` option defaults to `every-change`. Change it with `claude plugin configure gapps`.

## Costs and limits

Apps Script is included with Google Workspace, and the fee was not fetched (UNVERIFIED). Quotas are per user and reset 24 hours after the first request. On Workspace, MailApp allows 1,500 recipients per day and trigger time is capped at 6 hours per day. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/workspace-cloud-search-ai.md`, section 10.

## Caveats

- Google says quotas and limits can change without notice.
- Quota error text and codes are UNVERIFIED.
- Add-on and Marketplace review rules are UNVERIFIED for the Apps Script API.
- Triggers are not in the tool list. Create or manage them in the Apps Script editor.
