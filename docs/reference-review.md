# Google services reference repo review

## Summary

| Repo | Area(s) | Language | License | Last commit | Tools | Auth | Write tools | Verdict |
|---|---|---|---|---|---|---|---|---|
| googleapis__gcloud-mcp | Cloud | TypeScript, Node 20+ | Apache-2.0 | 2026-07-15 | 63 (4 packages) | local gcloud login, ADC | yes (18 write, 6 delete) | reuse-ideas |
| enesbol__gcp-mcp | Cloud | Python | MIT | 2025-03-08 | 36 | ADC or service account (Google client libraries) | yes (18 write, 5 delete) | skip |
| GoogleCloudPlatform__gemini-cloud-assist-mcp | Cloud (hosted, Private Preview) | none (docs and skills only) | Apache-2.0 | 2026-10-12 | 11 advertised, unverified | Google credentials, remote HTTP | yes (invoke_operation and others, "?") | reuse-ideas |
| google__skills | Cloud (skills, not a server) | Markdown | Apache-2.0 | 2026-10-13 | n/a | n/a | n/a | reuse-ideas |
| taylorwilsdon__google_workspace_mcp | Workspace user data | Python (FastMCP) | MIT | 2026-10-09 | 120 | user OAuth (OAuth 2.1 optional) | yes (64 write, 34 flagged destructive) | reuse-ideas |
| aaronsb__google-workspace-mcp | Workspace user data | TypeScript | Apache-2.0 (also a LICENSE-MIT file) | 2026-10-01 | 12 (104 operations) | user OAuth, loopback, multi-account | yes (several per manage_* tool) | reuse-ideas |
| dguido__google-workspace-mcp | Workspace user data | TypeScript | MIT | 2026-03-11 | 88 | user OAuth with PKCE | yes (46 write, 11 delete "?") | reuse-ideas |
| adelaidasofia__google-workspace-mcp | Workspace user data | Python (FastMCP) | MIT | 2026-10-06 | 63 | user OAuth, multi-account, OS keyring | yes (34 write, 6 delete "?") | reuse-ideas |
| EveryInc__google-workspace-mcp-server | Workspace user data | TypeScript | MIT | 2026-03-10 | 34 | single-account refresh token from env | yes (14 write, 1 delete) | reuse-ideas |
| adexltd__mcp-google-suite | Workspace user data (Drive, Docs, Sheets) | Python | MIT | 2025-03-28 | 8 | user OAuth, plaintext token file | yes (5) | skip |
| ChrisNoronha__google-cli-mcp | Workspace user data, Admin (Directory, Reports) | TypeScript | none (README says MIT) | 2026-03-25 | dynamic; Directory 128 (derived) | bearer token env or ADC | yes (Directory 62 write, 20 delete) | reuse-ideas |
| obe711__google-workspace-mcp | Workspace user data, Admin (users list) | TypeScript | none | 2026-02-21 | 20 | service account with domain-wide delegation, readonly scopes | no | reuse-ideas |
| orvice__google-workspace-mcp | Admin (Directory users and groups), user data | Go | none | 2026-06-14 | 34 | service account with domain-wide delegation; optional bearer for HTTP | yes (15 write, 4 delete) | reuse-ideas |
| securityfortech__google-admin-mcp | Admin (Directory users) | JavaScript | MIT | 2025-07-07 | 5 | user OAuth refresh token in base64 env var | yes (3 write, 0 delete) | skip |
| GAM-team__GAM | Admin (primary), user data | Python CLI (not MCP) | Apache-2.0 | 2026-10-13 | n/a | n/a (CLI) | n/a | reuse-ideas |
| hashicorp__terraform-provider-googleworkspace | Admin (Directory) | Go Terraform provider (not MCP) | MPL-2.0 | 2025-06-30 | n/a | n/a | n/a | reuse-ideas |
| harisnadeem__searchconsole-mcp | Search Console | Python | Apache-2.0 | 2026-04-01 | 7 | ADC (scope webmasters.readonly) | yes (1 write, 1 delete; scope mismatch) | skip |
| mikusnuz__gsc-mcp | Search Console, Indexing API | TypeScript | MIT | 2026-10-08 | 13 | OAuth refresh token from env, or service account | yes (4 write, 2 delete) | reuse-ideas |
| metehan777__google-search-console-mcp | Search Console | Python | none | 2025-03-30 | 9 | user OAuth, token.json in source dir | no (submit_url is simulated) | skip |

Verdict counts: reuse-as-is 0, reuse-ideas 14, skip 5.

No repo is ready to adopt for our four servers. Every repo that has code covers at most two of our four areas, and none has confirmation gating for destructive actions. The useful inputs are patterns: tool tiers, read-only modes, per-service permission levels, and safety policies.

## Scope and method

Date: 2026-10-13. Scope: the 19 folders under `D:/Projects2/Google-services-mcps/reference/`.

Method: read and grep only. Nothing was installed, built, run, or modified in those folders. Tool counts come from static grep of tool registrations, not from a running server. Read, write, and delete splits come from tool names, MCP annotations where the code has them, and HTTP methods. Uncertain items are marked "?". GAM and the Terraform provider are summarized only, as requested, and are not MCP servers.

## Cross-cutting findings

- Read-only modes exist in taylorwilsdon (`--read-only`), dguido (`GOOGLE_WORKSPACE_READ_ONLY=true`), aaronsb (`GWS_SAFETY_POLICY=read-only` plus per-account read scopes), and the gcloud-mcp storage and backupdr packages (safe mode and `--access-level READ_ONLY`). Most other repos have none.
- Confirmation before destructive actions is rare. dguido requires `confirm: true` only for `empty_trash`. adelaidasofia has `dry_run` on three tools (gmail_send, gmail_reply, drive_trash). Elsewhere, permanent deletes run immediately: orvice delete_user and delete_group, enesbol's five delete tools, gcloud-mcp delete_bucket and delete_object (blocked unless `--enable-destructive-tools`), and all ChrisNoronha Directory deletes.
- Auth models in use: user OAuth for most Workspace user-data servers; service account with domain-wide delegation for obe711 and orvice; ADC for the gcloud-mcp storage, observability, and backupdr packages, harisnadeem, and enesbol. No repo covers more than two of our four areas.
- Token storage: OS keyring (adelaidasofia, with a file fallback), per-user files (taylorwilsdon in `~/.google_workspace_mcp/credentials`, aaronsb, and dguido with mode 0600), and plaintext (adexltd at `~/.google/server-creds.json`, metehan777 `token.json` next to the source).
- Outbound calls outside Google: adelaidasofia `hooks/install-ping.py` POSTs plugin name and version once to `myceliumai.co` as a Claude Code plugin hook (opt-out `MYCELIUM_NO_PING=1`). No other non-Google hosts were found in code.
- Unauthenticated HTTP exposure: adexltd SSE and WebSocket servers bind 0.0.0.0 with no auth. orvice HTTP mode runs without auth unless `MCP_AUTH_TOKEN` is set. taylorwilsdon HTTP mode defaults to 0.0.0.0 (not fully traced).
- Admin and Directory gap: no licensed Directory server has write gating. The candidates are orvice (Go, domain-wide delegation, 34 tools, no license), obe711 (read-only, no license), and ChrisNoronha (generated Directory tools, no license). GAM (Apache-2.0) and the HashiCorp provider (MPL-2.0) are useful as command and resource checklists.
- License gaps: no LICENSE file in obe711, orvice, ChrisNoronha, or metehan777. Treat their code as ideas only, not copyable code.
- Tool-name length: every server stays under the 64-character MCP limit. ChrisNoronha caps names at 64 with a hash suffix. gcloud-mcp registers `list_buckets` in both storage and observability, so the two collide if loaded together.

## Corrections to the handoff notes (HANDOFF.md)

- gcloud-mcp: the handoff says "one tool, run_gcloud_command". The `@google-cloud/gcloud-mcp` package has that one tool, but the repo has four packages with 63 tools in total.
- taylorwilsdon: the handoff says about 121 tools. The code registers 120.
- obe711: the handoff says `list_users` only. The repo has 20 read-only tools across Gmail, Drive, Sheets, Docs, Slides, Calendar, and Directory.
- orvice: the handoff says last push March 2025 with zero stars. The latest commit is 2026-06-14. The repo covers Directory user and group create, update, and delete, not only reads. Star count not checked.
- ChrisNoronha: the handoff says Directory operations unknown. The code is a generic Discovery-document proxy. The Directory count (128) is derived from a live fetch of today's Discovery document, not from running the server.
- metehan777 and harisnadeem: not in the handoff's assessment. metehan777 has a simulated `submit_url`. harisnadeem's sitemap write and delete tools request a read-only scope.

## Per-repo details

## Cloud

### googleapis__gcloud-mcp

- **Path / remote:** D:/Projects2/Google-services-mcps/reference/googleapis__gcloud-mcp ; https://github.com/googleapis/gcloud-mcp.git
- **Purpose and product areas:** Official Google monorepo of four stdio MCP servers for Google Cloud (generic gcloud runner, Cloud Storage, Observability, Backup and DR). Areas: Cloud only (no Workspace, Directory, or Search Console).
- **Language and entry point:** TypeScript on Node. README requires Node 20 or higher (.nvmrc says 20; no `engines` field in any package.json). npm workspaces + turbo, esbuild bundle to `dist/bundle.js` per package (bin). Install: `npx @google-cloud/gcloud-mcp init --agent=gemini-cli` (or `npx -y @google-cloud/gcloud-mcp` in an MCP client config). Packages:
  - `@google-cloud/gcloud-mcp` 0.5.3 (packages/gcloud-mcp/src/index.ts, bin gcloud-mcp)
  - `@google-cloud/storage-mcp` 0.6.0 (packages/storage-mcp/src/index.ts)
  - `@google-cloud/observability-mcp` 0.2.3 (packages/observability-mcp/src/server.ts)
  - `@google-cloud/backupdr-mcp` 0.1.0 (packages/backupdr-mcp/src/index.ts)
