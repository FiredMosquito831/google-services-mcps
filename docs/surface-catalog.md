# Surface coverage catalog: Google Cloud, Workspace, Search and business products

Compiled 2026-10-15 for the MCP suite (plugins: google-cloud, google-workspace, google-search, google-business). Research only: no code was run or installed, and nothing under `reference\`, `src\`, `plugins\`, `config\`, `data\`, `scripts\` or `tests\` was changed. The Discovery-based list of 315 APIs is a separate catalog and is not re-enumerated here.

## Method and legend

- Sources: official Google pages (docs.cloud.google.com, developers.google.com, support.google.com, knowledge.workspace.google.com, firebase.google.com, cloud.google.com, ai.google.dev, adk.dev) plus the official GitHub repos. Third-party sites were used only where marked.
- Every row has a source URL. Anything not confirmed from a primary source is marked **UNVERIFIED**. Where sources disagree, the row is marked **CONFLICT** and both values are given.
- R/W/D = read / write / delete. "Preview" means a vendor preview label as shown on the page. Dates are the page's own "last updated" stamp unless marked otherwise.
- First-pass docs read before starting: `docs\reference-review.md`, `docs\cli-surfaces.md`.

## 1. Summary counts

| Category | Count | Notes |
|---|---|---|
| Remote MCP rows (section 2) | 22 | 19 hosted HTTP endpoints, 3 local or self-hosted |
| Workspace Developer Preview MCP servers | 10 | Enrollment required; service accounts cannot enroll |
| Entries on the Google Cloud remote-MCP supported-products page | about 80 | About 70 not individually checked (UNVERIFIED) |
| Official CLI and SDK rows (section 3) | 23 | 20 with an official tool; 3 "none found" rows (YouTube, Maps, Gemini API); plus notes |
| Non-Discovery API and protocol surfaces (section 4) | 28 | Some are Discovery-backed; flagged per row |
| Admin-console-only or no-API settings (section 5) | 16 | Plus answers to the 7 structural questions |
| Policy and security rules (section 6) | about 50 | Grouped by topic |
| Recommended additions (section 7) | 12 | Ordered; each with a reason |
| Skip or defer (section 7) | 17 | Each with a one-line reason |
| Open questions for the owner (section 8) | 12 | |

### First-pass corrections and changes

| Earlier status or claim | Status now | Evidence |
|---|---|---|
| Workspace DP servers: Drive, Gmail, Calendar, Chat, People, Docs, Sheets, Slides | Expanded to 10. Classroom (16 tools) and Universal Search (1 tool) are new | https://developers.google.com/workspace/classroom/reference/mcp ; https://developers.google.com/workspace/guides/universal-search-mcp |
| Gmail MCP has 11 tools | 10 in the toolset table; the 11th appears only in the sidebar (create_label) | https://developers.google.com/workspace/gmail/api/reference/mcp |
| Supported-products page lists 8 Workspace servers | Page lists only 5 (Drive, Gmail, Calendar, Chat, People). Configure guides list 10. The two pages are out of sync | https://docs.cloud.google.com/mcp/supported-products ; https://developers.google.com/workspace/guides/configure-mcp-servers |
| Google remote MCP program is preview | Program GA since 2026-05-01. Individual servers may still be Preview | https://docs.cloud.google.com/mcp/release-notes |
| Gemini Cloud Assist MCP | Private Preview with allowlist (reference page), not public preview | https://docs.cloud.google.com/cloud-assist/reference/mcp |
| Google Ads has an official MCP | Official MCP is self-hosted, read-only, 3 tools | https://developers.google.com/google-ads/api/docs/developer-toolkit/mcp-server |
| Google Analytics has an official MCP | Official MCP is local and Experimental, 7 read-only tools. A hosted endpoint is seen only on a third-party blog (UNVERIFIED) | https://developers.google.com/analytics/devguides/MCP |
| Gemini CLI | Consumer and free access ended 2026-06-18. Successor is Antigravity CLI. NEW | https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/ (2026-05-19) |
| Merchant Center | Official hosted Alpha MCP, 13 tools. NEW | https://developers.google.com/merchant/api/guides/agentic-tools/merchant-data-mcp |
| `bq init` and `bq shell` exist | CORRECTED. `bq init` is named only in a .bigqueryrc note (not recommended). `bq shell` does not appear in the reference | https://docs.cloud.google.com/bigquery/docs/reference/bq-cli-reference.md.txt |
| Terraform googleworkspace provider repo | Lives at github.com/hashicorp/terraform-provider-googleworkspace (the googleworkspace/ path is 404). Archived 2025-06-30. Last release v0.7.0 on 2022-06-10 | https://github.com/hashicorp/terraform-provider-googleworkspace |
| gws has a JSON output flag | CORRECTED. README says output is structured JSON by default, `--json` sets the request body, `--page-all` emits NDJSON. No output flag is documented | https://github.com/googleworkspace/cli |
| gsutil will leave the gcloud install | CONFIRMED. After March 2027 it is standalone PyPI only | https://docs.cloud.google.com/storage/docs/gsutil |
| clasp is not officially supported | CONFIRMED. `clasp mcp` exists as an experimental command | https://github.com/google/clasp |
| Search Console API base URLs and methods | CONFIRMED by direct fetch. Base URLs https://www.googleapis.com/webmasters/v3 and https://searchconsole.googleapis.com/v1; writes and deletes are sites.add, sites.delete, sitemaps.submit, sitemaps.delete | https://developers.google.com/webmaster-tools/v1/api_reference_index |

### Source conflicts (not resolved; see sections for detail)

- Business Profile Q&A: "discontinued 2025-11-03" (support ended 2025-09-15) vs v4.9 reference still listing methods. https://developers.google.com/my-business/content/sunset-dates
- Gmail less-secure-app cutoff: 2025-03-14 (Google help) vs 2025-05-01 (third-party notice). https://support.google.com/accounts/answer/6010255
- Chrome Web Store API v1.1: "supported until 15th October 2026", which is today. Shutdown not confirmed. https://developer.chrome.com/docs/webstore/using-api
- Google Ads Developer Assistant: docs say v4.0.0 and "not an official Google product"; a Dec 2025 blog calls v1.0 an official extension. https://developers.google.com/google-ads/api/docs/developer-toolkit/ai-assistant ; https://ads-developers.googleblog.com/2025/12/
- Maps Grounding Lite host: mapstools.googleapis.com/mcp (reference) vs maps.googleapis.com/mcp (Dec 2025 blog). https://developers.google.com/maps/ai/grounding-lite/reference/mcp
- Google Cloud 2SV enforcement start: 2026-10-20 (official, for orgs created before 2026-08-03) vs 2026-09-15 (search snippet). https://docs.cloud.google.com/docs/authentication/mfa-requirement
- Sensitive-scope review time: "3-5 business days" (page) vs "10 business days" (FAQ table). https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification ; https://support.google.com/cloud/answer/13463817
- Google Ads MCP page says developer tokens "were sunset on September 9, 2026". Which token type is meant is UNVERIFIED. https://developers.google.com/google-ads/api/docs/developer-toolkit/mcp-server

## 2. Official remote MCP servers (and local official MCP servers)

Status and tools are as documented on the pages linked. Date seen is 2026-10-15 for all rows.

### 2a. Google Workspace (Developer Preview, enrollment required)

| Server | Endpoint | Status | Auth | Tools | Source |
|---|---|---|---|---|---|
| Gmail | https://gmailmcp.googleapis.com/mcp/v1 | Developer Preview | OAuth 2.0 (gmail.readonly, gmail.compose) | 10: create_draft, list_drafts, get_message, get_thread, search_threads, label_message, unlabel_message, label_thread, unlabel_thread, list_labels | https://developers.google.com/workspace/gmail/api/reference/mcp ; https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server |
| Drive | https://drivemcp.googleapis.com/mcp/v1 | Developer Preview | OAuth 2.0 | 8: copy_file, create_file, download_file_content, get_file_metadata, get_file_permissions, list_recent_files, read_file_content, search_files | https://developers.google.com/workspace/drive/api/reference/mcp |
| Calendar | https://calendarmcp.googleapis.com/mcp/v1 | Developer Preview | OAuth 2.0 | 9: list_events, get_event, list_calendars, suggest_time, create_event, update_event, delete_event, respond_to_event, search_events | https://developers.google.com/workspace/calendar/api/v3/reference/mcp |
| Chat | https://chatmcp.googleapis.com/mcp/v1 | Developer Preview | OAuth 2.0; needs a Chat app in the project | 7: list_messages, search_conversations, search_messages, send_message, list_memberships, mark_as_read, mark_as_unread | https://developers.google.com/workspace/chat/api/reference/mcp |
| People | https://people.googleapis.com/mcp/v1 | Developer Preview | OAuth 2.0 | 3: search_directory_people, search_contacts, get_user_profile | https://developers.google.com/people/api/mcp |
| Docs | https://docsmcp.googleapis.com/mcp/v1 | Developer Preview | OAuth 2.0 (drive.readonly, drive.file, documents.readonly, documents) | 2: read_doc, update_doc | https://developers.google.com/workspace/docs/api/guides/configure-mcp-server |
| Sheets | https://sheetsmcp.googleapis.com/mcp/v1 | Developer Preview (shared guide) | OAuth 2.0 | 6: get_values, get_spreadsheet, update_spreadsheet, update_values, update_formulas, insert_dimension | https://developers.google.com/workspace/guides/configure-mcp-servers |
| Slides | https://slidesmcp.googleapis.com/mcp/v1 | Developer Preview (shared guide) | OAuth 2.0 | 2: read_presentation, update_presentation | https://developers.google.com/workspace/guides/configure-mcp-servers |
| Classroom | https://classroommcp.googleapis.com/mcp/v1 | Developer Preview | OAuth 2.0 (scopes not on reference page) | 16, including list_courses, create_course_work, get_course_roster, create_announcement, search_course_standards | https://developers.google.com/workspace/classroom/reference/mcp |
| Universal Search | https://workspacemcp.googleapis.com/mcp/v1 | Developer Preview | OAuth 2.0 (gmail, drive, calendar, chat .readonly) | 1: search_corpus | https://developers.google.com/workspace/guides/universal-search-mcp |

Enrollment: apply to the Developer Preview Program (approval "within a couple of days" per the page). Enable the API for each server, for example `gcloud services enable gmail.googleapis.com drive.googleapis.com calendar-json.googleapis.com chat.googleapis.com workspacemcp.googleapis.com --project=PROJECT_ID`. Create a Web-application OAuth client and select "Use this client for an AI-powered agent". No IAM roles are stated for Workspace. Sources: https://developers.google.com/workspace/preview ; https://developers.google.com/workspace/guides/configure-mcp-servers

### 2b. Google Cloud, Firebase, Maps and other Google hosted or local MCP servers

| Server | Endpoint or launch | Status | Auth | Tools | Source |
|---|---|---|---|---|---|
| Developer Knowledge | https://developerknowledge.googleapis.com/mcp | Public preview (launch post 2026-02-04); reference page gives no label | API key | 3: search_documents, answer_query, get_documents | https://developers.google.com/knowledge/reference/mcp ; https://developers.googleblog.com/introducing-the-developer-knowledge-api-and-mcp-server/ |
| Gemini Cloud Assist | https://geminicloudassist.googleapis.com/mcp | Private Preview (allowlist) | Method not named; IAM roles geminicloudassist.viewer, user, admin | 5: ask_cloud_assist, investigate_issue, optimize_costs, invoke_operation (write), design_infra | https://docs.cloud.google.com/cloud-assist/reference/mcp |
| BigQuery | https://bigquery.googleapis.com/mcp | No label | OAuth 2.0 with IAM; roles/mcp.toolUser plus bigquery.jobUser or dataViewer | 6 named: list_dataset_ids, list_table_ids, get_dataset_info, get_table_info, execute_sql (only non-read-only tool), execute_sql_readonly. Full count UNVERIFIED | https://docs.cloud.google.com/bigquery/docs/use-bigquery-mcp |
| Firestore | https://firestore.googleapis.com/mcp | No label | Required; method not stated | 23 across documents, databases, indexes, backups, backup schedules | https://docs.cloud.google.com/firestore/docs/reference/mcp |
| Firebase CLI MCP | Local stdio: `npx -y firebase-tools@latest mcp` (`--dir`, `--only` to limit groups) | Not stated | Firebase CLI login or ADC | 69 in 12 groups (firestore 25, core 17, crashlytics 8, others) | https://firebase.google.com/docs/cli/mcp-server |
| Apigee API hub | https://apihub.googleapis.com/mcp (regional hosts also) | No label | Not stated | 45 named (create_api, list_apis, search_resources, others) | https://docs.cloud.google.com/apigee/docs/reference/apis/apihub/mcp |
| Looker (managed) | Per instance: LOOKER_INSTANCE_URL/mcp | Preview; not on supported-products page | OAuth 2.1 with PKCE; admin registers each agent as an OAuth client; no API key or ADC | Not listed on page (UNVERIFIED) | https://docs.cloud.google.com/looker/docs/mcp |
| Merchant API | https://merchantapi.googleapis.com/mcp | Alpha ("experimental alpha") | OAuth 2.0 or service account (scope auth/content); X-Goog-User-Project with user ADC | 13, including get_product_by_name, list_products, report_search, list_data_sources, create_data_source, fetch_data_source, list_accounts, list_programs | https://developers.google.com/merchant/api/guides/agentic-tools/merchant-data-mcp |
| Maps Code Assist | https://mapscodeassist.googleapis.com/mcp | Experimental (pre-GA) | None for tools/list; other methods not stated | 2: retrieve-instructions, retrieve-google-maps-platform-docs (no Maps API calls) | https://developers.google.com/maps/ai/mcp ; https://developers.google.com/maps/ai/code-assist/reference/mcp |
| Maps Grounding Lite | https://mapstools.googleapis.com/mcp (CONFLICT: maps.googleapis.com/mcp in a Dec 2025 blog) | Not stated | API key (X-Goog-Api-Key) or OAuth (maps-platform.mapstools scope); enable the API and billing | 5: search_places, lookup_weather, compute_routes, resolve_names, resolve_maps_urls | https://developers.google.com/maps/ai/grounding-lite/reference/mcp |
| Google Ads (official) | Self-hosted only (stdio or Streamable HTTP on Cloud Run); a hosted pilot is mentioned for allowlisted participants | Not labelled | OAuth 2.0 (adwords scope) or ADC; developer token required | 3, read-only: search (GAQL), get_resource_metadata, list_accessible_customers. Cannot change bids, pause campaigns or create assets | https://developers.google.com/google-ads/api/docs/developer-toolkit/mcp-server ; https://github.com/googleads/google-ads-mcp |
| Google Analytics (official) | Local: `pipx run analytics-mcp` | Experimental | ADC with analytics.readonly scope; enable Admin and Data APIs | 7, read-only: get_account_summaries, get_property_details, list_google_ads_links, run_report, run_funnel_report, get_custom_dimensions_and_metrics, run_realtime_report | https://developers.google.com/analytics/devguides/MCP ; https://github.com/googleanalytics/google-analytics-mcp |
| Google Cloud remote program (general) | https://*.googleapis.com/mcp per product | Program GA since 2026-05-01; per-server status varies | ADC, OAuth 2.0 client, bearer token, or API key (only where no principal is needed) | About 80 entries; about 70 not individually checked (UNVERIFIED) | https://docs.cloud.google.com/mcp/supported-products ; https://docs.cloud.google.com/mcp/overview ; https://docs.cloud.google.com/mcp/set-up-authentication-mcp-servers |

Enablement for Google Cloud products: enable the product API with `gcloud services enable SERVICE_NAME`. Endpoints are enabled with the product from 2026-03-17. Callers need roles/mcp.toolUser (permission mcp.tools.call). Protocol version 2026-07-28, stateless. Sources: https://docs.cloud.google.com/mcp/release-notes ; https://docs.cloud.google.com/mcp/enable-disable-mcp-servers

Not found (no official remote MCP server on the supported-products page or in Google-domain searches): YouTube, Search Console, Business Profile, Admin SDK, Cloud Identity, Gmail or Drive outside the Workspace preview list. Reference pages for these products were not fetched individually, so the negatives are not fully proven (UNVERIFIED).

Unverified: Firebase SQL Connect remote MCP (firebasedataconnect.googleapis.com/mcp) is listed as Preview on the supported-products page; its reference page returned only navigation, so tools and auth are UNVERIFIED (https://firebase.google.com/docs/reference/sql-connect/mcp). A hosted Analytics endpoint (analyticsdata.googleapis.com/mcp/v1) is seen only on a third-party blog (UNVERIFIED).

## 3. Official and well-known CLIs and SDK tools, by product

Rows marked **Google** are Google-owned and documented on an official page. "JSON" is the documented flag or "No" when not stated.

| Product | Tool | Owner | Install (official) | What it manages | R/W/D | JSON | Auth | Status | Source |
|---|---|---|---|---|---|---|---|---|---|
| Firebase | firebase-tools CLI | Google (github.com/firebase) | `npm install -g firebase-tools` | Deploy (hosting, functions, Firestore indexes), `auth:import` and `auth:export` (scrypt-hashed passwords only), `emulators:start`, `remoteconfig:get` and `remoteconfig:rollback --version_number`, `apps:create`, `apps:list`, `apps:sdkconfig` | Mixed. Deploy, import, rollback write. `auth:export`, `remoteconfig:get` read. `functions:delete`, `firestore:delete` delete | `--json` per draft AIP-3260 (UNVERIFIED per command) | `firebase login`; CI via `login:ci` | No stability label found | https://github.com/firebase/firebase-tools ; https://google.aip.dev/firebase/3260 (draft) |
| Firebase | firebase-tools MCP mode | Google | `npx -y firebase-tools@latest mcp` | Feature groups: firestore, auth, functions, remoteconfig, storage, core (deploy) | Mixed. `firestore_get_document` reads; `firestore_delete_document`, `firebase_deploy`, `auth_update_user` write | MCP results | Actions run "with your approval" | No preview label. The gemini-cli firebase extension is deprecated and replaced by firebase/agent-skills | https://firebase.google.com/docs/cli/mcp-server |
| Google Ads | google-ads-mcp (official) | Google | `pipx run --spec git+https://github.com/googleads/google-ads-mcp.git google-ads-mcp` | `list_accessible_customers`, `search` (GAQL), `get_resource_metadata` | Read-only | MCP results | OAuth 2.0 or service account | "Current release" | https://developers.google.com/google-ads/api/docs/developer-toolkit/mcp-server |
| Google Ads | Developer Assistant | Google-org repo; docs say "not an official Google product" (CONFLICT with Dec 2025 blog) | `git clone https://github.com/googleads/google-ads-api-developer-assistant`, then `./install.sh claude` (Windows: `.\install.ps1 -Type claude`) | Generated client code, CSV exports, diagnostic reports | Read: runs read-only scripts. Mutating code is written to `saved/code/` and never run | No (files) | Developer token and `google-ads.yaml` | v4.0.0 per docs; v1.0 per blog (CONFLICT) | https://developers.google.com/google-ads/api/docs/developer-toolkit/ai-assistant ; https://ads-developers.googleblog.com/2025/12/ |
| Google Ads | Client libraries (REST and gRPC) | Google | `pip install google-ads` (PyPI 33.0.0, 2026-09-23); also Maven, NuGet, Composer, RubyGems, CPAN | Full API (Search, Mutate) | Read and write | Library objects; REST interface exists | Developer token and OAuth | Official. "Most of our official client libraries use gRPC" | https://developers.google.com/google-ads/api/docs/client-libs ; https://developers.google.com/google-ads/api/rest/overview ; https://pypi.org/project/google-ads/ |
| Google Analytics | analytics-mcp (Experimental) | Google | `pipx run analytics-mcp` in MCP config | get_account_summaries, get_property_details, run_report, run_funnel_report, run_realtime_report | Read-only ("can't edit your Google Analytics configuration or settings") | MCP results | ADC with analytics.readonly; enable Admin and Data APIs | Experimental | https://developers.google.com/analytics/devguides/MCP ; https://github.com/googleanalytics/google-analytics-mcp |
| Maps Platform | Maps Code Assist MCP | Google | Remote `https://mapscodeassist.googleapis.com/mcp` (Streamable HTTP); no install command | Docs and code-sample search | None | N/A | Not stated for non-list calls | Experimental (pre-GA) | https://developers.google.com/maps/ai/mcp |
| Maps Platform | Official CLI | None found | n/a | n/a | n/a | n/a | n/a | Community tools only (way-cli, maps-cli) | Searches (UNVERIFIED for community tools) |
| Cloud Shell and gcloud | gcloud cloud-shell | Google | Part of gcloud | `ssh` (`--command` runs then exits; `--authorize-session`), `scp` (both directions), `get-mount-command` | Mixed | N/A | gcloud auth | No alpha or beta label on GA page; alpha and beta variants exist | https://docs.cloud.google.com/sdk/gcloud/reference/cloud-shell ; https://docs.cloud.google.com/shell/docs/how-cloud-shell-works ; https://docs.cloud.google.com/shell/docs/using-cloudshell-command |
| Android and Play | bundletool | Google | Download from github.com/google/bundletool/releases (no command on page) | `build-apks`, `install-apks` (writes to device), `get-device-spec`, `extract-apks`, `get-size total`. No delete command | Build and extract write files | No (device-spec JSON is an input) | Connected device | Latest 1.18.3 (release date UNVERIFIED) | https://developer.android.com/studio/command-line/bundletool ; https://github.com/google/bundletool |
| Android and Play | Google Play Developer API | Google | REST (Java and Python libraries; no CLI) | Edits, tracks, in-app products, subscriptions, reviews | Both | Yes (REST) | Service account or OAuth (UNVERIFIED for setup steps) | Current | https://developers.google.com/android-publisher |
| YouTube | No official CLI or MCP found | n/a | n/a | Data API covers search, uploads, playlists, channels | n/a | n/a | n/a | Community only (yutu, youtube-mcp-cli) | https://developers.google.com/youtube/v3 |
| Merchant Center | Merchant API devdocs MCP | Google | `npx -y mcp-remote https://merchantapi.googleapis.com/devdocs/mcp` | Retrieval of Merchant API docs only | Read-only | N/A | None | Seen in search snippet (UNVERIFIED) | https://developers.google.com/merchant/api/guides/agentic-tools/integration-and-code-assist |
| Gemini | Gemini CLI | Google, open source | `npm install -g @google/gemini-cli` (also `npx`, `brew install gemini-cli`) | Local files, shell, web search and fetch; MCP via `~/.gemini/settings.json`; extensions | Depends on tool | `gemini -p "..." --output-format json` | Sign in with Google; Gemini API key; Vertex AI | **Consumer and free access ended 2026-06-18.** Kept for Code Assist Standard or Enterprise and paid API keys. Successor: Antigravity CLI | https://github.com/google-gemini/gemini-cli ; https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/ |
| Gemini | Gemini CLI Workspace extension | Listed under Google Workspace in google/mcp (that page says not officially supported) | `gemini extensions install https://github.com/gemini-cli-extensions/workspace` | Docs, Sheets, Slides, Gmail, Chat, Calendar, Drive search | Read, modify and delete account data (README) | N/A | Google OAuth; headless `npm run auth-utils -- login` | No support statement | https://github.com/gemini-cli-extensions/workspace |
| Gemini API | google-genai (Python) and @google/genai (JS) | Google (googleapis) | `pip install google-genai` (2.31.0, 2026-10-14); `npm install @google/genai` | Model calls only; no admin resources | Inference only | SDK response objects | `GEMINI_API_KEY` or `GOOGLE_API_KEY`; Agent Platform: `GOOGLE_GENAI_USE_ENTERPRISE`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` | Built-in MCP support "is an experimental feature"; pin below 3.0.0 advised | https://github.com/googleapis/python-genai ; https://github.com/googleapis/js-genai |
| Gemini API | Official MCP or CLI | None found | n/a | Only community wrappers | n/a | n/a | n/a | n/a | Searches (UNVERIFIED negative) |
| Vertex AI, now Gemini Enterprise Agent Platform | gcloud ai | Google | Part of gcloud | 14 groups: endpoints, models, indexes, custom-jobs, tuning-jobs, tensorboards, model-garden, others. No agent group | Mixed (create, update, delete) | gcloud `--format` (not re-checked) | gcloud auth | Alpha and beta variants. Rename page does not say whether gcloud names changed | https://docs.cloud.google.com/sdk/gcloud/reference/ai ; https://docs.cloud.google.com/gemini-enterprise-agent-platform/vertex-ai-name-changes (path partly abbreviated in notes; verify) |
| Agent Platform | gcloud agent-registry and agent-identity | Google | Part of gcloud | Registry: agents, bindings, endpoints, mcp-servers, services. Identity: access-summaries, auth-providers | Mixed; bindings, services, auth-providers have create and delete | gcloud `--format` | gcloud auth | Alpha and beta variants; GA not labelled. Agent Registry v1 GA only in a snippet (UNVERIFIED) | https://docs.cloud.google.com/sdk/gcloud/reference/agent-registry ; https://docs.cloud.google.com/sdk/gcloud/reference/agent-identity |
| Agent Platform | adk (Agent Development Kit) | Google, open source | `pip install google-adk` (2.12.0, 2026-10-13) | create, run, web, api_server, deploy (agent_engine, cloud_run, docker, gke), eval, eval_set, migrate session | Deploy and migrate write; no delete | Not stated | gcloud for Cloud Run and Agent Engine | `create --type` EXPERIMENTAL; `api_server` has no auth | https://adk.dev/api-reference/cli/ |
| Agent Platform | agents-cli | Google (github.com/google/agents-cli) | `uvx google-agents-cli setup` or `pip install google-agents-cli` (1.10.0, 2026-10-12). `npx skills add google/agents-cli` installs skills only | create, run, eval, scaffold, deploy (Agent Runtime, Cloud Run, GKE), publish gemini, infra, login | Deploy and infra write; no delete documented | Not mentioned | `login`: Google Cloud or AI Studio key | Not stated | https://github.com/google/agents-cli ; https://pypi.org/project/google-agents-cli/ |
| Google Cloud MCP precedent | gcloud-mcp (googleapis) | Google (googleapis); "not an officially supported Google product" | `npx @google-cloud/gcloud-mcp init --agent=gemini-cli` | One tool, `run_gcloud_command` | Can change resources; runs any gcloud command the account can run | N/A | Active gcloud account; impersonation advised | "Preview"; "may see breaking changes" | https://github.com/googleapis/gcloud-mcp |
| Gemini Enterprise | A2A agent registration | Google | REST `agents.create` on discoveryengine v1alpha | Register, list, patch, delete A2A agents | All | REST JSON | `Bearer $(gcloud auth print-access-token)` | Preview | https://docs.cloud.google.com/gemini/enterprise/docs/register-and-manage-an-a2a-agent |

Notes:
- Gemini Enterprise admin CLI or API: none found beyond the A2A path above (extended search; UNVERIFIED negative).
- Google Ads Scripts (JavaScript in the Ads UI) run in Google's cloud and are scheduled in the Ads web interface. External calls use UrlFetchApp. No CLI, API or clasp path found. Source: https://developers.google.com/google-ads/scripts/docs/start ; https://developers.google.com/google-ads/scripts/docs/integrations/third-party-apis
- Google Analytics CLI or gcloud analytics commands: none. The gcloud reference lists 135 top-level groups, none for analytics, ads, maps, youtube, merchant or play. Source: https://docs.cloud.google.com/sdk/gcloud/reference
- YouTube, Search Console, Business Profile, Maps and Merchant CLIs: none found; community tools only.
- Existing first-pass tools (gcloud, bq, gsutil, clasp, GAM, gws, Terraform provider) are covered in `docs\cli-surfaces.md`; the corrections are in section 1.

## 4. Non-Discovery API and protocol surfaces

"Discovery?" is Yes only where the official page shows a REST resource that is documented in the Discovery service; Unverified means not checked against the 315-API list.

| Surface | Protocol | Auth | R/W | Limits | Status | Discovery? | Source |
|---|---|---|---|---|---|---|---|
| Google Ads API | REST or gRPC. Most client libraries use gRPC; Perl uses REST | Developer token and OAuth | Both | Test: 15,000 ops/day, test accounts only. Explorer: 2,880/day production. Basic: 15,000/day, brand verification needed. Standard: unlimited, manual audit | v26 released 2026-10-14; v25.2 2026-09-23; v25.1 2026-08-19; v25 2026-07-22. v20 sunset 2026-06-10 is third-party only | No (not Discovery) | https://developers.google.com/google-ads/api/docs/release-notes ; https://developers.google.com/google-ads/api/docs/access-levels |
| Google Ads scripts | JavaScript in the Ads UI; outbound via UrlFetchApp | Basic, OAuth 1.0 or 2.0, or service account per script | Both | UrlFetchApp quotas exist; figures not on page | No deprecation found | No | https://developers.google.com/google-ads/scripts/docs/integrations/third-party-apis |
| Google Trends | Alpha; endpoint and protocol not on official page | Not stated | Read | Rolling 5-year window; no public quota | Alpha, application-only (announced 2025-07-24) | Unverified | https://developers.google.com/search/apis/trends |
| Business Profile v4 (reviews, local posts, media) | REST v4 | OAuth | Read and write | Not checked | Live. Change log has v4 review entries dated 2026-07-24. No sunset date; field-level deprecations only (for example GET_OFFER) | Unverified | https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews ; https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts ; https://developers.google.com/my-business/content/change-log |
| Business Profile Q&A (questions and answers) | REST v4 | OAuth | Read and write | n/a | CONFLICT: discontinued 2025-11-03 (support ended 2025-09-15) vs v4.9 reference still lists methods | Unverified | https://developers.google.com/my-business/content/sunset-dates |
| Business Profile v1 family | REST v1 (service mybusiness.googleapis.com) | OAuth | Mostly read and patch | Account Management v1.1; Business Information v1; Performance v1 (replaces v4 reportInsights); Place Actions v1; Verifications v1; Media v1 (upload only) | Live. No v1 replacement found for reviews, local posts or media list | Unverified | https://developers.google.com/my-business/reference/rest |
| Calendar CalDAV | CalDAV/WebDAV, iCalendar, rfc6578 sync | OAuth 2.0 (Basic returns 401); scope not named on guide | Events read and write | No free-busy, VTODO, VJOURNAL, MKCALENDAR or WebDAV ACLs. Endpoint apidata.googleusercontent.com/caldav/v2/CALENDAR_ID/events. Projects from 2026-05-01 use new quotas | Current. Old www.google.com/calendar/dav is deprecated | No | https://developers.google.com/workspace/calendar/caldav/v2/guide ; https://developers.google.com/workspace/calendar/api/auth |
| Gmail IMAP, SMTP, POP | IMAP imap.gmail.com:993 (SSL); SMTP smtp.gmail.com 465 (SSL) or 587 (TLS); POP 995 | XOAUTH2 with https://mail.google.com/ (restricted); Workspace DWD uses gmail.imap_admin | Both | IMAP session about 24 h; POP about 7 days; daily send limit not on page | Less-secure-app access ended (CONFLICT on date: 2025-03-14 vs 2025-05-01). App passwords need 2-Step Verification | No | https://developers.google.com/workspace/gmail/imap/imap-smtp ; https://developers.google.com/workspace/gmail/imap/xoauth2-protocol ; https://support.google.com/accounts/answer/185833 ; https://support.google.com/accounts/answer/6010255 |
| Gmail push (users.watch) | Pub/Sub topic delivery | OAuth; grant publish to gmail-api-push@system.gserviceaccount.com | Watch is a write; notifications carry historyId only | Call watch at least every 7 days (daily recommended). Domain-restricted sharing can block the grant | Current | Yes | https://developers.google.com/workspace/gmail/api/guides/push |
| Gmail users.history.list | REST GET | OAuth | Read | startHistoryId required; maxResults default 100, max 500; historyId valid "at least a week"; stale returns 404, then full sync | Current | Yes | https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list |
| Gmail batch | multipart/mixed HTTP batch | OAuth | Both | Max 100 calls per batch; Google recommends 50 or fewer; each sub-request counts toward quota | Current | Yes | https://developers.google.com/workspace/gmail/api/guides/batch |
| Drive changes | REST (Drive v3); push via HTTPS webhook channels | OAuth | Read feed; channels only notify | Channel expiry default 3600 s, maximum 604800 s (1 week); no auto-renew; push not guaranteed; watch needs pageToken | Current | Yes | https://developers.google.com/workspace/drive/api/guides/manage-changes ; https://developers.google.com/workspace/drive/api/guides/push |
| Chrome Web Store API | REST v2 at chromewebstore.googleapis.com/v2 (fetchStatus, publish, cancelSubmission; upload endpoint) | OAuth scope https://www.googleapis.com/auth/chromewebstore; service accounts supported | Both | v2 cannot create items; staged publish; rollout change without review | v2 announced 2025-10-15. v1.1 "supported until 15th October 2026" (today); shutdown UNVERIFIED | Unverified | https://developer.chrome.com/docs/webstore/using-api ; https://developer.chrome.com/blog/cws-api-v2 |
| Google Chat incoming webhooks | HTTPS POST to chat.googleapis.com/v1/spaces/SPACE_ID/messages with key and token in query string | Key and secret token in URL | Write only, one-way | 1 request per second per space, shared by all webhooks in that space; threadKey supported; cannot receive messages or events. cardsV2 support UNVERIFIED | Current | No | https://developers.google.com/workspace/chat/quickstart/webhooks |
| Cloud Storage XML API | S3-compatible XML at storage.googleapis.com | HMAC keys (max 10 per service account; secret shown once) | Both | HMAC keys work only with the XML API, not JSON; V4 signing | Current. No XML-only feature list on page | No | https://docs.cloud.google.com/storage/docs/interoperability ; https://docs.cloud.google.com/storage/docs/authentication/hmackeys |
| Cloud Logging export sinks | REST projects.sinks: create, list, get, update, patch, delete | Creator needs roles/logging.configWriter; writer identity needs roles/logging.logWriter plus destination role | Admin | Destinations: log bucket, BigQuery, Cloud Storage, Pub/Sub (Splunk and Datadog via Pub/Sub), other project. Exclusion filters do not reduce entries.write quota | Current | Yes | https://docs.cloud.google.com/logging/docs/routing/overview ; https://docs.cloud.google.com/logging/docs/export/configure_export_v2 ; https://docs.cloud.google.com/logging/docs/reference/v2/rest/v2/projects.sinks |
| Cloud Billing export to BigQuery | Dataset feed | Billing Account Costs Manager or Administrator, plus BigQuery User (standard and detailed); pricing export needs Billing Account Administrator plus BigQuery Admin | Export only | Three types: standard, detailed (resource level), pricing. No backfill; multi-region datasets get prior month | Console setup documented; no enable API documented (UNVERIFIED) | No | https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-setup |
| Cloud Billing Budgets API | REST billingbudgets.googleapis.com/v1 (also v1beta1): billingAccounts.budgets create, get, list, patch, delete | IAM (permissions not on page) | Both | Not checked | Current | Yes | https://docs.cloud.google.com/billing/docs/reference/budget/rest |
| BigQuery Storage Read API | gRPC (bigquerystorage.googleapis.com): CreateReadSession, ReadRows, SplitReadStream | IAM (bigquery.readSessionUser) | Read | Avro or Arrow; client libraries recommended | Current | No | https://docs.cloud.google.com/bigquery/docs/reference/storage ; https://docs.cloud.google.com/bigquery/docs/reference/storage/rpc |
| BigQuery Storage Write API | gRPC recommended over REST for new projects; REST also documented | IAM | Write | Modes: default, pending, committed, buffered. Protobuf or Arrow. About 1 MBps minimum per connection | Current | No | https://docs.cloud.google.com/bigquery/docs/write-api |
| Cloud Pub/Sub | REST pull, acknowledge, modifyAckDeadline; StreamingPull is RPC-only (absent from REST reference); push is HTTPS POST | IAM; push JWT in Authorization header | Both | Pull returns one response per request, no latency guarantee. Push ack codes 102, 200, 201, 202, 204; others redeliver | Current | Yes (REST) | https://docs.cloud.google.com/pubsub/docs/pull ; https://docs.cloud.google.com/pubsub/docs/push ; https://docs.cloud.google.com/pubsub/docs/reference/rest |
| Firebase Realtime Database | REST on DB.firebaseio.com (us-central1) or DB.REGION.firebasedatabase.app, `.json` paths; SSE with Accept: text/event-stream | `auth=` takes a Firebase ID token; legacy secrets still accepted; rules bypass needs service-account OAuth | Both | shallow=true; orderBy (one key); limitToFirst or limitToLast; ETag and if-match on PUT and DELETE (not PATCH) | Current | Unverified | https://firebase.google.com/docs/database/rest/start ; https://firebase.google.com/docs/database/rest/retrieve-data ; https://firebase.google.com/docs/database/rest/save-data ; https://firebase.google.com/docs/database/rest/auth |
| Sheets API v4 vs Apps Script SpreadsheetApp | Sheets: REST. SpreadsheetApp: in-script service | Sheets: OAuth. Apps Script: runs as the script owner or user | Both | Sheets: 300 read and 300 write requests per minute per project; 60 per user; a batch counts as one; 2 MB recommended. Apps Script: 6 min per execution; triggers 90 min per day (consumer), 6 h per day (Workspace); UrlFetch 20,000 per day (consumer), 100,000 (Workspace). No per-call SpreadsheetApp quota documented | Current | Sheets: Yes. Apps Script: No | https://developers.google.com/workspace/sheets/api/limits ; https://developers.google.com/apps-script/guides/services/quotas |
| Docs batchUpdate | REST documents.batchUpdate with requests array | OAuth | Write | Each request validated; one invalid request fails the whole batch; the page says the batch is "applied together atomically". Replies match requests in order. writeControl.requiredRevisionId returns 400 if not latest. Index rules not on reference page | Current | Yes | https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/batchUpdate |
| Workspace Events API | Subscriptions; Pub/Sub is the only target listed | OAuth (scopes not on page) | Read events | Expiry up to 4 h with resource data (24 h with DWD); up to 7 days without. Chat, Drive and Meet covered; Gmail not listed | Current | Unverified | https://developers.google.com/workspace/events |
| Meet REST API | REST | Google OAuth (scopes not on page) | Read; create and manage spaces | Resources: spaces, conferenceRecords, participants, recordings, transcripts, smartNotes. Transcript entries kept 30 days; one active conference per space | Release stage not stated | Unverified | https://developers.google.com/workspace/meet/api/guides/overview |
| Meet Media API | WebRTC (SDP and ICE, data channels), not gRPC | Registered app plus meeting consent | Read streams | Video, audio, participant metadata. Blocked by encryption or watermark | Developer preview; closed to new signups | No | https://developers.google.com/meet/media-api/guides/overview |
| Google Photos Library API | REST | OAuth; remaining scopes photoslibrary.appendonly and .readonly.appcreateddata, .edit.appcreateddata | Read and write app-created items only | Removed: photoslibrary.readonly, .sharing, full photoslibrary. Picker API for user selection | Changed 2025 (FAQ says March 31, banner says April 1) | Unverified | https://developers.google.cn/photos/support/updates?hl=en (mirror; official page returned 404) |

Protocol-only surfaces an MCP server could not realistically wrap: BigQuery Storage Read and Write, Pub/Sub StreamingPull, Meet Media API. Use client libraries in a worker process instead.

UNVERIFIED in section 4:
- Ads sunset table: the official page is about 447k characters and only navigation came back. v21 and v22 dates are from third-party sites. Exact REST base URL not checked.
- Ads scripts quotas: figures not on the third-party-apis page.
- Trends protocol and auth: a secondary source claims v1alpha REST; not confirmed.
- Business Profile: whether v4 Q&A still works; whether batchGetReviews works (sidebar only); v1 Media upload semantics; quotas.
- Calendar CalDAV: which OAuth scope it accepts.
- Gmail: daily send limit; exact batch URL path; whether Workspace admins can disable app passwords.
- Drive: page-token validity period.
- Chrome: whether v1.1 is now shut off; v2 quotas.
- Chat: cardsV2 support; webhook sender identity.
- Cloud Storage XML: roles/storage.hmacKeyAdmin and projects.hmacKeys names.
- Billing: any API that enables export (Billing REST reference not read); Budgets IAM permissions.
- BigQuery Write: REST write formats and quotas.
- Pub/Sub: maximum messages per pull; quota values.
- Firebase Admin SDK versus REST comparison (not on these pages).
- Apps Script: per-call SpreadsheetApp throttle (not documented).
- Docs: in-order execution and index rules (not on reference page).
- Workspace Events: scopes, quotas, Gmail coverage, non-Pub/Sub targets.
- Meet REST: protocol details, scopes, release stage.

## 5. Admin-console-only settings and no-API gaps

Admin SDK Directory methods and Groups Settings are already inventoried in `docs\cli-surfaces.md` and are not repeated here. "NONE" means no public write or read API was found in the cited reference pages.

| Setting | API (name and method) or NONE | Console-only? | Automation note | Source |
|---|---|---|---|---|
| Calendar on or off per OU or group | NONE. Policy API calendar settings are read-only | Yes | Policy API read-only for Calendar | https://docs.cloud.google.com/identity/docs/concepts/supported-policy-api-settings ; https://knowledge.workspace.google.com/admin/users/access/turn-calendar-on-or-off-for-users |
| Workspace service on or off per OU (Gmail, Drive, Chat, Meet) | NONE | Yes | OU override or access-group scoping is console only | https://knowledge.workspace.google.com/admin/users/advanced/turn-a-service-on-or-off-for-google-workspace-users |
| Gmail routing and default send and receive rules | NONE at OU level. Gmail API users.settings is per user only (filters, sendAs, forwardingAddresses, delegates, autoForwarding, vacation) | Yes at OU level | Policy gmail.email_address_lists and gmail.restrict_delivery are read-only | https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings ; https://docs.cloud.google.com/identity/docs/concepts/supported-policy-api-settings |
| Content compliance (DLP rules for Drive, Gmail, Chat, Chrome) | Cloud Identity Policy API: policies create, patch, delete for DLP rules and detectors (super admin). Added 2026-06-08 | No | Only DLP is writable through the Policy API | https://workspaceupdates.googleblog.com/2026/06/introducing-workspace-policy-api-mutate-endpoints-for-DLP.html ; https://docs.cloud.google.com/identity/docs/reference/rest/v1beta1/policies |
| Drive external sharing allowlist and link-sharing default | Policy API read-only: drive_and_docs.external_sharing (DISALLOWED, ALLOWLISTED_DOMAINS, ALLOWED) and general_access_default. No write method found. Drive API deprecated enforceExpansiveAccess on 2026-02-25 | Yes | Read-only through API | https://docs.cloud.google.com/identity/docs/concepts/supported-policy-api-settings ; https://developers.google.com/workspace/release-notes |
| 2-Step Verification enforcement | Directory users.isEnforcedIn2Sv is read-only. twoStepVerification.turnOff exists. Policy security.two_step_verification_enforcement: mutate flag not extracted | Likely | Write path for enforcement UNVERIFIED | https://developers.google.com/workspace/admin/directory/reference/rest/v1/users ; https://docs.cloud.google.com/identity/docs/concepts/supported-policy-api-settings |
| Domain-wide delegation client allowlist | NONE. Security > Access and data control > API controls > Manage Domain Wide Delegation. Multi-party approval can gate changes | Yes | Do not automate writes; audit reads only | https://knowledge.workspace.google.com/admin/apps/control-api-access-with-domain-wide-delegation?hl=en |
| OAuth app access control and trusted apps | NONE for writes. Policy api_controls.unconfigured_third_party_apps, app_approval_requests, internal_apps are read-only | Yes | Read-only through Policy API | https://docs.cloud.google.com/identity/docs/concepts/supported-policy-api-settings ; https://knowledge.workspace.google.com/admin/apps/control-which-apps-access-google-workspace-data?hl=en |
| Less-secure apps and third-party sign-in | NONE. Policy security.less_secure_apps is read-only | Yes | Password-only app sign-in not supported for Workspace accounts from Jan 2025 (page undated) | https://support.google.com/accounts/answer/6010255 ; https://docs.cloud.google.com/identity/docs/concepts/supported-policy-api-settings |
| Context-aware access levels | Access Context Manager accessLevels: create, get, list, patch, delete, replaceAll. Assignment to apps: NONE found | Assignment yes | Levels are assigned per app and OU or group in the console. Blocking an app there does not block API access | https://docs.cloud.google.com/access-context-manager/docs/reference/rest ; https://knowledge.workspace.google.com/admin/security/assign-context-aware-access-levels-to-apps (search snippet) |
| Super-admin status | Directory users.makeAdmin (confirmed) | No | Super admin grant is a write | https://developers.google.com/workspace/admin/directory/reference/rest/v1/users |
| Admin role assignments | Directory roleAssignments: POST https://admin.googleapis.com/admin/directory/v1/customer/{customer}/roleassignments (scope admin.directory.rolemanagement). Granting super admin via API not stated | No | Path confirmed; required fields UNVERIFIED | https://developers.google.com/workspace/admin/directory/reference/rest/v1/roleAssignments/insert |
| Data regions | NONE. Policy data_regions.* read-only | Yes | Data > Compliance > Data regions | https://docs.cloud.google.com/identity/docs/concepts/supported-policy-api-settings ; https://knowledge.workspace.google.com/admin/compliance/choose-a-geographic-location-for-your-data (search snippet) |
| Vault retention rules | NONE in Vault REST reference (page dated 2025-03-17). A June 2026 post says Vault API support comes "in the coming weeks" | Yes | Not confirmed shipped | https://developers.google.com/workspace/vault/reference/rest ; https://workspaceupdates.googleblog.com/2026/06/google-vault-now-supports-retention-rules-and-litigation-holds-for-Gemini-app.html |
| Alert Center settings | GET and PATCH https://alertcenter.googleapis.com/v1beta1/settings (notifications with cloudPubsubTopic). Field list beyond that UNVERIFIED | No | v1beta1 only | https://developers.google.com/workspace/admin/alertcenter/reference/rest |
| Generic settings or policy API (2026) | Cloud Identity Policy API: policies create, get, list, patch, delete. Read coverage: Calendar, Gmail, 2SV (GA 2025-02-20). Writes: DLP only. Legacy Admin Settings API covers SSO and outbound gateway | Mostly | Super admin only. Most settings show mutate "No" | https://docs.cloud.google.com/identity/docs/reference/rest/v1beta1/policies ; https://workspaceupdates.googleblog.com/2025/02/policy-api-general-availability.html ; https://developers.google.com/workspace/admin/admin-settings |

### Answers to the structural questions

1. **What the Admin SDK can and cannot do.** Can: manage users (get, insert, update, patch, delete, undelete, signOut, makeAdmin), roles and roleAssignments, groups, OUs, domains, devices, Reports activity. Cannot: toggle any service per OU; set Drive sharing or link defaults; manage the DWD client allowlist or OAuth app trust; set Gmail routing or compliance at OU level; enforce 2SV (the field is read-only); set context-aware access, data regions, Vault retention or less-secure-app settings. Sources: the rows above.
2. **Cloud Identity vs Workspace.** Cloud Identity API v1 covers allowlistedDomains, devices, groups and memberships, inbound SAML and OIDC SSO, and SSO assignments. v1 has no users resource; the Policy API is in v1beta1 only. User provisioning goes through the Cloud Identity SCIM API (customers.v2.Users, scope admin.directory.user). Editions: Free and Premium both include "Automate tasks with Apps Script and APIs"; automated user provisioning and Context-Aware Access are Premium only; Free excludes Gmail and Workspace apps. Whether a Cloud Identity-only tenant can use the Directory API: UNVERIFIED. Sources: https://docs.cloud.google.com/identity/docs/reference/rest ; https://docs.cloud.google.com/identity/docs/editions ; https://docs.cloud.google.com/identity/docs/scim/reference/rest (search snippet)
3. **Organisation creation.** Signup only. The organisation is created when a Workspace or Cloud Identity account is tied to a verified domain, or on first console login, new project or billing account. No create method found. The API surface is organizations.search and `gcloud organizations list`. Source: https://docs.cloud.google.com/resource-manager/docs/creating-managing-organization
4. **Billing account linking.** Cloud Billing API: PUT https://cloudbilling.googleapis.com/v1/{name=projects/*}/billingInfo with billingAccountName (empty disables billing). gcloud: `gcloud billing projects link PROJECT_ID --billing-account=ACCOUNT_ID`. Roles: roles/billing.user on the billing account or org, plus roles/billing.projectManager on the project, folder or org, or Owner. CONFLICT: the updateBillingInfo page says "ownership privileges for both"; the billing-access page does not. Sources: https://docs.cloud.google.com/billing/docs/reference/rest/v1/projects/updateBillingInfo ; https://docs.cloud.google.com/billing/docs/how-to/billing-access ; https://docs.cloud.google.com/sdk/gcloud/reference/billing/projects/link
5. **Quota increase requests.** Cloud Quotas API quotaPreferences: create, get, list, patch, e.g. POST https://cloudquotas.googleapis.com/v1/{parent=projects/*/locations/*}/quotaPreferences. contactEmail is required for increases. Cap: 300 quota-increase requests per day per project. The console refuses quotas with no prior usage; REST and gcloud accept them. System limits are fixed. quotaAdjusterSettings get and update also exist. The list of API-requestable versus console-only quotas: UNVERIFIED. Sources: https://docs.cloud.google.com/docs/quotas/reference/rest/v1/projects.locations.quotaPreferences ; https://docs.cloud.google.com/docs/quotas/quotas ; https://docs.cloud.google.com/docs/quotas/known-issues
6. **Support tickets.** No supportTickets resource. The Cloud Support API (https://cloudsupport.googleapis.com, v2 and v2beta) exposes cases (create, get, list, patch, search, close, escalate), comments, attachments, media and caseClassifications. Plan requirement: Standard, Enhanced or Premium (no extra charge); Basic exclusion inferred from a search snippet. Sources: https://docs.cloud.google.com/support/docs/apis ; https://docs.cloud.google.com/support/docs/reference/support-api (search snippet)
7. **Organization Policy v2.** orgpolicy.googleapis.com/v2 projects.policies: create (POST /v2/{parent=projects/*}/policies), get, list, patch, delete, getEffectivePolicy. Constraints: GET /v2/{parent=projects/*}/constraints (pageSize and pageToken currently unused). Policy fields: spec, dryRunSpec (audit only), etag. Automation-relevant constraints: constraints/iam.managed.disableServiceAccountKeyCreation, iam.managed.disableServiceAccountCreation, iam.managed.disableServiceAccountKeyUpload, iam.managed.disableServiceAccountApiKeyCreation, iam.managed.allowedPolicyMembers. Use dryRunSpec first; policies are usually not retroactive. Sources: https://docs.cloud.google.com/resource-manager/docs/reference/orgpolicy/rest/v2/projects.policies/create ; https://docs.cloud.google.com/resource-manager/docs/reference/orgpolicy/rest/v2/projects.constraints/list ; https://docs.cloud.google.com/resource-manager/docs/organization-policy/org-policy-constraints ; https://docs.cloud.google.com/resource-manager/docs/organization-policy/overview

UNVERIFIED in section 5:
- API for Calendar or service on/off, Gmail routing, DWD allowlist, OAuth trust, context-aware app assignment, data regions: NONE from the Admin help and Policy settings table; not checked against a full Admin SDK method index.
- 2SV enforcement write path and the Policy mutate flag.
- Super-admin grant via roleAssignments and its required fields.
- Vault retention API (announced, not in reference).
- Alert Center fields beyond cloudPubsubTopic.
- Cloud Identity-only tenant on the Directory API.
- Quotas that are API-requestable versus console-only.
- Billing permission wording (CONFLICT, above).
- supportTickets name; plan requirement from a snippet.
- Legacy iam.disableServiceAccountKeyCreation (not seen).
- Google Cloud 2SV start date (CONFLICT, section 1).

## 6. Policy and security notes

### 6a. OAuth verification and scopes

| Topic | Rule (exact) | Applies to | Date | Automation impact | Source |
|---|---|---|---|---|---|
| Verification trigger | Requesting sensitive or restricted scopes "probably" triggers verification. Exempt: apps in testing or staging mode, internal use, personal use, and a service account accessing only its own data | External OAuth clients | Sensitive-scope page 2026-08-19; exemptions page undated | Verify before any broad launch | https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification ; https://support.google.com/cloud/answer/13464323 |
| Restricted: Gmail | mail.google.com/, gmail.readonly, gmail.modify, gmail.compose, gmail.insert, gmail.metadata, gmail.settings.basic, gmail.settings.sharing. Sensitive: gmail.send, gmail.addons.current.message.metadata, gmail.addons.current.message.readonly | Gmail API | 2026-09-10 | Any mailbox-reading tool needs restricted verification | https://developers.google.com/workspace/gmail/api/auth/scopes |
| Restricted: Drive | drive, drive.readonly, drive.activity(.readonly), drive.meet.readonly, drive.metadata(.readonly), drive.scripts. Sensitive: drive.apps.readonly. Non-sensitive: drive.file, drive.appdata, drive.appfolder, drive.install | Drive API | 2026-09-03 | drive.file (per-file access) avoids the restricted tier where it fits | https://developers.google.com/workspace/drive/api/guides/api-specific-auth |
| Calendar | No Calendar scope is labelled restricted on the auth page. Sensitive-scope page names reading Calendar events as a sensitive example | Calendar API | 2026-09-03 | Expected path is sensitive review | https://developers.google.com/workspace/calendar/api/auth ; https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification |
| Security assessment (CASA) | For restricted scopes: "you need to complete a security assessment" by an approved third-party assessor. Reverify "at least every 12 months" | Restricted scopes only, server-side storage | 2026-08-19 | Any server-side agent holding Gmail or Drive data needs CASA and annual reassessment. Tiers and cost UNVERIFIED | https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification ; https://support.google.com/cloud/answer/13463817 |
| Review time | Sensitive: "typically takes 3-5 business days". FAQ table: 10 business days (sensitive), 6 weeks (restricted) | Both tiers | Sources disagree (CONFLICT) | Plan lead time | https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification ; https://support.google.com/cloud/answer/13463817 |
| 100-user cap | "limited to 100 new users until it is verified"; the cap "applies over the entire lifetime of the project, and it cannot be reset or changed" | Unverified apps using sensitive or restricted scopes | Undated | Testing unapproved scopes in a production project uses up the cap permanently | https://support.google.com/cloud/answer/7454865 ; https://support.google.com/cloud/answer/13463817 |
| Testing status | Limited to 100 test users; test-user authorizations "expire seven days from the time of consent" | External apps in Testing | Undated | Test accounts must re-consent weekly | https://support.google.com/cloud/answer/15549945 |
| 7-day refresh-token expiry | External apps in Testing: refresh tokens expire in 7 days unless only openid, userinfo.email or userinfo.profile are requested. Limit of 100 refresh tokens per account per client ID; oldest invalidated "without warning". Not applied to service accounts | External apps in Testing | 2026-05-26 | Unattended automation breaks weekly. Use a service account or move to production | https://developers.google.com/identity/protocols/oauth2#expiration |
| Internal-only app | Internal apps skip the unverified-app screen and the 100-user cap. Only users in the Workspace or Cloud Identity organization can use them; "might need approval from an organization administrator". Restricted or sensitive scopes still need verification for DWD apps | Internal user type | Undated | Skips verification but stays org-only | https://support.google.com/cloud/answer/13464323 ; https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification |

UNVERIFIED: Google Fit restricted-scope claim (search summary only); the 100-user cap during Testing (sources conflict: one page exempts dev and testing apps, a search excerpt says the cap applies); CASA tiers and cost; the Calendar restricted tier; Workspace "restricted" third-party Gmail rule for more than 100 worldwide users (search excerpt of a help page).

### 6b. Workspace API controls and app allowlists

| Topic | Rule (exact) | Applies to | Date | Automation impact | Source |
|---|---|---|---|---|---|
| Location and privilege | Menu > Security > Access and data control > API controls. Requires the Service Settings administrator privilege | Workspace admins | 2026-10-13 | Developers cannot self-approve; an admin must allow each client | https://knowledge.workspace.google.com/admin/apps/control-which-apps-access-google-workspace-data?hl=en |
| Access levels | Trusted: access to all Workspace services including restricted ones. Limited: unrestricted services only. Blocked: no Google data | Each OAuth client ID | 2026-10-13 | Restricted Gmail or Drive scopes need Trusted | same as above |
| Trust internal apps | "allows internal apps built by your organization to access restricted Google Workspace APIs" (one checkbox for all internal apps) | Internal apps | 2026-10-13 | Internal automation fails on restricted APIs until this is checked | same as above |
| Restricting a service | "any previously installed apps that you haven't trusted stop working, and tokens are revoked" | Each Workspace service | 2026-10-13 | Switching a service can revoke automation tokens with no warning | same as above |
| Unconfigured-app default | Default: "Allow users to access any third-party apps"; alternatives restrict to basic sign-in or block all | Org-wide setting | 2026-10-13 | Default allows unreviewed clients. Lock it down before rollout | same as above |

### 6c. Domain-wide delegation (DWD)

| Topic | Rule (exact) | Applies to | Date | Automation impact | Source |
|---|---|---|---|---|---|
| How DWD works | Admin enters the service account's Client ID and the scope list. Access is "constrained by two factors: the permissions of the impersonated user and the OAuth scopes you authorize". Service accounts "aren't subject to domain policies set by Google Workspace administrators" | Service accounts | Developer page 2026-03-23 | The authorized scope list is the ceiling. Allowlist exact scopes | https://developers.google.com/identity/protocols/oauth2/service-account |
| Admin path and rights | Menu > Security > Access and data control > API controls > Manage Domain Wide Delegation. Super administrator sign-in required | Super admins | 2026-10-13 | Any scope change is a super-admin action | https://knowledge.workspace.google.com/admin/apps/control-api-access-with-domain-wide-delegation?hl=en |
| Scope escalation | "the app has access to the data belonging to all of your users"; delegation allows access "bypassing end user consent" | DWD clients | 2026-10-13 | Each added scope widens reach to every user. Treat as a security review | https://knowledge.workspace.google.com/admin/apps/control-api-access-with-domain-wide-delegation?hl=en ; https://knowledge.workspace.google.com/admin/apps/domain-wide-delegation-best-practices?hl=en |
| Least privilege | "Do not give access to non-essential OAuth scopes"; "Avoid using domain-wide delegation if you can accomplish your task directly"; periodically remove unneeded scopes | Admins and developers | 2026-10-13 | Prefer per-user OAuth. Use DWD only for admin-scale batch work | same as the two URLs above |
| Audit and monitoring | Admin audit events AUTHORIZE_API_CLIENT_ACCESS and REMOVE_API_CLIENT_ACCESS (params API_CLIENT_NAME, API_SCOPES, DOMAIN_NAME). Access Evaluation value DOMAIN_WIDE_DELEGATION. Drive log "Impersonation" event | Reports API | 2026-09-03 / 2026-10-13 | Poll activities.list for these events and alert on DWD-impersonated Drive events | https://developers.google.com/admin-sdk/reports/v1/reference/activity-ref-appendix-a/admin-domain-events ; https://developers.google.com/workspace/admin/reports/v1/appendix/activity/access-evaluation ; https://knowledge.workspace.google.com/admin/reports/drive-log-events?hl=en |

UNVERIFIED: whether every DWD grant logs AUTHORIZE_API_CLIENT_ACCESS (event name confirmed, no example payload); admin audit log retention (separate page not retrieved).

### 6d. Google Cloud service-account key policies

| Topic | Rule (exact) | Applies to | Date | Automation impact | Source |
|---|---|---|---|---|---|
| iam.disableServiceAccountKeyCreation | "If your organization was created on or after May 3, 2024, this constraint is enforced by default." Baseline name constraints/iam.managed.disableServiceAccountKeyCreation | Orgs created on or after 2024-05-03 | Docs 2026-10-13; announced 2024-03-21 | Keys cannot be created in new orgs unless a project is exempted | https://docs.cloud.google.com/resource-manager/docs/organization-policy/restricting-service-accounts ; https://docs.cloud.google.com/resource-manager/docs/manage-baseline-constraints |
| Existing orgs | "Existing organization resources are not impacted by this change." Orgs created February to April 2024 "might also have these default policy enforcements set" | Orgs created before 2024-05-03 | Blog 2024-03-21 | Check org policy state with gcloud before assuming keys are blocked | https://cloud.google.com/blog/products/identity-security/introducing-stronger-default-org-policies-for-our-customers |
| iam.disableServiceAccountKeyUpload | Disables upload of external public keys to service accounts. Same May 3, 2024 default | Same as above | 2026-10-13 | Blocks bring-your-own key upload | https://docs.cloud.google.com/resource-manager/docs/organization-policy/restricting-service-accounts |
| iam.serviceAccountKeyExpiryHours | Keys expire after the set period. Default: keys never expire. Allowed: 1h, 8h, 24h, 168h, 336h, 720h, 1440h, 2160h | Keys that must exist | 2026-10-13 | Short expiry can cause a production outage for long jobs | same as above |
| Recommended alternatives | Order: attached service account; Workload Identity Federation for GKE; user credentials for a single-user dev machine; impersonation; external Workload Identity Federation; key as "final fallback" | All workloads | 2026-10-13 | Move CI and servers to federation. Use impersonation for developers | https://docs.cloud.google.com/iam/docs/migrate-from-service-account-keys ; https://docs.cloud.google.com/iam/docs/best-practices-for-managing-service-account-keys |
| Impersonation | Avoids keys: "create additional security risk". Needs iam.serviceAccounts.getAccessToken (for example roles/iam.serviceAccountTokenCreator) | Developers and automation | 2026-10-13 | Preferred over keys for local work | https://docs.cloud.google.com/iam/docs/service-account-impersonation |

UNVERIFIED: Workload Identity Federation for GitHub Actions (migration page does not cover it); existing orgs created before February 2024 (no primary statement).

### 6e. Application Default Credentials and gcloud

| Topic | Rule (exact) | Applies to | Date | Automation impact | Source |
|---|---|---|---|---|---|
| gcloud auth application-default login | Web flow; credentials stored at the well-known location; overwrites earlier ADC. "The gcloud CLI itself doesn't use ADC" | Developer workstations | 2026-05-27 | Standard dev path. The file holds user-level access to every API that user can reach | https://docs.cloud.google.com/sdk/gcloud/reference/auth/application-default/login |
| File location | Linux and macOS: $HOME/.config/gcloud/application_default_credentials.json. Windows: %APPDATA%\gcloud\application_default_credentials.json | Local machines | 2026-10-13 | Any local process running as the user, including MCP servers, can read it | https://docs.cloud.google.com/docs/authentication/application-default-credentials |
| Production stance | Attached service account is "the preferred method... in a production environment". Keys "create a security risk and are not recommended" | Production | 2026-10-13 | Do not ship key files with an MCP server | same as above |

### 6f. Secrets, tokens and API keys

| Topic | Rule (exact) | Applies to | Date | Automation impact | Source |
|---|---|---|---|---|---|
| Secret storage | Secret Manager stores "sensitive data such as API keys"; encrypted with AES-256. OAuth tokens not named on the page | Client secrets, API keys, credentials | 2026-10-13 | Store API keys and client secrets here | https://docs.cloud.google.com/secret-manager/docs/overview |
| OAuth credentials and tokens | "Only store these credentials in secure storage, for example using a secret manager". "Store tokens securely at rest and never transmit them in plain text." "Revoke tokens as soon as they are no longer needed" | Refresh and access tokens | 2026-05-20 | Encrypt refresh tokens at rest. Keep them out of repos and logs | https://developers.google.com/identity/protocols/oauth2/resources/best-practices |
| Key restrictions | "Unrestricted API keys are insecure."; restrict each key with one application-restriction type and one or more API restrictions | Maps Platform and any key-based API | 2026-10-13 | Every key needs an API restriction and an app restriction | https://developers.google.com/maps/api-security-best-practices ; https://docs.cloud.google.com/docs/authentication/api-keys |
| Server-side use | "best secured through IP address restrictions"; "Don't allow clients to relay arbitrary API calls using the proxy" | Server-side automation | 2026-10-13 | Keep keys on the server; route client calls through an authenticated proxy | https://developers.google.com/maps/api-security-best-practices |
| Cost and rotation | "You are financially responsible for charges caused by abuse of unrestricted API keys." "Regenerate API keys cautiously and only as a last resort" | Maps and key-based APIs | 2026-10-13 | Abuse of an unrestricted key is billed to the owner | https://developers.google.com/maps/api-security-best-practices |

### 6g. Audit logs

| Topic | Rule (exact) | Applies to | Date | Automation impact | Source |
|---|---|---|---|---|---|
| Cloud Audit Logs defaults | Admin Activity and System Event: always written, cannot be disabled. Data Access: "Except for BigQuery, Data Access audit logs are disabled by default". Policy Denied: generated by default | All Cloud projects | 2026-10-13 | Secret reads and other data reads need Data Access logging turned on per project | https://docs.cloud.google.com/logging/docs/audit |
| Per-service examples | AccessSecretVersion is DATA_READ. CreateServiceAccountKey is ADMIN_WRITE | Secret Manager, IAM | 2026-10-13 | Key creation is always logged. Secret reads only if enabled | https://docs.cloud.google.com/secret-manager/docs/audit-logging ; https://docs.cloud.google.com/iam/docs/audit-logging |
| Cloud MCP servers | "Google Cloud MCP servers write Data Access audit logs that are service-specific." Enable with audit logging for mcp.googleapis.com | MCP servers on Google Cloud | 2026-10-13 | Turn it on for any MCP endpoint we use | https://docs.cloud.google.com/logging/docs/audit/services |
| Retention | _Required bucket: 400 days (not configurable). _Default bucket: 30 days | Cloud Logging | 2026-10-13 | Export if longer history is needed | https://docs.cloud.google.com/logging/quotas |

UNVERIFIED: Data Access defaults for Cloud Storage, Compute and IAM (per-service pages not fully read); token generation logging (generateAccessToken, signJwt).

### 6h. Product-specific approval and quota rules

| Product | Rule | Date | Automation impact | Source |
|---|---|---|---|---|
| Search Console verification | DNS is the only method for Domain properties. HTML file, meta tag, Google Analytics and Tag Manager apply to URL-prefix properties. The homepage or file must not require login. GA needs the same Google account; GTM needs Publish or Admin. Multiple owners allowed. Removing a token unverifies that owner; if all owners lose access, all users lose access | Undated | Adding owners: webResource.update (caller must already be a verified owner; UNVERIFIED) | https://support.google.com/webmasters/answer/9008080 ; https://developers.google.com/site-verification/v1/webResource |
| Search Console API | sites.add (PUT https://www.googleapis.com/webmasters/v3/sites/{siteUrl}) and sites.list (GET) return permission level. No delegated-owner handling in the API; owners change only through Site Verification update | 2024 pages | Whether sites.list shows delegated owners: not stated (UNVERIFIED) | https://developers.google.com/webmaster-tools/v1/sites/add ; https://developers.google.com/webmaster-tools/v1/sites/list |
| Business Profile API access | No self-serve API. Request via "Application for Basic API Access". Requires a verified, active Business Profile for at least 60 days with a website, plus owner or manager email and Cloud project number. One request covers the Business Profile APIs. Approval status: QPM 0 means not approved, 300 means approved. No timeline stated | 2026-08-28 | Gate for every GBP tool; no per-API approval shown | https://developers.google.com/my-business/content/prereqs |
| Business Profile content policy | "You cannot pre-fetch, cache, index, or store any content"; temporary storage limited to 30 calendar days. Own-account programmatic use is allowed. Automated review replies or listing edits need "the user's prior specific and express consent". Using GoogleLocations data for lead generation leads to "immediate revocation" | 2026-08-28 | No caching of GBP data; no lead lists; no automated edits without consent | https://developers.google.com/my-business/content/policies |
| YouTube Data API quota | Default 10,000 units per day. Extra quota needs a compliance audit ("YouTube API Services - Audit and Quota Extension Form"). The same form applies if audited in the last 12 months | 2026-10-08 (quota page); 2026-09-14 (audit page) | Plan audit lead time before exceeding 10,000 units | https://developers.google.com/youtube/v3/determine_quota_cost ; https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits |
| YouTube per-method cost | Table: captions.insert 400, captions.update 450, captions.delete 50, commentThreads.insert 50, list methods 1. CONFLICT: search.list and videos.insert costs (table gives videos.insert 1 with 100/day cap; summary says 1600 units; a snippet gives search.list 100 and videos.insert 1600) | 2026-10-08 | Check costs in the Cloud console before budgeting | https://developers.google.com/youtube/v3/determine_quota_cost |
| Google Ads developer token | Access levels: Test (automatic on enabling API; test accounts only; 15,000 operations/day). Explorer (application; 2,880/day production). Basic (Explorer first, plus brand verification; 15,000/day). Standard (Basic first, plus manual audit; unlimited, service rate limits apply). Standard review time: about 10 business days (typical) | 2026-10-14 | Production volume needs Basic or Standard; Ads MCP must run with the user's own token | https://developers.google.com/google-ads/api/docs/access-levels |
| Google Ads developer policy (MCP) | "Google prohibits third-party hosted interface, secondary API, wrapper service, or MCP server, proxy endpoint that solely replicates, wraps, or re-exposes Google Ads programmatic capabilities." Own programmatic use is not restricted. Scraping Google Search is prohibited | Undated (copyright 2026) | A hosted MCP serving other users is prohibited; a local tool with the user's own credentials is allowed | https://support.google.com/adspolicy/answer/6169371?hl=en |

### 6i. Automation-specific user data and AI policy

| Topic | Rule (exact) | Applies to | Date | Automation impact | Source |
|---|---|---|---|---|---|
| Workspace user data policy | Using user data "to create, train, or improve a machine learning or artificial intelligence model" is prohibited beyond that user's personalised model. Gmail "providing generative AI summaries" is an approved use. Human reading only with the user's affirmative agreement or for security | Restricted and sensitive Workspace scopes | 2026-09-03 | Per-user summaries are allowed; no training on user data; CASA applies | https://developers.google.com/workspace/workspace-api-user-data-developer-policy ; https://developers.google.com/workspace/gmail/api/policy |
| MCP and agents | "granularly require users to confirm the MCP, tool, skill, or other agentic behavior invocation"; defences against prompt injection | MCPs requesting user data | 2026-09-03 | Per-call user confirmation and prompt-injection defences are expected | https://developers.google.com/workspace/workspace-api-user-data-developer-policy |
| Google API Services User Data Policy | Page last updated 2024-02-15. Limited Use: "Limit your use of data to providing or improving user-facing features". No AI clause found | Non-Workspace user data | 2024-02-15 | Read alongside the Workspace policy above (newer) | https://developers.google.com/terms/api-services-user-data-policy |
| Google Maps Platform | Search excerpts: content may not be used "to improve machine learning and artificial intelligence models, including to train, test, validate or fine-tune the models". Bulk download and caching limited. Fetched page returned only its title | Maps Platform | Undated | Do not train models on Maps content; keep caches short | https://cloud.google.com/maps-platform/terms/maps-service-terms (search excerpt only; UNVERIFIED) |
| Google Terms | Prohibits "using automated means to access content from any of our services" where robots.txt or machine-readable instructions say not to, and using AI-generated output from our services to develop ML models | All Google services | Effective 2026-07-30 | Scraping Search or Maps and training on outputs are prohibited | https://policies.google.com/terms |
| Gemini API | Unpaid services: "human reviewers may read, annotate, and process your API input and output". Paid: Google "doesn't use your prompts... to improve our products". Models competing with the Services are prohibited | Gemini API clients | Effective 2026-03-23; updated 2026-04-28 | Use the paid tier for user data; keep sensitive data out of the unpaid tier | https://ai.google.dev/gemini-api/terms |
| Gemini in Workspace | "Workspace does not use customer data for training models without customer's prior permission or instruction." "Using third party apps with Gemini is governed by different terms" | Gemini in Workspace | 2026-10-06 / 2026-10-13 | Third-party MCP clients fall outside these protections | https://knowledge.workspace.google.com/admin/gemini/generative-ai-in-google-workspace-privacy-hub?hl=en |

UNVERIFIED: Google Business Profile Terms (only links to full terms found; no scraping clause in primary text); Google Ads developer policy date (no date on page); Search Console anti-scraping or AI clause (none found; per-site quota figures came from search excerpts of developers.google.com/webmaster-tools/limits, not fetched); Google APIs Terms (developers.google.com/terms, last modified 2021-11-09) apply generically.

## 7. Recommendations

Our four current servers (cloud, workspace-user, workspace-admin, searchconsole) plus gcloud-ops, gcloud-data, gcloud-compute and gbiz are already built. The four plugins vendor Discovery documents for most REST APIs (file names only were checked, not server code). The list below flags where a vendored file is missing and where an official remote server should be used instead of wrapping.

### 7a. Add, in order

| # | Plugin or server | Addition | One-line reason |
|---|---|---|---|
| 1 | google-cloud | Billing Budgets API (billingbudgets v1), list and create budgets | A cost guardrail for every other tool; REST and IAM-scoped; not in our vendored Discovery set |
| 2 | google-workspace (workspace-admin) | Cloud Identity Policy API read tools (policies, v1beta1) | Only public read path for Calendar, Gmail, 2SV and Drive sharing settings; we vendor cloudidentity v1, which has no policies resource |
| 3 | google-workspace (workspace-admin) | Reports audit tools for DWD and API-client grants (reports.v1 already vendored) | Exposes the AUTHORIZE_API_CLIENT_ACCESS events the DWD risk notes say to monitor, read-only |
| 4 | google-business (gbiz) | Business Profile v4 read tools for reviews, local posts and media | v4 is the only documented path for these; no v1 replacement confirmed; no v4 Discovery file is vendored |
| 5 | google-workspace (workspace-user) | Gmail push (users.watch) and history.list as an event source | Event-driven triggers without polling; REST; needs a Pub/Sub topic we own |
| 6 | google-workspace (workspace-user) | Drive changes.list with stored pageToken | Simpler than Drive push channels, which expire after at most one week |
| 7 | google-cloud | BigQuery hosted remote MCP (bigquery.googleapis.com/mcp) as a remote entry | Google-hosted, IAM-scoped, read-only by default; replaces wrapping bq |
| 8 | google-cloud | Firestore hosted MCP (23 tools) for Firestore; firebase-tools MCP (local, 69 tools) for Firebase features | Firebase is not in any of our plugins; the firebase-tools MCP covers deploy, rules and auth export |
| 9 | google-business (gbiz) | Google Ads read tools via the Google Ads REST or client-library path, local only | Official MCP is read-only and self-hosted; a hosted tool for other users is prohibited by policy |
| 10 | google-search (searchconsole) | Confirm the Site Verification (siteVerification v1 is vendored) and urlInspection tool coverage; add owner-list reads | Already vendored; confirm coverage rather than add new servers |
| 11 | google-workspace (workspace-user) | Chat incoming webhook as a send-only tool | One-way, no OAuth needed; limited to 1 request per second per space |
| 12 | google-cloud | Maps Grounding Lite hosted MCP (5 tools, API key) | Simple API-key auth; status not stated (UNVERIFIED); confirm the endpoint host first (CONFLICT) |

Items 5 and 6 need a Pub/Sub topic or watch channel owner. Confirm item 2's API version before implementation; the Policy API is documented in v1beta1 only. Scope needs for items 1 to 4 were not checked against each API's auth page (UNVERIFIED).

### 7b. Skip or defer

| Surface | Reason |
|---|---|
| Gemini CLI as an integration target | Consumer and free access ended 2026-06-18; successor is Antigravity CLI |
| Gemini CLI Workspace extension | Not officially supported; grants read, modify and delete across account data |
| gcloud-mcp (googleapis) as a dependency | Duplicates our gcloud servers and is labelled Preview; borrow its allow/deny ACL pattern instead |
| Google Analytics local MCP | Experimental and read-only; defer until a GA4 use case exists |
| Merchant API MCP | Alpha endpoint; revisit when GA |
| Google Trends API | Alpha and application-only; no public quota |
| Calendar CalDAV | Calendar v3 covers the same events with better auth and quotas |
| Gmail IMAP, SMTP and POP | Needs the restricted https://mail.google.com/ scope; Gmail API covers read and send |
| Cloud Storage XML API | JSON API and gcloud storage cover our needs; XML only for S3 compatibility |
| BigQuery Storage Read and Write APIs; Pub/Sub StreamingPull | gRPC streaming; use client libraries in a worker, not MCP tools |
| Meet Media API | Developer preview, closed to new signups |
| Google Photos Library API | 2025 scope removals limit it to app-created items |
| Chrome Web Store API | v1.1 shutdown unconfirmed; defer until extension publishing is in scope |
| Google Ads Scripts | No external API; runs inside the Ads UI |
| Google Developer Knowledge MCP (optional) | API-key, read-only docs search in public preview; useful grounding but not an access surface |
| Admin-console-only settings (section 5) | No API to wrap; a read-only audit tool is the most we can offer |
| Business Profile reviews and posts as automated writes | Policy requires the user's express consent for automated edits and review replies |

## 8. Open questions for the owner

1. Workspace edition or Cloud Identity tier (Free or Premium)? This decides whether the Policy API and automated provisioning are available.
2. Do we have super-admin access, and will we authorize DWD? Or should all user-data tools use per-user OAuth only?
3. Will we store Gmail or Drive content on our servers? If yes, budget for CASA and a 12-month reassessment, and expect the sensitive and restricted review timelines.
4. When was the Google Cloud organization created? Orgs created on or after 2024-05-03 block service account key creation by default. Check the org policy before designing key-based auth.
5. Will we accept Workspace Developer Preview enrollment (preview status, possible changes)?
6. Business Profile: are we managing only accounts we own? Policy allows own-account automation but prohibits hosted or third-party re-exposure. Do we have Basic API access approved?
7. Google Ads: which developer-token access level do we hold (Test, Explorer, Basic or Standard)? Are we okay with a local-only tool?
8. YouTube: do we expect more than 10,000 units per day? If yes, start the compliance audit early.
9. Search Console: which properties, and do we have DNS access for domain properties? Are there delegated owners?
10. Gemini CLI: are we tracking it? If so, should we switch to the Antigravity CLI after 2026-06-18?
11. Chrome Web Store: are we publishing extensions? If not, drop it.
12. Analytics: do we have GA4 admin rights for the properties we need, and is the local experimental MCP acceptable?

## 9. Unverified and conflicting items (consolidated)

- Gmail less-secure cutoff date (2025-03-14 vs 2025-05-01).
- Chrome Web Store v1.1 shutdown (date reached today; not confirmed).
- Business Profile Q&A status (discontinued vs listed in v4.9).
- Google Ads Developer Assistant version and official status.
- Maps Grounding Lite host (mapstools vs maps).
- Google Cloud 2SV enforcement start date (2026-10-20 vs 2026-09-15).
- Sensitive-scope review time (3-5 vs 10 business days).
- YouTube search.list and videos.insert unit costs.
- Billing account permissions wording (updateBillingInfo vs billing-access).
- Google Ads "developer tokens sunset 2026-09-09" meaning.
- Firebase SQL Connect remote MCP (endpoint, tools, auth).
- Analytics hosted endpoint (third-party blog only).
- About 70 of the roughly 80 Google Cloud remote-MCP entries not individually checked.
- Google Ads v20 and later sunset dates (third-party only).
- Cloud Identity-only tenant on the Directory API.
- Quotas that are API-requestable versus console-only.
- Vault retention-rule API.
- Google Fit restricted-scope claim.
- 100-user cap during Testing (sources conflict).
- Search Console per-site quota figures (search excerpts only).
