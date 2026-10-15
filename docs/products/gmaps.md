# Maps and Location (`gmaps`)

Install with the simplest command: `node gsm.mjs install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Maps Platform and location APIs: Places (New), Address Validation, Air Quality, Pollen, Solar, Street View Publish, Places Aggregate and Travel Impact Model. It looks up places and addresses, reads environmental and solar data for a location, and uploads Street View imagery. It has 36 tools and no gateway.

## When to install it

- You search for places, read place details, or autocomplete an address.
- You validate or check an address.
- You read air quality, pollen or solar estimates for a location.
- You upload Street View photos.
- Wrong choice: you need directions, geocoding or map tiles. Those APIs are not in the tool list.

## Install and set up

```
claude plugin install gmaps@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-client <client_secret.json>
node <plugin>/bin/gsm.mjs login developer --profile readonly
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gmaps`).

1. In a Google Cloud project, enable the Maps APIs you use: Places API (New), Address Validation, Air Quality, Pollen, Solar and Street View Publish.
2. Enable billing on each project. Each request needs an API key or an OAuth token. Whether the plugin also needs a Maps API key is UNVERIFIED.
3. Set up the OAuth consent screen. Create an OAuth client ID of type Desktop app and download the JSON file. Run `setup-client`, then `login developer`. Restart the MCP server (`/mcp`) after login.

Start with `--profile readonly`. Street View uploads and place autocomplete need a `readwrite` login and the plugin option `allow_writes`. Read tools work on the readonly profile.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Places (5 methods) | get, photos get, search nearby, search text | read | Find places and read their details and photos |
| | autocomplete | write | Suggest places as the user types |
| Address Validation (2) | validate address | read | Check an address |
| | provide validation feedback | write | Send feedback on an address result |
| Air Quality (4), Pollen (2) | current conditions, forecast, history, heatmap tiles | read | Air quality and pollen for a location |
| Solar (3) | building insights, data layers, GeoTIFF | read | Solar potential for a building |
| Places Aggregate (1) | compute insights | write | Compute area insights |
| Travel Impact Model (4) | flight emissions calculations | write | Compute flight emissions |
| Street View Publish (14) | photo and sequence create, update, upload start, get, list | read, write | Upload and manage street-level imagery |
| | photo and sequence delete, batch delete | destructive | Delete Street View photos |
| Gateway | none | | No gateway tools. All methods are per-method tools. |

The full list is in `docs/capabilities/gmaps.md`.

## Example requests

- "Find coffee shops within 1 km of 48.85, 2.35." Claude runs the nearby search. No prompt.
- "Is this address valid: 1600 Amphitheatre Parkway, Mountain View?" Claude runs the address validation read. No prompt.
- "What is the air quality in Lyon right now?" Claude runs the current conditions read. No prompt.
- "Estimate the solar output for this roof." Claude runs the building insights read. No prompt.
- "Suggest places for 'blue bott'." Claude runs the autocomplete tool. It asks first, because autocomplete is classed write.

## Safety

- Autocomplete and the emissions and insight calculations are classed write, so Claude asks before each call.
- Street View deletes are destructive. They ask twice.
- Field masks decide which billing SKU a request uses. Ask only for the fields you need.
- The `confirmation` option defaults to `every-change`. Change it with `claude plugin configure gmaps`.

## Costs and limits

Each SKU has free calls each month: 10,000 for Essentials, 5,000 for Pro and 1,000 for Enterprise. After that, the price is per 1,000 calls. The Street View Publish API is free of charge. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/ads-business-youtube-play.md`, section 10.

## Caveats

- Street View Publish quota numbers and error codes are UNVERIFIED.
- Later price tiers are UNVERIFIED for most SKUs.
- Places Autocomplete session usage is listed as unlimited with no price shown. Confirm it on the SKU page before you rely on it.
