---
name: gcontacts
description: Google Contacts and People, personal health metrics, Data Portability, and the OAuth2 userinfo endpoints. Served by the gcontacts MCP server with 63 tools. Use for requests about these Google APIs.
---

# Contacts and Profile

Google Contacts and People, personal health metrics, Data Portability, and the OAuth2 userinfo endpoints.

The `gcontacts` MCP server exposes 63 tools. Per-method tools cover the Discovery APIs listed below. Gateway APIs are reached through three generic tools: api_search finds a method, api_describe shows its parameters, and api_call runs it.

## Log in

Replace `<plugin>` with this plugin's folder, the one that holds `bin/gsm.mjs`. Sign in with the OAuth desktop client, once: `node <plugin>/bin/gsm.mjs setup-client <client_secret.json>`, then `node <plugin>/bin/gsm.mjs login workspace-user`.

## Safety

Reads never ask for approval. Changes and deletions ask first, unless the user has set the confirmation option to off in the plugin settings. Deny, ask and allow rules in the policy file (policy.json in the token directory) apply on top of this.

## APIs

- People API (people v1)
- Google Health API (health v4)
- Data Portability API (dataportability v1)
- Google OAuth2 API (oauth2 v2)
- Data Portability API (dataportability v1beta), reached through api_search, api_describe and api_call
- Google Health API (health v4beta), reached through api_search, api_describe and api_call
