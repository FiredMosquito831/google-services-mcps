# Security model

This suite lets an AI agent act on real Google accounts. The controls below are layered, so one failing layer does not let an action through. Read the known limits too. They say what the controls do not do.

## Controls, in order

1. **Token scopes (Google enforces).** A login asks only for the scopes of a profile: `readonly` (read-only scopes only), `readwrite`, `full`, or an explicit `--scopes` list. A read-only token cannot write, whatever the plugin shows. Google rejects the call. A product can hold broad scopes back: Gmail's `readwrite` asks for `gmail.modify` and `gmail.settings.basic`, only `full` asks for the full-mailbox scope `https://mail.google.com/`, no profile asks for `gmail.settings.sharing`, and Postmaster Tools is added only with `--with postmaster`. A login merges with the scopes already stored for its group, so logging in for one product keeps the others. Use `--replace` to drop the stored scopes and keep only what this login requests. A merge can leave write scopes from an earlier readwrite login in place: when you want a readonly token again, log in with `--replace`.

2. **Tool registration.** The server lists a tool only if the stored token can run it. Fixed write and destructive tools are listed only when **Allow write tools** is on (`GSM_ALLOW_WRITES=true`). It is off by default.

   The gateway tools `api_call` (in each product that has gateway APIs) and the Google Ads mutate tools are *dynamic*. They are listed even when writes are off. A write sent through them is refused by the gate in control 3 with `Writes are turned off`.

