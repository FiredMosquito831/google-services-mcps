# Limits, quotas, approvals and costs: Ads, Business, Analytics, YouTube, Merchant, Play, Firebase and Maps

Checked: 2026-10-16 (the date in the research brief; the sandbox clock reads 2026-10-15). Dates like "last updated 2026-10-14" are the dates the pages themselves show.

Products covered (plugin ids from docs/SURFACES.md): `gads`, `gbusiness`, `ganalytics`, `gtm`, `gyoutube`, `gmerchant`, `gplay`, `gfirebase`, `gmaps`. The `gads` plugin also covers the advertising and publisher APIs listed in docs/CAPABILITIES.md (Search Ads 360, Display & Video 360, Campaign Manager 360, Ad Exchange Buyer, Real-time Bidding, AdSense, AdMob).

## How to read this file

- `[S#]` points to the numbered source in section 11. Each source is an official Google or Firebase page, with its URL and the date the page showed.
- Values are read from those pages with a page-reading tool, not copied by hand. Re-check a value on the live page before you rely on it for a billing decision.
- `UNVERIFIED` means the value is not on an official page that could be read, the official pages disagree, the page is dynamic, or the figure came only from a third-party or forum source. The reason follows the tag.
- Nothing here was run against live accounts. No Google API was called with credentials.
- Quotas on most pages are per project. Google can change them without notice, and several of the pages say so. The Cloud Console Quotas page for each project shows the live values.

---

## 1. General section (applies to most of these products)

### 1.1 Cost: the suite adds none, Google may

The suite adds no charge of its own. Every call goes from the user's machine to a Google API, using the user's own OAuth client, API key or service account. Google's cost, quota and approval rules therefore apply to every call.

| Kind of cost | Products | Source |
|---|---|---|
| Free, no fee stated | Search Ads 360 API: "There are no additional fees for using the API." Street View Publish API: "All use of Google Street View Publish API is free of charge." Firebase Spark products listed as no-cost: Crashlytics, App Distribution, Cloud Messaging (FCM). | [S9], [S51], [S40] |
| Free monthly allowance, then pay-as-you-go | Maps Platform: free calls per SKU per month, then a price per 1,000 calls. Firebase Blaze: usage-based, and Spark allowances stay free. | [S45], [S46], [S40] |
| One-time or penalty fees | Google Play Console registration: US$25 once. Google Ads non-compliance fees for a tool that fails the Required Minimum Functionality (RMF). | [S36], [S4] |
| No fee statement found | Every other API in this file. Where the page says nothing about cost, the product section says UNVERIFIED. Silence on a page is not proof that calls are free. | per product |

### 1.2 Accounts and projects you need before any call

| Requirement | Which products | Source |
|---|---|---|
| Google Cloud project with the API enabled, or billing enabled on the project | DV360; Campaign Manager 360; Authorized Buyers (RTB); Merchant API; Play Developer API; YouTube; Maps (billing on each project) | [S6], [S11], [S14], [S31], [S35], [S27], [S47]-[S50] |
| OAuth client or service account | AdSense: installed-app OAuth (service accounts UNVERIFIED, see 2.8). AdMob: OAuth2 required for every call. Merchant API: OAuth or service account. Play: service account recommended and invited in Play Console. | [S16], [S18], [S31], [S35] |
| Product account | Google Ads account; DV360 user profile; Campaign Manager 360 account and user profile; Authorized Buyers account; AdSense account; AdMob account; Play Console developer account; Merchant Center production account with a verified website; Business Profile listing verified and active for 60+ days; Maps billing account | per product |
| Developer token | Google Ads only. Google's page says developer tokens were sunset on 2026-09-09 and access now belongs to the Cloud project. See section 1.4 and 2.1. | [S3] |

### 1.3 How quota is counted, and what a limit error looks like

- Google Ads counts operations per day. YouTube Data API counts units per day. DV360, Campaign Manager 360, Google Analytics and Merchant count requests per minute or per day. FCM counts messages per minute. Play counts queries per minute per bucket. Each product section gives the exact rules.
- Over-limit responses differ by API. Google Ads, SA360, DV360, AdMob, FCM and Merchant return a RESOURCE_EXHAUSTED or 429 style error. Campaign Manager 360 and Bid Manager return HTTP 403 with reasons such as `dailyLimitExceeded`. Tag Manager returns HTTP 403 with no reason stated. Each product section gives the error it returns, or says UNVERIFIED.

### 1.4 What the suite shows when a limit is hit

These points were checked in the suite's source, not on Google's pages.

- A failed call returns an error result (`isError` set to true). Its text is `HTTP <status>`, then `reason=<reason>` when Google sends one, then Google's own message. The parts are joined with a vertical bar. Source: `D:\Projects2\Google-services-mcps\src\core\tools.ts`, lines 91 to 100 and 201 to 202.
- For Google Ads, the error is redacted first. The developer token is removed from the message, and the status, code, errors and response data are kept. Source: `src\core\ads.ts`, lines 84 to 104.
- The suite retries rate-limit and unavailable responses up to 3 attempts in total, with backoff; after that the error reaches Claude. It repeats HTTP 429 and 503 for any method, and HTTP 403 with a rate-limit reason for reads only (`src/core/http.ts`). After the last attempt the user sees the error and must wait for the quota reset.
- Tool output is cut at 50,000 characters by default. The variable is `GSM_MAX_RESULT_CHARS`. The cut text says it was truncated and suggests narrowing the query. Source: `src\core\config.ts`, line 72, and `src\core\tools.ts`, line 70.
- The developer token is optional in this suite. Google sunset developer tokens on 2026-09-09. Google Ads access is granted to the Cloud project of the OAuth client, and the developer-token header is sent only when a token is set (`GSM_ADS_DEVELOPER_TOKEN`, or `developerToken` in `ads.json`; source: `src/core/ads.ts`). A missing token is not an error and blocks nothing. Google's current developer-token page says the header is "optional and ignored by the API servers" ([S3]). UNVERIFIED: whether Google still issues developer tokens to new users, because the page does not say.

### 1.5 Approvals and the approval gate in the suite

- The default profile is `readonly`. Write tools are not registered for that profile. Source: `docs/SURFACES.md`, the login and profile notes.
- Write and destructive tools ask for confirmation first, unless the confirmation option is off. A destructive call shows the confirmation twice. Source: `docs/CAPABILITIES.md`, safety classes.
- In the gads server, a Google Ads mutate call is classed as read when `validateOnly` is set, destructive when any operation removes, and write otherwise. Source: `docs/CAPABILITIES.md`. UNVERIFIED: whether a `validateOnly` mutate counts against the daily operation quota, because [S2] does not say.

### 1.6 Cost saving that applies across the suite

- Start on the `readonly` profile, and test on test accounts or sandbox projects first. The Google Ads Test access level allows 15,000 operations per day against test accounts, and no cost is stated for it [S1].
- Use page tokens rather than new searches. Google Ads and SA360 do not charge a paged request with a valid token [S2], [S8].
- Check the Cloud Console Quotas page for each project before a large job. Every product page above points there for live values.
- Plan for slow increases. Ad Exchange Buyer quota requests may take up to one week [S12]. Business Profile increase requests are reviewed by the team and may be denied [S19].

