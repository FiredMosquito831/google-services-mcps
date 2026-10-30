# Use the suite day to day

This guide covers daily use: tool names, approvals, the confirmation settings, the policy file, profiles, the gateway tools, the audit log, common errors and an example conversation.

Read [INSTALL.md](INSTALL.md) and [SETUP.md](SETUP.md) first. This guide assumes Claude Code, because it is the agent with the approval prompt. Codex, OpenCode and Antigravity have no `PreToolUse` approval prompt in this suite. Read [SECURITY.md](SECURITY.md) for what that means for them.

## 1. Tool names

Claude Code names each plugin tool like this:

```
mcp__plugin_<plugin>_<server>__<tool>
```

For every product, the plugin and the server have the same id. So a Gmail tool looks like this:

```
mcp__plugin_gmail_gmail__gmail_users_messages_list
```

- `gmail` (first) is the plugin.
- `gmail` (second) is the server.
- `gmail_users_messages_list` is the tool. It is the method `gmail.users.messages.list` with dots turned into underscores.

Tool names are at most 64 characters. `npx google-services-mcps doctor` checks this. Some long names are shortened; the full method is always in `docs/capabilities/<id>.md`.

Products with gateway APIs have the same three gateway tools:

```
mcp__plugin_gmail_gmail__api_search
mcp__plugin_gmail_gmail__api_describe
mcp__plugin_gmail_gmail__api_call
```

The full tool list of each product is in `plugins/<id>/tool-map.json`, and in [CAPABILITIES.md](CAPABILITIES.md).

## 2. Reads and changes

Every tool is in one of four safety classes.

| Class | Examples | Asks? |
|---|---|---|
| Read | List, get, search, report | Never |
| Write | Create, update, send a draft, add a label | Yes, unless confirmation is `off` |
| Destructive | Delete, remove, send, disable | Yes, twice (see section 3) |
| Dynamic | `api_call`, and Google Ads mutate calls. The risk depends on the call. | Yes, when the call is a change |

A Google Ads mutate call is read when `validateOnly` is set. It is destructive when one operation removes something. Otherwise it is a write.

Write and destructive tools are not listed at all unless **Allow write tools** is on. Dynamic tools, such as `api_call`, are listed anyway. A write sent through a dynamic tool is refused by the server while **Allow write tools** is off. See section 10.

## 3. The approval prompt

When a change or delete runs through Claude Code, you see two steps.

**Step 1: Claude Code's prompt.** The plugin's hook asks Claude Code to confirm. Claude Code shows its normal permission prompt. It is labelled with the plugin, for example `[plugin:gmail]`. The text has this layout (from `src/core/policy.ts`). The example below is for a delete. The argument values are examples:

```
About to permanently change or delete Google data: mcp__plugin_gmail_gmail__gmail_users_messages_trash
Why: Deletes, disables or sends data. Confirmation mode is "every-change", so it asks first.
This may be irreversible. It is a proposed action and has not run yet; nothing has changed.
Method: gmail.users.messages.trash
Arguments:
{
  "userId": "me",
  "id": "18c2f0a9d4e5b6a7"
}

You can turn these confirmations off or limit them in the plugin settings: set 'confirmation' to 'destructive-only' (ask only before deleting or sending) or 'off' (no prompts; policy rules still apply).
```

For a change that is not a delete, the first line reads `About to change Google data: <tool>`, and the second line is the same kind of reason. The arguments show the real values. Strings longer than 1,500 characters are cut and end with `...`. The arguments are cut at 2,000 characters, and the text says how many characters were left out.

The buttons follow Claude Code's standard permission prompt. The exact labels can change between Claude Code versions. **UNVERIFIED** for your version. In the standard prompt:

| Button | What it does |
|---|---|
| **Yes** | Runs this one call. For a destructive call, you still get step 2. |
| **Yes, and don't ask again** | Saves an allow rule in `.claude/settings.local.json` in the repository. **Do not use it for write or delete tools yet.** It is **UNVERIFIED** whether the rule also stops the suite's prompt for a change. Test it on a test account first, or leave it alone. |
| **No** | Refuses the call. Nothing changes. Press `Tab` to add a comment, such as the reason. Claude reads the comment. |

