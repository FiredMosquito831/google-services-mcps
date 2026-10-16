# Limits, quotas and costs

This page is the index. It gives one row per product, with the cost, the headline quota and the approval needed. It also gives the rules that apply to every product.

The detailed figures are in two files:

- [limits/workspace-cloud-search-ai.md](limits/workspace-cloud-search-ai.md): gcloud, gdrive, gmail, gcalendar, gchat, gmeet, gcontacts, gtasks, gclassroom, gapps, gadmin, gsc, gsearch and gai. Each product is section 1 to 14.
- [limits/ads-business-youtube-play.md](limits/ads-business-youtube-play.md): gads, gbusiness, ganalytics, gtm, gyoutube, gmerchant, gplay, gfirebase and gmaps. Each product is section 2 to 10.

**How to read this page.**

- The figures are copied from those files. Each one keeps its **UNVERIFIED** tag where the file has one. **UNVERIFIED** means the value could not be confirmed on an official page. The file gives the reason.
- Quotas change. Google can change them without notice. Check the **Quotas** page in the Google Cloud console for your project before any large run.
- Nothing here is a price quote. Check the live pricing page before any billing decision.

## Index: one row per product

| Product | Does the API cost money? | Headline quota | Approval needed? | Details |
|---|---|---|---|---|
| `gcloud` | Free Tier needs a billing account. Pay-as-you-go prices UNVERIFIED. | Set per API. BigQuery: 100 requests per second per user per method. Cloud Storage: about 1,000 writes and 5,000 reads per second per bucket at start. Logging `entries.list`: 60 per minute per project, which cannot be raised. | Quota increases through the console. Some increases for paid services need payment in advance. Service account key creation is blocked by default for organisations created on or after 2024-05-03. | [workspace file §1](limits/workspace-cloud-search-ai.md) |
| `gsc` | Search Console API fee: UNVERIFIED. Indexing API: free. | Search Analytics: 1,200 queries per minute per site. URL Inspection: 2,000 per site per day and 600 per minute. Indexing API: 200 publish requests per day per project (default). | Indexing API applies only to JobPosting and BroadcastEvent pages. A higher Indexing API quota needs an approval form. | [workspace file §12](limits/workspace-cloud-search-ai.md) |
| `gsearch` | Custom Search: 100 queries per day free, then USD 5 per 1,000, up to 10,000 per day. Knowledge Graph: free up to 100,000 read calls per day per project. Safe Browsing: no cost, non-commercial use only. Web Risk: free tier of 100,000 search calls per month. Web Risk paid rate UNVERIFIED. PageSpeed Insights and CrUX: UNVERIFIED. | Custom Search: 100 per day free, paid up to 10,000 per day. Knowledge Graph: 100,000 per day per project. Web Risk SearchUris: 6,000 per minute. | Custom Search needs an API key. Reported: closed to new customers and discontinued on 2027-01-01. Check in the Google Cloud console. | [workspace file §13](limits/workspace-cloud-search-ai.md) |
| `gdrive` | Included with Google Workspace. No per-call fee on the pages read. Drive has a daily billing threshold of 400,000,000 quota units per project per day that cannot be raised. When charges start: UNVERIFIED. | Drive: 1,000,000 quota units per minute per project; 325,000 per user per project. Docs: 3,000 reads and 600 writes per minute per project. Sheets: 300 reads and 300 writes per minute per project. Conflict: an older copy of the Drive page gives 12,000 queries per 60 seconds per project and per user. | Sensitive and restricted scope rules apply to any OAuth app that requests them. Scope classification for Drive, Docs, Sheets, Slides and Forms: UNVERIFIED. | [workspace file §2](limits/workspace-cloud-search-ai.md) |
| `gmail` | Included with Google Workspace. Daily billing threshold of 80,000,000 quota units per project per day that cannot be raised. Charges for exceeding quota are planned for later in 2026, with no amount. Consumer Gmail sending is free, capped at 500 messages per day. | Per project: 1,200,000 quota units per minute. Per user per project: 6,000 units per minute. `messages.send` costs 100 units each. `history.list` costs 2 units. | Restricted Gmail scopes need restricted-scope verification, and a security assessment if restricted data is stored or sent from a server. | [workspace file §3](limits/workspace-cloud-search-ai.md) |
| `gcalendar` | Included with Google Workspace. Exceeding quota is planned to incur Google Cloud charges later in 2026, with no amount. | Per project: 10,000 requests per minute. Per user per project: 600 per minute. Per day per project: 1,000,000 requests (a billing threshold that cannot be increased). | Reading calendar events and storing contacts are examples of sensitive scopes that need Google review for public apps. Exact classification of each Calendar scope: UNVERIFIED. | [workspace file §4](limits/workspace-cloud-search-ai.md) |
| `gchat` | Included with Google Workspace. No fee statement on the Chat page: UNVERIFIED. | Per project per minute: message writes 3,000; message reads 3,000; message search 300. Per space per second: writes 1. | Scope classification for Chat: UNVERIFIED. | [workspace file §5](limits/workspace-cloud-search-ai.md) |
| `gmeet` | Standard use is free. Exceeding quota is planned to incur Google Cloud charges later in 2026, with no amount. | Per project per minute: reads 6,000; writes 1,000; `spaces.create` 100. Per user per project per minute: reads 600; writes 100; `spaces.create` 10. | Meet scope classification and any app review: UNVERIFIED. | [workspace file §6](limits/workspace-cloud-search-ai.md) |
| `gcontacts` | UNVERIFIED. No official People API pricing page was reached. | UNVERIFIED. No People API quota page was reached. Check the People API quotas page in the console before a bulk sync. | Storing new Google Contacts is an example of a sensitive scope that needs Google review. Scope classification for Contacts: UNVERIFIED. | [workspace file §7](limits/workspace-cloud-search-ai.md) |
| `gtasks` | Tasks fee statement not found: UNVERIFIED. Keep: UNVERIFIED. | Tasks: courtesy limit of 50,000 queries per day. No per-minute figure stated. Keep: UNVERIFIED. | Scope classification for Tasks and Keep: UNVERIFIED. Increases are requested in the console and are not guaranteed. | [workspace file §8](limits/workspace-cloud-search-ai.md) |
| `gclassroom` | Included with Google Workspace (Education editions). Fee statement not fetched: UNVERIFIED. | Per client (project) per minute: 3,000 queries. Per user per minute: 1,200 queries. Per client per day: 4,000,000 queries. | Education-edition eligibility and scope classification: UNVERIFIED. | [workspace file §9](limits/workspace-cloud-search-ai.md) |
| `gapps` | Fee statement not in the fetched text: UNVERIFIED. Trial accounts have extra limits. | Daily per-user quotas. Email recipients per day (MailApp): 1,500 for Workspace, 100 for consumer accounts. Script runtime: 6 minutes per execution. | The page says all quotas can change without notice. Marketplace and add-on review rules: UNVERIFIED for the Apps Script API itself. | [workspace file §10](limits/workspace-cloud-search-ai.md) |
| `gadmin` | Admin SDK APIs are included with Workspace. Fee statement not fetched: UNVERIFIED. | Directory: 2,400 queries per minute per user per project. Reports: 2,400 per minute per user per project. Groups Settings: 100,000 queries per day. Licensing: QPS quota of 1. Alert Center: 1,000 requests per second per project. | Needs a service account with domain-wide delegation (`npx google-services-mcps setup-admin`). Service account key creation is blocked by the default organisation policy. Admin role requirements per API: UNVERIFIED. | [workspace file §11](limits/workspace-cloud-search-ai.md) |
| `ganalytics` | Data API (GA4): cost UNVERIFIED. Admin API: cost UNVERIFIED. | Data API per property, Standard / Analytics 360: core tokens per day 200,000 / 2,000,000; concurrent requests 10 / 50. Admin API: 1,200 requests per minute; 600 per user; 600 writes per minute; 180 writes per minute per user. | No approval step stated for the Data API. The Admin API page says projects that violate the Analytics Terms of Service might be throttled. | [ads file §4](limits/ads-business-youtube-play.md) |
| `gtm` | UNVERIFIED: whether a Tag Manager account is needed, and the cost. The page says nothing about either. | 10,000 requests per project per day. 0.25 queries per second per project. | Register the application in the Google API Console to receive any quota. Increases are requested through the console. | [ads file §5](limits/ads-business-youtube-play.md) |
| `gyoutube` | UNVERIFIED money cost. The pages state quota units only. | 10,000 units per day combined for all endpoints except `search.list` and `videos.insert`. `search.list`: 100 calls per day. `videos.insert`: 100 calls per day. Read calls usually cost 1 unit; modifying calls often cost 50. | Quota above the default needs a compliance audit first (YouTube API Services Audit and Quota Extension Form). | [ads file §6](limits/ads-business-youtube-play.md) |
| `gbusiness` | UNVERIFIED: cost. The prerequisites page says nothing about it. | 300 requests per minute for general requests. Business Information edits: 10 per minute per profile, which cannot be increased. | Application for Basic API Access is needed. A verified, active listing held for 60+ days. Increases can be denied when usage does not consistently approach the limit. | [ads file §3](limits/ads-business-youtube-play.md) |
| `gads` | The access-level page states no cost for any level. A non-compliance fee can apply to a tool that fails the Required Minimum Functionality: minimum US$1,000 and maximum US$25,000 per billing period, capped at US$50,000 per review cycle. Which access level it applies to: UNVERIFIED. | Google Ads operations per day: Test 15,000 (test accounts only); Explorer 2,880 on production and 15,000 on test accounts; Basic 15,000; Standard unlimited. Display & Video 360: 1,500 total requests and 700 writes per minute per project. | Access level attaches to the Google Cloud project. Basic needs brand verification of the project. Standard needs a manual audit. Developer tokens sunset on 2026-09-09; the token is optional now. | [ads file §2](limits/ads-business-youtube-play.md) |
| `gmerchant` | UNVERIFIED money cost: the overview page does not say whether the Merchant API is free or paid. | No default number on the quota page. Read the limits per account with `quotas.list`. Per-minute overage: HTTP 429 `quota/request_rate_too_high`. Daily overage: HTTP 429 `quota/daily_limit_exceeded`. | A production Merchant Center account with a verified website. Registration is one-time per Google Cloud project. Quota increases are temporary, for products, accounts and advanced-account data sources, and not guaranteed. | [ads file §7](limits/ads-business-youtube-play.md) |
| `gplay` | Registration is US$25, charged once. The API's own cost: UNVERIFIED. | Publishing APIs: 3,000 queries per minute per bucket. Reporting API: 10 queries per second. Play Games Services: no numeric default published. | A service account invited in Play Console. Increases through the Cloud Console Quotas section, or the Play quota form for the Reporting API. Games quota increases usually aren't accepted. | [ads file §8](limits/ads-business-youtube-play.md) |
| `gfirebase` | Spark is the no-cost plan, with no payment method needed. Blaze is usage-based and keeps the Spark allowances. Crashlytics, App Distribution and FCM are no-cost on Spark. | Spark: Firestore 20,000 writes, 50,000 reads and 20,000 deletes per day. FCM HTTP v1: 600,000 messages per minute per project. Android per device: 240 messages per minute and 5,000 per hour. | Blaze billing is needed for Cloud Functions, Cloud Storage, App Hosting and SMS phone authentication. The list is inferred from the pricing page. | [ads file §9](limits/ads-business-youtube-play.md) |
| `gmaps` | Pay as you go per SKU, with free calls each month. Since 2025-03-01 the US$200 credit has been replaced by free monthly calls per SKU. Billing is needed on each project. | Free calls per SKU per month: Essentials 10,000; Pro 5,000; Enterprise 1,000. Essentials Map Tiles: 100,000. | No approval step stated on the pages read. Whether Solar, Pollen or Air Quality needs an application: UNVERIFIED. | [ads file §10](limits/ads-business-youtube-play.md) |
| `gai` | Gemini API: Flash models have a free tier. Pro models are paid only. Several 2026 prices are introductory and rise on fixed dates. Vision: first 1,000 units per month per feature free. Other AI APIs: prices UNVERIFIED. | Gemini: per project limits in requests per minute, tokens per minute and requests per day. Spend limit per rolling 10 minutes: Tier 1 USD 10. Vision: 1,800 per minute per project. Speech-to-Text: 900 requests per 60 seconds per project. Translate: 6,000,000 characters per minute per project. | Gemini tier upgrades are automatic after paid spend. Vertex AI multimodal input quotas cannot be raised from the console. Discovery Engine regional search cannot be raised under the general pricing model. | [workspace file §14](limits/workspace-cloud-search-ai.md) |

