# Google Drive and Docs (`gdrive`)

Install with the simplest command: `npx google-services-mcps install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Google Drive files, labels and activity, plus Docs, Sheets, Slides, Forms and Books. It searches, reads and downloads files, creates folders, blank Google files and uploads, reads and writes Sheets ranges, and trashes files. Through the per-method tools and the gateway it also reads and writes Docs, Sheets, Slides and Forms content, and manages sharing and labels.

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
| Search and read | `drive_search`, `drive_list_recent`, `drive_get_file`, `drive_read_text`, `drive_download` | read | Search Drive, list recent files, read file metadata, read a file as text (Google files, text, JSON and XML, Office and OpenDocument files, with comments if asked), download a file as base64 |
| Create | `drive_create_folder`, `drive_create_text_file`, `drive_create_file` | write | Create a folder, a text file, a blank Google Doc, Sheet or Slides, or upload content or a local file (converted to a Google type if asked) |
| Change | `drive_update_file` | write | Rename, move, star or describe a file (metadata only; the type is never changed) |
| Sheets | `sheets_get_values` (read), `sheets_write_values`, `sheets_insert_rows` (write) | read, write | Read a range, write values or formulas (`value_input` must say which), insert rows or columns |
| Trash | `drive_trash_file` (destructive), `drive_untrash_file` (write) | destructive, write | Move a file to trash, and restore it from trash |
| Per-method (175) | | mixed | Drive v3 files, permissions, comments, shared drives; Drive Labels (26); Sheets (17); Forms (10); Docs (3); Slides (5); Drive Activity; Books (51) |
| Gateway (2 APIs) | `api_search`, `api_describe`, `api_call` | read, read, dynamic | Drive v2 (75 methods) and Drive Labels v2beta (26 methods) |

The full list is in `docs/capabilities/gdrive.md`.

Every per-method read takes `fields` (Google's partial response, since 1.30.0). Drive's about, approvals, comments and replies methods return no default fields, so their 17 tools send `fields=*` when the call gives none; before 1.30.0 they sent nothing, and Google's guide says such a call must set `fields` (not checked live).

With the plugin option `toolset: google`, the server lists the 19 tools that match Google's Drive, Docs, Sheets and Slides MCP servers (their 20 tools; `sheets_write_values` covers both `update_values` and `update_formulas`), plus `health` and the sign-in tools. `drive_update_file` and `drive_untrash_file` are not in that list: Google's server has no rename, move or restore tool.

Books and Drive Labels are optional parts (2.1.0): the `all` toolset carries their 51 and 26 tools, and no login asks for `books`, `drive.labels` or `drive.labels.readonly` unless the login names them (`--with books,labels`, in the chat `auth_login` with `"with"`). Without them an `all` `readwrite` login asks for `drive`, `drive.activity` and `drive.apps.readonly`. An account that already holds those scopes keeps them, and the tools load for it. The `google` and `curated` toolsets list none of them, so nothing changes there.

## Example requests

- "Find the Q3 budget spreadsheet and tell me who owns it." Claude runs `drive_search`, then `drive_get_file`. No prompt.
- "Read the meeting notes doc and list the action items." Claude runs `drive_read_text`. No prompt.
- "What are the open comments on the proposal.docx?" Claude runs `drive_read_text` with `include_comments`. No prompt.
- "Rename report-final.pdf to Q3 report.pdf and star it." Claude runs `drive_update_file` with `name` and `starred`. It asks first.
- "Move the budget sheet into the Finance folder." Claude runs `drive_update_file` with `parent_id`; it reads the file's folders first, then moves it. It asks first.
- "Restore Q3 report.pdf from the trash." Claude runs `drive_untrash_file`. It asks first, and the approval names the file.
- "Upload C:\Reports\q3.xlsx to Drive as a Google Sheet." Claude runs `drive_create_file` with `local_path` and `google_type: spreadsheet`. It asks first.
- "Put =SUM(B2:B10) in B11 of the budget sheet." Claude runs `sheets_write_values` with `value_input: formulas`. It asks first.
- "Create a folder called Invoices 2026." Claude runs `drive_create_folder`. It asks first.
- "Trash the file old-plan.docx." Claude runs `drive_trash_file`. It asks twice.
- "Remove Sam's access to the Launch folder." Claude uses the permissions delete tool. It asks twice.

## Safety

- Reads never ask. Creates ask first. Trash, delete, permission removal and empty-trash ask twice, and since 1.26.3 so do sharing (a permission create or update) and the Docs, Sheets and Slides batch updates, which can delete content.
- `drive_files_delete` deletes permanently. `drive_files_empty_trash` empties the trash. Both are hard to undo.
- Files can contain instructions aimed at the agent. Read the approval text before you approve a write.
- Text you read goes into the conversation. Avoid reading sensitive files you do not need.
- The `confirmation` option defaults to `every-change`. Change it with `printf '%s' '{"confirmation":"destructive-only"}' | claude plugin configure gdrive@google-services-mcps --values-stdin` (JSON on stdin), or `/plugin configure gdrive@google-services-mcps` in Claude Code.

## Costs and limits

Drive is included with Google Workspace. It allows 1,000,000 quota units per minute per project and 325,000 per user. An older copy of the page gives 12,000 queries per 60 seconds, so the figure is UNVERIFIED; check the console. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/workspace-cloud-search-ai.md`, section 2.

## Caveats

- `drive_read_text` does not read text out of a PDF or an image: Drive has no public call for that, and this server has no PDF reader, so the call refuses and points to `drive_download` rather than return nonsense. A spreadsheet is read one sheet at a time (Drive's CSV export is one sheet deep): the answer names the sheet it read, lists the others, and `sheet` reads one by name.
- Drive Labels, Drive Activity and Books quotas are UNVERIFIED. The Drive Labels pages disagree.
- The gateway reaches the Drive v2 API. Check each method with `api_describe` before a call.
- Drive scope classification is UNVERIFIED. A public OAuth app may need Google's review for its scopes.
- The Docs, Sheets and Slides size limits are not on the pages read (UNVERIFIED).
