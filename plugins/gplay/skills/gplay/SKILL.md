---
name: gplay
description: Google Play developer publishing and reporting, Play Games Services, Android Enterprise and Management, Play Integrity and device APIs. Served by the gplay MCP server with 358 tools. Use for requests about these Google APIs.
---

# Google Play

Google Play developer publishing and reporting, Play Games Services, Android Enterprise and Management, Play Integrity and device APIs.

The `gplay` MCP server exposes 358 tools. Per-method tools cover the Discovery APIs listed below. Gateway APIs are reached through three generic tools: api_search finds a method, api_describe shows its parameters, and api_call runs it.

## Log in

Replace `<plugin>` with this plugin's folder, the one that holds `bin/gsm.mjs`. Sign in with the OAuth desktop client, once: `node <plugin>/bin/gsm.mjs setup-client <client_secret.json>`, then `node <plugin>/bin/gsm.mjs login developer`.

## Safety

Reads never ask for approval. Changes and deletions ask first, unless the user has set the confirmation option to off in the plugin settings. Deny, ask and allow rules in the policy file (policy.json in the token directory) apply on top of this.

## APIs

- Google Play Android Developer API (androidpublisher v3)
- Google Play Developer Reporting API (playdeveloperreporting v1beta1)
- Google Play Games Services API (games v1)
- Google Play Games Services Management API (gamesManagement v1management)
- Google Play Games Services Publishing API (gamesConfiguration v1configuration)
- Google Play EMM API (androidenterprise v1)
- Android Device Provisioning Partner API (androiddeviceprovisioning v1)
- Google Play Integrity API (playintegrity v1)
- Google Play Grouping API (playgrouping v1alpha1)
- Android Developer ID Status API (androiddeveloperidstatus v1)
- Chrome Web Store API (chromewebstore v2)
- Smart Device Management API (smartdevicemanagement v1)
- Android Management API (androidmanagement v1), reached through api_search, api_describe and api_call
- HomeGraph API (homegraph v1), reached through api_search, api_describe and api_call
- Payments Reseller Subscription API (paymentsresellersubscription v1), reached through api_search, api_describe and api_call
- Google Wallet API (walletobjects v1), reached through api_search, api_describe and api_call
- Google Play Custom App Publishing API (playcustomapp v1), reached through api_search, api_describe and api_call
- Chrome Web Store API (chromewebstore v1.1), reached through api_search, api_describe and api_call
- Google Play Developer Reporting API (playdeveloperreporting v1alpha1), reached through api_search, api_describe and api_call
