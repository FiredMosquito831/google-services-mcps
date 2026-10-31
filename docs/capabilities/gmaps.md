# Maps and Location (`gmaps`)

Maps Platform and location APIs: Places, Address Validation, Solar, Air Quality, Pollen, Street View Publish and related datasets.

- Plugin: `gmaps`, MCP server: `gmaps`, login: API key, then `setup-apikey` (no login)
- Install: `claude plugin install gmaps@google-services-mcps`
- Tools: 39 total. Curated 3, per-method 35, gateway 0. Read 29, write 7, destructive 3, dynamic 0.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 39, google 5, curated 3 tools, each counting the 1 runtime tools this server registers (`health`). "(all)" means the product has no such toolset yet, so it lists every tool.

## Not registered by this server (8)

The tool map (`plugins/<id>/tool-map.json`) also lists these, so the consent hook knows every name, but this server never registers them, and the counts above leave them out.

- Sign-in tools of other sign-in kinds: `account_remove`, `account_set_default`, `accounts_list`, `auth_login`, `auth_setup_admin`, `auth_setup_client`, `auth_setup_service_account`, `auth_status`.

## Toolset google (4)

The tools that match Google's official MCP server for this product (https://developers.google.com/maps/ai/maps-experience-agent-tools/reference/mcp/search_places, https://developers.google.com/maps/ai/maps-experience-agent-tools/reference/mcp/compute_routes, https://developers.google.com/maps/ai/maps-experience-agent-tools/reference/mcp/lookup_weather).

| Tool | Google's tool | Note |
|---|---|---|
| `places_places_search_text` | `search_places` | Places API (New) searchText: places by a text query, with an optional location bias. Google's search_places also returns a summary written by its server; this returns Places data. |
| `places_places_get` | (none) | One place's details by its id (Places API places.get), the extended details Google's search_places adds on request. Google's resolve_names and resolve_maps_urls call a REST surface only Google's own server reaches (no public API), so they have no tool here. |
| `maps_compute_routes` | `compute_routes` | Routes API computeRoutes with a response field mask (a short summary by default). Routes API is not in Google's Discovery directory; called directly with the API key. |
| `maps_lookup_weather` | `lookup_weather` | Weather API current conditions, hourly forecast or daily forecast, by latitude and longitude. Not in Google's Discovery directory; called directly with the API key. |

## Curated tools (3)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `health` | read | Server health | (none) |
| `maps_compute_routes` | read | Compute a route | cloud-platform |
| `maps_lookup_weather` | read | Look up the weather | cloud-platform |

