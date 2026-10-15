---
name: gbusiness
description: Business Profile accounts, locations, verifications, lodging, place actions, notifications and performance. Served by the gbusiness MCP server with 52 tools. Use for requests about these Google APIs.
---

# Business Profile

Business Profile accounts, locations, verifications, lodging, place actions, notifications and performance.

The `gbusiness` MCP server exposes 52 tools. Per-method tools cover the Discovery APIs listed below.

## Log in

Replace `<plugin>` with this plugin's folder, the one that holds `bin/gsm.mjs`. Sign in with the OAuth desktop client, once: `node <plugin>/bin/gsm.mjs setup-client <client_secret.json>`, then `node <plugin>/bin/gsm.mjs login business`.

## Safety

Reads never ask for approval. Changes and deletions ask first, unless the user has set the confirmation option to off in the plugin settings. Deny, ask and allow rules in the policy file (policy.json in the token directory) apply on top of this.

## APIs

- My Business Account Management API (mybusinessaccountmanagement v1)
- My Business Business Information API (mybusinessbusinessinformation v1)
- My Business Lodging API (mybusinesslodging v1)
- My Business Notifications API (mybusinessnotifications v1)
- My Business Place Actions API (mybusinessplaceactions v1)
- My Business Verifications API (mybusinessverifications v1)
- Business Profile Performance API (businessprofileperformance v1)
