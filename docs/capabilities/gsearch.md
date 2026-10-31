# Search and Web Quality (`gsearch`)

Public search and web-quality APIs (Custom Search, PageSpeed, CrUX, Safe Browsing, Web Risk, Fact Check) that take an API key instead of OAuth. The Custom Search JSON API is closed to new customers and is scheduled to be discontinued on 2027-01-01.

- Plugin: `gsearch`, MCP server: `gsearch`, login: API key, then `setup-apikey` (no login)
- Install: `claude plugin install gsearch@google-services-mcps`
- Tools: 52 total. Curated 1, per-method 47, gateway 3. Read 45, write 3, destructive 3, dynamic 1.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 52, google 9, curated 4 tools, each counting the 1 runtime tools this server registers (`health`). "(all)" means the product has no such toolset yet, so it lists every tool.

## Not registered by this server (8)

The tool map (`plugins/<id>/tool-map.json`) also lists these, so the consent hook knows every name, but this server never registers them, and the counts above leave them out.

- Sign-in tools of other sign-in kinds: `account_remove`, `account_set_default`, `accounts_list`, `auth_login`, `auth_setup_admin`, `auth_setup_client`, `auth_setup_service_account`, `auth_status`.

## Toolset google (8)

The tools that match Google's official MCP server for this product (https://developerknowledge.googleapis.com/mcp).

| Tool | Google's tool | Note |
|---|---|---|
| `developerk_documents_search_documen` | `search_documents` | Searches Google's developer documentation (Developer Knowledge API searchDocumentChunks): matching chunks with their document names. |
| `developerk_documents_batch_get` | `get_documents` | The full text of up to 20 documents by name (Developer Knowledge API documents.batchGet), after a search. |
| `developerk_v1_answer_query` | `answer_query` | A grounded answer about Google developer products (Developer Knowledge API answerQuery). Google marks it read-only, and since 1.24.2 (D2) the suite counts it as a read too, so it does not ask. |
| `pagespeedo_pagespeedap_runpagespeed` | (none) | No official Google MCP server covers PageSpeed Insights; kept for the Lighthouse scores and Core Web Vitals of a page (PageSpeed Insights API runpagespeed). |
| `chromeuxre_records_query_record` | (none) | No official Google MCP server covers the Chrome UX Report; kept for real-user Core Web Vitals of an origin or URL (CrUX API records.queryRecord). |
| `kgsearch_entities_search` | (none) | No official Google MCP server covers the Knowledge Graph; kept to look up an entity by name (Knowledge Graph Search API entities.search). |
| `factcheckt_claims_search` | (none) | No official Google MCP server covers Fact Check Tools; kept to find published fact checks of a claim (Fact Check Tools API claims.search). |
| `webrisk_uris_search` | (none) | No official Google MCP server covers Web Risk; kept to check a URL against Google's threat lists (Web Risk API uris.search). |

## Curated tools (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `health` | read | Server health | (none) |

## Per-method tools (47)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `abusiveexp_sites_get` | read | abusiveexperiencereport.sites.get | (none) |
| `abusiveexp_violating_sites_list` | read | abusiveexperiencereport.violatingSites.list | (none) |
| `accelerate_amp_urls_batch_get` | read | acceleratedmobilepageurl.ampUrls.batchGet | (none) |
| `adexperien_sites_get` | read | adexperiencereport.sites.get | (none) |
| `adexperien_violating_sites_list` | read | adexperiencereport.violatingSites.list | (none) |
| `chromeuxre_records_query_history_re` | read | chromeuxreport.records.queryHistoryRecord | (none) |
| `chromeuxre_records_query_record` | read | chromeuxreport.records.queryRecord | (none) |
| `civicinfo_divisions_query_division` | read | civicinfo.divisions.queryDivisionByAddress | (none) |
| `civicinfo_divisions_search` | read | civicinfo.divisions.search | (none) |
| `civicinfo_elections_election_query` | read | civicinfo.elections.electionQuery | (none) |
| `civicinfo_elections_voter_info_quer` | read | civicinfo.elections.voterInfoQuery | (none) |
| `cse_cse_list` | read | search.cse.list | (none) |
| `cse_cse_siterestrict_list` | read | search.cse.siterestrict.list | (none) |
| `developerk_documents_batch_get` | read | developerknowledge.documents.batchGet | cloud-platform |
| `developerk_documents_get` | read | developerknowledge.documents.get | cloud-platform |
| `developerk_documents_search_documen` | read | developerknowledge.documents.searchDocumentChunks | cloud-platform |
| `developerk_v1_answer_query` | read | developerknowledge.answerQuery | cloud-platform |
| `digitalass_assetlinks_bulk_check` | read | digitalassetlinks.assetlinks.bulkCheck | (none) |
| `digitalass_assetlinks_check` | read | digitalassetlinks.assetlinks.check | (none) |
| `digitalass_statements_list` | read | digitalassetlinks.statements.list | (none) |
| `factcheckt_claims_image_search` | read | factchecktools.claims.imageSearch | (none) |
| `factcheckt_claims_search` | read | factchecktools.claims.search | (none) |
| `factcheckt_pages_create` | write | factchecktools.pages.create | factchecktools |
| `factcheckt_pages_delete` | destructive | factchecktools.pages.delete | factchecktools |
| `factcheckt_pages_get` | read | factchecktools.pages.get | factchecktools |
| `factcheckt_pages_list` | read | factchecktools.pages.list | factchecktools |
| `factcheckt_pages_update` | write | factchecktools.pages.update | factchecktools |
| `kgsearch_entities_search` | read | kgsearch.entities.search | (none) |
| `pagespeedo_pagespeedap_runpagespeed` | read | pagespeedonline.pagespeedapi.runpagespeed | openid |
| `safebrowsi_hash_list_get` | read | safebrowsing.hashList.get | (none) |
| `safebrowsi_hash_lists_batch_get` | read | safebrowsing.hashLists.batchGet | (none) |
| `safebrowsi_hash_lists_list` | read | safebrowsing.hashLists.list | (none) |
| `safebrowsi_hashes_search` | read | safebrowsing.hashes.search | (none) |
| `safebrowsi_urls_search` | read | safebrowsing.urls.search | (none) |
| `versionhis_plat_chan_vers_rele_list` | read | versionhistory.platforms.channels.versions.releases.list | (none) |
| `versionhis_platf_channe_versio_list` | read | versionhistory.platforms.channels.versions.list | (none) |
| `versionhis_platforms_channels_list` | read | versionhistory.platforms.channels.list | (none) |
| `versionhis_platforms_list` | read | versionhistory.platforms.list | (none) |
| `webfonts_webfonts_list` | read | webfonts.webfonts.list | (none) |
| `webrisk_hashes_search` | read | webrisk.hashes.search | cloud-platform |
| `webrisk_projects_operations_cancel` | destructive | webrisk.projects.operations.cancel | (none) |
| `webrisk_projects_operations_delete` | destructive | webrisk.projects.operations.delete | (none) |
| `webrisk_projects_operations_get` | read | webrisk.projects.operations.get | cloud-platform |
| `webrisk_projects_operations_list` | read | webrisk.projects.operations.list | (none) |
| `webrisk_projects_submissions_create` | write | webrisk.projects.submissions.create | cloud-platform |
| `webrisk_threat_lists_compute_diff` | read | webrisk.threatLists.computeDiff | cloud-platform |
| `webrisk_uris_search` | read | webrisk.uris.search | cloud-platform |