---

## 2. Advertising and publisher APIs (gads)

### 2.1 Google Ads API (core)

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | A Google Ads account and a Google Cloud project are needed. The access-level page states no cost for any level. A non-compliance fee can apply to a tool that fails RMF: a minimum of US$1,000 and a maximum of US$25,000 per billing period, at 1 USD for every 25,000 operations (or the search-request equivalent, whichever is greater), capped at US$50,000 per review cycle. UNVERIFIED: which access level the fee applies to, because the fee page does not name one. | [S1], [S4] |
| 2. Quotas and access levels | Test: 15,000 operations per day, test accounts only. Explorer: 2,880 operations per day on production accounts, 15,000 on test accounts. Basic: 15,000 operations per day on test and production accounts. Standard: unlimited operations per day on test and production accounts. Per-second and per-minute rules: Planning Service 1 QPS; KeywordPlanIdeaService GenerateKeywordIdeas, GenerateKeywordHistoricalMetrics and GenerateKeywordForecastMetrics 1 request per second per CID; GenerateAdGroupThemes 2 per second per CID; AudienceInsightsService GenerateAudienceCompositionInsights and GenerateSuggestedTargetingInsights about 200 per day per CID; GenerateTargetingSuggestionMetrics 2 per second per Google Cloud project. UNVERIFIED: reset time and timezone, and concurrency limit, because the page states neither. Access-level page: https://developers.google.com/google-ads/api/docs/access-levels | [S1], [S2] |
| 3. Expensive operations | Each Search or SearchStream request costs one operation. A SearchStream request counts as one operation however many batches it returns. Each individual mutate operation counts. Other requests, such as UploadClickConversions, cost one operation. A paged request with a valid token is not charged. A request with an expired or invalid token is charged. A request that returns a GoogleAdsFailure is charged. | [S2] |
| 4. Approvals and restrictions | Developer tokens: "We sunset developer tokens on September 9, 2026." Existing tokens still work, and the header is optional and ignored. New access is requested in the Cloud Console Google Ads API Overview page, not the API Center. Access levels attach to the Cloud project. Test access: a Test project calling a production account returns CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION (from v25). Explorer: may be offered after the initial sign-up, and may be granted automatically. Explorer excludes account creation, user management, Keyword Plan, Audience Insights, Reach Plan, billing and payment. Basic: brand verification of the Cloud project is required for a new application. Review is automated and takes minutes, but some brand-verified projects were rejected because their billing was on a free trial or suspended. Standard: a manual audit of the tool's functionality and audience, demo sign-in for external users, and the Required Minimum Functionality. The page lists a review time of "10 business days" next to the Standard row, but the flattened table does not clearly tie it to that row, so it is UNVERIFIED. A manager (MCC) account is not required, only for managing several accounts. UNVERIFIED: the date the access moved to the Cloud Console. A third-party source says September 10, not September 9. Pending Basic applications filed in the API Center before September 9 were closed and must be resubmitted. | [S3], [S1] |
| 5. Size and count limits | Maximum 10,000 mutate operations per mutate request (error TOO_MANY_MUTATE_OPERATIONS). Billing and account budget services: 1 operation per mutate request. Click and call conversion uploads: 2,000 per request. Conversion adjustments: 2,000 per request. Up to 20 identifiers per UserData object. Synchronous user data uploads: 10 operations and 100 identifiers per request. Offline user data jobs: 100,000 identifiers per AddOfflineUserDataJobOperationsRequest. Maximum 20,000 items in a GAQL IN clause. gRPC response limit 64 MB. UNVERIFIED: maximum rows per page, because the page does not state it. | [S2] |
| 6. At the limit, and what the tool shows | Over the daily limit the request fails with RESOURCE_EXHAUSTED. The page gives no HTTP code for this error, so the code is UNVERIFIED. The suite shows the text described in section 1.4, with the error reason when Google sends one. The suite retries rate-limit and unavailable responses up to 3 attempts in total, with backoff; after that the error reaches Claude. | [S2], src/core/tools.ts |
| 7. Cost-saving advice | Use SearchStream for large result sets: one streamed request is one operation. Batch mutates to reduce request count, but know that each mutate operation still counts toward the daily total [S2]. Reuse page tokens, and do not restart a query with an expired token, because that is charged. Stay on Test or Explorer while developing if the tool does not need Keyword Plan, billing or account creation. Keep keyword planning calls under 1 per second per CID. | [S2], [S1] |

### 2.2 Display & Video 360 API (v1)

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | DV360 access is needed, and the user needs an Admin, Standard or Read-only user profile for the partners or advertisers. Access is usually granted by an existing DV360 Admin. If the organization has no DV360 access, the page says to contact sales. UNVERIFIED: cost, because the overview page makes no statement about it. | [S6] |
| 2. Quotas | Project default, shared by all resources and methods: 1,500 total requests per minute and 700 write requests per minute. Per advertiser per project, for calls with an advertiser ID in the path: 300 total and 150 write requests per minute. The page's last update is 2026-03-23. | [S5] |
| 3. Expensive operations | Write methods (create, patch, delete, bulkEdit) count against the write quota. Some write-intensive methods count as five write queries each. | [S5] |
| 4. Approvals and restrictions | No approval step is stated for the API. The page states: "Increases cannot be requested for Display & Video 360 API quota limits." This is different from the Bid Manager API, which allows increase requests. | [S5], [S6] |
| 5. Size and count limits | UNVERIFIED: no size or count limits are stated on the pages read. | [S5], [S6] |
| 6. At the limit, and what the tool shows | Over-limit calls get HTTP 429 RESOURCE_EXHAUSTED. The page advises checking "Examine your usage" in the Cloud Console and spreading requests across advertisers or slowing down. The suite shows the HTTP status and Google's message. | [S5] |
| 7. Cost-saving advice | Spread calls across advertisers, because the per-advertiser caps are separate from the project cap. Avoid write-heavy methods where a read will do. Slow the request rate when you see 429. | [S5] |

### 2.3 Bid Manager API (Display & Video 360 reporting)

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | UNVERIFIED: cost, because the page makes no statement about it. A Google Cloud project is needed. | [S7] |
| 2. Quotas | 2,000 requests per project per day. Rate: 4 queries per second per project. The Console labels this "Queries per minute per user", and it is set to 240. Daily quotas refresh at midnight PST. The page's last update is 2026-06-30. | [S7] |
| 3. Expensive operations | No per-report limit. The page says the default limits are shared by all Bid Manager API resources and methods. | [S7] |
| 4. Approvals and restrictions | Increase requests are allowed only for projects that have hit dailyLimitExceeded. Check the Metrics page first, then use "Apply for higher quota" on the Quotas page. | [S7] |
| 5. Size and count limits | UNVERIFIED: none stated on the page. | [S7] |
| 6. At the limit, and what the tool shows | 403 dailyLimitExceeded: "Do not retry without fixing the problem." 403 userRateLimitExceeded: back off with exponential backoff. The suite shows HTTP 403, the reason and Google's message. | [S7] |
| 7. Cost-saving advice | Reduce request volume before asking for a daily increase. Use exponential backoff for user rate errors. | [S7] |

