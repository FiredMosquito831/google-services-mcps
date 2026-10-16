# Search Console (`gsc`)

Install with the simplest command: `node gsm.mjs install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Google Search Console for the sites you verify. It lists and adds properties, queries search analytics, inspects URLs and manages sitemaps. It also covers the Indexing API and the Site Verification API.

## When to install it

- You review queries, clicks, impressions and positions for a site.
- You check why a URL is or is not indexed.
- You submit, list or delete sitemaps.
- Wrong choice: you need page speed or Core Web Vitals. Use `gsearch`. For site traffic from Google Analytics, use `ganalytics`.

## Install and set up

```
claude plugin install gsc@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-client <client_secret.json>
node <plugin>/bin/gsm.mjs login searchconsole --profile readonly
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gsc`).

1. In a Google Cloud project, enable the Search Console API.
2. Set up the OAuth consent screen and create an OAuth client ID of type Desktop app. Download the JSON file.
3. Run `setup-client`, then `login searchconsole`. Restart the MCP server (`/mcp`) after login.

Prerequisite: a Search Console property that the signed-in Google account can access. Start with `--profile readonly`. Submitting or adding a property needs a `readwrite` login and the plugin option `allow_writes`.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Sites and search data | `sc_sites_list`, `sc_site_get`, `sc_search_analytics_query` | read | List properties, read one, query clicks, impressions and positions |
| URLs | `sc_url_inspect` | read | Inspect the index status of one URL |
| Sitemaps | `sc_sitemaps_list`, `sc_sitemap_get` | read | List and read sitemaps |
| | `sc_sitemap_submit` | write | Submit a sitemap |
| | `sc_site_add` | write | Add a property |
| | `sc_sitemap_delete` | destructive | Delete a sitemap |
| | `sc_site_delete` | destructive | Remove a property from your account |
| Per-method (20) | | mixed | Search Console API, Site Verification API (7 methods), Web Search Indexing API (2 methods) |
| Gateway | none | | This plugin registers no gateway tools. Every API it covers is a per-method tool. |

The full list is in `docs/capabilities/gsc.md`.

## Example requests

- "Which queries brought the most clicks to example.com last month?" Claude runs `sc_search_analytics_query`. No prompt.
- "Why is /pricing not indexed?" Claude runs `sc_url_inspect`. No prompt.
- "List the sitemaps for example.com and tell me which ones have errors." Claude runs `sc_sitemaps_list`, then `sc_sitemap_get`.
- "Submit https://example.com/sitemap.xml." Claude runs `sc_sitemap_submit`. It asks first.
- "Remove the old staging property." Claude runs `sc_site_delete`. It asks twice.

## Safety

- Reads never ask. Submit and add ask first. Delete and remove ask twice.
- Removing a property takes it out of your Search Console account.
- The `confirmation` option defaults to `every-change`. Change it with `printf '%s' '{"confirmation":"destructive-only"}' | claude plugin configure gsc@google-services-mcps --values-stdin` (JSON on stdin), or `/plugin configure gsc@google-services-mcps` in Claude Code.

## Costs and limits

The Search Console API has no stated fee (UNVERIFIED), and the Indexing API is free. Search Analytics allows 1,200 queries per minute per site, and URL Inspection allows 2,000 per site per day. The Indexing API allows 200 publish requests per day per project, and a separate approval form raises it. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/workspace-cloud-search-ai.md`, section 12.

## Caveats

- The Indexing API applies only to pages with JobPosting or BroadcastEvent markup. Do not use it for other pages.
- Site Verification works only for the authenticated user.
- The HTTP status for a Search Console "quota exceeded" error is UNVERIFIED.
- Only the listed methods are available. Check `docs/capabilities/gsc.md` before you rely on another Search Console feature.