## Per-method tools (35)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `addressval_v1_provide_validation_feedba` | write | addressvalidation.provideValidationFeedback | cloud-platform, maps-platform.addressvalidation |
| `addressval_v1_validate_address` | read | addressvalidation.validateAddress | cloud-platform, maps-platform.addressvalidation |
| `airquality_current_conditions_lookup` | read | airquality.currentConditions.lookup | cloud-platform |
| `airquality_forecast_lookup` | read | airquality.forecast.lookup | cloud-platform |
| `airquality_history_lookup` | read | airquality.history.lookup | cloud-platform |
| `airquality_map_type_heatmap_t_lookup_he` | read | airquality.mapTypes.heatmapTiles.lookupHeatmapTile | cloud-platform |
| `areainsigh_v1_compute_insights` | read | areainsights.computeInsights | cloud-platform |
| `places_places_autocomplete` | read | places.places.autocomplete | cloud-platform, maps-platform.places |
| `places_places_get` | read | places.places.get | cloud-platform, maps-platform.places |
| `places_places_photos_get_media` | read | places.places.photos.getMedia | cloud-platform, maps-platform.places |
| `places_places_search_nearby` | read | places.places.searchNearby | cloud-platform, maps-platform.places |
| `places_places_search_text` | read | places.places.searchText | cloud-platform, maps-platform.places |
| `pollen_forecast_lookup` | read | pollen.forecast.lookup | cloud-platform |
| `pollen_map_types_heatmap_ti_lookup_heat` | read | pollen.mapTypes.heatmapTiles.lookupHeatmapTile | cloud-platform |
| `solar_building_insights_find_closest` | read | solar.buildingInsights.findClosest | cloud-platform |
| `solar_data_layers_get` | read | solar.dataLayers.get | cloud-platform |
| `solar_geo_tiff_get` | read | solar.geoTiff.get | cloud-platform |
| `streetview_photo_create` | write | streetviewpublish.photo.create | streetviewpublish |
| `streetview_photo_delete` | destructive | streetviewpublish.photo.delete | streetviewpublish |
| `streetview_photo_get` | read | streetviewpublish.photo.get | streetviewpublish |
| `streetview_photo_sequence_create` | write | streetviewpublish.photoSequence.create | streetviewpublish |
| `streetview_photo_sequence_delete` | destructive | streetviewpublish.photoSequence.delete | streetviewpublish |
| `streetview_photo_sequence_get` | read | streetviewpublish.photoSequence.get | streetviewpublish |
| `streetview_photo_sequence_start_upload` | write | streetviewpublish.photoSequence.startUpload | streetviewpublish |
| `streetview_photo_sequences_list` | read | streetviewpublish.photoSequences.list | streetviewpublish |
| `streetview_photo_start_upload` | write | streetviewpublish.photo.startUpload | streetviewpublish |
| `streetview_photo_update` | write | streetviewpublish.photo.update | streetviewpublish |
| `streetview_photos_batch_delete` | destructive | streetviewpublish.photos.batchDelete | streetviewpublish |
| `streetview_photos_batch_get` | read | streetviewpublish.photos.batchGet | streetviewpublish |
| `streetview_photos_batch_update` | write | streetviewpublish.photos.batchUpdate | streetviewpublish |
| `streetview_photos_list` | read | streetviewpublish.photos.list | streetviewpublish |
| `travelimpa_flights_compute_detailed_fli` | read | travelimpactmodel.flights.computeDetailedFlightEmissions | (none) |
| `travelimpa_flights_compute_flight_emiss` | read | travelimpactmodel.flights.computeFlightEmissions | (none) |
| `travelimpa_flights_compute_scope3_fligh` | read | travelimpactmodel.flights.computeScope3FlightEmissions | (none) |
| `travelimpa_flights_compute_typical_flig` | read | travelimpactmodel.flights.computeTypicalFlightEmissions | (none) |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gmaps: API methods | (none) |

## Generated APIs

Each API links to Google's documentation for it, as Google's Discovery directory names it (`documentationLink`, kept in `data/catalog.json`). The link is the API's documentation home, not a page per method: the directory gives no link per method, and Google's REST reference pages are laid out differently from product to product.

- Places API (New) (`places/v1`), 5 methods in the catalog. Documentation: <https://mapsplatform.google.com/maps-products/#places-section>
- Address Validation API (`addressvalidation/v1`), 2 methods in the catalog. Documentation: <https://developers.google.com/maps/documentation/addressvalidation>
- Air Quality API (`airquality/v1`), 4 methods in the catalog. Documentation: <https://developers.google.com/maps/documentation/air-quality>
- Places Aggregate API (`areainsights/v1`), 1 methods in the catalog. Documentation: <https://developers.google.com/maps/documentation/places-aggregate/overview>
- Pollen API (`pollen/v1`), 2 methods in the catalog. Documentation: <https://developers.google.com/maps/documentation/pollen>
- Solar API (`solar/v1`), 3 methods in the catalog. Documentation: <https://developers.google.com/maps/documentation/solar>
- Street View Publish API (`streetviewpublish/v1`), 14 methods in the catalog. Documentation: <https://developers.google.com/streetview/publish/>
- Travel Impact Model API (`travelimpactmodel/v1`), 4 methods in the catalog. Documentation: <https://developers.google.com/travel/impact-model>

## Gateway APIs (reached through api_search, api_describe, api_call)

None.

