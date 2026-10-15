# Usage limits, quotas and costs: workspace, cloud, search and AI products

Scope: the products of the suite in groups cloud, workspace-user, workspace-admin, searchconsole, apikey and cloud (AI), as listed in `docs/SURFACES.md`: gcloud, gdrive, gmail, gcalendar, gchat, gmeet, gcontacts, gtasks, gclassroom, gapps, gadmin, gsc, gsearch, gai. The business and developer products (gads, gplay, gfirebase and others) are not covered here.

Date checked: 2026-10-16 (the date given in the brief).

## How this file was made

- Each figure was read from an official Google page with WebFetch (an automated fetch and summary) or from an official page found with WebSearch. No figure is from memory.
- No Google API was called with credentials. No git or npm command was run.
- Dynamic console pages (quota tables and price calculators) were not readable. Values that exist only there are marked UNVERIFIED.
- Quota values change often. Check the Quotas page in the Google Cloud console for your project before relying on any number.
- `UNVERIFIED` means the number or fact could not be confirmed from an official page. The reason follows the marker.
- `[S#]` points to the Sources section at the end.

## General: applies to the whole suite

- The MCP server is free (statement from the project brief, not a Google price).
- Every tool call uses Google quota. Most quotas are per Google Cloud project, and some are also per user. Usage in one project does not reduce another project's quota [S1]. Quotas in the Google Cloud console are the authoritative values for a given project.
- Claude side cost: each tool definition and each tool result costs model tokens. The suite cuts a tool result at 50,000 characters by default (`GSM_MAX_RESULT_CHARS`, `src/core/config.ts`; cut in `src/core/tools.ts`). Use filters and small page sizes. The 50,000-character cap is roughly 12,000 tokens at about 4 characters per token (an estimate, not measured).
- Claude Code's MCP tool search and the `/mcp` toggles reduce how many tool definitions load into context. Turn off the products you do not use (statement from the brief, no number).
- The suite retries rate-limit and unavailable responses up to 3 attempts in total, with backoff; after that the error reaches Claude. It repeats HTTP 429 and 503 for any method, and HTTP 403 with a rate-limit reason for reads only (`src/core/http.ts`, `isRetryable`). A quota error that is still failing reaches Claude as text (`HTTP <status>, reason=<reason>, <message>`, `src/core/tools.ts`, `describeError`). The gateway tool `api_call` returns the HTTP status and Google's response body (`src/core/gateway.ts`, `sendRequest`, around lines 757 to 765). Google's pages advise exponential backoff [S4][S6][S7].
- Billing: Workspace APIs run under a Workspace subscription. The Calendar, Gmail and Meet pages say that exceeding quota is planned to incur Google Cloud charges later in 2026, with no amount given [S6][S5][S23]. The Drive page sets a daily billing threshold of 400,000,000 quota units per project per day that cannot be increased [S4]. Check the billing account before you enable the API set.
- New projects: the Calendar and Gmail pages say that projects which used the API between November 2025 and April 2026 keep their old quotas, and projects created on or after 2026-05-01 get the new ones. The old values are not on the page [S5][S6]. Check the console for your project.
- Google Cloud Free Tier: a billing account is required to use it, and the monthly allowances do not roll over [S2].
- Access gates: sensitive and restricted OAuth scopes need Google's review before any Google Account can grant access. Apps with those scopes usually need verification unless an exception applies [S63]. The 100-user cap for unverified apps is UNVERIFIED (the page links to a support article and gives no number) [S63]. Restricted Gmail scopes (`mail.google.com`, `gmail.readonly`, `gmail.compose`, `gmail.insert`, `gmail.modify`, `gmail.metadata`, `gmail.settings.basic`, `gmail.settings.sharing`) need restricted-scope verification, and a security assessment if restricted data is stored or sent from a server [S64].
- Service account keys: the organization policy "Disable service account key creation" is enforced by default for organizations created on or after 2024-05-03. Google calls keys an exception and advises avoiding them [S59].
- Custom Search JSON API: closed to new customers. Existing customers must move to another solution by 2027-01-01 [S29].

---

## 1. gcloud (Google Cloud console APIs)

Covers Service Usage, Resource Manager, API keys, Billing, Monitoring, Logging, BigQuery, Cloud Storage, Compute Engine, Cloud Run, GKE, Firestore, Pub/Sub, Secret Manager, IAM, KMS, Cloud Asset and Cloud Quotas.

