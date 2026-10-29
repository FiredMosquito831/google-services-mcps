# Business Profile (`gbusiness`)

Business Profile accounts, locations, verifications, lodging, place actions, notifications and performance.

- Plugin: `gbusiness`, MCP server: `gbusiness`, login: Desktop OAuth client, then `login business`
- Install: `claude plugin install gbusiness@google-services-mcps`
- Tools: 61 total. Curated 9, per-method 51, gateway 0. Read 32, write 25, destructive 4, dynamic 0.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 61, google 61 (all), curated 61 (all) tools, each with the 9 runtime tools of the map counted. "(all)" means the product has no such toolset yet, so it lists every tool.

## Curated tools (9)

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

## Per-method tools (51)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `bpperf_loca_sear_impr_mont_list` | read | businessprofileperformance.locations.searchkeywords.impressions.monthly.list | (none) |
| `bpperf_locations_fetch_multi_da` | read | businessprofileperformance.locations.fetchMultiDailyMetricsTimeSeries | (none) |
| `bpperf_locations_get_daily_metr` | read | businessprofileperformance.locations.getDailyMetricsTimeSeries | (none) |
| `mbaccount_accoun_invita_decline` | write | mybusinessaccountmanagement.accounts.invitations.decline | (none) |
| `mbaccount_accoun_invitat_accept` | write | mybusinessaccountmanagement.accounts.invitations.accept | (none) |
| `mbaccount_account_admins_create` | write | mybusinessaccountmanagement.accounts.admins.create | (none) |
| `mbaccount_account_admins_delete` | destructive | mybusinessaccountmanagement.accounts.admins.delete | (none) |
| `mbaccount_account_invitati_list` | read | mybusinessaccountmanagement.accounts.invitations.list | (none) |
| `mbaccount_accounts_admins_list` | read | mybusinessaccountmanagement.accounts.admins.list | (none) |
| `mbaccount_accounts_admins_patch` | write | mybusinessaccountmanagement.accounts.admins.patch | (none) |
| `mbaccount_accounts_create` | write | mybusinessaccountmanagement.accounts.create | (none) |
| `mbaccount_accounts_get` | read | mybusinessaccountmanagement.accounts.get | (none) |
| `mbaccount_accounts_list` | read | mybusinessaccountmanagement.accounts.list | (none) |
| `mbaccount_accounts_patch` | write | mybusinessaccountmanagement.accounts.patch | (none) |
| `mbaccount_locatio_admins_create` | write | mybusinessaccountmanagement.locations.admins.create | (none) |
| `mbaccount_locatio_admins_delete` | destructive | mybusinessaccountmanagement.locations.admins.delete | (none) |
| `mbaccount_location_admins_patch` | write | mybusinessaccountmanagement.locations.admins.patch | (none) |
| `mbaccount_locations_admins_list` | read | mybusinessaccountmanagement.locations.admins.list | (none) |
| `mbaccount_locations_transfer` | write | mybusinessaccountmanagement.locations.transfer | (none) |
| `mbinfo_accounts_location_create` | write | mybusinessbusinessinformation.accounts.locations.create | (none) |
| `mbinfo_accounts_locations_list` | read | mybusinessbusinessinformation.accounts.locations.list | (none) |
| `mbinfo_attributes_list` | read | mybusinessbusinessinformation.attributes.list | (none) |
| `mbinfo_categories_batch_get` | read | mybusinessbusinessinformation.categories.batchGet | (none) |
| `mbinfo_categories_list` | read | mybusinessbusinessinformation.categories.list | (none) |
| `mbinfo_chains_get` | read | mybusinessbusinessinformation.chains.get | (none) |
| `mbinfo_chains_search` | read | mybusinessbusinessinformation.chains.search | (none) |
| `mbinfo_google_locations_search` | read | mybusinessbusinessinformation.googleLocations.search | (none) |
| `mbinfo_locatio_attribu_get_goog` | read | mybusinessbusinessinformation.locations.attributes.getGoogleUpdated | (none) |
| `mbinfo_locations_delete` | destructive | mybusinessbusinessinformation.locations.delete | (none) |
| `mbinfo_locations_get` | read | mybusinessbusinessinformation.locations.get | (none) |
| `mbinfo_locations_get_attributes` | read | mybusinessbusinessinformation.locations.getAttributes | (none) |
| `mbinfo_locations_get_google_upd` | read | mybusinessbusinessinformation.locations.getGoogleUpdated | (none) |
| `mbinfo_locations_patch` | write | mybusinessbusinessinformation.locations.patch | (none) |
| `mbinfo_locations_update_attribu` | write | mybusinessbusinessinformation.locations.updateAttributes | (none) |
| `mbnotify_accounts_get_notificat` | read | mybusinessnotifications.accounts.getNotificationSetting | (none) |
| `mbnotify_accounts_update_notifi` | write | mybusinessnotifications.accounts.updateNotificationSetting | (none) |
| `mbverify_locati_verific_complet` | write | mybusinessverifications.locations.verifications.complete | (none) |
| `mbverify_location_verifica_list` | read | mybusinessverifications.locations.verifications.list | (none) |
| `mbverify_locations_fetch_verifi` | read | mybusinessverifications.locations.fetchVerificationOptions | (none) |
| `mbverify_locations_get_voice_of` | read | mybusinessverifications.locations.getVoiceOfMerchantState | (none) |
| `mbverify_locations_verify` | write | mybusinessverifications.locations.verify | (none) |
| `mbverify_verification_generate` | write | mybusinessverifications.verificationTokens.generate | (none) |
| `mybusiness_locati_lodgin_get_go` | read | mybusinesslodging.locations.lodging.getGoogleUpdated | (none) |
| `mybusiness_locati_place_a_patch` | write | mybusinessplaceactions.locations.placeActionLinks.patch | (none) |
| `mybusiness_locati_place_create` | write | mybusinessplaceactions.locations.placeActionLinks.create | (none) |
| `mybusiness_locati_place_delete` | destructive | mybusinessplaceactions.locations.placeActionLinks.delete | (none) |
| `mybusiness_locatio_place_a_list` | read | mybusinessplaceactions.locations.placeActionLinks.list | (none) |
| `mybusiness_locatio_place_ac_get` | read | mybusinessplaceactions.locations.placeActionLinks.get | (none) |
| `mybusiness_locations_get_lodgin` | read | mybusinesslodging.locations.getLodging | (none) |
| `mybusiness_locations_update_lod` | write | mybusinesslodging.locations.updateLodging | (none) |
| `mybusiness_place_action_ty_list` | read | mybusinessplaceactions.placeActionTypeMetadata.list | (none) |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gbusiness: API methods | (none) |

## Generated APIs

- My Business Account Management API (`mybusinessaccountmanagement/v1`), 16 methods in the catalog
- My Business Business Information API (`mybusinessbusinessinformation/v1`), 15 methods in the catalog
- My Business Lodging API (`mybusinesslodging/v1`), 3 methods in the catalog
- My Business Notifications API (`mybusinessnotifications/v1`), 2 methods in the catalog
- My Business Place Actions API (`mybusinessplaceactions/v1`), 6 methods in the catalog
- My Business Verifications API (`mybusinessverifications/v1`), 6 methods in the catalog
- Business Profile Performance API (`businessprofileperformance/v1`), 3 methods in the catalog

## Gateway APIs (reached through api_search, api_describe, api_call)

None.

