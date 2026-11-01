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
 * The region picks the host: global is aiplatform.googleapis.com, any other region <region>-aiplatform.googleapis.com,
 * and the multi-regions us and eu aiplatform.us.rep.googleapis.com and aiplatform.eu.rep.googleapis.com (the hosts
 * Discovery lists in the document's endpoints). aiplatform v1 is a gateway API of gai, so data/discovery has no snapshot
 * of it; the request contract is tests/fixtures/discovery/aiplatform.v1.json.
 *
 * Auth: the cloud login (OAuth or Application Default Credentials).
 */
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { getAuthClient, googleScopes } from '../core/auth.js';
import { defineTool, type ToolDef } from '../core/tools.js';
import { MediaBody, mediaPart } from '../core/media.js';
import { makeCloudCall, type CloudCall } from './cloud-http.js';

/** generateContent and embedContent: the scopes Discovery lists (aiplatform v1). */
const GENERATE_SCOPES = googleScopes('aiplatform', 'cloud-platform', 'cloud-platform.read-only');
/** countTokens: Discovery lists only cloud-platform. */
const COUNT_SCOPES = googleScopes('cloud-platform');

/** A Google Cloud region such as us-central1 or europe-west4, the multi-regions us and eu, or global. */
const REGION = /^(global|us|eu|[a-z]+(-[a-z0-9]+)+)$/;

/**
 * The multi-region hosts of Vertex AI. Discovery lists them in the document's `endpoints` (aiplatform v1: `us` is
 * https://aiplatform.us.rep.googleapis.com/, `eu` is https://aiplatform.eu.rep.googleapis.com/), beside the
 * pre-production hosts that are never used.
 */
export const MULTI_REGION_HOSTS: Readonly<Record<string, string>> = {
  us: 'https://aiplatform.us.rep.googleapis.com',
  eu: 'https://aiplatform.eu.rep.googleapis.com',
};

/**
 * The service host of a location: global is aiplatform.googleapis.com; the multi-regions us and eu their rep host;
 * every other location <location>-aiplatform.googleapis.com.
 */
export function hostOf(region: string): string {
  const r = region.trim();
  if (!REGION.test(r)) throw new Error(`"${region}" is not a Google Cloud region: use global, us, eu or a region such as us-central1.`);
  if (r === 'global') return 'https://aiplatform.googleapis.com';
  return MULTI_REGION_HOSTS[r] ?? `https://${r}-aiplatform.googleapis.com`;
}

/** A project id as given, checked only for what would change the request's path (see gfirebase.ts projectIdOf). */
export function projectIdOf(text: string): string {
  const id = text.trim();
  if (!/^[a-z0-9][a-z0-9.:-]*$/.test(id)) throw new Error(`"${text}" is not a Google Cloud project id: use its id, such as my-project-123.`);
  return id;
}

/** A model or endpoint resource of the API, and the location whose host serves it. */
export interface ModelTarget {
  resource: string;
  location: string;
}

/** A resource name as Google prints it: projects/<p>/locations/<l>/(publishers/<pub>/models/<id>|endpoints/<id>). */
const FULL_RESOURCE =
  /^projects\/([a-z0-9][a-z0-9.:-]*)\/locations\/([a-z0-9][a-z0-9-]*)\/(?:publishers\/([a-z0-9][a-z0-9-]*)\/models|endpoints)\/([A-Za-z0-9][A-Za-z0-9._@-]*)$/;

/**
 * The resource of a model: projects/<p>/locations/<r>/publishers/<publisher>/models/<id>, or
 * projects/<p>/locations/<r>/endpoints/<id> for a model deployed to an endpoint. The model is given as an id
 * (gemini-2.5-flash, publisher google), publishers/<publisher>/models/<id>, endpoints/<id>, or the full resource name
 * Google documents. A full name carries its own location, so the host follows the model and not the region argument.
 */
export function modelTarget(projectId: string, region: string, model: string): ModelTarget {
  const m = model.trim();
  const full = FULL_RESOURCE.exec(m);
  if (full) {
    const [, project, location] = full as unknown as [string, string, string];
    const projectId_ = projectIdOf(projectId);
    if (projectId_ !== project) {
      throw new Error(`The model is in project ${project}, but project_id is ${projectId_}: give the model's own project, or its short id instead of the full resource name.`);
    }
    const asked = region.trim();
    if (asked !== '' && asked !== location) {
      throw new Error(`The model is in ${location}, but region is ${asked}: leave region out, or make the two the same.`);
    }
    return { resource: m, location };
  }
  const location = region.trim() === '' ? 'global' : region.trim();
  if (!REGION.test(location)) throw new Error(`"${region}" is not a Google Cloud region: use global, us, eu or a region such as us-central1.`);
  const base = `projects/${encodeURIComponent(projectIdOf(projectId))}/locations/${encodeURIComponent(location)}`;
  const publisher = /^publishers\/([a-z0-9][a-z0-9-]*)\/models\/([A-Za-z0-9][A-Za-z0-9._@-]*)$/.exec(m);
  if (publisher) return { resource: `${base}/publishers/${publisher[1]}/models/${publisher[2]}`, location };
  const endpoint = /^endpoints\/([A-Za-z0-9][A-Za-z0-9-]*)$/.exec(m);
  if (endpoint) return { resource: `${base}/endpoints/${endpoint[1]}`, location };
  if (/^[A-Za-z0-9][A-Za-z0-9._@-]*$/.test(m)) return { resource: `${base}/publishers/google/models/${m}`, location };
  throw new Error(`"${model}" is not a model: give an id such as gemini-2.5-flash, publishers/<publisher>/models/<id>, endpoints/<id>, or the full resource name projects/<p>/locations/<l>/publishers/google/models/<id>.`);
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
  inlineData?: { mimeType?: string; data?: string };
  fileData?: { mimeType?: string; fileUri?: string };
  [key: string]: unknown;
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

/** What a generate answer's binary parts are read with: which image, from which byte, into how much room. */
export interface GenerateAnswerOptions {
  /** The image (0-based) whose bytes the answer carries. Default 0. */
  imageIndex?: number;
  /** The first byte of that image the answer carries. Default 0. */
  offset?: number;
  /** The result limit a part is fitted to. */
  maxResultChars: number;
}

const isBinary = (p: Part): boolean => p.inlineData !== undefined;

/** A part of a kind the answer does not otherwise report: neither a thought, nor text, a call, bytes or a file reference. */
const isOther = (p: Part): boolean =>
  p.thought !== true && typeof p.text !== 'string' && p.functionCall === undefined && !isBinary(p) && p.fileData === undefined;

/**
 * The answer of vertex_generate_content: the text of the first candidate (its text parts joined, thought parts left
 * out), why it stopped, any function calls, the usage and the model version. raw: Google's whole response.
 *
 * Nothing is dropped without a word. An image (or any inline data) is listed in `images` with its type and size, and
 * the one at `imageIndex` comes back as one part of its bytes (the part form of 1.31.0: mime_type, size_bytes, offset,
 * bytes_read, next_offset, data_base64), so a sizeable image is read in as many calls as it needs; a file reference
 * Google returns instead of bytes (fileData) is listed in `files`; any other kind of part is listed in `other_parts`.
 */
export function generateAnswer(res: GenerateResponse, opts: GenerateAnswerOptions = { maxResultChars: 25_000 }) {
  const first = res.candidates?.[0];
  const parts = first?.content?.parts ?? [];
  const calls = parts.filter((p) => p.functionCall !== undefined).map((p) => p.functionCall);
  const inline = parts.filter(isBinary);
  const files = parts.filter((p) => !isBinary(p) && p.fileData !== undefined).map((p) => p.fileData);
  const others = parts.filter(isOther);
  const images = inline.map((p, index) => ({
    index,
    mime_type: p.inlineData?.mimeType ?? 'application/octet-stream',
    size_bytes: Buffer.from(p.inlineData?.data ?? '', 'base64').length,
  }));
  const out: Record<string, unknown> = {
    text: parts
      .filter((p) => typeof p.text === 'string' && !p.thought)
      .map((p) => p.text)
      .join(''),
    ...(first?.finishReason ? { finish_reason: first.finishReason } : {}),
    ...(first?.finishMessage ? { finish_message: first.finishMessage } : {}),
    ...(calls.length ? { function_calls: calls } : {}),
    ...(files.length ? { files } : {}),
    ...(others.length ? { other_parts: others.map((p) => ({ kinds: Object.keys(p) })) } : {}),
    ...(res.candidates && res.candidates.length > 1 ? { candidate_count: res.candidates.length } : {}),
    ...(res.promptFeedback ? { prompt_feedback: res.promptFeedback } : {}),
    ...(res.usageMetadata ? { usage_metadata: res.usageMetadata } : {}),
    ...(res.modelVersion ? { model_version: res.modelVersion } : {}),
  };
  if (images.length) {
    const index = opts.imageIndex ?? 0;
    if (!Number.isInteger(index) || index < 0 || index >= images.length) {
      throw new Error(`image_index ${index} is past the ${images.length} image${images.length === 1 ? '' : 's'} of this answer: give 0 to ${images.length - 1}.`);
    }
    const image = images[index]!;
    out.images = images;
    out.image = mediaPart(new MediaBody(image.mime_type, Buffer.from(inline[index]!.inlineData?.data ?? '', 'base64'), 0, image.size_bytes), {
      offset: opts.offset ?? 0,
      maxResultChars: opts.maxResultChars,
      canContinue: true,
    });
  }
  return out;
}

const projectId = z.string().describe('The Google Cloud project id that runs (and pays for) the call, such as my-project-123.');
const region = z
  .string()
  .optional()
  .describe("The region: global (the default; Google's global endpoint), a multi-region (us or eu), or a region such as us-central1 or europe-west4. Some models are only in some regions.");
const model = z
  .string()
  .describe('The model: an id such as gemini-2.5-flash (publisher google), publishers/<publisher>/models/<id>, endpoints/<id> for a model deployed to an endpoint of the project, or the full resource name projects/<p>/locations/<l>/publishers/google/models/<id> (its location picks the host).');
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

const imageIndex = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe('Which image of the answer to return (0 by default). The answer lists every image in images with its type and size.');
const byteOffset = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe('The first byte of the content to return: next_offset of a previous part continues it (0 by default).');

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
  image_index: imageIndex,
  offset: byteOffset,
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
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('The first value of the vector to return (0 by default). A vector longer than the result limit comes in parts: next_offset continues it.'),
};

export async function buildTools(cfg: RuntimeConfig): Promise<ToolDef[]> {
  // The account is chosen per call (see account-context.ts), so the client is not cached here.
  const call: CloudCall = makeCloudCall(() => getAuthClient('cloud', cfg));

  return [
    defineTool({
      name: 'vertex_generate_content',
      title: 'Generate content with a Vertex AI model',
      description:
        "Send a prompt (or a conversation) to a Gemini or other Vertex AI model and get its answer (matches generate_content in Google's Agent Platform MCP server). Returns the text, why it stopped, any function calls and the token usage, and the images the model made: every one is listed in images with its type and size, and the bytes of one come back as image (data_base64) in parts, so a large image is read with offset and next_offset. raw: true returns Google's whole response. Billed per token by Google. It changes nothing, so it is a read.",
      kind: 'read',
      scopes: GENERATE_SCOPES,
      inputSchema: generateShape,
      async handler(args) {
        const input = z.object(generateShape).parse(args);
        const target = modelTarget(input.project_id, input.region ?? '', input.model);
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
        const res = await call<GenerateResponse>({ url: `${hostOf(target.location)}/v1/${target.resource}:generateContent`, method: 'POST', body });
        return input.raw ? res.data : generateAnswer(res.data, { imageIndex: input.image_index, offset: input.offset, maxResultChars: cfg.maxResultChars });
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
        const target = modelTarget(input.project_id, input.region ?? '', input.model);
        const body = {
          contents: contentsOf(input),
          ...systemOf(input.system_instruction),
          ...(input.generation_config ? { generationConfig: input.generation_config } : {}),
          ...(input.tools ? { tools: input.tools } : {}),
        };
        const res = await call<{ totalTokens?: number; totalBillableCharacters?: number; promptTokensDetails?: unknown }>({
          url: `${hostOf(target.location)}/v1/${target.resource}:countTokens`,
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
      description: `Turn a text (or a multimodal content) into an embedding vector with a Vertex AI embedding model, such as gemini-embedding-001 (matches embed_content in Google's Agent Platform MCP server). Returns the vector, its length and whether the input was cut; a vector longer than this server's result limit (GSM_MAX_RESULT_CHARS, now ${cfg.maxResultChars} characters) comes in parts with next_offset and the number of values left out, never with numbers cut. Billed by Google. A read.`,
      kind: 'read',
      scopes: GENERATE_SCOPES,
      inputSchema: embedShape,
      async handler(args) {
        const input = z.object(embedShape).parse(args);
        if ((input.text === undefined) === (input.content === undefined)) throw new Error('Give exactly one of text and content.');
        if (/^endpoints\//.test(input.model.trim())) throw new Error('embedContent runs on a publisher model, not an endpoint: give a model id such as gemini-embedding-001.');
        const target = modelTarget(input.project_id, input.region ?? '', input.model);
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
          url: `${hostOf(target.location)}/v1/${target.resource}:embedContent`,
          method: 'POST',
          body,
        });
        return embedAnswer(res.data, input.offset ?? 0, cfg.maxResultChars);
      },
    }),
  ];
}

/**
 * The answer of vertex_embed_content: the values from `offset` that fit the result limit, and, when the vector is
 * longer, next_offset and the number of values left out. A value is never cut, rounded or dropped without a word.
 */
export function embedAnswer(
  res: { embedding?: { values?: number[] }; truncated?: boolean; usageMetadata?: unknown },
  offset: number,
  maxResultChars: number,
) {
  const values = res.embedding?.values ?? [];
  if (offset > values.length) throw new Error(`offset ${offset} is past the ${values.length} values of the vector.`);
  const room = Math.max(200, maxResultChars - 2_000);
  const shown: number[] = [];
  let chars = 0;
  for (let i = offset; i < values.length; i += 1) {
    const len = String(JSON.stringify(values[i])).length + 1;
    if (chars + len > room && shown.length > 0) break;
    chars += len;
    shown.push(values[i]!);
    if (chars >= room) break;
  }
  const end = offset + shown.length;
  return {
    values: shown,
    dimensions: values.length,
    ...(offset > 0 ? { offset } : {}),
    ...(end < values.length
      ? {
          next_offset: end,
          values_omitted: values.length - end,
          note: `The vector has ${values.length} values. Values ${offset} to ${end - 1} are here; the other ${values.length - end} do not fit this server's result limit (GSM_MAX_RESULT_CHARS, now ${maxResultChars} characters). Call again with offset ${end} for the next values, and join the parts in order. No value is ever cut or rounded.`,
        }
      : {}),
    ...(res.truncated ? { truncated: true } : {}),
    ...(res.usageMetadata ? { usage_metadata: res.usageMetadata } : {}),
  };
}