| Heading | Finding |
|---|---|
| 1. Cost | Free Tier (needs a billing account) [S2]: Cloud Storage 5 GB-months (US regions), 5,000 Class A and 50,000 Class B operations, 100 GB egress from North America; Compute Engine one e2-micro VM (us-west1, us-central1, us-east1), 30 GB-months standard disk, 1 GB egress; BigQuery 1 TiB queried and 10 GiB storage; Cloud Run 2 million requests, 360,000 GB-seconds, 180,000 vCPU-seconds; Pub/Sub 10 GiB; Firestore 1 GiB storage, 50,000 reads, 20,000 writes and 20,000 deletes per day; GKE one free Autopilot or zonal Standard cluster; Secret Manager 6 active versions and 10,000 access operations; Cloud Build 2,500 build-minutes (e2-standard-2); Cloud Logging and Monitoring 50 GiB logs per project; Cloud KMS 100 active key versions and 10,000 cryptographic operations (Autokey key versions only) [S2]. Pay-as-you-go prices: UNVERIFIED (the BigQuery, Cloud Storage, Cloud Run, GKE, Firestore and KMS pricing pages were not readable). Billing API, Cloud Asset and API key fees: no fee statement found, UNVERIFIED. API keys associate a request with a project for quota and billing [S3]. |
| 2. Default quotas | **BigQuery** [S44]: API per user 100 requests per second per method; 300 concurrent requests per user; tabledata.list 1,000 requests per second per project, up to 100,000 rows per call, 7.5 GB per minute (multi-region) or 3.7 GB per minute (elsewhere); on-demand 200 TiB queried per project per day; 1,000 queued interactive queries per project; dataset and table metadata updates 5 per 10 seconds; query response up to 10 GB compressed (unlimited when written to a table). Streaming inserts: 1 GB per second (US and EU) or 300 MB per second (elsewhere). **Cloud Storage** [S45]: about 1,000 writes per second and 5,000 reads per second per bucket at start, then scales; one write per second to the same object name; one metadata update per second per object; bucket create or delete about one per 2 seconds per project. **Compute Engine** [S58]: quotas are per region and global; no numeric defaults on the page; VM instance quota is set to 10 times the CPU quota; rate-limit values are on another page, UNVERIFIED. **Cloud Run** [S46]: admin API per project and region: 3,000 reads per 60 seconds, 180 writes per 60 seconds, 180 job runs per 60 seconds; max services 1,000 per project and region; request timeout 60 minutes; request size 32 MiB (HTTP/1); concurrency 1,000 per instance (Services scope) or 80 (Instances scope). **GKE** [S48]: 100 zonal clusters per zone; 100 regional clusters per region; API reads 600,000 per minute; API writes 600 per minute; token exchange 6,000 per minute per region; 512 pods per node (Standard). Nodes per cluster: the extracted table is ambiguous, UNVERIFIED. **Firestore** [S47]: export and import requests 20 per minute per project; document writes 20,000 per day (Standard) or 40,000 write units per day (Enterprise). Max write rate per document, the 500/50/5 rule, and batch size: UNVERIFIED (not on the page). **Pub/Sub** [S49]: publish throughput per region 4 GB per second (large), 800 MB per second (medium), 200 MB per second (small); 1,000 messages and 10 MB per publish request; 10,000 topics per project; 10,000 attached subscriptions per topic; admin API 6,000 requests per minute (100 operations per second) per project. **Secret Manager** [S50]: access 90,000 requests per minute per project; write 600 per minute per project. Secret count and version count limits and admin rate: UNVERIFIED. **Cloud KMS** [S51]: from 2026-02-16, token-based metrics: read 600 tokens per minute (soft; hard for external keys), write 100 per minute, software crypto 6,000,000 per minute, HSM 3,000,000 per minute, external KMS 10,000 per second (hard). Before 2026-02-16 the quotas were read 300/min, write 60/min, crypto 60,000/min. No quota on the number of keys or versions. **Cloud Logging** [S52]: entries.write 4.8 GB per minute per project in listed regions (for example us-central1, europe-west1), 300 MB per minute elsewhere; entries.list 60 per minute per project (cannot be raised). **Cloud Monitoring** [S53]: per-minute read and write limits not on the page, UNVERIFIED. **Resource Manager** [S54]: projects per user: no number on the page (increase on request); folders up to 10 levels deep; API per consumer project: 240 requests (v1 list, v3 search), 600 requests (other reads and writes), 6 requests (create or move folders). The time window is not stated in the extract, UNVERIFIED. **Billing API** [S55]: 300 calls per minute per project; organization level 975 per minute; Budget API 800 reads and 100 writes per minute, 50,000 budgets per billing account. **Cloud Asset Inventory** [S56]: per consumer project: SearchAllResources 400 per minute; SearchAllIamPolicies 400 per minute; ExportAssets 60 per minute and 6,000 per day; real-time feeds 600 per minute. Per organization: SearchAllResources 1,500 per minute; SearchAllIamPolicies 3,000 per minute; ExportAssets 75 per minute and 13,000 per day; QueryAssets 20 per minute (query statement) or 200 per minute (job reference); real-time feeds 30 per minute. **Service Usage, Cloud Quotas, IAM**: no official page was reached (404 or not fetched), UNVERIFIED. Quota increases are requested through the console [S1]. |
| 3. Expensive operations | BigQuery on-demand queries are billed by bytes scanned; the price is UNVERIFIED (pricing page not readable). Firestore reads, writes and deletes use the daily free allowance first, then paid usage (price UNVERIFIED) [S2][S47]. Cloud KMS HSM operations cost many tokens (a 4096-bit RSA sign on Cloud HSM costs 14,000 HSM tokens) [S51]. ExportAssets is the tightest Asset call: 60 per minute and 6,000 per day per project [S56]. Cloud Run job runs and writes share a 180-per-minute admin limit [S46]. Logging entries.list is capped at 60 per minute [S52]. |
| 4. Access approvals and restrictions | Quota increases can be denied; some increases for paid services require payment in advance [S1]. The Free Tier needs a billing account [S2]. Service account key creation is blocked by the organization policy "Disable service account key creation" (enforced by default for organizations created on or after 2024-05-03; projects can be exempted). The constraint's technical name is not confirmed on the page, UNVERIFIED [S59]. API keys: the console and gcloud require at least one API restriction when creating a key; keys created through REST are unrestricted unless you add a restriction; "Unrestricted API keys are insecure" [S3]. Binding a key to a service account is blocked by default organization policy [S3]. Google advises against API keys for production calls that create or manage Google Cloud resources [S3]. Number of projects per user: no number on the page [S54]. |
| 5. Size and count limits | Pub/Sub message data 10 MB; 100 attributes per message (key 256 bytes, value 1,024 bytes) [S49]. Cloud Storage maximum object size 5 TiB [S45]. Firestore document 1 MiB; API request 10 MiB; 500 field transforms per commit [S47]. BigQuery streaming: 10 MB per row and per HTTP request; 50,000 rows per request (500 recommended); insertId up to 128 characters [S44]. Logging: 256 KiB per entry; 10 MB per entries.write request [S52]. Secret Manager payload 64 KiB [S50]. Cloud Run: 1,000 services per project and region [S46]. GKE: 100 clusters per zone or per region [S48]. Folder depth 10 levels [S54]. Projects per user: no number [S54]. |
| 6. What happens at the limit | Generally the task fails until quota is available [S1]. Cloud Storage returns HTTP 429 with `rateLimitExceeded` [S45]. KMS returns HTTP 429 with `RESOURCE_EXHAUSTED`, and can return it below the per-minute figure because some limits are enforced per second [S51]. BigQuery streaming returns `quotaExceeded`; a too-large row or request returns `invalid`; the per-user throttle names no code [S44]. Cloud Monitoring returns `RESOURCE_EXHAUSTED` (HTTP 429) for query responses over 200 MB [S53]. For the others (Compute, Pub/Sub, Logging, Resource Manager, Secret Manager) no code is stated on the pages, UNVERIFIED. The suite passes the status and message through (see General). |
| 7. Cost-saving advice | Filter BigQuery queries and select only the columns you need, because on-demand cost follows bytes scanned [S44]. Do not run ExportAssets in loops: 6,000 per day per project [S56]. Keep Cloud Storage writes to one per second per object [S45]. Put up to 1,000 messages in one Pub/Sub publish call [S49]. Use a log filter and small pages for Logging reads (60 per minute) [S52]. Keep the Secret Manager access count low by caching a value in the calling process (access is free up to 10,000 operations a month on the Free Tier [S2]). Restrict every API key to the APIs it needs [S3]. |

---

## 2. gdrive (Drive, Docs, Sheets, Slides, Forms, Drive Labels, Drive Activity, Books)

| Heading | Finding |
|---|---|
| 1. Cost | Included with Google Workspace; the fetched pages state no per-call fee. Drive has a daily billing threshold of 400,000,000 quota units per project per day that cannot be raised [S4]. Whether and when charges start is not in the fetched text, UNVERIFIED. |
| 2. Default quotas | **Drive** [S4]: 1,000,000 quota units per minute per project; 325,000 quota units per minute per user per project; 1 TB per day of egress per project; uploads 750 GB per day per user (My Drive and shared drives, copies included); largest upload 5 TB; largest copy 750 GB. Conflict: an older copy of the same page in search results [S69] shows 12,000 queries per 60 seconds per project and per user. Check the console. **Docs** [S9]: per project 3,000 reads and 600 writes per minute; per user per project 300 reads and 60 writes per minute. **Sheets** [S8]: per project 300 reads and 300 writes per minute; per user per project 60 reads and 60 writes per minute. A batch request counts once. **Slides** [S10]: per project 3,000 reads, 300 thumbnail reads (getThumbnail) and 600 writes per minute; per user per project 600 reads, 60 thumbnail reads and 60 writes per minute. No daily limit while within per-minute quotas. **Forms** [S11]: per project 975 reads, 450 responses.list reads and 375 writes per minute; per user per project 390, 180 and 150 per minute. No daily limit. **Drive Labels**: localized copies of the page [S68] show 600 reads and 300 writes (the tables label them per second); a third-party listing gives 60 writes per minute. UNVERIFIED (English page not reached). **Drive Activity**: no official page found, UNVERIFIED. **Books**: no official page found; forum posts claim 1,000 requests per day, which are not official [S71], UNVERIFIED. |
| 3. Expensive operations | Drive's per-method unit costs (read 5, list 100, download 200, edit 50, other 5) came from one extraction of [S4] and were not confirmed on a second read: UNVERIFIED. Forms responses.list (450 per minute) and Slides thumbnail reads (300 per minute) are the costly reads in their APIs [S11][S10]. Sheets payloads: 2 MB is the recommended maximum for faster requests [S8]. |
| 4. Access approvals and restrictions | Drive, Docs, Sheets, Slides and Forms scopes: classification (sensitive or restricted) not checked, UNVERIFIED. Sensitive and restricted scope rules apply to any OAuth app that requests them [S63]. |
| 5. Size and count limits | Drive upload up to 5 TB; copy up to 750 GB; uploads and copies up to 750 GB per day per user [S4]. Export size: UNVERIFIED (not on the Drive page). Docs document size, Sheets cell count per spreadsheet, Slides presentation size, Forms question and response limits: not stated on the pages, UNVERIFIED [S8][S9][S10][S11]. |
| 6. What happens at the limit | Drive returns HTTP 403 "User rate limit exceeded" for a quota breach and HTTP 429 "Rate limit exceeded" for backend checks. Both: retry with exponential backoff, maximum about 32 to 64 seconds [S4]. Docs, Sheets, Slides and Forms return HTTP 429 "Too many requests" [S8][S9][S10][S11]. The suite passes the code through; it does not retry. |
| 7. Cost-saving advice | Use `fields` masks and small page sizes. In one extraction of [S4] (UNVERIFIED), a list call costs 100 units and a read costs 5. Batch Sheets calls, since a batch counts once [S8]. Do not fetch thumbnails in bulk: 300 per minute per project in Slides [S10]. Keep uploads under 750 GB per user per day [S4]. |