- **License:** Apache-2.0 (LICENSE file); all package.json files also say Apache-2.0 (consistent).
- **Last commit:** 2026-07-15, "chore(deps-dev): bump js-yaml from 4.1.1 to 4.3.0 (#451)"
- **Transport:** stdio only (StdioServerTransport in the packages' entry points; no HTTP/SSE found).
- **Auth:** No OAuth flow and no service-account handling in this repo's code. gcloud-mcp shells out to the local `gcloud` binary, so it uses whatever gcloud is logged in as. storage, observability and backupdr use Application Default Credentials (`GoogleAuth` with cloud-platform scope in packages/observability-mcp/src/utils/api_client_factory.ts and packages/backupdr-mcp/src/utility/gcp_http_client.ts; `Storage` client in packages/storage-mcp/src/utility/api_client_factory.ts). Project comes from a `project_id` param or env GOOGLE_CLOUD_PROJECT / GCP_PROJECT_ID. The repo stores no tokens itself.
- **Registered tools:** 63 total across 4 packages (from registerTool / server.tool greps).
  - gcloud-mcp (1; packages/gcloud-mcp/src/tools/run_gcloud_command.ts): run_gcloud_command
  - observability-mcp (13; packages/observability-mcp/src/tools/registration.ts): list_log_entries, list_log_names, list_buckets, list_views, list_sinks, list_log_scopes, list_metric_descriptors, list_time_series, list_alert_policies, list_alerts, list_traces, get_trace, list_group_stats
  - storage-mcp (24; packages/storage-mcp/src/tools/{buckets,objects,insights}/*.ts): check_iam_permissions, create_bucket, delete_bucket, get_bucket_location, get_bucket_metadata, list_buckets, update_bucket_labels, view_iam_policy, execute_insights_query, get_metadata_table_schema, list_insights_configs, copy_object, copy_object_safe, delete_object, download_object, list_objects, move_object, read_object_content, read_object_metadata, update_object_metadata, upload_object, upload_object_safe, write_object, write_object_safe
  - backupdr-mcp (25; packages/backupdr-mcp/src/tools/<group>/*.ts): csql_restore, delete_backup, get_backup, get_csql_operation, get_backupdr_operation (file get_operation.ts), list_backups, restore_backup, create_backup_plan, delete_backup_plan, get_backup_plan, list_backup_plans, update_backup_plan, create_backup_plan_association, delete_backup_plan_association, get_backup_plan_association, list_backup_plan_associations, trigger_backup, create_backup_vault, delete_backup_vault, get_backup_vault, list_backup_vaults, get_datasource, list_datasources, find_protectable_resources, list_resource_backup_configs (file list_resource_backup_config.ts)
  - Note: names like list_buckets exist in both storage and observability (collision if both servers are loaded under one namespace). READMEs not diffed against code.
- **Read / Write / Delete:** no MCP readOnlyHint/destructiveHint annotations anywhere in src; classified from names and API calls.
  - Read 38: all 13 observability; storage 11 (check_iam_permissions, get_bucket_location, get_bucket_metadata, list_buckets, view_iam_policy, execute_insights_query?, get_metadata_table_schema, list_insights_configs, list_objects, read_object_content, read_object_metadata); backupdr 14 (get_backup, get_csql_operation, get_backupdr_operation, list_backups, get_backup_plan, list_backup_plans, get_backup_plan_association, list_backup_plan_associations, get_backup_vault, list_backup_vaults, get_datasource, list_datasources, find_protectable_resources, list_resource_backup_configs)
  - Write 18: storage 11 (create_bucket, update_bucket_labels, update_object_metadata, write_object, write_object_safe, upload_object, upload_object_safe, copy_object, copy_object_safe, move_object? (copy+delete source), download_object? (writes a local file)); backupdr 7 (csql_restore, restore_backup, create_backup_plan, update_backup_plan, create_backup_plan_association, trigger_backup, create_backup_vault)
  - Delete 6: storage delete_bucket, delete_object; backupdr delete_backup, delete_backup_plan, delete_backup_plan_association, delete_backup_vault
  - Arbitrary 1: run_gcloud_command (read, write or delete depending on args).
- **Longest tool name:** 30 characters (create_backup_plan_association, delete_backup_plan_association).
- **Safety notes:**
  - Arbitrary gcloud tool: `run_gcloud_command` takes `args: string[]` and runs `child_process.spawn('gcloud', args)` with no shell, so pipes, substitution and redirection do not work (the description also forbids them). The command is first parsed via a gcloud lint step (gcloud.lint) to isolate the command path from flags, then checked against an access control list (packages/gcloud-mcp/src/denylist.ts, doc/denylist.md).
  - Blocklist: default deny is ALWAYS on and not user-removable (`default_deny` in packages/gcloud-mcp/src/index.ts): `compute start-iap-tunnel`, `compute connect-to-serial-port`, `compute tpus tpu-vm ssh`, `compute tpus queued-resources ssh`, `compute ssh`, `cloud-shell ssh`, `workstations ssh`, `app instances ssh`, `interactive`, `meta`. It covers interactive/SSH/tunnel commands only; it does NOT block destructive commands such as `delete`. Matching is by normalized command-group prefix; denying a GA command also denies alpha/beta. Optional user config via `-c /abs/path/config.json` with either `allow` or `deny` (not both). Denied calls return a message plus a suggested permitted alternative (packages/gcloud-mcp/src/suggest.ts). The tool also answers `["gcloud-mcp","debug","config"]` with the active ACL.
  - Confirmation or dry-run for destructive ops: none found (no confirm parameter). Gating is by server mode instead.
  - Read-only flag: storage-mcp defaults to "safe mode" (only create_bucket plus `*_safe` write tools using ifGenerationMatch=0 no-overwrite preconditions; overwrite/delete/move/label/metadata/download tools are off) and `--enable-destructive-tools` enables the rest (packages/storage-mcp/src/index.ts, src/tools/index.ts). backupdr-mcp has `--access-level READ_ONLY|UPSERT|ALL`, default READ_ONLY, implemented by tool-name substring matching (get/list/fetch/find; UPSERT = name lacks "delete") in packages/backupdr-mcp/src/index.ts. gcloud-mcp has no read-only flag (only the allow/deny list). observability is read-only by nature.
  - Hard-coded secrets: none found (greps for AIza, AKIA, GOCSPX, ya29., PEM headers, client_secret, password literals returned nothing).
  - Suspicious code: only child_process.spawn of `gcloud`, `where.exe`/`which`, and on Windows a Python interpreter running gcloud.py (packages/gcloud-mcp/src/gcloud_executor.ts, windows_gcloud_utils.ts): benign, argument arrays, no shell. No eval, new Function, curl/wget, fetch to non-Google hosts, or telemetry found in package src. Go integration test harness in tests/integration not reviewed in detail.
- **Reusable ideas:**
  - Allow/deny ACL with prefix and release-track normalization plus "suggest alternative" error: packages/gcloud-mcp/src/denylist.ts, suggest.ts
  - Safe vs destructive tool tiers via CLI flag, with no-overwrite `_safe` variants: packages/storage-mcp/src/tools/index.ts, src/index.ts
  - Access-level gating of a whole suite (name-substring matching is fragile; explicit annotations would be better): packages/backupdr-mcp/src/index.ts
  - One-file-per-tool layout with co-located tests and an index.ts registry; singleton ApiClientFactory; logger: packages/storage-mcp/src/tools/**, src/utility/api_client_factory.ts, logger.ts
  - `init --agent=gemini-cli` self-configuring subcommand and esbuild single-file bundle: packages/*/src/commands/init*.ts, build.js
- **Verdict:** reuse-ideas. Official and clean, but Cloud-only and relies on gcloud CLI or ADC, with nothing for Workspace, Directory or Search Console; the ACL and safe/destructive tiering patterns are the valuable parts.
- **Unverified:** internals of gcloud.lint; whether observability and backupdr tools are truly side-effect free (classified by name); execute_insights_query (BigQuery) behavior; README tool tables not diffed against code; Go integration tests; published npm state.

### enesbol__gcp-mcp
- **Path / remote:** D:/Projects2/Google-services-mcps/reference/enesbol__gcp-mcp ; https://github.com/enesbol/gcp-mcp.git
- **Purpose and product areas:** FastMCP server exposing GCP resource management through Google Cloud client libraries (not gcloud). Area: Cloud. README opens with "This is not a Ready MCP Server".
- **Language and entry point:** Python (>=3.13 in pyproject; README says 3.10+), src/gcp-mcp-server/main.py (mcp.run()). Install per README: git clone, `pip install -r requirements.txt`, `python main.py`; also uv config and Docker/Smithery. Packaging is inconsistent: pyproject points to src/gcp_mcp but the folder is src/gcp-mcp-server; README refers to files and a `.env.example` not in the repo.
- **License:** MIT (LICENSE; README agrees; pyproject has no license field).
- **Last commit:** 2025-03-08, "update deployment"
- **Transport:** stdio (FastMCP default `mcp.run()`; smithery.yaml says stdio). README's Docker `-p 8080` and `MCP_SERVER_PORT` are not backed by code (unverified).
- **Auth:** Google client libraries with ADC; core/auth.py tries GOOGLE_APPLICATION_CREDENTIALS, then GCP_SERVICE_ACCOUNT_JSON, then `google.auth.default` with cloud-platform scope. But main.py passes credentials=None to client_instances.initialize_clients, so the service-account path env is only logged (core/auth.py appears unused by main flow; unverified). No tokens stored.
- **Registered tools:** 36. main.py: test_gcp_auth. artifact_registry.py: create_artifact_repository (other tools there are commented out). cloud_audit_logs.py: list_audit_logs, filter_admin_activity_logs, create_log_sink. cloud_bigquery.py: run_query, create_dataset, create_table, delete_table, load_table_from_json, export_table_to_csv. cloud_build.py: trigger_build, list_builds, create_build_trigger. cloud_compute_engine.py: create_instance, list_instances, start_instance, stop_instance, delete_instance. cloud_monitoring.py: list_metrics, fetch_metric_timeseries, list_alert_policies, create_metric_threshold_alert, update_alert_policy, delete_alert_policy, create_notification_channel. cloud_run.py: create_service, list_services, update_service, delete_service, get_service. cloud_storage.py: create_bucket, list_buckets, upload_object, download_object, delete_object. README lists services, not tool names.
- **Read / Write / Delete:** 13 / 18 / 5. Read: test_gcp_auth, list_audit_logs, filter_admin_activity_logs, run_query (?, may run DML), list_builds, list_instances, list_metrics, fetch_metric_timeseries, list_alert_policies, list_services, get_service, list_buckets, download_object. Delete: delete_table, delete_instance, delete_alert_policy, delete_service, delete_object. Write: the other 18 (create_*, update_*, start/stop_instance, trigger_build, load_table_from_json, export_table_to_csv, upload_object).
- **Longest tool name:** 29 characters (create_metric_threshold_alert)
- **Safety notes:** Confirmation: no (no confirm/dry-run found). Read-only flag: no. Hard-coded secrets: none found. Suspicious code: none (no subprocess, os.system, gcloud, or outbound HTTP found by grep). core/security.py DataSanitizer only regex-redacts the words token/key/secret/password (crude). main.py prints sys.path and cwd to stdout via print(), which would corrupt stdio MCP framing.
- **Reusable ideas:**
  - Per-service `register(mcp)` module layout: src/gcp-mcp-server/services/*.py, main.py register_services
  - Credential resolution chain: src/gcp-mcp-server/core/auth.py
  - Central lazily-initialized client holder: services/client_instances.py
  - Smithery config schema for project/region/credentials: smithery.yaml
- **Verdict:** skip. Self-declared unfinished, broken packaging, no safety gates; a layout idea only.
- **Unverified:** Whether the server starts at all (not run); whether run_query blocks DML; whether core/auth.py is wired in; per-tool bodies only spot-checked.


### GoogleCloudPlatform__gemini-cloud-assist-mcp
- **Path / remote:** D:/Projects2/Google-services-mcps/reference/GoogleCloudPlatform__gemini-cloud-assist-mcp ; https://github.com/GoogleCloudPlatform/gemini-cloud-assist-mcp.git
- **Purpose and product areas:** Docs and agent skills for connecting MCP clients to Google's hosted Gemini Cloud Assist and Application Design Center MCP endpoints. Area: Cloud.
- **Language and entry point:** No code (README, docs/CODE_OF_CONDUCT.md and CONTRIBUTING.md, 3 skills/*/SKILL.md, .github/workflows gemini-*.yml). Install: none (remote). The legacy local Node server (npm @google-cloud/gemini-cloud-assist-mcp) is deprecated; v0.8.0+ is remote. README references a plugins/ directory (Codex/Claude autocloud plugins, install.sh) that is NOT in this clone.
- **License:** Apache-2.0 (LICENSE file; README agrees). README adds that GCP Terms of Service and Data Processing Terms do not apply to the software.
- **Last commit:** 2026-10-12, "Internal Change"
- **Transport:** HTTP (remote Streamable HTTP endpoints).
- **Auth:** Google credentials. Quick start uses local ADC (`gcloud auth login`, `gcloud auth application-default login`). Antigravity uses `authProviderType: google_credentials`. Cursor and the Claude plugin use your own OAuth 2.0 desktop client id with scope cloud-platform (redirect URI URI://anysphere.cursor-mcp/oauth/callback for Cursor). Required IAM: roles/serviceusage.serviceUsageAdmin and roles/geminicloudassist.user.
- **Registered tools:** 11 advertised (no code to verify). Endpoint https://geminicloudassist.googleapis.com/mcp: ask_cloud_assist, design_infra, investigate_issue, invoke_operation (create/update/delete resources; only works when Agent Actions enabled), optimize_costs, ask_cloud_operator (Private Preview, allowlisted projects). Endpoint https://designcenter.googleapis.com/mcp (Application Design Center): setup_adc, manage_application, manage_application_template, assess_best_practices, list_application_templates. Skills also mention names like manage_app_design, generate_terraform, generate_gcloud, debug_deployment (skill text only, unverified).
- **Read / Write / Delete:** Not classifiable from code. By description: write/delete-capable: invoke_operation, manage_application, manage_application_template, setup_adc (?), ask_cloud_operator (?). Others look read/advisory (?).
- **Longest tool name:** 27 characters (manage_application_template)
- **Safety notes:** Confirmation: skills instruct the agent to ask the user before applying (operating-google-cloud/SKILL.md line 56; designing-and-deploying skill requires approval of diffs); enforcement is prompt-level only. Server-side gate: Agent Actions must be enabled for invoke_operation. Read-only flag: no. Hard-coded secrets: none found (no code). Suspicious code: none; only Google-related URLs plus CLA/GitHub/conduct links in docs. README suggests `curl ... | bash` for the Claude plugin install (script not in this clone, not reviewed).
- **Reusable ideas:**
  - Skill files that teach an agent to chain tools and ask before apply: skills/operating-google-cloud/SKILL.md
  - Skill layout for design/deploy workflows: skills/designing-and-deploying-infrastructure/SKILL.md
  - Delegating to a hosted agent via a few coarse tools instead of many API wrappers: README "MCP Tools"
- **Verdict:** reuse-ideas. Not forkable (hosted, preview, allowlisted) but a reference for a Google-hosted Cloud MCP and skill format.
- **Unverified:** Real tool schemas and annotations (hosted, not reachable offline); whether the endpoints are reachable without allowlist; the plugins/ scripts; GA status (README says Private Preview, APIs behind allowlist, and "should not be treated as stable APIs").

### google__skills
- **Path / remote:** D:/Projects2/Google-services-mcps/reference/google__skills ; https://github.com/google/skills.git
- **Purpose and product areas:** Google's official Agent Skills collection (156 skills in index.json) for Google Cloud, Ads, Analytics and identity. Areas: Cloud (almost all). No Workspace user data, Workspace admin or Search Console skills.
- **Language and entry point / form:** Skills collection (markdown, no code). Install: `npx skills add google/skills`.
- **License:** Apache-2.0 (LICENSE file)
- **Last commit:** 2026-10-13 "Add usage attribution metadata to the google-cloud-networking-observability skill."
- **Summary:** skills/ has 5 groups: cloud (bulk), ads (14), analytics (2), identity (2), developers (3). plugins/cloud holds Claude/Codex/Gemini plugin bundles; plugins/cloud/google-cloud-developer bundles gcloud, finding-google-skills, retrieving-developer-knowledge, recipe-auth, recipe-onboarding, and plugin/MCP manifests; plugins/cloud/data-cloud/* are git submodule stubs (alloydb, bigquery, spanner, looker, etc.), empty in this clone. Format: skills/<group>/<name>/SKILL.md with YAML frontmatter `name`, `description` (with use/don't-use triggers), optional `metadata` (version, category); optional references/ subfolder.
  Catalog (one line per family):
  - AI/ML, 12 `agent-platform-*` (alert-config, deploy, endpoint-mgmt, eval-flywheel, inference, migrate-from-ai-studio, model-registry, prompt-mgmt, rag-engine, skill-registry, troubleshooting, tuning[-management]) plus `gemini-api`, `gemini-agents-api`, `gemini-interactions-api`, `gemini-live-api`, `agents-cli-onboarding`: Vertex/Gemini Agent Platform. Cloud.
  - Data: `bigquery-*` (basics, ai-ml, bigframes, observability, optimization, troubleshooting), `alloydb-basics`, `bigtable-basics`, `spanner-basics`, `cloud-sql-basics`, `cloud-databases-onboarding`, `datalineage-*`, `dbt-sf-to-bq-translator`, `managed-airflow-*` (3). Cloud.
  - GKE, 33 `gke-*` skills (cluster creation, upgrades, networking, security, cost, TPU/GPU troubleshooting, etc.). Cloud.
  - Ops: `cloud-logging-*` (3), `cloud-monitoring-*` (4), `cloud-trace-querying`, `cloud-run-basics`, `cloud-run-alert-configuration`, `cloud-build-basics`, `google-cloud-slo-alert-configuration`, `google-cloud-networking-observability`. Cloud.
  - Storage/Filestore: `google-cloud-storage-*` (3), `google-cloud-filestore-*` (4). Cloud.
  - Security/IAM: `iam-helper-for-*` (policy-management, policy-simulator, PAM, troubleshooting), `google-cloud-scc-query`, `google-cloud-scc-remediation`, `secops-*` (cases, detection-engineering, hunt, investigate, triage), `detection-engineering-coverage-evaluation`, `google-cloud-recipe-auth`. Cloud.
  - Architecture: `google-cloud-solution-*` (9), `google-cloud-waf-*` (6), `google-cloud-recipe-foundation-builder`, `-onboarding`, `google-cloud-global-frontend-configuration`, `application-design-center-design-deploy`, `workload-manager-basics`. Cloud.
  - Dev: `firebase-basics`, `developing-genkit-{dart,go,js,python}`, `migrate-to-rust`, `developer-device-platform-basics`, `gcloud` (gcloud safety guardrails), `finding-google-skills`, `retrieving-developer-knowledge`. Cloud.
  - Ads: `google-ads-api-{account-diagnostics,mcp-setup,quickstart}`, `data-manager-api-{audience-ingestion,event-ingestion,setup}`, `google-mobile-ads-*` (6), `ima-*` (2). Not in our four areas.
  - Analytics: `google-analytics-admin-api-basics`, `google-analytics-data-api-basics` (enable API via gcloud). Not in our four areas.
  - Identity: `sign-in-with-google-web`, `dpop-adoption`. Adjacent to auth only.
  - MCP content: no MCP tool definitions. Config only: plugins/cloud/google-cloud-developer/{.mcp.json,mcp.json,mcp_config.json,gemini-extension.json} define one remote server `developer-knowledge` (streamable-http, https://developerknowledge.googleapis.com/mcp, header X-Goog-Api-Key from env). Skills `alloydb-basics`, `google-ads-api-mcp-setup`, `gcloud` have references/mcp-usage.md describing usage of other (Google-hosted/Ads) MCP servers.
  - Destructive commands: no blanket "run without confirmation" instruction found. The `gcloud` skill is a guardrail skill (forbids unbounded lists, shell operators, web-search fallback; requires explicit user authorization for risky ops). Several basics skills use `--quiet` on create/enable commands (suppresses gcloud prompts); `agent-platform-troubleshooting` says to always disable prompts (`--quiet`). Not a destructive-without-confirmation pattern in my sampling, but not exhaustively audited.
- **Verdict:** reuse-ideas. Useful as Cloud-server design reference (especially the `gcloud` guardrails skill and the .mcp.json plugin packaging); nothing for the three Workspace/Search Console areas.
- **Unverified:** Full text of all 156 SKILL.md files was not read; the destructive-command check was grep-based on `--quiet`/`--force`/`rm -rf`. Data-cloud submodule contents are absent.


## Workspace user data

### taylorwilsdon__google_workspace_mcp

- **Path / remote:** D:/Projects2/Google-services-mcps/reference/taylorwilsdon__google_workspace_mcp ; https://github.com/taylorwilsdon/google_workspace_mcp.git
- **Purpose and product areas:** Full-featured Python FastMCP server giving an LLM access to a signed-in user's Google Workspace apps (plus Programmable Search and Apps Script). Areas: Workspace user data only. No Cloud console, no Admin/Directory, no Search Console (grep for admin.directory, cloud-platform, webmasters in auth/ and core/ found nothing).
- **Language and entry point:** Python >=3.10, FastMCP. Entry `main.py:main` (script `workspace-mcp`; also `workspace-cli` = core/cli.py, a CLI that calls tools directly). Also `fastmcp_server.py` for FastMCP Cloud. Install: `uvx workspace-mcp --tool-tier core` (PyPI), Docker (`docker build -t workspace-mcp .`), Helm chart, DXT/mcpb manifest, Claude plugin. Version 2.1.0.
- **License:** MIT (LICENSE file; pyproject `license = "MIT"` matches).
- **Last commit:** 2026-10-09 "chore: release v2.1.0"
- **Transport:** both. `--transport stdio` (default, overridable by WORKSPACE_MCP_TRANSPORT) or `streamable-http` (main.py). HTTP default bind host 0.0.0.0 unless WORKSPACE_MCP_HOST set (main.py `resolve_bind_host_for_transport`, which picks a safer default in some auth modes; not fully traced). Has /health endpoint.
- **Auth:** User OAuth 2.0 (installed-app style, client id/secret from env GOOGLE_OAUTH_CLIENT_ID/SECRET or client_secret.json, auth/client_secrets.py). Callback via local listener (auth/oauth_callback_server.py, stdio) or server route. Optional OAuth 2.1 mode (MCP_ENABLE_OAUTH21, FastMCP GoogleProvider, bearer tokens, EXTERNAL_OAUTH21_PROVIDER accepts external ya29 tokens validated via Google userinfo, gateway-identity trust mode, stateless mode). No service account, no ADC, no domain-wide delegation found. Tokens stored per user email as files in `~/.google_workspace_mcp/credentials` (override WORKSPACE_MCP_CREDENTIALS_DIR / GOOGLE_MCP_CREDENTIALS_DIR; fallback ./.credentials) via auth/credential_store.py; OAuth 2.1 session store in memory (auth/oauth21_session_store.py); optional Valkey/Redis and disk storage for OAuth proxy state (core/valkey_storage.py, core/storage.py). Every tool takes `user_google_email`.
- **Registered tools:** 120 (114 direct `@server.tool` in code + 6 generated by `create_comment_tools` in core/comments.py). Gating: after registration, tools are filtered by `filter_server_tools` (core/tool_registry.py). README says "15 tools" for Gmail, code has 14; other README counts not individually reconciled. core/tool_tiers.yaml omits `debug_docs_runtime_info` (so it is only present with no tier).
  - core/server.py: start_google_auth (removed when OAuth 2.1 on)
  - gmail/gmail_tools.py (14): search_gmail_messages, get_gmail_message_content, get_gmail_messages_content_batch, get_gmail_attachment_content, send_gmail_message, draft_gmail_message, get_gmail_thread_content, get_gmail_threads_content_batch, list_gmail_labels, manage_gmail_label, list_gmail_filters, manage_gmail_filter, modify_gmail_message_labels, batch_modify_gmail_message_labels
  - gdrive/drive_tools.py (16): search_drive_files, get_drive_file_content, get_drive_file_download_url, list_drive_items, create_drive_folder, create_drive_file, import_to_google_doc, import_to_google_slides, import_to_google_sheets, get_drive_file_permissions, check_drive_file_public_access, update_drive_file, get_drive_shareable_link, manage_drive_access, copy_drive_file, set_drive_file_permissions
  - gcalendar/calendar_tools.py (7): list_calendars, get_events, manage_event, manage_out_of_office, manage_focus_time, query_freebusy, create_calendar
  - gdocs/docs_tools.py (18): search_docs, get_doc_content, list_docs_in_folder, create_doc, modify_doc_text, find_and_replace_doc, insert_doc_elements, insert_doc_image, update_doc_headers_footers, batch_update_doc, inspect_doc_structure, debug_docs_runtime_info, create_table_with_data, debug_table_structure, export_doc_to_pdf, update_paragraph_style, get_doc_as_markdown, manage_doc_tab
  - gsheets/sheets_tools.py (14): list_spreadsheets, get_spreadsheet_info, read_sheet_values, modify_sheet_values, format_sheet_range, manage_conditional_formatting, create_spreadsheet, create_sheet, list_sheet_tables, append_table_rows, manage_sheet_tab, resize_sheet_dimensions, move_sheet_rows, manage_named_range
  - gslides/slides_tools.py (5): create_presentation, get_presentation, batch_update_presentation, get_page, get_page_thumbnail
  - gforms/forms_tools.py (6): create_form, get_form, set_publish_settings, get_form_response, list_form_responses, batch_update_form
  - gchat/chat_tools.py (6): list_spaces, get_messages, send_message, search_messages, create_reaction, download_chat_attachment
  - gcontacts/contacts_tools.py (8): list_contacts, get_contact, search_contacts, manage_contact, list_contact_groups, get_contact_group, manage_contacts_batch, manage_contact_group
  - gtasks/tasks_tools.py (6): list_task_lists, get_task_list, manage_task_list, list_tasks, get_task, manage_task
  - gsearch/search_tools.py (2): search_custom, get_search_engine_info
  - gappsscript/apps_script_tools.py (11): get_script_project, manage_script_content, run_script_function, manage_deployment, list_script_deployments, manage_script_project, manage_script_version, get_script_version, get_script_activity, generate_trigger_code, manage_script_trigger
  - core/comments.py (6, generated): list_document_comments, manage_document_comment, list_spreadsheet_comments, manage_spreadsheet_comment, list_presentation_comments, manage_presentation_comment
- **Read / Write / Delete:** Every tool has ToolAnnotations (all four hints) in code. Read (readOnlyHint=True) 56: all list_*/get_*/search_*/query_freebusy/inspect_doc_structure/debug_*/generate_trigger_code etc. plus the 3 comment list tools. Write 64 (readOnlyHint=False): 34 carry destructiveHint=True (manage_event, manage_out_of_office, manage_focus_time, send_message, manage_contact, manage_contacts_batch, manage_contact_group, modify_doc_text, find_and_replace_doc, update_doc_headers_footers, batch_update_doc, manage_doc_tab, update_drive_file, manage_drive_access, set_drive_file_permissions, batch_update_form, manage_gmail_label, manage_gmail_filter, modify_gmail_message_labels, batch_modify_gmail_message_labels, modify_sheet_values, manage_conditional_formatting, manage_sheet_tab, resize_sheet_dimensions, move_sheet_rows, manage_named_range, batch_update_presentation, manage_task_list, manage_task, and the 5 Apps Script: manage_script_content, run_script_function, manage_deployment, manage_script_project, manage_script_trigger); 30 non-destructive writes (start_google_auth, manage_script_version, create_calendar, create_reaction, download_chat_attachment, create_doc, insert_doc_elements, insert_doc_image, create_table_with_data, export_doc_to_pdf, update_paragraph_style, create_drive_folder, create_drive_file, import_to_google_doc/slides/sheets, copy_drive_file, create_form, set_publish_settings, get_gmail_attachment_content, send_gmail_message, draft_gmail_message, format_sheet_range, create_spreadsheet, create_sheet, append_table_rows, create_presentation, plus 3 manage_*_comment). Delete: 0 dedicated delete tools; deletion is an `action` parameter inside the 34 destructive manage_* / batch tools (e.g. manage_task delete, manage_script_project delete via Drive API). Note send_gmail_message is annotated destructiveHint=False. The annotations were taken from the code via my own AST parse; the underlying API calls per action were not individually traced.
- **Longest tool name:** 33 characters (batch_modify_gmail_message_labels)
- **Safety notes:** Confirmation for destructive ops: no (no confirm or dry_run parameter found; only MCP annotations). Read-only flag: yes. `--read-only` requests only read scopes and removes tools whose `_required_google_scopes` are not all read-only (core/tool_registry.py `filter_server_tools`); mutually exclusive with `--permissions`. Other filters: `--tools <services>` (service list: gmail drive calendar docs sheets chat forms slides tasks contacts search appscript) picks services; `--tool-tier core|extended|complete` picks tool names from core/tool_tiers.yaml (cumulative tiers, combinable with --tools); `--disabled-tools NAME...` / WORKSPACE_MCP_DISABLED_TOOLS blocks named tools; `--permissions service:level` (auth/permissions.py) sets cumulative per-service scope levels (gmail: readonly, organize, drafts, send, full; tasks: readonly, manage, full; others readonly/full) and removes tools whose scopes exceed them, plus SERVICE_DENIED_ACTIONS (tasks:manage denies delete and clear_completed actions). Hard-coded secrets: none found (matches for "ya29." are token-prefix checks and test fixtures in auth/ and tests/). Suspicious code: none of concern. No eval/exec/subprocess/os.system/shell=True in non-test code. `curl` appears in Dockerfile (installs curl for HEALTHCHECK against localhost) and in gdrive/drive_helpers.py:901 (only a text hint string shown to the user for uploading). Optional OpenTelemetry (core/telemetry.py) is off unless OTEL_EXPORTER_OTLP_ENDPOINT is set; user email on spans is a separate opt-in. No other non-Google hosts called in code (URL grep hits are docs links, github.dev/vscode.dev redirect allowlist, zoom.us in docstring).
- **Per-service scopes (auth/scopes.py):** gmail: readonly, send, compose, modify, labels, settings.basic. drive: drive, drive.readonly, drive.file. calendar: calendar, calendar.readonly, calendar.events. docs: documents(.readonly) + drive.readonly + drive.file. sheets: spreadsheets(.readonly) + drive.readonly + drive.file. chat: chat.messages(.readonly), chat.spaces(.readonly), chat.memberships.readonly, contacts.readonly. forms: forms.body(.readonly), forms.responses.readonly. slides: presentations(.readonly). tasks: tasks(.readonly). contacts: contacts(.readonly). search: cse. appscript: script.projects(.readonly), script.deployments(.readonly), script.processes, script.metrics, script.external_request, script.scriptapp, plus full drive. Base: userinfo.email, userinfo.profile, openid. Scopes requested only for the enabled services.
- **gsearch (Programmable Search):** Own implementation (gsearch/search_tools.py). Uses googleapiclient `service.cse().list(...)` (Google Custom Search JSON API) with API key from env GOOGLE_PSE_API_KEY and engine id GOOGLE_PSE_ENGINE_ID; query and options (num, start, safe, language, site filter, etc.) go only to Google's customsearch API. Not routed through any third party. Tools: search_custom, get_search_engine_info.
- **Reusable ideas:**
  - Tool-tier YAML plus post-registration filtering by scope/read-only/permissions/disabled list: core/tool_tiers.yaml, core/tool_registry.py
  - Cumulative per-service permission levels mapped to scopes, with action-level deny list: auth/permissions.py, auth/scopes.py
  - Consistent ToolAnnotations on every tool, and consolidated `manage_*` action-dispatch tools (keeps tool count low): gtasks/tasks_tools.py, core/comments.py
  - Decorators `require_google_service` / `handle_http_errors` (service build + scope tracking + error mapping): auth/service_decorator.py, core/utils.py
  - Credential store abstraction with per-user files and OAuth 2.1 session store; Dockerfile/Helm for HTTP deployment: auth/credential_store.py, auth/oauth21_session_store.py, helm-chart/
  - Large test suite (194 test files under tests/).
- **Verdict:** reuse-ideas. High-quality, MIT, actively maintained, but covers only Workspace user data (no Admin/Directory, Cloud, or Search Console) and has no confirm/dry-run for destructive actions; copy the tier, read-only, permission-level and annotation patterns.
- **Unverified:** Per-action real API calls (delete vs update) inside manage_* tools not traced; read/write classification relies on annotations and tool names. HTTP bind-host logic and OAuth 2.1 internals only skimmed. Docs/ folder and README tool counts not reconciled beyond Gmail. Did not read tests. The 6 comment tool names are inferred from the naming code (`list_{app}_comments`) and tool_tiers.yaml, with app names document/spreadsheet/presentation taken from tiers and the factory; the actual call sites of `create_comment_tools` were not opened.

### aaronsb__google-workspace-mcp
- **Path / remote:** D:/Projects2/Google-services-mcps/reference/aaronsb__google-workspace-mcp ; https://github.com/aaronsb/google-workspace-mcp.git
- **Purpose and product areas:** Multi-account Google Workspace user-data MCP server that uses YAML manifests to generate "manage_<service>" tools, each taking an `operation` argument. Areas: Workspace user data only. No Admin SDK / Directory (only the user-level People `directory.readonly` scope for contacts directory lookup: `listDirectory`, `searchDirectory`). No Cloud, no Search Console.
- **Language and entry point:** TypeScript, Node >=22.12.0 (ESM). Entry `src/index.ts` -> `build/index.js` (bin `google-workspace-mcp`); server in `src/server/server.ts`. Install: `claude mcp add google-workspace -e GOOGLE_CLIENT_ID=... -e GOOGLE_CLIENT_SECRET=... -- npx -y @aaronsb/google-workspace-mcp`, or one-click `.mcpb` bundle for Claude Desktop (`mcpb/manifest.json`, `scripts/verify-mcpb.cjs`, `.github/workflows/release-mcpb.yml`). Runtime deps: MCP SDK, sanitize-html, yaml only.
- **License:** Apache-2.0 (LICENSE; package.json agrees). A LICENSE-MIT and NOTICE (same author, 2025) also exist - minor ambiguity, likely legacy.
- **Last commit:** 2026-10-01 "chore: release v4.6.0"
- **Transport:** stdio only (StdioServerTransport in `src/server/server.ts`). The only http server is a 127.0.0.1 OAuth callback listener.
- **Auth:** OAuth2 installed-app flow, hand-rolled (no google-auth-library): loopback redirect `http://127.0.0.1:<random port>/callback` with state, code exchange via fetch to Google's token URL (`src/accounts/oauth.ts`). Client id/secret from env `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Multi-account. Refresh-token credentials stored per account as `authorized_user` JSON in `~/.local/share/google-workspace-mcp/credentials/<slug>.json` (XDG_DATA_HOME honored); account registry under `~/.config/google-workspace-mcp` (`src/executor/paths.ts`, `src/accounts/credentials.ts`). Per-account `access: read|readwrite` selects read-only scope variants at consent time. No ADC, no service account, no domain-wide delegation.
- **Registered tools:** 12 (README says 12; matches). Registered via `setRequestHandler(ListToolsRequestSchema)` in `src/server/server.ts`. Hand-coded in `src/server/tools.ts`: manage_accounts, manage_workspace, manage_scratchpad, bulk_operations (queue_operations accepted as alias, not listed). Factory-generated from `src/factory/manifest/*.yaml`: manage_email, manage_calendar, manage_drive, manage_sheets, manage_docs, manage_tasks, manage_meet, manage_contacts. Operations inside (manifest keys; 104 counted, README claims 95, mismatch unresolved):
  - email (19): search read archive send reply replyAll forward triage trash untrash listDrafts deleteDraft getAttachment viewAttachment modify labels createLabel threads getThread
  - calendar (9): list agenda get create quickAdd update delete calendars freebusy
  - drive (22): search get upload viewImage download copy update delete trash export createFolder listFolder tree listPermissions share unshare setRole listComments getComment addComment resolveComment replyToComment
  - sheets (13): get create read append getValues updateValues clearValues addSheet renameSheet deleteSheet duplicateSheet renameSpreadsheet copySheetTo
  - docs (5): get create write insertText replaceText
  - tasks (10): listTaskLists getTaskList createTaskList deleteTaskList list get create update complete delete
  - meet (16): listConferences getConference listParticipants listTranscripts getTranscript listTranscriptEntries listRecordings getRecording getFullTranscript listSmartNotes getSmartNote createSpace activeConferences getSpace updateSpace endActiveConference
  - contacts (10): list search get create update delete listOther searchOther listDirectory searchDirectory
- **Read / Write / Delete:** Tool level: every manage_* tool mixes all three; no MCP readOnlyHint/destructiveHint annotations (none found by grep). Operation level (by resource): Delete: calendar.delete, contacts.delete, drive.delete, drive.unshare, tasks.delete, tasks.deleteTaskList, sheets.deleteSheet, email.deleteDraft. Write: email send/reply/replyAll/forward/trash/untrash/modify/createLabel; calendar create/quickAdd/update; drive upload/copy/update/trash/createFolder/share/setRole/addComment/resolveComment/replyToComment; sheets create/append/updateValues/clearValues/addSheet/rename*/duplicateSheet/copySheetTo; docs create/write/insertText/replaceText; tasks create/update/complete/createTaskList; meet createSpace/updateSpace/endActiveConference; contacts create/update; plus scratchpad send/sync and account mutations. Remaining operations are reads.
- **Longest tool name:** 17 characters (manage_scratchpad)
- **Safety notes:** Destructive confirmation: no confirm parameter on deletes. Instead composable policies through env `GWS_SAFETY_POLICY` (`draft-only-email`, `no-delete`, `read-only`, `audit`; `src/factory/safety.ts`) run as beforeExecute hooks, plus an always-on `account-access` policy enforcing the per-account read/readwrite choice. Read-only flag: yes (`GWS_SAFETY_POLICY=read-only`, and per-account read-only OAuth scopes). Workspace file sandbox refuses home/Documents/Desktop/Downloads/Drive-mount dirs (`src/executor/workspace.ts`). Email HTML is sanitized and wrapped as untrusted content (`src/server/formatting/html-sanitize.ts`). Hard-coded secrets: none found. Suspicious code: `exec`/`execFile` in `src/accounts/oauth.ts` opens the system browser on the auth URL (benign; the Windows path interpolates a server-built URL into `cmd /c start`). `fetch` goes only to Google token/userinfo/discovery endpoints (`oauth.ts`, `token-service.ts`, `src/coverage/discover.ts`, scripts/generate-*.mjs, dev-time). `download.html` at the repo root is a 0-byte file. No telemetry or non-Google hosts found in src.
- **Reusable ideas:**
  - Manifest-driven tool factory with per-service YAML (params, `maps_to`, defaults, hydration) giving a small tool surface: `src/factory/generator.ts`, `src/factory/manifest/*.yaml`. Keeps tool count and name length low.
  - Safety-policy interceptor pipeline and per-account read/readwrite scope selection: `src/factory/safety.ts`, `src/accounts/oauth.ts` (read-only scope map).
  - Dependency-light loopback OAuth with per-account refresh-token files: `src/accounts/oauth.ts`, `src/accounts/credentials.ts`, `src/accounts/token-service.ts`.
  - API descriptor generated from Google Discovery plus coverage-baseline tests: `src/google/descriptor.ts`, `src/coverage/`, `scripts/generate-descriptor.mjs`.
  - Google error shaping (status/reason/next-step hints) in `src/google/errors.ts` and `src/server/server.ts`; mcpb packaging in `mcpb/manifest.json`.
- **Verdict:** reuse-ideas - well-tested architecture and auth, but user data only (no Admin/Directory, Cloud or Search Console) and operation-dispatch style differs from per-action tools.
- **Unverified:** runtime behavior (nothing executed); 95 vs 104 operation count; custom-handler operations in `src/services/*/patch.ts` vs manifest keys; docs/ADRs only skimmed; CI workflows and `scripts/mcp-registry-publish.sh` not audited.


### dguido__google-workspace-mcp
- **Path / remote:** D:/Projects2/Google-services-mcps/reference/dguido__google-workspace-mcp ; https://github.com/dguido/google-workspace-mcp.git
- **Purpose and product areas:** Flat-tool MCP server for Drive, Docs, Sheets, Slides, Calendar, Gmail and Contacts. Areas: Workspace user data only. No Admin/Directory, Cloud or Search Console.
- **Language and entry point:** TypeScript, Node >=22.0.0, package `@dguido/google-workspace-mcp` v3.4.4, entry `src/index.ts` (bin in package.json, built by `scripts/build.js`). Install: `npx @dguido/google-workspace-mcp` in the Claude Desktop config with env vars; `npx @dguido/google-workspace-mcp auth` for manual auth.
- **License:** MIT (LICENSE, Dan Guido 2026; package.json agrees)
- **Last commit:** 2026-03-11 "Bump the all-dependencies group with 4 updates (#68)"
- **Transport:** stdio only (StdioServerTransport, `src/index.ts`); http only for the 127.0.0.1 OAuth callback (`src/auth/server.ts`).
- **Auth:** OAuth2 desktop flow via google-auth-library with PKCE and state; env `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` or `~/.config/google-workspace-mcp/credentials.json`. Tokens in `~/.config/google-workspace-mcp/tokens.json` (override `GOOGLE_WORKSPACE_MCP_TOKEN_PATH`; profiles via `GOOGLE_WORKSPACE_MCP_PROFILE`), written atomically with mode 0o600, dir 0o700 (`src/auth/tokenManager.ts`). Refresh mutex. No service account support (only mentioned in an error hint in `src/errors/config-validator.ts`), no ADC.
- **Registered tools:** 88 (top-level definitions in `src/tools/definitions.ts`; registry in `src/index.ts`; zod schemas `src/schemas/`; handlers `src/handlers/`). Filtered by `GOOGLE_WORKSPACE_SERVICES`; unified tools require drive+docs+sheets+slides.
  - Drive (29): search create_text_file update_text_file create_folder list_folder delete_item rename_item move_item copy_file get_file_metadata export_file share_file get_sharing list_revisions restore_revision download_file upload_file get_storage_quota star_file resolve_file_path batch_delete batch_restore batch_move batch_share remove_permission list_trash restore_from_trash empty_trash get_folder_tree
  - Docs (8): create_google_doc update_google_doc get_google_doc_content append_to_doc insert_text_in_doc delete_text_in_doc replace_text_in_doc format_google_doc_range
  - Sheets (7): create_google_sheet update_google_sheet get_google_sheet_content format_google_sheet_cells merge_google_sheet_cells add_google_sheet_conditional_format sheet_tabs
  - Slides (10): create_google_slides update_google_slides get_google_slides_content format_slides_text format_slides_shape format_slide_background create_google_slides_text_box create_google_slides_shape slides_speaker_notes list_slide_pages
  - Unified (3): create_file update_file get_file_content
  - Calendar (7): list_calendars list_events get_event create_event update_event delete_event find_free_time
  - Gmail (16): send_email draft_email read_email search_emails delete_email modify_email download_attachment delete_draft list_drafts update_label delete_label list_labels get_or_create_label create_filter list_filters delete_filter
  - Contacts (6): list_contacts get_contact search_contacts create_contact update_contact delete_contact
  - Discovery (2): list_tools get_status
  - Not compared against the README tool table.
- **Read / Write / Delete:** Read 31 (flagged `readOnly: true` in code): search list_folder get_file_metadata export_file get_sharing list_revisions download_file get_storage_quota resolve_file_path list_trash get_folder_tree get_google_doc_content get_google_sheet_content get_google_slides_content list_slide_pages get_file_content list_calendars list_events get_event find_free_time read_email search_emails download_attachment list_drafts list_labels list_filters list_contacts get_contact search_contacts list_tools get_status. Delete 11 (?): delete_item (trash, per description), batch_delete, remove_permission, empty_trash (permanent), delete_text_in_doc, delete_event, delete_email (permanent), delete_draft, delete_label, delete_filter, delete_contact. Write 46: all remaining (create_*, update_*, rename/move/copy/share/star/restore, format_*, send/draft/modify email, etc.). Delete/write split inferred from names and schema descriptions, not every API call traced. No MCP annotations; uses its own `readOnly` field.
- **Longest tool name:** 35 characters (add_google_sheet_conditional_format)
- **Safety notes:** Destructive confirmation: partial. `empty_trash` requires `confirm: true` (`src/schemas/drive.ts`) and uses MCP elicitation when the client supports it (`src/utils/elicitation.ts`, `src/handlers/drive.ts`); other destructive tools (delete_email permanent, batch_delete) have no confirm param. Read-only flag: yes, `GOOGLE_WORKSPACE_READ_ONLY=true` removes non-`readOnly` tools from the listing and the call registry (`getAllTools`, `src/index.ts`) and requests readonly scopes (`src/config/scopes.ts`). Hard-coded secrets: none; GOCSPX hits are placeholders in `docs/ADVANCED.md`, a log-redaction regex in `src/utils/logging.ts`, and fake strings in `src/utils/logging.test.ts`. Suspicious code: none; `.exec(` hits are regex execs in `src/utils/office.ts`; no child_process, no non-Google hosts, no telemetry found.
- **Reusable ideas:**
  - Hardened token handling: atomic 0600 writes, refresh mutex, PKCE, state compare: `src/auth/tokenManager.ts`, `src/auth/server.ts`.
  - Service allowlist env plus read-only mode that filters both the tool registry and OAuth scopes: `src/config/services.ts`, `src/config/scopes.ts`, `src/tools/definitions.ts`.
  - Error mapping and a `get_status` auth diagnostic tool: `src/errors/error-mapper.ts`, `src/handlers/status.ts`.
  - Elicitation-based confirmation with fallback: `src/utils/elicitation.ts`.
  - Per-tool zod schemas and optional token-efficient TOON output: `src/schemas/`, `src/utils/toon.ts`.
- **Verdict:** reuse-ideas - solid single-user OAuth server with read-only mode, but 88 flat tools with long names, and no Admin/Directory or Search Console.
- **Unverified:** README tool table vs code; todos/ are roadmap/review notes, not facts. Brief summary of todos/ (about 41 files, status in filenames): completed items cover atomic token writes, refresh race, token dir permissions, PKCE null checks, timing-safe state comparison, HTML-escaped error pages, zip-bomb and XLSX OOM limits, path-traversal defense; wontfix items cover token-path disclosure, global mutable state, parallel async, unused-code removal; pending (030-038) cover get_status unreachable on auth failure (that file's own status field says complete), sheets catch blocks bypassing diagnosis, config-error regex false positives, warmup retry, structuredContent/outputSchema conflict, test gaps, verbose instructions string; one deferred (inconsistent truncation across file types).

### adelaidasofia__google-workspace-mcp
- **Path / remote:** D:/Projects2/Google-services-mcps/reference/adelaidasofia__google-workspace-mcp ; https://github.com/adelaidasofia/google-workspace-mcp.git
- **Purpose and product areas:** Multi-account, token-efficient FastMCP server for Gmail, Calendar, Drive, Docs, Sheets. Areas: Workspace user data only (no Directory, no Cloud, no Search Console).
- **Language and entry point:** Python >=3.11 (fastmcp>=4.0.10, google-api-python-client, keyring). Entry `server.py` (`mcp.run()`), flat layout. Install: git clone + `pip3 install -r requirements.txt` or `install.sh` / `install.ps1`; README also lists PyPI name `adelaidasofia-google-workspace-mcp` (not verified). pyproject version 0.1.0.
- **License:** MIT (LICENSE file; pyproject has no license field seen).
- **Last commit:** 2026-10-06 "chore(deps): update google-auth-oauthlib requirement (#87)"
- **Transport:** stdio (README configs `"type": "stdio"`; `mcp.run()` default).
- **Auth:** User OAuth (InstalledAppFlow, Desktop client, localhost redirect). Client id/secret from env or `client_secret.json` next to the code (gitignored). Multi-account: `accounts.py` keys refresh tokens by account email; every tool takes optional `account`; default via `GWS_DEFAULT_ACCOUNT` or first account; per-account refresh locks and in-process credential cache. Tokens stored in OS keyring (service `google-workspace-mcp`) by default, or an owner-only JSON file if `GWS_TOKEN_FILE` set / `tokens.json` exists (chmod 600, or `icacls` on Windows). Index at `accounts_index.json`. Scopes least-privilege: gmail.modify, gmail.send, gmail.settings.basic, calendar, drive, documents, spreadsheets, userinfo.email, openid (scope list audited by tests/test_scopes.py).
- **Registered tools:** 63, all `@mcp.tool()` in `server.py` (thin wrappers over *_tools.py); README says 63, matches.
  - Account (3): gws_account_add, gws_account_list, gws_account_remove
  - Gmail (12): gmail_search, gmail_read, gmail_send, gmail_draft, gmail_reply, gmail_labels_list, gmail_label_apply, gmail_archive, gmail_trash, gmail_attachments_list, gmail_attachment_save, gmail_sendas_list
  - Calendar (7): cal_list_calendars, cal_list_events, cal_create_event, cal_update_event, cal_delete_event, cal_freebusy, cal_respond
  - Drive (18): drive_search, drive_read_file, drive_list_folder, drive_create_folder, drive_upload, drive_move, drive_rename, drive_share, drive_trash, drive_untrash, drive_permission_list, drive_permission_update, drive_permission_delete, drive_shared_drives_list, drive_comments_list, drive_comment_add, drive_comment_reply, drive_comment_resolve
  - Docs (9): docs_create, docs_read, docs_append, docs_insert_at, docs_replace_text, docs_export, docs_suggestions_list, docs_suggestions_accept_all, docs_suggestions_reject_all
  - Sheets (14): sheets_create, sheets_list_sheets, sheets_add_sheet, sheets_read_range, sheets_write_range, sheets_append, sheets_clear_range, sheets_batch_read, sheets_batch_write, sheets_named_ranges_list, sheets_named_range_add, sheets_named_range_delete, sheets_conditional_format_add, sheets_data_validation_add
- **Read / Write / Delete:** (classified from names and docstrings; API calls not individually traced, so "?" where noted) Read 23: gws_account_list, gmail_search, gmail_read, gmail_labels_list, gmail_attachments_list, gmail_sendas_list, gmail_attachment_save?(writes local file), cal_list_calendars, cal_list_events, cal_freebusy, drive_search, drive_read_file, drive_list_folder, drive_permission_list, drive_shared_drives_list, drive_comments_list, docs_read, docs_export?, docs_suggestions_list, sheets_list_sheets, sheets_read_range, sheets_batch_read, sheets_named_ranges_list. Delete 6: gmail_trash, cal_delete_event, drive_trash, drive_permission_delete, sheets_named_range_delete, gws_account_remove (local credential only). Write 34: all remaining (gws_account_add, gmail_send/draft/reply/label_apply/archive, cal_create/update/respond, drive_create_folder/upload/move/rename/share/untrash/permission_update/comment_*, docs_create/append/insert_at/replace_text/suggestions_accept_all/reject_all, sheets_create/add_sheet/write_range/append/clear_range?/batch_write/named_range_add/conditional_format_add/data_validation_add).
- **Longest tool name:** 29 characters (sheets_conditional_format_add)
- **Safety notes:** Confirmation: partial. `dry_run` parameter exists only on gmail_send, gmail_reply, drive_trash (3 of 63); the rest (cal_delete_event, drive_permission_delete, docs_replace_text, etc.) have no confirmation. Trash is soft delete; no permanent-delete tool; mail.google.com full scope deliberately not requested. Audit: `audit.py` appends tab-separated `timestamp action detail` lines to `~/.claude/google-workspace-mcp/audit.log` (local only, never raises) for gmail_send, gmail_reply, drive_trash, drive_permission_delete, docs_replace_text, docs_suggestions_accept_all/reject_all; logs recipients, subjects, file IDs and find/replace text. Read-only mode flag: no. Hard-coded secrets: none found (only "GOCSPX-" prefix mentioned in install scripts/docs as format hint). Suspicious code: `hooks/hooks.json` SessionStart runs `hooks/install-ping.py`, which POSTs `{plugin, version}` once per machine to https://myceliumai.co/api/install (telemetry, third-party host; documented in README "Telemetry"; opt-out `MYCELIUM_NO_PING=1`; sentinel `~/.mycelium/onboarded-google-workspace-mcp`). Concern: undisclosed-by-default network call from a plugin hook, only if installed as Claude Code plugin; the MCP server itself does not send data anywhere. `accounts.py` `subprocess.run(["icacls", ...])` to restrict token file ACL on Windows: benign. base64 decode in gmail_tools.py is Gmail body/attachment decoding: benign. No eval/exec/curl.
- **Reusable ideas:**
  - Multi-account token store with keyring plus owner-only file fallback, per-account refresh locks, credential cache: `accounts.py`
  - Always-on write audit log that never fails the action and pins UTF-8 and creates the dir: `audit.py`
  - `dry_run` on irreversible tools and compact-by-default responses with opt-in bodies: `server.py` (gmail_send, drive_trash)
  - Least-privilege scope list with a test that maps scopes to tools: `accounts.py`, `tests/test_scopes.py`
  - Cross-platform tests and installers (Windows compat, refresh, batch partial failure): `tests/`, `install.ps1`, `install.sh`
- **Verdict:** reuse-ideas. Strong patterns for the Workspace-user server (accounts, audit, dry_run) but Python/FastMCP and ships a telemetry hook; do not adopt wholesale.
- **Unverified:** Whether PyPI package is actually published; exact API call per write tool; whether docs_export and sheets_clear_range deserve different class; hooks only apply when installed as a Claude Code plugin (`.claude-plugin/`).


### EveryInc__google-workspace-mcp-server
- **Path / remote:** D:/Projects2/Google-services-mcps/reference/EveryInc__google-workspace-mcp-server ; https://github.com/EveryInc/google-workspace-mcp-server.git (package.json repository points to nityeshaga/google-workspace-mcp-server, so it is an org copy or fork)
- **Purpose and product areas:** MCP server for Docs, Sheets, Drive (comments, files), Gmail (read plus drafts), Calendar (read). Areas: Workspace user data.
- **Language and entry point:** TypeScript, Node >=18, ESM. Entry `src/index.ts` (bin `google-workspace-mcp-server`, dist/index.js). Install: `npx google-workspace-mcp-server` (npm). package.json version 1.4.3 (server string says 1.2.0). Deps: @modelcontextprotocol/sdk ^1.6.1, googleapis ^144, google-auth-library, zod.
- **License:** MIT (LICENSE and package.json agree).
- **Last commit:** 2026-03-10 "Add CLAUDE.md with npm publishing instructions"
- **Transport:** stdio only (StdioServerTransport).
- **Auth:** OAuth2 refresh token supplied by env `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` (user obtains token manually via OAuth Playground; README). Single account, no in-repo flow or token storage; secrets live in the client's MCP config JSON. Documented scopes: documents, drive, spreadsheets, gmail.readonly, gmail.compose, calendar.readonly (`src/constants.ts`, scopes not enforced in code).
- **Registered tools:** 34 via `server.registerTool` (zod schemas in `src/schemas/`). calendar.ts (4): calendar_list_calendars, calendar_list_events, calendar_get_event, calendar_freebusy_query. docs.ts (3): docs_get_document, docs_create_document, docs_batch_update. drive.ts (9): drive_list_comments, drive_create_comment, drive_reply_to_comment, drive_resolve_comment, drive_delete_comment, drive_list_files, drive_search_files, drive_get_file, drive_copy_file. gmail.ts (8): gmail_list_messages, gmail_get_message, gmail_list_threads, gmail_get_thread, gmail_list_labels, gmail_create_draft, gmail_list_attachments, gmail_get_attachment. sheets.ts (10): sheets_get_spreadsheet, sheets_get_values, sheets_batch_get_values, sheets_update_values, sheets_append_values, sheets_create_spreadsheet, sheets_batch_update, sheets_clear_values, sheets_duplicate_sheet, sheets_create_pivot_table. README table lists 33; omits sheets_create_pivot_table.
- **Read / Write / Delete:** Read 19: all calendar (4), docs_get_document, drive_list_comments, drive_list_files, drive_search_files, drive_get_file, gmail_* except create_draft (7), sheets_get_spreadsheet, sheets_get_values, sheets_batch_get_values. Write 14: docs_create_document, docs_batch_update (destructive hint; can delete content), drive_create_comment, drive_reply_to_comment, drive_resolve_comment, drive_copy_file, gmail_create_draft, sheets_update_values (destructive hint), sheets_append_values, sheets_create_spreadsheet, sheets_batch_update (destructive hint), sheets_clear_values (destructive hint), sheets_duplicate_sheet, sheets_create_pivot_table. Delete 1: drive_delete_comment. No send-mail, no file delete.
- **Longest tool name:** 25 characters (sheets_create_spreadsheet, sheets_create_pivot_table)
- **Safety notes:** MCP annotations on every tool (readOnlyHint, destructiveHint on 6 mutating tools). Confirmation parameter / dry-run: no. Read-only flag: no (but Gmail and Calendar scopes are read-only by design, no send). Hard-coded secrets: none found (README has placeholder values only). Suspicious code: none (no exec/fetch/outbound hosts). CLAUDE.md: tells the agent to bump version in package.json, run `npm run build`, then the user manually runs `npm login` and `npm publish`; not followed, benign maintainer note.
- **Reusable ideas:**
  - Per-service tool files with separate zod schema files: `src/tools/*.ts`, `src/schemas/*.ts`
  - Annotations on all tools including destructiveHint: `src/tools/sheets.ts`
  - Central error mapper (401/403/404/429) and CHARACTER_LIMIT plus markdown/json ResponseFormat enum: `src/services/google-auth.ts`, `src/constants.ts`
  - Minimal env-var OAuth client factory: `src/services/google-auth.ts`
- **Verdict:** reuse-ideas. Clean small TypeScript reference for Workspace user data, but single account, manual token setup and limited coverage.
- **Unverified:** Tool bodies not traced call by call; whether the scope list matches all tools (calendar read-only, gmail no send per design).


### adexltd__mcp-google-suite
- **Path / remote:** D:/Projects2/Google-services-mcps/reference/adexltd__mcp-google-suite ; https://github.com/adexltd/mcp-google-suite.git
- **Purpose and product areas:** Small MCP server for Google Drive, Docs and Sheets. Areas: Workspace user data (limited).
- **Language and entry point:** Python >=3.11 (official `mcp` SDK low-level Server, pydantic, uvicorn, starlette). Entry `src/mcp_google_suite/__main__.py` (stdio) and `launcher.py` (`mcp-google-suite` script, modes stdio/sse/ws). Install: `uvx mcp-google-suite` or `pip install mcp-google-suite`; Dockerfile (python:3.11-slim, non-root, `ENTRYPOINT uv run mcp-google-run`, SERVER_MODE=stdio). Version 0.1.1 (server reports 0.1.0). uv.lock not tracked in git ls-files.
- **License:** MIT (LICENSE; pyproject `license = "MIT"`, consistent).
- **Last commit:** 2025-03-28 "bumped release"
- **Transport:** both. stdio default; SSE and WebSocket via uvicorn (`sse_server.py`, `websocket_server.py`, `launcher.py`, env `SERVER_MODE`, default host 0.0.0.0 port 8000, no auth on those endpoints seen). Not the MCP Streamable HTTP transport.
- **Auth:** User OAuth (InstalledAppFlow.run_local_server) with Desktop client JSON at `~/.google/oauth.keys.json`; tokens saved plaintext JSON at `~/.google/server-creds.json` (paths from `config.py`/`config.json`). Scopes: full drive, documents, spreadsheets. README documents `GOOGLE_APPLICATION_CREDENTIALS`/`GOOGLE_OAUTH_CREDENTIALS` env vars but grep finds no code reading them (README/code mismatch). No ADC, no service account. README says run `mcp-google auth`; code uses `python -m mcp_google_suite auth` (inconsistent).
- **Registered tools:** 8, in `server.py` (`types.Tool(...)` in list_tools handler; handlers in drive/docs/sheets `service.py`). Drive: drive_search_files, drive_create_folder. Docs: docs_create, docs_get_content, docs_update_content. Sheets: sheets_create, sheets_get_values, sheets_update_values. README matches.
- **Read / Write / Delete:** Read 3: drive_search_files, docs_get_content, sheets_get_values. Write 5: drive_create_folder, docs_create, docs_update_content (insertText via batchUpdate), sheets_create, sheets_update_values. Delete 0.
- **Longest tool name:** 21 characters (sheets_update_values)
- **Safety notes:** Confirmation: no. Read-only flag: no. Annotations: none seen. Hard-coded secrets: none found. Suspicious code: none (no subprocess/eval/outbound hosts other than Google). Concern: SSE/WS servers bind 0.0.0.0 without auth; plaintext token file.
- **Reusable ideas:**
  - Config model with credential paths via pydantic: `src/mcp_google_suite/config.py`
  - Async-locked credential refresh wrapper: `src/mcp_google_suite/auth/google_auth.py`
  - Dockerfile non-root stdio default: `Dockerfile`
- **Verdict:** skip. Only 8 trivial tools, plaintext token storage, docs drift, stale since 2025-03.
- **Unverified:** SSE/WS actually functional; uv.lock presence on disk (user said it exists; not in git ls-files); drive/service.py `update` use (likely move/rename or similar, not traced).


### ChrisNoronha__google-cli-mcp
- **Path / remote:** D:/Projects2/Google-services-mcps/reference/ChrisNoronha__google-cli-mcp ; https://github.com/ChrisNoronha/google-cli-mcp.git
- **Purpose and product areas:** Generic proxy that fetches Google API Discovery Documents at startup and auto-generates one MCP tool per REST method for 17 services. Areas: Workspace user data, Workspace admin (Directory and Reports), plus Cloud (Model Armor; `cloud-platform` scope) in part. No Search Console.
- **Language and entry point:** TypeScript, Node >=18, ESM. Entry `src/index.ts` (dist/index.js). Install: git clone, `npm install`, `npm run build`, `node dist/index.js` (not published to npm; no bin). vitest tests in `src/__tests__/`.
- **License:** no LICENSE file found. README says MIT; package.json has no license field.
- **Last commit:** 2026-03-25 "docs: add README with auth options, services, and usage guide"
- **Transport:** stdio only.
- **Auth:** Either bearer token env `GOOGLE_WORKSPACE_CLI_TOKEN` (static, manual rotation), or ADC via google-auth-library `GoogleAuth` (`gcloud auth application-default login`; credentials in gcloud config dir). Scopes default list in `src/auth.ts` (includes drive, gmail.modify, calendar, admin.directory.user.readonly, admin.reports.audit.readonly, cloud-platform, etc.), overridable via `GWS_MCP_SCOPES`. No service-account/DWD-specific handling (ADC can pick up a service account key via GOOGLE_APPLICATION_CREDENTIALS, not verified).
- **Registered tools:** Dynamic, no static tool definitions; registered at runtime via `setRequestHandler(ListToolsRequestSchema ...)` in `src/server.ts`, generated in `src/tool-generator.ts` from Discovery docs. Total count unknown without running (not run). Services (`src/services.ts`): drive, sheets, gmail, calendar, admin-directory, admin-reports, docs, slides, tasks, people, chat, classroom, forms, keep, meet, events, modelarmor. Name = `<alias with - as _>_<resource path>_<method>`; names over 64 chars are truncated to 57 plus `_` plus 6-char sha256 (`MAX_TOOL_NAME_LENGTH = 64`). `GWS_MCP_SERVICES` limits loaded services.
  - **Admin SDK Directory: yes.** Using today's live Discovery doc (admin/directory_v1, fetched with curl and name rule re-applied; not repo code), prefix `admin_directory_` yields 128 tools: 46 GET (read), 62 POST/PUT/PATCH (write), 20 DELETE. Resources: users (list, get, insert, update, patch, delete, undelete, makeAdmin, signOut, createGuest, watch), users_aliases (list, insert, delete, watch), users_photos (get, update, patch, delete), groups (list, get, insert, update, patch, delete), groups_aliases (list, insert, delete), members (list, get, hasMember, insert, update, patch, delete), orgunits (list, get, insert, update, patch, delete), roles (list, get, insert, update, patch, delete), roleAssignments (list, get, insert, delete), privileges (list), domains (list, get, insert, delete), domainAliases (list, get, insert, delete), schemas (list, get, insert, update, patch, delete), tokens (list, get, delete), asps (list, get, delete), verificationCodes (list, generate, invalidate), twoStepVerification (turnOff), mobiledevices (list, get, action, delete), chromeosdevices (list, get, update, patch, action, moveDevicesToOu), customer_devices_chromeos (countChromeOsDevices, issueCommand, batchChangeStatus, commands get), customers (get, update, patch), customers_chrome_printers and printServers (list, get, create, patch, delete, batch create/delete), resources_buildings, resources_calendars, resources_features (list, get, insert, update, patch, delete, rename), channels (stop). Delete tools: admin_directory_{users, users_aliases, users_photos, groups, groups_aliases, members, orgunits, roles, roleAssignments, domains, domainAliases, schemas, tokens, asps, mobiledevices, resources_buildings, resources_calendars, resources_features, customers_chrome_printers, customers_chrome_printServers}_delete.
  - **Admin Reports:** admin_reports_activities_list, admin_reports_activities_watch, admin_reports_channels_stop, admin_reports_customerUsageReports_get, admin_reports_userUsageReport_get, admin_reports_entityUsageReports_get (6, per live doc).
  - Caveat: default scope list has only `admin.directory.user.readonly`, so Directory writes/deletes would be rejected by Google unless the user supplies broader scopes (`GWS_MCP_SCOPES`) or a broader bearer token. The server itself does not block them.
- **Read / Write / Delete:** Classification is by HTTP method of each Discovery method (GET read; POST/PUT/PATCH write; DELETE delete); no annotations. Directory: 46 / 62 / 20 as above. Overall counts across all 17 services: not determined.
- **Longest tool name:** capped at 64 characters by design; for admin_directory alone the longest is exactly 64 (2 hash-truncated names: customers_chrome_printServers_batchCreate / batchDelete). Longest across all services not computed.
- **Safety notes:** Confirmation for destructive ops: no. Read-only mode: no (only service-level allowlist `GWS_MCP_SERVICES` and scope override). No MCP annotations. Large tool surface (hundreds) with raw `body` passthrough. Hard-coded secrets: none found (README shows `ya29.your-token-here` placeholder). Suspicious code: none; `fetch()` only to googleapis.com discovery and API base URLs from the Discovery doc (base URL is taken from fetched doc, trusted from Google). Startup makes a Discovery request per service (10 s timeout).
- **Reusable ideas:**
  - Discovery-doc to MCP tool generation, including $ref resolution with cycle/depth limits: `src/tool-generator.ts`
  - 64-char name cap with hash suffix and collision handling: `src/tool-generator.ts` (`generateToolName`)
  - Service allowlist env var for context control: `src/services.ts`, `src/index.ts`
  - Thin REST executor with timeout and Google error unwrapping: `src/api-client.ts`
  - Bearer-or-ADC auth abstraction: `src/auth.ts`
- **Verdict:** reuse-ideas. Directory coverage is complete only because it is auto-generated; the 64-char hashing and generator are worth studying, but no safety gating, no LICENSE file, and hundreds of raw tools is the opposite of a curated admin server.
- **Unverified:** Actual runtime tool count and total across 17 services (nothing run); the Directory counts come from the live Discovery document fetched today, which may differ from what the code sees at another time; ADC with service account/DWD subject not verified; docs/ only skimmed (design spec mentions admin aliases and scopes).

### obe711__google-workspace-mcp
- **Path / remote:** D:/Projects2/Google-services-mcps/reference/obe711__google-workspace-mcp ; https://github.com/obe711/google-workspace-mcp.git
- **Purpose and product areas:** Read-only MCP server over Google Workspace using a service account with domain-wide delegation. Areas: Workspace user data (Gmail, Drive, Sheets, Docs, Slides, Calendar); Workspace admin (Directory, users list only).
- **Language and entry point:** TypeScript (Node 18+), src/index.ts -> build/index.js. Install: git clone, `npm install`, `npm run build`, then run `node build/index.js` (no npm publish). Ships a `/gw` Claude Code skill at .claude/skills/gw/SKILL.md.
- **License:** no LICENSE file found; package.json has no license field; README gives no license.
- **Last commit:** 2026-02-21, "inspector"
- **Transport:** stdio only (StdioServerTransport, src/index.ts).
- **Auth:** Service account JSON key (path in GOOGLE_SERVICE_ACCOUNT_KEY_PATH) with `google.auth.JWT` and `subject` impersonation per call; default user from GW_USER_EMAIL (.env via dotenv). Only *.readonly scopes requested (src/auth.ts). No token storage; JWT created per call.
- **Registered tools:** 20 (all `server.tool(` in src/tools/*). admin.ts: list_users. calendar.ts: list_calendars, search_events, get_event, get_freebusy. docs.ts: get_document, get_document_structure. drive.ts: search_drive_files, get_file_content, get_file_metadata. gmail.ts: search_emails, get_email, get_email_attachment, list_labels. sheets.ts: get_spreadsheet, read_sheet_range, batch_read_sheet_ranges. slides.ts: search_presentations, get_presentation, get_slide. README table lists 19 (omits get_email_attachment).
- **Read / Write / Delete:** 20 / 0 / 0. All read (scopes are readonly; no insert/update/delete/send calls found by grep). list_users: Directory users.list, customer my_customer, optional domain and query, paginates up to maxResults (max 500), returns email, name, OU, isAdmin, suspended, lastLogin, created; needs an admin to impersonate.
- **Longest tool name:** 23 characters (batch_read_sheet_ranges)
- **Safety notes:** Destructive confirmation: n-a (no write tools). Read-only flag: no flag, but read-only by construction via scopes. Hard-coded secrets: none found. Suspicious code: none (no exec/spawn/fetch/non-Google URLs in src/). Note: any caller can pass any `userEmail` to impersonate any domain user (no allowlist).
- **Reusable ideas:**
  - Per-call JWT with `subject` for DWD impersonation: src/auth.ts
  - Directory list_users with pagination loop and `fields` mask: src/tools/admin.ts
  - Error text that names the missing scope or admin requirement: src/tools/admin.ts
  - Readonly-only scope set as a safety model: src/auth.ts
- **Verdict:** reuse-ideas. Clean small read-only reference for DWD; no license so do not copy code.
- **Unverified:** Did not read the per-tool bodies of gmail/drive/calendar/docs/slides/sheets line by line; read-only status inferred from scopes plus grep for mutating calls (none). Contents of .claude/skills/gw/SKILL.md not read.


## Workspace admin

### orvice__google-workspace-mcp
- **Path / remote:** D:/Projects2/Google-services-mcps/reference/orvice__google-workspace-mcp ; https://github.com/orvice/google-workspace-mcp.git
- **Purpose and product areas:** Go MCP server for Workspace admin plus several user-data APIs via service-account DWD. Areas: Workspace admin (Directory users and groups, with write and delete); Workspace user data (Gmail list, Calendar, Drive, Sheets, Tasks).
- **Language and entry point:** Go 1.24.1, module go.orx.me/mcp/google-workspace, cmd/google-workspace-mcp/main.go, tools in internal/tools/. Uses modelcontextprotocol/go-sdk v1.2.0 and google.golang.org/api. Install: `make build` (goreleaser config present; README shows `/go/bin/google-workspace-mcp`).
- **License:** no LICENSE file found. Case-insensitive search for license, copying, notice (filesystem and `git ls-files`) found nothing; go.mod has no license info.
- **Last commit:** 2026-06-14, "Merge pull request #3 from orvice/feature/directory-users-groups"
- **Transport:** both. stdio default; `MCP_TRANSPORT=http` gives Streamable HTTP on `MCP_HTTP_ADDR` (default :8080), optional bearer token `MCP_AUTH_TOKEN` (constant-time compare). Without the token it logs "no auth" and listens on all interfaces.
- **Auth:** Service account JSON (env GOOGLE_SERVICE_ACCOUNT = file path) with DWD; subject is GOOGLE_ADMIN_EMAIL for Directory, and an email argument for Gmail/Calendar/Drive etc. (internal/utils/client.go). No tokens stored.
- **Registered tools:** 34 (mcp.AddTool). directory.go: directory_users, create_user, get_user, update_user, delete_user, suspend_user. groups.go: list_groups, get_group, create_group, delete_group, list_group_members, add_group_member, remove_group_member. gmail.go: list_gmail. calendar.go: list_calendar_events, create_calendar_event. drive.go: list_drive_files, search_drive_files, get_drive_file, create_drive_folder, upload_drive_file, share_drive_file. sheets.go: list_spreadsheets, get_spreadsheet, read_sheet_range, write_sheet_range, append_sheet_rows, create_spreadsheet. tasks.go: list_task_lists, list_tasks, create_task, update_task, delete_task, complete_task. README matches code. The directory-users-groups feature (PR #3) is the user CRUD/suspend and group plus membership CRUD above.
- **Read / Write / Delete:** 15 / 15 / 4. Read: directory_users, get_user, list_groups, get_group, list_group_members, list_gmail, list_calendar_events, list_drive_files, search_drive_files, get_drive_file, list_spreadsheets, get_spreadsheet, read_sheet_range, list_task_lists, list_tasks. Write: create_user, update_user, suspend_user, create_group, add_group_member, create_calendar_event, create_drive_folder, upload_drive_file, share_drive_file, write_sheet_range, append_sheet_rows, create_spreadsheet, create_task, update_task, complete_task. Delete: delete_user (Users.Delete), delete_group, remove_group_member (Members.Delete), delete_task. (update_task uses Tasks.Update, write.)
- **Longest tool name:** 21 characters (create_calendar_event)
- **Safety notes:** Confirmation/dry-run: no (grep for confirm/dry/Annotations/ReadOnlyHint found nothing). Read-only flag: no. Hard-coded secrets: none found. Suspicious code: none (no exec, no outbound URLs). Weak points: delete_user and delete_group execute immediately; create_user takes a plaintext password input; HTTP mode can run unauthenticated; share_drive_file can grant external access.
- **Reusable ideas:**
  - Directory users and groups tool set with typed input structs and jsonschema tags: internal/tools/directory.go, internal/tools/groups.go
  - Streamable HTTP with optional constant-time bearer auth plus test: cmd/google-workspace-mcp/http.go, http_test.go
  - Per-API TokenSource factory with DWD subject: internal/utils/client.go
  - Property-based tests (rapid): internal/tools/tools_test.go
  - goreleaser + CI packaging: .goreleaser.yaml, .github/workflows/
- **Verdict:** reuse-ideas. Best fit for the admin/Directory server design, but no license and no safety gates.
- **Unverified:** Not every tool body read; Gmail scope is readonly per README. Did not check whether list endpoints paginate (e.g. directory_users).


### securityfortech__google-admin-mcp
- **Path / remote:** D:/Projects2/Google-services-mcps/reference/securityfortech__google-admin-mcp ; https://github.com/securityfortech/google-admin-mcp.git
- **Purpose and product areas:** Small FastMCP server for Directory user management. Area: Workspace admin (Directory users only).
- **Language and entry point:** JavaScript (ESM, Node >=20), main.js with helpers in google.js. fastmcp ^1.21, googleapis ^105. Install: `docker build -t google-admin-mcp .` then `docker run -e GOOGLE_TOKEN_JSON=... google-admin-mcp`. Dockerfile runs as non-root.
- **License:** MIT (LICENSE file; "Copyright (c) 2024 Google Admin MCP"). package.json has no license field.
- **Last commit:** 2025-07-07, "Merge pull request #1 from lwsinclair/add-mseep-badge-9775333b"
- **Transport:** stdio only (server.start transportType stdio).
- **Auth:** User OAuth2 authorized-user token (refresh token) passed base64 in env GOOGLE_TOKEN_JSON, loaded with `google.auth.fromJSON` (google.js). scripts/authorize.js is a Google quickstart-derived local OAuth flow using @google-cloud/local-auth, reading credentials.json and writing token.json in cwd (not committed). Scopes: admin.directory.user and admin.directory.group.
- **Registered tools:** 5 (main.js, via server.addTool): listUsers, addUser, getUser, suspendUser, unsuspendUser. README matches code. Notes: listUsers capped at maxResults 10 with no pagination; addUser returns the generated initial password in the tool output.
- **Read / Write / Delete:** 2 / 3 / 0. Read: listUsers, getUser. Write: addUser (users.insert), suspendUser, unsuspendUser (users.update). No delete.
- **Longest tool name:** 13 characters (unsuspendUser)
- **Safety notes:** Confirmation: no. Read-only flag: no. Hard-coded secrets: none found in main.js, google.js, scripts/authorize.js, Dockerfile (grep on the full small source read). Suspicious code: none (no exec or outbound calls). Concern: generateSecurePassword uses Math.random (not cryptographically secure) and the shuffle is biased; the first four chars are fixed (A, a, 0, !).
- **Reusable ideas:**
  - Base64 token in env for containerized OAuth: google.js loadSavedCredentials
  - Quickstart-style authorize script to mint the token: scripts/authorize.js
  - Non-root Dockerfile: Dockerfile
- **Verdict:** skip. Tiny, 5 tools, weak password generation, no pagination; ideas are trivial.
- **Unverified:** None significant; all source files read in full.


### GAM-team__GAM
- **Path / remote:** D:/Projects2/Google-services-mcps/reference/GAM-team__GAM ; https://github.com/GAM-team/GAM.git
- **Purpose and product areas:** Python CLI for managing Google Workspace domains and users. Areas: Workspace admin (Directory) primarily, plus Workspace user data (Gmail, Drive, Calendar, etc. per user) and some Cloud Identity / Chrome management.
- **Language and entry point / form:** CLI, Python >=3.10. Package `gam7`; script `gam = "gam.__main__:main"`. Install: `pip install gam7` or `bash <(curl -s -S -L https://gam-shortn.appspot.com/gam-install)`.
- **License:** Apache-2.0
- **Last commit:** 2026-10-13 "chore: upgrade PyPi deps (#2005)"
- **Summary:** Command grammar in src/GamCommands.txt is entity-first: `gam <UserTypeEntity> ...` (Gmail, Drive, Calendar, Sheets, Chat, etc. for one or many users), `gam <CrOSTypeEntity>` (ChromeOS devices), plus verbs `create|update|delete|info|print|show` over user, group, org (OU), domain, alias, resource calendar, role/admin, schema, mobile device, Chrome policy/browser (CBCM), Cloud Identity groups, Meet, printers, vault-like data tools. Extensive wiki/ folder.
- **Verdict:** reuse-ideas. Best command-surface checklist for the admin server; it is a Python CLI, so not directly reusable in a TS or MCP server.
- **Unverified:** Exact command family list not enumerated (per instruction).


### hashicorp__terraform-provider-googleworkspace
- **Path / remote:** D:/Projects2/Google-services-mcps/reference/hashicorp__terraform-provider-googleworkspace ; https://github.com/hashicorp/terraform-provider-googleworkspace.git
- **Purpose and product areas:** Terraform provider managing Google Workspace via Admin SDK APIs. Areas: Workspace admin (Directory); one Gmail resource.
- **Language and entry point / form:** Terraform provider, Go (main.go, internal/provider). Install via Terraform registry.
- **License:** MPL-2.0
- **Last commit:** 2025-06-30 "Update README.md (#524)"
- **Summary:** Resources: chrome_policy, domain, domain_alias, gmail_send_as_alias, group, group_member, group_members, group_settings, org_unit, role, role_assignment, schema, user. Data sources: chrome_policy_schema, domain, domain_alias, group, groups, group_member, group_members, group_settings, org_unit, privileges, role, schema, user, users (all prefixed `googleworkspace_`). Auth per docs/index.md: service account with domain-wide delegation impersonating a super admin, or admin roles assigned directly to the service account; also supports credentials JSON/oauth_scopes in provider config.
- **Verdict:** reuse-ideas. Its resource list and OAuth scope/role setup docs are a good checklist for Directory tool coverage and auth docs.
- **Unverified:** Provider-level OAuth-token or ADC options beyond the docs excerpt read.

## Search Console

### harisnadeem__searchconsole-mcp
- **Path / remote:** D:/Projects2/Google-services-mcps/reference/harisnadeem__searchconsole-mcp ; https://github.com/harisnadeem/searchconsole-mcp.git
- **Purpose and product areas:** Lightweight Python MCP server for Search Console analytics, sitemaps and URL inspection. Areas: Search Console.
- **Language and entry point:** Python >=3.10, `searchconsole_mcp/server.py:run_server` (console script `searchconsole-mcp`); low-level `mcp.server.Server`, httpx REST calls (not googleapiclient). Install: `pip install searchconsole-mcp` (README).
- **License:** Apache-2.0 (LICENSE file; pyproject agrees)
- **Last commit:** 2026-04-01 "assets: redesign logo from scratch with clean transparent background"
- **Transport:** stdio only (server.py)
- **Auth:** Application Default Credentials via `google.auth.default` (README: `gcloud auth application-default login` or `GOOGLE_APPLICATION_CREDENTIALS` service-account key). No tokens stored by the server; in-memory cache only (utils.py). Bearer auth with one retry on 401.
- **Registered tools:** 7, all in `searchconsole_mcp/tools/__init__.py`, registered via the `TOOL_FUNCTIONS` dict in `coordinator.py` (schemas auto-built from function signatures): get_sites, query_search_analytics, get_sitemap, list_sitemaps, submit_sitemap, delete_sitemap, inspect_url. README table matches code. APIs: Search Console API v3 (`www.searchconsole.googleapis.com/webmasters/v3`) including urlInspection/index. No Indexing API.
- **Read / Write / Delete:** R5 (get_sites, query_search_analytics, get_sitemap, list_sitemaps, inspect_url) / W1 (submit_sitemap, HTTP PUT) / D1 (delete_sitemap, HTTP DELETE). No MCP annotations.
- **Longest tool name:** 22 characters (query_search_analytics)
- **Safety notes:** destructive confirmation: no. Read-only flag: no. Hard-coded secrets: none found. Suspicious code: none (grep for eval/exec/subprocess/os.system clean). Note: SCOPES is only `webmasters.readonly` (utils.py:12) yet submit/delete_sitemap need write scope, so those two likely fail with 403 (inferred, not run).
- **Reusable ideas:** signature-to-JSON-schema generator `searchconsole_mcp/coordinator.py:_sig_to_json_schema`; httpx.Auth subclass with 401 refresh-retry `searchconsole_mcp/utils.py`; CI workflow `.github/workflows/ci.yml` (black, ruff, pytest).
- **Verdict:** skip (reuse-ideas at most): small, mostly redundant, scope mismatch, no safety controls.
- **Unverified:** Tests exist (tests/test_coordinator.py, test_tools.py, test_utils.py; about 19 test functions, read not run). Unit tests with mocks covering schema generation, tool registry and unknown-tool, credential caching and token refresh, plus one test each for get_sites, query_search_analytics, inspect_url. No tests for sitemap tools. Write-scope failure not confirmed. Host `www.searchconsole.googleapis.com` correctness not checked.


### mikusnuz__gsc-mcp
- **Path / remote:** D:/Projects2/Google-services-mcps/reference/mikusnuz__gsc-mcp ; https://github.com/mikusnuz/gsc-mcp.git
- **Purpose and product areas:** TypeScript MCP server covering Search Console sites, sitemaps, search analytics, URL Inspection and the Indexing API. Areas: Search Console.
- **Language and entry point:** TypeScript, Node >=18, `src/index.ts` (dist/index.js, bin `gsc-mcp`), helper `src/indexing-batch.ts`. Install: `npx -y @mikusnuz/gsc-mcp` (README); Dockerfile (node:18-alpine) and smithery.yaml present.
- **License:** MIT (LICENSE; package.json agrees)
- **Last commit:** 2026-10-08 "release: publish indexing fixes in 1.3.4"
- **Transport:** stdio only (StdioServerTransport)
- **Auth:** (a) OAuth2 refresh token from env `GSC_CLIENT_ID`, `GSC_CLIENT_SECRET`, `GSC_REFRESH_TOKEN`, exchanged at oauth2.googleapis.com/token; (b) service account JSON via `GSC_SERVICE_ACCOUNT_KEY_PATH` (GoogleAuth), preferred if set. Scopes `webmasters` + `indexing`. No on-disk token storage and no interactive flow; env vars only.
- **Registered tools:** 13 verified, all in src/index.ts (`server.tool`): sites_list, sites_get, sites_add, sites_delete, sitemaps_list, sitemaps_get, sitemaps_submit, sitemaps_delete, search_analytics_query, url_inspection_inspect, indexing_publish, indexing_get_metadata, indexing_batch_publish. Also 2 prompts and 2 resources (sitemap resource template). A `createSandboxServer()` re-registers stub copies for Smithery scanning (not used by main). APIs: webmasters v3, searchconsole v1 URL Inspection, indexing.googleapis.com v3.
- **Read / Write / Delete:** R7 (sites_list, sites_get, sitemaps_list, sitemaps_get, search_analytics_query [POST], url_inspection_inspect [POST], indexing_get_metadata) / W4 (sites_add PUT, sitemaps_submit PUT, indexing_publish, indexing_batch_publish; both publish tools send URL_UPDATED or URL_DELETED, so they can request removal from Google) / D2 (sites_delete, sitemaps_delete, HTTP DELETE).
- **Longest tool name:** 22 characters (search_analytics_query, url_inspection_inspect, indexing_batch_publish)
- **Safety notes:** destructive confirmation: no (none for sites_delete, sitemaps_delete, URL_DELETED). Read-only flag: no. No MCP annotations found. Indexing tools require a `contentType` of JobPosting/BroadcastEvent (eligibility guard `assertIndexingEligibility`). Hard-coded secrets: none found. Suspicious code: none; fetch only to Google hosts, no child_process/eval.
- **Reusable ideas:** `getAccessToken` dual auth with 30s timeout and retry on "Premature close" (src/index.ts, top ~120 lines); Indexing batch multipart builder and per-item response parser `src/indexing-batch.ts` with test `test/indexing-batch.test.mjs`; eligibility guard plus zod enums for the Indexing API (src/index.ts ~580-600); stdio client integration test `test/resources.test.mjs`; `llms.txt` and `templates/CLAUDE.md`.
- **Verdict:** reuse-ideas: broadest and most current GSC server (read/write/delete plus Indexing API), but one 1000-line file and no safety gating.
- **Unverified:** Nothing was run; the 2 node:test files were read only. Runtime behavior of batch publish not checked. Delegated-owner requirement for Indexing API is from the README.


### metehan777__google-search-console-mcp
- **Path / remote:** D:/Projects2/Google-services-mcps/reference/metehan777__google-search-console-mcp ; https://github.com/metehan777/google-search-console-mcp.git
- **Purpose and product areas:** Small Python FastMCP server for Claude Desktop that reads Search Console performance and URL inspection data. Areas: Search Console.
- **Language and entry point:** Python >=3.11, `main.py` (FastMCP) with `gsc.py` (googleapiclient). Install: clone, venv, `pip install -e .` (README); not published. Project name `gsc-mcp-server` 0.1.0.
- **License:** no LICENSE file found; pyproject has no license field.
- **Last commit:** 2025-03-30 "Update README.md"
- **Transport:** stdio only (`mcp.run(transport='stdio')`)
- **Auth:** OAuth installed-app flow (`InstalledAppFlow.run_local_server`) using `credentials.json` in the source directory; token saved in plaintext to `token.json` next to gsc.py. Scope `webmasters.readonly`. No .gitignore in the repo (README only tells the user to add one).
- **Registered tools:** 9, all in main.py (`@mcp.tool`): list_sites, get_performance_data, get_url_inspection_result, get_index_coverage, get_sitemap_data, submit_url, check_url_status, get_site_summary, get_mobile_issues. Uses searchconsole v1 via googleapiclient (sites, searchanalytics, sitemaps list/get, urlInspection). No Indexing API. README features list is less detailed than the code.
- **Read / Write / Delete:** R9 / W0 / D0. `submit_url` (gsc.py `submit_url_for_indexing`) does NOT call Google to submit; it runs an inspection and returns a hard-coded "SUBMITTED_FOR_INDEXING" simulated response (misleading to an LLM).
- **Longest tool name:** 25 characters (get_url_inspection_result)
- **Safety notes:** confirmation: n-a (no writes). Read-only flag: no, but scope is readonly. Hard-coded secrets: none found. Suspicious code: none; gsc.py makes no non-Google HTTP calls (only googleapiclient). Quality concern: get_index_coverage, get_mobile_issues and get_indexed_urls query searchAnalytics with dimensions `issue` / `index_state`, which are not valid Search Analytics dimensions (likely error or empty; not run).
- **Reusable ideas:** little; InstalledAppFlow plus token.json pattern in gsc.py lines 18-40 is standard but stores the token in the source dir.
- **Verdict:** skip: tiny, no license, fake submit tool, questionable coverage/mobile tools.
- **Unverified:** Behavior of the invalid dimensions; no tests exist.

