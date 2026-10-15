---
name: gmaps
description: Maps Platform and location APIs: Places, Address Validation, Solar, Air Quality, Pollen, Street View Publish and related datasets. Served by the gmaps MCP server with 36 tools. Use for requests about these Google APIs.
---

# Maps and Location

Maps Platform and location APIs: Places, Address Validation, Solar, Air Quality, Pollen, Street View Publish and related datasets.

The `gmaps` MCP server exposes 36 tools. Per-method tools cover the Discovery APIs listed below.

## Log in

Replace `<plugin>` with this plugin's folder, the one that holds `bin/gsm.mjs`. Sign in with the OAuth desktop client, once: `node <plugin>/bin/gsm.mjs setup-client <client_secret.json>`, then `node <plugin>/bin/gsm.mjs login developer`.

## Safety

Reads never ask for approval. Changes and deletions ask first, unless the user has set the confirmation option to off in the plugin settings. Deny, ask and allow rules in the policy file (policy.json in the token directory) apply on top of this.

## APIs

- Places API (New) (places v1)
- Address Validation API (addressvalidation v1)
- Air Quality API (airquality v1)
- Places Aggregate API (areainsights v1)
- Pollen API (pollen v1)
- Solar API (solar v1)
- Street View Publish API (streetviewpublish v1)
- Travel Impact Model API (travelimpactmodel v1)
