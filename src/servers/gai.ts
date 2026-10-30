/**
 * Curated Vertex AI tools of the gai server. They match the generative tools of Google's Agent Platform MCP server
 * (Google Cloud's hosted aiplatform MCP server, toolset /mcp/generate): generate_content, count_tokens and
 * embed_content. Google's Agent Search tools (search, conversational_search, list_engines) are generated tools here
 * already. Google's other 53 Agent Platform tools (Colab Enterprise, notebook executions, endpoints, models, tuning,
 * RAG, evaluation, prompts, predict) have no tool here; they stay reachable with api_call.
 *
 *   vertex_generate_content  read  aiplatform v1 projects.locations.publishers.models.generateContent, or
 *                                  projects.locations.endpoints.generateContent for a model deployed to an endpoint.
 *   vertex_count_tokens      read  aiplatform v1 projects.locations.publishers.models.countTokens (or the endpoint's).
 *   vertex_embed_content     read  aiplatform v1 projects.locations.publishers.models.embedContent.
 *
 * They are POST calls that compute and change nothing, declared reads here as Google's server marks them and as
 * bq_query_read is. Google bills them per token. The classifier's kinds of the gateway methods are not changed (item D2
 * of the tool-profiles spec).
 *
 * The region picks the host: global is aiplatform.googleapis.com, any other region <region>-aiplatform.googleapis.com
 * (the regional endpoints Discovery lists). aiplatform v1 is a gateway API of gai, so data/discovery has no snapshot of
 * it; the request contract is tests/fixtures/discovery/aiplatform.v1.json.
 *
 * Auth: the cloud login (OAuth or Application Default Credentials).
 */
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { getAuthClient, googleScopes } from '../core/auth.js';
import { defineTool, type ToolDef } from '../core/tools.js';
import { makeCloudCall, type CloudCall } from './cloud-http.js';

/** generateContent and embedContent: the scopes Discovery lists (aiplatform v1). */
const GENERATE_SCOPES = googleScopes('aiplatform', 'cloud-platform', 'cloud-platform.read-only');
/** countTokens: Discovery lists only cloud-platform. */
const COUNT_SCOPES = googleScopes('cloud-platform');

/** A Google Cloud region such as us-central1 or europe-west4, or global. */
const REGION = /^(global|[a-z]+(-[a-z0-9]+)+)$/;

/** The service host of a region: global is aiplatform.googleapis.com; others are <region>-aiplatform.googleapis.com. */
export function hostOf(region: string): string {
  const r = region.trim();
  if (!REGION.test(r)) throw new Error(`"${region}" is not a Google Cloud region: use global or a region such as us-central1.`);
  return r === 'global' ? 'https://aiplatform.googleapis.com' : `https://${r}-aiplatform.googleapis.com`;
}

/** A project id as given, checked only for what would change the request's path (see gfirebase.ts projectIdOf). */
export function projectIdOf(text: string): string {
  const id = text.trim();
  if (!/^[a-z0-9][a-z0-9.:-]*$/.test(id)) throw new Error(`"${text}" is not a Google Cloud project id: use its id, such as my-project-123.`);
  return id;
}

/**
 * The resource of a model: projects/<p>/locations/<r>/publishers/<publisher>/models/<id>, or
 * projects/<p>/locations/<r>/endpoints/<id> for a model deployed to an endpoint. The model is given as an id
 * (gemini-2.5-flash, publisher google), publishers/<publisher>/models/<id>, or endpoints/<id>.
 */
