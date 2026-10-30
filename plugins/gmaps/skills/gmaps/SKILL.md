---
name: gmaps
description: Maps Platform and location APIs: Places, Address Validation, Solar, Air Quality, Pollen, Street View Publish and related datasets. Served by the gmaps MCP server with 47 tools. Use for requests about these Google APIs.
---

# Maps and Location

Maps Platform and location APIs: Places, Address Validation, Solar, Air Quality, Pollen, Street View Publish and related datasets.

The `gmaps` MCP server exposes 47 tools. Per-method tools cover the Discovery APIs listed below.

## Log in

Replace `<plugin>` with this plugin's folder, the one that holds `bin/gsm.mjs`. No sign-in. Store the API key once: `node <plugin>/bin/gsm.mjs setup-apikey`, which reads the key from GSM_API_KEY_INPUT or stdin.

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
