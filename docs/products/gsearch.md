# Search and Web Quality (`gsearch`)

Install with the simplest command: `node gsm.mjs install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Public search and web-quality APIs that take an API key instead of a login. It covers Custom Search, PageSpeed Insights, Chrome UX Report, Safe Browsing, Web Risk, Fact Check Tools, Knowledge Graph, Civic Information, Digital Asset Links, Version History and Developer Knowledge. Use it for public data about sites, URLs and facts. It does not read your own accounts.

## When to install it

- You check URLs against Safe Browsing or Web Risk.
- You run PageSpeed Insights or read Chrome UX Report data for a page.
- You look up fact checks, Knowledge Graph entities or civic election information.
- Wrong choice: you need your own Search Console or Analytics data. Those need a login.

## Install and set up

```
claude plugin install gsearch@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-apikey
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gsearch`). There is no login step.

1. In the Google Cloud console, create an API key for the project that will use it.
2. Restrict the key to the APIs you use. The limits file advises this for every key.
3. Run `setup-apikey`. Paste the key when asked, or pipe it in. The key is never printed and never passed on the command line.

There is no scopes profile, because a key is not an OAuth token. The write and destructive tools are hidden unless the plugin option `allow_writes` is on.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Hand-written | none | | This plugin has no hand-written tools. |
| Per-method (47) | | mostly read | Safe Browsing and Web Risk lookups, PageSpeed Insights, Chrome UX Report, Fact Check Tools, Knowledge Graph, Civic Information, Digital Asset Links, Version History, Developer Knowledge |
| Per-method writes | | write | Fact-check page create and update, Digital Asset Links bulk check, Developer Knowledge answer query |
| Per-method deletes | | destructive | Fact-check page delete, Web Risk operation cancel and delete |
| Gateway (2 APIs) | `api_search`, `api_describe`, `api_call` | read, read, dynamic | Developer Knowledge v1alpha and Safe Browsing v4 |

The full list is in `docs/capabilities/gsearch.md`.

## Example requests

- "Is https://example-shop.test/login flagged for malware?" Claude runs the Safe Browsing URL search. No prompt.
- "Give me the PageSpeed score for our homepage on mobile." Claude runs the PageSpeed Insights call. No prompt.
- "Find fact checks about this claim: the bridge closed in June." Claude runs the Fact Check claims search. No prompt.
- "Search the Google developer docs for the Drive quota page." Claude runs a Developer Knowledge search. No prompt.

## Safety

- Most tools are read. Writes and deletes are hidden until `allow_writes` is on, and then they ask first.
- Lookups send the URL or text you pass to Google's API.
- The key is the only credential. Restrict it and rotate it if it leaks.

## Costs and limits

Custom Search gives 100 queries per day free, then USD 5 per 1,000 up to 10,000 per day, for existing customers only. Knowledge Graph is free up to 100,000 reads per day per project. Safe Browsing is free but for non-commercial use only, and the Web Risk paid rate is UNVERIFIED. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/workspace-cloud-search-ai.md`, section 13.

## Caveats

- Reported, to be checked in the Google Cloud console: the Custom Search JSON API is reported closed to new customers and discontinued on 2027-01-01. Existing customers must move to another solution. Check the status for your project before you build on it.
- Safe Browsing is for non-commercial use. Commercial use should move to Web Risk.
- The Fact Check Tools reference states no quota. The PageSpeed and Chrome UX Report limits are UNVERIFIED.
- Custom Search results per query and the Web Risk size limits are UNVERIFIED.