export function modelResource(projectId: string, region: string, model: string): string {
  const m = model.trim();
  const base = `projects/${encodeURIComponent(projectIdOf(projectId))}/locations/${encodeURIComponent(region.trim())}`;
  const publisher = /^publishers\/([a-z0-9][a-z0-9-]*)\/models\/([A-Za-z0-9][A-Za-z0-9._@-]*)$/.exec(m);
  if (publisher) return `${base}/publishers/${publisher[1]}/models/${publisher[2]}`;
  const endpoint = /^endpoints\/([A-Za-z0-9][A-Za-z0-9-]*)$/.exec(m);
  if (endpoint) return `${base}/endpoints/${endpoint[1]}`;
  if (/^[A-Za-z0-9][A-Za-z0-9._@-]*$/.test(m)) return `${base}/publishers/google/models/${m}`;
  throw new Error(`"${model}" is not a model: give an id such as gemini-2.5-flash, publishers/<publisher>/models/<id>, or endpoints/<id>.`);
}

/** The contents of a request: a prompt as one user turn, or Vertex Content objects as given. Exactly one of the two. */
export function contentsOf(input: { prompt?: string; contents?: Array<Record<string, unknown>> }) {
  if ((input.prompt === undefined) === (input.contents === undefined)) throw new Error('Give exactly one of prompt and contents.');
  return input.prompt !== undefined ? [{ role: 'user', parts: [{ text: input.prompt }] }] : input.contents;
}

const systemOf = (text: string | undefined) => (text ? { systemInstruction: { parts: [{ text }] } } : {});

interface Part {
  text?: string;
  thought?: boolean;
  functionCall?: unknown;
}
interface Candidate {
  content?: { parts?: Part[] };
  finishReason?: string;
  finishMessage?: string;
  safetyRatings?: unknown;
  citationMetadata?: unknown;
  groundingMetadata?: unknown;
}
interface GenerateResponse {
  candidates?: Candidate[];
  promptFeedback?: unknown;
  usageMetadata?: unknown;
  modelVersion?: string;
}

/**
 * The answer of vertex_generate_content: the text of the first candidate (its text parts joined, thought parts left
 * out), why it stopped, any function calls, the usage and the model version. raw: Google's whole response.
 */
export function generateAnswer(res: GenerateResponse) {
  const first = res.candidates?.[0];
  const parts = first?.content?.parts ?? [];
  const calls = parts.filter((p) => p.functionCall !== undefined).map((p) => p.functionCall);
  return {
    text: parts
      .filter((p) => typeof p.text === 'string' && !p.thought)
      .map((p) => p.text)
      .join(''),
    ...(first?.finishReason ? { finish_reason: first.finishReason } : {}),
    ...(first?.finishMessage ? { finish_message: first.finishMessage } : {}),
    ...(calls.length ? { function_calls: calls } : {}),
    ...(res.candidates && res.candidates.length > 1 ? { candidate_count: res.candidates.length } : {}),
    ...(res.promptFeedback ? { prompt_feedback: res.promptFeedback } : {}),
    ...(res.usageMetadata ? { usage_metadata: res.usageMetadata } : {}),
    ...(res.modelVersion ? { model_version: res.modelVersion } : {}),
  };
}

const projectId = z.string().describe('The Google Cloud project id that runs (and pays for) the call, such as my-project-123.');
const region = z
  .string()
  .optional()
  .describe('The region: global (the default; Google\'s global endpoint) or a region such as us-central1 or europe-west4. Some models are only in some regions.');
const model = z
  .string()
  .describe('The model: an id such as gemini-2.5-flash (publisher google), publishers/<publisher>/models/<id>, or endpoints/<id> for a model deployed to an endpoint of the project.');
const prompt = z.string().optional().describe('The prompt as plain text, sent as one user turn. Give this or contents.');
const contents = z
  .array(z.record(z.string(), z.unknown()))
  .optional()
  .describe('Vertex Content objects, for several turns or non-text parts, such as [{"role": "user", "parts": [{"text": "Hi"}]}]. Give this or prompt.');
const systemInstruction = z.string().optional().describe('A system instruction as plain text.');
const generationConfig = z
  .record(z.string(), z.unknown())
  .optional()
  .describe('A Vertex GenerationConfig as JSON, such as {"temperature": 0.2, "maxOutputTokens": 1024, "responseMimeType": "application/json"}.');