### 2.4 Search Ads 360 Reporting API

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | No additional fees: "There are no additional fees for using the API." Usage is included in SA360 pricing. The API is not billable. The only account step is signing in to the Console with the Google account that created the credentials. UNVERIFIED: whether a Search Ads 360 account type is required, because the pages do not say. | [S9], [S8] |
| 2. Quotas | 150,000 queries per day per project. 3,000 queries per minute per project. 3,000 queries per minute per project per user. The page's last update is 2026-10-14. | [S8] |
| 3. Expensive operations | None beyond the rule that each query or report counts as one operation, however many results it streams or pages. A query returning 53 ad groups counts once. | [S8] |
| 4. Approvals and restrictions | None stated for the Reporting API. The previous Reporting API has been decommissioned. UNVERIFIED: how to request a quota increase, because the page does not describe the process. | [S8], [S9] |
| 5. Size and count limits | Responses over the 4 MB gRPC limit return a 429 Resource Exhausted gRPC error. | [S8] |
| 6. At the limit, and what the tool shows | Requests over the limit fail with RESOURCE_EXHAUSTED. The suite shows the text described in section 1.4. | [S8] |
| 7. Cost-saving advice | Each query counts as one operation, so one large streamed query costs the same as one small query. Keep results under the 4 MB limit by narrowing fields and date ranges. Page with a valid token, which is free. | [S8] |

### 2.5 Campaign Manager 360 API

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | You need a Campaign Manager 360 account, with API access enabled on it (usually on), and a user profile with access to that account. There are no separate API permissions. The enabling steps say "If prompted, enable billing." UNVERIFIED: whether any API charge applies, because the page makes no pricing statement. | [S11] |
| 2. Quotas | 50,000 requests per project per day, which can be raised on request. 1 query per second per project. Per user: 60 queries per minute by default, up to 600 per minute (10 QPS). Daily quotas refresh at midnight PST. Increase: only for projects that hit dailyLimitExceeded. Check the Metrics page, then use "Apply for higher quota" from the Queries per day row on the Quotas page. The page's last update is 2026-02-25. | [S10] |
| 3. Expensive operations | Report-related limits vary by account and are set by Report Builder. UNVERIFIED: the number of ad hoc reports per account per day. A forum post quotes "5,000 reports per day" for one account, but that is not an official figure. UNVERIFIED: a third-party claim of 120 requests per minute and 10,000 per day for a synchronous reportData.query endpoint; it does not appear on the official quota page. | [S10] |
| 4. Approvals and restrictions | No formal approval step is stated. OAuth clients and service accounts are both described. The page advises against concurrent write requests. | [S11], [S10] |
| 5. Size and count limits | UNVERIFIED: none stated on the pages read. | [S10], [S11] |
| 6. At the limit, and what the tool shows | 403 dailyLimitExceeded: do not retry until the problem is fixed. 403 userRateLimitExceeded: raise the per-user limit in the Console or back off. 403 quotaExceeded (several variants) for per-account or per-user-profile report limits, for example "This account has exceeded its quota of x reports per day." The suite shows HTTP 403, the reason and Google's message. | [S10] |
| 7. Cost-saving advice | Stay under 10 QPS and avoid concurrent writes. Schedule report runs so that the per-account report limit is not reached. Back off on userRateLimitExceeded. | [S10] |

### 2.6 Ad Exchange Buyer API

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | An Authorized Buyers account is needed, and the service account must be added as an account user in the Authorized Buyers UI. UNVERIFIED: cost, because the page makes no statement about it. The page dates from 2024-09-18. | [S12], [S14] |
| 2. Quotas | Courtesy limit: 1,000 queries per project per day. The page also lists a "queries per 100 seconds per user" quota, but gives no value for it. UNVERIFIED: the per-100-seconds value. | [S12] |
| 3. Expensive operations | UNVERIFIED: none stated on the page. | [S12] |
| 4. Approvals and restrictions | Higher quota is requested through a quota request form in the Quotas tab. The page says "It may take up to one week to receive a response." | [S12] |
| 5. Size and count limits | UNVERIFIED: none stated. | [S12] |
| 6. At the limit, and what the tool shows | UNVERIFIED: the error code and text returned when the courtesy limit is hit. The suite shows whatever Google returns. | [S12] |
| 7. Cost-saving advice | Ask for more quota early, because the answer can take a week. Keep daily queries under 1,000 until the request is granted. | [S12] |

### 2.7 Real-time Bidding API (Authorized Buyers)

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | An Authorized Buyers account is needed. The service account must be granted access in the Authorized Buyers UI. The Real-time Bidding API must be enabled in the Google Cloud project. The page says to read the RTB protocol documentation if the application will bid in real time. UNVERIFIED: cost, because the page makes no statement about it. | [S14] |
| 2. Quotas | Callout quota is set per bidder server URL and per trading location, by a Technical Account Manager or through the Authorized Buyers API. The total for all of an account's URLs cannot exceed the total the TAM set internally. Effective quota is the lower of the configured quota and the spend-based quota. The spend-based figure is shown on the RTB Graphs dashboard. UNVERIFIED: the default callout QPS, because the page gives no default number. | [S13] |
| 3. Expensive operations | UNVERIFIED: the "1.5 creatives per dollar of daily spend" figure that appears in a search snippet. The fetched callout quota page does not mention creative limits, so the figure is not confirmed. | [S13] |
| 4. Approvals and restrictions | The page states no approval or account requirement beyond the Authorized Buyers UI access above. | [S13], [S14] |
| 5. Size and count limits | UNVERIFIED: none stated. | [S13] |
| 6. At the limit, and what the tool shows | The page refers to "error throttling" when the effective quota is exceeded. UNVERIFIED: the exact error code. | [S13] |
| 7. Cost-saving advice | Check the spend-based quota on RTB Graphs before raising the configured callout QPS. Keep the configured quota close to the spend-based one, because the lower value is what applies. | [S13] |

### 2.8 AdSense Management API

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | An AdSense account is required. The page states no cost. UNVERIFIED: whether the API is free. UNVERIFIED: whether service accounts are supported, because the page does not mention them. A third-party source says they are not, so treat that as unconfirmed. | [S16] |
| 2. Quotas | Per project per day: 10,000 queries, resetting around midnight Pacific time. Per minute, one user on one project: 100. Per minute, all users on one project: 500. Over these limits the API returns HTTP 429. The page's last update is 2025-08-28. | [S15] |
| 3. Expensive operations | Report rows: the page gives no exact figure for the report row quota, which covers "the total amount of reporting data that may be retrieved over daily and shorter periods". UNVERIFIED: the figure and the shorter periods. | [S15] |
| 4. Approvals and restrictions | No approval step is stated. UNVERIFIED: the quota increase process, because the page only points to the Console Quotas page and a Stack Overflow tag. | [S15] |
| 5. Size and count limits | JSON reports are capped at 100,000 rows. Larger JSON reports are truncated, and the response includes a totalMatchedRows field. CSV reports are capped at 1,000,000 rows. A page_size or limit above the maximum returns HTTP 400. | [S15] |
| 6. At the limit, and what the tool shows | HTTP 429 with the message "Report row quota exceeded" or the name of the quota that was exceeded. The suite shows the status and message. | [S15] |
| 7. Cost-saving advice | Use CSV for reports over 100,000 rows, because JSON is truncated at that size. Keep to 100 requests per minute per user. | [S15] |

