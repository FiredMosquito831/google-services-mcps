---
name: gsearch
description: Public search and web-quality APIs (Custom Search, PageSpeed, CrUX, Safe Browsing, Web Risk, Fact Check) that take an API key instead of OAuth. The Custom Search JSON API is closed to new customers and is scheduled to be discontinued on 2027-01-01. Served by the gsearch MCP server with 60 tools. Use for requests about these Google APIs.
---

# Search and Web Quality

Public search and web-quality APIs (Custom Search, PageSpeed, CrUX, Safe Browsing, Web Risk, Fact Check) that take an API key instead of OAuth. The Custom Search JSON API is closed to new customers and is scheduled to be discontinued on 2027-01-01.

The `gsearch` MCP server exposes 60 tools. Per-method tools cover the Discovery APIs listed below. Gateway APIs are reached through three generic tools: api_search finds a method, api_describe shows its parameters, and api_call runs it.

## Log in

Replace `<plugin>` with this plugin's folder, the one that holds `bin/gsm.mjs`. No sign-in. Store the API key once: `node <plugin>/bin/gsm.mjs setup-apikey`, which reads the key from GSM_API_KEY_INPUT or stdin.

## Safety

Reads never ask for approval. Changes and deletions ask first, unless the user has set the confirmation option to off in the plugin settings. Deny, ask and allow rules in the policy file (policy.json in the token directory) apply on top of this.

## APIs

- Custom Search API (customsearch v1)
- PageSpeed Insights API (pagespeedonline v5)
- Chrome UX Report API (chromeuxreport v1)
- Knowledge Graph Search API (kgsearch v1)
- Safe Browsing API (safebrowsing v5)
- Fact Check Tools API (factchecktools v1alpha1)
- Accelerated Mobile Pages (AMP) URL API (acceleratedmobilepageurl v1)
- Abusive Experience Report API (abusiveexperiencereport v1)
- Ad Experience Report API (adexperiencereport v1)
- Web Fonts Developer API (webfonts v1)
- Web Risk API (webrisk v1)
- Google Civic Information API (civicinfo v2)
- Digital Asset Links API (digitalassetlinks v1)
- versionhistory.googleapis.com API (versionhistory v1)
- Developer Knowledge API (developerknowledge v1)
- Developer Knowledge API (developerknowledge v1alpha), reached through api_search, api_describe and api_call
- Safe Browsing API (safebrowsing v4), reached through api_search, api_describe and api_call