3. **Approval gate (plugin code).** Every write and destructive call passes one gate before it runs. Reads never pass through the gate.

   - **Claude Code.** A `PreToolUse` hook returns `ask` for a change or a delete. Claude Code shows its permission prompt, labelled with the plugin (for example `[plugin:gmail]`). The model cannot skip this prompt.
   - **The hook never allows.** It returns only `ask` or `deny`. It never returns `allow`, so your own Claude Code permission rules still apply.
   - **Destructive calls ask twice.** A destructive call (see [The destructive rule](#the-destructive-rule): a delete, a send to other people, a share, a publish and the others listed there) also shows the exact action through an MCP form, **Approve this action?**. The hook prompt and the form are both needed. Since 1.38.0 a destructive tool is also marked so that Claude Code's own prompt cannot be skipped by a permission mode, an allow rule or a hook that timed out (see [Destructive tools and Claude Code's permission prompt](#destructive-tools-and-claude-codes-permission-prompt)).
   - **Changes ask once in the hook.** A write is approved by the hook prompt only, when the hook is installed.
   - **Other MCP clients.** The server asks through MCP elicitation. A client that cannot elicit gets an error, and the action does not run.
   - **Declined or unanswered prompts** mean nothing changes.

4. **Confirmation setting.** `confirmation` is one of three modes:

   - `every-change` (default): asks before any change or deletion.
   - `destructive-only`: asks only before destructive actions, as [The destructive rule](#the-destructive-rule) defines them: deleting, sending to other people, sharing or permission changes, security changes, device commands, publishing, moving money, whole-content replacement and key destruction. Other changes run.
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
- Since 1.24.2 it lists as reads twelve `POST` methods that Google marks read-only and that change nothing: Data Connect `executeGraphqlRead`, `generateQuery` and `generateSchema`, Firebase Rules `projects.test`, the three bindings of Discovery Engine `servingConfigs.answer`, Developer Knowledge `answerQuery`, Places `autocomplete`, Analytics Data `batchRunPivotReports` and `audienceExports.query`, and Calendar `freebusy.query`. It lists Merchant API `accounts.dataSources.fetch` as a write, because Google says it starts processing the data source's file. A credential name stays a write.
- Since 1.24.5 it also lists as reads seventeen `POST` methods that only query: Search Console `searchanalytics.query`; the Monitoring Prometheus queries (`query`, `query_range`, `query_exemplars`, `series`, `labels`) and `timeSeries.query`; Postmaster v2 `domainStats.query` and `batchQuery`; Vertex AI `generateContent` (four bindings) and `embedContent`; Identity Toolkit `accounts.query` (project and tenant); Firestore `documents.runQuery`. BigQuery `jobs.query` stays a write, because it runs any SQL, DML and DDL included. Vertex AI `countTokens` stays a write: its name holds "token", and the credential rule is not overridden.
- Since 1.26.3 it lists the methods of the destructive rule as destructive (next section), 45 more `POST` methods that only read or compute as reads, and four `GET` methods that record an event as writes (see [POST reads and GET writes of 1.26.3](#post-reads-and-get-writes-of-1263)).

The read rule for `POST` is a name prefix. It is not a check of what the method does. See the first known limit below.

### The destructive rule

A method or tool is destructive when it does one of these. A destructive call asks twice, and it asks even under `confirmation: destructive-only`.

- (a) sends a message, invitation or notification to other people;
- (b) grants or changes sharing, permissions, roles, ownership or admin privilege;
- (c) disables a security control (2-step verification, SSO, keys);
- (d) wipes, resets or issues a command to a device;
- (e) publishes, deploys, commits a release or ends a live session;
- (f) moves money (refunds, price migrations);
- (g) replaces or deletes whole content (whole-file replacement, batch edits that can delete content, an update that clears omitted fields, workspace-consuming version creation);
- (h) permanently destroys key material or held data.

Everything else keeps its kind. A plain edit, such as a patch of one field, stays a write. The verb and name rules above already make deletes, removals, sends (`send`), disables and the other destructive names destructive; the rule adds the methods those names miss.

**How it is applied (since 1.26.3).** A generated or gateway method gets it by its exact id in `config/tool-kinds.json`, and one id covers every catalog version of the method. A hand-written tool gets it through its kind: `chat_send_message` posts to other people, so it is destructive, like `gmail_send`. Some hand-written writes meet the rule only with some arguments; that call is gated as destructive and the tool stays a write in the plugin's tool map: `calendar_create_event` with attendees, `calendar_update_event` and `calendar_respond` when `send_updates` is `all` or `externalOnly` (Google emails the guests or the organizer), `classroom_create_announcement` with `publish` or `scheduled_time` (it posts to the students), and `gcs_write_text` with `overwrite: true` (it can replace a whole object). In Claude Code the hook asks about such a call once as a change (`every-change`) and not at all under `destructive-only`; the server's **Approve this action?** form asks in both modes.

| Rule | Method | What Google says |
|---|---|---|
| (a) | `chat.spaces.messages.create` | "Creates a message in a Google Chat space." |
| (a) | `gmail.users.settings.forwardingAddresses.create` | "If ownership verification is required, a message will be sent to the recipient" |
| (a) | `classroom.userProfiles.guardianInvitations.create` | "Creates a guardian invitation, and sends an email to the guardian" |
| (a) | `classroom.invitations.create` | "An invitation to join a course", as a student, teacher or owner |
| (b) | `drive.permissions.create`, `drive.permissions.update` (v3, and v2 in the gateway), `drive.permissions.insert`, `drive.permissions.patch` (v2) | "Creates a permission for a file or shared drive."; "Updates a permission." |
| (b) | `calendar.acl.insert`, `calendar.acl.patch`, `calendar.acl.update` | "Creates an access control rule."; "Updates an access control rule." |
| (b) | `calendar.calendars.transferOwnership` | "Transfers a secondary calendar between users" |
| (b) | `keep.notes.permissions.batchCreate` | "Creates one or more permissions on the note." |
| (b) | `tagmanager.accounts.user_permissions.create`, `tagmanager.accounts.user_permissions.update` (v2), `tagmanager.accounts.permissions.create`, `tagmanager.accounts.permissions.update` (v1, gateway) | "Creates a user's Account & Container access." |
| (b) | `mybusinessaccountmanagement.accounts.admins.create`, `mybusinessaccountmanagement.locations.admins.create` | "Invites the specified user to become an administrator" |
| (b) | `mybusinessaccountmanagement.accounts.admins.patch`, `mybusinessaccountmanagement.locations.admins.patch` | "Only the AdminRole of the Admin can be updated." |
| (b) | `mybusinessaccountmanagement.locations.transfer` | "Moves a location from an account that the user owns to another account" |
| (b) | `datatransfer.transfers.insert` | "the transfer of the ownership of user data between users" |
| (b) | `directory.users.makeAdmin` | "Makes a user a super administrator." |
| (b) | `directory.roleAssignments.insert`, `directory.roles.insert`, `directory.roles.patch`, `directory.roles.update` | "Creates a role assignment."; "Creates a role." |
| (b) | `gmail.users.settings.delegates.create` | "Delegates can read, send, and delete messages ... for the delegator's account." |
| (b) | `gmail.users.settings.updateAutoForwarding` | "Whether all incoming mail is automatically forwarded to another address." |
| (b) | `merchantapi.accounts.developerRegistration.unregisterGcp` | "Unregister the calling GCP from the calling shopping account." |
| (b) | `merchantapi.accounts.homepage.unclaim` | "Unclaims a store's homepage." |
| (b) | `siteVerification.webResource.patch`, `siteVerification.webResource.update` | "Modify the list of owners for your website or domain." |
| (b) | `classroom.courses.courseWork.studentSubmissions.return` | "Returning a student submission transfers ownership of attached Drive files to the student" |
| (b) | every `setIamPolicy` method of an API a plugin reaches (275 ids, listed one by one, such as `cloudresourcemanager.projects.setIamPolicy` and `storage.buckets.setIamPolicy`) | "Sets the access control policy on the specified resource. Replaces any existing policy." |
| (c) | `directory.twoStepVerification.turnOff` | "Turns off 2-Step Verification for user." |
| (c) | `cloudidentity.inboundSamlSsoProfiles.create`, `cloudidentity.inboundSamlSsoProfiles.patch`, `cloudidentity.inboundSamlSsoProfiles.idpCredentials.add`, `cloudidentity.inboundOidcSsoProfiles.create`, `cloudidentity.inboundOidcSsoProfiles.patch` | the single sign-on profiles and their signing credentials |
| (c) | `cloudidentity.inboundSsoAssignments.create`, `cloudidentity.inboundSsoAssignments.patch` | "To disable SSO, Create (or Update) an assignment that has `sso_mode` == `SSO_OFF`." |
| (d) | `directory.mobiledevices.action` | "Takes an action that affects a mobile device. For example, remotely wiping a device." |
| (d) | `directory.chromeosdevices.action`, `admin.customer.devices.chromeos.batchChangeStatus` | "deprovisioning, disabling, and re-enabling devices" |
| (d) | `admin.customer.devices.chromeos.issueCommand` | "Issues a command for the device to execute." (`REMOTE_POWERWASH`: "Wipes the device") |
| (d) | `androidmanagement.enterprises.devices.issueCommand` | "Issues a command to a device." |
| (e) | `tagmanager.accounts.containers.versions.publish` | "Publishes a Container Version." |
| (e) | `androidpublisher.edits.commit` | "Commits an app edit." |
| (e) | `youtube.liveBroadcasts.transition` | "Transition a broadcast to a given status." (`complete`: "The broadcast is finished.") |
| (e) | `meet.spaces.endActiveConference` | "Ends an active conference" |
| (f) | `androidpublisher.orders.refund` | "Refunds a user's subscription or in-app purchase order." |
| (f) | `androidpublisher.externaltransactions.refundexternaltransaction` | "Refunds or partially refunds an existing external transaction." |
| (f) | `androidpublisher.monetization.subscriptions.basePlans.migratePrices`, `androidpublisher.monetization.subscriptions.basePlans.batchMigratePrices` | "Requests result in Google Play notifying affected subscribers." |
| (f) | `reseller.subscriptions.changeSeats`, `reseller.subscriptions.insert` | "Updates a subscription's user license settings."; "Creates or transfer a subscription." |
| (g) | `script.projects.updateContent` | "This clears all the existing files in the project." |
| (g) | `docs.documents.batchUpdate`, `sheets.spreadsheets.batchUpdate`, `slides.presentations.batchUpdate` | "Applies one or more updates", including delete requests |
| (g) | `youtube.videos.update` | a property the request leaves out: "the property's existing value will be deleted" |
| (g) | `tagmanager.accounts.containers.workspaces.create_version` | "Creates a Container Version from the entities present in the workspace, deletes the workspace" |
| (h) | `gmail.users.settings.cse.keypairs.obliterate` | "Deletes a client-side encryption key pair permanently and immediately." |
| (h) | `vault.matters.holds.removeHeldAccounts` | "Removes the specified accounts from a hold."; the data is then no longer preserved |

`tests/kinds-destructive.test.mjs` pins each entry: both classifiers on every catalog version, the built tool maps and gateway tables, each plugin's own hook, and running servers.

### Approval previews

The server's form (**Approve this action?**) shows what the call will do. Some tools read first, with the same account, so the form can name what the call acts on. These reads are reads: they never ask, and they change nothing. They change only the text of the approval; the request the tool then sends is the same. A declined approval sends nothing.

- **Hand-written tools** work the action out in a `prepare` step before the gate: `gmail_send` and `gmail_reply` (recipients, subject, thread, attachments), `gcs_write_text` (destination, size, whether an object may be replaced), `chat_send_message` (the conversation's name; since 1.27.0 the people of a direct message or an unnamed group chat, and up to 1,500 characters of the text with its full length), and since 1.27.0 `calendar_delete_event` (the event's title, start and end, organizer and number of guests, whether the ID deletes one event, one occurrence of a recurring event, or the whole series, and whether guests are emailed). When the event cannot be read, the form shows its ids and the reason.
- **Per-method tools (since 1.27.0).** A write or destructive tool whose method names one resource by its path, where the same API has a `GET` method named `get` for that resource (same resource, the same path parameters, no other required parameter, and a read: never a credential reveal), reads that resource first. The form then shows up to four of its top-level fields `title`, `displayName`, `summary`, `subject`, `name`, `primaryEmail`, `emailAddress` and `email`, each cut at 200 characters, under `target (read from Google now, not sent)`, before the arguments. The read result passes the credential list (see Credential fields) before a field is picked. 777 of the 1,756 generated write and destructive tools have such a read, for example `tasks_tasks_delete`, `meet_spaces_end_active_conference` and `drive_permissions_update`. A create has none: it names its parent, not the new resource.
- **When nothing is read.** A tool without such a `GET`, a read that fails, or one that takes longer than 5 seconds: the form shows the arguments exactly as before. The read is also skipped when the form will not be shown for the call: a change while the plugin's hook is active (the hook asks about changes in Claude Code, and its prompt shows the arguments only), and a change under `confirmation: destructive-only` or any call under `off` set through the plugin option or `GSM_CONFIRMATION`.
- **Decisions do not change.** Policy rules and the confirmation setting decide from the tool, the method and the kind, never from argument values or the preview. The audit line hashes what the form showed.

### POST reads and GET writes of 1.26.3

These `POST` methods only read or compute, and change nothing. They are reads, so they run without a question and are listed while writes are off:

| Method | What Google says |
|---|---|
| `playdeveloperreporting.vitals.anonrssandswapmemoryusage.query`, `playdeveloperreporting.vitals.anrrate.query`, `playdeveloperreporting.vitals.bitmapmemoryusage.query`, `playdeveloperreporting.vitals.crashrate.query`, `playdeveloperreporting.vitals.errors.counts.query`, `playdeveloperreporting.vitals.excessivewakeuprate.query`, `playdeveloperreporting.vitals.lmkrate.query`, `playdeveloperreporting.vitals.slowrenderingrate.query`, `playdeveloperreporting.vitals.slowstartrate.query`, `playdeveloperreporting.vitals.stuckbackgroundwakelockrate.query` | "Queries the metrics in the metric set." |
| `googleads.customers.generateReachForecast` | "Generates a reach forecast for a given targeting / product mix." |
| `googleads.customers.suggestBrands`, `googleads.customers.suggestSmartCampaignAd`, `googleads.customers.suggestSmartCampaignBudgetOptions`, `googleads.customers.suggestTravelAssets`, `googleads.geoTargetConstants.suggest`, `googleads.keywordThemeConstants.suggest` | suggestions ("Returns BudgetOption suggestions.") |
| `admob.accounts.networkReport.generate`, `admob.accounts.mediationReport.generate`, `admob.accounts.campaignReport.generate` | "Generates an AdMob Network report based on the provided report specification." |
| `driveactivity.activity.query` | "Query past activity in Google Drive." |
| `areainsights.computeInsights` | "lets you retrieve insights about areas" |
| `travelimpactmodel.flights.computeFlightEmissions`, `travelimpactmodel.flights.computeTypicalFlightEmissions`, `travelimpactmodel.flights.computeScope3FlightEmissions`, `travelimpactmodel.flights.computeDetailedFlightEmissions` | "Retrieves emission estimates." |
| `health.users.dataTypes.dataPoints.rollUp`, `health.users.dataTypes.dataPoints.dailyRollUp` | "Roll up data points over physical time intervals" |
| `safebrowsing.threatMatches.find`, `safebrowsing.fullHashes.find` | "Finds the threat entries that match the Safe Browsing lists." |
| `digitalassetlinks.assetlinks.bulkCheck` | "Send a bundle of statement checks in a single RPC" (the batch of the read `check`) |
| `tagmanager.accounts.containers.workspaces.folders.entities` | "List all entities in a GTM Folder." |
| `merchantapi.issueresolution.renderaccountissues`, `merchantapi.issueresolution.renderproductissues` | issues and actions "meant to be rendered and shown in third-party applications" |
| `language.documents.annotateText`, `language.documents.classifyText`, `language.documents.moderateText` | annotateText "provides all the features that analyzeSentiment, analyzeEntities, and analyzeSyntax provide in one call" (those three were reads already) |
| `vision.images.annotate`, `vision.projects.images.annotate`, `vision.projects.locations.images.annotate`, `vision.files.annotate`, `vision.projects.files.annotate`, `vision.projects.locations.files.annotate` | "Run image detection and annotation for a batch of images." The `asyncBatchAnnotate` methods, which write their output to Cloud Storage, stay writes. |
| `speech.speech.recognize` | "Performs synchronous speech recognition: receive results after all audio has been sent and processed." `longrunningrecognize` stays a write. |
| `texttospeech.text.synthesize` | "Synthesizes speech synchronously" (`synthesizeLongAudio`, which writes to Cloud Storage, stays a write) |

These `GET` methods record an event, so they are writes and ask first: `discoveryengine.projects.locations.collections.dataStores.userEvents.collect`, `discoveryengine.projects.locations.dataStores.userEvents.collect`, `discoveryengine.projects.locations.userEvents.collect` and `recommendationengine.projects.locations.catalogs.eventStores.userEvents.collect` ("Writes a single user event from the browser").

Held back by the credential rule: Google Ads `generateKeywordIdeas`, `generateKeywordHistoricalMetrics` and `suggestKeywordThemes` only read, but their names hold "Keyword", and so the credential word "key". A credential name is always a write, and no override passes it, so they stay writes.

### Credential reveals and credential fields in read results

A read never asks. So a read must not hand the model a credential. Since 1.26.2 the suite closes this in two ways.

**Methods that exist to return a credential are writes.** `config/tool-kinds.json` lists these `GET` (or read-named) methods as writes, so they ask first and are hidden while writes are off:

| Method | What it returns (Google's words) |
|---|---|
| `secretmanager.projects.secrets.versions.access`, `secretmanager.projects.locations.secrets.versions.access` | "This call returns the secret data." |
| `apigee.organizations.developers.apps.keys.get`, `apigee.organizations.appgroups.apps.keys.get` | the consumer key "and secret value" |
| `integrations.projects.locations.authConfigs.get`, `integrations.projects.locations.products.authConfigs.get` | "the decrypted auth config" |
| `analyticsadmin.properties.dataStreams.measurementProtocolSecrets.get` | the Measurement Protocol API secret (`secretValue`) |
| `androidenterprise.enterprises.getServiceAccount` | a service account with private key data; each call makes new credentials |
| `androidmanagement.enterprises.enrollmentTokens.get`, `androidmanagement.enterprises.migrationTokens.get` | the token value (and the enrollment QR code) |
| `identitytoolkit.relyingparty.getOobConfirmationCode` | an out-of-band code for a password reset or email change |
| `directory.verificationCodes.list` | a user's current 2-Step Verification backup codes |
| `redis.projects.locations.instances.getAuthString` | the Redis AUTH string |
| `compute.interconnects.getMacsecConfig` | the MACsec pre-shared keys (CAK and CKN) |
| `aiplatform.vertexExpress.retrieveExpressProject` | the Vertex AI Express mode API key |
| `parametermanager.projects.locations.parameters.versions.render`, `parametermanager.projects.locations.templates.versions.render` | the payload with Secret Manager references replaced by their values |

**Reads that return a credential among other fields keep working, without it.** In the result of a read, each listed credential field is replaced by a short text, such as `[redacted: stream key]`. When a write returns the value, the text names it: `[redacted: Measurement Protocol secret; to see it, call analyticsadmin.properties.dataStreams.measurementProtocolSecrets.get, which asks first]`. The list is in `src/core/credential-fields.ts`, one entry per Discovery schema property. The result is walked along the method's response schema, so every method that returns that schema is covered, in a per-method tool and through `api_call` alike. A write or delete is not changed: you approved it, and its result is how you see the value.

| API | Field (schema) | Seen in |
|---|---|---|
| YouTube | `streamName` (`IngestionInfo`), the stream key | `liveStreams.list` |
| Identity Toolkit | `passwordHash`, `salt` (`UserInfo`, `GoogleCloudIdentitytoolkitV1UserInfo`); `secret` (`IdpConfig`); `signerKey` (`GoogleCloudIdentitytoolkitAdminV2HashConfig`) | account lookups, `batchGet`, `query`, `getAccountInfo`, `downloadAccount`; project config |
| Google Analytics | `secretValue` (Measurement Protocol secret) | `measurementProtocolSecrets.list`, change history search |
| Application Integration | `decryptedCredential` (auth config); `encryptedPrivateKey`, `passphrase` (client certificate) | `authConfigs.list`, `certificates.get` and `list` |
| Android Management | `value`, `qrCode` (enrollment token); `value` (migration token); `signinEnrollmentToken`, `qrCode` (sign-in details) | token lists, `enterprises.get` |
| Integration Connectors | `secretValue` (`EUASecret`) | end-user authentications |
| Customer Engagement Suite | `pin` (WhatsApp two-step verification) | deployments |
| Campaign Manager 360 | `value` (third-party authentication token) | Floodlight configurations |
| Dialogflow | `callCompanionAuthCode` | `analyzeContent` replies |
| Sensitive Data Protection | `key` (unwrapped crypto key) | de-identify templates, jobs |
| Eventarc | `activationToken` | channels |
| NetApp Volumes | `passphrase` (cluster peering) | volumes, replications |
| Drive | `jwt` (client-side encryption key access) | files, changes |
| Google Ads, Search Ads 360 | `googleSecret` (lead form webhook), `httpAuthorizationToken` (Business Profile location set) | GAQL search, `searchStream` |
| Monitoring, Merchant API, Discovery Engine, Cloud Billing | stored passwords and push notification tokens: `password` (uptime check basic auth, fetch settings, AlloyDB connection), `token` and `credentials` (A2A push notifications) | their gets and lists |

Not listed, after review: fields Google documents as input only or never returned (the Admin SDK user `password`, Gmail's SMTP password, App Check secrets), references to a secret (a Secret Manager version name), hashes and fingerprints, values encrypted with a key the suite cannot use, values that are public by design (Firebase web API keys, DNS verification tokens, the `gtm_auth` code in a container snippet, meeting PINs shown to every invitee), and one-time authorization codes already exchanged at setup. `api_call` also keeps its own name list, as before: any field named like `password`, `secret`, `clientSecret`, `token`, `apiKey`, `credentials` or `privateKey` comes back as `[redacted]`, in reads and writes alike. So an Apigee app's whole `credentials` array was already hidden there.

`tests/credential-reveals.test.mjs` holds this as a contract. It walks every Discovery snapshot from each read method's response schema: a credential-like field that is neither listed, nor a write, nor reviewed as not a credential fails the test. It also scans the catalog for reads whose method id names a credential. A new one after a Discovery refresh fails until it has a decision.

### Annotation hints

Since 1.24.3 every tool lists the four MCP annotation hints. They are hints for the client: the gate and the hook decide from the kind only.

- `readOnlyHint` is true for a read. `destructiveHint` is true for a destructive tool and for a tool decided per call (`api_call`, the Google Ads mutate tools), as before.
- `idempotentHint` (a second identical call has no further effect) is true for every read. For a generated tool that is not a read, it follows the HTTP verb: `GET`, `PUT` and `DELETE` yes, `POST` and `PATCH` no. A hand-written tool says it only when it calls one `PUT`, `DELETE` or `GET` method, or when the Google MCP tool it matches is marked idempotent (the Gmail label tools, the Chat read-state tools, the Calendar update and respond tools). Every other change is marked not idempotent.
- `openWorldHint` is true for every tool that calls a Google API. It is false for `api_methods` and `api_search` (they read the plugin's own data), `auth_status`, `accounts_list`, `account_set_default`, `auth_setup_client`, `auth_setup_admin` and `auth_setup_service_account` (they read or change this machine's sign-in only). `health` (with `live: true`), `auth_login` and `account_remove` contact Google's sign-in service, so they are true.

### Destructive tools and Claude Code's permission prompt

Since 1.38.0, a destructive tool (its kind in the tool map is `destructive`) carries `_meta["anthropic/requiresUserInteraction"]: true` in its `tools/list` entry when this server's gate would ask before it: the confirmation setting is `every-change` or `destructive-only`, and no policy rule allows or denies the tool. With confirmation `off`, or a policy rule that allows the tool, it carries nothing, so nothing new asks. The setting and the policy file are read when the server starts, and again when it registers tools after a sign-in; restart the server after you change them.

What Claude Code does with it (https://code.claude.com/docs/en/mcp, "Require approval for a specific tool"): "Claude Code shows that tool's permission prompt on every call, even in `acceptEdits`, `auto`, and `bypassPermissions` permission modes, and doesn't offer a "don't ask again" option for it. Allow rules that match the tool don't skip the prompt either. In `dontAsk` mode, which never prompts, Claude Code denies the call instead." A hook cannot skip it either: "a hook can't skip its approval prompt with "allow"" (https://code.claude.com/docs/en/hooks). Other clients ignore the field, and the gate and the hook decide exactly as before.

Why: the plugin's hook is the first prompt, and Claude Code can pass over it. A hook that times out or fails "doesn't block the tool call ... The call continues through the normal permission flow, so don't count on a stalled hook to act as a gate" (hooks reference). `bypassPermissions` "Skips permission prompts, except for the actions no mode auto-approves", a list that names "MCP tools marked `requiresUserInteraction`" and not a hook's prompt (https://code.claude.com/docs/en/permission-modes). The server's form is the second prompt, and an `Elicitation` hook can answer it without showing it ("To auto-respond to elicitation requests without showing a dialog, use the Elicitation hook", mcp page).

Prompts for one call of a destructive tool, in an interactive session, with writes allowed and confirmation `every-change` or `destructive-only`. This table is worked out from the documentation quoted above; it was not measured in a live session.

| Case | Before 1.38.0 | Since 1.38.0 |
|---|---|---|
| Manual (default), `acceptEdits` or `auto` mode; the hook answers | 2: the hook's permission prompt, then the form | 2: the same permission prompt (the hook's `ask` and the marker lead to one prompt), then the form |
| `bypassPermissions` | 1: the form (the hook's prompt is skipped) | 2: the permission prompt, then the form |
| The hook times out or fails, and an allow rule or the mode would approve | 1: the form | 2: the permission prompt, then the form |
| An `Elicitation` hook answers the form | 1 (Manual) or 0 (bypass) | 1: the permission prompt |
| `dontAsk` mode | denied | denied |
| Non-interactive (`-p`) | refused: no one can answer, and the form cannot be shown | refused |
| Confirmation `off`, or a policy rule allows the tool | nothing from the suite | nothing from the suite (no marker) |

Reads, writes, the gateway's `api_call`, the Google Ads mutate tools and the runtime tools carry no marker. A write whose arguments make one call destructive (`destructiveWhen`, such as a Calendar change that emails guests) keeps its tool-level kind, so it carries none.

## What Google enforces regardless of this plugin

- Scope checks on every API call. A token without a write scope gets a 403 on writes.
- Restricted scopes (most Gmail and Drive scopes) need Google's verification for public apps.
- Service account key creation is blocked by default in organisations created on or after 2024-05-03.

## Known limits

- **Testing apps lose refresh tokens after 7 days.** An app left in Testing in the OAuth consent screen expires its refresh tokens after 7 days. The error says so, and `gsm status --check` reports the login as expired. Publish the app, or log in again each week.
- **Automation keys have no expiry.** A saved API key (`apikey.json`) keeps working until it is deleted or restricted in Google Cloud console. `gsm status` shows its age, and warns after 90 days. Restrict it to the APIs it needs, and to your servers or addresses. `gsm status --check` reads the restrictions with your cloud login and warns when the key is unrestricted.
- **Read-named POST methods that may run work.** A `POST` method is classed as a read by its name prefix (see Method classification). Some of these names may hide work. They are classed as reads, so they do not ask. Examples from the build's catalogue, found by a name scan. The scan does not prove what each method does (a credential word in the name makes a `POST` a write, so `fetchReadWriteToken` and `getSyncAuthorization` ask):
  - `gcloud`: `gkehub.projects.locations.memberships.validateCreate`. Its name includes `Create`.
  - `gai`: `aiplatform.evaluateDataset` and `aiplatform.projects.locations.evaluateDataset`. The `evaluate` prefix is a read prefix, but the method may start an evaluation job.

- **Credential reveals and settings.** The credential reveals ask because they are writes (see Credential reveals above). With `confirmation` set to `destructive-only` or `off`, or with a policy `allow` rule for them, a write runs without a question, and so does a reveal. Hand-written tools are not walked by the credential list: `androidmgmt_get_enterprise` (gplay) returns an enterprise's sign-in details as Google sends them, and `ads_search` (gads) returns the GAQL rows a query selects, including a lead form webhook secret if the query asks for it. Some listed fields may never be returned by Google; for those the redaction changes nothing.

  Until this is fixed in the code, you can close the gap yourself. Add an `ask` rule for these method ids in `policy.json`. The hook applies policy rules to reads too. See [USING.md](USING.md#5-the-policy-file).

- **The destructive rule is applied by method id.** Only the methods listed in [The destructive rule](#the-destructive-rule) were raised in 1.26.3. Methods the rule may also cover keep their kind until they are decided, for example: other sharing calls (Cloud Storage access controls, `vault.matters.addPermissions`, Chat and Classroom member adds, Analytics access bindings), body-dependent sends and publishes (Calendar event methods with `sendUpdates`, Classroom posts created as published, Gmail filters that forward, YouTube comment replies), deployments (Apps Script, Cloud Run, Firebase Hosting and Rules releases), more money moves (reseller plan changes), BigQuery `jobs.query` with DML or DDL, and IAM role changes (`iam.*.roles.*`). Add an `ask` rule in `policy.json` for any of them that you want asked under `destructive-only`.

- **Unscoped methods.** About 54 write and delete methods declare no OAuth scope in their discovery documents. They are listed without a login. They are still gated per call. Google still rejects them without a write scope. This figure is from an earlier review and was not re-checked for this version of the page.

- **Hook and elicitation behaviour.** The hook and the form are taken from Claude Code's documentation. They have not been exercised in a live session yet. In particular, how Claude Code shows the **Approve this action?** form is not verified.

- **Saved "don't ask again" rules.** Claude Code can save an allow rule when you choose "don't ask again". It is **UNVERIFIED** whether such a rule also stops the suite's hook prompt for a change. Until it is tested, do not use that choice for write or delete tools. Destructive tools that carry the `requiresUserInteraction` marker (1.38.0) are not offered that choice, and an allow rule does not skip their prompt (Claude Code's documentation; Claude Code 2.1.246 fixed the option still being shown for such tools).

- **Policy `allow` rules.** An `allow` rule skips the default question. Match narrowly. A rule for a whole product, such as `mcp__plugin_gcloud_gcloud__*` with `allow`, also skips the prompt for every gcloud change and delete.

- **Windows file modes.** Mode 0600 is not enforced on Windows, so the token folder's access list is limited instead (see Controls, item 7). `gsm doctor` fails when another account can read that folder. Other products that run on the same machine as your user account still can read files under your profile; the access list does not stop them.

- **Confirmation off.** Only deny rules protect you then. Use `off` only for accounts you fully control.

- **Calls raised by their arguments.** A hand-written write that is destructive only with some arguments (a Calendar call that emails guests, a published Classroom announcement, a Cloud Storage overwrite) stays a write in the plugin's tool map, and the hook decides from that kind. Under `destructive-only` such a call asks once, in the server's form, not twice.

- **Long content.** Strings in the approval text are cut at 1,500 characters and end with `...`. The arguments are cut at 2,000 characters, and the text says how many characters were left out.

- **Untrusted content.** Mail, documents and files can contain instructions aimed at the agent. The approval text shows the real action, so read it before you approve.

- **Audit log.** It is plain text in the token directory. It is not tamper-evident. A declined prompt in Claude Code writes no line, because the call never reaches the server.

- **Other clients.** A client with neither hooks nor elicitation cannot run modifying or destructive tools. That is the intended fail-closed behaviour. Codex, OpenCode and Antigravity have no hook in this suite. Their approval behaviour is **UNVERIFIED** in a live session.

- **Install flag for Claude Code.** `npx google-services-mcps install --agent claude --allow-writes` does not set the plugin's write option, although its summary line says `writes: enabled`. Set **Allow write tools** in the plugin options instead.

- **One login per group.** A login merges with the scopes the same account already holds for its group, so a login from one product's folder keeps the scopes of the other products. Name the account with `--account <email>` (in the chat: `auth_login` with `account`): only that account's stored scopes are merged, and only the ones a server of the group uses, so a scope from another group (a Cloud scope in a Gmail token, say) is not requested again. Without `--account`, nothing is merged, and a login that would take scopes away from an account already signed in saves nothing and says how to retry. The login does not ask Google for the scopes granted earlier (no `include_granted_scopes`). Use `--replace` to drop the stored scopes and keep only what this login requests. A merge can leave write scopes from an earlier readwrite login in place: when you want a readonly token again, log in with `--replace`. See [INSTALL.md](INSTALL.md#two-command-lines).

- **Install paths.** Codex, OpenCode and Antigravity point to the server files inside the checkout. Moving the checkout breaks them until you install again.

## Reporting

This repository is public. To report a security problem, open a GitHub issue that does not include secrets, or contact the owner privately through GitHub. Never paste tokens, keys or client secret files into an issue.
