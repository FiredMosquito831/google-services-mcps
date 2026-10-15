---
name: google-cloud
description: Manage Google Cloud console resources through the google-cloud plugin MCP servers (gcloud, gcloud-ops, gcloud-data, gcloud-compute): projects, enabling and disabling APIs, API keys, IAM, monitoring, logging, billing, BigQuery, Cloud Run, Compute Engine. Use for any Google Cloud console task.
---

# Google Cloud console via MCP

## Servers in this plugin

| Server | What it covers |
|---|---|
| `gcloud` | Projects, enable/disable APIs (Service Usage), API keys, IAM policy, operation status |
| `gcloud-ops` | Monitoring, Logging, Trace, Error Reporting, Billing, Quotas, Asset inventory |
| `gcloud-data` | BigQuery, Cloud Storage, Firestore, Spanner, Cloud SQL, Pub/Sub, Cloud Run, Functions, Secret Manager, KMS, Artifact Registry, GKE |
| `gcloud-compute` | Compute Engine (large surface) |

`gcloud-ops`, `gcloud-data` and `gcloud-compute` expose the Google API methods as tools. Each has an `api_methods` tool that lists its methods, with an optional `contains` filter. Call it first when you do not know the tool name.

## One-time setup

1. In Google Cloud console, create an OAuth client of type **Desktop app** (APIs & Services > Credentials) and download its JSON.
2. Save it into the token directory (default `~/.google-services-mcps`):
   `node <plugin>/bin/gsm.mjs setup-client <client_secret.json>`
3. Log in. This opens a browser:
   `node <plugin>/bin/gsm.mjs login cloud`
4. Check: `node <plugin>/bin/gsm.mjs status`

If you set a custom token directory in the plugin settings, export the same path as `GSM_TOKEN_DIR` before running the CLI, so both use one location.

## Safety rules

- Read tools are always available. Write tools (create, update, enable) appear only when the plugin's **Allow write tools** setting is on.
- Delete and disable tools never run on their own. Call them once without `confirm` to get a preview, then again with `confirm: true`.
- Disabling an API can delete resources (for example Cloud Run services) and suspend GKE clusters. Read the preview before confirming.
- API key secrets: `cloud_apikey_reveal` returns the secret in plain text. Do not paste the output into code, commits or chat logs.
- Prefer read tools to check state before any change. Use `cloud_operation_get` to poll long-running operations.

## Typical flows

- **Enable an API for a project:** `cloud_services_list` (enabled_only=false) to find the service name, then `cloud_service_enable` (write), then `cloud_operation_get` if it returns an operation.
- **Create a restricted API key:** `cloud_apikey_create` with `api_targets` set to the services it may call. Do not create unrestricted keys.
- **Find who can do what:** `cloud_project_iam_policy`.
- **Billing and cost questions:** use the `billing_` tools in `gcloud-ops`.

## Limits

- Organizations are not created through the API. They come from Google Workspace or Cloud Identity signup.
- Service Usage does not appear in Google's hosted MCP list. This plugin covers it locally.
