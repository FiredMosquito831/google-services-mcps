# Merchant Center (`gmerchant`)

Install with the simplest command: `npx google-services-mcps install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Merchant Center accounts through the Merchant API and the Comparison Shopping Service (CSS) API. It reads and changes product data, inventories, promotions, data sources, business information and account settings. With a key set up it lists 153 tools when **Allow write tools** is on and 74 when it is off, and it has no hand-written tools. The 8 Manufacturer Center tools are defined but never load: see "Manufacturer Center" below.

Since 1.35.2 every tool uses a Merchant API version Google serves: the v1 resource APIs and Reviews v1alpha. Google discontinued v1beta in May 2026 ("The Merchant API v1beta version discontinued. All API calls must now be directed to the `v1` or `v1alpha` versions.", [Merchant API latest updates](https://developers.google.com/merchant/api/latest-updates)).

## When to install it

- You review product data issues and disapprovals.
- You change product inputs, inventories, promotions or business information.
- You check Merchant Center account settings and API quota.
- Wrong choice: you have no production Merchant Center account with a verified website. Test accounts cannot register.

## Install and set up

```
claude plugin install gmerchant@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-service-account --key-file <service account key.json>
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gmerchant`). In the chat, `auth_setup_service_account` with the key's full path does the same.

1. Create a production Merchant Center account with a verified website. The identity that registers needs ADMIN access on that account. The developer contact must be a Google account email, not a service account.
2. In a Google Cloud project, enable the Merchant API. Registration is a one-time step per project. The new developer contact must accept the invitation within 14 days.
3. Create a service account in that project and a JSON key for it, and add the service account's email as an Admin user of the Merchant Center account. Run `setup-service-account` (see [SETUP.md](../SETUP.md#google-play-and-merchant-center-gplay-gmerchant)). Restart the MCP server (`/mcp`) afterwards.

gmerchant has no OAuth sign-in and no profile: the key asks for one fixed scope, `content`. Changes need the plugin option `allow_writes`.

**Manufacturer Center.** The 8 Manufacturer Center tools need the `manufacturercenter` scope. The service account key asks only for `content` (`serviceAccountScopes` in `config/products.json`), so these tools never load, whatever the toolset. They are counted in the tool totals, and `docs/capabilities/gmerchant.md` lists them, but they cannot be called.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Hand-written | none | | This plugin has no hand-written tools. |
| Products and inputs | list, get, reviews (Reviews v1alpha), issues | read | Read products, product issues and reviews |
| | product input insert, update | write | Send or change product data |
| | product input and review delete | destructive | Remove product data |
| Inventories and promotions | local and regional inventories, promotions | read, write | Read and change stock and promotions |
| | local and regional inventory delete, regions batch delete | destructive | Remove inventory or regions |
| Accounts and business | business information and identity | read, write | Read and update business details |
| | account, user and label delete | destructive | Remove accounts, users or labels |
| Per-method (154) | | mixed | Merchant API v1 (accounts 76, products 5, inventories 6, data sources 7, promotions 3, conversions 6, issue resolution 4, Local Finance 7, loyalty customers 1, notifications 5, order tracking 1, quota 3, reports 1); Reviews v1alpha (8); CSS API (13); Manufacturer Center (8, never loaded: the key has no `manufacturercenter` scope) |
| Gateway (12 APIs) | `api_search`, `api_describe`, `api_call` | read, read, dynamic | The same 12 v1 Merchant API resource APIs as the per-method tools (all but loyalty customers), so the `curated` toolset reaches them through three tools |

The full list is in `docs/capabilities/gmerchant.md`.

Google's Merchant API MCP server (alpha, https://developers.google.com/merchant/api/guides/agentic-tools/merchant-data-mcp) has 13 tools; each is a generated tool here already. With the plugin option `toolset: google`, the server lists those 13 (accounts, account issues, programs, automatic improvements, products list and get, aggregate product statuses, report search, data sources list, get, create and fetch, the latest file upload), plus `health` and the sign-in tools. The data source create asks first. Google says a data source fetch triggers processing, so since 1.24.2 it is a write here and asks first too.

## Example requests

- "Which products in our feed have issues?" Claude runs the product issue reads. No prompt.
- "Check how many product updates I have left today." Claude runs the quota read. No prompt.
- "Update the phone number in our business information." Claude runs a business information write. It asks first.
- "Insert this product input for SKU 1234." Claude runs a product input insert. It asks first.
- "Delete the label Summer from the account." Claude runs the label delete tool. It asks twice.

## Safety

- Product, inventory, promotion and business information writes change live data in the account.
- Deletes ask twice, and since 1.26.3 so do unregistering the Cloud project and unclaiming the homepage. There are 22 destructive tools.
- The `confirmation` option defaults to `every-change`. Change it with `printf '%s' '{"confirmation":"destructive-only"}' | claude plugin configure gmerchant@google-services-mcps --values-stdin` (JSON on stdin), or `/plugin configure gmerchant@google-services-mcps` in Claude Code.

## Costs and limits

The fee is UNVERIFIED. Quota is tracked per Merchant Center account and per credential, not per Cloud project, and daily limits reset at 12:00 UTC. The default values are UNVERIFIED, so read your real limits with the quota tool. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/ads-business-youtube-play.md`, section 7.

## Caveats

- Per-minute and daily default values are UNVERIFIED. The quota page's sample values are labeled as examples only.
- Merchant Center limits such as too many items or sub-accounts are separate from the API quota.
- Until 1.35.2 the gateway reached the v1beta Merchant API and the Reviews tools called Reviews v1beta; Google discontinued v1beta in May 2026. One v1beta method has no v1 or v1alpha counterpart, `accounts.onlineReturnPolicies.patch`, so it is no longer reachable (create, get, list and delete remain).
- Reviews is v1alpha, the only Reviews version Google lists. Google's directory of Discovery documents does not list it, so its document comes from `https://merchantapi.googleapis.com/$discovery/rest?version=reviews_v1alpha`.
- Quota errors arrive as HTTP 429 with a reason such as `quota/request_rate_too_high` or `quota/daily_limit_exceeded`. The suite retries rate-limit and unavailable responses up to 3 attempts in total, with backoff; after that the error reaches Claude.
