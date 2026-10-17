---
name: gyoutube
description: YouTube Data, YouTube Analytics and YouTube Reporting APIs, plus Blogger. Served by the gyoutube MCP server with 130 tools. Use for requests about these Google APIs.
---

# YouTube and Blogger

YouTube Data, YouTube Analytics and YouTube Reporting APIs, plus Blogger.

The `gyoutube` MCP server exposes 130 tools. Per-method tools cover the Discovery APIs listed below.

## Log in

Replace `<plugin>` with this plugin's folder, the one that holds `bin/gsm.mjs`. Sign in with the OAuth desktop client, once: `node <plugin>/bin/gsm.mjs setup-client <client_secret.json>`, then `node <plugin>/bin/gsm.mjs login business`.

## Safety

Reads never ask for approval. Changes and deletions ask first, unless the user has set the confirmation option to off in the plugin settings. Deny, ask and allow rules in the policy file (policy.json in the token directory) apply on top of this.

## APIs

- YouTube Data API v3 (youtube v3)
- YouTube Analytics API (youtubeAnalytics v2)
- YouTube Reporting API (youtubereporting v1)
- Blogger API (blogger v3)
