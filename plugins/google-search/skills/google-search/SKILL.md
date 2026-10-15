---
name: google-search
description: Work with Google Search tooling through the google-search plugin MCP server (gsc): Search Console sites, sitemaps, search analytics, URL inspection, plus Custom Search, site verification and the Indexing API. Use for SEO checks, sitemap submission, index status and search performance questions.
---

# Google Search via MCP

## Server in this plugin

`gsc` covers:
- **Search Console (curated):** `sc_sites_list`, `sc_site_get`, `sc_sitemaps_list`, `sc_sitemap_get`, `sc_search_analytics_query`, `sc_url_inspect`. Write tools `sc_site_add` and `sc_sitemap_submit` appear only when writes are on. `sc_site_delete` and `sc_sitemap_delete` need confirm.
- **Generated:** Custom Search, Site Verification, and the Indexing API. Use the `api_methods` tools to list them.

## One-time setup

1. In Google Cloud console, enable the **Search Console API** and, if you use them, the Custom Search and Site Verification APIs.
2. Create an OAuth client of type **Desktop app** and save it:
   `node <plugin>/bin/gsm.mjs setup-client <client_secret.json>`
3. Log in with the account that is an owner or user of the Search Console property:
   `node <plugin>/bin/gsm.mjs login searchconsole`
4. Check with `node <plugin>/bin/gsm.mjs status`.

Property strings must match what Search Console shows exactly: `https://example.com/` for a URL-prefix property, or `sc-domain:example.com` for a domain property.

## Safety rules

- Read tools are always available. Writes (add site, submit sitemap) need **Allow write tools**.
- Deleting a site or sitemap needs confirm after a preview. Deleting a sitemap removes it from Search Console only, not from the site.
- **Indexing API:** Google allows it only for JobPosting and livestream (BroadcastEvent in VideoObject) pages. Do not use it to request indexing of ordinary pages. It is not a general "index this URL" tool, and Google can refuse or ignore those requests.
- `sc_url_inspect` reads index status. It does not request indexing, because the URL Inspection API is read-only.

## Typical flows

- **Check whether a page is indexed:** `sc_url_inspect` with the page URL. Report the coverage state and last crawl.
- **Find top queries:** `sc_search_analytics_query` with `dimensions: ["query"]`, a date range, and a row limit. Keep the range short for a first look.
- **Submit a new sitemap:** `sc_sitemaps_list` to see what exists, then `sc_sitemap_submit` (write).
