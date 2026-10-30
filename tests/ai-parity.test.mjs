// The Vertex AI parity tools (1.21.0): vertex_generate_content, vertex_count_tokens and vertex_embed_content. They
// match the generative tools of Google's Agent Platform MCP server. All three are reads. The HTTP layer is stubbed
// (OAuth2Client.prototype.request), so nothing leaves the machine. Fake tokens in a temp folder only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';

delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { loadConfig } = await import(DIST('core/config.js'));
const ai = await import(DIST('servers/gai.js'));

const root = mkdtempSync(join(tmpdir(), 'gsm-ai-parity-'));
after(() => rmSync(root, { recursive: true, force: true }));
const tokenDir = join(root, 'tokens');
mkdirSync(tokenDir);
writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
writeFileSync(join(tokenDir, 'cloud.token.json'), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));
const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true' });
const tools = new Map((await ai.buildTools(cfg)).map((t) => [t.name, t]));
const ctx = { gate: async () => undefined, grantedScopes: null, hasScope: () => true };
const run = (name, args) => tools.get(name).handler(args, ctx);

let calls = [];
let respond = () => ({});
OAuth2Client.prototype.request = async function fakeRequest(opts) {
  const url = new URL(opts.url);
  const call = { method: String(opts.method ?? 'GET').toUpperCase(), url: `${url.origin}${url.pathname}`, query: Object.fromEntries(url.searchParams), body: opts.data };
  calls.push(call);
  return { data: await respond(call), status: 200, headers: new Headers(), config: opts };
};
const reset = (responder = () => ({})) => {
  calls = [];
  respond = responder;
};
const G = (s) => `https://www.googleapis.com/auth/${s}`;
const MODEL = 'projects/my-project-123/locations/global/publishers/google/models/gemini-2.5-flash';

test('three tools, all reads; scopes as Discovery lists them; each names the Google tool it matches', () => {
  assert.deepEqual(
    [...tools.values()].map((t) => [t.name, t.kind]),
    [
      ['vertex_generate_content', 'read'],
      ['vertex_count_tokens', 'read'],
      ['vertex_embed_content', 'read'],
    ],
  );
  assert.deepEqual(tools.get('vertex_generate_content').scopes, [G('aiplatform'), G('cloud-platform'), G('cloud-platform.read-only')]);
  assert.deepEqual(tools.get('vertex_embed_content').scopes, [G('aiplatform'), G('cloud-platform'), G('cloud-platform.read-only')]);
  assert.deepEqual(tools.get('vertex_count_tokens').scopes, [G('cloud-platform')]);
  const official = { vertex_generate_content: 'generate_content', vertex_count_tokens: 'count_tokens', vertex_embed_content: 'embed_content' };
  for (const [name, google] of Object.entries(official)) {
    const t = tools.get(name);
    assert.ok(t.description.includes(`matches ${google} in Google's Agent Platform MCP server`), name);
    assert.equal(t.inputSchema.confirm, undefined, `${name}: no model-controlled confirm`);
    assert.ok(name.length <= 49 - 'gai'.length * 2, `${name} fits the name budget`);
  }
});

test('hosts and models: global is the main host, a region its own; ids, publisher models and endpoints; bad input refused', () => {
  assert.equal(ai.hostOf('global'), 'https://aiplatform.googleapis.com');
  assert.equal(ai.hostOf(' europe-west4 '), 'https://europe-west4-aiplatform.googleapis.com');
  for (const bad of ['', 'US-CENTRAL1', 'evil.com/x', 'us central1', 'x']) assert.throws(() => ai.hostOf(bad), /is not a Google Cloud region/, bad);
  assert.equal(ai.modelResource('my-project-123', 'global', 'gemini-2.5-flash'), MODEL);
  assert.equal(ai.modelResource('my-project-123', 'us-central1', 'publishers/meta/models/llama-4@001'), 'projects/my-project-123/locations/us-central1/publishers/meta/models/llama-4@001');
  assert.equal(ai.modelResource('my-project-123', 'us-central1', 'endpoints/987'), 'projects/my-project-123/locations/us-central1/endpoints/987');
  for (const bad of ['', 'models/x/../y', 'gemini 2', 'projects/p/locations/l/publishers/google/models/m', 'endpoints/a/b']) {
    assert.throws(() => ai.modelResource('my-project-123', 'global', bad), /is not a model/, bad);
  }
  assert.throws(() => ai.modelResource('My Project', 'global', 'gemini-2.5-flash'), /is not a Google Cloud project id/);
});

