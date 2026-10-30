# Maps and Location (`gmaps`)

Install with the simplest command: `npx google-services-mcps install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Maps Platform and location APIs: Places (New), Address Validation, Air Quality, Pollen, Solar, Street View Publish, Places Aggregate and Travel Impact Model, and the Routes and Weather APIs through two hand-written tools. It looks up places and addresses, computes routes, reads the weather and environmental and solar data for a location, and uploads Street View imagery. It has no gateway.

## When to install it

- You search for places, read place details, or autocomplete an address.
- You need a route, its distance and its duration, or the weather at a place.
- You validate or check an address.
- You read air quality, pollen or solar estimates for a location.
- You upload Street View photos.
- Wrong choice: you need geocoding or map tiles. Those APIs are not in the tool list.

## Install and set up

```
claude plugin install gmaps@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-apikey
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gmaps`). gmaps is in the API key group: it uses the same key as gsearch (`apikey.json` in the token folder), and there is no login step.

1. In a Google Cloud project, enable billing and the Maps APIs you use: Places API (New), Routes API, Weather API, Address Validation, Air Quality, Pollen, Solar and Street View Publish.
2. Create an API key and restrict it to those APIs.
3. Run `setup-apikey`. Paste the key when asked, or pipe it in. The key is never printed and never passed on the command line.

There is no scopes profile, because a key is not an OAuth token. Street View uploads and place autocomplete need the plugin option `allow_writes`.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Routes and weather (hand-written) | `maps_compute_routes`, `maps_lookup_weather` | read | A route's distance and duration (with stops, alternatives and the polyline on request); the current weather or an hourly or daily forecast |
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

The two hand-written tools match tools of Google's Maps Grounding Lite MCP server (https://developers.google.com/maps/ai/maps-experience-agent-tools/reference/mcp/compute_routes and `.../lookup_weather`). The Routes and Weather APIs are not in Google's Discovery directory, so these call them directly with the API key, which goes in the `X-Goog-Api-Key` header and never in a URL; every answer and error has the key removed. `maps_compute_routes` always sends the response field mask Google requires: a short summary by default (duration, duration without traffic, distance, description, warnings, labels and the same per leg), the polyline with `include_polyline`, or the fields you name with `field_mask` (no wildcard). With the plugin option `toolset: google`, the server lists these two, `places_places_search_text` (Google's `search_places`) and `places_places_get` (place details), with `health`. Google's `resolve_names` and `resolve_maps_urls` call a REST surface that only Google's own server reaches, so they have no tool here.

## Example requests

- "How long is the drive from Brandenburger Tor to Berlin Hauptbahnhof at 8 tomorrow?" Claude runs `maps_compute_routes` with `departure_time` and `routing_preference: TRAFFIC_AWARE`. No prompt.
- "Will it rain in Paris this weekend?" Claude finds Paris's location with `places_places_search_text`, then runs `maps_lookup_weather` with `forecast: daily`. No prompt.
- "Find coffee shops within 1 km of 48.85, 2.35." Claude runs the nearby search. No prompt.
- "Is this address valid: 1600 Amphitheatre Parkway, Mountain View?" Claude runs the address validation read. No prompt.
- "What is the air quality in Lyon right now?" Claude runs the current conditions read. No prompt.
- "Estimate the solar output for this roof." Claude runs the building insights read. No prompt.
- "Suggest places for 'blue bott'." Claude runs the autocomplete tool. It asks first, because autocomplete is classed write.

## Safety

- Autocomplete and the emissions and insight calculations are classed write, so Claude asks before each call.
- Street View deletes are destructive. They ask twice.
- Field masks decide which billing SKU a request uses. Ask only for the fields you need.
- The `confirmation` option defaults to `every-change`. Change it with `printf '%s' '{"confirmation":"destructive-only"}' | claude plugin configure gmaps@google-services-mcps --values-stdin` (JSON on stdin), or `/plugin configure gmaps@google-services-mcps` in Claude Code.

## Costs and limits

Each SKU has free calls each month: 10,000 for Essentials, 5,000 for Pro and 1,000 for Enterprise. After that, the price is per 1,000 calls. The Street View Publish API is free of charge. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/ads-business-youtube-play.md`, section 10.

## Caveats

- Street View Publish quota numbers and error codes are UNVERIFIED.
- Later price tiers are UNVERIFIED for most SKUs.
- Places Autocomplete session usage is listed as unlimited with no price shown. Confirm it on the SKU page before you rely on it.
