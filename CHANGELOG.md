# Changelog

All notable changes to the npm package `google-services-mcps`. Each release has a matching GitHub release (`vX.Y.Z`), whose notes are the entry below. Versions 0.1.0 to 0.1.2 are listed on the GitHub releases page.

## 1.11.0 - 2026-10-30

### New: a lean google toolset for Search Console
- Google has no official MCP server for Search Console (none was found on 2026-10-29), so the `google` toolset of gsc is a small set chosen here, as the owner decided for products without one: `sc_sites_list`, `sc_site_get`, `sc_search_analytics_query`, `sc_url_inspect`, `sc_sitemaps_list`, `sc_sitemap_get`, `sc_sitemap_submit` (write), `indexing_url_notifications_get_metadata` and `indexing_url_notifications_publish` (write; Google takes it only for JobPosting or BroadcastEvent pages). Each tool has a note in `config/products.json`. No tool is added or changed.
- A `readonly` login with it asks for `webmasters.readonly`; a `readwrite` login for `webmasters` and `indexing` (the `all` toolset adds `siteverification`).
- The help text and the plugin option say that `google` is Google's set, or a small set chosen here where Google has no server.

### Not changed
- The tools gsc lists with `all`, their schemas, scopes of the `all` toolset, the write gate and the hook. Every other plugin lists the same tools.

## 1.10.0 - 2026-10-30

### New: Google Cloud tools that match Google's Cloud MCP servers
Each description names the Google tool it matches. All are reads except `gcs_write_text`.
- `logging_entries_list` (`list_log_entries`): Cloud Logging entries of a project, or of folders, organizations, billing accounts or log views. Narrow with a Logging query, `severity` (that level and above), `resource_type` (for example `cloud_run_revision`, `cloud_function`) and a window (`start_time`/`end_time` or `freshness` such as `6h`). Without any time limit it searches the last day, as `gcloud logging read` does, and says so. Newest first; short rows by default, `view: full` for Google's entries.
- `monitoring_query_promql` (`query_range`): a PromQL range query (`start_time`, `end_time`, `step`) or instant query on Cloud Monitoring (the Managed Service for Prometheus query API). It is a read: it only evaluates the query, as Google marks it. The gateway still classifies the two Prometheus POST methods as writes by their names.
- `monitoring_dashboards_list` and `monitoring_dashboard_get` (`list_dashboards`, `get_dashboard`).
- `iam_roles_list` and `iam_role_get` (`list_roles`, `get_role`): predefined roles, or a project's or organization's custom roles, with their permissions. IAM lists only `cloud-platform` for these methods, so a `readonly` login cannot run them.
- `billing_price_lookup` (`list_prices`, `get_price`, `list_billing_account_prices`, `get_billing_account_price`): the latest price of one SKU (Cloud Billing v1beta), or the SKUs of a service found by words and region with their list prices (v1), and with `billing_account` that account's own price for each SKU.
- `gcs_read_text` and `gcs_read_object` (`read_text`, `read_object`): a Cloud Storage object's content as text (decoded with its charset; binary refused) or as base64. At most `max_bytes` (default 8 MiB, at most 64 MiB) and at most what fits the result limit (`GSM_MAX_RESULT_CHARS`); `next_offset` continues. The content is read at the generation the metadata names.
- `gcs_write_text` (write; `write_text`): text or a local file to an object in one upload (`uploadType=media`). It sends `ifGenerationMatch=0` unless `overwrite` is true, so an existing object is reported and left as it is. The approval shows the destination, the size, the content type and the overwrite choice. `local_path` goes through the same guard as Gmail attachments and Drive uploads.
- The `google` toolset of gcloud: 59 tools for the tools of Google's Resource Manager, API Keys, BigQuery, Cloud Billing, IAM, Logging, Monitoring and Cloud Storage MCP servers. Google's `run_gcloud_command` and `run_bq_command` are not copied (a shell command would bypass the approval of each change). A `readonly` login with it asks for `cloud-platform.read-only` and `cloud-billing.readonly`, a `readwrite` login for `cloud-platform` and `bigquery`.

### Changed
- `config/products.json`: a toolset's `source` may be a list of pages (gcloud is made of several of Google's servers). `scripts/gen-servers.mjs` checks it.

