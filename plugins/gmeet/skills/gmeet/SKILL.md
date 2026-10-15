---
name: gmeet
description: Google Meet spaces, conference records, participants and recordings. Served by the gmeet MCP server with 25 tools. Use for requests about these Google APIs.
---

# Google Meet

Google Meet spaces, conference records, participants and recordings.

The `gmeet` MCP server exposes 25 tools. Per-method tools cover the Discovery APIs listed below.

## Log in

Replace `<plugin>` with this plugin's folder, the one that holds `bin/gsm.mjs`. Sign in with the OAuth desktop client, once: `node <plugin>/bin/gsm.mjs setup-client <client_secret.json>`, then `node <plugin>/bin/gsm.mjs login workspace-user`.

## Safety

Reads never ask for approval. Changes and deletions ask first, unless the user has set the confirmation option to off in the plugin settings. Deny, ask and allow rules in the policy file (policy.json in the token directory) apply on top of this.

## APIs

- Google Meet API (meet v2)
