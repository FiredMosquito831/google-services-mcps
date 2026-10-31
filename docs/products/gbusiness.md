# Business Profile (`gbusiness`)

Install with the simplest command: `npx google-services-mcps install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Google Business Profile accounts, locations, admins, verifications, lodging, place actions, notifications and performance metrics. It reads and edits the public listing of a business you manage. It has 52 tools and no gateway. Reviews and local posts are not covered.

## When to install it

- You read or update your business locations: hours, categories and attributes.
- You read performance metrics for a location.
- You manage location owners or start a verification.
- Wrong choice: you need reviews or local posts. This plugin does not cover them. Or you have no verified listing yet.

## Install and set up

```
claude plugin install gbusiness@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-client <client_secret.json>
node <plugin>/bin/gsm.mjs login business --profile readwrite
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gbusiness`).

1. You need a verified, active Business Profile listing that has been live for 60 or more days, and a website for the business.
2. In a Google Cloud project, enable the Business Profile APIs. Request Basic API Access through the Business Profile API contact form. A project with a quota of 0 has not been approved. Do not ask for an increase while the quota is 0.
3. Set up the OAuth consent screen. Create an OAuth client ID of type Desktop app, download the JSON file, then run `setup-client` and `login business`. Restart the MCP server (`/mcp`) after login.

The email on the request must be an owner or manager of the listing, and the website domain must match that email domain.

Every Business Profile API uses one OAuth scope, `business.manage`, which has no read-only form. Google's Discovery documents for these APIs list no scope, so the suite declares it in `config/products.json` (`scopeOverrides`, since 1.24.1): a `readwrite` login asks for it, and the tools register only once the login holds it. A `readonly` login covers no gbusiness tool, reads included. Edits also need the plugin option `allow_writes`. Before 1.24.1 the tools registered without a login and no profile asked for the scope, so calls failed unless the login held it for another reason.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Accounts and admins | list, get, invitations list | read | Read accounts, admins and invitations |
| | create, patch, accept or decline invitation, admins create and patch | write | Create or change accounts and admins |
| | admin delete | destructive | Remove an admin |
| Locations | get, list, search, Google location lookup | read | Read and search locations |
| | create, update attributes, transfer | write | Create or change a location's details |
| | location delete | destructive | Delete a location |
| Verifications | verification status, list, fetch | read | Check verification status |
| | verify, generate verification | write | Start or complete verification |
| Lodging, place actions, notifications | lodging get, update; place action links | read, write | Read and change lodging and place actions |
| | place action link delete | destructive | Remove a place action link |
| Performance (3) | daily metrics, search impressions, monthly metrics | read | Read location performance |
| Per-method (51) | | mixed | Account Management (16), Business Information (15), Verifications (6), Place Actions (6), Lodging (3), Notifications (2), Performance (3) |
| Gateway | none | | No gateway tools |

The full list is in `docs/capabilities/gbusiness.md`.

Google has no official MCP server for Business Profile. With the plugin option `toolset: google`, the server lists a small set chosen here: accounts, locations list and get, daily metrics, search keyword impressions, verifications and a location update, plus `health` and the sign-in tools. They declare `business.manage`, as in the `all` toolset (since 1.24.1), so they need a `readwrite` login too.

A `readonly` login covers no gbusiness tool, with any toolset. Since 1.32.0 the login, `gsm scopes` and `auth_login` say so in a `Not covered:` line before the browser opens, and the plugin's skill names `--profile readwrite`.

## Example requests

- "Show the hours and categories for our Denver location." Claude runs a location read. No prompt.
- "How many calls and direction requests did Denver get last month?" Claude runs the performance read. No prompt.
- "Change the primary category of Denver to Coffee shop." Claude runs a location update tool. It asks first. The change is public.
- "Remove Ana as an admin of the Denver location." Claude runs the admin delete tool. It asks twice.

## Safety

- Listing edits are public. They change what customers see on Google.
- Business Information edits are limited to 10 per minute per profile, and that limit cannot be raised.
- Deletes of locations and admins ask twice, and since 1.26.3 so do admin invitations, admin role changes and location transfers.
- The `confirmation` option defaults to `every-change`. Change it with `printf '%s' '{"confirmation":"destructive-only"}' | claude plugin configure gbusiness@google-services-mcps --values-stdin` (JSON on stdin), or `/plugin configure gbusiness@google-services-mcps` in Claude Code.

## Costs and limits

The fee is UNVERIFIED. Most APIs allow 300 requests per minute, and Update Location allows 10,000 per day. Google may deny an increase when usage is spiky or well below the limit. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/ads-business-youtube-play.md`, section 3.

## Caveats

- Reviews and local posts are not in this plugin. The Business Profile Q&A API appears retired and is not in the catalog.
- Review time for access is UNVERIFIED. Third-party sources give different answers.
- Error codes at the limit are UNVERIFIED.
- Verification changes are real actions on a live listing. Check the location first.