---

## 3. gmail (Gmail API and Gmail settings)

| Heading | Finding |
|---|---|
| 1. Cost | Included with Google Workspace. The Gmail API quota page sets a daily billing threshold of 80,000,000 quota units per project per day that cannot be raised; charges for exceeding quota are planned for later in 2026, with no amount [S5]. Consumer Gmail sending is free but capped at 500 messages per day [S62]. |
| 2. Default quotas | Per project: 1,200,000 quota units per minute. Per user per project: 6,000 quota units per minute [S5]. Per-method units [S5]: messages.list 5; messages.get 20; messages.send 100; drafts.send 100; drafts.create 10; drafts.update 15; batchModify 50; batchDelete 50; messages.delete 10; messages.modify 5; messages.import 25; messages.insert 25; messages.trash 20; messages.attachments.get 20; threads.get 40; threads.list 10; threads.modify 10; history.list 2; labels.list 1; getProfile 1; watch 100; stop 50. Gmail settings methods: units not in the fetched table, UNVERIFIED. Gmail Postmaster Tools: UNVERIFIED. |
| 3. Expensive operations | Send and draft send (100 units each), watch (100), batchDelete (50), batchModify (50), messages.import and insert (25 each) [S5]. Listing messages costs 5 units, but history.list costs 2 units [S5]. |
| 4. Access approvals and restrictions | Restricted Gmail scopes: `https://mail.google.com/`, `gmail.readonly`, `gmail.compose`, `gmail.insert`, `gmail.modify`, `gmail.metadata`, `gmail.settings.basic`, `gmail.settings.sharing`. These need restricted-scope OAuth verification, and a security assessment if restricted data is stored or sent by a server [S64]. Unverified app user cap: UNVERIFIED [S63]. Workspace admin controls on third-party apps: UNVERIFIED. |
| 5. Size and count limits | Workspace sending [S61]: 2,000 recipients per message (To, Cc and Bcc together), of which at most 500 external; 2,000 messages per day per user (mail merge 1,500; trial accounts 500); 3,000 external recipients per day; message size 25 MB (Business, Education, Enterprise Standard), 50 MB for Enterprise Plus in the web client only. Gmail API: 500 recipients per message [S61][S5]. SMTP for POP and IMAP: 100 recipients per message [S61]. Consumer sending [S62]: 500 recipients per message; 500 messages per day; attachment size not stated, UNVERIFIED. |
| 6. What happens at the limit | Gmail quota error codes are not stated in the fetched text, UNVERIFIED. Sending above the daily cap or recipient cap returns an error (text not confirmed on the pages fetched). The suite passes the response through. |
| 7. Cost-saving advice | Use history.list (2 units) to find changes rather than messages.list (5 units) [S5]. Do not loop over send (100 units each) or drafts.send (100 units each) [S5]. Use watch (100 units per call) only where push notifications are needed [S5]. |

---

## 4. gcalendar (Google Calendar API)

| Heading | Finding |
|---|---|
| 1. Cost | Included with Google Workspace. Exceeding quota is planned to incur Google Cloud charges later in 2026, with no amount [S6]. |
| 2. Default quotas | Per project: 10,000 requests per minute. Per user per project: 600 requests per minute. Per day per project: 1,000,000 requests, described as a billing threshold that cannot be increased [S6]. Projects created on or after 2026-05-01 use the new quotas [S6]. Service accounts that use domain-wide delegation are charged to the impersonated user's per-user quota; set `quotaUser` or the `x-goog-quota-user` header to attribute usage [S6]. |
| 3. Expensive operations | The quota page gives no per-method costs [S6]. Per-user limit (600 per minute) is the one most likely to be hit by a sync loop. |
| 4. Access approvals and restrictions | Reading calendar events and storing contacts are examples of sensitive scopes that need Google review before any account can grant access [S63]. Exact classification of each Calendar scope: UNVERIFIED. |
| 5. Size and count limits | Event, attendee and calendar count limits: not on the quota page, UNVERIFIED. |
| 6. What happens at the limit | HTTP 403 `usageLimits` or 429 `usageLimits`. Google advises truncated exponential backoff: wait min(2^n + random up to 1,000 ms, 32 or 64 s), and stop after a set number of retries [S6]. |
| 7. Cost-saving advice | Use push notifications rather than polling each calendar [S6]. Spread recurring jobs by plus or minus 25 percent and avoid a full sync at the same time every night [S6]. Set `quotaUser` for server-side calls made for end users [S6]. Do not raise the per-user quota above its default; Google advises against it [S6]. |

---

## 5. gchat (Google Chat API and Workspace Events)

| Heading | Finding |
|---|---|
| 1. Cost | Included with Google Workspace. No fee statement in the fetched Chat page, UNVERIFIED. Google says there is no daily limit while you stay within the per-minute quotas [S7]. |
| 2. Default quotas | Per project per minute [S7]: message writes 3,000; message reads 3,000; message search 300; membership writes 300; membership reads 3,000; space writes 60; space reads 3,000; space search (without admin rights) 300; attachment writes 600; attachment reads 3,000; reaction writes 600; reaction reads 3,000; custom emoji and section writes 600; reads 3,000; availability reads and writes 3,000. Per space per second [S7]: reads 15; writes 1 (includes message create, delete and patch); reaction creates 5; message creates during data import 10. Per user per second [S7]: custom emoji writes 1 and reads 15; section and availability writes 1 and reads 15. Workspace Events (subscriptions) [S16]: per project per minute writes 600 and reads 600; per user per minute writes 100 and reads 100; no daily limit; subscription count limits not on the page, UNVERIFIED. |
| 3. Expensive operations | Writes to one space: 1 per second per space, shared by all apps in that space [S7]. Space writes 60 per minute per project [S7]. Message search 300 per minute [S7]. |
| 4. Access approvals and restrictions | Sensitive or restricted scope list for Chat not checked, UNVERIFIED. |
| 5. Size and count limits | Message size, members per space, attachment size: not on the page, UNVERIFIED [S7]. Incoming webhooks have extra limits that the page does not list [S7]. |
| 6. What happens at the limit | HTTP 429 "Too many requests". Retry with exponential backoff; maximum wait 32 or 64 seconds [S7]. Heavy traffic to one space can hit internal limits that are not on the page [S7]. |
| 7. Cost-saving advice | Keep writes to a space to one per second [S7]. Message searches are capped at 300 per minute per project, so avoid them in loops [S7]. Workspace Events subscriptions are the push option; their limits are on [S16]. |