For the full per-product figures, read the section named in the last column.

## General rules that apply everywhere

### 1. The suite adds no charge of its own

The MCP server is free. This is a statement from the project brief, not a Google price. Each call goes from your machine to Google, with your own OAuth client, API key or service account. Google's charges, quotas and approval rules apply to every call.

### 2. Quotas belong to a project or to an account

Most quotas are per Google Cloud project. Some are also per user. Usage in one project does not reduce another project's quota. Quota increases are requested in the Google Cloud console. Some increases can be denied.

### 3. Quota values change, and new projects may differ

- Quota values change often. Check the **Quotas** page in the Google Cloud console for your project before you rely on any number.
- The Calendar and Gmail pages say that projects which used the API between November 2025 and April 2026 keep their old quotas. Projects created on or after 2026-05-01 get the new quotas. The old values are not on the page. Check the console for your project.

### 4. Quota errors, and what the suite does

The suite retries rate-limit and unavailable responses up to 3 attempts in total, with backoff; after that the error reaches Claude. This is the current behaviour, from `src/core/http.ts`:

- **Which errors are retried.** HTTP 429 and HTTP 503 are retried for any request. HTTP 403 is retried only when Google's reason is `rateLimitExceeded`, `userRateLimitExceeded` or `quotaExceeded`, and only for reads (`GET`, `HEAD` and `OPTIONS`). A write is never retried on a 403. Other errors are returned at once.
- **How many attempts.** At most 3 attempts in all, including the first. That means one try and up to two retries.
- **How long it waits.** About 500 ms before the first retry and about 1 second before the second, each with jitter. A `Retry-After` header given in seconds replaces that wait, up to 60 seconds.
- **What you see.** After the last attempt, the error is returned to Claude as text: `HTTP <status> | reason=<reason> | <Google's message>`. The reason is shown only when Google sends one. A missing permission adds a hint to the text.
- **What retrying cannot do.** A quota that is used up does not clear by retrying. Wait for the quota reset, or ask for more quota in the console.