### 2.9 AdMob API

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | An AdMob account is required. OAuth2 is required for every call. The prerequisites list no approval step. UNVERIFIED: cost, because the page makes no statement about it. | [S18] |
| 2. Quotas (per project) | Account reads: 900 per minute. Inventory reads: 120 per minute and 172,800 per day. Reporting reads: 900 per minute. The quotas apply separately to account, inventory and reporting methods. The page's last update is 2026-10-05. UNVERIFIED: inventory write quota (the page does not list it; a forum thread mentions 600 per minute, which is not official). UNVERIFIED: per-day limits for account and reporting reads, which the page does not list. | [S17] |
| 3. Expensive operations | Large row counts are the cost driver. The page advises requesting fewer rows, narrowing the date range and reducing dimensions. | [S17] |
| 4. Approvals and restrictions | Higher quota is requested by reaching out on the AdMob API Developer Forum with a use case. No form is named. | [S17] |
| 5. Size and count limits | UNVERIFIED: none stated on the page. | [S17] |
| 6. At the limit, and what the tool shows | 429 RESOURCE_EXHAUSTED. The page advises client-side rate limiting. UNVERIFIED: a per-user reporting limit that one error sample refers to, because it is not on the quota page. | [S17] |
| 7. Cost-saving advice | Rate-limit client calls on the client side. Request fewer rows per call. | [S17] |

---

## 3. Business Profile APIs (gbusiness)

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | A verified and active Business Profile listing, held for 60+ days, is needed. The listing can belong to you or to a client you manage. A website representing the business is needed. A Google Cloud project and a Google account are needed. The email address used on the request must be an owner or manager on the listing, and the website domain must match that email domain. UNVERIFIED: cost, because the prerequisites page makes no statement about it. | [S20], [S19] |
| 2. Quotas | 300 requests per minute for Business Information general requests, Account Management, Performance, Verifications, Lodging, Place Actions and Notifications. Business Information: Create Location 300 per day; SearchGoogleLocation 300 per day; Update Location 10,000 per day. Business Information edits: 10 per minute per profile, and this cannot be increased. The page's last update is 2026-08-28. | [S19] |
| 3. Expensive operations | Edits to a Business Information profile: 10 per minute per profile, not increasable. | [S19] |
| 4. Approvals and restrictions | Access requires an application: choose "Application for Basic API Access" in the GBP API contact form. A follow-up email is sent after review. A project with a quota of 0 has not been approved. Do not request an increase while the quota is 0. UNVERIFIED: review time. One third-party source says 14 days and another says a few days to a few weeks; neither is on the official page. Increases use the "Quota Increase Request" option in the support page, with company name, contact email and project number. Requests are typically denied when usage does not consistently approach the QPM limit, averages below 50% of it, or is spiky. | [S20], [S19] |
| 5. Size and count limits | UNVERIFIED: none stated on the pages read. | [S19] |
| 6. At the limit, and what the tool shows | The quota is exceeded with an HTTP 429 Too Many Requests response, or RESOURCE_EXHAUSTED for gRPC. UNVERIFIED: this came from a search snippet and was not confirmed in the fetched text. The suite shows the status and Google's message. | [S19] |
| 7. Cost-saving advice | Pace requests and use exponential backoff with jitter before asking for more quota. Check the request pattern in the Console first, because bursts are the usual cause of denial. | [S19] |

Project note, not checked against Google: docs/SURFACES.md says the Business Profile Q&A API (mybusinessqanda) appears retired and is not in the catalog.

---

## 4. Google Analytics (ganalytics)

### 4.1 Google Analytics Data API (GA4)

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | A GA4 property ID is needed. The API is not compatible with legacy Universal Analytics properties. Authentication uses Application Default Credentials or OAuth, with an x-goog-user-project header. UNVERIFIED: cost, because the page does not say whether the API is free. | [S22] |
| 2. Quotas (per property unless noted; Standard / Analytics 360) | Core tokens per property per day: 200,000 / 2,000,000. Core tokens per property per hour: 40,000 / 400,000. Core tokens per project per property per hour: 14,000 / 140,000. Concurrent requests per property: 10 / 50. Server errors per project per property per hour: 10 / 50. Potentially thresholded requests per hour: 120. Realtime and Funnel share the Core figures. Chat: 3,750,000 per day and 500,000 per hour for both tiers. The page's last update is 2026-10-13. | [S21] |
| 3. Expensive operations | The token cost is set at execution. Cost rises with the row count, the number of dimensions and metrics, the filter complexity, the length of the date range, the number of unique dimension values and the property's event volume. The page gives no formula, and suggests reading the quota details from the response. | [S21] |
| 4. Approvals and restrictions | No approval step is stated. Some methods are labelled "Early preview", but the page gives no access requirements for them. | [S22] |
| 5. Size and count limits | UNVERIFIED: row and size limits, because the page does not state them. | [S21] |
| 6. At the limit, and what the tool shows | UNVERIFIED: the error code returned when a token or concurrency limit is hit. The suite shows the status and Google's message. | [S21] |
| 7. Cost-saving advice | Fewer dimensions and metrics, shorter date ranges and simpler filters all cut the token cost. Read the quota details in each response to see the real cost. | [S21] |

### 4.2 Google Analytics Admin API

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | UNVERIFIED: cost, because the page does not say. A Google Analytics account and a property are needed. | [S23] |
| 2. Quotas | Requests per minute: 1,200. Requests per minute per user: 600. Writes per minute: 600. Writes per minute per user: 180. User deletions per day per property: 500. Every Admin API call counts against both request quotas, and calls that change configuration also count against both write quotas. UNVERIFIED: whether the 1,200 per minute figure is per project, because the page does not say. The page's last update is 2026-10-13. | [S23] |
| 3. Expensive operations | Configuration writes count against both the request and write quotas. | [S23] |
| 4. Approvals and restrictions | The page says quota limits might be throttled for projects that violate the Google Analytics Terms of Service. No approval step is stated. | [S23] |
| 5. Size and count limits | User deletions: 500 per day per property. | [S23] |
| 6. At the limit, and what the tool shows | UNVERIFIED: the error code. The page does not mention RESOURCE_EXHAUSTED or HTTP 429. | [S23] |
| 7. Cost-saving advice | Batch configuration reads where possible. Keep writes under 180 per minute per user. | [S23] |

---

