# Google Cloud (`gcloud`)

Install with the simplest command: `npx google-services-mcps install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Google Cloud console APIs for projects, service enablement, API keys, billing, monitoring, storage, BigQuery and IAM. It also searches Cloud Logging, runs PromQL queries and reads dashboards, lists IAM roles, looks up SKU prices, and reads and writes Cloud Storage objects. Through the gateway it also reaches Compute Engine, Cloud Run, Kubernetes Engine, Pub/Sub, Spanner, Cloud SQL, Secret Manager and about 277 other Google Cloud APIs.

## When to install it

- You query BigQuery or inspect tables and schemas. The BigQuery tools are read-only.
- You list projects, read IAM policies, or check which APIs a project has enabled.
- You enable or disable APIs, or create and delete API keys.
- You read logs, metrics or asset inventory across a project.
- Wrong choice: you need Vertex AI or Gemini. Use `gai`. Firebase and Maps have their own plugins.

## Install and set up

```
claude plugin install gcloud@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-client <client_secret.json>
node <plugin>/bin/gsm.mjs login cloud --profile readonly
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gcloud`).

1. In the Google Cloud console, create or choose a project for the suite.
2. Set up the OAuth consent screen. Use Internal for a Workspace domain. An External app left in Testing loses its refresh token after 7 days.
3. Create an OAuth client ID of type Desktop app and download the JSON file.
4. Run `setup-client`, then `login cloud`. The `cloud` login is shared with `gai`. Restart the MCP server (`/mcp`) after login.

Start with `--profile readonly`. It grants read scopes only. Writes need a `readwrite` login and the plugin option `allow_writes`. Some services need a billing account, including the Free Tier.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| BigQuery | `bq_dataset_list`, `bq_table_list`, `bq_table_get`, `bq_table_preview`, `bq_query_read`, `bq_job_get` | read | List datasets and tables, read schemas, preview rows, run a read-only query |
| Projects and services | `cloud_projects_search`, `cloud_project_get`, `cloud_project_iam_policy`, `cloud_services_list`, `cloud_operation_get` | read | Find projects, read IAM policy, list enabled APIs, check operations |
| | `cloud_project_create`, `cloud_service_enable` | write | Create a project, enable an API |
| | `cloud_project_delete`, `cloud_service_disable` | destructive | Delete a project, disable an API |
| API keys | `cloud_apikeys_list`, `cloud_apikey_get` | read | List keys, read one |
| | `cloud_apikey_reveal`, `cloud_apikey_create` | write | Reveal the key string (a credential, so it asks), create a key |
| | `cloud_apikey_delete` | destructive | Delete a key |
| Logs and metrics | `logging_entries_list`, `monitoring_query_promql`, `monitoring_dashboards_list`, `monitoring_dashboard_get` | read | Search log entries (filter, severity, resource type such as Cloud Run or Cloud Functions, time window; short rows), run a PromQL range or instant query, list and read dashboards |
| IAM roles | `iam_roles_list`, `iam_role_get` | read | Predefined roles, or a project's or organization's custom roles, with their permissions |
| Prices | `billing_price_lookup` | read | The latest price of a SKU, or the SKUs of a service found by words and region with their list prices, and a billing account's own prices |
| Cloud Storage objects | `gcs_read_text`, `gcs_read_object` | read | Read an object as text or as base64 (8 MiB a call by default, within the result limit; `next_offset` continues) |
| | `gcs_write_text` | write | Write text or a local file to an object. It never replaces an existing object unless `overwrite` is true |
| Per-method (350) | | mixed | BigQuery, Cloud Storage, Resource Manager, Cloud Monitoring, Billing, Cloud Asset, IAM, Service Usage |
| Gateway (277 APIs) | `api_search`, `api_describe`, `api_call` | read, dynamic | Compute Engine, Cloud Logging, Cloud Run, Kubernetes Engine, KMS, Pub/Sub, Spanner, Cloud SQL and more |

The full list is in `docs/capabilities/gcloud.md`.

With the plugin option `toolset: google`, the server lists 59 tools that match Google's Cloud MCP servers for Resource Manager, API Keys, BigQuery, Cloud Billing, IAM, Cloud Logging, Cloud Monitoring and Cloud Storage, plus `health` and the sign-in tools. Google's `run_gcloud_command` is not copied: a shell command would bypass the approval of each change. A `readonly` login with that toolset asks for `cloud-platform.read-only` and `cloud-billing.readonly`; the IAM role and deny-policy reads and the Monitoring reads need a `readwrite` login, because IAM lists only `cloud-platform` and `monitoring.read` is not counted as a read-only scope.

## Example requests

- "Show the errors of the api Cloud Run service in the last 6 hours." Claude runs `logging_entries_list` with `resource_type: cloud_run_revision`, `severity: ERROR` and `freshness: 6h`. No prompt.
- "What is the request rate per Cloud Run service over the last hour?" Claude runs `monitoring_query_promql` with a range query. No prompt.
- "What does an N2 core cost per hour in us-central1?" Claude runs `billing_price_lookup` with `service: Compute Engine`, `query: N2 core` and `region: us-central1`. No prompt.
- "Read gs://shop-exports/2026/10/orders.csv." Claude runs `gcs_read_text`. No prompt.
- "Save this summary to gs://shop-reports/weekly.md." Claude runs `gcs_write_text`. It asks first, and does not replace an existing file unless you say so; a replace asks twice.
- "How many rows are in the orders table in project shop-prod? Show a sample." Claude runs `bq_table_get` and `bq_table_preview`. No prompt.
- "Which APIs are enabled on project shop-prod?" Claude runs `cloud_services_list`. No prompt.
- "Enable the Cloud Run API on project shop-dev." Claude runs `cloud_service_enable`. It asks first.
- "List the stopped Compute Engine instances in us-central1." Claude uses `api_search` to find the method, `api_describe` to check parameters, then `api_call`. Reads run without a prompt.
- "Delete the sandbox project." Claude runs `cloud_project_delete`. It asks twice.

## Safety

- Reads never ask. Writes ask first. Deletes, disables and, since 1.26.3, IAM policy changes (`setIamPolicy`) ask twice: a hook prompt and an exact preview.
- The `confirmation` option defaults to `every-change`. Change it with `printf '%s' '{"confirmation":"destructive-only"}' | claude plugin configure gcloud@google-services-mcps --values-stdin` (JSON on stdin), or `/plugin configure gcloud@google-services-mcps` in Claude Code.
- Destructive tools include `cloud_project_delete`, `cloud_service_disable` (stops an API that running services may use) and `cloud_apikey_delete`. There are 51 destructive tools in total, including BigQuery dataset and job deletes.
- `cloud_apikey_reveal` is classed write, because it returns a credential: it is listed only when writes are allowed, and it asks first.
- `gcs_write_text` sends `ifGenerationMatch=0` unless `overwrite` is true, so an existing object is reported and left as it is. A `local_path` in the folder that holds the Google sign-in data is refused.
- Gateway calls follow each method's class. Delete methods are destructive.

## Costs and limits

The suite adds no charge, but Google bills the APIs you call. The Free Tier needs a billing account, and BigQuery on-demand queries are billed by bytes scanned (price UNVERIFIED). Quotas differ by API; for example, Cloud Logging entries.list allows 60 calls per minute. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/workspace-cloud-search-ai.md`, section 1.

## Caveats

- Some gateway APIs have no per-method tool. Run `api_search` first.
- Service enable and disable change running services. Check the impact in the console before you approve.
- The Service Usage and Cloud Quotas quota pages were not readable (UNVERIFIED).
- The Cloud Monitoring and Compute Engine rate limits are UNVERIFIED.
