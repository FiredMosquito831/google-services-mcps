# Tasks and Keep (`gtasks`)

Google Tasks task lists and tasks, plus Google Keep notes.

- Plugin: `gtasks`, MCP server: `gtasks`, login: Desktop OAuth client, then `login workspace-user`
- Install: `claude plugin install gtasks@google-services-mcps`
- Tools: 31 total. Curated 9, per-method 21, gateway 0. Read 11, write 15, destructive 5, dynamic 0.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 31, google 17, curated 31 (all) tools, each with the 9 runtime tools of the map counted. "(all)" means the product has no such toolset yet, so it lists every tool.

## Toolset google (8)

Google has no official MCP server for this product. The google toolset is a lean set chosen here: No official Google MCP server for Google Tasks or Google Keep was found (Google's Cloud and Workspace MCP lists, 2026-10-29; a negative, not confirmed by Google); a lean set chosen here..

| Tool | Google's tool | Note |
|---|---|---|
| `tasks_tasklists_list` | (none) | Your task lists and their ids. Start here; @default is your first list. |
| `tasks_tasks_list` | (none) | The tasks of one list, with due dates and status; showCompleted and dueMin/dueMax narrow it. |
| `tasks_tasks_get` | (none) | One task with its notes, due date, status and links. |
| `tasks_tasks_insert` | (none) | Adds a task to a list (as a subtask with parent). A write, so it asks first. |
| `tasks_tasks_patch` | (none) | Changes only the fields given: title, notes, due date, or status completed. A write, so it asks first. |
| `tasks_tasks_delete` | (none) | Deletes a task. Destructive, so it asks twice. |
| `keep_notes_list` | (none) | Google Keep notes, read only here (filter by trashed or create and update time). Google documents the Keep API for Google Workspace; whether a personal account can use it is not verified. |
| `keep_notes_get` | (none) | One Keep note with its text or list items. |

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

## Per-method tools (21)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `keep_media_download` | read | keep.media.download | keep, keep.readonly |
| `keep_notes_create` | write | keep.notes.create | keep |
| `keep_notes_delete` | destructive | keep.notes.delete | keep |
| `keep_notes_get` | read | keep.notes.get | keep, keep.readonly |
| `keep_notes_list` | read | keep.notes.list | keep, keep.readonly |
| `keep_notes_permissions_batch_create` | write | keep.notes.permissions.batchCreate | keep |
| `keep_notes_permissions_batch_delete` | destructive | keep.notes.permissions.batchDelete | keep |
| `tasks_tasklists_delete` | destructive | tasks.tasklists.delete | tasks |
| `tasks_tasklists_get` | read | tasks.tasklists.get | tasks, tasks.readonly |
| `tasks_tasklists_insert` | write | tasks.tasklists.insert | tasks |
| `tasks_tasklists_list` | read | tasks.tasklists.list | tasks, tasks.readonly |
| `tasks_tasklists_patch` | write | tasks.tasklists.patch | tasks |
| `tasks_tasklists_update` | write | tasks.tasklists.update | tasks |
| `tasks_tasks_clear` | destructive | tasks.tasks.clear | tasks |
| `tasks_tasks_delete` | destructive | tasks.tasks.delete | tasks |
| `tasks_tasks_get` | read | tasks.tasks.get | tasks, tasks.readonly |
| `tasks_tasks_insert` | write | tasks.tasks.insert | tasks |
| `tasks_tasks_list` | read | tasks.tasks.list | tasks, tasks.readonly |
| `tasks_tasks_move` | write | tasks.tasks.move | tasks |
| `tasks_tasks_patch` | write | tasks.tasks.patch | tasks |
| `tasks_tasks_update` | write | tasks.tasks.update | tasks |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gtasks: API methods | (none) |

## Generated APIs

- Google Tasks API (`tasks/v1`), 14 methods in the catalog
- Google Keep API (`keep/v1`), 7 methods in the catalog

## Gateway APIs (reached through api_search, api_describe, api_call)

None.