**Limits files.** The per-product files in `docs/limits/` say the same thing and point back to this section.

### 5. Claude's own cost

- **Each installed product adds tool definitions to your sessions.** Install fewer products. Turn off the servers you do not use with `/mcp`. `claude plugin details <id>@google-services-mcps` shows the projected token cost (**help only**).
- **Tool search.** Claude Code's tool search is on by default. It loads tool definitions only when they are needed. Fewer installed products still mean less to search.
- **Large results are cut.** A tool result is cut at 50,000 characters by default. The limit is the environment variable `GSM_MAX_RESULT_CHARS` (`src/core/config.ts`, `src/core/tools.ts`). The cut text says so and suggests narrowing the query. The plugin does not set this variable. The limits file estimates 50,000 characters at about 12,000 tokens, at about 4 characters per token. That is an estimate, not a measurement.
- **Use filters and small pages.** Narrow the query, and use the smallest page size you need.

### 6. Custom Search JSON API: reported closed

**Reported:** the Custom Search JSON API is closed to new customers. It is reported to be discontinued on 2027-01-01. Existing customers must move to another solution by then (the limits file cites Google's Custom Search overview page). **Check this in the Google Cloud console and on Google's own page before you rely on the `gsearch` Custom Search tools.**

### 7. Google Ads developer token: optional now

- Google sunset developer tokens on 2026-09-09. Access now belongs to the Google Cloud project of your OAuth client. The developer-token page says the header is optional and ignored by the API.
- The suite treats the token as optional. It sends the header only when a token is set. The token can come from the plugin option `ads_developer_token`, from `GSM_ADS_DEVELOPER_TOKEN`, or from `developerToken` in `ads.json` in the token directory (`src/core/ads.ts`). A missing token blocks nothing.
- **UNVERIFIED:** whether Google still issues developer tokens to new users. The page does not say.
- **UNVERIFIED:** the sunset date. A third-party source says September 10, not September 9.
- The ads limits file (section 1.4) says the same: the token is optional, and the header is sent only when a token is set.

### 8. Other rules from the limits files

- **Sensitive and restricted scopes.** An OAuth app that requests sensitive or restricted scopes needs Google's review before any account can grant access. Apps with those scopes usually need verification, unless an exception applies. The 100-user cap for unverified apps is UNVERIFIED.
- **Service account keys.** The organisation policy "Disable service account key creation" is enforced by default for organisations created on or after 2024-05-03.
- **Google Cloud Free Tier.** It needs a billing account. Monthly allowances do not roll over.
- **Overage charges.** Calendar, Gmail and Meet say that exceeding quota is planned to incur Google Cloud charges later in 2026. No amount is given.
- **Drive billing threshold.** Drive has a daily billing threshold of 400,000,000 quota units per project per day. It cannot be increased.

### 9. Known conflicts and open items

The limits files list these. Copied here so you see them:

- **Drive API quota.** The current Drive page gives quota units per minute. An older copy gives 12,000 queries per 60 seconds. The console is the authority for your project.
- **Cloud KMS.** The quotas changed on 2026-02-16. Both figures are in the workspace file, section 1.
- **Gemini Flash prices.** Several are introductory and rise on fixed dates in 2026 and 2027.
- **PageSpeed Insights, CrUX, Safe Browsing and Google Books.** Third-party sites give daily figures that conflict with each other and are not official. The limits files do not use them.

### 10. What UNVERIFIED means

Each **UNVERIFIED** tag means the value is not on an official page that could be read. The official pages may disagree, the page may be dynamic, or the figure may come only from a third party. The detailed file gives the reason for each tag.