---

## 6. gmeet (Google Meet REST API)

| Heading | Finding |
|---|---|
| 1. Cost | Standard use is free. Exceeding quota is planned to incur Google Cloud charges later in 2026, with no amount [S23]. |
| 2. Default quotas | Per project per minute: reads 6,000; writes 1,000; spaces.create (reduced write bucket) 100 [S23]. Per user per project per minute: reads 600; writes 100; spaces.create 10 [S23]. No daily limit while within per-minute quotas [S23]. |
| 3. Expensive operations | spaces.create has its own small bucket (100 per minute per project, 10 per user per minute) [S23]. Recording and transcript limits: not on the page, UNVERIFIED. |
| 4. Access approvals and restrictions | Meet scope classification and any app review: UNVERIFIED. |
| 5. Size and count limits | Conference record, recording and participant limits: not on the page, UNVERIFIED. |
| 6. What happens at the limit | HTTP 429 "Too many requests". Retry with exponential backoff with jitter; maximum wait typically 32 or 64 seconds [S23]. |
| 7. Cost-saving advice | Create spaces only when needed; the create bucket is 10 per user per minute [S23]. Reuse a space rather than creating one per meeting. Avoid polling conference records in a loop. |

---

## 7. gcontacts (People API; the plugin also carries other contact and profile endpoints, not covered here)

| Heading | Finding |
|---|---|
| 1. Cost | Included with Google Workspace or free for consumer accounts: UNVERIFIED (no official People API page reached). |
| 2. Default quotas | People API per-minute and per-day limits: UNVERIFIED. Two searches and two URL guesses found no People API quota page. Check the People API quotas page in the console. |
| 3. Expensive operations | UNVERIFIED. |
| 4. Access approvals and restrictions | Storing new Google Contacts is an example of a sensitive scope that needs Google review [S63]. Contacts scope classification: UNVERIFIED. |
| 5. Size and count limits | UNVERIFIED. |
| 6. What happens at the limit | UNVERIFIED. |
| 7. Cost-saving advice | No figures are available for this API. Check the People API quota page in the console before any bulk sync. |

---

## 8. gtasks (Google Tasks and Google Keep)

| Heading | Finding |
|---|---|
| 1. Cost | Tasks: fee statement not found, UNVERIFIED. Keep: no official page found, UNVERIFIED. |
| 2. Default quotas | Tasks: courtesy limit of 50,000 queries per day; no per-minute figure stated; service accounts count as one account; increases are requested in the console and are not guaranteed [S14]. Keep: UNVERIFIED (no Keep API limits page found; search returned none). |
| 3. Expensive operations | Not stated on the Tasks page, UNVERIFIED. |
| 4. Access approvals and restrictions | Scope classification for Tasks and Keep: UNVERIFIED. |
| 5. Size and count limits | Task lists per account, tasks per list, note size for Keep: UNVERIFIED. |
| 6. What happens at the limit | Error codes not stated on the Tasks page, UNVERIFIED. |
| 7. Cost-saving advice | Stay under the 50,000 queries per day courtesy limit [S14]. Keep Keep API calls to a minimum until its limits are confirmed (UNVERIFIED). |

---

## 9. gclassroom (Google Classroom API)

| Heading | Finding |
|---|---|
| 1. Cost | Included with Google Workspace (Education editions): fee statement not fetched, UNVERIFIED. |
| 2. Default quotas | Per client (project) per minute: 3,000 queries (50 QPS). Per user per minute: 1,200 queries (20 QPS). Per client per day: 4,000,000 queries (average 46 QPS). Quota is a 60-second moving average, so short bursts are allowed. Permitted QPS may change [S13]. |
| 3. Expensive operations | Not stated, UNVERIFIED. |
| 4. Access approvals and restrictions | Education-edition eligibility and scope classification: UNVERIFIED. |
| 5. Size and count limits | Course, coursework and student limits: not on the page, UNVERIFIED [S13]. |
| 6. What happens at the limit | Requests over the limit return a retryable `RESOURCE_EXHAUSTED` error. The page recommends exponential backoff or push notifications instead of polling [S13]. |
| 7. Cost-saving advice | Use push notifications instead of polling [S13]. Keep each user under 1,200 queries per minute [S13]. |

---

## 10. gapps (Apps Script)

| Heading | Finding |
|---|---|
| 1. Cost | Fee statement not in the fetched text, UNVERIFIED. Quotas differ by account type (below). Trial accounts have additional limits, which rise after a paid subscription (domain has paid at least USD 100 and 60 days have passed) [S12]. |
| 2. Default quotas | Daily quotas are per user and reset 24 hours after the first request [S12]. Consumer (gmail.com) vs Workspace: email recipients per day (MailApp) 100 vs 1,500; recipients within domain 100 vs 2,000; trigger total runtime 90 vs 360 minutes (6 hours); URL Fetch calls 20,000 vs 100,000; Apps Script projects 50 vs 50; calendar events created 5,000 vs 10,000; contacts created 1,000 vs 2,000; documents created 250 vs 1,500; files converted 2,000 vs 4,000; email read and write (excluding send) 20,000 vs 50,000; groups read 2,000 vs 10,000; spreadsheets created 250 vs 3,200; presentations created 250 vs 1,500; properties read and write 50,000 vs 500,000; Maps static renders 1,000 vs 10,000; Maps directions, geocode and elevation 1,000 vs 10,000 each; Translate calls 5,000 vs 20,000 [S12]. Per execution [S12]: script runtime 6 minutes (both); custom function 30 seconds; Workspace add-on runtime 30 seconds; simultaneous executions 30 per user; URL Fetch response 50 MB per call; 100 headers per call; email body 200 KB (consumer) or 400 KB (Workspace); 20 triggers per user per script; 200 versions per script. Apps Script API execution limits: not listed, UNVERIFIED. |
| 3. Expensive operations | MailApp recipients; URL Fetch calls; spreadsheet and presentation creation; Translate calls [S12]. |
| 4. Access approvals and restrictions | The page states that all quotas and limits can change without notice [S12]. Apps Script add-ons and Marketplace review rules, and sensitive or restricted scopes for Gmail or Drive: UNVERIFIED for the Apps Script API itself; scope rules in [S63]. |
| 5. Size and count limits | Email body, URL Fetch response, triggers per script, versions per script: see row 2 [S12]. |
| 6. What happens at the limit | Quota error text and codes are not stated on the quota page, UNVERIFIED. |
| 7. Cost-saving advice | Keep each execution under 6 minutes [S12]. Keep total trigger runtime under 6 hours per day for Workspace, 90 minutes for consumer accounts [S12]. Schedule heavy work in short runs, since total trigger runtime is capped at 6 hours per day (Workspace) or 90 minutes (consumer) [S12]. |

---

## 11. gadmin (Workspace Admin: Directory, Reports, Licensing, Groups Settings, Alert Center, Data Transfer, Vault, Cloud Identity, Reseller, Chrome management)