## 5. Tag Manager API (gtm)

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | The application must be registered in the Google API Console to receive any quota. UNVERIFIED: whether a Tag Manager account is required, and cost, because the page says nothing about either. | [S24] |
| 2. Quotas | 10,000 requests per project per day. 0.25 queries per second per project, enforced on a 100-second sliding window (25 requests per 100 seconds). Daily quotas refresh at midnight PST. A project-level 0.25 QPS cap still applies even if a higher per-user limit is set. The page's last update is 2026-07-16. | [S24] |
| 3. Expensive operations | UNVERIFIED: per-method costs. The page does not list them. | [S24] |
| 4. Approvals and restrictions | Register the application in the Console. Increases are requested through the Console. The page says its policies "are subject to change." | [S24] |
| 5. Size and count limits | UNVERIFIED: workspace, container, tag, trigger and variable counts, publishing limits and version limits. None of these are on the page. | [S24] |
| 6. At the limit, and what the tool shows | Requests over the quota get HTTP 403 Forbidden. The suite shows HTTP 403 and Google's message. | [S24] |
| 7. Cost-saving advice | At 0.25 QPS, a large sync takes time. Spread work across the day within the 10,000 daily requests, and avoid repeated list calls by caching container metadata within a session. | [S24] |

---

## 6. YouTube (gyoutube)

### 6.1 YouTube Data API v3

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | A Google account and a Google Cloud project are needed, with an API key or OAuth credentials. Insert, update and delete operations always require user authorization. UNVERIFIED: any money cost, because the pages say nothing about price, only about quota units. | [S27] |
| 2. Quotas | Default: 10,000 units per day combined for all endpoints other than the two below. search.list: 100 calls per day, and videos.insert: 100 calls per day, each in its own bucket. Read calls usually cost 1 unit and modifying calls often cost 50. Every request costs at least one point. Additional quota is requested with the Quota extension request form. UNVERIFIED: the daily reset time, because the pages read do not state it. | [S27], [S25] |
| 3. Expensive operations | Unit costs from the page's table: 1 unit for list methods (videos.list, channels.list, playlistItems.list, commentThreads.list, activities.list and others). 50 units for videos.update, videos.delete, thumbnails.set, playlistItems insert, update and delete, playlists insert, update and delete, subscriptions insert and delete, commentThreads insert and update, captions.list and captions.delete. 20 units for liveChatMessages insert, delete and transition. 200 units for liveChatBans and liveChatModerators insert and delete. 400 units for captions.insert. 450 units for captions.update. UNVERIFIED: search.list unit cost. The table says 1 unit per call, but the default-quota text says the separate 100-call-per-day cap applies, and a third-party source says 100 units. UNVERIFIED: videos.insert unit cost. The table says 1 unit per call, while the page summary says videos.insert costs 1,600 points. UNVERIFIED: captions.download cost, because the table does not list it. | [S25], [S27] |
| 4. Approvals and restrictions | Quota above the default needs a compliance audit first: "you must first complete an audit to show that your project is in compliance". The audit and quota extension use one form, the YouTube API Services Audit and Quota Extension Form. A YouTube API Services team member contacts the applicant. An audit completed in the last 12 months is noted on the page. A failed audit can be appealed through an Appeals Form. The page defines no approval criteria beyond Terms of Service compliance. | [S26] |
| 5. Size and count limits | UNVERIFIED: none stated on the pages read. | [S25], [S27] |
| 6. At the limit, and what the tool shows | UNVERIFIED: the error code for exceeding the daily units or the 100-per-day caps. A third-party source says HTTP 403 quotaExceeded, which the official pages read did not confirm. The suite shows the status and Google's message. | [S27] |
| 7. Cost-saving advice | Prefer 1-unit list calls with filters. Use search.list sparingly, because its unit cost is UNVERIFIED and it has a 100-per-day cap. Apply for the audit only when you need more than 10,000 units per day. | [S25], [S27] |

### 6.2 YouTube Analytics API

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | UNVERIFIED: cost, because the page makes no statement about it. | [S28] |
| 2. Quotas | UNVERIFIED: daily quota units and per-minute limits. The official page does not list them. It says "The API server evaluates each query to determine its quota cost." Third-party sources give 10,000 units per day, but one says it is metered separately and another gives no figure, so none is confirmed. | [S28] |
| 3. Expensive operations | The page's example, a channel's most-viewed-videos report, returns at most 200 rows. Other reports have their own row caps, which the page does not list. | [S28] |
| 4. Approvals and restrictions | None stated on the page. | [S28] |
| 5. Size and count limits | Reports can be capped at a fixed number of rows (example: 200 rows). | [S28] |
| 6. At the limit, and what the tool shows | UNVERIFIED: the error code. | [S28] |
| 7. Cost-saving advice | The page says the Reporting API avoids quota use for filtering, sorting and querying, because the data is retrieved once and then processed in the application. | [S28] |

### 6.3 YouTube Reporting API

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | UNVERIFIED: cost, because the page has no pricing or cost information. | [S29] |
| 2. Quotas | UNVERIFIED: report jobs per channel or content owner, and daily download limits. The page gives neither. Reports are "updated daily." | [S29] |
| 3. Expensive operations | UNVERIFIED: none stated. | [S29] |
| 4. Approvals and restrictions | None stated. | [S29] |
| 5. Size and count limits | API reports are available for 60 days from the time they are generated. Reports with historical data are available for 30 days. | [S29] |
| 6. At the limit, and what the tool shows | UNVERIFIED: the error code. Quota units are not mentioned on the page. | [S29] |
| 7. Cost-saving advice | Download each report once and keep it, because it expires after 60 days. | [S29] |

---

## 7. Merchant Center (gmerchant)

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | A production Merchant Center account is needed. Test accounts cannot register. The Merchant Center account must have a verified website. The identity making the registration call needs ADMIN access to that account. The developer contact must be a Google account email, not a service account. Agencies register only their primary account. UNVERIFIED: any money cost, because the overview page does not say whether the Merchant API is free or paid. | [S32], [S31] |
| 2. Quotas | No default number is stated on the quota page. The limits "vary significantly between different quota groups" and are read with the quotas.list method, at POST https://merchantapi.googleapis.com/quota/v1/accounts/{ACCOUNT_ID}/quotas. Daily limits reset at 12:00 PM midday UTC. Per-minute limits use a rolling window that starts at the first call for that method and resource. Quota is tracked per Merchant Center account and per credential, not per Google Cloud project. UNVERIFIED: the default per-minute and daily values. The quota page's example response shows quotaLimit "1000" and quotaMinuteLimit "10", but the page labels them as an example only. Products, sub-accounts and sub-account data sources can be updated up to twice per day. The page's last update is 2026-09-24. | [S30] |
| 3. Expensive operations | Each method call counts once, so a list returning 250 items is one charge. Calls inside an HTTP batch are counted individually. Region batch methods (batchCreate, batchUpdate, batchDelete) count as one call against merchant_regions. | [S30] |
| 4. Approvals and restrictions | Registration is a one-time step per Google Cloud project (registerGcp). A new developer contact must accept the invitation within 14 days. Quota increases: use the contact support form and select the quota increase option. Only temporary increases are accepted for products, accounts and advanced-account data sources, for cases such as a new market launch. Increases are not guaranteed. | [S32], [S30] |
| 5. Size and count limits | Merchant Center limits such as too_many_items and too_many_subaccounts are separate from the Merchant API quotas. | [S30] |
| 6. At the limit, and what the tool shows | Per-minute overage: HTTP 429 with quota/request_rate_too_high. Daily overage: HTTP 429 with quota/daily_limit_exceeded. The suite shows the status, the reason and Google's message. | [S30] |
| 7. Cost-saving advice | Call quotas.list first to read the real limits for your account. Batch writes where the method allows it. Do not update the same products more than twice per day. Note that quota is per Merchant Center account, so an advanced account's calls draw on its own pool. | [S30] |

