---
name: gdrive
description: Google Drive files, labels and activity, plus Docs, Sheets, Slides, Forms and Books. Served by the gdrive MCP server with 200 tools. Use for requests about these Google APIs.
---

# Google Drive and Docs

Google Drive files, labels and activity, plus Docs, Sheets, Slides, Forms and Books.

The `gdrive` MCP server exposes 200 tools. Per-method tools cover the Discovery APIs listed below. Gateway APIs are reached through three generic tools: api_search finds a method, api_describe shows its parameters, and api_call runs it.

## Log in

Replace `<plugin>` with this plugin's folder, the one that holds `bin/gsm.mjs`. Sign in with the OAuth desktop client, once: `node <plugin>/bin/gsm.mjs setup-client <client_secret.json>`, then `node <plugin>/bin/gsm.mjs login workspace-user`.

## Safety

Reads never ask for approval. Changes and deletions ask first, unless the user has set the confirmation option to off in the plugin settings. Deny, ask and allow rules in the policy file (policy.json in the token directory) apply on top of this.

## APIs

- Google Drive API (drive v3)
- Drive Activity API (driveactivity v2)
- Drive Labels API (drivelabels v2)
- Google Docs API (docs v1)
- Google Sheets API (sheets v4)
- Google Slides API (slides v1)
- Google Forms API (forms v1)
- Books API (books v1)
- Drive API (drive v2), reached through api_search, api_describe and api_call
- Drive Labels API (drivelabels v2beta), reached through api_search, api_describe and api_call