| Heading | Finding |
|---|---|
| 1. Cost | Admin SDK APIs are included with Workspace: fee statement not fetched, UNVERIFIED. Data Transfer, Groups Settings and others have daily caps (row 2). |
| 2. Default quotas | **Directory** [S17]: 2,400 queries per minute per user per project (default, raised in the Admin SDK API Quotas page). Per project per minute: not stated. No daily limit stated. Per second: creating users 10 per domain; mobile devices 20 actions, 20 deletes, 10 gets and 10 lists; creating or updating org units 1 per customer. **Reports** [S18]: 2,400 queries per minute per user per project; `activities.list` filter queries 250 per minute (15,000 per hour). **Groups Settings** [S19]: 100,000 queries per day (raised in the console). **Licensing** [S20]: QPS quota of 1. **Alert Center** [S15]: 1,000 requests per second per project; 150 requests per second per user. **Data Transfer** [S21]: 10 QPS per developer project; 500,000 requests per day. **Vault** [S22]: organization-wide 600 matter reads per minute across all projects and users; per project per minute reads: exports, matters and saved queries 120; holds 228; long-running operations 300; writes: exports 20, holds 60, matter permissions 30, matters 60, saved queries 45; search counts 20 per minute; 20 exports in progress at once per organization. **Chrome Policy API** [S60] (not the same as the Chrome Management API): all resources 2,500 queries per minute per project and 10,000 per minute per organization; several resource groups 30 QPS per project or 15 QPS per project plus 30 per minute per customer; media 15 QPS per project and 60 per minute per project per user. **Chrome Management API**: UNVERIFIED (page not reached). **Cloud Identity**: UNVERIFIED (both URLs returned 404; search found no quota page). **Reseller**: numbers UNVERIFIED (only a Japanese-locale search summary [S70] was found, with no table). |
| 3. Expensive operations | Reports `activities.list` filter queries (250 per minute). Vault exports (20 writes per minute, 20 in progress per organization). Directory org-unit writes (1 per second per customer) and user creation (10 per second per domain) [S17][S18][S22]. |
| 4. Access approvals and restrictions | The admin group uses a service account with domain-wide delegation and an admin subject, set up with `node gsm.mjs setup-admin` [SURFACES.md]. Service account key creation is blocked by the default organization policy [S59]. Admin role requirements per API: UNVERIFIED. |
| 5. Size and count limits | Groups Settings: group name up to 60 characters; description up to 4,096 characters [S19]. Reports: maxResults default 1,000, range 0 to 1,000 per page [S18]. Licensing: maxResults up to 100 [S20]. Directory maxResults: UNVERIFIED. Vault: 20 exports in progress per organization [S22]. |
| 6. What happens at the limit | Directory: HTTP 403 `userRateLimitExceeded` for per-user limits; HTTP 403 `quotaExceeded` for too many concurrent requests; HTTP 429 `rateLimitExceeded` for the per-account limit, which cannot be raised. Google advises exponential backoff that stops after five tries (about 32 seconds in total) [S17]. Reports, Alert Center, Licensing and Data Transfer return HTTP 503 when a quota is exceeded and HTTP 403 for bad input [S15][S18][S20][S21]. Vault returns HTTP 429 [S22]. The suite passes these through. |
| 7. Cost-saving advice | Use `maxResults` and filters on every list call [S18][S20]. Spend the 250 Reports filter queries per minute carefully [S18]. Use Workspace Events push instead of polling [S16]. Spread admin scans over time and avoid loops over users; 2,400 per user per minute is per user, but the Directory per-account 429 cannot be raised [S17]. Keep Groups Settings under 100,000 per day [S19]. |

---

## 12. gsc (Search Console API, URL Inspection, Indexing API, Site Verification)

| Heading | Finding |
|---|---|
| 1. Cost | Search Console API: fee statement not fetched, UNVERIFIED. Indexing API: free ("available without payment") [S25]. URL Inspection: UNVERIFIED (its page has no quota or price text). Site Verification: UNVERIFIED. |
| 2. Default quotas | **Search Console** [S24]: Search Analytics per site 1,200 queries per minute; per user 1,200 per minute; per project 30,000,000 per day and 40,000 per minute. Load quota: short-term in 10-minute chunks, long-term in 1-day chunks; after a short-term breach, wait 15 minutes. Other resources: per user 20 QPS and 200 per minute; per project 100,000,000 per day. **URL Inspection** [S24]: per site 2,000 per day and 600 per minute; per project 10,000,000 per day and 15,000 per minute. **Indexing API** [S25]: 200 publish requests per day per project (default); 380 requests per minute across all endpoints; 180 per minute on the metadata endpoint. Higher quota needs a separate approval form. Indexing API applies only to pages with JobPosting or BroadcastEvent markup [S25]. **Site Verification**: no quota stated on the page [S67], UNVERIFIED. |
| 3. Expensive operations | Search Analytics per-site load is the tightest read (1,200 per minute per site) [S24]. URL Inspection: 2,000 per site per day [S24]. |
| 4. Access approvals and restrictions | Indexing API: JobPosting and BroadcastEvent pages only; higher quota by approval form [S25]. Site Verification: data access and verification work only for the authenticated user; URLs must be normalized domain names or URLs [S67]. |
| 5. Size and count limits | Search Analytics: rowLimit valid range 1 to 25,000 per request, default 1,000; startRow has no stated maximum [S26]. Date range: at least one day; data retention not on the page, UNVERIFIED [S26]. Sitemaps: 50,000 URLs and 50 MB uncompressed per sitemap (52,428,800 bytes); the size limit applies after decompression [S27][S28]. Sitemap index: up to 50,000 sitemaps and 50 MB [S28]. |
| 6. What happens at the limit | Search Console: "quota exceeded" error; HTTP status not stated, UNVERIFIED. Wait 15 minutes after a short-term breach [S24]. Indexing API: HTTP 429 "Too many requests" [S25]. |
| 7. Cost-saving advice | Ask for no more than the rowLimit you need, page with startRow, and use dataState "final" for stable data [S26]. Split sitemaps at 50,000 URLs [S27]. Inspect only changed pages, since URL Inspection is capped at 2,000 per site per day [S24]. Use Indexing API only for JobPosting and BroadcastEvent pages, within 200 per day [S25]. |

---

## 13. gsearch (Custom Search JSON API, PageSpeed Insights, Chrome UX Report, Safe Browsing, Web Risk, Fact Check Tools, Knowledge Graph)

