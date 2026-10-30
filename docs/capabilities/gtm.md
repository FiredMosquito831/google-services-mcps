# Tag Manager (`gtm`)

Google Tag Manager accounts, containers, tags, triggers and variables.

- Plugin: `gtm`, MCP server: `gtm`, login: Desktop OAuth client, then `login business`
- Install: `claude plugin install gtm@google-services-mcps`
- Tools: 119 total. Curated 9, per-method 106, gateway 3. Read 44, write 59, destructive 15, dynamic 1.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 119, google 22, curated 12 tools, each with the 9 runtime tools of the map counted. "(all)" means the product has no such toolset yet, so it lists every tool.

## Toolset google (13)

Google has no official MCP server for this product. The google toolset is a lean set chosen here: No official Google MCP server for Google Tag Manager was found (Google's Cloud and Workspace MCP lists and Google's GitHub organisations, 2026-10-29; a negative, not confirmed by Google); a lean set chosen here..

| Tool | Google's tool | Note |
|---|---|---|
| `tagmgr_accounts_list` | (none) | The Tag Manager accounts the signed-in user can see. Start here. |
| `tagmgr_accounts_containers_list` | (none) | The containers of an account (web, iOS, Android, AMP, server) with their public ids (GTM-XXXX). |
| `tagmgr_accounts_containers_workspaces_list` | (none) | The workspaces of a container. Changes are made in a workspace, saved as a version, then published. |
| `tagmgr_accounts_containe_workspac_tags_list` | (none) | The tags of a workspace. |
| `tagmgr_accounts_containe_workspace_tags_get` | (none) | One tag with its type, parameters and firing and blocking triggers. |
| `tagmgr_account_contain_workspa_trigger_list` | (none) | The triggers of a workspace. |
| `tagmgr_account_contain_workspa_triggers_get` | (none) | One trigger with its type and filters. |
| `tagmgr_account_contain_workspa_variabl_list` | (none) | The user-defined variables of a workspace. |
| `tagmgr_account_contain_workspa_variable_get` | (none) | One variable with its type and parameters. |
| `tagmgr_accounts_containers_versions_live` | (none) | The version that is live now, with its tags, triggers and variables. |
| `tagmgr_accounts_containers_version_hea_list` | (none) | The versions of a container as headers: name, number and counts. |
| `tagmgr_accounts_containe_workspac_create_ve` | (none) | Saves a workspace as a new container version. A write, so it asks first; nothing goes live. |
| `tagmgr_accounts_containers_versions_publish` | (none) | Publishes a version: it goes live on every site or app that loads the container. A write, so it asks first; check the version before. |

## Curated tools (9)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `account_remove` | write | Remove a signed-in account | (none) |
| `account_set_default` | write | Set the default account | (none) |
| `accounts_list` | read | Signed-in accounts | (none) |
| `auth_login` | write | Sign in to Google | (none) |
| `auth_setup_admin` | write | Set up the workspace admin account | (none) |
| `auth_setup_client` | write | Save the Google OAuth client | (none) |
| `auth_setup_service_account` | write | Set up the service account key | (none) |
| `auth_status` | read | Sign-in status | (none) |
| `health` | read | Server health | (none) |

