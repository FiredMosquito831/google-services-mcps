# Security model

This suite lets an AI agent act on real Google accounts. The controls below are layered, so one failing layer does not let an action through. Read the limits section too.

## Controls, in order

1. **Token scopes (Google enforces).** Login requests only the scopes of a profile: `readonly` (read-only scopes only), `readwrite`, `full`, or an explicit `--scopes` list. A read-only token cannot write, whatever the plugin shows. Google rejects the call.
2. **Tool registration.** Tools the stored token cannot use are not registered. Modifying and deleting tools are registered only when the plugin's "Allow write tools" setting is on (off by default).
3. **Approval gate (plugin code).** Every modifying or destructive call goes through one gate before it runs. Reads never ask.
   - Claude Code: a `PreToolUse` hook returns `ask`, so Claude's own permission prompt appears. The model cannot skip it.
   - Destructive calls also show the exact action through MCP elicitation, so they are approved twice. Modifying calls are approved by the hook only, when the hook is installed.
   - Other MCP clients: the server asks through elicitation. A client that cannot elicit gets an error, and the action does not run.
   - Declined or unanswered prompts mean nothing changes.
4. **Confirmation setting.** `confirmation` is `every-change` (default: asks before any change or deletion), `destructive-only` (asks only before deleting or sending), or `off` (no prompts). Every prompt says where to change it. Deny rules still apply when it is off.
5. **Policy file.** `policy.json` in the token directory holds `allow`, `ask` and `deny` rules, matched by tool name or method id (glob, or `re:` regex). Deny beats ask beats allow. A broken policy file makes the gate ask, with the error shown.
6. **Audit log.** Each gated action writes one JSON line to `audit.log` in the token directory: time, tool, method, risk, decision and outcome. It stores a 16-character hash of the arguments, never the values.
7. **Secrets.** OAuth tokens and the API key live only in the token directory, in files with mode 0600 where the platform supports it. Nothing secret is written into plugin or agent config files. Secret-looking keys are redacted from prompts, logs and errors.

## Method classification

The gate needs to know whether a call changes data. For generated and gateway tools this comes from the HTTP verb and the method name:

- `GET` is a read. `DELETE` is destructive.
- A `POST` is a read only when its name is a known read verb (`get`, `list`, `search`, `batchGet`, `lookup`, `check`, `validate`, `inspect`, `fetch`, `download`, `describe`, `preview`, `analyze`, `detect`, `evaluate`) or an exact read name (`runReport`, `testIamPermissions`, `getIamPolicy`, and similar). Verbs that run work, mint credentials, export, query or test are writes.
- Destructive names (`delete`, `remove`, `trash`, `send`, `disable`, `revoke`, and similar) are destructive.
- Anything else is a write.
- `config/tool-kinds.json` overrides any method by its full id.

## What Google enforces regardless of this plugin

- Scope checks on every API call. A token without a write scope gets 403 on writes.
- Restricted scopes (most Gmail and Drive scopes) need Google's verification for public apps.
- Service-account key creation is blocked by default in organisations created since May 2024.

## Known limits

- **Unscoped methods.** About 54 write and delete methods declare no OAuth scope in their discovery documents. They are listed without a login, and they are still gated per call. Google still rejects them without a write scope.
- **Hook and elicitation behaviour** is taken from Claude Code's documentation. It has not been exercised in a live session yet.
- **Windows file modes.** Mode 0600 is not enforced on Windows. Protect the token directory with your account's permissions.
- **Confirmation off.** Only deny rules protect you then. Use `off` only for accounts you fully control.
- **Long content.** Approval text shows up to 1500 characters per string. A longer body is cut, and the prompt says so.
- **Untrusted content.** Mail, documents and files can contain instructions aimed at the agent. The approval text shows the real action, so read it before approving.
- **Audit log.** It is plain text in the token directory. It is not tamper-evident.
- **Other clients.** A client with neither hooks nor elicitation cannot run modifying or destructive tools. That is the intended fail-closed behaviour.

## Reporting

This repository is private. Report problems to the repository owner.