| Heading | Finding |
|---|---|
| 1. Cost | **Custom Search**: 100 queries per day free; additional queries cost USD 5 per 1,000, up to 10,000 queries per day; billing needed above the free tier; pricing applies only to existing customers until the discontinuation date of 2027-01-01 [S29]. **Knowledge Graph**: free up to 100,000 read calls per day per project; no paid rate on the page [S30]. **Safe Browsing**: no cost; non-commercial use only, commercial users are directed to Web Risk [S65][S31]. **Web Risk**: free tier 100,000 search calls per month (listed on the free tier page as `uris.search`) [S2]; paid rate UNVERIFIED (pricing page not readable). **PageSpeed Insights**: fee statement not on the page; a key is recommended for frequent queries [S66]; pricing UNVERIFIED. **CrUX**: UNVERIFIED. **Fact Check Tools**: UNVERIFIED. |
| 2. Default quotas | **Custom Search**: 100 per day free; daily ceiling for paid queries 10,000 [S29]. Per-minute limit: UNVERIFIED. **Knowledge Graph**: 100,000 per day per project [S30]. **Safe Browsing**: default allocation shown only in the console; numeric value UNVERIFIED [S65]. **Web Risk** [S57]: SearchUris 6,000 per minute; SearchHashes 6,000 per minute; ComputeThreatListDiff 600 per minute; EvaluateUri 600 per minute; EvaluateDigest 600 per minute; SubmitUri 100 per minute and 1,000 per day; shared across all apps using the project. **PageSpeed Insights**: no quota figure on the official pages reached, UNVERIFIED. A third-party guide says 25,000 per day and about 240 per minute, which is not used here. **CrUX**: no official figure found, UNVERIFIED (sources conflict: one aggregator says 150 per day, another 25,000 per day; neither is official). **Fact Check Tools**: UNVERIFIED (the reference page states no limits). |
| 3. Expensive operations | Custom Search queries beyond 100 per day cost USD 5 per 1,000 [S29]. Web Risk SubmitUri (100 per minute, 1,000 per day) [S57]. |
| 4. Access approvals and restrictions | Custom Search is closed to new customers, and the API key is required [S29]. Safe Browsing is for non-commercial use only [S65]. Web Risk is the commercial alternative [S65]. Google reviews quota increase requests for Safe Browsing and asks for a contact [S65]. |
| 5. Size and count limits | Custom Search results per query (`num`) and start-index cap: not on the overview page, UNVERIFIED [S29]. Web Risk and Safe Browsing size limits: UNVERIFIED. |
| 6. What happens at the limit | Custom Search and Web Risk error codes: UNVERIFIED on the pages reached. PageSpeed and CrUX: UNVERIFIED. The suite passes the response through. |
| 7. Cost-saving advice | Plan a move off Custom Search before 2027-01-01 [S29]. Keep Knowledge Graph and Web Risk within their daily and per-minute limits [S30][S57]. Web Risk SearchUris and SearchHashes are each capped at 6,000 per minute [S57]. Cache PageSpeed and CrUX results. |

---

## 14. gai (Gemini API, Vertex AI, Dialogflow CX and ES, Discovery Engine, Cloud Vision, Speech-to-Text, Text-to-Speech, Translate, Natural Language, Document AI)

| Heading | Finding |
|---|---|
| 1. Cost | **Gemini API** [S33] (page last updated 2026-10-15 UTC): Flash models have a free tier (Gemini 3.8 Flash, 3.6 Flash, 3 Flash Preview, 2.5 Flash, 3.5, 3.1 and 2.5 Flash-Lite); Pro models are paid only (2.5 Pro, 3.1 Pro Preview, Gemini 4 Argon). Standard prices per 1M tokens: Gemini 2.5 Flash USD 0.30 input (text, image, video) and 2.50 output; Gemini 2.5 Flash-Lite 0.10 input and 0.40 output; Gemini 2.5 Pro 1.25 input and 10.00 output up to 200,000 tokens (2.50 input and 15.00 output above). Several 2026 prices are introductory: Gemini 3.8 Flash 0.75 input and 3.75 output until 2026-12-31, then 1.50 and 7.50 from 2027-01-01. Batch and Flex rates are about half of Standard [S33]. Free-tier content may be used to improve Google products; standard paid content is not [S33]. **Vision** [S38]: first 1,000 units per month per feature free [S38][S2]. Label detection USD 1.50 per 1,000 for units 1,001 to 5,000,000 and 1.00 above 5,000,000. Text detection USD 1.50 per 1,000 for units 1,001 to 5,000,000 and 0.60 above. Billing account requirement for the free units: UNVERIFIED (the pricing page does not say). **Natural Language**: free 5,000 units per month [S2]; per-1,000 price UNVERIFIED. **Speech-to-Text**: a V1 allowance of 60 minutes per month is listed on the free-tier page, but the wording in the extract is garbled, UNVERIFIED [S2]; price UNVERIFIED. **Text-to-Speech, Translate, Document AI, Dialogflow, Vertex AI, Discovery Engine**: prices not readable (pricing pages returned only the title) or not checked, UNVERIFIED [S34][S35][S36]. Discovery Engine notes that regional search limits cannot be raised under the general pricing model and recommends configurable pricing [S36]. |
| 2. Default quotas | **Gemini API** [S32]: limits are per project, not per API key; measured as requests per minute (RPM), input tokens per minute (TPM) and requests per day (RPD); RPD resets at midnight Pacific time. Spend limits per rolling 10 minutes: Tier 1 USD 10 (billing cap USD 250); Tier 2 USD 50 (cap USD 2,000); Tier 3 USD 200 (cap USD 20,000 to 100,000 or more). Batch API: 100 concurrent batch requests; 2 GB input file; 20 GB file storage. Free-tier RPM, TPM and RPD values per model: UNVERIFIED (the page does not give them; the AI Studio limit page was not reached). **Vertex AI** [S34]: default Gemini RPM and TPM values: UNVERIFIED (the readable text does not give them). Other limits on the page: multimodal input per region per base model: images 34,000,000; video 192,000,000; audio 11,000,000; documents 1,200,000 (units as listed on the page); gemini-embedding 100,000,000 input tokens per minute and 100,000 requests per minute (global); gemini-embedding-2 200,000,000 tokens per minute and 60,000 requests per minute; Agent Runtime query 90 per minute; RAG Engine 600 retrieve, 60 data management and 1,500 online prediction per minute; Gen AI evaluation 1,000 per minute per project per region. Batch inference on Gemini: no predefined quota [S34]. **Dialogflow** [S35]: CX: text intents 1,200 per minute; audio 600 per minute; Chirp 3 HD audio 25 per minute; other session requests 100 per minute; design-time writes 60 and reads 300 per minute; phone gateway 100 minutes per minute; generative features 600,000 tokens per minute. ES Essentials: text 600 per minute, audio 300 per minute, phone 100 minutes per minute. ES Trial: text 180 per minute, audio 100 per minute, 1,000 requests per day, 15,000 per month, phone 3 minutes per minute, 30 phone minutes per day, 500 per month. **Discovery Engine (Agent Search)** [S36]: complete queries 300 per minute per project; conversational reads and writes 300 per minute each; LLM queries (summarization, multi-turn) 60 per minute; regional search 300 per minute per location; grounding checks 300 per minute; Ranking API 500 per minute; data stores 100 per project (technical maximum 500); engines 150 per project (maximum 500); documents 10,000,000 per location; user events 40,000,000,000 per location; serving controls 1,000 per project; allocation quotas are released when a resource is deleted. **Cloud Vision** [S37]: general, label and text detection 1,800 per minute per project; Product Search writes 1,200 per minute; Product Search batch 300 per day; async images in processing 8,000; async pages in processing 10,000. No default per-user value. **Speech-to-Text** [S39]: recognition 900 requests per 60 seconds per project (one streaming session counts as one); adaptation 10 per 60 seconds; 480 hours of audio per day per project. Concurrent streams: not listed, UNVERIFIED. **Text-to-Speech** [S40]: per project per minute: Chirp 3 200; Neural2 1,000; Standard, default 1,000; Studio 500; Polyglot 1,000; long audio synthesis 100; Chirp voice cloning 30; Gemini 2.5 Flash TTS 150; Gemini 2.5 Pro TTS 125; concurrent streaming sessions 100 (a concurrency limit). No daily limit listed. **Translate** [S41]: 6,000,000 characters per minute per project (general model, v2 and v3); v2 300,000 requests per minute; v3 6,000 per minute; supported-languages calls 600 per minute; model creation 10 per minute; daily: 30 unique custom models called. **Natural Language** [S42]: 600 requests per minute; 800,000 requests per day; 1,000,000 bytes per request; per-user limit not listed. **Document AI** [S43]: online requests 120 per minute per project per processor type (US, EU), 6 per minute (single region); generative pages per minute: 120 (Custom Extractor v1.4 and v1.5, US and EU), 30 for Pro versions (60 best effort); base requests 1,800 per minute per user; concurrent batch processes 5 per project; import 3; export 1; training 1. |
| 3. Expensive operations | Gemini: input and output tokens, and the spend limits in row 2; Priority is tied to the standard limits [S32][S33]. Vision: each feature on each image is one billable unit; multi-page files are billed per page [S38]. Speech-to-Text: 480 hours of audio per day per project [S39]. Dialogflow CX: generative features at 600,000 tokens per minute [S35]. Translate: characters are the billing unit (rate UNVERIFIED). Discovery Engine: LLM queries 60 per minute, the tightest limit for answer generation [S36]. |
| 4. Access approvals and restrictions | Gemini: tier upgrades are automatic after paid spend (see row 2) [S32]. Gemini 4 Argon is not on the free tier [S33]. Vertex AI multimodal input quotas cannot be raised from the console; contact the account team [S34]. Custom Search is closed to new customers [S29]. Safe Browsing is non-commercial only [S65]. Discovery Engine regional search cannot be raised under the general pricing model [S36]. Other AI APIs: enablement and billing: UNVERIFIED beyond the free tier note [S2]. |
| 5. Size and count limits | Vision: image up to 20 MB; PDF up to 1 GB; JSON request up to 10 MB; images:annotate 16 images per request; asyncBatchAnnotate 2,000 images per request; files:annotate 5 pages per request; files:asyncBatchAnnotate 2,000 pages per request [S37]. Speech-to-Text: synchronous request about 1 minute of audio; asynchronous about 480 minutes; streaming about 5 minutes; local-file requests up to 10 MB; Cloud Storage audio has no size limit [S39]. Translate: 5,000 characters recommended per request; Advanced 30,000 code points; Basic 100,000 bytes; Translation LLM and Adaptive 30,000 characters [S41]. TTS: 5,000 bytes per request [S40]. Dialogflow: 256 characters of text per query (CX non-generative, ES); CX audio up to 120 seconds per input; ES streaming up to 60 seconds per request; ES telephony up to 3.5 hours; sessions kept 30 minutes after the last request [S35]. Natural Language: 1,000,000 bytes per request [S42]. Document AI: pages per request and file size: UNVERIFIED (limits page not reached) [S43]. Discovery Engine: data stores and documents as in row 2 [S36]. |
| 6. What happens at the limit | Gemini: a spend-based limit returns HTTP 429 `RESOURCE_EXHAUSTED`; the page does not name the code for RPM, TPM or RPD breaches [S32]. Vision: a quota breach blocks the call and the task fails; no code given [S37]. Dialogflow: error codes not documented [S35]. Discovery Engine: error codes not on the page [S36]. Speech-to-Text: an error is returned; no code given [S39]. Translate: HTTP 403 with message "Daily Limit Exceeded" (daily quota) or "User Rate Limit Exceeded" (per minute); a request over the maximum size returns HTTP 400 `INVALID_ARGUMENT` whatever the quota [S41]. Natural Language: an oversize text returns "API Error"; no numeric code [S42]. TTS, Vertex AI and Document AI: UNVERIFIED. The suite passes these through. |
| 7. Cost-saving advice | Use Flash or Flash-Lite for high-volume work; the Pro models are paid-only [S33]. Use batch rates, which are about half of standard [S33]. Watch the 10-minute spend window if you call Gemini in bursts [S32]. Send Vision images in batches of up to 16 per call [S37]. For audio over about 1 minute, use a Cloud Storage URI, not inline audio [S39]. Keep Translate requests under 5,000 characters [S41]. Use the Vision and Natural Language free units first (1,000 Vision units per month per feature; 5,000 Natural Language units per month) [S2]. |

