# Google Analytics (`ganalytics`)

Install with the simplest command: `node gsm.mjs install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Google Analytics Admin and Data APIs for GA4 properties: accounts, properties, data streams, conversion events, custom dimensions and metrics, links to Ads and Firebase, and reports. It has 70 tools. The gateway adds the alpha Admin API, with 166 more methods.

## When to install it

- You run GA4 reports from Claude, such as traffic by channel or top landing pages.
- You check or change property setup: data streams, conversion events, custom dimensions.
- You audit links to Google Ads or Firebase.
- Wrong choice: Universal Analytics properties. The Data API is not compatible with them.

## Install and set up

```
claude plugin install ganalytics@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-client <client_secret.json>
node <plugin>/bin/gsm.mjs login business --profile readonly
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/ganalytics`).

1. In a Google Cloud project, enable the Google Analytics Admin API and the Google Analytics Data API.
2. Set up the OAuth consent screen. Use Internal for a Workspace domain. Create an OAuth client ID of type Desktop app and download the JSON file.
3. Run `setup-client`, then `login business`. Restart the MCP server (`/mcp`) after login.

You need a GA4 property ID and an account with access to that property. Start with `--profile readonly`. Changes need a `readwrite` login and the plugin option `allow_writes`. The `business` login is shared with `gtm`, `gyoutube`, `gbusiness`, `gads` and `gmerchant`.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Reports (Data API) | run access report, report calls | read | Run GA4 reports and read the data |
| Accounts and properties (read) | account, property, data stream, conversion event, custom dimension list and get | read | Read the property setup |
| Setup changes (write) | create and patch properties, data streams, conversion events, custom dimensions | write | Change property setup |
| Deletes (destructive) | delete accounts, properties, data streams, conversion events, key events, Firebase and Ads links, Measurement Protocol secrets | destructive | Remove setup items |
| | archive custom dimensions and custom metrics | destructive | Archive a custom dimension or metric |
| Per-method (66) | | mixed | Admin API v1beta (55 methods), Data API v1beta (11 methods) |
| Gateway (1 API) | `api_search`, `api_describe`, `api_call` | read, read, dynamic | Admin API v1alpha (166 methods) |

The full list is in `docs/capabilities/ganalytics.md`.

## Example requests

- "What were my top 10 landing pages last month?" Claude runs a Data API report. No prompt.
- "List my GA4 properties and their data streams." Claude runs the account and property reads. No prompt.
- "Add a conversion event named signup on property 123." Claude runs the conversion event create tool. It asks first.
- "Delete the old test data stream." Claude runs the data stream delete tool. It asks twice.

## Safety

- Reads never ask. Creates and changes ask first. Deletes and archives ask twice.
- Deleting a property or account removes its setup. Check the property ID in the preview.
- Alpha methods in the gateway can change. Check them with `api_describe` first.
- The `confirmation` option defaults to `every-change`. Change it with `claude plugin configure ganalytics`.

## Costs and limits

The cost is UNVERIFIED, because the page does not say. The Data API allows 200,000 core tokens per property per day on Standard properties, and the Admin API allows 1,200 requests per minute. A report's token cost depends on rows, dimensions, metrics and date range. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/ads-business-youtube-play.md`, section 4.

## Caveats

- Whether the 1,200-per-minute Admin figure is per project is UNVERIFIED.
- The error code for a token or concurrency limit is UNVERIFIED.
- Row and size limits for reports are UNVERIFIED.
- Admin API configuration reads and writes count against both the request and write quotas.
