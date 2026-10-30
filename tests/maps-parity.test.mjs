// The Maps parity tools (1.22.0): maps_compute_routes and maps_lookup_weather. They match compute_routes and
// lookup_weather of Google's Maps Grounding Lite MCP server. Both are reads, and both use the API key of the apikey
// group, which goes in the X-Goog-Api-Key header and never in a URL, an answer or an error. fetch is stubbed through the
// API key client's test seam, so nothing leaves the machine. The key is a fake value.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { loadConfig } = await import(DIST('core/config.js'));
const { ApiKeyClient, setFetchForTests, MISSING_API_KEY_MESSAGE } = await import(DIST('core/discovery/apikey-client.js'));
const maps = await import(DIST('servers/gmaps.js'));

const KEY = 'AIzaFAKE-test-key-1234567890';
const tokenDir = mkdtempSync(join(tmpdir(), 'gsm-maps-parity-'));
after(() => {
  setFetchForTests(undefined);
  rmSync(tokenDir, { recursive: true, force: true });
});
const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_API_KEY: KEY });
const tools = new Map(maps.buildTools(cfg).map((t) => [t.name, t]));
const ctx = { gate: async () => undefined, grantedScopes: null, hasScope: () => true };
const run = (name, args, c = tools) => c.get(name).handler(args, ctx);

let calls = [];
let respond = () => ({ status: 200, body: {} });
setFetchForTests(async (input, init = {}) => {
  const url = new URL(String(input));
  calls.push({ method: init.method, url: String(input), path: `${url.origin}${url.pathname}`, query: Object.fromEntries(url.searchParams), headers: { ...init.headers }, body: init.body === undefined ? undefined : JSON.parse(init.body) });
  const { status, body } = respond(calls[calls.length - 1]);
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
});
const reset = (responder = () => ({ status: 200, body: {} })) => {
  calls = [];
  respond = responder;
};
const noKeyIn = (call) => {
  assert.equal(call.url.includes(KEY), false, 'the key is in no URL');
  assert.equal('key' in call.query, false, 'no key query parameter');
  assert.equal(call.headers['X-Goog-Api-Key'], KEY, 'the key is in the X-Goog-Api-Key header');
};

test('two tools, both reads; each names the Google tool it matches', () => {
  assert.deepEqual([...tools.values()].map((t) => [t.name, t.kind]), [['maps_compute_routes', 'read'], ['maps_lookup_weather', 'read']]);
  const official = { maps_compute_routes: 'compute_routes', maps_lookup_weather: 'lookup_weather' };
  for (const [name, google] of Object.entries(official)) {
    const t = tools.get(name);
    assert.ok(t.description.includes(`matches ${google} in Google's Maps Grounding Lite MCP server`), name);
    assert.equal(t.inputSchema.confirm, undefined, `${name}: no model-controlled confirm`);
    assert.ok(name.length <= 49 - 'gmaps'.length * 2, `${name} fits the name budget`);
    assert.deepEqual(t.scopes, ['https://www.googleapis.com/auth/cloud-platform'], name);
  }
});

