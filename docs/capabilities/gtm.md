# Tag Manager (`gtm`)

Google Tag Manager accounts, containers, tags, triggers and variables.

- Plugin: `gtm`, MCP server: `gtm`, login: Desktop OAuth client, then `login business`
- Install: `claude plugin install gtm@google-services-mcps`
- Tools: 118 total. Curated 8, per-method 106, gateway 3. Read 45, write 52, destructive 20, dynamic 1.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 118, google 24, curated 11 tools, each counting the 7 runtime tools this server registers (`account_remove`, `account_set_default`, `accounts_list`, `auth_login`, `auth_setup_client`, `auth_status`, `health`). "(all)" means the product has no such toolset yet, so it lists every tool.

## Not registered by this server (2)

The tool map (`plugins/<id>/tool-map.json`) also lists these, so the consent hook knows every name, but this server never registers them, and the counts above leave them out.

- Sign-in tools of other sign-in kinds: `auth_setup_admin`, `auth_setup_service_account`.

## Toolset google (17)

Google has no official MCP server for this product. The google toolset is a lean set chosen here: No official Google MCP server for Google Tag Manager was found (Google's Cloud and Workspace MCP lists and Google's GitHub organisations, 2026-10-29; a negative, not confirmed by Google); a lean set chosen here.

| Tool | Google's tool | Note |
|---|---|---|
| `tagmgr_accounts_list` | (none) | The Tag Manager accounts the signed-in user can see. Start here. |
| `tagmgr_accounts_containers_list` | (none) | The containers of an account (web, iOS, Android, AMP, server) with their public ids (GTM-XXXX). |
| `tagmgr_accounts_containers_lookup` | (none) | The container behind a destination id, such as GTM-XXXX: gives the accounts/{account}/containers/{container} path the other tools take. |
| `tagmgr_accounts_containers_workspaces_list` | (none) | The workspaces of a container. Changes are made in a workspace, saved as a version, then published. |
| `tagmgr_accounts_containers_workspaces_get` | (none) | One workspace: its name, description and id. |
| `tagmgr_accts_ctrs_ws_get_status` | (none) | A workspace's status, as the workspace syncs: merge conflicts and the changes it holds. |
| `tagmgr_accts_ctrs_ws_tags_list` | (none) | The tags of a workspace. |
| `tagmgr_accts_ctrs_ws_tags_get` | (none) | One tag with its type, parameters and firing and blocking triggers. |
| `tagmgr_accts_ctrs_ws_triggers_list` | (none) | The triggers of a workspace. |
| `tagmgr_accts_ctrs_ws_triggers_get` | (none) | One trigger with its type and filters. |
| `tagmgr_accts_ctrs_ws_variables_list` | (none) | The user-defined variables of a workspace. |
| `tagmgr_accts_ctrs_ws_variables_get` | (none) | One variable with its type and parameters. |
| `tagmgr_accounts_containers_versions_live` | (none) | The version that is live now, with its tags, triggers and variables. It can be large; the result limit may cut it. |
| `tagmgr_accounts_containers_versions_get` | (none) | One container version by its id (such as 7): its name, notes and contents, and the fingerprint Google checks when it is published. |
| `tagmgr_accts_ctrs_ver_headers_list` | (none) | The versions of a container as headers: name, number and counts. |
| `tagmgr_accts_ctrs_ws_create_ver` | (none) | Saves a workspace as a new container version, and Google deletes the workspace (Discovery: "Creates a Container Version from the entities present in the workspace, deletes the workspace"). Destructive since 1.26.3, so it asks twice. Nothing goes live: publishing is a second step. |
| `gtm_publish_version` | (none) | Publishes a container version, so every page or app loading the container runs it. Before asking, it reads the container, the version and the live version, and the approval names what is added, changed and removed and any Custom HTML or custom JavaScript. It takes the place of the generated publish tool in this list. Destructive, so it asks twice. |

## Curated tools (8)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `account_remove` | write | Remove a signed-in account | (none) |
| `account_set_default` | write | Set the default account | (none) |
| `accounts_list` | read | Signed-in accounts | (none) |
| `auth_login` | write | Sign in to Google | (none) |
| `auth_setup_client` | write | Save the Google OAuth client | (none) |
| `auth_status` | read | Sign-in status | (none) |
| `gtm_publish_version` | destructive | Publish a Tag Manager version | tagmanager.publish |
| `health` | read | Server health | (none) |

