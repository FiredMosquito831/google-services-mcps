# Firebase (`gfirebase`)

Install with the simplest command: `npx google-services-mcps install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Firebase management, App Check, App Distribution, App Hosting, Crashlytics, Hosting, Data Connect, Rules, Cloud Messaging (FCM), Test Lab and Identity Toolkit. It manages Firebase projects and apps, sends push messages, distributes builds and runs device tests. It has 306 tools.

## When to install it

- You list Firebase projects and apps, or add an Android, iOS or web app.
- You send a Cloud Messaging push or manage topic subscriptions.
- You distribute builds to testers, or read crash reports.
- You run tests in Test Lab or deploy Hosting and App Hosting.
- Wrong choice: you have no Firebase project. Firebase Dynamic Links was shut down in 2025 and is not in the catalog.

## Install and set up

```
claude plugin install gfirebase@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-client <client_secret.json>
node <plugin>/bin/gsm.mjs login developer --profile readonly
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gfirebase`).

1. Create or choose a Firebase project. In a Google Cloud project, enable the Firebase Management API and the other Firebase APIs you use.
2. Set up the OAuth consent screen. Create an OAuth client ID of type Desktop app and download the JSON file.
3. Run `setup-client`, then `login developer`. Restart the MCP server (`/mcp`) after login.

Spark, the no-cost plan, covers Crashlytics, App Distribution and FCM. Cloud Functions, Cloud Storage, App Hosting and SMS authentication need Blaze. Start with `--profile readonly`. Changes need a `readwrite` login and the plugin option `allow_writes`.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Firestore (hand-written) | `firestore_get_document`, `firestore_list_documents`, `firestore_query_collection` | read | Read a document, list a collection, or find documents by field conditions; fields as plain JSON |
| Remote Config and Authentication (hand-written) | `remoteconfig_get_template`, `auth_get_users` | read | Read the Remote Config template; read Authentication users by uid, email or phone (no password hashes) |
| Projects and apps (per-method) | list and get projects and apps | read | List projects, apps and configuration |
| | create apps, SHA certificates | write | Add an app or a SHA certificate |
| | remove apps, delete SHA certificates | destructive | Remove an app or a SHA certificate |
| Messaging | `fcm_projects_messages_send` | destructive | Send a push message |
| | topic subscriptions create and delete | write, destructive | Subscribe or unsubscribe devices from topics |
| App Distribution (26 methods) | releases, testers, groups | read, write, destructive | Distribute builds. Cancelling a release is destructive. |
| Hosting | backends, builds, rollouts, hosting releases | read, write | Deploy hosting and backends |
| Test Lab and device runs (55 methods) | test sessions, results, device runs | read, write, destructive | Run tests on devices. Cancel and delete are destructive. |
| Other per-method | App Check (46), Identity Toolkit (20), Crashlytics (11), Rules (11), Data Connect (38), ML, Cloud Storage | mixed | Security, auth, crash data, rules and data schema |
| Gateway (9 APIs) | `api_search`, `api_describe`, `api_call` | read, read, dynamic | App Check v1beta, App Distribution v1alpha, App Hosting v1beta, SQL Connect v1beta, Hosting v1beta1, ML, Identity Toolkit v1 and v2 |

The full list is in `docs/capabilities/gfirebase.md`.

The five hand-written tools match tools of Google's Firebase MCP server (the `firebase mcp` command of firebase-tools, https://github.com/firebase/firebase-tools): `firestore_get_document`, `firestore_list_documents`, `firestore_query_collection`, `remoteconfig_get_template` and `auth_get_users`. Firestore is a gcloud API in this suite and Remote Config is in no API list, so these call the APIs directly. With the plugin option `toolset: google`, the server lists these five and the generated tools that match Google's other Firebase tools that call an API (projects, apps, SDK configs, project and app creation, Android SHA certificates, security rules, App Hosting backends, Crashlytics, Data Connect, Cloud Messaging): 38 tools, with `health` and the sign-in tools. Not in that list: Google's tools that drive the local Firebase CLI (init, deploy, deploy status, environment, the Data Connect build and emulator), the Realtime Database data reads and writes, Remote Config updates, the Storage download URL, App Testing, Cloud Functions logs, and the Authentication user update and SMS region policy (Identity Toolkit, reachable with `api_call` in the `all` and `curated` toolsets). A `readonly` login with that toolset asks for `firebase.readonly`; a `readwrite` login for `cloud-platform`.

## Example requests

- "Show me the user document users/alice in my-app-1234." Claude runs `firestore_get_document`. No prompt.
- "Which orders over 100 are still open?" Claude runs `firestore_query_collection` with two filters and a limit. No prompt.
- "What does the Remote Config template set for welcome_message?" Claude runs `remoteconfig_get_template`. No prompt.
- "Is ana@example.com a user of my app, and is the account disabled?" Claude runs `auth_get_users` with `emails`. No prompt.
- "List my Firebase apps and their app IDs." Claude runs the apps list. No prompt.
- "Show the crash trends for my Android app." Claude runs the Crashlytics reads. No prompt.
- "Send a test push to the beta topic." Claude runs `fcm_projects_messages_send`. It asks twice.
- "Distribute the latest build to the beta testers group." Claude runs the release distribute tool. It asks first.
- "Run tests on two Android devices in Test Lab." Claude creates a device run session. It asks first.

## Safety

- A push message reaches real devices. Sending is destructive, so it asks twice.
- Removing an app, a SHA certificate, or cancelling a test or release is destructive.
- Hosting and App Hosting deploys change a live site or backend. They ask first.
- Rules changes can open or block access to data. Read the preview first.
- The `confirmation` option defaults to `every-change`. Change it with `printf '%s' '{"confirmation":"destructive-only"}' | claude plugin configure gfirebase@google-services-mcps --values-stdin` (JSON on stdin), or `/plugin configure gfirebase@google-services-mcps` in Claude Code.

## Costs and limits

Spark has no cost and needs no payment method. Blaze is usage-based, keeps the Spark allowances, and gives new users US$300 of credit. FCM allows 600,000 messages per minute per project. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/ads-business-youtube-play.md`, section 9.

## Caveats

- What happens on Spark when an allowance runs out is UNVERIFIED.
- Crashlytics data retention and the App Distribution upload quota are UNVERIFIED.
- Whether a topic send counts once or once per device against the FCM quota is UNVERIFIED.
- Data Connect on Spark is a three-month trial. The instance is archived if the project does not upgrade.
