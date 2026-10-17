---
name: gmail
description: Gmail mailboxes, messages, labels and settings, plus Gmail Postmaster Tools. Served by the gmail MCP server with 105 tools. Use for requests about these Google APIs.
---

# Gmail

Gmail mailboxes, messages, labels and settings, plus Gmail Postmaster Tools.

The `gmail` MCP server exposes 105 tools. Per-method tools cover the Discovery APIs listed below. Gateway APIs are reached through three generic tools: api_search finds a method, api_describe shows its parameters, and api_call runs it.

## Log in

Replace `<plugin>` with this plugin's folder, the one that holds `bin/gsm.mjs`. Sign in with the OAuth desktop client, once: `node <plugin>/bin/gsm.mjs setup-client <client_secret.json>`, then `node <plugin>/bin/gsm.mjs login workspace-user`.

## Safety

Reads never ask for approval. Changes and deletions ask first, unless the user has set the confirmation option to off in the plugin settings. Deny, ask and allow rules in the policy file (policy.json in the token directory) apply on top of this.

## APIs

- Gmail API (gmail v1)
- Gmail Postmaster Tools API (gmailpostmastertools v2)
- Gmail Postmaster Tools API (gmailpostmastertools v1), reached through api_search, api_describe and api_call
- Gmail Postmaster Tools API (gmailpostmastertools v1beta1), reached through api_search, api_describe and api_call
