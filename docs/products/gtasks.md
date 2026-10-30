# Tasks and Keep (`gtasks`)

Install with the simplest command: `npx google-services-mcps install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Google Tasks task lists and tasks, plus Google Keep notes. It lists, creates, moves, completes and deletes tasks, and it creates, reads, shares and deletes Keep notes. It has no gateway.

## When to install it

- You read or add items to a Google Tasks list.
- You move tasks between lists, or mark them done from a conversation.
- You create Keep notes or read existing ones.
- Wrong choice: you need calendar events or reminders with times. Use `gcalendar`.

## Install and set up

```
claude plugin install gtasks@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-client <client_secret.json>
node <plugin>/bin/gsm.mjs login workspace-user --profile readonly
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gtasks`).

1. In a Google Cloud project, enable the Google Tasks API. Enable the Google Keep API if you use notes.
2. Set up the OAuth consent screen. Use Internal for a Workspace domain. Create an OAuth client ID of type Desktop app and download the JSON file.
3. Run `setup-client`, then `login workspace-user`. Restart the MCP server (`/mcp`) after login.

Start with `--profile readonly`. Changes need a `readwrite` login and the plugin option `allow_writes`.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Task lists and tasks (read) | `tasks_tasklists_list`, `tasks_tasklists_get`, `tasks_tasks_list`, `tasks_tasks_get` | read | List and read lists and tasks |
| Tasks (write) | `tasks_tasks_insert`, `tasks_tasks_update`, `tasks_tasks_patch`, `tasks_tasks_move` | write | Add, change, complete and move tasks |
| | `tasks_tasklists_insert`, `tasks_tasklists_update`, `tasks_tasklists_patch` | write | Create and change lists |
| Tasks (destructive) | `tasks_tasks_delete`, `tasks_tasks_clear`, `tasks_tasklists_delete` | destructive | Delete a task, clear completed tasks from a list, delete a list |
| Keep (read) | `keep_notes_list`, `keep_notes_get`, `keep_media_download` | read | List and read notes, download attached media |
| Keep (write) | `keep_notes_create`, `keep_notes_permissions_batch_create` | write | Create a note, share it |
| Keep (destructive) | `keep_notes_delete`, `keep_notes_permissions_batch_delete` | destructive | Delete a note, remove sharing |
| Gateway | none | | No gateway tools. All methods are per-method tools. |

The full list is in `docs/capabilities/gtasks.md`.

Google has no official MCP server for Tasks or Keep (none was found on 2026-10-29). With the plugin option `toolset: google`, the server lists a small set chosen here instead: `tasks_tasklists_list`, `tasks_tasks_list`, `tasks_tasks_get`, `tasks_tasks_insert`, `tasks_tasks_patch`, `tasks_tasks_delete` (asks twice), `keep_notes_list` and `keep_notes_get` (8 tools), plus `health` and the sign-in tools. List changes, clearing completed tasks and the Keep writes stay in the `all` toolset. A `readonly` login with that toolset asks for `tasks.readonly` and `keep.readonly`; a `readwrite` login for `tasks` and `keep`.

## Example requests

- "What is on my Groceries list?" Claude runs `tasks_tasks_list`. No prompt.
- "Add 'renew passport' to my Errands list, due Friday." Claude runs `tasks_tasks_insert`. It asks first.
- "Mark the dentist task done." Claude runs a task update tool. It asks first.
- "Clear the completed items from Groceries." Claude runs `tasks_tasks_clear`. It asks twice.
- "Make a Keep note with today's meeting agenda." Claude runs `keep_notes_create`. It asks first.

## Safety

- Reads never ask. Writes ask first. Deletes, clear and removing Keep sharing ask twice.
- Deletes and clears are hard to undo.
- Sharing a Keep note with `keep_notes_permissions_batch_create` gives other people access to it.
- The `confirmation` option defaults to `every-change`. Change it with `printf '%s' '{"confirmation":"destructive-only"}' | claude plugin configure gtasks@google-services-mcps --values-stdin` (JSON on stdin), or `/plugin configure gtasks@google-services-mcps` in Claude Code.

## Costs and limits

The Tasks API has a courtesy limit of 50,000 queries per day and no per-minute figure. Increases are requested in the console and are not guaranteed. The fee and the Keep quotas are UNVERIFIED. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/workspace-cloud-search-ai.md`, section 8.

## Caveats

- Keep API quotas, access rules and scope classification are UNVERIFIED. Keep calls to a minimum until they are confirmed.
- Task list and note size limits are UNVERIFIED.
- The plugin has 22 tools. There is no gateway, so an API outside the list is not reachable.