test('vertex_generate_content: a prompt is one user turn; the options keep the API names; the answer is the text, usage and model', async () => {
  reset(() => ({
    candidates: [
      {
        content: { role: 'model', parts: [{ text: 'thinking...', thought: true }, { text: 'Hello ' }, { text: 'there.' }, { functionCall: { name: 'lookup', args: { q: 'x' } } }] },
        finishReason: 'STOP',
        safetyRatings: [{ category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'NEGLIGIBLE' }],
      },
    ],
    usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2, totalTokenCount: 5 },
    modelVersion: 'gemini-2.5-flash-001',
  }));
  const out = await run('vertex_generate_content', {
    project_id: 'my-project-123',
    model: 'gemini-2.5-flash',
    prompt: 'Say hello',
    system_instruction: 'Be brief.',
    generation_config: { temperature: 0.2 },
    labels: { team: 'a' },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, `https://aiplatform.googleapis.com/v1/${MODEL}:generateContent`);
  assert.deepEqual(calls[0].body, {
    contents: [{ role: 'user', parts: [{ text: 'Say hello' }] }],
    systemInstruction: { parts: [{ text: 'Be brief.' }] },
    generationConfig: { temperature: 0.2 },
    labels: { team: 'a' },
  });
  assert.deepEqual(out, {
    text: 'Hello there.',
    finish_reason: 'STOP',
    function_calls: [{ name: 'lookup', args: { q: 'x' } }],
    usage_metadata: { promptTokenCount: 3, candidatesTokenCount: 2, totalTokenCount: 5 },
    model_version: 'gemini-2.5-flash-001',
  });
  // raw: Google's whole response, as sent.
  const whole = { candidates: [{ content: { parts: [{ text: 'x' }] }, finishReason: 'STOP' }], promptFeedback: { blockReason: 'OTHER' } };
  reset(() => whole);
  assert.deepEqual(await run('vertex_generate_content', { project_id: 'my-project-123', region: 'asia-northeast1', model: 'endpoints/42', contents: [{ role: 'user', parts: [{ text: 'Hi' }] }], raw: true }), whole);
  assert.equal(calls[0].url, 'https://asia-northeast1-aiplatform.googleapis.com/v1/projects/my-project-123/locations/asia-northeast1/endpoints/42:generateContent');
  assert.deepEqual(calls[0].body, { contents: [{ role: 'user', parts: [{ text: 'Hi' }] }] });
});

test('vertex_generate_content and vertex_count_tokens: exactly one of prompt and contents, checked before any request', async () => {
  reset();
  for (const name of ['vertex_generate_content', 'vertex_count_tokens']) {
    await assert.rejects(run(name, { project_id: 'my-project-123', model: 'gemini-2.5-flash' }), /exactly one of prompt and contents/, name);
    await assert.rejects(run(name, { project_id: 'my-project-123', model: 'gemini-2.5-flash', prompt: 'a', contents: [{ parts: [{ text: 'b' }] }] }), /exactly one of prompt and contents/, name);
    await assert.rejects(run(name, { project_id: 'my-project-123', region: 'nowhere', model: 'gemini-2.5-flash', prompt: 'a' }), /is not a Google Cloud region/, name);
  }
  assert.equal(calls.length, 0);
});

