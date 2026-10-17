# Search Console (`gsc`)

Search Console sites, sitemaps, search analytics, URL indexing and site verification.

- Plugin: `gsc`, MCP server: `gsc`, login: Desktop OAuth client, then `login searchconsole`
- Install: `claude plugin install gsc@google-services-mcps`
- Tools: 36 total. Curated 15, per-method 20, gateway 0. Read 17, write 14, destructive 5, dynamic 0.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

## Curated tools (15)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `auth_login` | write | Sign in to Google | (none) |
| `auth_setup_admin` | write | Set up the workspace admin account | (none) |
| `auth_setup_client` | write | Save the Google OAuth client | (none) |
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

- Google Search Console API (`searchconsole/v1`), 11 methods in the catalog
- Site Verification API (`siteVerification/v1`), 7 methods in the catalog
- Web Search Indexing API (`indexing/v3`), 2 methods in the catalog

## Gateway APIs (reached through api_search, api_describe, api_call)

None.

