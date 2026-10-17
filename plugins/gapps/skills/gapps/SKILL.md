---
name: gapps
description: Apps Script projects and execution, plus the Workspace Marketplace SDK. Served by the gapps MCP server with 28 tools. Use for requests about these Google APIs.
---

# Apps Script

Apps Script projects and execution, plus the Workspace Marketplace SDK.

The `gapps` MCP server exposes 28 tools. Per-method tools cover the Discovery APIs listed below.

## Log in

Replace `<plugin>` with this plugin's folder, the one that holds `bin/gsm.mjs`. Sign in with the OAuth desktop client, once: `node <plugin>/bin/gsm.mjs setup-client <client_secret.json>`, then `node <plugin>/bin/gsm.mjs login workspace-user`.

## Safety

Reads never ask for approval. Changes and deletions ask first, unless the user has set the confirmation option to off in the plugin settings. Deny, ask and allow rules in the policy file (policy.json in the token directory) apply on top of this.

## APIs

- Apps Script API (script v1)
- Google Workspace Marketplace API (appsmarket v2)