test('maps_compute_routes: POST computeRoutes with waypoints as the API names them, a field mask always, the key in the header', async () => {
  reset(() => ({ status: 200, body: { routes: [{ duration: '754s', distanceMeters: 4120 }] } }));
  const out = await run('maps_compute_routes', {
    origin: 'Brandenburger Tor, Berlin',
    destination: { latitude: 52.5251, longitude: 13.3694 },
    intermediates: [{ place_id: 'ChIJ1' }, 'Alexanderplatz'],
    travel_mode: 'DRIVE',
    routing_preference: 'TRAFFIC_AWARE',
    departure_time: '2026-11-02T08:00:00+01:00',
    include_polyline: true,
    units: 'METRIC',
  });
  assert.equal(calls.length, 1);
  noKeyIn(calls[0]);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].path, 'https://routes.googleapis.com/directions/v2:computeRoutes');
  assert.equal(calls[0].headers['X-Goog-FieldMask'], `${maps.DEFAULT_ROUTE_FIELDS.join(',')},routes.polyline.encodedPolyline`);
  assert.deepEqual(calls[0].body, {
    origin: { address: 'Brandenburger Tor, Berlin' },
    destination: { location: { latLng: { latitude: 52.5251, longitude: 13.3694 } } },
    intermediates: [{ placeId: 'ChIJ1' }, { address: 'Alexanderplatz' }],
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    departureTime: '2026-11-02T08:00:00+01:00',
    units: 'METRIC',
  });
  assert.deepEqual(out, { routes: [{ duration: '754s', distanceMeters: 4120 }], field_mask: calls[0].headers['X-Goog-FieldMask'] });

  // Via points, and a caller's field mask (checked, deduplicated).
  reset(() => ({ status: 200, body: {} }));
  const via = await run('maps_compute_routes', { origin: 'A', destination: 'B', intermediates: ['C'], pass_through_intermediates: true, field_mask: ['routes.duration', ' routes.legs.steps.navigationInstruction ', 'routes.duration'] });
  assert.deepEqual(calls[0].body.intermediates, [{ address: 'C', via: true }]);
  assert.equal(calls[0].headers['X-Goog-FieldMask'], 'routes.duration,routes.legs.steps.navigationInstruction');
  assert.deepEqual(via, { routes: [], field_mask: 'routes.duration,routes.legs.steps.navigationInstruction' });
});

test('maps_compute_routes: a wildcard or malformed field mask, or both times, is refused before any request', async () => {
  reset();
  for (const mask of [['*'], ['routes.*'], ['routes duration'], [''], ['routes..duration']]) {
    await assert.rejects(run('maps_compute_routes', { origin: 'A', destination: 'B', field_mask: mask }), /is not a response field path/, JSON.stringify(mask));
  }
  await assert.rejects(run('maps_compute_routes', { origin: 'A', destination: 'B', departure_time: '2026-11-02T08:00:00Z', arrival_time: '2026-11-02T09:00:00Z' }), /not both/);
  assert.equal(calls.length, 0);
  const parse = (args) => z.object(tools.get('maps_compute_routes').inputSchema).safeParse(args).success;
  assert.equal(parse({ origin: { latitude: 91, longitude: 0 }, destination: 'B' }), false);
  assert.equal(parse({ origin: 'A', destination: 'B', travel_mode: 'TRUCK' }), false, 'TRUCK needs vehicle details this tool does not send');
  assert.equal(parse({ origin: 'A', destination: 'B', intermediates: Array(26).fill('x') }), false, "Google's limit is 25");
});

test('maps_lookup_weather: current conditions, hourly and daily forecasts, by latitude and longitude, the key in the header', async () => {
  reset(() => ({ status: 200, body: { temperature: { degrees: 12.5, unit: 'CELSIUS' } } }));
  const now = await run('maps_lookup_weather', { latitude: 48.85, longitude: 2.35, units_system: 'IMPERIAL', language_code: 'fr' });
  noKeyIn(calls[0]);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].path, 'https://weather.googleapis.com/v1/currentConditions:lookup');
  assert.deepEqual(calls[0].query, { 'location.latitude': '48.85', 'location.longitude': '2.35', unitsSystem: 'IMPERIAL', languageCode: 'fr' });
  assert.deepEqual(now, { temperature: { degrees: 12.5, unit: 'CELSIUS' } });
  reset();
  await run('maps_lookup_weather', { latitude: 1, longitude: 2, forecast: 'hourly', hours: 48, page_size: 24, page_token: 't' });
  assert.equal(calls[0].path, 'https://weather.googleapis.com/v1/forecast/hours:lookup');
  assert.deepEqual(calls[0].query, { 'location.latitude': '1', 'location.longitude': '2', hours: '48', pageSize: '24', pageToken: 't' });
  reset();
  await run('maps_lookup_weather', { latitude: 1, longitude: 2, forecast: 'daily', days: 7 });
  assert.equal(calls[0].path, 'https://weather.googleapis.com/v1/forecast/days:lookup');
  assert.deepEqual(calls[0].query, { 'location.latitude': '1', 'location.longitude': '2', days: '7' });
  noKeyIn(calls[0]);
});