const tools = z.array(z.record(z.string(), z.unknown())).optional().describe('Vertex Tool objects as JSON (function declarations, Google Search grounding and the others).');

const generateShape = {
  project_id: projectId,
  region,
  model,
  prompt,
  contents,
  system_instruction: systemInstruction,
  generation_config: generationConfig,
  safety_settings: z.array(z.record(z.string(), z.unknown())).optional().describe('Vertex SafetySetting objects as JSON, such as [{"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_ONLY_HIGH"}].'),
  tools,
  tool_config: z.record(z.string(), z.unknown()).optional().describe('A Vertex ToolConfig as JSON, such as {"functionCallingConfig": {"mode": "ANY"}}.'),
  cached_content: z.string().optional().describe('A cached content resource name, projects/<p>/locations/<r>/cachedContents/<id>, to use as context.'),
  labels: z.record(z.string(), z.string()).optional().describe('Labels for billing reports, such as {"team": "search"}.'),
  raw: z.boolean().optional().describe("true returns Google's whole response (every candidate, safety ratings, citations, grounding) instead of the short answer."),
};

const countShape = {
  project_id: projectId,
  region,
  model,
  prompt,
  contents,
  system_instruction: systemInstruction,
  generation_config: generationConfig,
  tools,
};

export const EMBED_TASK_TYPES = [
  'RETRIEVAL_QUERY',
  'RETRIEVAL_DOCUMENT',
  'SEMANTIC_SIMILARITY',
  'CLASSIFICATION',
  'CLUSTERING',
  'QUESTION_ANSWERING',
  'FACT_VERIFICATION',
  'CODE_RETRIEVAL_QUERY',
] as const;

const embedShape = {
  project_id: projectId,
  region,
  model: z.string().describe('An embedding model: an id such as gemini-embedding-001 (publisher google), or publishers/<publisher>/models/<id>.'),
  text: z.string().optional().describe('The text to embed. Give this or content.'),
  content: z.record(z.string(), z.unknown()).optional().describe('A Vertex Content object as JSON, for a multimodal embedding model. Give this or text.'),
  task_type: z.enum(EMBED_TASK_TYPES).optional().describe('What the embedding is for, such as RETRIEVAL_QUERY or RETRIEVAL_DOCUMENT (text models only).'),
  title: z.string().optional().describe('The title of the text, for RETRIEVAL_DOCUMENT (text models only).'),
  output_dimensionality: z.number().int().min(1).optional().describe('Fewer dimensions: the vector is cut to this length.'),
  auto_truncate: z.boolean().optional().describe('false: fail on text longer than the model takes, instead of cutting it. Google cuts it by default.'),
};

