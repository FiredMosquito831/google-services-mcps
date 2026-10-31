# Apps Script (`gapps`)

Apps Script projects and execution, plus the Workspace Marketplace SDK.

- Plugin: `gapps`, MCP server: `gapps`, login: Desktop OAuth client, then `login workspace-user`
- Install: `claude plugin install gapps@google-services-mcps`
- Tools: 26 total. Curated 7, per-method 18, gateway 0. Read 15, write 8, destructive 3, dynamic 0.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 26, google 15, curated 26 (all) tools, each counting the 7 runtime tools this server registers (`account_remove`, `account_set_default`, `accounts_list`, `auth_login`, `auth_setup_client`, `auth_status`, `health`). "(all)" means the product has no such toolset yet, so it lists every tool.

## Not registered by this server (2)

The tool map (`plugins/<id>/tool-map.json`) also lists these, so the consent hook knows every name, but this server never registers them, and the counts above leave them out.

- Sign-in tools of other sign-in kinds: `auth_setup_admin`, `auth_setup_service_account`.

## Toolset google (8)

Google has no official MCP server for this product. The google toolset is a lean set chosen here: No official Google MCP server for Apps Script was found (Google's Cloud and Workspace MCP lists, 2026-10-29; a negative, not confirmed by Google); a lean set chosen here..

| Tool | Google's tool | Note |
|---|---|---|
| `appsscript_projects_get` | (none) | A script project's title, parent file and times, by script id. |
| `appsscript_projects_get_content` | (none) | The files of a script project: name, type and source. |
| `appsscript_projects_update_content` | (none) | Replaces every file of a script project with the files given. Destructive since 1.26.3 (Google: it clears all the existing files), so it asks twice; send the files you keep too. |
| `appsscript_projects_versions_create` | (none) | Saves the current code as a numbered version, for a deployment. A write, so it asks first. |
| `appsscript_projects_deployments_list` | (none) | The deployments of a script project and their entry points. |
| `appsscript_projects_deployments_create` | (none) | Deploys a version (as an API executable, web app or add-on, by its manifest). A write, so it asks first. |
| `appsscript_processes_list` | (none) | Your recent script runs: function, status, start time and duration. |
| `appsscript_scripts_run` | (none) | Runs a function of a script deployed as an API executable. Destructive, so it asks twice: the script can do anything its own scopes allow, and the sign-in needs those scopes (the login asks for one of them here, userinfo.email). |

## Curated tools (7)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `account_remove` | write | Remove a signed-in account | (none) |
| `account_set_default` | write | Set the default account | (none) |
| `accounts_list` | read | Signed-in accounts | (none) |
| `auth_login` | write | Sign in to Google | (none) |
| `auth_setup_client` | write | Save the Google OAuth client | (none) |
| `auth_status` | read | Sign-in status | (none) |
| `health` | read | Server health | (none) |

## Per-method tools (18)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `appsmarket_customer_license_get` | read | appsmarket.customerLicense.get | appsmarketplace.license |
| `appsmarket_user_license_get` | read | appsmarket.userLicense.get | appsmarketplace.license |
| `appsscript_processes_list` | read | script.processes.list | script.processes |
| `appsscript_processes_list_script_proces` | read | script.processes.listScriptProcesses | script.processes |
| `appsscript_projects_create` | write | script.projects.create | script.projects |
| `appsscript_projects_deployments_create` | write | script.projects.deployments.create | script.deployments |
| `appsscript_projects_deployments_delete` | destructive | script.projects.deployments.delete | script.deployments |
| `appsscript_projects_deployments_get` | read | script.projects.deployments.get | script.deployments, script.deployments.readonly |
| `appsscript_projects_deployments_list` | read | script.projects.deployments.list | script.deployments, script.deployments.readonly |
| `appsscript_projects_deployments_update` | write | script.projects.deployments.update | script.deployments |
| `appsscript_projects_get` | read | script.projects.get | script.projects, script.projects.readonly |
| `appsscript_projects_get_content` | read | script.projects.getContent | script.projects, script.projects.readonly |
| `appsscript_projects_get_metrics` | read | script.projects.getMetrics | script.metrics |
| `appsscript_projects_update_content` | destructive | script.projects.updateContent | script.projects |
| `appsscript_projects_versions_create` | write | script.projects.versions.create | script.projects |
| `appsscript_projects_versions_get` | read | script.projects.versions.get | script.projects, script.projects.readonly |
| `appsscript_projects_versions_list` | read | script.projects.versions.list | script.projects, script.projects.readonly |
| `appsscript_scripts_run` | destructive | script.scripts.run | https://mail.google.com/, https://www.google.com/calendar/feeds |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gapps: API methods | (none) |

## Generated APIs

Each API links to Google's documentation for it, as Google's Discovery directory names it (`documentationLink`, kept in `data/catalog.json`). The link is the API's documentation home, not a page per method: the directory gives no link per method, and Google's REST reference pages are laid out differently from product to product.

- Apps Script API (`script/v1`), 16 methods in the catalog. Documentation: <https://developers.google.com/apps-script/api/>
- Google Workspace Marketplace API (`appsmarket/v2`), 2 methods in the catalog. Documentation: <https://developers.google.com/workspace/marketplace>

## Gateway APIs (reached through api_search, api_describe, api_call)

None.

