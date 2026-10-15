# Google Cloud, Workspace and Search Console: CLI and API surface inventory

Compiled 2026-10-13 for the four-server MCP suite: `cloud`, `workspace-user`, `workspace-admin`, `searchconsole`.

## Method and legend

- Official sources: docs.cloud.google.com (gcloud, bq, gsutil reference), developers.google.com (Admin SDK, Search Console, Gmail, Calendar, Drive, Chat, Sheets, Docs, Apps Script, Vault, Alert Center, Chrome Policy references), and the GitHub READMEs of the tools below.
- Local reference clones were read as text only (no code run, no installs, nothing under `reference\` modified): `GAM-team__GAM` (`src/GamCommands.txt` BNF grammar, `wiki/`, `src/gam/__init__.py`) and `hashicorp__terraform-provider-googleworkspace` (`internal/provider/`, `docs/`, `CHANGELOG.md`, `README.md`).
- gcloud is not installed. All gcloud data comes from the reference docs, not from `--help`.
- Target column: `cloud`, `workspace-user` (WU), `workspace-admin` (WA), `searchconsole` (SC).
- R/W/D = read / write / delete. Read commands are list, get, describe, show, print and info. Write commands create, update, patch or otherwise change state. Delete commands remove or disable data. Where a surface mixes these, the row says so.
- GA means the command or group is shown without an ALPHA or BETA label on the reference page. Alpha or beta variants are noted where the page names them. Subcommand-level labels are often absent, so check before wiring a command.
- [UNVERIFIED] marks anything I could not confirm in docs or the repo during this pass.

## 1. Summary table (one row per surface)

Surfaces: 11 CLI-type rows (C01-C11) and 16 REST API rows (A01-A16). 27 in total.

| ID | Surface | Owner | Target | What it manages | R/W/D | JSON output | Verification |
|---|---|---|---|---|---|---|---|
| C01 | gcloud (Google Cloud CLI) | Google | cloud | Projects, services and api-keys, IAM, organizations, resource-manager, quotas, logging, monitoring, storage, plus high-level compute/run/container/sql/billing | Mixed R/W/D | Yes, `--format=json` (global scope [UNVERIFIED]) | Reference docs read; not installed |
| C02 | bq | Google | cloud | BigQuery datasets, tables, jobs, IAM policies | Mixed R/W/D | Yes, `--format=json` / `prettyjson` / `csv` | Reference docs read; init and shell [UNVERIFIED] |
| C03 | gsutil (legacy) | Google | cloud | Cloud Storage buckets and objects | Mixed R/W/D | [UNVERIFIED] | Docs read; use `gcloud storage` instead |
| C04 | clasp | Google repo, README says not officially supported | WU | Apps Script projects, deployments, versions, logs | Mixed R/W/D | Partial (`--json` on some commands) | README read |
| C05 | GAM (gam7) | Community (GAM-team; Jay Lee, Ross Scroggs), Apache-2.0 | WA, plus WU for per-user data | Users, groups, OUs, domains, admin roles, licenses, reports, Drive, Gmail settings, Calendar, Chrome, Vault, Classroom, Chat and more | R about 269 / W about 122 / D about 82 top-level; about 240 / 98 / 76 per-user (heuristic count) | Yes, `formatjson` on many commands; CSV default | Grammar and wiki read |
| C06 | gws (googleworkspace/cli) | Hosted in Google's GitHub org; README says not officially supported | WU; WA partly [UNVERIFIED] | Drive, Gmail, Calendar, Sheets, Docs, Chat, admin; commands generated from Discovery | Derived from Discovery method names | Yes, JSON default | README read |
| C07 | gog (openclaw/gogcli) | Community | WU | Gmail, Calendar, Drive, Docs, Sheets, Contacts; admin features need a managed domain | Mixed R/W/D | Yes, `--json` | Search snippets only [UNVERIFIED] |
| C08 | gcalcli | Community (insanum), MIT | WU | Google Calendar agenda, events, reminders | Mostly R/W; delete described but not a listed subcommand | Not stated | README read |
| C09 | Got Your Back (GYB) | Community (GAM-team), Apache-2.0 | WU | Gmail backup and restore | Backup and restore | Not stated | README summary only [UNVERIFIED] |
| C10 | Terraform google-workspace provider | HashiCorp; archived | WA | Users, groups, group members and settings, OUs, roles, role assignments, domains, domain aliases, schemas, Chrome policies, Gmail sendAs | Mixed through IaC | Terraform state and plan JSON (generic, not MCP-ready) | Repo read; archived |
| C11 | Search Console community CLIs | No official CLI found | SC | Sites, sitemaps, analytics, URL inspection (varies per tool) | Varies | Varies | Search snippets only [UNVERIFIED] |
| A01 | Search Console API (webmasters/v3, searchconsole/v1) | Google | SC | sites, sitemaps, searchAnalytics.query, urlInspection.index.inspect | R/W/D | Yes (REST JSON) | Index page read |
| A02 | Admin SDK Directory API v1 | Google | WA | 26 resources: users, groups, members, orgunits, roles, roleAssignments, domains, schemas, customers, devices, resources | R/W/D | Yes | Method lists read for most resources |
| A03 | Groups Settings API v1 | Google | WA | Group access and posting settings | R/W | Yes | Methods read (get, patch, update) |
| A04 | Cloud Identity API v1 | Google | WA | Cloud Identity groups, memberships, group security settings | R/W/D | Yes | Methods read; base URL [UNVERIFIED] |
| A05 | Enterprise Licensing API v1 | Google | WA | License assignments per product SKU | R/W/D | Yes | Methods read; base URL [UNVERIFIED] |
| A06 | Reports API v1 | Google | WA | Audit activity logs, usage reports | R (plus watch subscriptions) | Yes | Endpoint and application list read |
| A07 | Chrome Policy API v1 | Google | WA | Chrome policy resolve, group and OU policies, networks, policy schemas | R/W | Yes | Methods read |
| A08 | Vault API v1 | Google | WA | Matters, holds, exports, saved queries | R/W/D | Yes | Methods read |
| A09 | Alert Center API v1beta1 | Google | WA | Security alerts, alert feedback, alert settings | R/W/D | Yes | Methods read |
| A10 | Gmail API v1 (users.settings) | Google | WU | Filters, forwarding, delegates, sendAs, vacation, IMAP/POP, CSE, S/MIME | R/W/D | Yes | Settings read; messages and labels [UNVERIFIED] |
| A11 | Google Calendar API v3 | Google | WU | Calendars, events, ACLs, calendar list, settings | R/W/D | Yes | Methods read |
| A12 | Google Drive API v3 | Google | WU | Files, permissions, shared drives, revisions, comments | R/W/D | Yes | Methods read |
| A13 | Google Chat API v1 | Google | WU | Spaces, members, messages, reactions, sections | R/W/D | Yes | Methods read |
| A14 | Google Sheets API v4 | Google | WU | Spreadsheets, values, sheets, developer metadata | R/W/D | Yes | Methods read |
| A15 | Google Docs API v1 | Google | WU | Documents: create, get, batchUpdate | R/W | Yes | Methods read |
| A16 | Apps Script API v1 | Google | WU | Projects, content, versions, deployments, processes, metrics, scripts.run | R/W/D | Yes | Methods read |

Precedent, not counted as a surface: `googleapis/gcloud-mcp` (official Google MCP server that drives the gcloud CLI; see section 13).

## 2. Answers to the specific questions

- **gcloud api-keys:** the GA group is `gcloud services api-keys`. The reference page also names `gcloud alpha services api-keys` and `gcloud beta services api-keys` as variants. The page does not label the GA group as GA, but it has no alpha or beta label.
- **Terraform org-unit resource:** yes. `googleworkspace_org_unit` exists as both a resource and a data source.
- **Official Search Console CLI:** none found. The Search Console developer page links only the API, the web app and the Rich Results test.
- **Official Workspace CLI (gws):** `googleworkspace/cli` is hosted in Google's GitHub org, but its README says it is not an officially supported Google product.
- **Official CLIs for Gmail, Calendar, Drive, Docs, Sheets, Chat:** none. These are API-only. Community CLIs cover parts of them (C06, C07, C08, C09).

## 3. C01: gcloud (Google Cloud CLI)

### Install and auth
- Install: the Google Cloud CLI (not installed on this machine; no commands run).
- Auth [standard gcloud auth; not re-read in docs]: `gcloud auth login`, `gcloud auth application-default login`, service account keys, impersonation.
- Output: `--format` accepts json, yaml, csv, value, table, text, flattened and others (formats topic read). The page shows `--format=json` but does not say it works on every command [UNVERIFIED for global scope].
- Tracks: most groups have `gcloud alpha X` and `gcloud beta X` variants. The group pages label ALPHA or BETA where relevant.

### Command groups (verified on docs.cloud.google.com/sdk/gcloud/reference/...)

| Group | Track | Subcommands (verified) | Read | Write | Delete |
|---|---|---|---|---|---|
| projects | GA; alpha and beta variants | create, delete, describe, get-ancestors, get-ancestors-iam-policy, get-iam-policy, set-iam-policy, add-iam-policy-binding, remove-iam-policy-binding, list, undelete, update | describe, get-ancestors*, get-iam-policy, list | create, update, undelete, set/add/remove-iam-policy-binding | delete |
| services | GA; alpha and beta variants | enable, disable, list; api-keys (create, delete, describe, get-key-string, list, lookup, undelete, update); operations (describe, wait); peered-dns-domains (create, delete, list); vpc-peerings (connect, delete, enable/disable-vpc-service-controls, get-vpc-service-controls, list, update) | list, describe, lookup, get-key-string, get-vpc-service-controls | enable, disable, create, update, connect, undelete | delete |
| services api-keys | GA `gcloud services api-keys`; alpha and beta variants | As above | describe, list, lookup; get-key-string returns the key secret, so treat as sensitive | create, update, undelete | delete |
| iam service-accounts | GA; alpha and beta variants | create, delete, describe, disable, enable, get-iam-policy, set-iam-policy, add/remove-iam-policy-binding, list, sign-blob, sign-jwt, undelete, update | describe, get-iam-policy, list | create, enable, disable, update, IAM binding changes, sign-blob, sign-jwt | delete |
| iam service-accounts keys | GA | create, delete, disable, enable, list, upload | list | create, upload, enable, disable | delete |
| iam (other groups) | GA; alpha and beta variants | roles; workload-identity-pools (with providers, namespaces, managed-identities, operations); workforce-pools (with providers, subjects, scim-tenants, keys); oauth-clients (credentials); policies; policy-bindings; access-policies; principal-access-boundary-policies; simulator replay-recent-access; list-grantable-roles; list-testable-permissions | Groups named; subcommands [UNVERIFIED except those listed] | [UNVERIFIED] | [UNVERIFIED] |
| organizations | GA; alpha and beta variants | list, describe, get-iam-policy, set-iam-policy, add-iam-policy-binding, remove-iam-policy-binding | list, describe, get-iam-policy | set/add/remove-iam-policy-binding | none |
| resource-manager | GA; alpha and beta variants | folders (create, delete, describe, get-ancestors-iam-policy, get-iam-policy, list, move, set/add/remove-iam-policy-binding, undelete, update); tags (bindings, holds, keys, values: create, delete, describe, list, update, IAM verbs); org-policies (allow, deny, delete, describe, disable-enforce, enable-enforce, list, set-policy); capabilities (describe, update) | describe, list, get-iam-policy, get-ancestors-iam-policy | create, move, update, enable/disable-enforce, allow, deny, set-policy, undelete | delete |
| quotas | `gcloud alpha quotas` is ALPHA; `gcloud quotas` is GA; `gcloud beta quotas` exists | info (describe, list); preferences (create, describe, list, update) | info describe/list; preferences describe/list | preferences create/update | none |
| logging | GA; alpha and beta variants | copy, read, write; buckets (create, delete, describe, list, undelete, update); links; locations; logs (delete, list); metrics (create, delete, describe, list, update); operations (cancel, describe, list); recent-queries; resource-descriptors; saved-queries; scopes; settings (describe, update); sinks (create, delete, describe, list, update); views (incl. IAM verbs) | read, list, describe, copy (source), recent-queries | write, copy, create, update, settings update, undelete (buckets, restore) | delete subcommands |
| monitoring | GA (no label on the page); alpha and beta variants | alerts (describe, list); dashboards (create, delete, describe, list, update); policies (create, delete, describe, list, migrate, update; conditions create/delete/describe/update); snoozes (cancel, create, describe, list, update); uptime (create, delete, describe, list-configs, list-ips, update) | describe, list, list-configs, list-ips | create, update, migrate, cancel | delete |
| storage | GA; `gcloud alpha storage` variant | Top level: cp, mv, rm, ls, cat, du, hash, rsync, sign-url, diagnose, restore, service-agent. Groups: batch-operations, buckets (anywhere-caches, notifications), folders, hmac, insights (dataset-configs, inventory-reports), intelligence-configs, intelligence-findings, managed-folders, objects, operations | ls, cat, du, hash, describe-type commands | cp, mv, rsync, sign-url (signing), and create/update subcommands | rm and delete subcommands |
| bq (top-level group) | Listed on the gcloud index; contents [UNVERIFIED] | Not read | | | |

Other top-level groups named on the reference index (names only; subcommands [UNVERIFIED]): access-approval, access-context-manager, active-directory, agent-identity, agent-registry, ai, ai-platform, alloydb, anthos, api-gateway, apigee, apihub, app, app-topology, apphub, artifacts, asset, assured, audit-manager, backup-dr, batch, beyondcorp, biglake, bigtable, billing, bms, builds, certificate-manager, cloud-shell, cloudlocationfinder, cluster-director, colab, compliance-manager, components, composer, compute, config, container (GKE), data-catalog, database-migration, dataflow, datalineage, dataplex, dataproc, datastore, datastream, deploy, deployment-manager, design-center, developer-connect, developer-knowledge, dns, domains, edge-cache, edge-cloud, emulators, endpoints, essential-contacts, eventarc, filestore, firebase, firestore, functions, gemini, healthcare, iap, identity, ids, infra-manager, kms, lustre, looker, managed-kafka, memcache, memorystore, metastore, migration, ml, model-armor, netapp, network-connectivity, network-management, network-security, network-services, notebooks, observability, oracle-database, org-policies, pam, parametermanager, policy-intelligence, policy-troubleshoot, preview, privateca, publicca, pubsub, quotas, recaptcha, recommender, redis, run, scc, scheduler, secrets, service-directory, service-extensions, service-health, source, source-manager, spanner, sql, support, tasks, topic, transcoder, transfer, vector-search, vmware, workbench, workflows, workload-identity, workspace-add-ons, workstations.

Notes:
- There is no `bigquery` group in the index. BigQuery is driven by the separate `bq` CLI (C02).
- `identity` may cover Cloud Identity groups from the CLI. Unverified.
- `workspace-add-ons` may cover Workspace add-on deployment. Unverified.
- Monitoring `channels` and `metrics` groups are not on the GA page. Unverified.
- `logging tail` is not on the GA page. Unverified.

### Gaps (gcloud)
- Subcommand-level alpha and beta labels are often absent. Check each command before wiring it into an MCP tool.
- Some subcommands return secrets (`services api-keys get-key-string`, `iam service-accounts keys create`). Mark them write-sensitive.

## 4. C02: bq (BigQuery CLI)

- Owner: Google. Python-based. The reference page says it is used "from a local installation of the Google Cloud CLI" (not explicitly "bundled").
- Install: as above [install path not stated in detail].
- Auth [UNVERIFIED on the page]: the tutorial uses the Google Cloud CLI project config (`gcloud config set project`).
- Output: `--format` takes pretty, sparse, prettyjson, json, csv or none (verified). Use `json` for MCP.
- Commands verified in the reference: add-iam-policy-binding, cancel, cp, extract, get-iam-policy, head, help, insert, load, ls, mk, mkdef, partition, query, remove-iam-policy-binding, rm, set-iam-policy, show, update, version, wait. `init` and `shell` appear in the nav list but were not seen in fetched text [UNVERIFIED].
- R/W/D:
  - Read: ls, show, head, get-iam-policy, wait, version, help.
  - Write: mk, load, insert, cp, update, extract (writes to Cloud Storage), query (creates jobs), set/add/remove-iam-policy-binding, cancel, partition, mkdef.
  - Delete: rm (tables and datasets; `--recursive` for datasets).
- Preview and experimental flags exist, for example `--max_slots` and `--scaling_mode` on mk, and `--min_completion_ratio` on query. Track these as preview in the tool schema.
- Gaps: BigQuery only. No Admin or Workspace coverage.

## 5. C03: gsutil and gcloud storage

- gsutil status: legacy and "minimally maintained". The page advises against new use and recommends `gcloud storage`. It is currently bundled with the Google Cloud CLI. After March 2027 it will be distributed only as a standalone PyPI tool. It lacks newer features such as soft delete and managed folders.
- gsutil subcommands: only `cp` is named on the page. Others [UNVERIFIED], including rsync.
- Recommendation: do not wrap gsutil. Wrap `gcloud storage` (section 3, group storage) or the Cloud Storage JSON API.

## 6. C04: clasp (Apps Script CLI)

- Owner: `google/clasp` repo. The README says "This is not an officially supported Google product." Apache-2.0. Active at fetch time (43 open issues, 12 open PRs).
- Install: `npm install -g @google/clasp` (Node.js 22 or later).
- Auth: `clasp login` (OAuth; stores `.clasprc.json` in the home directory). Use `--creds` for a Desktop OAuth client. The Apps Script API must be enabled in user settings at script.google.com. Service account auth (`--adc`) is marked experimental and not working.
- Output: global `--json` is documented. Commands that explicitly list it: show-authorized-user, show-file-status, setup-logs, tail-logs.
- Commands (verified): login, logout, show-authorized-user, create-script (create), clone-script (clone), delete-script, pull, push (`-f`, `--watch`), show-file-status (status), open-script (open; also open-web-app, open-container, open-credentials-setup), list-deployments, create-deployment (deploy), update-deployment (redeploy), delete-deployment (undeploy; `--all`), create-version (version), list-versions, list-scripts (list), tail-logs (logs), setup-logs, list-apis, enable-api, disable-api, open-api-console, run-function (run), mcp (experimental).
- `settings` is not in the fetched page content [UNVERIFIED].
- R/W/D:
  - Read: pull (remote to local), show-file-status, list-*, tail-logs, show-authorized-user.
  - Write: create, clone, push, create-deployment, update-deployment, create-version, enable-api, disable-api, run-function (executes code), login.
  - Delete: delete-script, delete-deployment.
- Gaps: `push` replaces the entire remote project; no per-file or atomic updates. TypeScript is not transpiled. `tail-logs` shows `console.log` only, not `Logger.log`. `run-function` needs your own credentials and a deployment as an API executable. Logs need a GCP project ID for some features.

## 7. C05: GAM (Google Apps Manager, gam7)

### Install, owner, auth
- Owner: GAM-team. The pyproject lists Jay Lee and Ross Scroggs as authors. License: Apache-2.0.
- Install: `pip install gam7` (per README), Windows EXE installer, or a bash installer (per README).
- Source: `src/gam/__init__.py` (about 83.9k lines; the main module holding the command handling [dispatch structure not read in detail]). Grammar: `src/GamCommands.txt` (9,137-line BNF). Wiki: 168 pages in `wiki/`.
- Auth (per wiki page headings): GAM creates or uses a GCP project, with client credentials (OAuth), service accounts (domain-wide delegation), Workload Identity Federation, and YubiKey options. Pages cover "Manage Projects", "Manage Client credentials", "Manage Service Accounts", "Using GAM7 with a delegated admin service account", "Using GAM7 with keyless authentication - Workload Identity Federation" and "Using GAM7 with a YubiKey".
- Output: CSV by default for print and show. `formatjson` on about 417 grammar lines (mainly info and print). `todrive`, `redirect csv`, `redirect stdout`. Use `formatjson` for MCP wrapping.
- The grammar has about 1,051 `gam ...` command lines. Counts below are a verb-based heuristic, so treat them as approximate.
- Top-level verbs (most frequent): print about 101, show about 75, info about 67, update about 65, delete about 55, create about 52 (including create|add), copy 5, undelete 4, rotate 4, download 4, clear 4, check 4, sync 3, audit 3.
- Entity-scoped form: `gam <UserTypeEntity> <verb> <noun>` (per-user operations) and `gam <GroupEntity>`, `gam <OrgUnitEntity>`, `gam <CalendarEntity>`, `gam <CourseEntity>` and `gam <ResourceEntity>` forms.
- Legacy fork: the wiki includes "How to Upgrade GAMADV-XTD3 to GAM7" [UNVERIFIED repo details].
- The source tree bundles some discovery JSON files (cbcm-v1.1beta1, contactdelegation-v1, datastudio-v1, meet-v2beta, serviceaccountlookup-v1). Some APIs are beta or private discovery documents.

### Command groups

| Group | Representative commands (from grammar) | Read | Write | Delete |
|---|---|---|---|---|
| Users | create/add user; update user(s); info user; print users; suspend/unsuspend users; signout; turnoff2sv; `<UserTypeEntity> update users` | info, print, show | create, update, suspend, unsuspend, signout, turnoff2sv, undelete user(s) (restore) | delete user(s) |
| User credentials | ASPs, backup codes, tokens (show/delete) | show | update backup codes | delete ASPs, backup codes, tokens |
| Groups | create/add group; update group(s); info group(s); print groups; print/show group-members; info member; sync group(s); show grouptree | info, print, show | create, update, sync | delete group(s) |
| Cloud Identity groups | create/update/delete/info/print cigroups; cigroup-members | info, print | create, update | delete |
| OUs (org units) | create/add org/ou; update orgs/ous; info org/ou; print orgs/ous; show orgtree; check ou | info, print, show, check | create, update | delete org/ou |
| Domains | create/add domain; create/add domainalias; verify/verification; info domain, domainalias, verify; print domains, domainaliases | info, print | create, add | delete domain, domainalias |
| Admins and admin roles | create/add admin; create/update/delete adminrole; info adminrole; print/show admins, adminroles, privileges | info, print, show | create, add, update | delete admin, adminrole |
| Licenses | print/show licenses; show configlicenseskus; `<UserTypeEntity> update license`; `sync license` | print, show | update license, sync license | none |
| Reports and audit | report users; report customers/customer/domain; report usage; report usageparameters; report `<application>`; audit monitor | report | audit monitor (writes or sets monitors) [UNVERIFIED] | none |
| Alert Center | info/print/show alerts; show/update alertsettings; create alertfeedback; print alertfeedback | info, print, show | update alertsettings, create alertfeedback, undelete alert (restore) | delete alert |
| Vault | create/add vaultmatter, vaulthold, vaultexport, vaultquery; close/reopen vaultmatter; info/print/show vault objects; download vaultexport; copy vaultquery/vaultexport | info, print, show, download | create, close, reopen, copy | delete vault objects |
| Data transfer | create/add datatransfer; info/print/show datatransfers; show transferapps | info, print, show | create | none |
| Shared drives | create/update/delete/info/print/show shareddrive(s); hide/unhide; shareddriveacls (print, show, copy, sync); shareddrivethemes (show) | info, print, show | create, update, hide, unhide, copy, sync | delete shareddrive |
| Drive (user-level) | print/show/info drivefile, drivefileacl(s), filetree, filepath, filelist, filecounts, fileinfo; drive settings | info, print, show | copy and move (copy drive, transfer drive), update drivefile, create/add permissions, trash/untrash drivefile, transfer ownership | delete permissions, drivefileacl, emptydrivefolders; trash |
| Gmail (user-level) | show messages/threads; trash/untrash/spam messages; create/update/delete labels; show/create/delete filters; show/create/delete forwardingaddress; forward (auto-forward); show/create/update/delete sendas; create/update/delete delegates; vacation; signature; pop/imap; smime; cse identity and keypair; language; send email (sendemail) | show, print | create, update, send, vacation, signature, trash, untrash, spam | delete filters, labels, forwardingaddress, sendas, delegates, cse identity, asps |
| Calendar (user-level) | calendar `<CalendarEntity>` add/update/delete/showacl/printacl; addevent, updateevent, moveevent, deleteevent, printevents; wipe; calendar settings (calsettings); calendars transfer | show, print, info | create/add ACL, addevent, updateevent, moveevent, transfer | delete ACL, deleteevent, wipe |
| Calendar resources | create/add resource; update/delete/info/print/show resources; resource acls (print, show, create, update, delete) | info, print, show | create, update, acl changes | delete resources, acls |
| Chat | info/print/show chatspace, chatmember, chatmessage, chatevent; create chatmember/chatmessage; update chatspace; setup chat | info, print, show | create, update, sync chatmembers | delete chatspace, chatmember, chatmessage |
| Classroom | create/add course; update course(s); delete course(s); info course(s); print courses and course-* (announcements, works, submissions, students, teachers); course sync students/teachers; create/delete course-studentgroups; guardians | info, print, show | create, add, sync, update | delete, remove, clear |
| Contacts and People | create contact; info/print/show contacts, domain contacts (people); dedup contacts; contact photos; domain shared contacts | info, print, show | create, update | delete contacts |
| Chrome and ChromeOS | info/print/update cros; issuecommand cros; getcommand cros; print/show chromeapps, chromeprofiles, chromepolicies, chromeversions, chromehistory, chromeaues, chromeneedsattn, chromedevicecounts; printers (print, show, create, update, delete); browsers (print, delete, revoke, create browsertoken, move) | info, print, show | update cros, issuecommand, create printers and policies, create chromeprofilecommand, create chromenetwork, move browsers | delete chromepolicy, printer, browser, chromeprofile; revoke browsertoken |
| Mobile devices | info/print/update/delete mobile; action mobile | info, print | update, action | delete mobile |
| Cloud and project admin | create/add project; delete project; print/show projects; enable apis; create gcpfolder; create/update/delete/rotate/show svcacct and sakey(s); info currentprojectid; oauth create/info/update/delete/export/refresh (GAM's own OAuth client); copy/download storagebucket; download storagefile | info, print, show, download | create, update, enable, rotate, copy | delete project, svcacct, sakeys, oauth (revoke) |
| Policies, CAA and SSO | create/update/delete/info/print/show policy(ies); create/update/delete/print/show caalevel(s); create/info/print/delete inboundssoprofile, inboundssocredential, inboundssoassignment | info, print, show | create, update | delete |
| Schemas | create/add schema(s); update; delete; info; print; print/show chromeschemas | info, print | create, update | delete |
| Customer | info customer, customerid; update customer; print/show usercountsbyorgunit | info, print, show | update customer | none |
| Other per-user reads | Tag Manager (show tagmanager*), YouTube, Keep notes, Forms, Sites (web resources, webmaster sites), Data Studio (permissions, assets), Analytics admin, Meet (spaces, recordings, transcripts, participants), business profile | show, print | some update forms and business profiles [UNVERIFIED] | none listed |
| Batch and meta | batch, tbatch, csv, loop, redirect, comment, checkconnection, version, help, whatis, select sections from gam.cfg | n/a | n/a | n/a |

### Gaps (GAM)
- Its command surface is a text grammar (BNF), not a schema. Wrapping each command needs per-command argument building.
- `formatjson` is not on every command. Print commands default to CSV.
- Several admin features depend on APIs and private discovery files that the reference does not document as a stable contract.
- Admin-console-only settings are not inventoried here [UNVERIFIED].
- The legacy GAMADV-XTD3 fork and the Email Audit Monitor ("audit monitor") status are unverified.

## 8. C06: gws (googleworkspace/cli)

- Owner: GitHub org `googleworkspace`, repo `cli`. The README says it is not an officially supported Google product. Apache-2.0. Pre-1.0 with breaking changes expected. The fetched page showed about 31.4k stars.
- Install: `npm install -g @googleworkspace/cli` (Node 18+), Homebrew, `cargo install --git ... --locked`, Nix flake, or GitHub Releases binaries.
- Command generation: built at runtime from Google's Discovery Service (cached 24 hours). New endpoints appear without a release. A `clap` command tree is built from the resources and methods.
- Namespaces named in the README: drive, gmail, calendar, sheets, docs, chat, admin, plus helpers `script`, `workflow`, `events`, `modelarmor`. The README says "every Workspace API". Admin (Directory) coverage is named but not verified [UNVERIFIED].
- Output: JSON by default ("every response is structured JSON"). `--page-all` streams NDJSON.
- Auth: `gws auth setup` (requires gcloud) or `gws auth login` (with a manual Cloud Console option). Headless: exported credentials file. Service account: `GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE`. Pre-obtained token: `GOOGLE_WORKSPACE_CLI_TOKEN`. Credentials are encrypted at rest (AES-256-GCM), with the key in the OS keyring or a file.
- MCP: the search summary says it supports MCP [UNVERIFIED].
- R/W/D: derived from Discovery method names (get/list vs insert/patch/delete). Per-command split [UNVERIFIED].
- Name collisions: PyPI `gws-cli` and Go `workspace-cli` are different projects.
- Gaps: unsupported by Google. Admin coverage unverified. Behaviour may change before v1.0.

## 9. C07: gog (openclaw/gogcli)

Details below come from search snippets, not from fetching the repo [UNVERIFIED].
- Owner: openclaw org (the module path moved from steipete/gogcli). Community project. License [UNVERIFIED].
- Install: Homebrew (`openclaw/tap/gogcli`) or `go install github.com/openclaw/gogcli/cmd/gog`.
- Commands by service, e.g. `gog gmail search`, `gog calendar events`, `gog drive ls`, `gog sheets`, `gog contacts`.
- Output: `--json` (structured) and `--plain` (stable TSV). `--readonly` flag.
- Auth: Desktop OAuth client, JSON file registered with `gog auth credentials`, then `gog auth add` with `--services`. Gmail scope can be narrowed (for example send-only).
- Admin Directory, Cloud Identity Groups, Chat, Keep and domain-wide delegation need a managed Workspace domain.
- A separate `struong/gogcli` repo describes a similar CLI [UNVERIFIED].

## 10. C08: gcalcli

- Owner: insanum (GitHub user). MIT. Python CLI for Google Calendar.
- Install: `pip install gcalcli[vobject]` or `pipx install gcalcli[vobject]`. The README also lists apt, Homebrew, Nix and source installs.
- Commands: init, list, edit, agenda, updates, calw, calm, quick, add, import, remind. Delete and search are described as features but are not listed as subcommands.
- Output: colored text, `--nocolor`, Conky format. No JSON option mentioned (so MCP wrapping needs a custom parser or the Calendar API instead).
- Auth: OAuth2. The token is stored in an `oauth` file in the platform data directory. The README says users currently need their own Calendar API token.
- Maintenance: not archived. 616 commits and 158 open issues at fetch time. Recent activity not confirmed.

## 11. C09: Got Your Back (GYB)

- Owner: GitHub org `GAM-team` (repo `got-your-back`). The README says it is maintained by Jay Lee. Apache-2.0.
- Purpose: back up Gmail messages to a local computer through the Gmail API.
- Install: Linux and macOS bash installer; Windows MSI from GitHub Releases.
- Commands, output format, auth method and maintenance status are not on the fetched page [UNVERIFIED]. The wiki has details.

## 12. C10: Terraform google-workspace provider (archived)

- Owner: HashiCorp. The README says "This Terraform provider is archived." Issues and PRs are not monitored and no new releases will be published. The last changelog release is 0.7.0 (June 10, 2022). The 0.8.0 entry is unreleased.
- Install: Terraform `required_providers` (registry; not re-verified). Requires Terraform 0.13 or later and Go 1.16 or later (README).
- Auth: service account with domain-wide delegation. `GOOGLE_OAUTH_ACCESS_TOKEN` supported since 0.7.0 (changelog).

### Resources (13)
`googleworkspace_chrome_policy`, `googleworkspace_domain`, `googleworkspace_domain_alias`, `googleworkspace_gmail_send_as_alias`, `googleworkspace_group`, `googleworkspace_group_member`, `googleworkspace_group_members`, `googleworkspace_group_settings`, `googleworkspace_org_unit`, `googleworkspace_role`, `googleworkspace_role_assignment`, `googleworkspace_schema`, `googleworkspace_user`.

### Data sources (14)
`googleworkspace_chrome_policy_schema`, `googleworkspace_domain`, `googleworkspace_domain_alias`, `googleworkspace_group`, `googleworkspace_group_member`, `googleworkspace_group_members`, `googleworkspace_group_settings`, `googleworkspace_groups`, `googleworkspace_org_unit`, `googleworkspace_privileges`, `googleworkspace_role`, `googleworkspace_schema`, `googleworkspace_user`, `googleworkspace_users`.

### Google APIs called (from Go imports and `services.go`)
- Admin SDK Directory: users (and aliases), groups (and aliases), members, orgunits, roles, roleAssignments, privileges, schemas, domains, domainAliases, customers.get.
- Groups Settings API: group settings.
- Chrome Policy API: customers policies and policy schemas.
- Gmail API: users.settings.sendAs.

### Gaps
- No Reports, Licensing, Vault, Alert Center, Cloud Identity groups, or Chrome Management beyond the Chrome Policy resources.
- The provider is archived, so it is not a maintained base for the workspace-admin server.

## 13. C11: Search Console CLIs (no official tool)

- Official status: no official Google CLI found. The Search Console developer page (developers.google.com/webmaster-tools) links the Search Console API, the web app (search.google.com/search-console) and the Rich Results test. It does not mention a CLI.
- Community CLIs, from search results only [UNVERIFIED for all]:
  - `gsc-cli` (Python, PyPI, by SEO Consult): analytics pulls, URL inspection, sitemap management; JSON output; OAuth2 or service account.
  - `searchconsole-cli` (npm, binary `gsc`): built for AI agents; JSON default, table as an opt-in flag.
  - `gsc` (Go, jparavisini): service account only; prints raw API JSON.
  - `gsc-cli` (Go, benedict2310): service account only; no browser OAuth; no write operations.
  - `gsc-cli` (Go, awkoy): pre-1.0; uses gcloud only for the OAuth browser flow.
  - `google-search-console-cli` (npm, ivankristianto): Search Console and the Indexing API.
- Recommendation: wrap the REST API (A01) directly rather than depending on a community CLI.

## 14. REST APIs (A01-A16)

Method names come from the official reference pages. Base URLs are stated where the page gave them. HTTP verbs and paths were not captured for every method.

### A01: Search Console API
- Base URLs: `https://www.googleapis.com/webmasters/v3` (sites, sitemaps, searchAnalytics) and `https://searchconsole.googleapis.com/v1` (urlInspection).
- sites: add (W), delete (D), get (R), list (R).
- sitemaps: delete (D), get (R), list (R), submit (W).
- searchAnalytics: query (R).
- urlInspection.index: inspect (R).
- Not on the index page: urlTestingTools, site verification, Indexing API (separate API; [UNVERIFIED]).

### A02: Admin SDK Directory API v1
Base URL `https://admin.googleapis.com/admin/directory/v1/` (verified). 26 resources:

| Resource | Methods (verified) | R/W/D notes |
|---|---|---|
| users | createGuest, delete, get, insert, list, makeAdmin, patch, signOut, undelete, update, watch | Read: get, list, watch. Write: createGuest, insert, makeAdmin, patch, signOut (disruptive), undelete, update. Delete: delete |
| users.aliases | delete, insert, list, watch | Read: list, watch. Write: insert. Delete: delete |
| users.photos | delete, get, patch, update | Read: get. Write: patch, update. Delete: delete |
| groups | delete, get, insert, list, patch, update | Read: get, list. Write: insert, patch, update. Delete: delete |
| groups.aliases | delete, insert, list | Read: list. Write: insert. Delete: delete |
| members | delete, get, hasMember, insert, list, patch, update | Read: get, hasMember, list. Write: insert, patch, update. Delete: delete |
| orgunits | delete, get, insert, list, patch, update | Read: get, list. Write: insert, patch, update. Delete: delete |
| roles | delete, get, insert, list, patch, update | Read: get, list. Write: insert, patch, update. Delete: delete |
| roleAssignments | delete, get, insert, list | Read: get, list. Write: insert. Delete: delete |
| privileges | list | Read |
| domains | delete, get, insert, list | Read: get, list. Write: insert. Delete: delete |
| domainAliases | delete, get, insert, list | Read: get, list. Write: insert. Delete: delete |
| schemas | delete, get, insert, list, patch, update | Read: get, list. Write: insert, patch, update. Delete: delete |
| customers | get, patch, update | Read: get. Write: patch, update |
| asps | delete, get, list | Read: get, list. Delete: delete (application-specific passwords) |
| tokens | delete, get, list | Read: get, list. Delete: delete |
| verificationCodes | generate, invalidate, list | Read: list. Write: generate, invalidate |
| twoStepVerification | turnOff | Write (disruptive) |
| chromeosdevices | action (deprecated), get, list, moveDevicesToOu, patch, update | Read: get, list. Write: moveDevicesToOu, patch, update, action |
| customer.devices.chromeos | batchChangeStatus, countChromeOsDevices, issueCommand | Write: batchChangeStatus, issueCommand. Read: countChromeOsDevices |
| customer.devices.chromeos.commands | methods [UNVERIFIED] | |
| mobiledevices | action, delete, get, list | Read: get, list. Write: action. Delete: delete |
| channels | stop | Write (subscription) |
| resources.buildings | delete, get, insert, list, patch, update | Read: get, list. Write: insert, patch, update. Delete: delete |
| resources.calendars | delete, get, insert, list, patch, update | Read: get, list. Write: insert, patch, update. Delete: delete |
| resources.features | delete, get, insert, list, patch, rename, update | Read: get, list. Write: insert, patch, rename, update. Delete: delete |

- orgunits paths: `orgUnitPath` (for example `/engineering/apps`) or `orgUnitId`. `name` is the leaf only. Parent is `parentOrgUnitPath` or `parentOrgUnitId`.
- Terraform uses this API for users, groups, members, orgunits, roles, roleAssignments, privileges, schemas, domains, domainAliases and customers.

### A03: Groups Settings API v1
- groups: get (R), patch (W), update (W). Base URL not on the page [UNVERIFIED].

### A04: Cloud Identity API v1
- groups: create, delete, get, getSecuritySettings, list, lookup, patch, search, updateSecuritySettings.
- groups.memberships: checkTransitiveMembership, create, delete, get, getMembershipGraph, list, lookup, modifyMembershipRoles, searchDirectGroups, searchTransitiveGroups, searchTransitiveMemberships.
- Base URL [UNVERIFIED]. Redirects from cloud.google.com to docs.cloud.google.com; the reference page did not state the base URL.

### A05: Enterprise Licensing API v1
- licenseAssignments: delete, get, insert, listForProduct, listForProductAndSku, patch, update. There is no plain `list`.
- Keys: productId, skuId, userId (primary email, which can change). Base URL not on the page [UNVERIFIED].

### A06: Reports API v1
- Base URL `https://admin.googleapis.com/admin/reports/v1/` (verified from the activities.list path).
- activities: list (R), watch (subscription). channels: stop. customerUsageReports: get (R). entityUsageReports: get (R). userUsageReport: get (R).
- activities.list path: `/activity/users/{userKey or all}/applications/{applicationName}`.
- applicationName values include: access_transparency, admin, calendar, chat, drive, gcp, gmail, groups, groups_enterprise, login, meet, mobile, rules, saml, token, user_accounts, context_aware_access, chrome, keep, vault, gemini_in_workspace_apps, classroom, tasks, admin_data_action, contacts and others.

### A07: Chrome Policy API v1
- Base URL `https://chromepolicy.googleapis.com` (verified).
- customers.policies: resolve (R).
- customers.policies.groups: batchDelete, batchModify, listGroupPriorityOrdering, updateGroupPriorityOrdering.
- customers.policies.networks: defineCertificate, defineNetwork, removeCertificate, removeNetwork.
- customers.policies.orgunits: batchInherit, batchModify.
- customers.policySchemas: get, list (R).
- media: upload.
- The page has no `customers.policies.printers` resource and names the schema resource `customers.policySchemas`.

### A08: Vault API v1
- Base URL `https://vault.googleapis.com` (verified).
- matters: addPermissions, close, count, create, delete, get, list, removePermissions, reopen, undelete, update.
- matters.exports: create, delete, get, list.
- matters.holds: addHeldAccounts, create, delete, get, list, removeHeldAccounts, update. matters.holds.accounts: create, delete, list.
- matters.savedQueries: create, delete, get, list.
- operations: cancel, delete, get, list.

### A09: Alert Center API v1beta1
- Base URL `https://alertcenter.googleapis.com` (verified).
- settings: getSettings (GET /v1beta1/settings), updateSettings (PATCH).
- alerts: list, get, getMetadata, delete, undelete (POST :undelete), batchDelete, batchUndelete.
- alerts.feedback: create (W), list (R).

### A10: Gmail API v1 (settings only)
- users.settings direct methods: get/update AutoForwarding, Imap, Pop, Language, Vacation.
- cse.identities: create, delete, get, list, patch. cse.keypairs: create, disable, enable, get, list, obliterate.
- delegates: create, delete, get, list.
- filters: create, delete, get, list.
- forwardingAddresses: create, delete, get, list.
- sendAs: create, delete, get, list, patch, update, verify. sendAs.smimeInfo: delete, get, insert, list, setDefault.
- Messages, threads, labels, drafts and history were not checked [UNVERIFIED].

### A11: Google Calendar API v3
- Top-level resources: acl, calendarList, calendars, channels, colors, events, freebusy, settings.
- calendars: clear, delete, get, insert, patch, transferOwnership, update.
- events: delete, get, import, insert, instances, list, move, patch, quickAdd, update, watch.
- acl: delete, get, insert, list, patch, update, watch. calendarList: delete, get, insert, list, patch, update, watch.
- settings: get, list, watch.
- Room and building resources are managed through Directory (A02), not Calendar.

### A12: Google Drive API v3
- Resources: about, accessproposals, approvals, apps, changes, channels, comments, drives, files, operations, permissions, replies, revisions. Shared drives are `drives` (no teamdrives resource).
- files: copy, create, delete, download, emptyTrash, export, generateCseToken, generateIds, get, list, listLabels, modifyLabels, update, watch.
- permissions: create, delete, get, list, update.
- drives: create, delete, get, hide, list, unhide, update.

### A13: Google Chat API v1
- Resources: customEmojis, media, spaces, spaces.members, spaces.messagePins, spaces.messages (and attachments, reactions), spaces.spaceEvents, users.availability, users.sections (and items), users.spaces (threads, spaceNotificationSetting).
- spaces: completeImport, create, delete, findDirectMessage, findGroupChats, get, list, patch, search, setup.
- spaces.members: create, delete, get, list, patch.

### A14: Google Sheets API v4
- spreadsheets: batchUpdate, create, get, getByDataFilter.
- spreadsheets.values: append, batchClear, batchClearByDataFilter, batchGet, batchGetByDataFilter, batchUpdate, batchUpdateByDataFilter, clear, get, update.
- spreadsheets.sheets: copyTo. spreadsheets.developerMetadata: get, search.

### A15: Google Docs API v1
- documents: batchUpdate (POST /v1/documents/{documentId}:batchUpdate), create (POST /v1/documents), get (GET /v1/documents/{documentId}).

### A16: Apps Script API v1
- projects: create, get, getContent, getMetrics, updateContent.
- projects.deployments: create, delete, get, list, update. projects.versions: create, get, list.
- processes: list, listScriptProcesses. scripts: run.
- `updateContent` takes the project's full file set. Per-file update semantics [UNVERIFIED].

## 15. Adjacent and precedent (not counted as CLIs)

- `googleapis/gcloud-mcp` (reference/googleapis__gcloud-mcp): official Google MCP server that drives the gcloud CLI. Packages: gcloud-mcp, observability-mcp, storage-mcp, backupdr-mcp (npm `@google-cloud/...`). Useful design precedent for the `cloud` server.
- `clasp mcp` (experimental): clasp can run as an MCP server. Listed in C04.
- Other reference repos (not inventoried in depth): `EveryInc__google-workspace-mcp-server`, `taylorwilsdon__google_workspace_mcp`, `harisnadeem__searchconsole-mcp`, `metehan777__google-search-console-mcp`, `mikusnuz__gsc-mcp`, `securityfortech__google-admin-mcp`, and others under `reference\`. These are MCP servers, not CLIs.

## 16. Gaps (three areas with no CLI or API that covers our need well)

1. **Search Console (searchconsole).** No official CLI. The API surface is narrow: sites, sitemaps, searchAnalytics.query and urlInspection.index.inspect. No site verification and no Indexing API in the index read (Indexing API is separate [UNVERIFIED]). Community CLIs are unverified and small. Plan: wrap the REST API directly.

2. **Workspace admin (workspace-admin).** No official, maintained admin CLI. GAM (community, Apache-2.0) is the broadest and returns JSON on many commands, but its surface is a text grammar. gws is Google-hosted but unsupported, and its Admin coverage is unverified. The Terraform provider is archived (last release 0.7.0, 2022), with no Reports, Licensing, Vault, Alert Center or Cloud Identity groups coverage. Admin-console-only settings that have no public API are not inventoried here [UNVERIFIED].

3. **Apps Script (workspace-user).** clasp is not officially supported. Its `push` replaces the whole remote project, and `tail-logs` shows only `console.log`. The Apps Script API `projects.updateContent` takes the full file set, so granular or concurrent per-file edits are not covered [per-file semantics UNVERIFIED]. Plan: read-modify-write with conflict checks, or accept whole-project writes.

## 17. Not verified or not covered

- gcloud: no commands run. Subcommands above come from the reference pages only. Unverified: `bq` group contents, `identity` and `workspace-add-ons` groups, monitoring `channels` and `metrics`, `logging tail`, most `iam` subgroups, and the top-level compute, run, container and sql subcommands.
- bq: `init` and `shell` not seen in fetched text.
- gsutil: subcommands other than `cp`.
- gws: per-command R/W/D split and Admin coverage.
- gog, gcalcli details beyond the README; GYB commands, output and auth.
- Base URLs for Cloud Identity, Licensing and Groups Settings.
- Gmail API messages, threads, labels and drafts. Calendar freebusy, colors and channels. Drive comments and replies details.
- Search Console auth requirements and rate limits.
- Community Search Console CLIs: maintenance and features.
- Not covered at all: Data Transfer API, Classroom API, Meet API, Google Keep, Tasks, People API, Chrome Browser Cloud Management API, Cloud Identity devices, Groups Migration, Google Calendar admin settings beyond the Calendar API.
- GAM: the R/W/D counts are a heuristic over verb names; the repo was read, not run.