export async function buildTools(cfg: RuntimeConfig): Promise<ToolDef[]> {
  // The account is chosen per call (see account-context.ts), so the client is not cached here.
  const call: CloudCall = makeCloudCall(() => getAuthClient('cloud', cfg));

  return [
    defineTool({
      name: 'vertex_generate_content',
      title: 'Generate content with a Vertex AI model',
      description:
        "Send a prompt (or a conversation) to a Gemini or other Vertex AI model and get its answer (matches generate_content in Google's Agent Platform MCP server). Returns the text, why it stopped, any function calls and the token usage; raw: true returns Google's whole response. Billed per token by Google. It changes nothing, so it is a read.",
      kind: 'read',
      scopes: GENERATE_SCOPES,
      inputSchema: generateShape,
      async handler(args) {
        const input = z.object(generateShape).parse(args);
        const r = input.region ?? 'global';
        const resource = modelResource(input.project_id, r, input.model);
        const body = {
          contents: contentsOf(input),
          ...systemOf(input.system_instruction),
          ...(input.generation_config ? { generationConfig: input.generation_config } : {}),
          ...(input.safety_settings ? { safetySettings: input.safety_settings } : {}),
          ...(input.tools ? { tools: input.tools } : {}),
          ...(input.tool_config ? { toolConfig: input.tool_config } : {}),
          ...(input.cached_content ? { cachedContent: input.cached_content } : {}),
          ...(input.labels ? { labels: input.labels } : {}),
        };
        const res = await call<GenerateResponse>({ url: `${hostOf(r)}/v1/${resource}:generateContent`, method: 'POST', body });
        return input.raw ? res.data : generateAnswer(res.data);
      },
    }),
    defineTool({
      name: 'vertex_count_tokens',
      title: 'Count the tokens of a Vertex AI prompt',
      description:
        "Count the tokens (and billable characters) a prompt would use with a Vertex AI model, before sending it (matches count_tokens in Google's Agent Platform MCP server). A read.",
      kind: 'read',
      scopes: COUNT_SCOPES,
      inputSchema: countShape,
      async handler(args) {
        const input = z.object(countShape).parse(args);
        const r = input.region ?? 'global';
        const resource = modelResource(input.project_id, r, input.model);
        const body = {
          contents: contentsOf(input),
          ...systemOf(input.system_instruction),
          ...(input.generation_config ? { generationConfig: input.generation_config } : {}),
          ...(input.tools ? { tools: input.tools } : {}),
        };
        const res = await call<{ totalTokens?: number; totalBillableCharacters?: number; promptTokensDetails?: unknown }>({
          url: `${hostOf(r)}/v1/${resource}:countTokens`,
          method: 'POST',
          body,
        });
        return {
          total_tokens: res.data.totalTokens ?? 0,
          ...(res.data.totalBillableCharacters !== undefined ? { total_billable_characters: res.data.totalBillableCharacters } : {}),
          ...(res.data.promptTokensDetails ? { prompt_tokens_details: res.data.promptTokensDetails } : {}),
        };
      },
    }),
    defineTool({
      name: 'vertex_embed_content',
      title: 'Embed text with a Vertex AI model',
      description:
        "Turn a text (or a multimodal content) into an embedding vector with a Vertex AI embedding model, such as gemini-embedding-001 (matches embed_content in Google's Agent Platform MCP server). Returns the vector, its length and whether the input was cut. Billed by Google. A read.",
      kind: 'read',
      scopes: GENERATE_SCOPES,
      inputSchema: embedShape,
      async handler(args) {
        const input = z.object(embedShape).parse(args);
        if ((input.text === undefined) === (input.content === undefined)) throw new Error('Give exactly one of text and content.');
        if (/^endpoints\//.test(input.model.trim())) throw new Error('embedContent runs on a publisher model, not an endpoint: give a model id such as gemini-embedding-001.');
        const r = input.region ?? 'global';
        const resource = modelResource(input.project_id, r, input.model);
        const config = {
          ...(input.task_type ? { taskType: input.task_type } : {}),
          ...(input.title ? { title: input.title } : {}),
          ...(input.output_dimensionality !== undefined ? { outputDimensionality: input.output_dimensionality } : {}),
          ...(input.auto_truncate !== undefined ? { autoTruncate: input.auto_truncate } : {}),
        };
        const body = {
          content: input.text !== undefined ? { parts: [{ text: input.text }] } : input.content,
          ...(Object.keys(config).length ? { embedContentConfig: config } : {}),
        };
        const res = await call<{ embedding?: { values?: number[] }; truncated?: boolean; usageMetadata?: unknown }>({
          url: `${hostOf(r)}/v1/${resource}:embedContent`,
          method: 'POST',
          body,
        });
        const values = res.data.embedding?.values ?? [];
        return {
          values,
          dimensions: values.length,
          ...(res.data.truncated ? { truncated: true } : {}),
          ...(res.data.usageMetadata ? { usage_metadata: res.data.usageMetadata } : {}),
        };
      },
    }),
  ];
}
