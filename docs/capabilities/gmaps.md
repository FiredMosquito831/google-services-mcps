# Maps and Location (`gmaps`)

Maps Platform and location APIs: Places, Address Validation, Solar, Air Quality, Pollen, Street View Publish and related datasets.

- Plugin: `gmaps`, MCP server: `gmaps`, login: Desktop OAuth client, then `login developer`
- Install: `claude plugin install gmaps@google-services-mcps`
- Tools: 38 total. Curated 2, per-method 35, gateway 0. Read 22, write 13, destructive 3, dynamic 0.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

## Curated tools (2)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `auth_status` | read | Login status | (none) |
| `health` | read | Server health | (none) |

## Per-method tools (35)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `addressval_v1_provide_validation_feedba` | write | addressvalidation.provideValidationFeedback | cloud-platform, maps-platform.addressvalidation |
| `addressval_v1_validate_address` | read | addressvalidation.validateAddress | cloud-platform, maps-platform.addressvalidation |
| `airquality_current_conditions_lookup` | read | airquality.currentConditions.lookup | cloud-platform |
| `airquality_forecast_lookup` | read | airquality.forecast.lookup | cloud-platform |
| `airquality_history_lookup` | read | airquality.history.lookup | cloud-platform |
| `airquality_map_type_heatmap_t_lookup_he` | read | airquality.mapTypes.heatmapTiles.lookupHeatmapTile | cloud-platform |
| `areainsigh_v1_compute_insights` | write | areainsights.computeInsights | cloud-platform |
| `places_places_autocomplete` | write | places.places.autocomplete | cloud-platform, maps-platform.places |
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
| `travelimpa_flights_compute_detailed_fli` | write | travelimpactmodel.flights.computeDetailedFlightEmissions | (none) |
| `travelimpa_flights_compute_flight_emiss` | write | travelimpactmodel.flights.computeFlightEmissions | (none) |
| `travelimpa_flights_compute_scope3_fligh` | write | travelimpactmodel.flights.computeScope3FlightEmissions | (none) |
| `travelimpa_flights_compute_typical_flig` | write | travelimpactmodel.flights.computeTypicalFlightEmissions | (none) |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gmaps: API methods | (none) |

## Generated APIs

- Places API (New) (`places/v1`), 5 methods in the catalog
- Address Validation API (`addressvalidation/v1`), 2 methods in the catalog
- Air Quality API (`airquality/v1`), 4 methods in the catalog
- Places Aggregate API (`areainsights/v1`), 1 methods in the catalog
- Pollen API (`pollen/v1`), 2 methods in the catalog
- Solar API (`solar/v1`), 3 methods in the catalog
- Street View Publish API (`streetviewpublish/v1`), 14 methods in the catalog
- Travel Impact Model API (`travelimpactmodel/v1`), 4 methods in the catalog

## Gateway APIs (reached through api_search, api_describe, api_call)

None.

