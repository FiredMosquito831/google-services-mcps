# Google Play (`gplay`)

Install with the simplest command: `node gsm.mjs install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Google Play developer publishing and reporting, Play Games Services, Android Enterprise and Management, Play Integrity and device APIs. It has 353 tools. The gateway adds Android Management, Google Wallet and Chrome Web Store.

## When to install it

- You read tracks, releases, reviews and reports for your app.
- You change store listings, testing tracks or releases.
- You configure Play Games Services or manage Android Enterprise devices.
- Wrong choice: you have no Play Console developer account. Android Management is only for commercial EMM developers, OEMs and Device Trust providers with customer agreements.

## Install and set up

```
claude plugin install gplay@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-client <client_secret.json>
node <plugin>/bin/gsm.mjs login developer --profile readonly
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gplay`).

1. Create a Google Play Console developer account. Registration costs US$25, once. Personal accounts have extra testing and device checks.
2. In a Google Cloud project, enable the Google Play Developer API. The sources describe a service account granted rights in Play Console's Users and Permissions page. How the OAuth login maps to those rights is UNVERIFIED.
3. Set up the OAuth consent screen. Create an OAuth client ID of type Desktop app and download the JSON file. Run `setup-client`, then `login developer`. Restart the MCP server (`/mcp`) after login.

Start with `--profile readonly`. Changes need a `readwrite` login and the plugin option `allow_writes`.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Tracks and releases (read) | track and release list and get | read | Read tracks, releases and app details |
| Edits and listings | edits, tracks create, update and patch | write | Stage store changes in an edit and change tracks |
| | `androidpub_edits_commit` | write | Commit an edit, which publishes it |
| Reviews | list, get | read | Read user reviews |
| | reviews reply | write | Reply to a review in public |
| Reporting (25 methods) | Play Developer Reporting | read | Crash, ANR, install and other statistics |
| Games Services (68 methods) | games, management and configuration | read, write, destructive | Read and change Play Games configuration |
| Android Enterprise (77 methods) | devices, users, entitlements, installs, store layouts | read, write, destructive | Manage enterprise devices and apps. Revoking device access and deleting users are destructive. |
| Gateway (7 APIs) | `api_search`, `api_describe`, `api_call` | read, read, dynamic | Android Management (36), Google Wallet (99), Payments reseller subscriptions (14), HomeGraph, Chrome Web Store v1.1, Developer Reporting v1alpha |

The full list is in `docs/capabilities/gplay.md`.

## Example requests

- "Show the crash rate for my app this month." Claude runs a Reporting read. No prompt.
- "List my release tracks and the version on each." Claude runs the tracks list. No prompt.
- "Commit my staged edit to the production track." Claude runs `androidpub_edits_commit`. It asks first, and the change publishes.
- "Reply to Kim's one-star review." Claude runs the review reply tool. It asks first, and the reply is public.
- "Revoke a device's access to the enterprise account." Claude runs the revoke tool. It asks twice.

## Safety

- Committing an edit publishes store changes. It is classed write, so Claude asks once. Check the track and the edit before you approve.
- Review replies are public.
- Android Enterprise deletes and device access revocation are destructive.
- The `confirmation` option defaults to `every-change`. Change it with `claude plugin configure gplay`.

## Costs and limits

Registering a Play Console developer account costs US$25, once. The API fee is UNVERIFIED. Publishing calls use per-minute buckets of 3,000 queries each, and the Reporting API allows 10 queries per second. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/ads-business-youtube-play.md`, section 8.

## Caveats

- Android Management access is requested through a form. It is for commercial EMM developers only.
- Per-day and per-project publishing limits, and the error code at the limit, are UNVERIFIED.
- The Reporting API page was last updated in 2023, so its figure may be out of date.
- Play Games daily quota values are UNVERIFIED. Check them in the Google Cloud console.
