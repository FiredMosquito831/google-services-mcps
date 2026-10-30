# Search Console (`gsc`)

Search Console sites, sitemaps, search analytics, URL indexing and site verification.

- Plugin: `gsc`, MCP server: `gsc`, login: Desktop OAuth client, then `login searchconsole`
- Install: `claude plugin install gsc@google-services-mcps`
- Tools: 40 total. Curated 19, per-method 20, gateway 0. Read 18, write 17, destructive 5, dynamic 0.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 40, google 18, curated 19 tools, each with the 9 runtime tools of the map counted. "(all)" means the product has no such toolset yet, so it lists every tool.

## Toolset google (9)

Google has no official MCP server for this product. The google toolset is a lean set chosen here: No official Google MCP server for Search Console was found (Google's Cloud and Workspace MCP lists, 2026-10-29; a negative, not confirmed by Google); a lean set chosen here..

| Tool | Google's tool | Note |
|---|---|---|
| `sc_sites_list` | (none) | The properties the account can see, with its permission level. Start here. |
| `sc_site_get` | (none) | One property and the account's permission on it. |
| `sc_search_analytics_query` | (none) | Clicks, impressions, CTR and position by query, page, country, device, date or search appearance. A read here; the generated searchcons_searchanalytics_query is a write, as classifyMethod classifies the POST query. |
| `sc_url_inspect` | (none) | The index status of one URL: coverage, last crawl, canonical, mobile usability and rich results. |
| `sc_sitemaps_list` | (none) | The sitemaps of a property with their submitted and indexed counts (the indexed count can lag; check a sample with sc_url_inspect). |
| `sc_sitemap_get` | (none) | One sitemap: its status, errors, warnings and counts. |
| `sc_sitemap_submit` | (none) | Submits or resubmits a sitemap. A write, so it asks first. |
| `indexing_url_notifications_get_metadata` | (none) | When the Indexing API was last told about a URL. Needs the indexing scope, which has no read-only form. |
| `indexing_url_notifications_publish` | (none) | Tells Google a URL was updated or deleted. Google accepts it only for pages with JobPosting or BroadcastEvent (in a VideoObject) markup. A write, so it asks first. |

## Curated tools (19)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `account_remove` | write | Remove a signed-in account | (none) |
| `account_set_default` | write | Set the default account | (none) |
| `accounts_list` | read | Signed-in accounts | (none) |
| `auth_login` | write | Sign in to Google | (none) |
| `auth_setup_admin` | write | Set up the workspace admin account | (none) |
| `auth_setup_client` | write | Save the Google OAuth client | (none) |
| `auth_setup_service_account` | write | Set up the service account key | (none) |
| `auth_status` | read | Sign-in status | (none) |
| `health` | read | Server health | (none) |
| `sc_search_analytics_query` | read | Query search analytics | webmasters, webmasters.readonly |
| `sc_site_add` | write | Add Search Console property | webmasters |
| `sc_site_delete` | destructive | Remove Search Console property | webmasters |
| `sc_site_get` | read | Get Search Console property | webmasters, webmasters.readonly |
| `sc_sitemap_delete` | destructive | Delete sitemap | webmasters |
| `sc_sitemap_get` | read | Get sitemap | webmasters, webmasters.readonly |
| `sc_sitemap_submit` | write | Submit sitemap | webmasters |
| `sc_sitemaps_list` | read | List sitemaps | webmasters, webmasters.readonly |
| `sc_sites_list` | read | List Search Console properties | webmasters, webmasters.readonly |
| `sc_url_inspect` | read | Inspect URL | webmasters, webmasters.readonly |

## Per-method tools (20)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `indexing_url_notifications_get_metadata` | read | indexing.urlNotifications.getMetadata | indexing |
| `indexing_url_notifications_publish` | write | indexing.urlNotifications.publish | indexing |
| `searchcons_searchanalytics_query` | write | webmasters.searchanalytics.query | webmasters, webmasters.readonly |
| `searchcons_sitemaps_delete` | destructive | webmasters.sitemaps.delete | webmasters |
| `searchcons_sitemaps_get` | read | webmasters.sitemaps.get | webmasters, webmasters.readonly |
| `searchcons_sitemaps_list` | read | webmasters.sitemaps.list | webmasters, webmasters.readonly |
| `searchcons_sitemaps_submit` | write | webmasters.sitemaps.submit | webmasters |
| `searchcons_sites_add` | write | webmasters.sites.add | webmasters |
| `searchcons_sites_delete` | destructive | webmasters.sites.delete | webmasters |
| `searchcons_sites_get` | read | webmasters.sites.get | webmasters, webmasters.readonly |
| `searchcons_sites_list` | read | webmasters.sites.list | webmasters, webmasters.readonly |
| `searchcons_url_inspection_index_inspect` | read | searchconsole.urlInspection.index.inspect | webmasters, webmasters.readonly |
| `searchcons_url_testing_t_mobile_friendl_run` | write | searchconsole.urlTestingTools.mobileFriendlyTest.run | (none) |
| `siteverif_web_resource_delete` | destructive | siteVerification.webResource.delete | siteverification |
| `siteverif_web_resource_get` | read | siteVerification.webResource.get | siteverification |
| `siteverif_web_resource_get_token` | write | siteVerification.webResource.getToken | siteverification, siteverification.verify_only |
| `siteverif_web_resource_insert` | write | siteVerification.webResource.insert | siteverification, siteverification.verify_only |
| `siteverif_web_resource_list` | read | siteVerification.webResource.list | siteverification |
| `siteverif_web_resource_patch` | write | siteVerification.webResource.patch | siteverification |
| `siteverif_web_resource_update` | write | siteVerification.webResource.update | siteverification |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gsc: API methods | (none) |

## Generated APIs

Each API links to Google's documentation for it, as Google's Discovery directory names it (`documentationLink`, kept in `data/catalog.json`). The link is the API's documentation home, not a page per method: the directory gives no link per method, and Google's REST reference pages are laid out differently from product to product.

- Google Search Console API (`searchconsole/v1`), 11 methods in the catalog. Documentation: <https://developers.google.com/webmaster-tools/about>
- Site Verification API (`siteVerification/v1`), 7 methods in the catalog. Documentation: <https://code.google.com/apis/siteverification/>
- Web Search Indexing API (`indexing/v3`), 2 methods in the catalog. Documentation: <https://developers.google.com/search/apis/indexing-api/>

## Gateway APIs (reached through api_search, api_describe, api_call)

None.

