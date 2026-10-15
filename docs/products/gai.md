# AI and ML (`gai`)

Generative and classic AI APIs: the Gemini API, Vertex AI (catalogued as the Agent Platform API), Discovery Engine, Dialogflow, Vision, Speech-to-Text, Text-to-Speech, Translate, Natural Language, Video Intelligence, Document AI and agent services. It has 354 tools. The Gemini and Vertex AI methods are reached through the gateway only.

## When to install it

- You call Gemini models or Vertex AI from Claude.
- You search or answer questions over your own documents with Discovery Engine.
- You read text from images or documents, transcribe audio, or translate text.
- Wrong choice: you need a fixed price per call. Gemini is priced per token, and the gateway can start paid work.

## Install and set up

```
claude plugin install gai@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-client <client_secret.json>
node <plugin>/bin/gsm.mjs login cloud --profile readonly
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gai`).

1. In a Google Cloud project, enable the APIs you use: the Generative Language (Gemini) API, Vertex AI, Discovery Engine, Vision, Speech-to-Text and others. Enable billing for paid services.
2. Set up the OAuth consent screen. Create an OAuth client ID of type Desktop app and download the JSON file.
3. Run `setup-client`, then `login cloud`. Restart the MCP server (`/mcp`) after login.

The `cloud` login is shared with `gcloud`. Start with `--profile readonly`. Writes need a `readwrite` login and the plugin option `allow_writes`.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Gemini API and Vertex AI | `api_search`, `api_describe`, `api_call` | read, read, dynamic | Find and call Gemini (86 and 47 methods) and Vertex AI methods. These have no per-method tools. |
| Discovery Engine (278 per-method) | search, answer, data stores, documents, engines | read, write, destructive | Search and answer over your own data. Documents can be created or purged. |
| Vision (38), Speech (14), Text-to-Speech (7), Language (5), Video Intelligence (8) | annotate, recognize, synthesize, analyze | read, write | Analyze images, transcribe audio, synthesize speech. Annotate and recognize calls are classed write. |
| Gateway (47 APIs) | `api_search`, `api_describe`, `api_call` | mixed | Dialogflow v3 (158 methods), Translate v3 (51), Document AI (42), Contact Center AI Insights (192), AI Commerce Search (71), Gemini Enterprise for Customer Experience (73), Agent Registry, Agent Identity, Notebooks and others |

The full list is in `docs/capabilities/gai.md`.

## Example requests

- "Summarize this 40-page contract in five bullets." Claude finds a Gemini generate method with `api_search`, checks it with `api_describe`, then calls it with `api_call`. Model calls run work, so Claude asks first.
- "Search our product manuals for the warranty period." Claude runs a Discovery Engine search. No prompt.
- "Transcribe this 30-second voice note." Claude runs the speech recognize tool. It asks first.
- "Read the text in this photo of a receipt." Claude runs a Vision annotate tool. It asks first.

## Safety

- Model and recognition calls cost money per use. The verb rule in `docs/SECURITY.md` classes calls that run work as writes, so Claude asks before them.
- Read tools never ask. Writes ask first. Destructive calls, such as deleting Discovery Engine documents, ask twice.
- Gateway calls follow each method's class. Check a method with `api_describe` before you call it.
- The `confirmation` option defaults to `every-change`. Change it with `claude plugin configure gai`.

## Costs and limits

Gemini is priced per token: Flash models have a free tier and Pro models are paid only, at USD 0.30 input and 2.50 output per million tokens for Gemini 2.5 Flash. Vision gives 1,000 units per month free for each feature. Prices for Speech-to-Text, Translate, Document AI and Dialogflow are UNVERIFIED. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/workspace-cloud-search-ai.md`, section 14.

## Caveats

- Free-tier content may be used to improve Google products. Paid content is not.
- Vertex AI default Gemini per-minute values are UNVERIFIED. Multimodal input quotas cannot be raised from the console.
- Discovery Engine LLM queries are limited to 60 per minute.
- Error codes for Dialogflow, Discovery Engine, Text-to-Speech, Vertex AI and Document AI are UNVERIFIED.
