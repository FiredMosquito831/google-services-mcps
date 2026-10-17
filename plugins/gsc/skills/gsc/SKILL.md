---
name: gsc
description: Search Console sites, sitemaps, search analytics, URL indexing and site verification. Served by the gsc MCP server with 40 tools. Use for requests about these Google APIs.
---

# Search Console

Search Console sites, sitemaps, search analytics, URL indexing and site verification.

The `gsc` MCP server exposes 40 tools. Per-method tools cover the Discovery APIs listed below.

## Log in

Replace `<plugin>` with this plugin's folder, the one that holds `bin/gsm.mjs`. Sign in with the OAuth desktop client, once: `node <plugin>/bin/gsm.mjs setup-client <client_secret.json>`, then `node <plugin>/bin/gsm.mjs login searchconsole`.

## Safety

Reads never ask for approval. Changes and deletions ask first, unless the user has set the confirmation option to off in the plugin settings. Deny, ask and allow rules in the policy file (policy.json in the token directory) apply on top of this.

## APIs

- Google Search Console API (searchconsole v1)
- Google Site Verification API (siteVerification v1)
- Web Search Indexing API (indexing v3)