---

## Known conflicts and open items

1. Drive API quota: the current page [S4] gives quota units per minute (1,000,000 per project; 325,000 per user). An older copy [S69] gives 12,000 queries per 60 seconds per project and per user. The console is the authority for your project.
2. Drive Labels: localized copies [S68] give 600 reads and 300 writes (the tables label them per second). A third-party listing gives 60 writes. UNVERIFIED.
3. PageSpeed Insights and CrUX daily quotas: third-party sites disagree (25,000 per day versus 150 per day). Neither is official. Not used.
4. Safe Browsing daily quota: a third-party blog says 10,000 per day. Not official. Not used.
5. Google Books daily quota: forum posts say 1,000 per day [S71]. Not official. Not used.
6. Cloud KMS: the quotas changed on 2026-02-16 [S51]. Figures before and after are both listed in gcloud row 2.
7. Gemini Flash prices: several are introductory and rise on fixed dates in 2026 and 2027 [S33].
8. Calendar, Gmail and Meet: overage charges planned for later in 2026, with no amount [S6][S5][S23].

## UNVERIFIED pages (no readable official value)

- BigQuery pricing: https://cloud.google.com/bigquery/pricing (script-rendered; only the title was readable)
- Cloud Translation pricing: https://cloud.google.com/translate/pricing (same)
- Speech-to-Text pricing: https://cloud.google.com/speech-to-text/pricing (same)
- Text-to-Speech pricing: https://cloud.google.com/text-to-speech/pricing (same)
- Natural Language pricing: https://cloud.google.com/natural-language/pricing (same)
- Document AI pricing: https://cloud.google.com/document-ai/pricing (same)
- Gemini API AI Studio rate-limit page (dynamic): https://aistudio.google.com/rate-limit (not reached)
- Compute Engine API rate limits: https://docs.cloud.google.com/compute/docs/api-quota (404)
- Cloud Identity quotas: https://docs.cloud.google.com/identity/docs/quotas (404)
- Chrome Management API quotas: https://developers.google.com/chrome/management/reference/rest/quotas (404)
- Reseller API limits (English): https://developers.google.com/workspace/admin/reseller/limits (404); only a Japanese-locale search summary was found [S70]
- CrUX (Chrome UX Report) API limits: https://developers.google.com/chrome-ux-report/api/v1 (404); sources conflict, not official
- Fact Check Tools: https://developers.google.com/fact-check/tools/api/reference/rest was fetched; it states no quota or usage limit
- People API quotas: no page reached (https://developers.google.com/people/v1/limits: 404)
- Keep API limits: no page reached (https://developers.google.com/keep/api/limits: 404)
- Cloud Quotas API and Service Usage: no page reached
- Drive Activity API: no page reached
- Drive Labels English page: not reached (localized copy only) [S68]
- Books API: no official page reached [S71]
- Document AI limits page: https://docs.cloud.google.com/document-ai/limits (linked from [S43], not fetched)
- Site Verification API quotas: page reached, no quota stated

---

## Sources

Checked on 2026-10-16. "Fetched" means read with WebFetch. "Search summary" means the URL came from WebSearch and its text was not fetched.

| ID | Page | URL | How read |
|---|---|---|---|
| S1 | Google Cloud quotas overview | https://docs.cloud.google.com/docs/quotas/overview | Fetched (redirect from cloud.google.com) |
| S2 | Google Cloud Free Tier features | https://docs.cloud.google.com/free/docs/free-cloud-features | Fetched (redirect) |
| S3 | API keys | https://docs.cloud.google.com/docs/authentication/api-keys | Fetched |
| S4 | Drive API usage limits | https://developers.google.com/workspace/drive/api/guides/limits | Fetched |
| S5 | Gmail API quota | https://developers.google.com/gmail/api/reference/quota | Fetched |
| S6 | Calendar API quota | https://developers.google.com/workspace/calendar/api/guides/quota | Fetched |
| S7 | Chat API limits | https://developers.google.com/workspace/chat/limits | Fetched |
| S8 | Sheets API limits | https://developers.google.com/workspace/sheets/api/limits | Fetched |
| S9 | Docs API limits | https://developers.google.com/workspace/docs/api/limits | Fetched |
| S10 | Slides API limits | https://developers.google.com/workspace/slides/limits | Fetched |
| S11 | Forms API limits | https://developers.google.com/forms/api/limits | Fetched |
| S12 | Apps Script quotas | https://developers.google.com/apps-script/guides/services/quotas | Fetched |
| S13 | Classroom API limits | https://developers.google.com/workspace/classroom/limits | Fetched |
| S14 | Tasks API limits | https://developers.google.com/workspace/tasks/limits | Fetched |
| S15 | Alert Center API limits | https://developers.google.com/admin-sdk/alertcenter/guides/limits | Fetched |
| S16 | Workspace Events usage limits | https://developers.google.com/workspace/events/guides/limits | Fetched |
| S17 | Admin SDK Directory limits | https://developers.google.com/admin-sdk/directory/v1/limits | Fetched |
| S18 | Admin SDK Reports limits | https://developers.google.com/admin-sdk/reports/v1/limits | Fetched |
| S19 | Groups Settings limits | https://developers.google.com/admin-sdk/groups-settings/limits | Fetched |
| S20 | Licensing API limits | https://developers.google.com/admin-sdk/licensing/v1/limits | Fetched |
| S21 | Data Transfer limits | https://developers.google.com/workspace/admin/data-transfer/v1/limits | Fetched |
| S22 | Vault limits | https://developers.google.com/vault/limits | Fetched |
| S23 | Meet REST limits | https://developers.google.com/workspace/meet/api/guides/limits | Fetched |
| S24 | Search Console API limits | https://developers.google.com/webmaster-tools/limits | Fetched |
| S25 | Indexing API quota and pricing | https://developers.google.com/search/apis/indexing-api/v3/quota-pricing | Fetched |
| S26 | Search Analytics query reference | https://developers.google.com/webmaster-tools/v1/searchanalytics/query | Fetched |
| S27 | Google sitemap guide | https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap | Fetched |
| S28 | Sitemap protocol | https://www.sitemaps.org/protocol.html | Fetched |
| S29 | Custom Search JSON API overview | https://developers.google.com/custom-search/v1/overview | Fetched |
| S30 | Knowledge Graph usage limits | https://developers.google.com/knowledge-graph/reference/rest/v1/usage-limits | Fetched |
| S31 | Safe Browsing pricing | https://developers.google.com/safe-browsing/v4/pricing | Fetched |
| S32 | Gemini API rate limits | https://ai.google.dev/gemini-api/docs/rate-limits | Fetched |
| S33 | Gemini API pricing | https://ai.google.dev/gemini-api/docs/pricing | Fetched (page dated 2026-10-15 UTC) |
| S34 | Vertex AI generative AI quotas | https://docs.cloud.google.com/vertex-ai/generative-ai/docs/quotas | Fetched (redirect; first 100,000 characters plus part of the rest) |
| S35 | Dialogflow quotas | https://docs.cloud.google.com/dialogflow/quotas | Fetched |
| S36 | Discovery Engine (Agent Search) quotas | https://docs.cloud.google.com/generative-ai-app-builder/quotas | Fetched |
| S37 | Cloud Vision quotas | https://docs.cloud.google.com/vision/quotas | Fetched |
| S38 | Cloud Vision pricing | https://cloud.google.com/vision/pricing | Fetched |
| S39 | Speech-to-Text quotas | https://docs.cloud.google.com/speech-to-text/quotas | Fetched (V1 limits) |
| S40 | Text-to-Speech quotas | https://docs.cloud.google.com/text-to-speech/quotas | Fetched |
| S41 | Cloud Translation quotas | https://docs.cloud.google.com/translate/quotas | Fetched |
| S42 | Natural Language quotas | https://docs.cloud.google.com/natural-language/quotas | Fetched |
| S43 | Document AI quotas | https://docs.cloud.google.com/document-ai/quotas | Fetched |
| S44 | BigQuery quotas and limits | https://docs.cloud.google.com/bigquery/quotas | Fetched (three sections) |
| S45 | Cloud Storage quotas and limits | https://docs.cloud.google.com/storage/quotas | Fetched |
| S46 | Cloud Run quotas | https://docs.cloud.google.com/run/quotas | Fetched |
| S47 | Firestore quotas | https://docs.cloud.google.com/firestore/quotas | Fetched |
| S48 | GKE quotas | https://docs.cloud.google.com/kubernetes-engine/quotas | Fetched |
| S49 | Pub/Sub quotas | https://docs.cloud.google.com/pubsub/quotas | Fetched |
| S50 | Secret Manager quotas | https://docs.cloud.google.com/secret-manager/quotas | Fetched |
| S51 | Cloud KMS quotas | https://docs.cloud.google.com/kms/quotas | Fetched |
| S52 | Cloud Logging quotas | https://docs.cloud.google.com/logging/quotas | Fetched |
| S53 | Cloud Monitoring quotas | https://docs.cloud.google.com/monitoring/quotas | Fetched |
| S54 | Resource Manager limits | https://docs.cloud.google.com/resource-manager/docs/limits | Fetched |
| S55 | Cloud Billing quotas | https://docs.cloud.google.com/billing/quotas | Fetched |
| S56 | Cloud Asset Inventory quota | https://cloud.google.com/asset-inventory/docs/quota | Fetched (redirect) |
| S57 | Web Risk quotas | https://docs.cloud.google.com/web-risk/quotas | Fetched (redirect) |
| S58 | Compute Engine resource quotas | https://docs.cloud.google.com/compute/resource-usage | Fetched |
| S59 | Service account key best practices | https://docs.cloud.google.com/iam/docs/best-practices-for-managing-service-account-keys | Fetched |
| S60 | Chrome Policy API quotas | https://developers.google.com/chrome/policy/guides/api-quotas | Fetched |
| S61 | Gmail sending limits (Workspace) | https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace | Fetched (redirect from support.google.com) |
| S62 | Gmail sending limits (consumer) | https://support.google.com/mail/answer/22839 | Fetched |
| S63 | Sensitive scope verification | https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification | Fetched |
| S64 | Gmail API scopes | https://developers.google.com/gmail/api/auth/scopes | Fetched |
| S65 | Safe Browsing usage limits | https://developers.google.com/safe-browsing/v4/usage-limits | Fetched |
| S66 | PageSpeed Insights API get started | https://developers.google.com/speed/docs/insights/v5/get-started | Fetched (no quota figures) |
| S67 | Site Verification API getting started | https://developers.google.com/site-verification/v1/getting_started | Fetched (no quota figures) |
| S68 | Drive Labels usage limits (localized copy) | https://developers.google.com/workspace/drive/labels/limits?hl=it | Search summary only; not fetched |
| S69 | Drive API usage limits (older copy, conflicting) | https://developers.google.com/drive/api/guides/limits?authuser=5 | Search summary only; not fetched |
| S70 | Reseller API limits (Japanese locale) | https://developers.google.cn/workspace/admin/reseller/v1/limits?hl=ja | Search summary only; not fetched |
| S71 | Google Books quota forum thread (not official) | https://discuss.google.dev/t/requesting-higher-quota-for-google-books-api-bookquest-app/286093 | Search summary only; not official |
