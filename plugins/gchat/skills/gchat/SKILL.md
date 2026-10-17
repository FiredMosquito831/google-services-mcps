---
name: gchat
description: Google Chat spaces, messages and members, plus Workspace Events subscriptions. Served by the gchat MCP server with 69 tools. Use for requests about these Google APIs.
---

# Google Chat

Google Chat spaces, messages and members, plus Workspace Events subscriptions.

The `gchat` MCP server exposes 69 tools. Per-method tools cover the Discovery APIs listed below.

## Log in

Replace `<plugin>` with this plugin's folder, the one that holds `bin/gsm.mjs`. Sign in with the OAuth desktop client, once: `node <plugin>/bin/gsm.mjs setup-client <client_secret.json>`, then `node <plugin>/bin/gsm.mjs login workspace-user`.

## Safety

Reads never ask for approval. Changes and deletions ask first, unless the user has set the confirmation option to off in the plugin settings. Deny, ask and allow rules in the policy file (policy.json in the token directory) apply on top of this.

## APIs

- Google Chat API (chat v1)
- Google Workspace Events API (workspaceevents v1)