test('vertex_count_tokens: countTokens with the same contents; total tokens and billable characters', async () => {
  reset(() => ({ totalTokens: 7, totalBillableCharacters: 21, promptTokensDetails: [{ modality: 'TEXT', tokenCount: 7 }] }));
  const out = await run('vertex_count_tokens', { project_id: 'my-project-123', region: 'us-central1', model: 'gemini-2.5-pro', prompt: 'Count me', system_instruction: 'S' });
  assert.equal(calls[0].url, 'https://us-central1-aiplatform.googleapis.com/v1/projects/my-project-123/locations/us-central1/publishers/google/models/gemini-2.5-pro:countTokens');
  assert.deepEqual(calls[0].body, { contents: [{ role: 'user', parts: [{ text: 'Count me' }] }], systemInstruction: { parts: [{ text: 'S' }] } });
  assert.deepEqual(out, { total_tokens: 7, total_billable_characters: 21, prompt_tokens_details: [{ modality: 'TEXT', tokenCount: 7 }] });
});

test('vertex_embed_content: the text as content, the options in embedContentConfig (not the deprecated top-level fields)', async () => {
  reset(() => ({ embedding: { values: [0.1, -0.2, 0.3] }, truncated: true }));
  const out = await run('vertex_embed_content', { project_id: 'my-project-123', model: 'gemini-embedding-001', text: 'A sentence.', task_type: 'RETRIEVAL_QUERY', output_dimensionality: 3, auto_truncate: true, title: 'T' });
  assert.equal(calls[0].url, 'https://aiplatform.googleapis.com/v1/projects/my-project-123/locations/global/publishers/google/models/gemini-embedding-001:embedContent');
  assert.deepEqual(calls[0].body, { content: { parts: [{ text: 'A sentence.' }] }, embedContentConfig: { taskType: 'RETRIEVAL_QUERY', title: 'T', outputDimensionality: 3, autoTruncate: true } });
  assert.deepEqual(out, { values: [0.1, -0.2, 0.3], dimensions: 3, truncated: true });
  reset(() => ({ embedding: { values: [1] } }));
  await run('vertex_embed_content', { project_id: 'my-project-123', model: 'publishers/google/models/multimodalembedding', content: { parts: [{ text: 'x' }] } });
  assert.deepEqual(calls[0].body, { content: { parts: [{ text: 'x' }] } });
  reset();
  await assert.rejects(run('vertex_embed_content', { project_id: 'my-project-123', model: 'gemini-embedding-001' }), /exactly one of text and content/);
  await assert.rejects(run('vertex_embed_content', { project_id: 'my-project-123', model: 'endpoints/1', text: 'x' }), /not an endpoint/);
  assert.equal(calls.length, 0);
});

test("the gai google list: Google's three Agent Search tools and the three Vertex basics; the other 53 are named as out of scope", () => {
  const google = JSON.parse(readFileSync(join(REPO, 'config', 'products.json'), 'utf8')).products.gai.toolsets.google;
  assert.deepEqual(google.tools, [
    'vertex_generate_content',
    'vertex_count_tokens',
    'vertex_embed_content',
    'discoverye_pro_loc_coll_engi_serv_sear_a054',
    'discoverye_proj_loca_coll_engin_servi_answe',
    'discoverye_projec_locati_collec_engine_list',
  ]);
  assert.deepEqual([...new Set(Object.values(google.matches).flat())].sort(), ['conversational_search', 'count_tokens', 'embed_content', 'generate_content', 'list_engines', 'search']);
  assert.match(google.notes.vertex_generate_content, /other 53 Agent Platform tools/);
  assert.equal(google.tools.includes('api_call'), false, 'no gateway method counts toward its scopes');
  const map = JSON.parse(readFileSync(join(REPO, 'plugins', 'gai', 'tool-map.json'), 'utf8'));
  const kind = (name) => map.find((t) => t.name === `mcp__plugin_gai_gai__${name}`)?.kind;
  // Discovery Engine's answer is a POST the classifier counts as a write; changing that is item D2.
  for (const name of google.tools) assert.equal(kind(name), name === 'discoverye_proj_loca_coll_engin_servi_answe' ? 'write' : 'read', name);
  assert.match(google.notes.discoverye_proj_loca_coll_engin_servi_answe, /D2/);
});
