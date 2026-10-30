/**
 * Curated Maps tools of the gmaps server. They match tools of Google's Maps Grounding Lite MCP server (Maps
 * Experience agent tools, mapstools.googleapis.com/mcp): compute_routes and lookup_weather. Google's search_places is the
 * generated places_places_search_text here already, and a place's details are places_places_get. Google's
 * resolve_names and resolve_maps_urls call a REST surface that only its own server reaches (no public API), so they
 * have no tool here.
 *
 *   maps_compute_routes  read  Routes API v2 computeRoutes (POST, a read: it computes and changes nothing; declared a
 *                              read here as Google marks it). Google requires a response field mask; this tool always
 *                              sends one (X-Goog-FieldMask), a short default or one the caller gives.
 *   maps_lookup_weather  read  Weather API v1 currentConditions.lookup, forecast.hours.lookup or forecast.days.lookup.
 *
 * Auth: the API key of the apikey group (apikey.json or GSM_API_KEY), as the generated gmaps tools use it. The key goes
 * in the X-Goog-Api-Key header, never in the URL, and ApiKeyClient (core/discovery/apikey-client.ts) removes it from
 * every error and answer. Neither API is in Google's Discovery directory: the Weather API's Discovery document is
 * public (tests/fixtures/discovery/weather.v1.json); the Routes API's needs a key, so its contract is written from
 * Google's REST reference (tests/fixtures/discovery/routes.v2.json).
 */
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { googleScopes } from '../core/auth.js';
import { ApiKeyClient } from '../core/discovery/apikey-client.js';
import { requestWithRetry } from '../core/http.js';
import { defineTool, type ToolDef } from '../core/tools.js';

const ROUTES = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const WEATHER = 'https://weather.googleapis.com/v1';

/**
 * The OAuth scopes the APIs list, for the tool map and the requirement count. The apikey group has no login, so they
 * never decide whether a tool registers (its grant is unknown, and every tool registers).
 */
const WEATHER_SCOPES = googleScopes('cloud-platform');
const ROUTES_SCOPES = googleScopes('cloud-platform');

/** The fields maps_compute_routes asks for when the caller names none: a summary of each route and leg. */
export const DEFAULT_ROUTE_FIELDS = [
  'routes.duration',
  'routes.staticDuration',
  'routes.distanceMeters',
  'routes.description',
  'routes.warnings',
  'routes.routeLabels',
  'routes.localizedValues',
  'routes.legs.duration',
  'routes.legs.distanceMeters',
  'routes.legs.localizedValues',
];
const POLYLINE_FIELD = 'routes.polyline.encodedPolyline';

/** One field path of a response field mask: dot-separated names, such as routes.legs.duration. No wildcard. */
const FIELD_PATH = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$/;

/**
 * The response field mask of a computeRoutes request: the caller's paths (checked) or the default summary, plus the
 * polyline when asked for. Google requires a mask; a wildcard (*) is refused, as Google advises against it.
 */
export function routeFieldMask(fields: readonly string[] | undefined, includePolyline: boolean | undefined): string {
  const paths = fields?.length ? fields.map((f) => f.trim()) : [...DEFAULT_ROUTE_FIELDS];
  for (const p of paths) {
    if (!FIELD_PATH.test(p)) throw new Error(`"${p}" is not a response field path: use dot-separated field names such as routes.duration (no wildcard).`);
  }
  if (includePolyline && !paths.includes(POLYLINE_FIELD)) paths.push(POLYLINE_FIELD);
  return [...new Set(paths)].join(',');
}

const waypoint = z
  .union([
    z.string().trim().min(1),
    z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
    z.object({ place_id: z.string().trim().min(1) }),
  ])
  .describe('An address or plus code as text, {"latitude": ..., "longitude": ...}, or {"place_id": "..."} (places_places_search_text gives place ids).');

/** A Routes API Waypoint from one waypoint of the tool. */
export function waypointOf(w: z.infer<typeof waypoint>, via = false) {
  const base =
    typeof w === 'string' ? { address: w } : 'place_id' in w ? { placeId: w.place_id } : { location: { latLng: { latitude: w.latitude, longitude: w.longitude } } };
  return via ? { ...base, via: true } : base;
}

