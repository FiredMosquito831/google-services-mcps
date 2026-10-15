# Firebase (`gfirebase`)

Firebase management, App Check, App Distribution, App Hosting, Crashlytics, Hosting, Data Connect, Rules, Cloud Messaging (FCM), Test Lab and Identity Toolkit. It manages Firebase projects and apps, sends push messages, distributes builds and runs device tests. It has 301 tools.

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

## Example requests

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
- The `confirmation` option defaults to `every-change`. Change it with `claude plugin configure gfirebase`.

## Costs and limits

Spark has no cost and needs no payment method. Blaze is usage-based, keeps the Spark allowances, and gives new users US$300 of credit. FCM allows 600,000 messages per minute per project. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/ads-business-youtube-play.md`, section 9.

## Caveats

- What happens on Spark when an allowance runs out is UNVERIFIED.
- Crashlytics data retention and the App Distribution upload quota are UNVERIFIED.
- Whether a topic send counts once or once per device against the FCM quota is UNVERIFIED.
- Data Connect on Spark is a three-month trial. The instance is archived if the project does not upgrade.