---

## 8. Google Play (gplay)

### 8.1 Google Play Developer API (publishing, monetization, reporting)

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | A Google Play Console developer account is needed. Registration costs US$25, charged once. Accounts are Personal or Organization. Sign-up requires being at least 18. Personal accounts created after November 13, 2023 must meet testing requirements, and new personal accounts must verify access to an Android device through the Play Console app before publishing. Identity verification is required at setup. UNVERIFIED: any money cost for the API itself, because the API page makes no statement about cost. | [S36], [S35] |
| 2. Quotas | Publishing APIs: default 3,000 queries per minute per bucket, and each bucket's quota is independent of the others. Publishing, Monetization and Reply to Reviews APIs share one bucket. Other buckets: Subscriptions, Subscription Updates, One-time Purchases, Orders and ExternalTransactions. Reporting API: default 10 queries per second. UNVERIFIED: per-day and per-project limits, and reset time, because the publishing page gives only per-minute bucket limits. The publishing page's last update is 2026-04-29. The reporting page's last update is 2023-12-05, so its figure may be out of date. | [S33], [S34] |
| 3. Expensive operations | UNVERIFIED: none stated on the pages read. | [S33], [S34] |
| 4. Approvals and restrictions | Setup: create or reuse a Google Cloud project, enable the Google Play Developer API in it, then grant a service account rights in Play Console's Users and Permissions page. The page says "You no longer need to link your developer account to a Google Cloud Project." Billing APIs need specific permissions (view financial data, orders and cancellation survey responses; manage orders and subscriptions). Increases: submit a quota request for the Google Play Developer API from the Cloud Console Quotas section, or through the Play quota request form for the Reporting API. | [S35], [S33], [S34] |
| 5. Size and count limits | UNVERIFIED: none stated on the pages read. | [S33], [S34] |
| 6. At the limit, and what the tool shows | UNVERIFIED: the error code for exceeding the per-minute bucket. The suite shows the status and Google's message. | [S33] |
| 7. Cost-saving advice | Each bucket has its own 3,000-per-minute quota, so call different API groups in separate buckets rather than all through one. Check the Cloud Console for usage. | [S33] |

### 8.2 Google Play Games Services

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | A Google Play Developer account set up in Play Console, with permission to manage Play Games Services, is required. A Google Cloud project is required, and the games.googleapis.com API must be enabled. UNVERIFIED: cost, because the setup page does not say whether the APIs are free. | [S38] |
| 2. Quotas | UNVERIFIED: no numeric default is published on the pages read. The page says the daily quota can be reviewed in the Google Cloud Console. The per-user rate limit is set by the developer, as a maximum number of calls per second per user. | [S37] |
| 3. Expensive operations | UNVERIFIED: none stated. | [S37] |
| 4. Approvals and restrictions | "Requests to increase the games quota usually aren't accepted unless your game is experiencing exceptional usage and is obeying the best practices in the quality checklist." | [S37] |
| 5. Size and count limits | Not applicable on the page. | [S37] |
| 6. At the limit, and what the tool shows | On Android, calls that return PendingResult objects return NETWORK_ERROR_OPERATION_FAILED in the result, and the library retries later. UNVERIFIED: what the suite shows, because this behaviour is described for the client library and not the REST API. | [S37] |
| 7. Cost-saving advice | Set a per-user call limit so that one abusive player cannot use the whole quota. | [S37] |

### 8.3 Android Management API (Android Enterprise)

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | Only commercial EMM developers, Device Trust providers and OEMs may use it, and they need a direct agreement with their end customers. Access is requested through the form at goo.gle/android-enterprise-response. UNVERIFIED: cost. The page has no pricing statement. A third-party source says Google does not charge per device, but that is not official. | [S39] |
| 2. Quotas | Default per project: 1,000 queries per 100 seconds. Per resource: 60 queries per minute. The per-resource limit is reached when more than 60 requests in one minute hit the same combination of API action, EMM ID, Enterprise ID, and Policy ID or Device ID. Maximum 2 projects per developer. The page's last update is 2026-03-30. | [S39] |
| 3. Expensive operations | Repeated calls for the same policy or device count toward the 60-per-minute per-resource limit. | [S39] |
| 4. Approvals and restrictions | An initial quota of up to 500 devices needs a full business justification. Beyond 500, apply to Android Enterprise through the form. The form also handles a quota increase or removal of restrictions. UNVERIFIED: the default device quota. A third-party source says new projects get 0 devices by default, which the official page does not confirm. | [S39] |
| 5. Size and count limits | Initial device quota of up to 500 devices, requestable. | [S39] |
| 6. At the limit, and what the tool shows | UNVERIFIED: the error code. | [S39] |
| 7. Cost-saving advice | Batch device and policy calls, and spread calls for the same policy or device across the minute. | [S39] |

---

## 9. Firebase (gfirebase)

### 9.1 Spark and Blaze plans

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | Spark is the no-cost plan, with "no payment method needed". Blaze is usage-based, keeps the Spark allowances, and gives new users $300 of free credit. Blaze overage is billed at Google Cloud rates (stated for Firestore). | [S40] |
| 2. Quotas (Spark allowances, examples) | Firestore Standard: 1 GiB stored, 10 GiB a month egress, 20,000 writes, 50,000 reads and 20,000 deletes per day. Hosting: 10 GB storage and 360 MB per day transfer. Test Lab: 10 virtual and 5 physical device tests per day, and 30 streaming minutes per month. Authentication: 50,000 monthly active users, and 50 for SAML or OIDC. Phone authentication is not on Spark. Quotas are project-level. | [S40] |
| 3. Expensive operations | Test Lab on Blaze is billed for testing time, rounded up to the nearest minute. Data Connect on Spark is a three-month trial only, and the instance is archived if the project does not upgrade. | [S40] |
| 4. Approvals and restrictions | Blaze-only products, as the pricing page shows them: Cloud Functions, Cloud Storage, App Hosting, Phone authentication (SMS) and phone number verification, more than one Realtime Database per project, and other infrastructure in the project. The page has no single list, so the list is inferred from unavailable entries. App Check is no-cost on Spark, subject to limits that vary by attestation provider. | [S40] |
| 5. Size and count limits | Hosting: 10 GB storage on Spark. Authentication: 50,000 MAUs on Spark. | [S40] |
| 6. At the limit, and what the tool shows | UNVERIFIED: what happens on Spark when an allowance is used up. The pricing page does not say, beyond the per-product notes. | [S40] |
| 7. Cost-saving advice | If the project does not need Cloud Functions, Cloud Storage or SMS authentication, Spark covers Crashlytics, App Distribution and FCM with no billing account. | [S40] |