export const TRAVEL_MODES = ['DRIVE', 'BICYCLE', 'WALK', 'TWO_WHEELER', 'TRANSIT'] as const;

const routesShape = {
  origin: waypoint,
  destination: waypoint,
  intermediates: z.array(waypoint).max(25).optional().describe("Stops between, in order (Google's limit is 25)."),
  pass_through_intermediates: z.boolean().optional().describe('true: pass through the intermediates without stopping (via points); one leg for the whole route.'),
  travel_mode: z.enum(TRAVEL_MODES).optional().describe('DRIVE (Google\'s default), BICYCLE, WALK, TWO_WHEELER or TRANSIT.'),
  routing_preference: z
    .enum(['TRAFFIC_UNAWARE', 'TRAFFIC_AWARE', 'TRAFFIC_AWARE_OPTIMAL'])
    .optional()
    .describe('How traffic counts, for DRIVE and TWO_WHEELER only: TRAFFIC_UNAWARE (Google\'s default), TRAFFIC_AWARE or TRAFFIC_AWARE_OPTIMAL.'),
  departure_time: z.string().optional().describe('When to leave, RFC 3339 such as 2026-11-02T08:00:00+01:00. Default: now. Give this or arrival_time.'),
  arrival_time: z.string().optional().describe('When to arrive, RFC 3339, for TRANSIT only. Give this or departure_time.'),
  compute_alternative_routes: z.boolean().optional().describe('true: up to two more routes (none when there are intermediates).'),
  include_polyline: z.boolean().optional().describe("true: add each route's encoded polyline to the answer."),
  language_code: z.string().optional().describe('The language of the text in the answer, such as en-US.'),
  region_code: z.string().optional().describe('A two-letter region code (ccTLD) to read addresses with, such as de.'),
  units: z.enum(['METRIC', 'IMPERIAL']).optional().describe('The units of the display text. Distances and durations in numbers are always meters and seconds.'),
  field_mask: z
    .array(z.string())
    .optional()
    .describe(`The response fields to return, such as ["routes.duration", "routes.legs.steps.navigationInstruction"]. Default: ${DEFAULT_ROUTE_FIELDS.join(', ')}. No wildcard.`),
};

export const WEATHER_KINDS = ['current', 'hourly', 'daily'] as const;

const weatherShape = {
  latitude: z.number().min(-90).max(90).describe('Latitude in degrees. places_places_search_text gives a place\'s location.'),
  longitude: z.number().min(-180).max(180).describe('Longitude in degrees.'),
  forecast: z.enum(WEATHER_KINDS).optional().describe('current (the default): the conditions now; hourly: an hourly forecast from this hour; daily: a daily forecast from today.'),
  hours: z.number().int().min(1).max(240).optional().describe("hourly: how many hours, 1 to 240 (Google's limit; 72 in Japan and South Korea). Google's default is 240."),
  days: z.number().int().min(1).max(10).optional().describe("daily: how many days, 1 to 10 (Google's limit). Google's default is 10."),
  page_size: z.number().int().min(1).max(24).optional().describe('hourly: hours per page, 1 to 24 (default 24); daily: days per page, 1 to 10 (default 5).'),
  page_token: z.string().optional().describe('next_page_token from the previous call, with the same other arguments.'),
  units_system: z.enum(['METRIC', 'IMPERIAL']).optional().describe('METRIC (the default) or IMPERIAL.'),
  language_code: z.string().optional().describe('The language of the text, such as en or fr. Default en.'),
};

