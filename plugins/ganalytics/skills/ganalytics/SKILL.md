---
name: ganalytics
description: Google Analytics admin and data APIs for GA4 properties, configuration and reports. Served by the ganalytics MCP server with 84 tools. Use for requests about these Google APIs.
---

# Google Analytics

Google Analytics admin and data APIs for GA4 properties, configuration and reports.

The `ganalytics` MCP server exposes 84 tools. Per-method tools cover the Discovery APIs listed below. Gateway APIs are reached through three generic tools: api_search finds a method, api_describe shows its parameters, and api_call runs it.

## Log in

Replace `<plugin>` with this plugin's folder, the one that holds `bin/gsm.mjs`. Sign in with the OAuth desktop client, once: `node <plugin>/bin/gsm.mjs setup-client <client_secret.json>`, then `node <plugin>/bin/gsm.mjs login business`.

## Safety

Reads never ask for approval. Changes and deletions ask first, unless the user has set the confirmation option to off in the plugin settings. Deny, ask and allow rules in the policy file (policy.json in the token directory) apply on top of this.

## APIs

- Google Analytics Admin API (analyticsadmin v1beta)
- Google Analytics Data API (analyticsdata v1beta)
- Google Analytics Admin API (analyticsadmin v1alpha), reached through api_search, api_describe and api_call
