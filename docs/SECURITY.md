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

7. **Login lifecycle.** A login uses PKCE (S256) with the loopback redirect and a state check. Logout revokes the login at Google before it removes the file (`--local-only` skips that). Google's revocation removes every grant the account gave the OAuth client's project, so when the same account is signed in here for another group, logout and `account_remove` remove only the local token and say so; `--revoke-all` revokes anyway. The check reads `accounts.json` and file names only, never a token. `gsm status --check` is the only command that asks Google about a stored login: whether it is valid, expired or revoked, which scopes Google grants, and whether the API key is restricted. A login that Google refuses is reported with the command that logs in again. Before a login, the OAuth servers list only the tools that need no scope, plus `auth_status`. Every server has a `health` tool. Logins request the email scope, so a login can record its account; `health` and `status` show that account to the model and to you. Nothing else sends it anywhere. Each signed-in account has its own token file, listed in accounts.json in the token folder. The agent can list the accounts by name, and set the default or remove one; it never sees a token. Signing in from the chat (`auth_login`) runs the same `gsm login` as a terminal, as a child process of the server. The browser opens on this machine, and the sign-in waits on 127.0.0.1 for Google's redirect. The sign-in and client-file tools are writes in the plugin map, so the hook asks before each one. An API key is never sent through the chat. ADC is a second way to sign in. The suite reads the ADC file's type, quota project and a SHA-256 of its refresh token; it never returns, prints or writes the token, and never writes to the file. `adc.scopes.json` in the token folder holds the group, the scopes and that hash for the last ADC login the suite made. The ADC login is kept by gcloud: `logout` does not remove it, and `gcloud auth application-default revoke` does. The gcloud CLI runs as a child process with the path of your client file, never its contents. The service-account key for gplay and gmerchant is referenced by path and never copied or printed; the suite stores only the path, the account's email and the time. Secrets can be moved into the operating system's store with `gsm protect`: DPAPI on Windows (encrypted for the Windows user on that machine), with Keychain and libsecret implemented but not run in this release. Values are passed to the store on stdin, never in a command line. Each value is read back before its plain copy is removed. The names of stored secrets are listed in `secrets.json`, without content.
8. **Secrets.** Tokens, the client file and the API key live only in the token directory. Files are written with mode 0600 where the platform supports it, and on Windows the folder's access list is limited to your user, SYSTEM and Administrators (`gsm doctor` checks it). The client file is `client_secret.json`. Each login is `<group>.token.json`. The API key is `apikey.json`. The workspace admin's key file is referenced by path and never copied. Nothing secret is written into plugin files or agent config files. Keys that look secret are redacted from prompts, logs and errors. The Google Ads developer token, if set through the plugin option, is a sensitive option. Claude Code stores sensitive options in secure storage, not in `settings.json`.