### 9.2 Firebase Cloud Messaging (FCM) send limits

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | FCM is listed as no-cost on Spark. | [S40] |
| 2. Quotas | Project-wide downstream quota (HTTP v1): 600,000 messages per minute per project, counted per message, not per request. The minute windows do not line up with the clock. Android per device: 240 messages per minute and 5,000 per hour, both caps applying. iOS: no fixed number, because FCM follows APNs limits. Collapsible messages: 20 per app per device, with one slot freed every three minutes. Topics: subscription changes 3,000 queries per second per project; 1,000 concurrent fanouts per project, not adjustable; up to 2,000 topics per app instance; batch subscription up to 1,000 app instances per request. The page's last update is 2026-10-13. | [S43], [S44] |
| 3. Expensive operations | UNVERIFIED: whether a topic send counts once or once per subscribed device against the 600,000 quota. The pages do not say. | [S43], [S44] |
| 4. Approvals and restrictions | None stated. UNVERIFIED: a quota increase process, because the page does not describe one. | [S43] |
| 5. Size and count limits | Topics per app instance: 2,000. Instances per batch: 1,000. | [S44] |
| 6. At the limit, and what the tool shows | Over quota: HTTP 429 RESOURCE_EXHAUSTED with reason QUOTA_EXCEEDED. The quota refills in the following minute. 429 can also come during overload. The suite shows the status, reason and message. | [S43] |
| 7. Cost-saving advice | Keep bursts to a single Android device under 240 messages per minute. Use topic messages for fan-out, subject to the fanout limit. | [S43], [S44] |

### 9.3 Crashlytics and App Distribution

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | Crashlytics and App Distribution are listed as no-cost on Spark. | [S40] |
| 2. Crashlytics quotas | Custom keys: a maximum of 64 key-value pairs, each up to 1 kB. Logs: capped at 64 kB per session, with older entries deleted when the cap is passed. Recorded exceptions: only the eight most recent are stored. UNVERIFIED: the dashboard data retention period. An old blog post and a forum reply say 90 days, but neither is an official current page, and the Crashlytics limits page could not be read. | [S42] |
| 3. App Distribution quotas | 500 testers per project. 200 testers per group. Upload size: 2,048 MiB per binary. 1,000 releases per app; the oldest extra releases are deleted automatically. Releases are removed from the dashboard 150 days after upload. An invitation expires after 30 days unless accepted. UNVERIFIED: a per-day upload or download quota, because none was found. The page's last update is 2026-10-13. | [S41] |
| 4. Approvals and restrictions | A no-cost increase in the tester limit can be requested. The page describes no increase route for the other App Distribution limits. | [S41] |
| 5. Size and count limits | As in row 2 and row 3 above. | [S41], [S42] |
| 6. At the limit, and what the tool shows | UNVERIFIED: the error code. | [S41] |
| 7. Cost-saving advice | Manage releases in bulk with the App Distribution REST API, which the page recommends for release volume. | [S41] |

---

## 10. Maps Platform (gmaps)

### 10.1 Pricing model, billing and free usage

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | Pay-as-you-go per SKU, with free calls each month. Since March 1, 2025, the US$200 monthly credit has been replaced with free monthly calls per SKU. New customers get a US$300 trial credit. Plan subscriptions: Starter US$100 a month for 50,000 calls, Essentials US$275 a month for 100,000, Pro US$1,200 a month for 250,000, and Enterprise is custom. Billing: "you must enable billing on each of your projects", and each request needs an API key or OAuth token. | [S45], [S47], [S48], [S49], [S50] |
| 2. Free monthly calls, by tier | Essentials: 10,000 free calls per SKU per month. Pro: 5,000 per SKU. Enterprise: 1,000 per SKU. Essentials Map Tiles APIs: 100,000 calls per SKU per month. The usage pages for Places, Solar, Air Quality and Pollen still refer to the US$200 credit "until February 28, 2025". That text is out of date and conflicts with the pricing page, so the pricing page is used here. | [S45], [S46] |
| 3. Expensive operations (per SKU, first price per 1,000 calls, and free cap per month) | Places Essentials: Autocomplete requests US$2.83 (10,000 free). Place Details Essentials US$5.00 (10,000 free). Place Details Essentials IDs only, Text Search Essentials IDs only, and Autocomplete session usage: unlimited, no price shown. Places Pro: Nearby Search US$32.00 (5,000 free); Text Search US$32.00 (5,000 free); Place Details US$17.00 (5,000 free). Places Enterprise: Nearby Search US$35.00 (1,000 free); Text Search US$35.00 (1,000 free); Place Details US$20.00 (1,000 free). Solar Building Insights (Essentials): US$10.00 (10,000 free). Solar Data Layers (Enterprise): US$75.00 (1,000 free). Air Quality Usage (Essentials): US$5.00 (10,000 free). Pollen Usage (Pro): US$10.00 (5,000 free). Street View: Static Street View (Essentials) US$7.00 (10,000 free); Dynamic Street View (Pro) US$14.00 (5,000 free); Map Tiles Street View tiles (Essentials) US$2.00 after 100,000 free, with the first tier running to 1,000,000 events. These are first-tier prices from the page. UNVERIFIED: the later tiers, which the page does not show. | [S46] |
| 4. Approvals and restrictions | No approval step is stated on the pages read. Billing must be enabled on each project. UNVERIFIED: whether any Solar, Pollen or Air Quality API needs an application. | [S47], [S48], [S49], [S50] |
| 5. Size and count limits | Field masks decide which SKU is billed. A Places request is billed at the highest SKU that applies to it. | [S47] |
| 6. At the limit, and what the tool shows | UNVERIFIED: the behaviour and error code when a free cap or quota is exceeded. The suite shows the status and Google's message. | [S45], [S47] |
| 7. Cost-saving advice | Ask only for the fields you need, because field masks set the billed SKU. Place Details with IDs only is unlimited. Autocomplete session usage is listed as unlimited with no price shown [S46]; confirm on the SKU page before relying on it. | [S46], [S47] |

### 10.2 Street View Publish API

| Heading | Finding | Source |
|---|---|---|
| 1. Cost and account | "All use of Google Street View Publish API is free of charge." The page states no billing or account requirement. The page was last updated 2025-08-28. | [S51] |
| 2. Quotas | UNVERIFIED: the quota numbers. The page links to a Usage Limits page, which was not read. | [S51] |
| 3. Expensive operations | None stated, because the pricing page charges nothing. | [S51] |
| 4. Approvals and restrictions | UNVERIFIED: any approval or access step, because the page states none. | [S51] |
| 5. Size and count limits | UNVERIFIED: none stated on the pages read. | [S51] |
| 6. At the limit, and what the tool shows | UNVERIFIED: the error code and behaviour. | [S51] |
| 7. Cost-saving advice | UNVERIFIED: no advice can be given from numbers, because none were read. | [S51] |

---

## 11. Sources

Each source was checked on 2026-10-16. The date after each title is the one the page displayed.

