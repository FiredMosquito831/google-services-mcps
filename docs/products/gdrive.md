# Google Drive and Docs (`gdrive`)

Google Drive files, labels and activity, plus Docs, Sheets, Slides, Forms and Books. It searches and reads files, creates folders and text files, and trashes files. Through the per-method tools and the gateway it also reads and writes Docs, Sheets, Slides and Forms content, and manages sharing and labels.

## When to install it

- You find, read and summarize Drive files.
- You create folders or text files, or move files to trash.
- You read or update Sheets, Docs or Slides content.
- Wrong choice: you only need mail or calendar. Use `gmail` or `gcalendar`.

## Install and set up

```
claude plugin install gdrive@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-client <client_secret.json>
node <plugin>/bin/gsm.mjs login workspace-user --profile readonly
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gdrive`).

1. In a Google Cloud project, enable the Google Drive API. Enable the Docs, Sheets, Slides or Forms APIs if you use them.
2. Set up the OAuth consent screen. Use Internal for a Workspace domain. An External app left in Testing loses its refresh token after 7 days.
3. Create an OAuth client ID of type Desktop app and download the JSON file.
4. Run `setup-client`, then `login workspace-user`. Restart the MCP server (`/mcp`) after login.

Start with `--profile readonly`. Writes need a `readwrite` login and the plugin option `allow_writes`. The `workspace-user` login is shared with the other Workspace products.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Search and read | `drive_search`, `drive_get_file`, `drive_read_text` | read | Search Drive, read file metadata, read a file as text |
| Create | `drive_create_folder`, `drive_create_text_file` | write | Create a folder or a text file |
| Trash | `drive_trash_file` | destructive | Move a file to trash |
| Per-method (175) | | mixed | Drive v3 files, permissions, comments, shared drives; Drive Labels (26); Sheets (17); Forms (10); Docs (3); Slides (5); Drive Activity; Books (51) |
| Gateway (2 APIs) | `api_search`, `api_describe`, `api_call` | read, read, dynamic | Drive v2 (75 methods) and Drive Labels v2beta (26 methods) |

The full list is in `docs/capabilities/gdrive.md`.

## Example requests

- "Find the Q3 budget spreadsheet and tell me who owns it." Claude runs `drive_search`, then `drive_get_file`. No prompt.
- "Read the meeting notes doc and list the action items." Claude runs `drive_read_text`. No prompt.
- "Create a folder called Invoices 2026." Claude runs `drive_create_folder`. It asks first.
- "Trash the file old-plan.docx." Claude runs `drive_trash_file`. It asks twice.
- "Remove Sam's access to the Launch folder." Claude uses the permissions delete tool. It asks twice.

## Safety

- Reads never ask. Creates ask first. Trash, delete, permission removal and empty-trash ask twice.
- `drive_files_delete` deletes permanently. `drive_files_empty_trash` empties the trash. Both are hard to undo.
- Files can contain instructions aimed at the agent. Read the approval text before you approve a write.
- Text you read goes into the conversation. Avoid reading sensitive files you do not need.
- The `confirmation` option defaults to `every-change`. Change it with `claude plugin configure gdrive`.

## Costs and limits

Drive is included with Google Workspace. It allows 1,000,000 quota units per minute per project and 325,000 per user. An older copy of the page gives 12,000 queries per 60 seconds, so the figure is UNVERIFIED; check the console. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/workspace-cloud-search-ai.md`, section 2.

## Caveats

- Drive Labels, Drive Activity and Books quotas are UNVERIFIED. The Drive Labels pages disagree.
- The gateway reaches the Drive v2 API. Check each method with `api_describe` before a call.
- Drive scope classification is UNVERIFIED. A public OAuth app may need Google's review for its scopes.
- The Docs, Sheets and Slides size limits are not on the pages read (UNVERIFIED).
