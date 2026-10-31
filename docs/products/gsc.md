# Search Console (`gsc`)

Install with the simplest command: `npx google-services-mcps install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

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
| Sites and search data | `sc_sites_list`, `sc_site_get`, `sc_search_analytics_query` | read | List properties, read one, query clicks, impressions and positions (by date, hour, query, page, country, device or search appearance; typed filters, fresh or hourly data, aggregation by page or property) |
| URLs | `sc_url_inspect` | read | Inspect the index status of one URL (the indexed version; Google cannot test the live URL) |
| Sitemaps | `sc_sitemaps_list`, `sc_sitemap_get` | read | List and read sitemaps |
| | `sc_sitemap_submit` | write | Submit a sitemap |
| | `sc_site_add` | write | Add a property |
| | `sc_sitemap_delete` | destructive | Delete a sitemap |
| | `sc_site_delete` | destructive | Remove a property from your account |
| Per-method (19) | | mixed | Search Console API (10 methods), Site Verification API (7 methods), Web Search Indexing API (2 methods) |
| Gateway | none | | This plugin registers no gateway tools. Every API it covers is a per-method tool. |

The full list is in `docs/capabilities/gsc.md`.

**Search analytics (1.41.0).** `sc_search_analytics_query` takes the options of Google's `searchAnalytics.query` (https://developers.google.com/webmaster-tools/v1/searchanalytics/query): `filters`, a typed list of `{ dimension, operator, expression }` that a row must all pass (dimensions `query`, `page`, `country`, `device`, `searchAppearance`; operators `equals`, `notEquals`, `contains`, `notContains`, `includingRegex`, `excludingRegex`); `data_state` (`final` by default, so the latest days are missing; `all` adds the fresh data still being processed, and the answer's `metadata.first_incomplete_date` says where it starts; `hourly_all` with the `hour` dimension gives hours); and `aggregation_type` (`auto`, `byPage`, `byProperty`, `byNewsShowcasePanel`). `dimension_filter_groups` still passes groups to Google as given. A call without the new arguments sends the same request as before. The generated twins of the curated tools (such as `searchcons_searchanalytics_query`) name the curated tool in their descriptions.

Google has no official MCP server for Search Console (none was found on 2026-10-29). With the plugin option `toolset: google`, the server lists a small set chosen here instead: `sc_sites_list`, `sc_site_get`, `sc_search_analytics_query`, `sc_url_inspect`, `sc_sitemaps_list`, `sc_sitemap_get`, `sc_sitemap_submit` and the two Indexing API tools, plus `health` and the sign-in tools. The deletes, the property add and Site Verification stay in the `all` toolset. A `readonly` login with that toolset asks for `webmasters.readonly`; a `readwrite` login for `webmasters` (no `siteverification`), and `indexing` only with `--with indexing`.

**The Indexing API is an optional part (since 1.34.0).** Google accepts it only for pages with JobPosting or BroadcastEvent markup, and its scope, `indexing` ("Submit data to Google for indexing"), has no read-only form. Until 1.34.0 every `readwrite` login asked for it, also for someone who only submits sitemaps. Now a login leaves it out unless you name it:

```
node <plugin>/bin/gsm.mjs login searchconsole --profile readwrite --with indexing
```

In the chat: `auth_login` with `"with": ["indexing"]`. Without it, the two Indexing API tools do not load, and the login says so in a `Held back:` line. A token that already holds `indexing` keeps it when you sign in again naming the account (`--account <email>`).

## Example requests

- "Which queries brought the most clicks to example.com last month?" Claude runs `sc_search_analytics_query`. No prompt.
- "How did yesterday go, hour by hour, on mobile in France?" Claude runs `sc_search_analytics_query` with `dimensions: ["hour"]`, `data_state: "hourly_all"` and `filters` on device and country. No prompt.
- "Why is /pricing not indexed?" Claude runs `sc_url_inspect`. No prompt.
- "List the sitemaps for example.com and tell me which ones have errors." Claude runs `sc_sitemaps_list`, then `sc_sitemap_get`.
- "Submit https://example.com/sitemap.xml." Claude runs `sc_sitemap_submit`. It asks first.
- "Remove the old staging property." Claude runs `sc_site_delete`. It asks twice.

## Safety

- Reads never ask. Submit and add ask first. Delete and remove ask twice, and since 1.26.3 so does a change to a site's owners (Site Verification update and patch).
- Removing a property takes it out of your Search Console account.
- The `confirmation` option defaults to `every-change`. Change it with `printf '%s' '{"confirmation":"destructive-only"}' | claude plugin configure gsc@google-services-mcps --values-stdin` (JSON on stdin), or `/plugin configure gsc@google-services-mcps` in Claude Code.

## Costs and limits

The Search Console API has no stated fee (UNVERIFIED), and the Indexing API is free. Search Analytics allows 1,200 queries per minute per site, and URL Inspection allows 2,000 per site per day. The Indexing API allows 200 publish requests per day per project, and a separate approval form raises it. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/workspace-cloud-search-ai.md`, section 12.

## Caveats

- The Indexing API applies only to pages with JobPosting or BroadcastEvent markup. Do not use it for other pages.
- Site Verification works only for the authenticated user.
- The HTTP status for a Search Console "quota exceeded" error is UNVERIFIED.
- Only the listed methods are available. Check `docs/capabilities/gsc.md` before you rely on another Search Console feature.
- Google retired the Mobile-Friendly Test tool and API, and the Mobile Usability report, on December 1, 2023 ([Search Central blog](https://developers.google.com/search/blog/2023/04/page-experience-in-search)). Since 1.35.3 there is no tool for the test (it was the generated `searchcons_url_testing_t_mobile_friendl_run`), and URL inspection's `mobileUsabilityResult` is deprecated. Google points to Lighthouse for mobile checks; `gsearch` runs PageSpeed Insights, which uses Lighthouse.
- A sitemap's `indexed` count is deprecated by Google ("Deprecated; do not use.") and can read 0 while its pages are indexed. Read the submitted count, errors and warnings from the sitemap tools, and whether a page is indexed from `sc_url_inspect`.
- `sc_search_analytics_query` sends the search type as `type`, the field Google documents; `searchType` is deprecated ("Deprecated, use type instead"). The argument is still `type`.
- A property string must match Search Console's exactly: a URL-prefix property ends with a slash (`https://example.com/`), a domain property is `sc-domain:example.com`. Since 1.41.0 Google's "does not have sufficient permission for site" error says to check the string with `sc_sites_list`. `sc_url_inspect` compares a page's host with the property's without case.
