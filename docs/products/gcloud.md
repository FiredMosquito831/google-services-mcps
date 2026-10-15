# Google Cloud (`gcloud`)

Google Cloud console APIs for projects, service enablement, API keys, billing, monitoring, storage, BigQuery and IAM. Through the gateway it also reaches Compute Engine, Cloud Logging, Cloud Run, Kubernetes Engine, Pub/Sub, Spanner, Cloud SQL, Secret Manager and about 277 other Google Cloud APIs.

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
| API keys | `cloud_apikeys_list`, `cloud_apikey_get`, `cloud_apikey_reveal` | read | List keys, read one, reveal the key string |
| | `cloud_apikey_create` | write | Create a key |
| | `cloud_apikey_delete` | destructive | Delete a key |
| Per-method (350) | | mixed | BigQuery, Cloud Storage, Resource Manager, Cloud Monitoring, Billing, Cloud Asset, IAM, Service Usage |
| Gateway (277 APIs) | `api_search`, `api_describe`, `api_call` | read, dynamic | Compute Engine, Cloud Logging, Cloud Run, Kubernetes Engine, KMS, Pub/Sub, Spanner, Cloud SQL and more |

The full list is in `docs/capabilities/gcloud.md`.

## Example requests

- "How many rows are in the orders table in project shop-prod? Show a sample." Claude runs `bq_table_get` and `bq_table_preview`. No prompt.
- "Which APIs are enabled on project shop-prod?" Claude runs `cloud_services_list`. No prompt.
- "Enable the Cloud Run API on project shop-dev." Claude runs `cloud_service_enable`. It asks first.
- "List the stopped Compute Engine instances in us-central1." Claude uses `api_search` to find the method, `api_describe` to check parameters, then `api_call`. Reads run without a prompt.
- "Delete the sandbox project." Claude runs `cloud_project_delete`. It asks twice.

## Safety

- Reads never ask. Writes ask first. Deletes and disables ask twice: a hook prompt and an exact preview.
- The `confirmation` option defaults to `every-change`. Change it with `claude plugin configure gcloud`.
- Destructive tools include `cloud_project_delete`, `cloud_service_disable` (stops an API that running services may use) and `cloud_apikey_delete`. There are 51 destructive tools in total, including BigQuery dataset and job deletes.
- `cloud_apikey_reveal` is classed read, so it shows a key string without asking.
- Gateway calls follow each method's class. Delete methods are destructive.

## Costs and limits

The suite adds no charge, but Google bills the APIs you call. The Free Tier needs a billing account, and BigQuery on-demand queries are billed by bytes scanned (price UNVERIFIED). Quotas differ by API; for example, Cloud Logging entries.list allows 60 calls per minute. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/workspace-cloud-search-ai.md`, section 1.

## Caveats

- Some gateway APIs have no per-method tool. Run `api_search` first.
- Service enable and disable change running services. Check the impact in the console before you approve.
- The Service Usage and Cloud Quotas quota pages were not readable (UNVERIFIED).
- The Cloud Monitoring and Compute Engine rate limits are UNVERIFIED.