**Step 2: the suite's approval (destructive calls only).** For a delete, a send or a disable, the server asks a second time. The form is titled **Approve this action?**. It has one yes-or-no field, `approve`. Accept to run the action. Decline to cancel it. The form shows the same text as step 1.

**UNVERIFIED:** how Claude Code shows this form. It has not yet been tested in a live session. See [SECURITY.md](SECURITY.md).

### Declining

- **In step 1**, choose **No**. The call does not reach the server. Nothing changes. No line is written to the audit log.
- **In step 2**, decline the form. The server returns `You declined this action. Nothing was changed.` The decision is written to the audit log.

## 4. Confirmation settings

**Confirm before changes** (`confirmation`) has three values. The default is `every-change`.

| Mode | Reads | Changes (write) | Deletes and sends (destructive) |
|---|---|---|---|
| `every-change` (default) | No prompt | Prompt | Prompt, then the second approval |
| `destructive-only` | No prompt | No prompt | Prompt, then the second approval |
| `off` | No prompt | No prompt | No prompt |

Three rules apply in every mode:

- A **deny** rule in the policy file always refuses the call.
- An **ask** rule in the policy file always asks, even when the mode is `off`.
- An **allow** rule in the policy file skips the default question for a change or a delete. It never overrides a deny rule.

**Where to set it:**