## Gateway tools (3)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_call` | dynamic | Call an API method | (none) |
| `api_describe` | read | Describe an API method | (none) |
| `api_search` | read | Search API methods | (none) |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gsearch: API methods | (none) |

## Generated APIs

Each API links to Google's documentation for it, as Google's Discovery directory names it (`documentationLink`, kept in `data/catalog.json`). The link is the API's documentation home, not a page per method: the directory gives no link per method, and Google's REST reference pages are laid out differently from product to product.

- Custom Search API (`customsearch/v1`), 2 methods in the catalog. Documentation: <https://developers.google.com/custom-search/v1/introduction>
- PageSpeed Insights API (`pagespeedonline/v5`), 1 methods in the catalog. Documentation: <https://developers.google.com/speed/docs/insights/v5/about>
- Chrome UX Report API (`chromeuxreport/v1`), 2 methods in the catalog. Documentation: <https://developers.google.com/web/tools/chrome-user-experience-report/api/reference>
- Knowledge Graph Search API (`kgsearch/v1`), 1 methods in the catalog. Documentation: <https://developers.google.com/knowledge-graph/>
- Safe Browsing API (`safebrowsing/v5`), 5 methods in the catalog. Documentation: <https://developers.google.com/safe-browsing/>
- Fact Check Tools API (`factchecktools/v1alpha1`), 7 methods in the catalog. Documentation: <https://developers.google.com/fact-check/tools/api/>
- Accelerated Mobile Pages (AMP) URL API (`acceleratedmobilepageurl/v1`), 1 methods in the catalog. Documentation: <https://developers.google.com/amp/cache/>
- Abusive Experience Report API (`abusiveexperiencereport/v1`), 2 methods in the catalog. Documentation: <https://developers.google.com/abusive-experience-report/>
- Ad Experience Report API (`adexperiencereport/v1`), 2 methods in the catalog. Documentation: <https://developers.google.com/ad-experience-report/>
- Web Fonts Developer API (`webfonts/v1`), 1 methods in the catalog. Documentation: <https://developers.google.com/fonts/docs/developer_api>
- Web Risk API (`webrisk/v1`), 8 methods in the catalog. Documentation: <https://cloud.google.com/web-risk/>
- Google Civic Information API (`civicinfo/v2`), 4 methods in the catalog. Documentation: <https://developers.google.com/civic-information/>
- Digital Asset Links API (`digitalassetlinks/v1`), 3 methods in the catalog. Documentation: <https://developers.google.com/digital-asset-links/>
- versionhistory.googleapis.com API (`versionhistory/v1`), 4 methods in the catalog. Documentation: <https://developer.chrome.com/docs/web-platform/versionhistory/guide>
- Developer Knowledge API (`developerknowledge/v1`), 4 methods in the catalog. Documentation: <https://developers.google.com/knowledge>

## Gateway APIs (reached through api_search, api_describe, api_call)

- Developer Knowledge API (`developerknowledge/v1alpha`), 4 methods. Documentation: <https://developers.google.com/knowledge>
- Safe Browsing API (`safebrowsing/v4`), 7 methods. Documentation: <https://developers.google.com/safe-browsing/>

