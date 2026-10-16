# Ads and Publisher (`gads`)

Install with the simplest command: `node gsm.mjs install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Google Ads API, with accounts, campaigns, ad groups, ads, keywords, budgets, conversions, assets and GAQL reporting. It also covers Search Ads 360, Display & Video 360, Campaign Manager 360, Ad Exchange Buyer, Real-time Bidding, AdSense, AdMob and more through the gateway. It has 330 tools.

## When to install it

- You report on Google Ads performance with GAQL queries.
- You change campaigns, ad groups, keywords or budgets in an account you manage.
- You read AdSense or AdMob earnings, or Display & Video 360 setup.
- Wrong choice: you have no Google Ads, DV360, AdSense or AdMob account to work on.

## Install and set up

```
claude plugin install gads@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-client <client_secret.json>
node <plugin>/bin/gsm.mjs login business --profile readonly
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gads`).

1. In a Google Cloud project, enable the Google Ads API. Enable the other ad APIs you use.
2. Set up the OAuth consent screen. Use Internal for a Workspace domain. Create an OAuth client ID of type Desktop app and download the JSON file.
3. Run `setup-client`, then `login business`. Restart the MCP server (`/mcp`) after login.

Access comes from the Cloud project of the OAuth client. The project needs a Google Ads API access level: Test, Explorer, Basic or Standard. A developer token is optional. The suite sends the header only if you set one. Start with `--profile readonly`. Changes need a `readwrite` login and the plugin option `allow_writes`.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Accounts (hand-written) | `ads_list_customers` | read | List the Google Ads accounts the user can reach |
| Reporting (hand-written) | `ads_search` | read | Run a read-only GAQL query. It accepts SELECT only. |
| Changes (hand-written) | `ads_mutate` | dynamic | Change Google Ads resources. A validate-only check asks nothing. A removal is destructive. Any other change is a write. |
| Per-method (323) | | mixed | Google Ads API (175 methods), Search Ads 360 (161), Display & Video 360 (179), AdMob, Bid Manager |
| Gateway (25 APIs) | `api_search`, `api_describe`, `api_call` | read, read, dynamic | AdSense, Ad Exchange Buyer II, Campaign Manager 360, Real-time Bidding, Authorized Buyers, Data Manager and others |

The full list is in `docs/capabilities/gads.md`.

## Example requests

- "Which campaigns spent the most last month?" Claude runs `ads_search` with a GAQL SELECT. No prompt.
- "List the Google Ads accounts I can use." Claude runs `ads_list_customers`. No prompt.
- "Check whether this budget change would work." Claude runs `ads_mutate` with validate-only set. It asks nothing, and nothing changes.
- "Raise the daily budget of Brand Search to 50 USD." Claude runs `ads_mutate`. It asks first. The change is live on the account.
- "Remove the negative keyword list from the campaign." Claude runs `ads_mutate`. It asks twice.

## Safety

- `ads_mutate` can change live campaigns. Validate first, then approve the real change.
- `ads_search` cannot change data. It rejects anything but SELECT.
- Reads never ask. Writes ask first. Removals ask twice.
- The gateway reaches APIs that have no per-method tool. Check each call with `api_describe`.
- The `confirmation` option defaults to `every-change`. Change it with `printf '%s' '{"confirmation":"destructive-only"}' | claude plugin configure gads@google-services-mcps --values-stdin` (JSON on stdin), or `/plugin configure gads@google-services-mcps` in Claude Code.

## Costs and limits

No cost is stated for the Google Ads access levels, but tools that fail Required Minimum Functionality can incur a fee of US$1,000 to US$25,000 per billing period. Operations per day: 15,000 on Test (test accounts only), 2,880 on Explorer, 15,000 on Basic and unlimited on Standard. Basic needs brand verification of the Cloud project, and Standard needs a manual audit. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/ads-business-youtube-play.md`, section 2.

## Caveats

- Explorer does not allow account creation, user management, Keyword Plan, Audience Insights, Reach Plan or billing.
- Whether a validate-only mutate counts against the daily quota, and the per-second rules and reset time, are UNVERIFIED.
- Google sunset developer tokens on 2026-09-09. The access level is what counts now.
- Not every resource has a per-method tool. Use `api_search` for the rest.
