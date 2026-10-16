# Search and Web Quality (`gsearch`)

Public search and web-quality APIs (Custom Search, PageSpeed, CrUX, Safe Browsing, Web Risk, Fact Check) that take an API key instead of OAuth. The Custom Search JSON API is closed to new customers and is scheduled to be discontinued on 2027-01-01.

- Plugin: `gsearch`, MCP server: `gsearch`, login: API key, then `setup-apikey` (no login)
- Install: `claude plugin install gsearch@google-services-mcps`
- Tools: 53 total. Curated 2, per-method 47, gateway 3. Read 44, write 5, destructive 3, dynamic 1.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

## Curated tools (2)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `auth_status` | read | Login status | (none) |
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
| `developerk_v1_answer_query` | write | developerknowledge.answerQuery | cloud-platform |
| `digitalass_assetlinks_bulk_check` | write | digitalassetlinks.assetlinks.bulkCheck | (none) |
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

- Custom Search API (`customsearch/v1`), 2 methods in the catalog
- PageSpeed Insights API (`pagespeedonline/v5`), 1 methods in the catalog
- Chrome UX Report API (`chromeuxreport/v1`), 2 methods in the catalog
- Knowledge Graph Search API (`kgsearch/v1`), 1 methods in the catalog
- Safe Browsing API (`safebrowsing/v5`), 5 methods in the catalog
- Fact Check Tools API (`factchecktools/v1alpha1`), 7 methods in the catalog
- Accelerated Mobile Pages (AMP) URL API (`acceleratedmobilepageurl/v1`), 1 methods in the catalog
- Abusive Experience Report API (`abusiveexperiencereport/v1`), 2 methods in the catalog
- Ad Experience Report API (`adexperiencereport/v1`), 2 methods in the catalog
- Web Fonts Developer API (`webfonts/v1`), 1 methods in the catalog
- Web Risk API (`webrisk/v1`), 8 methods in the catalog
- Google Civic Information API (`civicinfo/v2`), 4 methods in the catalog
- Digital Asset Links API (`digitalassetlinks/v1`), 3 methods in the catalog
- versionhistory.googleapis.com API (`versionhistory/v1`), 4 methods in the catalog
- Developer Knowledge API (`developerknowledge/v1`), 4 methods in the catalog

## Gateway APIs (reached through api_search, api_describe, api_call)

- Developer Knowledge API (`developerknowledge/v1alpha`), 4 methods
- Safe Browsing API (`safebrowsing/v4`), 7 methods