| Agent | How |
|---|---|
| Claude Code | The plugin option **Confirm before changes**. Use `/plugin`, then **Configure options**, or see [INSTALL.md](INSTALL.md#3-set-the-plugin-options). |
| Codex, OpenCode, Antigravity | `npx google-services-mcps install --agent <agent> --plugin <id> --confirmation <mode>`, for example with `codex`. It writes `GSM_CONFIRMATION` into the server's environment. See [TUTORIAL.md](TUTORIAL.md). |

**Which value wins.** The hook reads the plugin option first, from `CLAUDE_PLUGIN_OPTION_CONFIRMATION`. The server reads `GSM_CONFIRMATION`. If one of these is set to a valid mode, it wins over the `confirmation` field in `policy.json`. The plugin option has a default, so Claude Code normally passes a value. In that case the `confirmation` field in `policy.json` has no effect. **UNVERIFIED** for your version. Set the mode in the plugin option, and use the policy file for rules.

**Turning confirmations off** removes the prompts. Only the deny rules still protect you. Use `off` only on an account you fully control. See [SECURITY.md](SECURITY.md).

## 5. The policy file

The policy file lets you set rules for tool names and method ids.

**Location.** `policy.json` in the token directory: `~/.google-services-mcps/policy.json`. On Windows, `C:\Users\<you>\.google-services-mcps\policy.json`. The suite never creates this file. You write it.

**Shape.** Two fields are allowed at the top level, and the rule fields are `match` and `action`. Any other field is an error.

```json
{
  "confirmation": "every-change",
  "rules": [
    { "match": "mcp__plugin_gmail_gmail__*_delete", "action": "deny" }
  ]
}
```

- `confirmation` is optional. It is one of `every-change`, `destructive-only` or `off`. See section 4 for when it is used.
- `action` is `allow`, `ask` or `deny`.

**Matching.** A rule is checked against the tool name and against the method id. The method id is shown in the approval text.

- A plain `match` is a glob. `*` matches any run of characters. `?` matches one character. Everything else is literal, and the whole name must match. For example, `mcp__plugin_gmail_gmail__*_delete` matches `mcp__plugin_gmail_gmail__gmail_users_messages_delete`.
- A `match` that starts with `re:` is a JavaScript regular expression. It is not anchored unless you anchor it with `^` or `$`.

**Method ids.** For a per-method tool, the method id is in `plugins/<id>/tool-map.json`, in the `methodId` field. For a gateway method, use `npx google-services-mcps methods <api> <version> --search <text>`. Method ids look like `gmail.users.messages.delete`.

**Order.** The checks run in this order:

1. Any matching `deny` rule: refused. The first one named is shown in the reason.
2. Any matching `ask` rule: asks.
3. Any matching `allow` rule: runs without asking, even where the default would ask.
4. Otherwise the default for the safety class and the mode.

**Reloading.** The hook reads the file on every call. The server reloads it when the file changes. You do not need to restart.

**A broken file.** If the file is not valid JSON, or a field is wrong, the suite asks before every change. It names the error:

```
Invalid policy file C:\Users\<you>\.google-services-mcps\policy.json: ...
```

Fix the file. The error names the field.

### Example 1: block all deletes in Gmail

Use one `deny` rule. It matches the tool name `..._delete` and the method id `gmail.users.messages.batchDelete`:

```json
{
  "rules": [
    { "match": "re:[_.](batch_?)?[dD]elete$", "action": "deny" }
  ]
}
```

With this rule:

- `gmail_users_messages_delete`, `gmail_users_messages_batch_delete` and `gmail_users_drafts_delete` are refused.
- `gmail_users_messages_trash` is not a delete. It still asks.
- A delete sent through `api_call` is refused too.
- Reads are not affected.

The hook shows the refusal to Claude as the reason, with the line `Why: Denied by policy rule "re:[_.](batch_?)?[dD]elete$".`. If a call reaches the server anyway, the server returns `Denied by policy rule "re:[_.](batch_?)?[dD]elete$". Nothing was changed.`

**Checked:** the rule was run through the suite's decision code (`dist/core/policy.js`) with the tool names from `plugins/gmail/tool-map.json`. It was not run inside Claude Code.

### Example 2: always ask before any Google Ads change

Use `ask` rules on the Ads mutate tools. An `ask` rule asks even when the confirmation mode is `off`:

```json
{
  "rules": [
    { "match": "mcp__plugin_gads_gads__*_mutate", "action": "ask" },
    { "match": "googleads.customers.*.mutate", "action": "ask" }
  ]
}
```

- The first rule covers the curated `ads_mutate` tool and the per-method mutate tools.
- The second rule covers a mutate sent through `api_call`, by method id.
- Reads that are not mutate calls are not matched, and they keep their normal behaviour.

**Limit.** These rules cover mutate calls only. Other Google Ads writes, and the Display & Video 360 and other `create` methods, are not matched. With the mode `off`, they run without asking. To ask before every gads tool, reads included, use one rule with `"match": "mcp__plugin_gads_gads__*"` and `"action": "ask"`.

**Checked:** the rules were run through the decision code. `ads_mutate` and the `api_call` mutate asked. The `admob` list read was allowed. It was not run inside Claude Code.

### Example 3: allow reads in gcloud

**Reads already run without asking.** The suite does not gate reads. You need no rule for reads. A rule with `allow` changes nothing for a read.

If you want the reads named explicitly, match only names that are reads. In `plugins/gcloud/tool-map.json`, every tool whose name ends in `_list`, `_get` or `_search` is a read (checked: 63, 60 and 5 tools). The rule is:

```json
{
  "rules": [
    { "match": "mcp__plugin_gcloud_gcloud__*_list", "action": "allow" },
    { "match": "mcp__plugin_gcloud_gcloud__*_get", "action": "allow" },
    { "match": "mcp__plugin_gcloud_gcloud__*_search", "action": "allow" }
  ]
}
```

**Do not write `mcp__plugin_gcloud_gcloud__*` with `allow`.** That rule would skip the prompt for every gcloud change and delete too. A key deletion, for example, would run without asking.

**Checked:** the three rules were run through the decision code. A gcloud read was allowed. A key create still asked, and a key delete still asked. With the broad rule, the key delete ran without asking. It was not run inside Claude Code.

## 6. Read-only and write profiles

A **profile** decides which Google scopes the login asks for. The token's scopes decide which tools are listed.

| Profile | What it covers | Use it when |
|---|---|---|
| `readonly` (default) | Read tools with read-only scopes. A read tool with no read-only scope is left out. | You start. Or you only read. |
| `readwrite` | Read, write and destructive tools, with the narrowest scopes that cover them. | You need changes for this product. |
| `full` | Every tool, with the broadest scope listed for each method. | You need every method, for example in an admin setup. Use rarely. |
| `--scopes <urls>` | Exactly the scopes you list. Nothing else is added. | You know the scopes you need. |

**Gmail.** A product can hold scopes back from a profile. For Gmail:

| Profile | Gmail scopes |
|---|---|
| `readonly` | `gmail.readonly` |
| `readwrite` | `gmail.modify` and `gmail.settings.basic`: search, read, send, drafts, labels, trash, and the filter, vacation, IMAP and POP settings. |
| `full` | `https://mail.google.com/` and `gmail.settings.basic`. Only `full` covers permanent delete (`messages.delete`, `messages.batchDelete`, `threads.delete`). |

No profile asks for `gmail.settings.sharing`. Google allows its methods (delegates, forwarding addresses, send-as create and delete, auto-forwarding) only for a service account with domain-wide delegation. Gmail Postmaster Tools is an optional part: add it with `--with postmaster` (in the chat: `auth_login` with `"with": ["postmaster"]`). In the chat, `auth_login` takes `profile: "full"` too. The login prints a `Held back:` line for each group of tools a profile leaves out, and the chat sign-in repeats them. A token that already holds `https://mail.google.com/` or the Postmaster scopes keeps those tools: the scope check at startup is unchanged.

**Sending Gmail.** `gmail_send` sends a new message and `gmail_reply` answers one in its thread. Both are destructive, like `gmail_send_draft`: they ask twice, and the second prompt shows the exact message (recipients, subject, the thread a reply joins, attachment names and sizes, the size of the message and the start of the text). A declined prompt sends nothing. Both need a `readwrite` login (`gmail.modify`); no new scope is asked for. To review a message first, use `gmail_create_draft` (it takes `reply_to_message_id`, `body_html` and `attachments` too), then `gmail_send_draft`.

**Calendar.** `calendar_suggest_time` finds times when everyone is free: it reads the free/busy periods of the people you name (and yours), and returns free periods and one suggested meeting time per period, inside `working_hours` and on weekdays when you ask. It is a read and never asks. `calendar_respond` answers an invitation (accepted, declined or tentative, with a comment); only your own answer is sent. `calendar_create_event` and `calendar_update_event` take `add_meet` (a Google Meet link), `recurrence` (RRULE lines; a timed recurring event needs `time_zone`) and `reminders`; `calendar_update_event` takes `add_attendees` and `remove_attendees`, which keep the other guests and their answers (`attendees` still replaces the whole list). `calendar_list_events` still starts at the current time when no `time_min` is given; `include_past: true` lists without a lower bound, as Google's own Calendar MCP server does. With `toolset: google`, a `readonly` login asks for `calendar.readonly` and a `readwrite` login for `calendar` (the one scope that covers every tool of the list), the same as the `all` toolset.

**Drive, Docs and Sheets.** `drive_list_recent` lists your newest files. `drive_read_text` reads Google Docs, Sheets and Slides, text files, and Word, Excel and PowerPoint (docx, xlsx, pptx) and OpenDocument (odt, ods, odp) files up to 20 MB; `include_comments` adds the comment threads. It does not read text out of PDFs or images: Drive has no public call for that. `drive_download` returns a file's bytes as base64 (Google files are exported, to text by default or to the type you name); a file too large for the result limit (`GSM_MAX_RESULT_CHARS`) returns its size and a note instead. `drive_create_file` makes a blank Google Doc, Sheet, Slides or folder, or uploads text, base64 bytes or a local file (`local_path`, a full path; files in the folder that holds your Google sign-in data are refused, as for Gmail attachments); with `google_type` and content, Drive converts the content to that Google type. `sheets_get_values` reads a range; `sheets_write_values` writes one, and `value_input` must say how: `data` stores the values as given, `formulas` reads them as if typed, so `=A1+B1` becomes a formula; `sheets_insert_rows` inserts rows or columns. The writes ask first. With `toolset: google`, a `readonly` login asks for `drive.readonly` and a `readwrite` login for `drive`, the one scope that covers every tool of the list.

**Google Cloud.** `logging_entries_list` searches Cloud Logging: give a project (or folders, organizations or log views), and narrow with a Logging query, a severity (that level and above), a resource type (for example `cloud_run_revision` or `cloud_function`) and a time window (`start_time` and `end_time`, or `freshness` such as `6h`). With no time limit at all it searches the last day, as `gcloud logging read` does, and says so. Rows are short by default (`view: full` gives Google's entries). `monitoring_query_promql` runs a PromQL query on Cloud Monitoring metrics: a range query with `start_time`, `end_time` and `step`, or an instant query. `monitoring_dashboards_list` and `monitoring_dashboard_get` read dashboards; `iam_roles_list` and `iam_role_get` read predefined and custom roles. `billing_price_lookup` gives the latest price of a SKU, or finds the SKUs of a service by words and region with their list prices, and with `billing_account` that account's own prices. `gcs_read_text` and `gcs_read_object` read a Cloud Storage object as text or as base64, at most 8 MiB a call and at most what fits the result limit (`GSM_MAX_RESULT_CHARS`); `next_offset` continues. `gcs_write_text` writes text or a local file to an object; it asks first, and it does not replace an existing object unless you pass `overwrite: true`. With `toolset: google`, gcloud lists 59 tools that match Google's Cloud MCP servers; a `readonly` login asks for `cloud-platform.read-only` and `cloud-billing.readonly`, and a `readwrite` login for `cloud-platform` and `bigquery`.

**Search Console.** Google has no official MCP server for Search Console, so `toolset: google` on gsc is a small set chosen here: the property, search analytics, URL inspection and sitemap tools, and the two Indexing API tools (nine tools). A `readonly` login with it asks for `webmasters.readonly`, a `readwrite` login for `webmasters` and `indexing`. The Indexing API takes only pages with JobPosting or BroadcastEvent markup.

**Two switches for a change.** A write or delete needs both of these:

1. A token with the write scope. Log in again with `--profile readwrite`.
2. **Allow write tools** on (`GSM_ALLOW_WRITES=true`).

**To compare profiles** for a group, run this (**checked**):

```
npx google-services-mcps scopes workspace-user --servers gmail
```

It prints how many tools each profile covers, and the scopes it asks for.

**To switch to readwrite** for Gmail:

```
npx google-services-mcps login workspace-user --profile readwrite --servers gmail
```

A login merges with the scopes the same account already holds for its group, so logging in for one product keeps the others. Name the account with `--account <email>` (in the chat: `auth_login` with `account`): only that account's stored scopes are merged, and only the ones a server of the group uses. Without `--account`, nothing is merged, and a login that would take scopes away from an account already signed in saves nothing and says how to retry. Use `--replace` to drop the stored scopes and keep only what this login requests. A merge can leave write scopes from an earlier readwrite login in place: when you want a readonly token again, log in with `--replace`. Then restart the server: `/mcp` in Claude Code, or restart the agent.

## 7. The gateway workflow

Products with gateway APIs have three gateway tools. They reach those APIs, for methods that do not have a tool of their own. The workflow is always the same:

1. **Search** for a method with `api_search`.
2. **Describe** it with `api_describe`. This shows its HTTP verb, path, safety class, scopes, parameters and body fields.
3. **Call** it with `api_call`. The call checks the token's scopes first.

`api_call` takes the same safety rules as any other tool. A read runs without a prompt. A write or a delete asks, as described in section 3.

### Worked example: list Google Analytics account summaries

This uses the `ganalytics` product. Its gateway API `analyticsadmin` (version `v1alpha`) has the method `analyticsadmin.accountSummaries.list`. It is a read. It needs a read-only Analytics scope (`analytics.readonly` or `analytics.edit`).

**Step 1: search.** Claude calls `mcp__plugin_ganalytics_ganalytics__api_search` with:

```json
{ "query": "accountSummaries", "api": "analyticsadmin", "limit": 5 }
```

**Step 2: describe.** Claude calls `mcp__plugin_ganalytics_ganalytics__api_describe` with:

```json
{ "method": "analyticsadmin.accountSummaries.list" }
```

**Step 3: call.** Claude calls `mcp__plugin_ganalytics_ganalytics__api_call` with:

```json
{ "method": "analyticsadmin.accountSummaries.list" }
```

This method has no path parameters, so the call needs no more fields. For a method with path values, the call needs `pathParams`. For a list method with optional query values, the call can add `query`, such as `{"pageSize": 10}`, if `api_describe` lists it as a parameter.

**Checked:** the method id, its verb (`GET`), its path (`v1alpha/accountSummaries`), its kind (read) and its scopes come from `plugins/ganalytics/catalog.json` and `npx google-services-mcps methods`. The three tool calls were not run inside Claude Code.

**Errors from the gateway** (from `src/core/gateway.ts`):

- `"<name>" is not a query parameter of this method. Allowed: ...` means the `query` field has a name the method does not declare. Use one of the allowed names.
- `<method> is a GET method, so it takes no body.` means you sent a `body` to a GET.
- `<method> takes no request body.` means you sent a `body` to a method that has none.

## 8. The audit log

The suite writes one line for each **gated** action to `audit.log` in the token directory. A gated action is a write, a delete or a send.

**Reads are not logged.** The gate skips reads before it writes anything.

**Fields** (from `src/core/approval.ts`):

| Field | Meaning |
|---|---|
| `time` | When the line was written, in ISO format |
| `tool` | The tool name |
| `methodId` | The method id, when there is one |
| `risk` | `modify` (a write) or `destructive` |
| `decision` | `allow`, `ask` or `deny`, from the policy and the mode |
| `outcome` | What happened. See the list below. |
| `argsSha256` | The first 16 hex characters of a SHA-256 hash of the arguments. The values are never written. |

**Outcomes:**

| Outcome | Meaning |
|---|---|
| `allowed` | The policy or mode allowed the call. It ran. |
| `hook` | The hook asked, and Claude Code's prompt was answered yes. The change ran. |
| `approved` | The second approval form was accepted. The action ran. |
| `declined` | The second approval form was declined. Nothing changed. |
| `denied` | A deny rule matched, or writes are off. Nothing changed. |
| `unavailable` | The client cannot ask, so the action did not run. |

**Example layout.** This line shows the fields. It is not a real record:

```json
{"time":"2026-10-15T09:30:00.000Z","tool":"mcp__plugin_gmail_gmail__gmail_users_messages_trash","methodId":"gmail.users.messages.trash","risk":"destructive","decision":"ask","outcome":"approved","argsSha256":"0123456789abcdef"}
```

**Notes:**

- A call you decline in Claude Code's prompt (step 1 in section 3) never reaches the server. So it writes no line. **UNVERIFIED** in a live session.
- A line is written only when the log can be written. A write failure is reported on stderr. It does not block the action.
- The log is plain text. It is not tamper-evident.

## 9. The approval step when Claude Code is not the client

Only Claude Code shows the hook's prompt. For other clients, the server asks through MCP elicitation. A client that cannot elicit gets an error, and the action does not run. Codex, OpenCode and Antigravity are in this group. **UNVERIFIED** in a live session for each of them.

## 10. Common errors

The messages below are the exact text from the code. The fix is what to do next. The suite retries rate-limit and unavailable responses up to 3 attempts in total, with backoff; after that the error reaches Claude.

| Message (or the start of it) | Meaning | What to do |
|---|---|---|
| `Writes are turned off for this server (GSM_ALLOW_WRITES is not "true"), so <tool> was not run.` | **Allow write tools** is off. | Turn it on in the plugin options. Restart the server. |
| The approval prompt shows, you approve, and the call still fails with the line above | Dynamic tools are listed while writes are off, and the server refuses the write. | Turn on **Allow write tools** if you need the change. Otherwise decline the prompt. |
| `Denied by policy rule "<match>". Nothing was changed.` | A `deny` rule matched. The hook shows the same reason as a `Why:` line. | Change or remove the rule in `policy.json`, if you meant to allow the call. |
| `Invalid policy file <path>: ...` | `policy.json` is not valid. Changes now ask. | Fix the JSON or the field named in the error. |
| `You declined this action. Nothing was changed.` | You declined the second approval. | Nothing to fix. Run the action again if you want it. |
| `This client cannot ask for confirmation, so the action was not run. ...` | The client has no approval step. | Use Claude Code for changes. Turning confirmation off to get past this is not recommended. See [SECURITY.md](SECURITY.md). |
| `Not logged in for "<group>". Run: node <plugin>/bin/gsm.mjs login <group> ...` | No token for the group. | Set up the client, then log in. See [SETUP.md](SETUP.md). |
| `HTTP 403 \| reason=insufficientPermissions \| ... \| The token lacks a scope for this tool. Log in again with a broader profile: ...` | The token does not have the scope for this tool. | Log in again with `--profile readwrite`, and restart the server. For `workspace-admin`, use `npx google-services-mcps setup-admin --profile readwrite`. |
| `HTTP 429 \| ...` or `HTTP 503 \| ...` | Google is throttling the call. The suite retried it, and it still failed. | Wait, then try again. Check the quota in the Cloud console. See [LIMITS-AND-COSTS.md](LIMITS-AND-COSTS.md). |
| `[truncated: <n> more characters. Narrow the query or raise GSM_MAX_RESULT_CHARS.]` | The result was more than 50,000 characters. | Narrow the query: fewer fields, a smaller page size or a filter. The plugin does not set `GSM_MAX_RESULT_CHARS`. |
| `"<name>" is not a query parameter of this method. Allowed: ...` | `api_call` was given a query name the method does not declare. | Use one of the allowed names from `api_describe`. |
| `This plugin could not be identified (no readable plugin.json and no tool map), so asking to be safe.` | The hook cannot find its plugin files. | Reinstall the plugin. Run `npx google-services-mcps doctor --plugin <id>`. |
| `Unknown tool, asking to be safe.` | The tool is not in this plugin's tool map. | Reinstall or update the plugin. Run `npx google-services-mcps doctor --plugin <id>`. |
| `Could not check this action, so asking to be safe. ...` | The hook could not read its tool map or policy. | Read the error after the message. Fix the file it names. |
| `The method of this call is missing, is not known to this plugin, or has no dynamic rule, so asking to be safe.` | `api_call` named a method this plugin does not know. | Search for the method with `api_search`. Use only methods listed for this product. |

## 11. An example conversation

The three requests below show what Claude does, and what you see. This is an illustration. It is not a recorded session.

**Request 1: a read.**

> Show the subjects of my five most recent Gmail messages.

Claude calls `mcp__plugin_gmail_gmail__gmail_users_messages_list`, then `mcp__plugin_gmail_gmail__gmail_users_messages_get` for each message. Reads never ask. You see the subjects. Nothing is changed.

**Request 2: a change, with approval.** This needs **Allow write tools** on, and a `readwrite` login for `gcalendar`.

> Add a 30-minute event called "Review with Anna" next Friday at 10:00 in my calendar.

Claude calls `mcp__plugin_gcalendar_gcalendar__calendar_events_insert`. This is a write. Claude Code shows its prompt, labelled `[plugin:gcalendar]`. The text shows the arguments Claude sends, such as the start time and the title. You choose **Yes**. The event is created, and `audit.log` gets a line with the outcome `hook`.

If you choose **No**, Claude says that you refused, and no event is created.

**Request 3: a delete, with two approvals.** This needs **Allow write tools** on, and a `readwrite` login for `gmail`. If you added the Gmail rule from section 5, Claude is refused at once.

> Delete all emails from newsletter@example.com that are older than a year.

Claude first searches with `mcp__plugin_gmail_gmail__gmail_users_messages_list`, which is a read. Then it proposes `mcp__plugin_gmail_gmail__gmail_users_messages_batch_delete`, which is destructive. You see Claude Code's prompt, labelled `[plugin:gmail]`, with the message IDs in the arguments. You choose **Yes**. Then the second form, **Approve this action?**, appears. You accept it. The messages are deleted, and `audit.log` gets a line with the outcome `approved`.

If you decline either step, nothing is deleted. Claude reports that the action did not run.

## Related reading

- [SECURITY.md](SECURITY.md): the controls and their limits.
- [SETUP.md](SETUP.md): logins, the workspace admin and the API key.
- [LIMITS-AND-COSTS.md](LIMITS-AND-COSTS.md): quotas and costs.