test('maps_lookup_weather: arguments of another forecast kind, or past Google\'s limits, are refused before any request', async () => {
  reset();
  const bad = [
    [{ hours: 5 }, /hours is for forecast: "hourly"/],
    [{ forecast: 'hourly', days: 2 }, /days is for forecast: "daily"/],
    [{ page_size: 5 }, /page_size and page_token are for the hourly and daily forecasts/],
    [{ forecast: 'daily', page_size: 20 }, /page_size for a daily forecast is 1 to 10/],
  ];
  for (const [extra, message] of bad) await assert.rejects(run('maps_lookup_weather', { latitude: 1, longitude: 2, ...extra }), message, JSON.stringify(extra));
  assert.equal(calls.length, 0);
  const parse = (args) => z.object(tools.get('maps_lookup_weather').inputSchema).safeParse({ latitude: 1, longitude: 2, ...args }).success;
  assert.equal(parse({ forecast: 'hourly', hours: 241 }), false);
  assert.equal(parse({ forecast: 'daily', days: 11 }), false);
});

test('the key never comes back: an answer or a Google error that holds it is redacted; without a key nothing is sent', async () => {
  reset(() => ({ status: 200, body: { routes: [{ description: `echo ${KEY}` }] } }));
  const out = await run('maps_compute_routes', { origin: 'A', destination: 'B' });
  assert.equal(JSON.stringify(out).includes(KEY), false);
  assert.match(JSON.stringify(out), /\[redacted\]/);
  reset(() => ({ status: 400, body: { error: { code: 400, message: `API key ${KEY} not valid`, status: 'INVALID_ARGUMENT' } } }));
  const err = await run('maps_lookup_weather', { latitude: 1, longitude: 2 }).then(
    () => undefined,
    (e) => e,
  );
  assert.ok(err instanceof Error);
  assert.equal(err.message.includes(KEY), false);
  assert.match(err.message, /HTTP 400 \(INVALID_ARGUMENT\): API key \[redacted\] not valid/);

  const noKey = new Map(maps.buildTools(loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_API_KEY: '' })).map((t) => [t.name, t]));
  reset();
  await assert.rejects(run('maps_lookup_weather', { latitude: 1, longitude: 2 }, noKey), new RegExp(MISSING_API_KEY_MESSAGE));
  assert.equal(calls.length, 0);
});

test('ApiKeyClient: keyInHeader puts the key in the header only, over a caller key parameter or header; without it the key stays in the query', async () => {
  const client = new ApiKeyClient(cfg);
  reset();
  await client.request({ url: 'https://example.googleapis.com/v1/x?key=caller', params: { key: 'param', a: 1 }, headers: { 'x-goog-api-key': 'caller' }, keyInHeader: true });
  assert.equal(calls[0].url, 'https://example.googleapis.com/v1/x?a=1');
  assert.deepEqual(Object.keys(calls[0].headers).filter((h) => h.toLowerCase() === 'x-goog-api-key'), ['X-Goog-Api-Key']);
  assert.equal(calls[0].headers['X-Goog-Api-Key'], KEY);
  reset();
  await client.request({ url: 'https://example.googleapis.com/v1/x', params: { a: 1 } });
  assert.equal(calls[0].url, `https://example.googleapis.com/v1/x?a=1&key=${KEY}`, 'the default is unchanged: the key query parameter');
  assert.equal('X-Goog-Api-Key' in calls[0].headers, false);
});

test("the gmaps google list: Google's search_places, compute_routes and lookup_weather, and place details; the two resolve tools have no public API", () => {
  const google = JSON.parse(readFileSync(join(REPO, 'config', 'products.json'), 'utf8')).products.gmaps.toolsets.google;
  assert.deepEqual(google.tools, ['places_places_search_text', 'places_places_get', 'maps_compute_routes', 'maps_lookup_weather']);
  assert.deepEqual([...new Set(Object.values(google.matches).flat())].sort(), ['compute_routes', 'lookup_weather', 'search_places']);
  assert.match(google.notes.places_places_get, /resolve_names and resolve_maps_urls/);
  const map = JSON.parse(readFileSync(join(REPO, 'plugins', 'gmaps', 'tool-map.json'), 'utf8'));
  for (const name of google.tools) assert.equal(map.find((t) => t.name === `mcp__plugin_gmaps_gmaps__${name}`)?.kind, 'read', name);
});
