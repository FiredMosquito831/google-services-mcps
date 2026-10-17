---
name: gmerchant
description: Merchant Center: Merchant API, Comparison Shopping Service and Manufacturer Center. Served by the gmerchant MCP server with 167 tools. Use for requests about these Google APIs.
---

# Merchant Center

Merchant Center: Merchant API, Comparison Shopping Service and Manufacturer Center.

The `gmerchant` MCP server exposes 167 tools. Per-method tools cover the Discovery APIs listed below. Gateway APIs are reached through three generic tools: api_search finds a method, api_describe shows its parameters, and api_call runs it.

## Log in

Replace `<plugin>` with this plugin's folder, the one that holds `bin/gsm.mjs`. No sign-in. Add the service account's email in Play Console (Users and permissions) or Merchant Center (Admin), then set up its key once: `node <plugin>/bin/gsm.mjs setup-service-account --key-file <service account JSON>`. Or set GOOGLE_APPLICATION_CREDENTIALS to the key.

## Safety

Reads never ask for approval. Changes and deletions ask first, unless the user has set the confirmation option to off in the plugin settings. Deny, ask and allow rules in the policy file (policy.json in the token directory) apply on top of this.

## APIs

- Merchant API (merchantapi reviews_v1beta)
- CSS API (css v1)
- Manufacturer Center API (manufacturers v1)
- Merchant API (merchantapi accounts_v1)
- Merchant API (merchantapi conversions_v1)
- Merchant API (merchantapi datasources_v1)
- Merchant API (merchantapi inventories_v1)
- Merchant API (merchantapi issueresolution_v1)
- Merchant API (merchantapi lfp_v1)
- Merchant API (merchantapi loyaltycustomers_v1)
- Merchant API (merchantapi notifications_v1)
- Merchant API (merchantapi ordertracking_v1)
- Merchant API (merchantapi products_v1)
- Merchant API (merchantapi promotions_v1)
- Merchant API (merchantapi quota_v1)
- Merchant API (merchantapi reports_v1)
- Merchant API (merchantapi accounts_v1beta), reached through api_search, api_describe and api_call
- Merchant API (merchantapi conversions_v1beta), reached through api_search, api_describe and api_call
- Merchant API (merchantapi datasources_v1beta), reached through api_search, api_describe and api_call
- Merchant API (merchantapi inventories_v1beta), reached through api_search, api_describe and api_call
- Merchant API (merchantapi issueresolution_v1beta), reached through api_search, api_describe and api_call
- Merchant API (merchantapi lfp_v1beta), reached through api_search, api_describe and api_call
- Merchant API (merchantapi notifications_v1beta), reached through api_search, api_describe and api_call
- Merchant API (merchantapi ordertracking_v1beta), reached through api_search, api_describe and api_call
- Merchant API (merchantapi products_v1beta), reached through api_search, api_describe and api_call
- Merchant API (merchantapi promotions_v1beta), reached through api_search, api_describe and api_call
- Merchant API (merchantapi quota_v1beta), reached through api_search, api_describe and api_call
- Merchant API (merchantapi reports_v1beta), reached through api_search, api_describe and api_call
