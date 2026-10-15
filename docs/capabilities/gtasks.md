# Tasks and Keep (`gtasks`)

Google Tasks task lists and tasks, plus Google Keep notes.

- Plugin: `gtasks`, MCP server: `gtasks`, login: Desktop OAuth client, then `login workspace-user`
- Install: `claude plugin install gtasks@google-services-mcps`
- Tools: 22 total. Curated 0, per-method 21, gateway 0. Read 8, write 9, destructive 5, dynamic 0.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

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

