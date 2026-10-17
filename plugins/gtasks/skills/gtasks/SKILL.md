---
name: gtasks
description: Google Tasks task lists and tasks, plus Google Keep notes. Served by the gtasks MCP server with 30 tools. Use for requests about these Google APIs.
---

# Tasks and Keep

Google Tasks task lists and tasks, plus Google Keep notes.

The `gtasks` MCP server exposes 30 tools. Per-method tools cover the Discovery APIs listed below.

## Log in

Replace `<plugin>` with this plugin's folder, the one that holds `bin/gsm.mjs`. Sign in with the OAuth desktop client, once: `node <plugin>/bin/gsm.mjs setup-client <client_secret.json>`, then `node <plugin>/bin/gsm.mjs login workspace-user`.

## Safety

Reads never ask for approval. Changes and deletions ask first, unless the user has set the confirmation option to off in the plugin settings. Deny, ask and allow rules in the policy file (policy.json in the token directory) apply on top of this.

## APIs

- Google Tasks API (tasks v1)
- Google Keep API (keep v1)