/** The URL path and query of a weather lookup. Checks the arguments that belong to another kind of forecast. */
export function weatherRequest(input: z.infer<z.ZodObject<typeof weatherShape>>) {
  const kind = input.forecast ?? 'current';
  if (kind !== 'hourly' && input.hours !== undefined) throw new Error('hours is for forecast: "hourly".');
  if (kind !== 'daily' && input.days !== undefined) throw new Error('days is for forecast: "daily".');
  if (kind === 'current' && (input.page_size !== undefined || input.page_token !== undefined)) throw new Error('page_size and page_token are for the hourly and daily forecasts.');
  if (kind === 'daily' && input.page_size !== undefined && input.page_size > 10) throw new Error("page_size for a daily forecast is 1 to 10 (Google's limit).");
  const path = kind === 'current' ? 'currentConditions:lookup' : kind === 'hourly' ? 'forecast/hours:lookup' : 'forecast/days:lookup';
  const params: Record<string, unknown> = {
    'location.latitude': input.latitude,
    'location.longitude': input.longitude,
    ...(input.units_system ? { unitsSystem: input.units_system } : {}),
    ...(input.language_code ? { languageCode: input.language_code } : {}),
    ...(input.hours !== undefined ? { hours: input.hours } : {}),
    ...(input.days !== undefined ? { days: input.days } : {}),
    ...(input.page_size !== undefined ? { pageSize: input.page_size } : {}),
    ...(input.page_token ? { pageToken: input.page_token } : {}),
  };
  return { url: `${WEATHER}/${path}`, params };
}

export function buildTools(cfg: RuntimeConfig): ToolDef[] {
  /** Sends one request with the key in the X-Goog-Api-Key header, through the retry rules of core/http.ts. */
  const send = (req: { url: string; method: 'GET' | 'POST'; params?: Record<string, unknown>; data?: unknown; headers?: Record<string, string> }) =>
    requestWithRetry(() => new ApiKeyClient(cfg).request({ ...req, keyInHeader: true }), { idempotent: true });

  return [
    defineTool({
      name: 'maps_compute_routes',
      title: 'Compute a route',
      description:
        "Compute a route between two places, with stops, for driving, walking, cycling, two-wheelers or transit: the distance, the duration with and without traffic, and on request the polyline and alternatives (matches compute_routes in Google's Maps Grounding Lite MCP server). Routes API, with the API key. A read.",
      kind: 'read',
      scopes: ROUTES_SCOPES,
      inputSchema: routesShape,
      async handler(args) {
        const input = z.object(routesShape).parse(args);
        if (input.departure_time && input.arrival_time) throw new Error('Give departure_time or arrival_time, not both.');
        const mask = routeFieldMask(input.field_mask, input.include_polyline);
        const body = {
          origin: waypointOf(input.origin),
          destination: waypointOf(input.destination),
          ...(input.intermediates?.length ? { intermediates: input.intermediates.map((w) => waypointOf(w, input.pass_through_intermediates === true)) } : {}),
          ...(input.travel_mode ? { travelMode: input.travel_mode } : {}),
          ...(input.routing_preference ? { routingPreference: input.routing_preference } : {}),
          ...(input.departure_time ? { departureTime: input.departure_time } : {}),
          ...(input.arrival_time ? { arrivalTime: input.arrival_time } : {}),
          ...(input.compute_alternative_routes !== undefined ? { computeAlternativeRoutes: input.compute_alternative_routes } : {}),
          ...(input.language_code ? { languageCode: input.language_code } : {}),
          ...(input.region_code ? { regionCode: input.region_code } : {}),
          ...(input.units ? { units: input.units } : {}),
        };
        const res = await send({ url: ROUTES, method: 'POST', data: body, headers: { 'X-Goog-FieldMask': mask } });
        const data = (res.data ?? {}) as { routes?: unknown[]; fallbackInfo?: unknown; geocodingResults?: unknown };
        return { routes: data.routes ?? [], ...(data.fallbackInfo ? { fallback_info: data.fallbackInfo } : {}), field_mask: mask };
      },
    }),
    defineTool({
      name: 'maps_lookup_weather',
      title: 'Look up the weather',
      description:
        "The weather at a place: the current conditions, an hourly forecast (up to 240 hours) or a daily forecast (up to 10 days), in metric or imperial units (matches lookup_weather in Google's Maps Grounding Lite MCP server). Takes a latitude and longitude; places_places_search_text finds a place's location. Weather API, with the API key. A read.",
      kind: 'read',
      scopes: WEATHER_SCOPES,
      inputSchema: weatherShape,
      async handler(args) {
        const input = z.object(weatherShape).parse(args);
        const req = weatherRequest(input);
        const res = await send({ url: req.url, method: 'GET', params: req.params });
        return res.data;
      },
    }),
  ];
}
