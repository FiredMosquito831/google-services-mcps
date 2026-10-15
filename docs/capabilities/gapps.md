# Apps Script (`gapps`)

Apps Script projects and execution, plus the Workspace Marketplace SDK.

- Plugin: `gapps`, MCP server: `gapps`, login: Desktop OAuth client, then `login workspace-user`
- Install: `claude plugin install gapps@google-services-mcps`
- Tools: 19 total. Curated 0, per-method 18, gateway 0. Read 12, write 5, destructive 2, dynamic 0.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

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
| `appsscript_projects_update_content` | write | script.projects.updateContent | script.projects |
| `appsscript_projects_versions_create` | write | script.projects.versions.create | script.projects |
| `appsscript_projects_versions_get` | read | script.projects.versions.get | script.projects, script.projects.readonly |
| `appsscript_projects_versions_list` | read | script.projects.versions.list | script.projects, script.projects.readonly |
| `appsscript_scripts_run` | destructive | script.scripts.run | https://mail.google.com/, https://www.google.com/calendar/feeds |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gapps: API methods | (none) |

## Generated APIs

- Apps Script API (`script/v1`), 16 methods in the catalog
- Google Workspace Marketplace API (`appsmarket/v2`), 2 methods in the catalog

## Gateway APIs (reached through api_search, api_describe, api_call)

None.