## Per-method tools (106)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `tagmgr_accoun_contai_worksp_folders_entitie` | write | tagmanager.accounts.containers.workspaces.folders.entities | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accoun_contai_worksp_folders_move_en` | write | tagmanager.accounts.containers.workspaces.folders.move_entities_to_folder | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_built_i_create` | write | tagmanager.accounts.containers.workspaces.built_in_variables.create | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_built_i_delete` | destructive | tagmanager.accounts.containers.workspaces.built_in_variables.delete | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_built_i_revert` | write | tagmanager.accounts.containers.workspaces.built_in_variables.revert | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_clients_create` | write | tagmanager.accounts.containers.workspaces.clients.create | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_clients_delete` | destructive | tagmanager.accounts.containers.workspaces.clients.delete | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_clients_revert` | write | tagmanager.accounts.containers.workspaces.clients.revert | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_clients_update` | write | tagmanager.accounts.containers.workspaces.clients.update | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_folders_create` | write | tagmanager.accounts.containers.workspaces.folders.create | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_folders_delete` | destructive | tagmanager.accounts.containers.workspaces.folders.delete | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_folders_revert` | write | tagmanager.accounts.containers.workspaces.folders.revert | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_folders_update` | write | tagmanager.accounts.containers.workspaces.folders.update | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_gtag_co_create` | write | tagmanager.accounts.containers.workspaces.gtag_config.create | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_gtag_co_delete` | destructive | tagmanager.accounts.containers.workspaces.gtag_config.delete | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_gtag_co_update` | write | tagmanager.accounts.containers.workspaces.gtag_config.update | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_templat_create` | write | tagmanager.accounts.containers.workspaces.templates.create | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_templat_delete` | destructive | tagmanager.accounts.containers.workspaces.templates.delete | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_templat_import` | write | tagmanager.accounts.containers.workspaces.templates.import_from_gallery | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_templat_revert` | write | tagmanager.accounts.containers.workspaces.templates.revert | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_templat_update` | write | tagmanager.accounts.containers.workspaces.templates.update | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_transfo_create` | write | tagmanager.accounts.containers.workspaces.transformations.create | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_transfo_delete` | destructive | tagmanager.accounts.containers.workspaces.transformations.delete | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_transfo_revert` | write | tagmanager.accounts.containers.workspaces.transformations.revert | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_transfo_update` | write | tagmanager.accounts.containers.workspaces.transformations.update | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_trigger_create` | write | tagmanager.accounts.containers.workspaces.triggers.create | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_trigger_delete` | destructive | tagmanager.accounts.containers.workspaces.triggers.delete | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_trigger_revert` | write | tagmanager.accounts.containers.workspaces.triggers.revert | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_trigger_update` | write | tagmanager.accounts.containers.workspaces.triggers.update | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_variabl_create` | write | tagmanager.accounts.containers.workspaces.variables.create | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_variabl_delete` | destructive | tagmanager.accounts.containers.workspaces.variables.delete | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_variabl_revert` | write | tagmanager.accounts.containers.workspaces.variables.revert | tagmanager.edit.containers |
| `tagmgr_accoun_contai_workspa_variabl_update` | write | tagmanager.accounts.containers.workspaces.variables.update | tagmanager.edit.containers |
| `tagmgr_account_contain_workspa_built_i_list` | read | tagmanager.accounts.containers.workspaces.built_in_variables.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_account_contain_workspa_clients_list` | read | tagmanager.accounts.containers.workspaces.clients.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_account_contain_workspa_folders_list` | read | tagmanager.accounts.containers.workspaces.folders.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_account_contain_workspa_gtag_co_list` | read | tagmanager.accounts.containers.workspaces.gtag_config.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_account_contain_workspa_gtag_con_get` | read | tagmanager.accounts.containers.workspaces.gtag_config.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_account_contain_workspa_templat_list` | read | tagmanager.accounts.containers.workspaces.templates.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_account_contain_workspa_template_get` | read | tagmanager.accounts.containers.workspaces.templates.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_account_contain_workspa_transfo_list` | read | tagmanager.accounts.containers.workspaces.transformations.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_account_contain_workspa_transfor_get` | read | tagmanager.accounts.containers.workspaces.transformations.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_account_contain_workspa_trigger_list` | read | tagmanager.accounts.containers.workspaces.triggers.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_account_contain_workspa_triggers_get` | read | tagmanager.accounts.containers.workspaces.triggers.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_account_contain_workspa_variabl_list` | read | tagmanager.accounts.containers.workspaces.variables.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_account_contain_workspa_variable_get` | read | tagmanager.accounts.containers.workspaces.variables.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_account_contain_workspa_zones_create` | write | tagmanager.accounts.containers.workspaces.zones.create | tagmanager.edit.containers |
| `tagmgr_account_contain_workspa_zones_delete` | destructive | tagmanager.accounts.containers.workspaces.zones.delete | tagmanager.edit.containers |
| `tagmgr_account_contain_workspa_zones_revert` | write | tagmanager.accounts.containers.workspaces.zones.revert | tagmanager.edit.containers |
| `tagmgr_account_contain_workspa_zones_update` | write | tagmanager.accounts.containers.workspaces.zones.update | tagmanager.edit.containers |
| `tagmgr_account_contain_workspac_clients_get` | read | tagmanager.accounts.containers.workspaces.clients.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_account_contain_workspac_folders_get` | read | tagmanager.accounts.containers.workspaces.folders.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_account_contain_workspac_tags_create` | write | tagmanager.accounts.containers.workspaces.tags.create | tagmanager.edit.containers |
| `tagmgr_account_contain_workspac_tags_delete` | destructive | tagmanager.accounts.containers.workspaces.tags.delete | tagmanager.edit.containers |
| `tagmgr_account_contain_workspac_tags_revert` | write | tagmanager.accounts.containers.workspaces.tags.revert | tagmanager.edit.containers |
| `tagmgr_account_contain_workspac_tags_update` | write | tagmanager.accounts.containers.workspaces.tags.update | tagmanager.edit.containers |
| `tagmgr_account_containe_workspac_zones_list` | read | tagmanager.accounts.containers.workspaces.zones.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containe_environm_reauthori` | write | tagmanager.accounts.containers.environments.reauthorize | tagmanager.publish |
| `tagmgr_accounts_containe_versions_set_lates` | write | tagmanager.accounts.containers.versions.set_latest | tagmanager.edit.containers |
| `tagmgr_accounts_containe_workspac_bulk_upda` | write | tagmanager.accounts.containers.workspaces.bulk_update | tagmanager.edit.containers |
| `tagmgr_accounts_containe_workspac_create_ve` | write | tagmanager.accounts.containers.workspaces.create_version | tagmanager.edit.containerversions |
| `tagmgr_accounts_containe_workspac_get_statu` | read | tagmanager.accounts.containers.workspaces.getStatus | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containe_workspac_quick_pre` | write | tagmanager.accounts.containers.workspaces.quick_preview | tagmanager.edit.containerversions |
| `tagmgr_accounts_containe_workspac_resolve_c` | write | tagmanager.accounts.containers.workspaces.resolve_conflict | tagmanager.edit.containers |
| `tagmgr_accounts_containe_workspac_tags_list` | read | tagmanager.accounts.containers.workspaces.tags.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containe_workspac_zones_get` | read | tagmanager.accounts.containers.workspaces.zones.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containe_workspace_tags_get` | read | tagmanager.accounts.containers.workspaces.tags.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_container_environmen_create` | write | tagmanager.accounts.containers.environments.create | tagmanager.edit.containers |
| `tagmgr_accounts_container_environmen_delete` | destructive | tagmanager.accounts.containers.environments.delete | tagmanager.edit.containers |
| `tagmgr_accounts_container_environmen_update` | write | tagmanager.accounts.containers.environments.update | tagmanager.edit.containers |
| `tagmgr_accounts_container_version_he_latest` | read | tagmanager.accounts.containers.version_headers.latest | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_container_versions_undelete` | write | tagmanager.accounts.containers.versions.undelete | tagmanager.edit.containerversions |
| `tagmgr_accounts_container_workspaces_create` | write | tagmanager.accounts.containers.workspaces.create | tagmanager.edit.containers |
| `tagmgr_accounts_container_workspaces_delete` | destructive | tagmanager.accounts.containers.workspaces.delete | tagmanager.delete.containers |
| `tagmgr_accounts_container_workspaces_update` | write | tagmanager.accounts.containers.workspaces.update | tagmanager.edit.containers |
| `tagmgr_accounts_containers_combine` | write | tagmanager.accounts.containers.combine | tagmanager.edit.containers |
| `tagmgr_accounts_containers_create` | write | tagmanager.accounts.containers.create | tagmanager.edit.containers |
| `tagmgr_accounts_containers_delete` | destructive | tagmanager.accounts.containers.delete | tagmanager.delete.containers |
| `tagmgr_accounts_containers_destination_link` | write | tagmanager.accounts.containers.destinations.link | tagmanager.edit.containers |
| `tagmgr_accounts_containers_destination_list` | read | tagmanager.accounts.containers.destinations.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containers_destinations_get` | read | tagmanager.accounts.containers.destinations.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containers_environment_list` | read | tagmanager.accounts.containers.environments.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containers_environments_get` | read | tagmanager.accounts.containers.environments.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containers_get` | read | tagmanager.accounts.containers.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containers_list` | read | tagmanager.accounts.containers.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containers_lookup` | read | tagmanager.accounts.containers.lookup | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containers_move_tag_id` | write | tagmanager.accounts.containers.move_tag_id | tagmanager.edit.containers |
| `tagmgr_accounts_containers_snippet` | read | tagmanager.accounts.containers.snippet | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containers_update` | write | tagmanager.accounts.containers.update | tagmanager.edit.containers |
| `tagmgr_accounts_containers_version_hea_list` | read | tagmanager.accounts.containers.version_headers.list | tagmanager.edit.containers, tagmanager.edit.containerversions |
| `tagmgr_accounts_containers_versions_delete` | destructive | tagmanager.accounts.containers.versions.delete | tagmanager.edit.containerversions |
| `tagmgr_accounts_containers_versions_get` | read | tagmanager.accounts.containers.versions.get | tagmanager.edit.containers, tagmanager.edit.containerversions |
| `tagmgr_accounts_containers_versions_live` | read | tagmanager.accounts.containers.versions.live | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containers_versions_publish` | write | tagmanager.accounts.containers.versions.publish | tagmanager.publish |
| `tagmgr_accounts_containers_versions_update` | write | tagmanager.accounts.containers.versions.update | tagmanager.edit.containerversions |
| `tagmgr_accounts_containers_workspaces_get` | read | tagmanager.accounts.containers.workspaces.get | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containers_workspaces_list` | read | tagmanager.accounts.containers.workspaces.list | tagmanager.edit.containers, tagmanager.readonly |
| `tagmgr_accounts_containers_workspaces_sync` | write | tagmanager.accounts.containers.workspaces.sync | tagmanager.edit.containers |
| `tagmgr_accounts_get` | read | tagmanager.accounts.get | tagmanager.edit.containers, tagmanager.manage.accounts |
| `tagmgr_accounts_list` | read | tagmanager.accounts.list | tagmanager.edit.containers, tagmanager.manage.accounts |
| `tagmgr_accounts_update` | write | tagmanager.accounts.update | tagmanager.manage.accounts |
| `tagmgr_accounts_user_permissions_create` | write | tagmanager.accounts.user_permissions.create | tagmanager.manage.users |
| `tagmgr_accounts_user_permissions_delete` | destructive | tagmanager.accounts.user_permissions.delete | tagmanager.manage.users |
| `tagmgr_accounts_user_permissions_get` | read | tagmanager.accounts.user_permissions.get | tagmanager.manage.users |
| `tagmgr_accounts_user_permissions_list` | read | tagmanager.accounts.user_permissions.list | tagmanager.manage.users |
| `tagmgr_accounts_user_permissions_update` | write | tagmanager.accounts.user_permissions.update | tagmanager.manage.users |

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

