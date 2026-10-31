# Gmail (`gmail`)

Install with the simplest command: `npx google-services-mcps install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Gmail mailboxes, messages, threads, drafts, labels and settings. The settings include filters, forwarding, delegates, send-as addresses, vacation replies, IMAP and POP. It also reads Gmail Postmaster Tools data for your sending domains.

## When to install it

- You search, read and summarize mail.
- You draft replies and leave them for review before sending.
- You create or change labels, filters and vacation replies.
- You check sender reputation with Postmaster Tools.
- Wrong choice: bulk or system sending. Workspace caps sending at 2,000 messages per user per day.

## Install and set up

```
claude plugin install gmail@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-client <client_secret.json>
node <plugin>/bin/gsm.mjs login workspace-user --profile readonly
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gmail`).

1. In a Google Cloud project, enable the Gmail API. Enable the Gmail Postmaster Tools API if you use it.
2. Set up the OAuth consent screen. Use Internal for a Workspace domain. Create an OAuth client ID of type Desktop app and download the JSON file.
3. Run `setup-client`, then `login workspace-user`. Restart the MCP server (`/mcp`) after login.

Start with `--profile readonly`. Sending and changes need a `readwrite` login and the plugin option `allow_writes`. Gmail uses restricted scopes. A public app needs Google's restricted-scope verification.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Search and read | `gmail_search`, `gmail_search_threads`, `gmail_get_message`, `gmail_get_thread`, `gmail_get_attachment`, `gmail_list_labels`, `gmail_list_drafts` | read | Search messages or whole conversations, read a message or a thread (text and HTML bodies, each part in its own charset, attachment ids), download an attachment, list labels (all or yours, paged) and drafts (with a search) |
| Draft | `gmail_create_draft` | write | Create a draft: text, HTML, attachments, or a reply in a thread. Nothing is sent. |
| Organise | `gmail_create_label`, `gmail_label`, `gmail_unlabel`, `gmail_untrash` | write | Create a label (name and colour), add or remove labels on a thread or a message (by id or name), take mail out of Trash |
| Trash | `gmail_trash` | destructive | Move a thread or a message to Trash. The approval shows what moves. |
| Send | `gmail_send_draft`, `gmail_send`, `gmail_reply` | destructive | Send a draft, send a new message, or reply in a thread. Sending cannot be undone. |
| Per-method (87) | | mixed | Messages, threads, drafts, labels, history; settings: filters, forwarding, delegates, send-as, vacation, IMAP, POP, S/MIME, client-side encryption keys; Postmaster Tools domains and statistics |
| Gateway (2 APIs) | `api_search`, `api_describe`, `api_call` | read, read, dynamic | Gmail Postmaster Tools v1 and v1beta1 |

The full list is in `docs/capabilities/gmail.md`.

With the plugin option `toolset: google`, the server lists 13 tools that match Google's Gmail MCP server (https://developers.google.com/workspace/gmail/api/reference/mcp): `gmail_search_threads`, `gmail_get_thread`, `gmail_get_message`, `gmail_list_drafts`, `gmail_create_draft`, `gmail_list_labels`, `gmail_create_label`, `gmail_label` and `gmail_unlabel` for its eleven tools, and four kept on purpose: `gmail_get_attachment` (a read, so the attachment ids lead somewhere), `gmail_send_draft`, `gmail_trash` and `gmail_untrash` (they ask first), plus `health` and the sign-in tools. Since 1.39.0 it lists `gmail_create_label` in place of the generated `gmail_users_labels_create`, and no longer `gmail_search`, which searches messages while Google's `search_threads` is `gmail_search_threads`; the `all` and `curated` toolsets keep both. The generated tools that a hand-written tool covers say which one in their descriptions.

## Example requests

- "Find emails from my accountant since January with attachments." Claude runs `gmail_search`. No prompt.
- "Summarise the conversation about the venue." Claude runs `gmail_search_threads`, then `gmail_get_thread`. No prompt.
- "Label the thread from billing@vendor.test as Invoices and archive it." Claude runs `gmail_label` (Invoices) and `gmail_unlabel` (INBOX). Each asks first.
- "Draft a reply to Maria's last message saying Thursday works." Claude reads the thread, then runs `gmail_create_draft`. It asks first. Nothing is sent.
- "Send the draft to Maria." Claude runs `gmail_send_draft`. It asks twice, and the preview shows the recipients and body.
- "Reply to Maria that Thursday works, and attach the agenda from D:\docs\agenda.pdf." Claude runs `gmail_reply`. It asks twice. The second prompt shows who the reply goes to, the subject, the thread, the file name and size, and the start of the text. The reply stays in Maria's thread.
- "Send the report to the team." Claude runs `gmail_send` with the recipients, subject, body and attachments. It asks twice, as for every send.
- "Label mail from billing@vendor.test as Invoices." Claude creates a filter with a settings write tool. It asks first and needs a `readwrite` login.
- "Set an out-of-office reply until Friday." Claude runs the vacation settings write tool. It asks first.

## Safety

- Reads never ask. Writes ask first. Sends and deletes ask twice: a hook prompt and an exact preview. Since 1.26.3 so do a new forwarding address, auto-forwarding, a new delegate and the permanent deletion of a client-side encryption key pair.
- Sending is irreversible. Check the preview before you approve.
- Attachments are local files, given by full path. The whole message may be up to 35 MB once encoded (Gmail's limit). A file in the token folder (tokens, the OAuth client, the API key) or in gcloud's folder is refused, so a mail cannot carry a sign-in secret out.
- `gmail_get_attachment` returns the file as base64 when it fits the server's result limit (`GSM_MAX_RESULT_CHARS`, default 25,000 characters, about 18 KB of file). A larger file returns its size and a note; with `offset` (0, then each `next_offset`) it comes in parts of about 18 KB, to be joined in order.
- Message deletes remove mail. Trash moves a message to Trash, and Gmail empties Trash after 30 days. `gmail_label` does not move mail to Trash or Spam; `gmail_trash` does the first, and asks first. Since 1.38.4 the per-method `gmail_users_messages_modify`, `gmail_users_threads_modify` and `gmail_users_messages_batch_modify` ask as destructive actions when they add `TRASH` or `SPAM`, also under `destructive-only`; other label changes stay writes.
- `gmail_send_draft` reads the draft before it asks (since 1.38.4): the approval shows its recipients, subject, attachments and the start of the body.
- Filters, forwarding, auto-forwarding, delegates and send-as changes can route mail away from you. Treat them as high risk.
- Mail can carry instructions aimed at the agent. Read the approval text before you approve anything.
- The `confirmation` option defaults to `every-change`. Change it with `printf '%s' '{"confirmation":"destructive-only"}' | claude plugin configure gmail@google-services-mcps --values-stdin` (JSON on stdin), or `/plugin configure gmail@google-services-mcps` in Claude Code.

## Costs and limits

Gmail is included with Google Workspace. Sending costs 100 quota units per call, and each user gets 6,000 units per minute. Google plans overage charges later in 2026 with no amount given, and consumer sending is capped at 500 messages per day. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/workspace-cloud-search-ai.md`, section 3.

## Caveats

- The quota units for the settings methods and Postmaster Tools are UNVERIFIED.
- Gmail quota error codes are not on the pages read (UNVERIFIED).
- Restricted Gmail scopes need verification for public apps, and a security assessment if a server stores restricted data.
- Settings and Postmaster Tools coverage follows the tool list in `docs/capabilities/gmail.md`. Check it for the exact methods.