9. **Retries.** The suite retries rate-limit and unavailable responses up to 3 attempts in total, with backoff; after that the error reaches Claude. Only throttled requests are repeated: HTTP 429 and 503 for any method, and rate-limit 403s for reads only (`GET`, `HEAD`, `OPTIONS`). A write is never repeated on a 403. See [LIMITS-AND-COSTS.md](LIMITS-AND-COSTS.md#4-quota-errors-and-what-the-suite-does).

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

- **Testing apps lose refresh tokens after 7 days.** An app left in Testing in the OAuth consent screen expires its refresh tokens after 7 days. The error says so, and `gsm status --check` reports the login as expired. Publish the app, or log in again each week.
- **Automation keys have no expiry.** A saved API key (`apikey.json`) keeps working until it is deleted or restricted in Google Cloud console. `gsm status` shows its age, and warns after 90 days. Restrict it to the APIs it needs, and to your servers or addresses. `gsm status --check` reads the restrictions with your cloud login and warns when the key is unrestricted.
- **Read-named POST methods that may run work or return credentials.** A `POST` method is classed as a read by its name prefix (see Method classification). Some of these names may hide work or credentials. They are classed as reads, so they do not ask. Examples from the build's catalogue, found by a name scan. The scan does not prove what each method does:
  - `gcloud`: `developerconnect.projects.locations.connections.gitRepositoryLinks.fetchReadWriteToken`. Its name suggests it returns a read-write credential. `apigee.organizations.getSyncAuthorization`. Its name suggests a credential. `gkehub.projects.locations.memberships.validateCreate`. Its name includes `Create`.
  - `gai`: `aiplatform.evaluateDataset` and `aiplatform.projects.locations.evaluateDataset`. The `evaluate` prefix is a read prefix, but the method may start an evaluation job.

  Until this is fixed in the code, you can close the gap yourself. Add an `ask` rule for these method ids in `policy.json`. The hook applies policy rules to reads too. See [USING.md](USING.md#5-the-policy-file).

- **Unscoped methods.** About 54 write and delete methods declare no OAuth scope in their discovery documents. They are listed without a login. They are still gated per call. Google still rejects them without a write scope. This figure is from an earlier review and was not re-checked for this version of the page.

- **Hook and elicitation behaviour.** The hook and the form are taken from Claude Code's documentation. They have not been exercised in a live session yet. In particular, how Claude Code shows the **Approve this action?** form is not verified.

- **Saved "don't ask again" rules.** Claude Code can save an allow rule when you choose "don't ask again". It is **UNVERIFIED** whether such a rule also stops the suite's hook prompt for a change. Until it is tested, do not use that choice for write or delete tools.

- **Policy `allow` rules.** An `allow` rule skips the default question. Match narrowly. A rule for a whole product, such as `mcp__plugin_gcloud_gcloud__*` with `allow`, also skips the prompt for every gcloud change and delete.

- **Windows file modes.** Mode 0600 is not enforced on Windows, so the token folder's access list is limited instead (see Controls, item 7). `gsm doctor` fails when another account can read that folder. Other products that run on the same machine as your user account still can read files under your profile; the access list does not stop them.

- **Confirmation off.** Only deny rules protect you then. Use `off` only for accounts you fully control.

- **Long content.** Strings in the approval text are cut at 1,500 characters and end with `...`. The arguments are cut at 2,000 characters, and the text says how many characters were left out.

- **Untrusted content.** Mail, documents and files can contain instructions aimed at the agent. The approval text shows the real action, so read it before you approve.

- **Audit log.** It is plain text in the token directory. It is not tamper-evident. A declined prompt in Claude Code writes no line, because the call never reaches the server.

- **Other clients.** A client with neither hooks nor elicitation cannot run modifying or destructive tools. That is the intended fail-closed behaviour. Codex, OpenCode and Antigravity have no hook in this suite. Their approval behaviour is **UNVERIFIED** in a live session.

- **Install flag for Claude Code.** `npx google-services-mcps install --agent claude --allow-writes` does not set the plugin's write option, although its summary line says `writes: enabled`. Set **Allow write tools** in the plugin options instead.

- **One login per group.** A login merges with the scopes the same account already holds for its group, so a login from one product's folder keeps the scopes of the other products. Name the account with `--account <email>` (in the chat: `auth_login` with `account`): only that account's stored scopes are merged, and only the ones a server of the group uses, so a scope from another group (a Cloud scope in a Gmail token, say) is not requested again. Without `--account`, nothing is merged, and a login that would take scopes away from an account already signed in saves nothing and says how to retry. The login does not ask Google for the scopes granted earlier (no `include_granted_scopes`). Use `--replace` to drop the stored scopes and keep only what this login requests. A merge can leave write scopes from an earlier readwrite login in place: when you want a readonly token again, log in with `--replace`. See [INSTALL.md](INSTALL.md#two-command-lines).

- **Install paths.** Codex, OpenCode and Antigravity point to the server files inside the checkout. Moving the checkout breaks them until you install again.

## Reporting

This repository is public. To report a security problem, open a GitHub issue that does not include secrets, or contact the owner privately through GitHub. Never paste tokens, keys or client secret files into an issue.
