# Gmail (`gmail`)

Install with the simplest command: `node gsm.mjs install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

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
| Search and read | `gmail_search`, `gmail_get_message`, `gmail_list_labels`, `gmail_list_drafts` | read | Search mail, read a message, list labels and drafts |
| Draft | `gmail_create_draft` | write | Create a draft. Nothing is sent. |
| Send | `gmail_send_draft` | destructive | Send a draft. Sending cannot be undone. |
| Per-method (87) | | mixed | Messages, threads, drafts, labels, history; settings: filters, forwarding, delegates, send-as, vacation, IMAP, POP, S/MIME, client-side encryption keys; Postmaster Tools domains and statistics |
| Gateway (2 APIs) | `api_search`, `api_describe`, `api_call` | read, read, dynamic | Gmail Postmaster Tools v1 and v1beta1 |

The full list is in `docs/capabilities/gmail.md`.

## Example requests

- "Find emails from my accountant since January with attachments." Claude runs `gmail_search`. No prompt.
- "Draft a reply to Maria's last message saying Thursday works." Claude reads the thread, then runs `gmail_create_draft`. It asks first. Nothing is sent.
- "Send the draft to Maria." Claude runs `gmail_send_draft`. It asks twice, and the preview shows the recipients and body.
- "Label mail from billing@vendor.test as Invoices." Claude creates a filter with a settings write tool. It asks first and needs a `readwrite` login.
- "Set an out-of-office reply until Friday." Claude runs the vacation settings write tool. It asks first.

## Safety

- Reads never ask. Writes ask first. Sends and deletes ask twice: a hook prompt and an exact preview.
- Sending is irreversible. Check the preview before you approve.
- Message deletes remove mail. Trash moves a message to Trash.
- Filters, forwarding, auto-forwarding, delegates and send-as changes can route mail away from you. Treat them as high risk.
- Mail can carry instructions aimed at the agent. Read the approval text before you approve anything.
- The `confirmation` option defaults to `every-change`. Change it with `claude plugin configure gmail`.

## Costs and limits

Gmail is included with Google Workspace. Sending costs 100 quota units per call, and each user gets 6,000 units per minute. Google plans overage charges later in 2026 with no amount given, and consumer sending is capped at 500 messages per day. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/workspace-cloud-search-ai.md`, section 3.

## Caveats

- The quota units for the settings methods and Postmaster Tools are UNVERIFIED.
- Gmail quota error codes are not on the pages read (UNVERIFIED).
- Restricted Gmail scopes need verification for public apps, and a security assessment if a server stores restricted data.
- Settings and Postmaster Tools coverage follows the tool list in `docs/capabilities/gmail.md`. Check it for the exact methods.
