# Google Play (`gplay`)

Install with the simplest command: `npx google-services-mcps install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Google Play developer publishing and reporting, Play Games Services, Android Enterprise and Management, Play Integrity and device APIs. It has 353 tools. The gateway adds Android Management, Google Wallet and Chrome Web Store.

## When to install it

- You read tracks, releases, reviews and reports for your app.
- You change store listings, testing tracks or releases.
- You configure Play Games Services or manage Android Enterprise devices.
- Wrong choice: you have no Play Console developer account. Android Management is only for commercial EMM developers, OEMs and Device Trust providers with customer agreements.

## Install and set up

```
claude plugin install gplay@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-service-account --key-file <service account key.json>
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gplay`). gplay is in the service-account group: it uses a service account key, not a login.

1. Create a Google Play Console developer account. Registration costs US$25, once. Personal accounts have extra testing and device checks.
2. In a Google Cloud project, enable the Google Play Developer API (and the other APIs you use), create a service account and a JSON key, and add the service account's email in Play Console under Users and permissions with the rights you need.
3. Run `setup-service-account` with the key file (or call `auth_setup_service_account` in the chat). Restart the MCP server (`/mcp`).

The key asks for the scopes of every API gplay carries (since 1.23.1; before, only `androidpublisher`), and gplay asks only for those: Merchant Center's `content` is gmerchant's alone (since 1.24.4). Each product still decides whether the service account may act: Android Management, Android Enterprise, Chrome Web Store, Wallet, Home Graph and Smart Device Management each need the account set up on their side first. See [SETUP.md](../SETUP.md#google-play-and-merchant-center-gplay-gmerchant). Changes need the plugin option `allow_writes`.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Android Management (hand-written) | `androidmgmt_list_enterprises`, `androidmgmt_get_enterprise`, `androidmgmt_get_application`, `androidmgmt_list_devices`, `androidmgmt_get_device`, `androidmgmt_list_policies`, `androidmgmt_get_policy`, `androidmgmt_list_web_apps`, `androidmgmt_get_web_app` | read | Read the enterprises your project manages, their devices, policies, apps and web apps |
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

The nine hand-written tools match the tools of Google's Android Device Management MCP server (https://androidmanagement.googleapis.com/mcp). The Android Management API is a gateway API here (its per-method tools would take gplay past the 350 generated tools a server may have), so these call it directly with the service account key; the account must belong to the Google Cloud project that manages the enterprise. With the plugin option `toolset: google`, the server lists these nine and a small Play publishing set chosen here (Google has no official MCP server for Play publishing): reviews list and reply (the reply is public and asks first), a track's releases, an edit's tracks, a subscription purchase, the subscription products and an order. 16 tools, with `health` and the setup tools.

## Example requests

- "Which devices of enterprise LC0123abcd are not compliant?" Claude runs `androidmgmt_list_devices`. No prompt.

- "Show the crash rate for my app this month." Claude runs a Reporting read. No prompt.
- "List my release tracks and the version on each." Claude runs the tracks list. No prompt.
- "Commit my staged edit to the production track." Claude runs `androidpub_edits_commit`. It asks first, and the change publishes.
- "Reply to Kim's one-star review." Claude runs the review reply tool. It asks first, and the reply is public.
- "Revoke a device's access to the enterprise account." Claude runs the revoke tool. It asks twice.

## Safety

- Committing an edit publishes store changes. It is classed write, so Claude asks once. Check the track and the edit before you approve.
- Review replies are public.
- Android Enterprise deletes and device access revocation are destructive.
- The `confirmation` option defaults to `every-change`. Change it with `printf '%s' '{"confirmation":"destructive-only"}' | claude plugin configure gplay@google-services-mcps --values-stdin` (JSON on stdin), or `/plugin configure gplay@google-services-mcps` in Claude Code.

## Costs and limits

Registering a Play Console developer account costs US$25, once. The API fee is UNVERIFIED. Publishing calls use per-minute buckets of 3,000 queries each, and the Reporting API allows 10 queries per second. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/ads-business-youtube-play.md`, section 8.

## Caveats

- Android Management access is requested through a form. It is for commercial EMM developers only.
- Per-day and per-project publishing limits, and the error code at the limit, are UNVERIFIED.
- The Reporting API page was last updated in 2023, so its figure may be out of date.
- Play Games daily quota values are UNVERIFIED. Check them in the Google Cloud console.
