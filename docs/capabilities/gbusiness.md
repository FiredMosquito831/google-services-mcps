# Business Profile (`gbusiness`)

Business Profile accounts, locations, verifications, lodging, place actions, notifications and performance.

- Plugin: `gbusiness`, MCP server: `gbusiness`, login: Desktop OAuth client, then `login business`
- Install: `claude plugin install gbusiness@google-services-mcps`
- Tools: 59 total. Curated 7, per-method 51, gateway 0. Read 32, write 18, destructive 9, dynamic 0.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 59, google 15, curated 59 (all) tools, each counting the 7 runtime tools this server registers (`account_remove`, `account_set_default`, `accounts_list`, `auth_login`, `auth_setup_client`, `auth_status`, `health`). "(all)" means the product has no such toolset yet, so it lists every tool.

## Not registered by this server (2)

The tool map (`plugins/<id>/tool-map.json`) also lists these, so the consent hook knows every name, but this server never registers them, and the counts above leave them out.

- Sign-in tools of other sign-in kinds: `auth_setup_admin`, `auth_setup_service_account`.

## Toolset google (8)

Google has no official MCP server for this product. The google toolset is a lean set chosen here: No official Google MCP server for Google Business Profile was found (Google's Cloud and Workspace MCP lists and Google's GitHub organisations, 2026-10-29; a negative, not confirmed by Google); a lean set chosen here.

| Tool | Google's tool | Note |
|---|---|---|
| `mbaccount_accounts_list` | (none) | The Business Profile accounts the signed-in user can manage. Start here. Google's Business Profile Discovery documents list no OAuth scope; since 1.24.1 the product declares business.manage for them (scopeOverrides), so a readwrite login asks for it. It has no read-only form, so a readonly login covers none of these tools. |
| `mbinfo_accounts_locations_list` | (none) | The locations of an account; readMask names the fields to return, such as name,title,storefrontAddress. |
| `mbinfo_locations_get` | (none) | One location with the fields readMask names: hours, categories, phone, website and so on. |
| `bpperf_loc_get_dai_met_tim_seri` | (none) | One daily metric of a location over a date range, such as calls or website clicks. |
| `bpperf_locations_time_series` | (none) | Several daily metrics of a location over a date range in one call. |
| `bpperf_impressions_monthly_list` | (none) | The search keywords that showed the location, with monthly impressions. |
| `mbverify_verifications_list` | (none) | The verifications of a location and their state. |
| `mbinfo_locations_patch` | (none) | Changes the fields updateMask names. A write, so it asks first; the change is public on Google Search and Maps. |

## Curated tools (7)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `account_remove` | write | Remove a signed-in account | (none) |
| `account_set_default` | write | Set the default account | (none) |
| `accounts_list` | read | Signed-in accounts | (none) |
| `auth_login` | write | Sign in to Google | (none) |
| `auth_setup_client` | write | Save the Google OAuth client | (none) |
| `auth_status` | read | Sign-in status | (none) |
| `health` | read | Server health | (none) |