## Per-method tools (106)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `tag_accts_ctrs_ws_built_in_variables_create` | write | tagmanager.accounts.containers.workspaces.built_in_variables.create | tagmanager.edit.containers |
| `tag_accts_ctrs_ws_built_in_variables_delete` | destructive | tagmanager.accounts.containers.workspaces.built_in_variables.delete | tagmanager.edit.containers |
| `tag_accts_ctrs_ws_built_in_variables_revert` | write | tagmanager.accounts.containers.workspaces.built_in_variables.revert | tagmanager.edit.containers |
| `tag_ctrs_ws_folders_move_entities_to_folder` | write | tagmanager.accounts.containers.workspaces.folders.move_entities_to_folder | tagmanager.edit.containers |
| `tagmg_accts_ctrs_ws_built_in_variables_list` | read | tagmanager.accounts.containers.workspaces.built_in_variables.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containers_combine` | write | tagmanager.accounts.containers.combine | tagmanager.edit.containers |
| `tagmgr_accounts_containers_create` | write | tagmanager.accounts.containers.create | tagmanager.edit.containers |
| `tagmgr_accounts_containers_delete` | destructive | tagmanager.accounts.containers.delete | tagmanager.delete.containers |
| `tagmgr_accounts_containers_destinations_get` | read | tagmanager.accounts.containers.destinations.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containers_environments_get` | read | tagmanager.accounts.containers.environments.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containers_get` | read | tagmanager.accounts.containers.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containers_list` | read | tagmanager.accounts.containers.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containers_lookup` | read | tagmanager.accounts.containers.lookup | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containers_move_tag_id` | write | tagmanager.accounts.containers.move_tag_id | tagmanager.edit.containers |
| `tagmgr_accounts_containers_snippet` | read | tagmanager.accounts.containers.snippet | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containers_update` | write | tagmanager.accounts.containers.update | tagmanager.edit.containers |
| `tagmgr_accounts_containers_versions_delete` | destructive | tagmanager.accounts.containers.versions.delete | tagmanager.edit.containerversions |
| `tagmgr_accounts_containers_versions_get` | read | tagmanager.accounts.containers.versions.get | tagmanager.edit.containers, tagmanager.edit.containerversions |
| `tagmgr_accounts_containers_versions_live` | read | tagmanager.accounts.containers.versions.live | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containers_versions_publish` | destructive | tagmanager.accounts.containers.versions.publish | tagmanager.publish |
| `tagmgr_accounts_containers_versions_update` | write | tagmanager.accounts.containers.versions.update | tagmanager.edit.containerversions |
| `tagmgr_accounts_containers_workspaces_get` | read | tagmanager.accounts.containers.workspaces.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containers_workspaces_list` | read | tagmanager.accounts.containers.workspaces.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containers_workspaces_sync` | write | tagmanager.accounts.containers.workspaces.sync | tagmanager.edit.containers |
| `tagmgr_accounts_get` | read | tagmanager.accounts.get | tagmanager.edit.containers, tagmanager.manage.accounts |
| `tagmgr_accounts_list` | read | tagmanager.accounts.list | tagmanager.edit.containers, tagmanager.manage.accounts |
| `tagmgr_accounts_update` | write | tagmanager.accounts.update | tagmanager.manage.accounts |
| `tagmgr_accounts_user_permissions_create` | destructive | tagmanager.accounts.user_permissions.create | tagmanager.manage.users |
| `tagmgr_accounts_user_permissions_delete` | destructive | tagmanager.accounts.user_permissions.delete | tagmanager.manage.users |
| `tagmgr_accounts_user_permissions_get` | read | tagmanager.accounts.user_permissions.get | tagmanager.manage.users |
| `tagmgr_accounts_user_permissions_list` | read | tagmanager.accounts.user_permissions.list | tagmanager.manage.users |
| `tagmgr_accounts_user_permissions_update` | destructive | tagmanager.accounts.user_permissions.update | tagmanager.manage.users |
| `tagmgr_accts_ctrs_destinations_link` | write | tagmanager.accounts.containers.destinations.link | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_destinations_list` | read | tagmanager.accounts.containers.destinations.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accts_ctrs_envs_create` | write | tagmanager.accounts.containers.environments.create | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_envs_delete` | destructive | tagmanager.accounts.containers.environments.delete | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_envs_list` | read | tagmanager.accounts.containers.environments.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accts_ctrs_envs_reauthorize` | write | tagmanager.accounts.containers.environments.reauthorize | tagmanager.publish |
| `tagmgr_accts_ctrs_envs_update` | write | tagmanager.accounts.containers.environments.update | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ver_headers_latest` | read | tagmanager.accounts.containers.version_headers.latest | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accts_ctrs_ver_headers_list` | read | tagmanager.accounts.containers.version_headers.list | tagmanager.edit.containers, tagmanager.edit.containerversions |
| `tagmgr_accts_ctrs_vers_set_latest` | write | tagmanager.accounts.containers.versions.set_latest | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_vers_undelete` | write | tagmanager.accounts.containers.versions.undelete | tagmanager.edit.containerversions |
| `tagmgr_accts_ctrs_ws_bulk_update` | write | tagmanager.accounts.containers.workspaces.bulk_update | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_clients_create` | write | tagmanager.accounts.containers.workspaces.clients.create | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_clients_delete` | destructive | tagmanager.accounts.containers.workspaces.clients.delete | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_clients_get` | read | tagmanager.accounts.containers.workspaces.clients.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accts_ctrs_ws_clients_list` | read | tagmanager.accounts.containers.workspaces.clients.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accts_ctrs_ws_clients_revert` | write | tagmanager.accounts.containers.workspaces.clients.revert | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_clients_update` | write | tagmanager.accounts.containers.workspaces.clients.update | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_create` | write | tagmanager.accounts.containers.workspaces.create | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_create_ver` | destructive | tagmanager.accounts.containers.workspaces.create_version | tagmanager.edit.containerversions |
| `tagmgr_accts_ctrs_ws_delete` | destructive | tagmanager.accounts.containers.workspaces.delete | tagmanager.delete.containers |
| `tagmgr_accts_ctrs_ws_folders_create` | write | tagmanager.accounts.containers.workspaces.folders.create | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_folders_delete` | destructive | tagmanager.accounts.containers.workspaces.folders.delete | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_folders_entities` | read | tagmanager.accounts.containers.workspaces.folders.entities | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accts_ctrs_ws_folders_get` | read | tagmanager.accounts.containers.workspaces.folders.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accts_ctrs_ws_folders_list` | read | tagmanager.accounts.containers.workspaces.folders.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accts_ctrs_ws_folders_revert` | write | tagmanager.accounts.containers.workspaces.folders.revert | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_folders_update` | write | tagmanager.accounts.containers.workspaces.folders.update | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_get_status` | read | tagmanager.accounts.containers.workspaces.getStatus | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accts_ctrs_ws_gtag_config_create` | write | tagmanager.accounts.containers.workspaces.gtag_config.create | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_gtag_config_delete` | destructive | tagmanager.accounts.containers.workspaces.gtag_config.delete | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_gtag_config_get` | read | tagmanager.accounts.containers.workspaces.gtag_config.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accts_ctrs_ws_gtag_config_list` | read | tagmanager.accounts.containers.workspaces.gtag_config.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accts_ctrs_ws_gtag_config_update` | write | tagmanager.accounts.containers.workspaces.gtag_config.update | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_quick_preview` | write | tagmanager.accounts.containers.workspaces.quick_preview | tagmanager.edit.containerversions |
| `tagmgr_accts_ctrs_ws_resolve_conflict` | write | tagmanager.accounts.containers.workspaces.resolve_conflict | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_tags_create` | write | tagmanager.accounts.containers.workspaces.tags.create | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_tags_delete` | destructive | tagmanager.accounts.containers.workspaces.tags.delete | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_tags_get` | read | tagmanager.accounts.containers.workspaces.tags.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accts_ctrs_ws_tags_list` | read | tagmanager.accounts.containers.workspaces.tags.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accts_ctrs_ws_tags_revert` | write | tagmanager.accounts.containers.workspaces.tags.revert | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_tags_update` | write | tagmanager.accounts.containers.workspaces.tags.update | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_tmpls_create` | write | tagmanager.accounts.containers.workspaces.templates.create | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_tmpls_delete` | destructive | tagmanager.accounts.containers.workspaces.templates.delete | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_tmpls_get` | read | tagmanager.accounts.containers.workspaces.templates.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accts_ctrs_ws_tmpls_list` | read | tagmanager.accounts.containers.workspaces.templates.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accts_ctrs_ws_tmpls_revert` | write | tagmanager.accounts.containers.workspaces.templates.revert | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_tmpls_update` | write | tagmanager.accounts.containers.workspaces.templates.update | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_transformations_create` | write | tagmanager.accounts.containers.workspaces.transformations.create | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_transformations_delete` | destructive | tagmanager.accounts.containers.workspaces.transformations.delete | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_transformations_get` | read | tagmanager.accounts.containers.workspaces.transformations.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accts_ctrs_ws_transformations_list` | read | tagmanager.accounts.containers.workspaces.transformations.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accts_ctrs_ws_transformations_revert` | write | tagmanager.accounts.containers.workspaces.transformations.revert | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_transformations_update` | write | tagmanager.accounts.containers.workspaces.transformations.update | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_triggers_create` | write | tagmanager.accounts.containers.workspaces.triggers.create | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_triggers_delete` | destructive | tagmanager.accounts.containers.workspaces.triggers.delete | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_triggers_get` | read | tagmanager.accounts.containers.workspaces.triggers.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accts_ctrs_ws_triggers_list` | read | tagmanager.accounts.containers.workspaces.triggers.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accts_ctrs_ws_triggers_revert` | write | tagmanager.accounts.containers.workspaces.triggers.revert | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_triggers_update` | write | tagmanager.accounts.containers.workspaces.triggers.update | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_update` | write | tagmanager.accounts.containers.workspaces.update | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_variables_create` | write | tagmanager.accounts.containers.workspaces.variables.create | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_variables_delete` | destructive | tagmanager.accounts.containers.workspaces.variables.delete | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_variables_get` | read | tagmanager.accounts.containers.workspaces.variables.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accts_ctrs_ws_variables_list` | read | tagmanager.accounts.containers.workspaces.variables.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accts_ctrs_ws_variables_revert` | write | tagmanager.accounts.containers.workspaces.variables.revert | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_variables_update` | write | tagmanager.accounts.containers.workspaces.variables.update | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_zones_create` | write | tagmanager.accounts.containers.workspaces.zones.create | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_zones_delete` | destructive | tagmanager.accounts.containers.workspaces.zones.delete | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_zones_get` | read | tagmanager.accounts.containers.workspaces.zones.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accts_ctrs_ws_zones_list` | read | tagmanager.accounts.containers.workspaces.zones.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accts_ctrs_ws_zones_revert` | write | tagmanager.accounts.containers.workspaces.zones.revert | tagmanager.edit.containers |
| `tagmgr_accts_ctrs_ws_zones_update` | write | tagmanager.accounts.containers.workspaces.zones.update | tagmanager.edit.containers |
| `tagmgr_ctrs_ws_tmpls_import_from_gallery` | write | tagmanager.accounts.containers.workspaces.templates.import_from_gallery | tagmanager.edit.containers |

## Gateway tools (3)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_call` | dynamic | Call an API method | (none) |
| `api_describe` | read | Describe an API method | (none) |
| `api_search` | read | Search API methods | (none) |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gtm: API methods | (none) |

## Generated APIs

Each API links to Google's documentation for it, as Google's Discovery directory names it (`documentationLink`, kept in `data/catalog.json`). The link is the API's documentation home, not a page per method: the directory gives no link per method, and Google's REST reference pages are laid out differently from product to product.

- Tag Manager API (`tagmanager/v2`), 106 methods in the catalog. Documentation: <https://developers.google.com/tag-manager>

## Gateway APIs (reached through api_search, api_describe, api_call)

- Tag Manager API (`tagmanager/v1`), 49 methods. Documentation: <https://developers.google.com/tag-manager>

