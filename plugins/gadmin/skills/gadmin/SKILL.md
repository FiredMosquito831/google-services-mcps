---
name: gadmin
description: Google Workspace administration: Cloud Identity, Chrome management and policy, Groups Settings, licensing, reports, alerts, Vault, reseller and Cloud Search admin. Served by the gadmin MCP server with 371 tools. Use for requests about these Google APIs.
---

# Workspace Admin

Google Workspace administration: Cloud Identity, Chrome management and policy, Groups Settings, licensing, reports, alerts, Vault, reseller and Cloud Search admin.

The `gadmin` MCP server exposes 371 tools. Per-method tools cover the Discovery APIs listed below. Gateway APIs are reached through three generic tools: api_search finds a method, api_describe shows its parameters, and api_call runs it.

## Log in

Replace `<plugin>` with this plugin's folder, the one that holds `bin/gsm.mjs`. Use a service account with domain-wide delegation: `node <plugin>/bin/gsm.mjs setup-admin --subject <super admin email> --key-file <service account JSON>`.

## Safety

Reads never ask for approval. Changes and deletions ask first, unless the user has set the confirmation option to off in the plugin settings. Deny, ask and allow rules in the policy file (policy.json in the token directory) apply on top of this.

## APIs

- Admin SDK API (admin reports_v1)
- Google Workspace Alert Center API (alertcenter v1beta1)
- Cloud Identity API (cloudidentity v1)
- Chrome Policy API (chromepolicy v1)
- Groups Settings API (groupssettings v1)
- Google Vault API (vault v1)
- Google Workspace Reseller API (reseller v1)
- Enterprise License Manager API (licensing v1)
- Chrome Verified Access API (verifiedaccess v2)
- Cloud Search API (cloudsearch v1)
- Admin SDK API (admin datatransfer_v1)
- Admin SDK API (admin directory_v1)
- Groups Migration API (groupsmigration v1), reached through api_search, api_describe and api_call
- Chrome Management API (chromemanagement v1), reached through api_search, api_describe and api_call
- Cloud Identity API (cloudidentity v1beta1), reached through api_search, api_describe and api_call
- Chrome Verified Access API (verifiedaccess v1), reached through api_search, api_describe and api_call
