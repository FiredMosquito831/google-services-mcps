# AI and ML (`gai`)

Install with the simplest command: `npx google-services-mcps install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Generative and classic AI APIs: the Gemini API, Vertex AI (catalogued as the Agent Platform API), Discovery Engine, Dialogflow, Vision, Speech-to-Text, Text-to-Speech, Translate, Natural Language, Video Intelligence, Document AI and agent services. It has 357 tools. The Gemini and Vertex AI methods are reached through the gateway, apart from three hand-written Vertex AI tools (generate, count tokens, embed).

## When to install it

- You call Gemini models or Vertex AI from Claude.
- You search or answer questions over your own documents with Discovery Engine.
- You read text from images or documents, transcribe audio, or translate text.
- Wrong choice: you need a fixed price per call. Gemini is priced per token, and the gateway can start paid work.

## Install and set up

```
claude plugin install gai@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-client <client_secret.json>
node <plugin>/bin/gsm.mjs login cloud --profile readwrite
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gai`).

1. In a Google Cloud project, enable the APIs you use: the Generative Language (Gemini) API, Vertex AI, Discovery Engine, Vision, Speech-to-Text and others. Enable billing for paid services.
2. Set up the OAuth consent screen. Create an OAuth client ID of type Desktop app and download the JSON file.
3. Run `setup-client`, then `login cloud`. Restart the MCP server (`/mcp`) after login.

The `cloud` login is shared with `gcloud`. Sign in with `--profile readwrite`: almost none of these APIs offer a read-only scope (Discovery Engine, Vision, Speech, Text-to-Speech, Natural Language and Video Intelligence list `cloud-platform` only), so of the tools that call Google a `readonly` login covers two, `vertex_generate_content` and `vertex_embed_content`. With `readwrite`, writes still need the plugin option `allow_writes`, so with writes off a `readwrite` login lists the reads only.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Vertex AI (hand-written) | `vertex_generate_content`, `vertex_count_tokens`, `vertex_embed_content` | read | Send a prompt to a Gemini or other Vertex AI model, count a prompt's tokens, or embed a text. Billed per use by Google, but they change nothing, so they do not ask |
| Gemini API and Vertex AI | `api_search`, `api_describe`, `api_call` | read, read, dynamic | Find and call Gemini (86 and 47 methods) and Vertex AI methods. These have no per-method tools. |
| Discovery Engine (278 per-method) | search, answer, data stores, documents, engines | read, write, destructive | Search and answer over your own data. Documents can be created or purged. |
| Vision (38), Speech (14), Text-to-Speech (7), Language (5), Video Intelligence (8) | annotate, recognize, synthesize, analyze | read, write | Analyze images, transcribe audio, synthesize speech. Since 1.26.3 the synchronous calls (Vision `annotate`, Speech `recognize`, Text-to-Speech `synthesize`, Language `annotateText`, `classifyText`, `moderateText`) are reads; the asynchronous ones, which write to Cloud Storage or start an operation, are writes. |
| Gateway (47 APIs) | `api_search`, `api_describe`, `api_call` | mixed | Dialogflow v3 (158 methods), Translate v3 (51), Document AI (42), Contact Center AI Insights (192), AI Commerce Search (71), Gemini Enterprise for Customer Experience (73), Agent Registry, Agent Identity, Notebooks and others |

The full list is in `docs/capabilities/gai.md`.

The three hand-written tools match the generative tools of Google's Agent Platform MCP server (Google Cloud's hosted Vertex AI MCP server, https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/use-agent-platform-mcp): `generate_content`, `count_tokens` and `embed_content`. Give the project, the model (an id such as `gemini-2.5-flash`, `publishers/<publisher>/models/<id>`, or `endpoints/<id>` for a model deployed to an endpoint) and the region (`global` by default, or a region such as `us-central1`, which picks that region's host). They are reads, as Google's server marks them: they compute and change nothing, so they do not ask, but Google bills them per token. With the plugin option `toolset: google`, the server lists these three and the three generated Discovery Engine tools that match Google's Agent Search tools (search, answer and the engine list): 6 tools, with `health` and the sign-in tools. Google's other 53 Agent Platform tools (Colab Enterprise, notebook executions, endpoints, models, tuning, RAG, evaluation, prompts, predict) have no tool here; `api_call` reaches their methods in the `all` and `curated` toolsets; since 1.31.1 a call whose path names a region (`projects/p/locations/us-central1/...`) goes to that region's host from the API's Discovery document, as Vertex AI needs, and Discovery Engine `us` data stores to `discoveryengine.us.rep.googleapis.com` (the document lists no `eu` host, so `eu` stays on the global host; not checked live). A `readonly` login with that toolset asks for `cloud-platform.read-only` (it covers generate and embed); a `readwrite` login for `cloud-platform`.

## Example requests

- "Summarize this 40-page contract in five bullets." Claude runs `vertex_generate_content` with the text and a system instruction. It is a read and does not ask; Google bills the tokens.
- "How many tokens is this prompt for Gemini 2.5 Pro?" Claude runs `vertex_count_tokens`. No prompt.
- "Embed these three sentences for a similarity search." Claude runs `vertex_embed_content` for each, with `task_type: SEMANTIC_SIMILARITY`. No prompt.
- "Call an older Gemini method through the gateway." Claude finds it with `api_search`, checks it with `api_describe`, then calls it with `api_call`. Gateway model calls run work, so Claude asks first.
- "Search our product manuals for the warranty period." Claude runs a Discovery Engine search. No prompt.
- "Transcribe this 30-second voice note." Claude runs the speech recognize tool. No prompt: it only computes (a read since 1.26.3).
- "Read the text in this photo of a receipt." Claude runs a Vision annotate tool. No prompt: it only computes (a read since 1.26.3).

## Safety

- Model and recognition calls cost money per use. The verb rule in `docs/SECURITY.md` classes calls that run work as writes, so Claude asks before them. The three hand-written Vertex tools are the exception: they are declared reads, as Google's server marks them, so they do not ask (as `bq_query_read` in gcloud does not). Set a budget alert on the project if that matters.
- Read tools never ask. Writes ask first. Destructive calls, such as deleting Discovery Engine documents, ask twice.
- Gateway calls follow each method's class. Check a method with `api_describe` before you call it.
- The `confirmation` option defaults to `every-change`. Change it with `printf '%s' '{"confirmation":"destructive-only"}' | claude plugin configure gai@google-services-mcps --values-stdin` (JSON on stdin), or `/plugin configure gai@google-services-mcps` in Claude Code.

## Costs and limits

Gemini is priced per token: Flash models have a free tier and Pro models are paid only, at USD 0.30 input and 2.50 output per million tokens for Gemini 2.5 Flash. Vision gives 1,000 units per month free for each feature. Prices for Speech-to-Text, Translate, Document AI and Dialogflow are UNVERIFIED. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/workspace-cloud-search-ai.md`, section 14.

## Caveats

- Free-tier content may be used to improve Google products. Paid content is not.
- Vertex AI default Gemini per-minute values are UNVERIFIED. Multimodal input quotas cannot be raised from the console.
- Discovery Engine LLM queries are limited to 60 per minute.
- Error codes for Dialogflow, Discovery Engine, Text-to-Speech, Vertex AI and Document AI are UNVERIFIED.
