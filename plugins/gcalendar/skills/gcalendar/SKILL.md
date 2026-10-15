---
name: gcalendar
description: Google Calendar calendars, events and calendar settings. Served by the gcalendar MCP server with 46 tools. Use for requests about these Google APIs.
---

# Google Calendar

Google Calendar calendars, events and calendar settings.

The `gcalendar` MCP server exposes 46 tools. Per-method tools cover the Discovery APIs listed below.

## Log in

Replace `<plugin>` with this plugin's folder, the one that holds `bin/gsm.mjs`. Sign in with the OAuth desktop client, once: `node <plugin>/bin/gsm.mjs setup-client <client_secret.json>`, then `node <plugin>/bin/gsm.mjs login workspace-user`.

## Safety

Reads never ask for approval. Changes and deletions ask first, unless the user has set the confirmation option to off in the plugin settings. Deny, ask and allow rules in the policy file (policy.json in the token directory) apply on top of this.

## APIs

- Calendar API (calendar v3)
