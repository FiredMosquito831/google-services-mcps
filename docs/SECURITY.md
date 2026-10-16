# Security model

This suite lets an AI agent act on real Google accounts. The controls below are layered, so one failing layer does not let an action through. Read the known limits too. They say what the controls do not do.

## Controls, in order

1. **Token scopes (Google enforces).** A login asks only for the scopes of a profile: `readonly` (read-only scopes only), `readwrite`, `full`, or an explicit `--scopes` list. A read-only token cannot write, whatever the plugin shows. Google rejects the call. A login merges with the scopes already stored for its group, so logging in for one product keeps the others. Use `--replace` to drop the stored scopes and keep only what this login requests. A merge can leave write scopes from an earlier readwrite login in place: when you want a readonly token again, log in with `--replace`.

2. **Tool registration.** The server lists a tool only if the stored token can run it. Fixed write and destructive tools are listed only when **Allow write tools** is on (`GSM_ALLOW_WRITES=true`). It is off by default.

   The gateway tools `api_call` (in each product that has gateway APIs) and the Google Ads mutate tools are *dynamic*. They are listed even when writes are off. A write sent through them is refused by the gate in control 3 with `Writes are turned off`.

3. **Approval gate (plugin code).** Every write and destructive call passes one gate before it runs. Reads never pass through the gate.

   - **Claude Code.** A `PreToolUse` hook returns `ask` for a change or a delete. Claude Code shows its permission prompt, labelled with the plugin (for example `[plugin:gmail]`). The model cannot skip this prompt.
   - **The hook never allows.** It returns only `ask` or `deny`. It never returns `allow`, so your own Claude Code permission rules still apply.
   - **Destructive calls ask twice.** A delete, send or disable also shows the exact action through an MCP form, **Approve this action?**. The hook prompt and the form are both needed.
   - **Changes ask once in the hook.** A write is approved by the hook prompt only, when the hook is installed.
   - **Other MCP clients.** The server asks through MCP elicitation. A client that cannot elicit gets an error, and the action does not run.
   - **Declined or unanswered prompts** mean nothing changes.

4. **Confirmation setting.** `confirmation` is one of three modes:

   - `every-change` (default): asks before any change or deletion.
   - `destructive-only`: asks only before deleting or sending. Changes run.
   - `off`: nothing asks. Deny rules still apply.

   The plugin option is the setting for Claude Code. The server reads `GSM_CONFIRMATION`. A valid value there takes priority over `confirmation` in `policy.json`. Every prompt ends with a footer that says where to change the setting.

5. **Policy file.** `policy.json` in the token directory holds `allow`, `ask` and `deny` rules. A rule matches a tool name or a method id, by glob (`*`, `?`) or by a regular expression written `re:...`. The order is fixed: a matching `deny` wins, then a matching `ask`, then a matching `allow`. An `allow` rule skips the default question for a change or a delete. It never overrides a `deny`. A broken policy file makes the gate ask, and the error is shown.

