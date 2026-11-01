# Maps and Location (`gmaps`)

Install with the simplest command: `npx google-services-mcps install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Maps Platform and location APIs: Places (New), Address Validation, Air Quality, Pollen, Solar, Street View Publish, Places Aggregate and Travel Impact Model, and the Routes and Weather APIs through two hand-written tools. It looks up places and addresses, computes routes, reads the weather and environmental and solar data for a location. Street View Publish's 14 methods are listed but cannot work here: Google requires an OAuth 2.0 access token as well as the API key, and this product has only a key (see "Street View Publish" below). It has no gateway.

## When to install it

- You search for places, read place details, or autocomplete an address.
- You need a route, its distance and its duration, or the weather at a place.
- You validate or check an address.
- You read air quality, pollen or solar estimates for a location.
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

There is no scopes profile, because a key is not an OAuth token. Street View's writes need the plugin option `allow_writes`; place autocomplete does not (it is a read).

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Routes and weather (hand-written) | `maps_compute_routes`, `maps_lookup_weather` | read | A route's distance and duration (with stops, alternatives and the polyline on request); the current weather or an hourly or daily forecast |
| Places (5 methods) | get, photos get, search nearby, search text, autocomplete | read | Find places, read their details and photos, and suggest places as the user types |
| Address Validation (2) | validate address | read | Check an address |
| | provide validation feedback | write | Send feedback on an address result |
| Air Quality (4), Pollen (2) | current conditions, forecast, history, heatmap tiles | read | Air quality and pollen for a location |
| Solar (3) | building insights, data layers, GeoTIFF | read | Solar potential for a building |
| Places Aggregate (1) | compute insights | read | Compute area insights (a read since 1.26.3) |
| Travel Impact Model (4) | flight emissions calculations | read | Compute flight emissions (reads since 1.26.3) |
| Street View Publish (14) | photo and sequence create, update, upload start, get, list | read, write | Street-level imagery. These tools cannot work here: see the note below |
| | photo and sequence delete, batch delete | destructive | Delete Street View photos. Cannot work here either |
| Gateway | none | | No gateway tools. All methods are per-method tools. |

The full list is in `docs/capabilities/gmaps.md`.

The two hand-written tools match tools of Google's Maps Grounding Lite MCP server (https://developers.google.com/maps/ai/maps-experience-agent-tools/reference/mcp/compute_routes and `.../lookup_weather`). The Routes and Weather APIs are not in Google's Discovery directory, so these call them directly with the API key, which goes in the `X-Goog-Api-Key` header and never in a URL; every answer and error has the key removed. `maps_compute_routes` always sends the response field mask Google requires: a short summary by default (duration, duration without traffic, distance, description, warnings, labels and the same per leg), the polyline with `include_polyline`, or the fields you name with `field_mask` (no wildcard). With the plugin option `toolset: google`, the server lists these two, `places_places_search_text` (Google's `search_places`) and `places_places_get` (place details), with `health`. Google publishes `resolve_names` and `resolve_maps_urls` as a REST surface (POST `https://mapstools.googleapis.com/v1:resolveNames`), whose Discovery document is not public (it answered 403 on 2026-11-01) and whose only documented authorization is the OAuth scope `maps-platform.mapstools`; gmaps has an API key and no Google sign-in, so they have no tool here.

## Example requests

- "How long is the drive from Brandenburger Tor to Berlin Hauptbahnhof at 8 tomorrow?" Claude runs `maps_compute_routes` with `departure_time` and `routing_preference: TRAFFIC_AWARE`. No prompt.
- "Will it rain in Paris this weekend?" Claude finds Paris's location with `places_places_search_text`, then runs `maps_lookup_weather` with `forecast: daily`. No prompt.
- "Find coffee shops within 1 km of 48.85, 2.35." Claude runs the nearby search. No prompt.
- "Is this address valid: 1600 Amphitheatre Parkway, Mountain View?" Claude runs the address validation read. No prompt.
- "What is the air quality in Lyon right now?" Claude runs the current conditions read. No prompt.
- "Estimate the solar output for this roof." Claude runs the building insights read. No prompt.
- "Suggest places for 'blue bott'." Claude runs the autocomplete tool. No prompt: autocomplete is a read (since 1.24.2).

## Safety

- Autocomplete (since 1.24.2) and the emissions and insight calculations (since 1.26.3) are reads: they only compute, so Claude runs them without asking. They still use your key's quota.
- Street View deletes are destructive. They ask twice, though Google is expected to refuse them here (see "Street View Publish").
- Field masks decide which billing SKU a request uses. Ask only for the fields you need. Since 1.30.0, `places_places_search_text`, `places_places_search_nearby` and `places_places_get` send the field mask Google requires (before, they sent none, and Google's documentation says such a call fails; not checked live): by default the id, display name, address, location, types and Maps link (Essentials and Pro fields, plus `nextPageToken` for text search), or the fields you name in `field_mask`. Rating, phone, opening hours and website are Enterprise fields; ask for them by name.
- The `confirmation` option defaults to `every-change`. Change it with `printf '%s' '{"confirmation":"destructive-only"}' | claude plugin configure gmaps@google-services-mcps --values-stdin` (JSON on stdin), or `/plugin configure gmaps@google-services-mcps` in Claude Code.

## Street View Publish

Google's Street View Publish API needs an API key **and** an OAuth 2.0 access token: the quickstart says "After you have your API key and access token", and its samples send both `?key=YOUR_API_KEY` and `authorization: Bearer YOUR_ACCESS_TOKEN` (https://developers.google.com/streetview/publish/first-app). gmaps is in the API key group and has no Google sign-in, so it sends no token, and all 14 Street View Publish tools are expected to be refused. Every one of their descriptions says so. The same goes for uploading imagery: `photo.startUpload` only returns an upload session, and the upload itself is a media upload, which this suite's per-method tools and gateway both leave out. Making Street View work needs an OAuth sign-in for this product, which is a separate decision.

## Costs and limits

Each SKU has free calls each month: 10,000 for Essentials, 5,000 for Pro and 1,000 for Enterprise. After that, the price is per 1,000 calls. The Street View Publish API is free of charge. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/ads-business-youtube-play.md`, section 10.

## Caveats

- Street View Publish quota numbers and error codes are UNVERIFIED. The tools are not expected to work at all without an OAuth token (see "Street View Publish").
- Later price tiers are UNVERIFIED for most SKUs.
- Places Autocomplete session usage is listed as unlimited with no price shown. Confirm it on the SKU page before you rely on it.