- [S1] Google Ads API access levels. https://developers.google.com/google-ads/api/docs/access-levels (last updated 2026-10-14)
- [S2] Google Ads API limits and quotas. https://developers.google.com/google-ads/api/docs/best-practices/quotas (last updated 2026-10-14)
- [S3] Google Ads API developer token. https://developers.google.com/google-ads/api/docs/api-policy/developer-token (last updated 2026-10-15)
- [S4] Google Ads API non-compliance fees. https://developers.google.com/google-ads/api/docs/api-policy/non-compliance-fee (last updated 2026-10-14)
- [S5] Display & Video 360 API limits. https://developers.google.com/display-video/api/limits (last updated 2026-03-23)
- [S6] Display & Video 360 API overview. https://developers.google.com/display-video/api/guides/getting-started/overview (last updated 2026-03-23)
- [S7] Bid Manager API quotas (Display & Video 360 reporting). https://developers.google.com/bid-manager/quotas (last updated 2026-06-30)
- [S8] Search Ads 360 Reporting API quotas. https://developers.google.com/search-ads/reporting/concepts/quotas (last updated 2026-10-14)
- [S9] Search Ads 360 pricing. https://developers.google.com/search-ads/pricing (last updated 2025-08-28)
- [S10] Campaign Manager 360 API quotas. https://developers.google.com/doubleclick-advertisers/quotas (last updated 2026-02-25)
- [S11] Campaign Manager 360 API getting started. https://developers.google.com/doubleclick-advertisers/getting_started (last updated 2026-07-16)
- [S12] Ad Exchange Buyer API usage limits. https://developers.google.com/authorized-buyers/apis/limits (last updated 2024-09-18)
- [S13] Real-time Bidding callout quota system. https://developers.google.com/authorized-buyers/rtb/callout-quota-system (last updated 2026-09-17)
- [S14] Authorized Buyers APIs, get started. https://developers.google.com/authorized-buyers/apis/guides/get-started/start (last updated 2026-06-01)
- [S15] AdSense Management API limits. https://developers.google.com/adsense/management/appendix/limits (last updated 2025-08-28)
- [S16] AdSense Management API, get started. https://developers.google.com/adsense/management/getting_started (last updated 2025-08-28)
- [S17] AdMob API quotas. https://developers.google.com/admob/api/quotas (last updated 2026-10-05)
- [S18] AdMob API, get started. https://developers.google.com/admob/api/v1/getting-started (last updated 2026-10-05)
- [S19] Business Profile APIs usage limits. https://developers.google.com/my-business/content/limits (last updated 2026-08-28)
- [S20] Business Profile APIs prerequisites. https://developers.google.com/my-business/content/prereqs (last updated 2026-08-28)
- [S21] Google Analytics Data API quotas. https://developers.google.com/analytics/devguides/reporting/data/v1/quotas (last updated 2026-10-13)
- [S22] Google Analytics Data API overview. https://developers.google.com/analytics/devguides/reporting/data/v1 (last updated 2026-10-13)
- [S23] Google Analytics Admin API limits and quotas. https://developers.google.com/analytics/devguides/config/admin/v1/quotas (last updated 2026-10-13)
- [S24] Tag Manager API v2 limits and quotas. https://developers.google.com/tag-platform/tag-manager/api/v2/limits-quotas (last updated 2026-07-16)
- [S25] YouTube Data API, determine quota cost. https://developers.google.com/youtube/v3/determine_quota_cost (last updated 2026-10-08)
- [S26] YouTube Data API, quota and compliance audits. https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits (last updated 2026-09-14)
- [S27] YouTube Data API, getting started. https://developers.google.com/youtube/v3/getting-started (last updated 2026-09-14)
- [S28] YouTube Analytics API limits. https://developers.google.com/youtube/analytics/limits (last updated 2026-09-14)
- [S29] YouTube Reporting API, reports. https://developers.google.com/youtube/reporting/v1/reports (last updated 2026-09-14)
- [S30] Merchant API quotas. https://developers.google.com/merchant/api/guides/quotas-limits/quotas (last updated 2026-09-24)
- [S31] Merchant API overview. https://developers.google.com/merchant/api/overview (last updated 2026-09-24)
- [S32] Merchant API, register as a developer. https://developers.google.com/merchant/api/guides/quickstart/registration (last updated 2026-10-14)
- [S33] Google Play Developer API quotas. https://developers.google.com/android-publisher/quotas (last updated 2026-04-29)
- [S34] Google Play Developer Reporting API usage limits. https://developers.google.com/play/developer/reporting/limits (last updated 2023-12-05)
- [S35] Google Play Developer API, getting started. https://developers.google.com/android-publisher/getting_started (last updated 2025-12-18)
- [S36] Google Play Console developer account registration fee. https://support.google.com/googleplay/android-developer/answer/6112435 (no date shown)
- [S37] Play Games Services quota and rate limits. https://developer.android.com/games/pgs/quota (last updated 2026-10-06)
- [S38] Play Games Services, Play Console setup. https://developer.android.com/games/pgs/console/setup (last updated 2026-10-07)
- [S39] Android Management API permissible usage. https://developers.google.com/android/management/permissible-usage (last updated 2026-03-30)
- [S40] Firebase pricing plans. https://firebase.google.com/pricing (no date shown; a Remote Config note says pricing takes effect 2026-09-01)
- [S41] Firebase App Distribution troubleshooting and limits. https://firebase.google.com/docs/app-distribution/troubleshooting (last updated 2026-10-13)
- [S42] Crashlytics, customize crash reports (Android). https://firebase.google.com/docs/crashlytics/android/customize-crash-reports (last updated 2026-10-13)
- [S43] FCM throttling and quotas. https://firebase.google.com/docs/cloud-messaging/throttling-and-quotas (last updated 2026-10-13)
- [S44] FCM topic messaging. https://firebase.google.com/docs/cloud-messaging/topic-messaging (last updated 2026-10-13)
- [S45] Google Maps Platform pricing (plans and the change to free monthly calls per SKU). https://mapsplatform.google.com/pricing/ (no date shown; change effective 2025-03-01)
- [S46] Google Maps Platform core services pricing list. https://developers.google.com/maps/billing-and-pricing/pricing (last updated 2026-10-14)
- [S47] Places API usage and billing. https://developers.google.com/maps/documentation/places/web-service/usage-and-billing (last updated 2026-10-13)
- [S48] Solar API usage and billing. https://developers.google.com/maps/documentation/solar/usage-and-billing (last updated 2026-10-13)
- [S49] Air Quality API usage and billing. https://developers.google.com/maps/documentation/air-quality/usage-and-billing (last updated 2026-10-13)
- [S50] Pollen API usage and billing. https://developers.google.com/maps/documentation/pollen/usage-and-billing (last updated 2026-10-13)
- [S51] Street View Publish API pricing. https://developers.google.com/streetview/publish/pricing (last updated 2025-08-28)

Project sources (not numeric sources for Google's limits): `D:\Projects2\Google-services-mcps\docs\SURFACES.md` and `docs\CAPABILITIES.md` (products, profiles, approval classes); `src\core\tools.ts`, `src\core\ads.ts` and `src\core\config.ts` (error text, developer token header, output cap).