6. **Audit log.** Each gated action writes one JSON line to `audit.log` in the token directory. The line has the time, tool, method id, risk, decision, outcome and a 16-character hash of the arguments. The arguments themselves are never written. Reads are not logged. See [USING.md](USING.md#8-the-audit-log).

7. **Secrets.** Tokens, the client file and the API key live only in the token directory. Files are written with mode 0600 where the platform supports it. The client file is `client_secret.json`. Each login is `<group>.token.json`. The API key is `apikey.json`. The workspace admin's key file is referenced by path and never copied. Nothing secret is written into plugin files or agent config files. Keys that look secret are redacted from prompts, logs and errors. The Google Ads developer token, if set through the plugin option, is a sensitive option. Claude Code stores sensitive options in secure storage, not in `settings.json`.

8. **Retries.** The suite retries rate-limit and unavailable responses up to 3 attempts in total, with backoff; after that the error reaches Claude. Only throttled requests are repeated: HTTP 429 and 503 for any method, and rate-limit 403s for reads only (`GET`, `HEAD`, `OPTIONS`). A write is never repeated on a 403. See [LIMITS-AND-COSTS.md](LIMITS-AND-COSTS.md#4-quota-errors-and-what-the-suite-does).

## Method classification

The gate needs to know whether a call changes data. For generated and gateway tools, the class comes from the HTTP verb and the method name. The rules are in `src/core/discovery/methods.ts`:

- `DELETE` is destructive.
- A method whose last name segment is one of these is destructive, ignoring case, hyphens and underscores: `delete`, `remove`, `trash`, `empty`, `cancel`, `stop`, `disable`, `revoke`, `reset`, `deactivate`, `suspend`, `deprovision`, `purge`, `terminate`, `destroy`, `clear`, `unsubscribe`, `send`, `sendDraft`, `batchDelete`, `batchRemove`, `close`, `archive`, `move-to-trash`.
- `GET` is a read.
- A `POST` is a read when its name starts with one of these: `get`, `list`, `search`, `batchGet`, `lookup`, `check`, `validate`, `inspect`, `fetch`, `download`, `describe`, `preview`, `analyze`, `detect`, `evaluate`. Or when its name is one of these exact names: `queryRecord`, `queryHistoryRecord`, `getIamPolicy`, `testIamPermissions`, `runReport`, `runRealtimeReport`, `runPivotReport`, `batchRunReports`, `runAccessReport`, `queryAuditLogs`.
- Anything else is a write.
- `config/tool-kinds.json` overrides any method by its full id. A dynamic override is decided per call.

The read rule for `POST` is a name prefix. It is not a check of what the method does. See the first known limit below.

## What Google enforces regardless of this plugin

- Scope checks on every API call. A token without a write scope gets a 403 on writes.
- Restricted scopes (most Gmail and Drive scopes) need Google's verification for public apps.
- Service account key creation is blocked by default in organisations created on or after 2024-05-03.

## Known limits

- **Read-named POST methods that may run work or return credentials.** A `POST` method is classed as a read by its name prefix (see Method classification). Some of these names may hide work or credentials. They are classed as reads, so they do not ask. Examples from the build's catalogue, found by a name scan. The scan does not prove what each method does:
  - `gcloud`: `developerconnect.projects.locations.connections.gitRepositoryLinks.fetchReadWriteToken`. Its name suggests it returns a read-write credential. `apigee.organizations.getSyncAuthorization`. Its name suggests a credential. `gkehub.projects.locations.memberships.validateCreate`. Its name includes `Create`.
  - `gai`: `aiplatform.evaluateDataset` and `aiplatform.projects.locations.evaluateDataset`. The `evaluate` prefix is a read prefix, but the method may start an evaluation job.

  Until this is fixed in the code, you can close the gap yourself. Add an `ask` rule for these method ids in `policy.json`. The hook applies policy rules to reads too. See [USING.md](USING.md#5-the-policy-file).

- **Unscoped methods.** About 54 write and delete methods declare no OAuth scope in their discovery documents. They are listed without a login. They are still gated per call. Google still rejects them without a write scope. This figure is from an earlier review and was not re-checked for this version of the page.

- **Hook and elicitation behaviour.** The hook and the form are taken from Claude Code's documentation. They have not been exercised in a live session yet. In particular, how Claude Code shows the **Approve this action?** form is not verified.

- **Saved "don't ask again" rules.** Claude Code can save an allow rule when you choose "don't ask again". It is **UNVERIFIED** whether such a rule also stops the suite's hook prompt for a change. Until it is tested, do not use that choice for write or delete tools.

- **Policy `allow` rules.** An `allow` rule skips the default question. Match narrowly. A rule for a whole product, such as `mcp__plugin_gcloud_gcloud__*` with `allow`, also skips the prompt for every gcloud change and delete.

- **Windows file modes.** Mode 0600 is not enforced on Windows. Protect the token directory with your account's permissions.

- **Confirmation off.** Only deny rules protect you then. Use `off` only for accounts you fully control.

- **Long content.** Strings in the approval text are cut at 1,500 characters and end with `...`. The arguments are cut at 2,000 characters, and the text says how many characters were left out.

- **Untrusted content.** Mail, documents and files can contain instructions aimed at the agent. The approval text shows the real action, so read it before you approve.

- **Audit log.** It is plain text in the token directory. It is not tamper-evident. A declined prompt in Claude Code writes no line, because the call never reaches the server.

- **Other clients.** A client with neither hooks nor elicitation cannot run modifying or destructive tools. That is the intended fail-closed behaviour. Codex, OpenCode and Antigravity have no hook in this suite. Their approval behaviour is **UNVERIFIED** in a live session.

- **Install flag for Claude Code.** `npx google-services-mcps install --agent claude --allow-writes` does not set the plugin's write option, although its summary line says `writes: enabled`. Set **Allow write tools** in the plugin options instead.

- **One login per group.** A login merges with the scopes already stored for its group, so a login from one product's folder keeps the scopes of the other products. Use `--replace` to drop the stored scopes and keep only what this login requests. A merge can leave write scopes from an earlier readwrite login in place: when you want a readonly token again, log in with `--replace`. See [INSTALL.md](INSTALL.md#two-command-lines).

- **Install paths.** Codex, OpenCode and Antigravity point to the server files inside the checkout. Moving the checkout breaks them until you install again.

## Reporting

This repository is public. To report a security problem, open a GitHub issue that does not include secrets, or contact the owner privately through GitHub. Never paste tokens, keys or client secret files into an issue.