### Not changed
- Scopes of the `all` toolset (gcloud's resolve the same; its login requirements grow by the ten tools), the write gate and the hook. Every other plugin lists the same tools with the same schemas.
- Not tested against live Google Cloud APIs (Google's HTTP layer stubbed; the request shapes are checked against Google's Discovery documents).

## 1.9.0 - 2026-10-30

### New: Drive and Sheets tools that match Google's Drive, Docs, Sheets and Slides MCP servers
Each description names the Google tool it matches.
- `drive_list_recent` (read; `list_recent_files`): newest files first, by `recency` (default), `lastModified`, `lastModifiedByMe` or `viewedByMe`; 10 a page by default; folders and trashed files left out. The scopes of `drive_search`.
- `drive_download` (read; `download_file_content`): a file's bytes as base64. Google Docs, Sheets, Slides and Drawings are exported to `export_mime_type` (default text/plain, text/csv for Sheets, image/png for Drawings). The base64 text must fit the result limit (`GSM_MAX_RESULT_CHARS`); a larger file returns its size and a note, and is not downloaded at all when Drive reports its size.
- `drive_create_file` (write; `create_file`): a blank Google Doc, Sheet, Slides or folder (`google_type`), or a file from `text_content`, `base64_content` or `local_path`, uploaded in one multipart request to Drive's upload endpoint. With `google_type` and content, Drive converts the content to that Google type; without it the file keeps its type (Google's server converts by default). `local_path` must be a full path to a file outside the token folder, gcloud's folder and the key files named in the environment, the same rule as Gmail attachments (now shared in `src/servers/local-files.ts`).
- `sheets_get_values` (read; `get_values`), `sheets_write_values` (write; `update_values` and `update_formulas`) and `sheets_insert_rows` (write; `insert_dimension`). `sheets_write_values` needs `value_input`: `data` sends `valueInputOption=RAW` (values stored as given), `formulas` sends `USER_ENTERED` (parsed as if typed). Kinds as `classifyMethod` classifies `values.update` and `batchUpdate`.

### Changed
- `drive_read_text` (`read_file_content`) reads Word, Excel and PowerPoint (docx, xlsx, pptx) and OpenDocument (odt, ods, odp) files up to 20 MB. Drive exports only Google files, and a conversion would create a new file, so the file is downloaded and its text taken here (`src/servers/office-text.ts`, node:zlib only; each part inflates to at most 64 MB). Old binary formats (doc, xls, ppt), PDF and images are not read; the error points to `drive_download`. `include_comments` adds the comment threads (at most 1,000). A call without the new options sends the same requests and gets the same fields as before.
- `drive_get_file` (`get_file_metadata`) also returns `description`, `file_extension`, `viewed_by_me_time`, `shared_with_me_time` and `can_add_children`. Drive's API has no content snippet.
- The description of `drive_search` names `search_files` and says it takes Drive's own query syntax.
- The `google` toolset of gdrive: 19 tools covering Google's 20 (Drive 8, Docs 2, Sheets 6, Slides 4), the new curated tools plus the generated `drive_permissions_list`, `drive_files_copy`, `docs_documents_get`, `docs_documents_batch_update`, `sheets_spreadsheets_get`, `sheets_spreadsheets_batch_update` and the four Slides tools. A `readonly` login asks for `drive.readonly`, a `readwrite` login for `drive`.