## Per-method tools (51)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `bpperf_impressions_monthly_list` | read | businessprofileperformance.locations.searchkeywords.impressions.monthly.list | business.manage |
| `bpperf_loc_get_dai_met_tim_seri` | read | businessprofileperformance.locations.getDailyMetricsTimeSeries | business.manage |
| `bpperf_locations_time_series` | read | businessprofileperformance.locations.fetchMultiDailyMetricsTimeSeries | business.manage |
| `mbaccount_accounts_admins_list` | read | mybusinessaccountmanagement.accounts.admins.list | business.manage |
| `mbaccount_accounts_admins_patch` | destructive | mybusinessaccountmanagement.accounts.admins.patch | business.manage |
| `mbaccount_accounts_create` | write | mybusinessaccountmanagement.accounts.create | business.manage |
| `mbaccount_accounts_get` | read | mybusinessaccountmanagement.accounts.get | business.manage |
| `mbaccount_accounts_list` | read | mybusinessaccountmanagement.accounts.list | business.manage |
| `mbaccount_accounts_patch` | write | mybusinessaccountmanagement.accounts.patch | business.manage |
| `mbaccount_accts_admins_create` | destructive | mybusinessaccountmanagement.accounts.admins.create | business.manage |
| `mbaccount_accts_admins_delete` | destructive | mybusinessaccountmanagement.accounts.admins.delete | business.manage |
| `mbaccount_admins_create` | destructive | mybusinessaccountmanagement.locations.admins.create | business.manage |
| `mbaccount_admins_delete` | destructive | mybusinessaccountmanagement.locations.admins.delete | business.manage |
| `mbaccount_admins_patch` | destructive | mybusinessaccountmanagement.locations.admins.patch | business.manage |
| `mbaccount_invitations_accept` | write | mybusinessaccountmanagement.accounts.invitations.accept | business.manage |
| `mbaccount_invitations_decline` | write | mybusinessaccountmanagement.accounts.invitations.decline | business.manage |
| `mbaccount_invitations_list` | read | mybusinessaccountmanagement.accounts.invitations.list | business.manage |
| `mbaccount_locations_admins_list` | read | mybusinessaccountmanagement.locations.admins.list | business.manage |
| `mbaccount_locations_transfer` | destructive | mybusinessaccountmanagement.locations.transfer | business.manage |
| `mbinf_attributes_google_updated` | read | mybusinessbusinessinformation.locations.attributes.getGoogleUpdated | business.manage |
| `mbinfo_accounts_create` | write | mybusinessbusinessinformation.accounts.locations.create | business.manage |
| `mbinfo_accounts_locations_list` | read | mybusinessbusinessinformation.accounts.locations.list | business.manage |
| `mbinfo_attributes_list` | read | mybusinessbusinessinformation.attributes.list | business.manage |
| `mbinfo_categories_batch_get` | read | mybusinessbusinessinformation.categories.batchGet | business.manage |
| `mbinfo_categories_list` | read | mybusinessbusinessinformation.categories.list | business.manage |
| `mbinfo_chains_get` | read | mybusinessbusinessinformation.chains.get | business.manage |
| `mbinfo_chains_search` | read | mybusinessbusinessinformation.chains.search | business.manage |
| `mbinfo_get_google_updated` | read | mybusinessbusinessinformation.locations.getGoogleUpdated | business.manage |
| `mbinfo_google_locations_search` | read | mybusinessbusinessinformation.googleLocations.search | business.manage |
| `mbinfo_locations_delete` | destructive | mybusinessbusinessinformation.locations.delete | business.manage |
| `mbinfo_locations_get` | read | mybusinessbusinessinformation.locations.get | business.manage |
| `mbinfo_locations_get_attributes` | read | mybusinessbusinessinformation.locations.getAttributes | business.manage |
| `mbinfo_locations_patch` | write | mybusinessbusinessinformation.locations.patch | business.manage |
| `mbinfo_update_attributes` | write | mybusinessbusinessinformation.locations.updateAttributes | business.manage |
| `mbnotify_get_notif_setting` | read | mybusinessnotifications.accounts.getNotificationSetting | business.manage |
| `mbnotify_update_notif_setting` | write | mybusinessnotifications.accounts.updateNotificationSetting | business.manage |
| `mbv_locations_verification_opts` | read | mybusinessverifications.locations.fetchVerificationOptions | business.manage |
| `mbveri_locations_merchant_state` | read | mybusinessverifications.locations.getVoiceOfMerchantState | business.manage |
| `mbverify_locations_verify` | write | mybusinessverifications.locations.verify | business.manage |
| `mbverify_tokens_generate` | write | mybusinessverifications.verificationTokens.generate | business.manage |
| `mbverify_verifications_complete` | write | mybusinessverifications.locations.verifications.complete | business.manage |
| `mbverify_verifications_list` | read | mybusinessverifications.locations.verifications.list | business.manage |
| `mybusines_locations_get_lodging` | read | mybusinesslodging.locations.getLodging | business.manage |
| `mybusiness_get_google_updated` | read | mybusinesslodging.locations.lodging.getGoogleUpdated | business.manage |
| `mybusiness_links_create` | write | mybusinessplaceactions.locations.placeActionLinks.create | business.manage |
| `mybusiness_links_delete` | destructive | mybusinessplaceactions.locations.placeActionLinks.delete | business.manage |
| `mybusiness_links_get` | read | mybusinessplaceactions.locations.placeActionLinks.get | business.manage |
| `mybusiness_links_list` | read | mybusinessplaceactions.locations.placeActionLinks.list | business.manage |
| `mybusiness_links_patch` | write | mybusinessplaceactions.locations.placeActionLinks.patch | business.manage |
| `mybusiness_meta_list` | read | mybusinessplaceactions.placeActionTypeMetadata.list | business.manage |
| `mybusiness_update_lodging` | write | mybusinesslodging.locations.updateLodging | business.manage |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gbusiness: API methods | (none) |

## Generated APIs

Each API links to Google's documentation for it, as Google's Discovery directory names it (`documentationLink`, kept in `data/catalog.json`). The link is the API's documentation home, not a page per method: the directory gives no link per method, and Google's REST reference pages are laid out differently from product to product.

- My Business Account Management API (`mybusinessaccountmanagement/v1`), 16 methods in the catalog. Documentation: <https://developers.google.com/my-business/>
- My Business Business Information API (`mybusinessbusinessinformation/v1`), 15 methods in the catalog. Documentation: <https://developers.google.com/my-business/>
- My Business Lodging API (`mybusinesslodging/v1`), 3 methods in the catalog. Documentation: <https://developers.google.com/my-business/>
- My Business Notifications API (`mybusinessnotifications/v1`), 2 methods in the catalog. Documentation: <https://developers.google.com/my-business/>
- My Business Place Actions API (`mybusinessplaceactions/v1`), 6 methods in the catalog. Documentation: <https://developers.google.com/my-business/>
- My Business Verifications API (`mybusinessverifications/v1`), 6 methods in the catalog. Documentation: <https://developers.google.com/my-business/>
- Business Profile Performance API (`businessprofileperformance/v1`), 3 methods in the catalog. Documentation: <https://developers.google.com/my-business/>

## Gateway APIs (reached through api_search, api_describe, api_call)

None.

