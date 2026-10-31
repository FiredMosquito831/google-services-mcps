# AI and ML (`gai`)

Generative and classic AI APIs: Discovery Engine, Vertex AI, Dialogflow, Vision, Speech, Translate, Document AI and agent services.

One plugin of [google-services-mcps](https://github.com/FiredMosquito831/google-services-mcps): one Claude Code plugin per Google product, each with one MCP server, a consent hook and a skill.

## Install

```sh
claude plugin marketplace add FiredMosquito831/google-services-mcps
claude plugin install gai@google-services-mcps
```

In a Claude Code session: `/plugin install gai@google-services-mcps`. With the installer, which also covers Codex, OpenCode and Antigravity: `npx google-services-mcps install --agent claude --plugin gai`. Needs Claude Code 2.1.271 or later.

## Sign in

Ask Claude to sign in. It calls `auth_status`, then `auth_setup_client` with the full path of your Desktop OAuth client JSON (Google Cloud console, APIs & Services, Credentials), then `auth_login`, which opens Google's consent page in your browser.

## Options

`allow_writes` (off: only read tools are listed), `confirmation` (`every-change`, `destructive-only` or `off`), `toolset` (`all`, `google` or `curated`) and `token_dir`. See [Plugin options](https://github.com/FiredMosquito831/google-services-mcps#plugin-options-claude-code).

## Update

Claude Code does not update plugins from this marketplace on its own (auto-update is off for third-party marketplaces). To update:

```sh
claude plugin marketplace update google-services-mcps
claude plugin update gai@google-services-mcps
```

Then start a new session, or run `/reload-plugins`.

## More

- [What this product covers](https://github.com/FiredMosquito831/google-services-mcps/blob/main/docs/products/gai.md)
- [Every tool, with its kind and scopes](https://github.com/FiredMosquito831/google-services-mcps/blob/main/docs/capabilities/gai.md)
- [Safety: approvals, policy rules, audit log](https://github.com/FiredMosquito831/google-services-mcps/blob/main/docs/SECURITY.md)

License: Apache-2.0.