### Not changed
- Gmail: the attachment guard moved to `src/servers/local-files.ts` with the same messages; gmail lists the same tools with the same schemas.
- Scopes of the `all` toolset, the write gate and the hook. Every other plugin lists the same tools with the same schemas.
- Not tested against a live Google Drive (Google's HTTP layer stubbed).

## 1.8.0 - 2026-10-30

### New: Calendar tools that match Google's Calendar MCP server
Each description names the Google tool it matches.
- `calendar_suggest_time` (read; `suggest_time`): free meeting times for the people named (`attendees`, emails or calendar ids, at most 50 calendars; your primary calendar is counted unless `include_primary` is false). One free/busy request (`freebusy.query`), then the free periods long enough for `duration_minutes` (default 30), with one suggested time per free period, starting on a quarter hour (`max_suggestions`, default 5). `working_hours` (`HH:MM` to `HH:MM`) and `weekdays_only` limit the search, in `time_zone` (default: the offset of `start_time`). A calendar Google cannot show is listed under `unavailable`, and its busy time is not counted. A read, with the scopes of `calendar_freebusy`.
- `calendar_respond` (write; `respond_to_event`): accepted, declined or tentative, with an optional `comment`. It reads the event to find your guest entry, then sends only that entry with `attendeesOmitted`, so the other guests are not sent back. Not a guest of the event: an error, nothing is changed.

### Changed
- `calendar_create_event` takes `add_meet` (a Google Meet link: `conferenceData.createRequest` with `hangoutsMeet` and a new request id, `conferenceDataVersion=1`), `recurrence` (RRULE, EXRULE, RDATE and EXDATE lines; a timed recurring event needs `time_zone`) and `reminders` (at most 5, in place of the calendar's defaults; an empty list turns them off).
- `calendar_update_event` takes `add_attendees` and `remove_attendees`: it reads the event and patches the merged list, so the other guests keep their entries and answers. `attendees` still replaces the whole list, with no read, as before; giving both is refused. `add_meet` adds a Meet link when the event has none. `recurrence` and `reminders` as for create.
- `calendar_list_events` takes `include_past` (no lower time bound when `time_min` is not given, as Google's `list_events` does; without it the list still starts now), `event_types` (each event then carries `event_type`), `time_zone` and `order_by` (`startTime` or `updated`).
- `calendar_get_event` also returns `event_type`, `meet_link`, `creator`, `visibility`, `availability`, `reminders`, `attachments` and `recurring_event_id`. The fields it returned before are unchanged.
- The descriptions of `calendar_list_calendars`, `calendar_list_events`, `calendar_get_event`, `calendar_create_event`, `calendar_update_event` and `calendar_delete_event` name the Google tool they match.
- The `google` toolset of gcalendar: `calendar_list_calendars`, `calendar_list_events`, `calendar_get_event`, `calendar_suggest_time`, `calendar_create_event`, `calendar_update_event`, `calendar_delete_event`, `calendar_respond`. They cover Google's 9 tools; `search_events` (a semantic search with no public API) maps to the keyword search of `calendar_list_events`. A `readonly` login asks for `calendar.readonly`, a `readwrite` login for `calendar`.

### Not changed
- A call without the new options sends the same request and gets the same answer as in 1.7.0 (`calendar_get_event` and the descriptions aside).
- Scopes of the `all` toolset, the write gate and the hook. Every other plugin lists the same tools with the same schemas.
- Not tested against a live Google Calendar (Google's HTTP layer stubbed).

## 1.7.0 - 2026-10-30

### New: Gmail tools that match Google's Gmail MCP server
Each description names the Google tool it matches.
- `gmail_search_threads` (read; `search_threads`): Gmail search syntax, thread-level results. View `detailed` (default) summarises each message of each thread (from, to, cc, date, subject, snippet, labels); `concise` gives one line per thread. 20 threads a page by default, at most 50. `include_trash` also searches Trash and Spam (Gmail's `includeSpamTrash`).
- `gmail_get_thread` (read; `get_thread`): every message of a thread, decoded as `gmail_get_message` does (charsets, blank lines, large parts, attachment ids). `concise` gives headers and snippets only. Each body is capped at 4,000 characters by default (`max_body_chars`).
- `gmail_label` and `gmail_unlabel` (write; `label_thread`, `label_message`, `unlabel_thread`, `unlabel_message`): a thread or a message, labels by id or by name (names are looked up in the label list, in any case). Adding TRASH or SPAM, and removing TRASH, is refused with the tool to use; nothing is changed then. Both are writes, as `classifyMethod` classifies `modify`.
- `gmail_trash` (destructive, as `classifyMethod` classifies `trash`) and `gmail_untrash` (write): a thread or a message. Before the approval, `gmail_trash` reads what it moves, and the approval shows the subject, the senders and the number of messages.

### Changed
- `gmail_list_labels` takes `user_only` (only the labels the user made) and `page_size` / `page_token` (Gmail returns every label at once; this server pages them). Without `page_size` and `page_token` the answer is the plain list, as before. Its description lists the system label ids.
- `gmail_list_drafts` takes `query` (Gmail search syntax, sent as `q`).
- The `google` toolset of gmail uses the new tools: `gmail_search_threads`, `gmail_get_thread`, `gmail_label`, `gmail_unlabel`, `gmail_trash`, `gmail_untrash` and `gmail_get_attachment` replace `gmail_users_threads_list`, `gmail_users_threads_get`, `gmail_users_threads_modify` and `gmail_users_messages_modify`. It still asks for `gmail.readonly` (`readonly`) or `gmail.modify` (`readwrite`) only.

### Not changed
- The generated per-method tools are all still there in the `all` toolset, with the same kinds.
- Scopes, the write gate and the hook. Every other plugin lists the same tools with the same schemas.
- Not tested against a live Gmail account (Google's HTTP layer stubbed).

## 1.6.0 - 2026-10-29

### New: send and reply in Gmail
- `gmail_send` sends a new message: `to`, `cc`, `bcc`, `subject`, `body_text` and/or `body_html`, and `attachments` (full paths of local files).
- `gmail_reply` answers one message in its thread: to its sender (its Reply-To when set), or with `reply_all` also to its To and Cc, never to the signed-in account. The subject gets one "Re: ". `threadId`, `In-Reply-To` and `References` are set, so Gmail and other mail programs keep the thread. `quote_original` quotes the original under the reply.
- Both are destructive, like `gmail_send_draft`: they ask twice. The second prompt shows the exact message, worked out before it asks: recipients, subject, the thread a reply joins, attachment names and sizes, the size of the message and the start of the text. The message sent is the one the prompt described. A declined prompt sends nothing. `confirmation: destructive-only` still asks before them.
- Messages are built as RFC 5322 MIME: UTF-8, RFC 2047 headers (long ones folded), multipart/alternative for text with HTML, multipart/mixed with base64 attachments in 76-character lines. Date, From and Message-ID are left to Gmail. Up to 5 MB a message goes in the `raw` field; above that, through Gmail's upload endpoint (`uploadType=multipart`). Over Gmail's 35 MB limit it is refused before any file is read.
- An attachment must be a full path to a file. A file in the token folder, in gcloud's folder, or a key file named by `GOOGLE_APPLICATION_CREDENTIALS` or `GSM_SERVICE_ACCOUNT_KEY_FILE` is refused, so a mail cannot carry a sign-in secret out.
- `gmail_get_attachment` (read) downloads one attachment as base64, when it fits the server's result limit (`GSM_MAX_RESULT_CHARS`); a larger file returns its size and a note that says how far to raise the limit.

### Changed: drafts and reading
- `gmail_create_draft` takes `body_html`, `attachments`, `reply_to_message_id` (a reply draft in the thread; `to` then defaults to who a reply goes to and `subject` to "Re: " plus the original) and `quote_original`. `to`, `subject` and `body` are optional in the schema now; a draft without `reply_to_message_id` still needs `to` and `subject`. A 1.5.0 call sends the same bytes as before, except that header lines over 78 characters are now folded (the same value once unfolded).
- `gmail_get_message` returns the `snippet`, decodes each text part with its own charset (UTF-8, ISO-8859-1 and -2, windows-1250 and -1252, US-ASCII and the other WHATWG encodings; an unknown charset is read as UTF-8 and `charset_note` says so), fetches a large body Gmail keeps apart (only an attachment id), and removes blank lines at the start and end of the body (at most one blank line in a row). `include_html` adds the HTML body. Each attachment has its `attachment_id` and `part_id`.
- A long subject that is not ASCII is split into encoded words of at most 39 bytes, and folded, so every header line stays within 78 characters.

### Not changed
- Scopes: no new scope. Send and reply ride on `gmail.modify` (`readwrite`), `gmail.compose` or `https://mail.google.com/`; `gmail_get_attachment` on `gmail.readonly`.
- Tool kinds, the write gate and the hook. Every other plugin lists the same tools with the same schemas.
- The `google` toolset: Google's Gmail MCP server has no send tool, so `gmail_send` and `gmail_reply` are in `all` and `curated` only.
- Not tested against a live Gmail account. Sending mail is an outward action; it was tested with Google's HTTP layer stubbed.

## 1.5.0 - 2026-10-29

### New: the toolset in every agent
- `gsm install --toolset all|google|curated`. For Codex, OpenCode and Antigravity it writes `GSM_TOOLSET` into each server's environment. For Claude Code it sets the plugin option `toolset` (`claude plugin install --config toolset=<value>`). Only when given: without the flag the config files are byte-for-byte what 1.4.0 writes.
- The guided install asks which tools each server lists (default: every tool, which adds no flag).
- `gsm status` (the security line) names the toolset when `GSM_TOOLSET` is set, and says when the value is unknown.
- `gsm install --agent agy` warns for each product that can list more than 100 tools under the chosen toolset, with the counts of the other toolsets. Antigravity is reported to refuse a server with more tools ("enabled tools would exceed max limit of 100"). gsm did not confirm the limit: `agy mcp list` reads its config without starting the servers. It is a warning only; nothing is refused, and the default stays `all`.
- `docs/CAPABILITIES.md` has a Toolsets column (all / google / curated tool counts), and each product's page lists its toolsets; Gmail's page lists the `google` tools with the Google tool each one matches.

## 1.4.0 - 2026-10-29

### New: login scopes follow the toolset
- A login counts only the tools of the toolset: Gmail with `google` asks for `gmail.readonly` (`readonly`) or `gmail.modify` (`readwrite`), where `all` asks for `gmail.readonly`, or `gmail.modify` and `gmail.settings.basic`.
- Gateway methods count only when the toolset holds `api_call`. `curated` does; Gmail's `google` list does not, so its login asks for no Postmaster scope even with `--with postmaster`.
- `--toolset all|google|curated` for `gsm login`, `gsm scopes` and `gsm setup-admin`. Without it, `GSM_TOOLSET` applies, else `all`. An unknown value is a usage error. `gsm scopes --json` adds `"toolset"` when it is not `all`.
- The sign-in from the chat (`auth_login`, `auth_setup_admin`) passes the server's toolset to the login (`--toolset`), and an ADC sign-in asks for the scopes of the toolset's tools.
- A product without the toolset counts every tool, and the login says so.

### Not changed
- With no toolset, or `all`, every server's requirement list and the scopes of every profile are the same as 1.2.0.
- A login that names its account (`--account`, or `account` in the chat) keeps the scopes that account holds for the other products of the group. A toolset never drops them.

## 1.3.0 - 2026-10-29

### New: the `toolset` option
- Every plugin has a new option, **Toolset** (`toolset`, environment variable `GSM_TOOLSET`): `all` (the default), `google` or `curated`. It decides which tools a server lists.
- `all` lists every tool, as before. With the option unset or `all`, every server lists the same tools with the same schemas as 1.2.0.
- `google` lists the tools that match Google's official MCP server for the product. Gmail is the only product with this list so far: `gmail_search`, `gmail_users_threads_list`, `gmail_users_threads_get`, `gmail_get_message`, `gmail_list_drafts`, `gmail_create_draft`, `gmail_send_draft`, `gmail_list_labels`, `gmail_users_labels_create`, `gmail_users_threads_modify` and `gmail_users_messages_modify`. `config/products.json` names the official tool each one matches. Other products list all their tools, and `health` and `auth_status` say "toolset google is not defined for this product yet; showing all tools".
- `curated` lists the hand-written tools and the gateway tools (`api_search`, `api_describe`, `api_call`). A product with neither lists all its tools, and says so.
- The sign-in tools, the account tools and `health` are listed in every toolset.
- `health` reports the toolset and how many tools are outside it, when a toolset other than `all` is set.
- An unknown value means `all`, with one line on stderr.

### Not changed
- The hook's tool map (`tool-map.json`) still lists every tool, so a tool outside the toolset is still classified. Tool kinds, the write gate and the scope check are the same.
- What a login asks Google for. Login scopes do not follow the toolset yet.
- Codex, OpenCode and Antigravity: set `GSM_TOOLSET` in the server environment by hand for now. `gsm install` does not write it yet.

## 1.2.0 - 2026-10-29

### Changed: what a Gmail login asks Google for
- `readonly` asks for `gmail.readonly` only (before: also `postmaster.readonly` and `postmaster.traffic.readonly`).
- `readwrite` asks for `gmail.modify` and `gmail.settings.basic` (before: `https://mail.google.com/`, `gmail.settings.basic`, `gmail.settings.sharing`, `postmaster` and `postmaster.readonly`). `gmail.modify` covers search, read, send, drafts, labels and trash; `gmail.settings.basic` keeps the filter, vacation, IMAP and POP tools.
- Only `full` asks for `https://mail.google.com/`. Permanent delete (`gmail_users_messages_delete`, `gmail_users_messages_batch_delete`, `gmail_users_threads_delete`) needs it, so these three tools need `--profile full` now.
- No profile asks for `gmail.settings.sharing`. Google allows its methods (delegates, forwarding addresses, send-as create and delete, send-as verify, auto-forwarding) only for a service account with domain-wide delegation. An exact `--scopes` list can still ask for it.
- Gmail Postmaster Tools is left out of every Gmail login unless you add it: `--with postmaster` for `gsm login`, `"with": ["postmaster"]` for the chat tool `auth_login`.
- Every other product asks for the same scopes as before.

### New
- `scopePolicy` in `config/products.json`: per product, the profiles that may request a scope (`onlyIn`) and the optional parts left out unless named (`optional`). Gmail is the only product with one.
- `--with <part,...>` for `gsm login` and `gsm scopes`. An unknown part is a usage error that lists the parts.
- `gsm login` and `gsm scopes` print a `Held back:` line for each group of tools a product's rules leave out of the profile, with what they need. The chat sign-in repeats these lines.
- The chat tool `auth_login` accepts `profile: "full"`. On the gmail server it takes `with`.

### Not changed
- Tool kinds, the write gate and the scope check at startup. A token that already holds `https://mail.google.com/` or the Postmaster scopes keeps those tools, and a login that names its account with `--account` keeps those scopes (merge). `--replace` drops them.

## 1.1.4 - 2026-10-29

### Fixes: signing out one group no longer signs the account out of the others
- Google's revocation removes every grant an account gave the OAuth client's project, for all its clients. Every login group uses the same client, so `gsm logout` and the chat tool `account_remove` ended the account's login in every group, not just the one being signed out.
- Now, when the same account is signed in here for another group, they remove only the local token, do not revoke, and say why. The check reads `accounts.json` and file names only, never a token. A group whose account was not recorded, or that still has a token file from before accounts existed, counts as possibly the same account.
- New `gsm logout --revoke-all`: revoke anyway, and list the other groups whose login stops working (their local tokens are kept). It cannot be combined with `--local-only`.
- An account that no other group uses is revoked as before. `--local-only` is unchanged.
- The `account_remove` description no longer says "The other accounts stay signed in"; it says when the revoke runs and when it does not.

## 1.1.3 - 2026-10-29

### Fixes: when Google refuses a login
- A login that Google refuses for reauthentication (`invalid_grant` with `invalid_rapt` or `rapt_required`) now says: "Your Google Workspace requires signing in to Google Cloud again (an admin session policy; Google's default is 16 hours). Call auth_login to sign in again." This is Workspace's Google Cloud session control, which ends logins with Cloud scopes after a set time.
- Any other refusal shows Google's `error` and `error_subtype` (short codes, never a token). The 7-day Testing limit is named as one possibility, not as the cause. The messages name `auth_login` first and the terminal command second. This applies to tool errors, `gsm status --check`, `gsm doctor` and `health` with `live: true`, for OAuth and ADC logins.

### Fixes: a new sign-in is used at once
- After a sign-in in the chat, the server forgets its OAuth clients and what it read from the OS secret store, so the new login is used without a restart. A client is also rebuilt when its token file holds another refresh token (a sign-in in a terminal). Only a hash of the refresh token is kept.
- `auth_status` reads the tokens again, and says how many tools are registered in total as well as how many it loaded now.
- With the OS secret store (`gsm protect`), a token that is not found is no longer remembered as missing, so a token stored by the sign-in process is seen.

### Fixes: token files
- With plain files (the default), a secret file is written to a temporary file and then renamed over the old one, so a reader never sees half a file. If the rename fails, the file is written directly, as before.
- A token refresh no longer creates the token file again after a sign-out, and no longer overwrites a newer sign-in's token with an older client's answer.

### Health
- `health` with `live: true` adds `accessTokenExpiresInSeconds` and a note: the value is the current access token's remaining life (at most about an hour, renewed on its own), not how long the login lasts. `expiresInSeconds` is kept. `gsm status --check` says the same next to "access token expires in".

## 1.1.2 - 2026-10-29

### Fixes: what a sign-in asks Google for
- The sign-in no longer sends `include_granted_scopes`. With it, Google returned every scope the account had granted the project, and the token was saved with all of them, so a Gmail token could carry Cloud and Search Console scopes. Google says incremental authorization is not supported for installed apps.
- The merge no longer takes the default account's stored scopes for whichever account signs in. It reads the stored scopes of the account you name, and keeps only the scopes a server of the group uses. A scope that came from another group's sign-in is listed as "Not requested again".
- New `--account <email>` for `gsm login`, and `account` for the chat tool `auth_login`. Google preselects that account (login hint), and its stored scopes are merged. Without an account, nothing is merged, and the output says so.
- A save never takes scopes away from an account that is already signed in, unless that account was named (and you unticked scopes on Google's consent screen) or you pass `--replace`. When you name one account and pick another in the browser, or name none and pick one that holds more scopes, the login saves nothing, leaves the token as it was, and prints the command (and the chat call) to try again. `auth_status` repeats that message.
- The "This token runs ..." line counts the scopes Google granted. Before the browser step, the login says what the token would run if every scope asked for is granted.

### Notes
- Each plugin's `servers.json` now lists every scope its login group uses (`groupScopes`), because a plugin knows only its own server.
- Existing tokens keep their scopes until the next sign-in. To clean a token that holds scopes from another group, sign in again naming the account; `cloud-platform` is also a workspace-user scope (the gcontacts plugin's `health_*` tools use it), so drop it with `--replace`.

## 1.1.1 - 2026-10-29

### Fixes
- `ads_search` (gads) no longer sends `pageSize`. Google's v26 reference says the API answers `PAGE_SIZE_NOT_SUPPORTED` when the field is set, and the tool always set it, so its calls would fail (found in the reference, not reproduced against a live account). Google sets the page size itself. The `page_size` input is removed; a caller that still passes it gets the same request, because unknown inputs are dropped. The tool still returns one page, at most 500 rows.

## 1.1.0 - 2026-10-18

### Project readiness (gcloud server)
- `project_readiness` (read): checks a Google Cloud project against what each login group needs. It lists the APIs that are enabled and the ones that are missing, shows whether each group is signed in here, and lists the console steps that have no API: the consent screen, publishing, the Desktop client, test users, and Basic API Access. Pass `groups` to check some groups only.
- `project_enable_missing` (write, asks for approval): enables the missing APIs for the chosen groups, in batches of at most 20 services. It runs in the background, so run `project_readiness` again to confirm.
- The service lists are checked by tests against `config/products.json`, so they follow the product map.

### Notes
- Google offers no API we can use for the consent screen, publishing, test users or the Desktop OAuth client. The checklist links to the console pages for them.
- The old IAP OAuth brand and client API is shut down, so it is not used.

## 1.0.1 - 2026-10-17

### Fixes
- The live checks read the granted scopes and the time left from Google's token info in the shape google-auth-library returns (`scopes` as a list, `expiry_date` in milliseconds). Before, the granted scopes were read as empty, so a valid login could show its stored scopes as no longer granted. This affected every OAuth login and the ADC login, in `status --check`, `doctor`, and the health tool with `live: true`.

## 1.0.0 - 2026-10-17

This is a major version: two products change how they sign in, so people must act once.

### Action needed
- **gplay and gmerchant use a service account key now.** Their OAuth logins are not used any more. To set up: add the service account's email in Play Console (Users and permissions) and as an Admin user of Merchant Center, then run `node gsm.mjs setup-service-account --key-file <service account JSON>`, or call `auth_setup_service_account` in the chat. `gsm login gplay` or `gsm login gmerchant` explains the steps.
- **gmaps uses an API key now.** Save a key restricted to the Maps APIs with `node gsm.mjs setup-apikey` (or GSM_API_KEY). The OAuth login for gmaps is not used any more. The key is shared with gsearch.

### Secret storage (opt-in)
- `node gsm.mjs protect` moves the saved secrets (OAuth tokens, the client secret and its backups, the API key, the Ads developer token) into the operating system's store. Windows uses DPAPI, which encrypts for your user on this machine. `node gsm.mjs protect --off` moves them back to plain files.
- Every value is read back from the store before its plain copy is removed. If one value fails, nothing is changed.
- The store choice is kept in `store.json`. The names of the stored secrets are kept in `secrets.json`, with no content. `GSM_TOKEN_STORE` overrides the choice.
- macOS (Keychain) and Linux (libsecret) are implemented. They are not run in this release: only Windows (DPAPI) was tested.
- The default is still plain files with mode 0600, so nothing changes until you run `protect`.

### Service accounts
- New login group `service-account` for gplay and gmerchant (scope https://www.googleapis.com/auth/androidpublisher and https://www.googleapis.com/auth/content). The key is referenced by path, never copied, and never printed.
- `status --check` and `health --check` ask Google whether the key is accepted. They do not check Play or Merchant access, which Play Console and Merchant Center decide.
- `setup-service-account --remove` forgets the setup. The key file is not deleted.
- If GOOGLE_APPLICATION_CREDENTIALS points to a service account key, the group uses it, without a setup step.

### Changes
- `doctor` checks the service account, the secret store and that every stored name is present in the store.
- `status` reports the secret store and the service account.
- Setup prompts and install steps only ask for the admin setup when it is missing.

## 0.6.0 - 2026-10-17

### Application Default Credentials as a sign-in option
- Every Google server offers ADC next to the saved OAuth client. `auth_login` lists both ways first, with their pros and cons, and runs the one you choose (`method: "oauth"` or `"adc"`).
- ADC uses the gcloud CLI. For the cloud servers it uses gcloud's built-in client, so no client file is needed. For other APIs it uses your saved OAuth client through gcloud, with the group's scopes.
- A group with no account of its own uses the ADC login. A group with accounts uses those accounts. ADC holds one login per machine. The suite records which group and scopes that login holds, as a hash of its token, never the token.
- `health`, `auth_status`, `status` and the live check count an ADC login as a login. When the login has no quota project, `health` says so and gives the command that sets one.
- `logout` says when a group is on ADC. It does not remove that login. The message names `gcloud auth application-default revoke`.
- Cloud tools and generated tools share one login path. A new login is used without a restart.

### Fixes
- `health` reported "not logged in" for cloud while its calls worked through ADC.

### Notes
- ADC for the Workspace groups needs your own OAuth client. gcloud's built-in client cannot grant those scopes.
- The gcloud CLI must be installed for the ADC route. The suite does not install it.

## 0.5.0 - 2026-10-17

### Several accounts per Google group
- Each Google group can have several accounts, for example two Gmail accounts or two Drive accounts. Signing in again adds the account it signs in with. Google's account chooser opens, so you pick the one to add.
- New agent tools: `accounts_list` (the signed-in accounts and the default), `account_set_default` (makes one account the default), and `account_remove` (revokes one account and removes its token from this machine).
- Every Google tool takes an optional `account` argument, the account's email address. Without it, the default account is used. The argument never reaches Google.
- A token file from before this release is the default account of its group. Nothing has to be signed in again.
- New commands: `gsm accounts` lists the accounts of each group, `gsm accounts default <group> <email>` sets the default, and `gsm logout <group> --account <email>` removes one account. `status` and `status --check` list every account.

### Notes
- The scopes of an account are checked when the tools load, for the default account. A call for another account that lacks a scope gets Google's scope error.

## 0.4.0 - 2026-10-16

### Sign-in from the chat
- Google servers sign in from Claude Code. `auth_setup_client` saves the Desktop OAuth client from a file path, `auth_login` returns the Google address to approve, and `auth_status` loads the tools once the sign-in finishes. No terminal is needed.
- The sign-in runs the same `gsm login` as the terminal, so the scopes, PKCE, the recorded account and the token file are the same.
- `auth_setup_admin` sets up the admin server's service account from a key file path.
- The health report names the next tool to call for a server that is not signed in (`auth_setup_client`, then `auth_login`).
- The sign-in and setup tools are writes in the plugin map, so the hook asks before each call. API keys are never sent through the chat.

## 0.3.0 - 2026-10-16

### Health and identity
- Every server has a read-only `health` tool. It reports the server version, the login kind and whether it is logged in, the account the login belongs to, how many tools are registered and hidden, and whether writes are allowed. It works before a login. `live: true` also asks Google whether the login still works.
- New command `gsm health`: one row per server, with its login, account and tool count. `--check` asks Google once per group, `--plugin <id>` narrows it to one server, and `--json` prints the rows. It exits 1 when a plugin folder is missing or a check fails.
- Logins request the email scope (`userinfo.email`), which grants no tool access, and record the account they belong to. `status` shows it offline, and `status --check` shows it live.

### Credentials
- `status --check` asks Google whether each login is valid, expired or revoked, which scopes it grants, and whether the API key is restricted. It exits 1 when a check needs attention. Plain `status` still makes no network call.
- `logout` revokes the login at Google before it removes the token file. `logout --local-only` removes the file only.
- Logins use PKCE (S256).
- An expired or revoked login gives one message, with the command that logs in again.
- The saved API key records when it was saved. `status` shows its age and warns after 90 days.
- On Windows the token folder's access list is limited to your user, SYSTEM and Administrators. `doctor` checks it.

### Tools
- Before a login, the OAuth servers list only the tools that need no scope, plus `auth_status`. After a login, `auth_status` loads the rest, without a restart.
- `cloud_apikey_reveal` (gcloud) returns a secret, so it is a write now. The billing account move (`cloudbilling.organizations.billingAccounts.move`) changes state, so it is a write too. Both stay hidden unless writes are allowed.
- Login hints print the command you ran, not a generic `gsm login`.

### Consent change
- A login now asks for one more permission: the email scope. Logins made before this release do not have it, and their account shows as not recorded until you log in again.

### Note
- 0.2.0 was never released. Its changes are part of this release.

## 0.1.4 - 2026-10-16

- The package is `google-services-mcps`. The installer is the package itself, and the wrapper package is gone.
- The scoped name `@firedmosquito831/google-services-mcps` is deprecated. Its versions still install.
- The docs and the printed commands use `npx google-services-mcps`.
- One npm workflow publishes the package, from a GitHub release. `scripts/bump.mjs` moves the version in one step.

## 0.1.3 - 2026-10-16

- Interactive menu: run `npx google-services-mcps` with no arguments in a terminal.
- `--install-missing` installs what gsm can install: Claude Code, Codex and OpenCode through npm, and git through winget or Homebrew.
- Claude Code: the marketplace is declared in the same scope as the plugin, and `--allow-writes` and `--confirmation` are passed to the plugin as its options.
- Install guide and one-line installers.
