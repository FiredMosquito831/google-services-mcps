# Merchant Center (`gmerchant`)

Merchant Center: Merchant API and Comparison Shopping Service, through a service account key.

- Plugin: `gmerchant`, MCP server: `gmerchant`, login: Service account key, then `setup-service-account` (no login)
- Install: `claude plugin install gmerchant@google-services-mcps`
- Tools: 167 total. Curated 9, per-method 154, gateway 3. Read 77, write 67, destructive 22, dynamic 1.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 167, google 22, curated 12 tools, each with the 9 runtime tools of the map counted. "(all)" means the product has no such toolset yet, so it lists every tool.

## Toolset google (13)

The tools that match Google's official MCP server for this product (https://developers.google.com/merchant/api/guides/agentic-tools/merchant-data-mcp).

| Tool | Google's tool | Note |
|---|---|---|
| `merchantap_accounts_list` | `list_accounts` | The Merchant Center accounts the service account can reach (accounts.list). Start here for an account id. |
| `merchantap_accounts_issues_list` | `list_account_issues` | Account-level issues that affect the whole account. |
| `merchantap_account_program_list` | `list_programs` | Programs, such as free listings and Shopping ads, with their state, regions and unmet requirements. |
| `merchantap_accoun_automa_get_au` | `get_automatic_improvements` | Automatic improvement settings: item updates, image improvements and shipping improvements. |
| `merchantap_acco_produ_list_6ad8` | `list_products` | The products of an account, a page at a time (products.list; the name ends in a hash because of the 64-character budget). |
| `merchantap_account_products_get` | `get_product_by_name` | One product by its exact resource name, accounts/{account}/products/{product}. |
| `merchantap_account_aggrega_list` | `list_aggregate_product_statuses` | Product issues aggregated by reporting context and country, for the health of the product data. |
| `merchantap_accoun_report_search` | `report_search` | A Merchant reports query (product performance, statuses, price insights, competitive visibility) in the Merchant Center Query Language. |
| `merchantap_account_data_so_list` | `list_data_sources` | The data sources of an account. |
| `merchantap_account_data_sou_get` | `get_data_source` | One data source. |
| `merchantap_accoun_data_s_create` | `create_data_source` | Creates a data source. A write, so it asks first. |
| `merchantap_accoun_data_so_fetch` | `fetch_data_source` | Fetches and processes a data source's file now. Google says it triggers processing, so since 1.24.2 (D2) the suite counts it as a write, and it asks first. |
| `merchantap_accou_data_file_get` | `get_file_upload` | The latest file upload of a data source and its processing state (accounts/{account}/dataSources/{datasource}/fileUploads/latest). |

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

## Per-method tools (154)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `css_accounts_css_product_delete` | destructive | css.accounts.cssProductInputs.delete | content |
| `css_accounts_css_product_insert` | write | css.accounts.cssProductInputs.insert | content |
| `css_accounts_css_product_patch` | write | css.accounts.cssProductInputs.patch | content |
| `css_accounts_css_products_get` | read | css.accounts.cssProducts.get | content |
| `css_accounts_css_products_list` | read | css.accounts.cssProducts.list | content |
| `css_accounts_get` | read | css.accounts.get | content |
| `css_accounts_labels_create` | write | css.accounts.labels.create | content |
| `css_accounts_labels_delete` | destructive | css.accounts.labels.delete | content |
| `css_accounts_labels_list` | read | css.accounts.labels.list | content |
| `css_accounts_labels_patch` | write | css.accounts.labels.patch | content |
| `css_accounts_list_child_account` | read | css.accounts.listChildAccounts | content |
| `css_accounts_quotas_list` | read | css.accounts.quotas.list | content |
| `css_accounts_update_labels` | write | css.accounts.updateLabels | content |
| `manufactur_acco_lang_prod_delet` | destructive | manufacturers.accounts.languages.productCertifications.delete | manufacturercenter |
| `manufactur_acco_lang_prod_patch` | write | manufacturers.accounts.languages.productCertifications.patch | manufacturercenter |
| `manufactur_acco_lang_produ_list` | read | manufacturers.accounts.languages.productCertifications.list | manufacturercenter |
| `manufactur_acco_langu_produ_get` | read | manufacturers.accounts.languages.productCertifications.get | manufacturercenter |
| `manufactur_accoun_produc_delete` | destructive | manufacturers.accounts.products.delete | manufacturercenter |
| `manufactur_accoun_produc_update` | write | manufacturers.accounts.products.update | manufacturercenter |
| `manufactur_account_product_list` | read | manufacturers.accounts.products.list | manufacturercenter |
| `manufactur_account_products_get` | read | manufacturers.accounts.products.get | manufacturercenter |
| `merchantap_acco_busi_get_b_4cc3` | read | merchantapi.accounts.businessInfo.getBusinessInfo | content |
| `merchantap_acco_busi_get_b_be3b` | read | merchantapi.accounts.businessIdentity.getBusinessIdentity | content |
| `merchantap_acco_busi_updat_0b6b` | write | merchantapi.accounts.businessIdentity.updateBusinessIdentity | content |
| `merchantap_acco_busi_updat_20a4` | write | merchantapi.accounts.businessInfo.updateBusinessInfo | content |
| `merchantap_acco_omni_lfp_p_find` | read | merchantapi.accounts.omnichannelSettings.lfpProviders.find | content |
| `merchantap_acco_omni_lfp_p_link` | write | merchantapi.accounts.omnichannelSettings.lfpProviders.linkLfpProvider | content |
| `merchantap_acco_prod_delet_223a` | destructive | merchantapi.accounts.productReviews.delete | content |
| `merchantap_acco_prod_delet_82b3` | destructive | merchantapi.accounts.productInputs.delete | content |
| `merchantap_acco_prod_inser_0ed9` | write | merchantapi.accounts.productReviews.insert | content |
| `merchantap_acco_prod_inser_aba3` | write | merchantapi.accounts.productInputs.insert | content |
| `merchantap_acco_prod_loca_delet` | destructive | merchantapi.accounts.products.localInventories.delete | content |
| `merchantap_acco_prod_loca_inser` | write | merchantapi.accounts.products.localInventories.insert | content |
| `merchantap_acco_prod_local_list` | read | merchantapi.accounts.products.localInventories.list | content |
| `merchantap_acco_prod_regi_delet` | destructive | merchantapi.accounts.products.regionalInventories.delete | content |
| `merchantap_acco_prod_regi_inser` | write | merchantapi.accounts.products.regionalInventories.insert | content |
| `merchantap_acco_prod_regio_list` | read | merchantapi.accounts.products.regionalInventories.list | content |
| `merchantap_acco_produ_list_6080` | read | merchantapi.accounts.productReviews.list | content |
| `merchantap_acco_produ_list_6ad8` | read | merchantapi.accounts.products.list | content |
| `merchantap_acco_prog_chec_creat` | write | merchantapi.accounts.programs.checkoutSettings.create | content |
| `merchantap_acco_prog_chec_delet` | destructive | merchantapi.accounts.programs.checkoutSettings.deleteCheckoutSettings | content |
| `merchantap_acco_prog_chec_get_c` | read | merchantapi.accounts.programs.checkoutSettings.getCheckoutSettings | content |
| `merchantap_acco_prog_chec_updat` | write | merchantapi.accounts.programs.checkoutSettings.updateCheckoutSettings | content |
| `merchantap_acco_regi_batch_a27e` | write | merchantapi.accounts.regions.batchCreate | content |
| `merchantap_acco_regi_batch_a8e1` | destructive | merchantapi.accounts.regions.batchDelete | content |
| `merchantap_acco_regi_batch_bf9d` | write | merchantapi.accounts.regions.batchUpdate | content |
| `merchantap_accou_data_file_get` | read | merchantapi.accounts.dataSources.fileUploads.get | content |
| `merchantap_accou_users_me_verif` | write | merchantapi.accounts.users.me.verifySelf | content |
| `merchantap_accoun_autofe_get_au` | read | merchantapi.accounts.autofeedSettings.getAutofeedSettings | content |
| `merchantap_accoun_autofe_update` | write | merchantapi.accounts.autofeedSettings.updateAutofeedSettings | content |
| `merchantap_accoun_automa_get_au` | read | merchantapi.accounts.automaticImprovements.getAutomaticImprovements | content |
| `merchantap_accoun_automa_update` | write | merchantapi.accounts.automaticImprovements.updateAutomaticImprovements | content |
| `merchantap_accoun_conver_create` | write | merchantapi.accounts.conversionSources.create | content |
| `merchantap_accoun_conver_delete` | destructive | merchantapi.accounts.conversionSources.delete | content |
| `merchantap_accoun_conver_undele` | write | merchantapi.accounts.conversionSources.undelete | content |
| `merchantap_accoun_convers_patch` | write | merchantapi.accounts.conversionSources.patch | content |
| `merchantap_accoun_data_s_create` | write | merchantapi.accounts.dataSources.create | content |
| `merchantap_accoun_data_s_delete` | destructive | merchantapi.accounts.dataSources.delete | content |
| `merchantap_accoun_data_so_fetch` | write | merchantapi.accounts.dataSources.fetch | content |
| `merchantap_accoun_data_so_patch` | write | merchantapi.accounts.dataSources.patch | content |
| `merchantap_accoun_develo_get_ac` | read | merchantapi.accounts.developerRegistration.getAccountForGcpRegistration | content |
| `merchantap_accoun_develo_get_de` | read | merchantapi.accounts.developerRegistration.getDeveloperRegistration | content |
| `merchantap_accoun_develo_regist` | write | merchantapi.accounts.developerRegistration.registerGcp | content |
| `merchantap_accoun_develo_unregi` | destructive | merchantapi.accounts.developerRegistration.unregisterGcp | content |
| `merchantap_accoun_email_get_ema` | read | merchantapi.accounts.emailPreferences.getEmailPreferences | content |
| `merchantap_accoun_email_update` | write | merchantapi.accounts.emailPreferences.updateEmailPreferences | content |
| `merchantap_accoun_gbp_ac_link_g` | write | merchantapi.accounts.gbpAccounts.linkGbpAccount | content |
| `merchantap_accoun_homepa_get_ho` | read | merchantapi.accounts.homepage.getHomepage | content |
| `merchantap_accoun_homepa_unclai` | destructive | merchantapi.accounts.homepage.unclaim | content |
| `merchantap_accoun_homepa_update` | write | merchantapi.accounts.homepage.updateHomepage | content |
| `merchantap_accoun_homepag_claim` | write | merchantapi.accounts.homepage.claim | content |
| `merchantap_accoun_lfp_in_insert` | write | merchantapi.accounts.lfpInventories.insert | content |
| `merchantap_accoun_lfp_sa_insert` | write | merchantapi.accounts.lfpSales.insert | content |
| `merchantap_accoun_lfp_st_delete` | destructive | merchantapi.accounts.lfpStores.delete | content |
| `merchantap_accoun_lfp_st_insert` | write | merchantapi.accounts.lfpStores.insert | content |
| `merchantap_accoun_loyalt_manage` | write | merchantapi.accounts.loyaltyCustomers.manage | content |
| `merchantap_accoun_mercha_delete` | destructive | merchantapi.accounts.merchantReviews.delete | content |
| `merchantap_accoun_mercha_insert` | write | merchantapi.accounts.merchantReviews.insert | content |
| `merchantap_accoun_notifi_create` | write | merchantapi.accounts.notificationsubscriptions.create | content |
| `merchantap_accoun_notifi_delete` | destructive | merchantapi.accounts.notificationsubscriptions.delete | content |
| `merchantap_accoun_notific_patch` | write | merchantapi.accounts.notificationsubscriptions.patch | content |
| `merchantap_accoun_omnich_create` | write | merchantapi.accounts.omnichannelSettings.create | content |
| `merchantap_accoun_omnich_reques` | write | merchantapi.accounts.omnichannelSettings.requestInventoryVerification | content |
| `merchantap_accoun_omnicha_patch` | write | merchantapi.accounts.omnichannelSettings.patch | content |
| `merchantap_accoun_online_create` | write | merchantapi.accounts.onlineReturnPolicies.create | content |
| `merchantap_accoun_online_delete` | destructive | merchantapi.accounts.onlineReturnPolicies.delete | content |
| `merchantap_accoun_order_create` | write | merchantapi.accounts.orderTrackingSignals.create | content |
| `merchantap_accoun_product_patch` | write | merchantapi.accounts.productInputs.patch | content |
| `merchantap_accoun_progra_disabl` | destructive | merchantapi.accounts.programs.disable | content |
| `merchantap_accoun_progra_enable` | write | merchantapi.accounts.programs.enable | content |
| `merchantap_accoun_promot_insert` | write | merchantapi.accounts.promotions.insert | content |
| `merchantap_accoun_region_create` | write | merchantapi.accounts.regions.create | content |
| `merchantap_accoun_region_delete` | destructive | merchantapi.accounts.regions.delete | content |
| `merchantap_accoun_regions_patch` | write | merchantapi.accounts.regions.patch | content |
| `merchantap_accoun_relatio_patch` | write | merchantapi.accounts.relationships.patch | content |
| `merchantap_accoun_report_search` | read | merchantapi.accounts.reports.search | content |
| `merchantap_accoun_servic_approv` | write | merchantapi.accounts.services.approve | content |
| `merchantap_accoun_servic_propos` | write | merchantapi.accounts.services.propose | content |
| `merchantap_accoun_servic_reject` | write | merchantapi.accounts.services.reject | content |
| `merchantap_accoun_shippi_get_sh` | read | merchantapi.accounts.shippingSettings.getShippingSettings | content |
| `merchantap_accoun_shippi_insert` | write | merchantapi.accounts.shippingSettings.insert | content |
| `merchantap_accoun_terms_retriev` | read | merchantapi.accounts.termsOfServiceAgreementStates.retrieveForApplication | content |
| `merchantap_account_aggrega_list` | read | merchantapi.accounts.aggregateProductStatuses.list | content |
| `merchantap_account_convers_list` | read | merchantapi.accounts.conversionSources.list | content |
| `merchantap_account_conversi_get` | read | merchantapi.accounts.conversionSources.get | content |
| `merchantap_account_data_so_list` | read | merchantapi.accounts.dataSources.list | content |
| `merchantap_account_data_sou_get` | read | merchantapi.accounts.dataSources.get | content |
| `merchantap_account_gbp_acc_list` | read | merchantapi.accounts.gbpAccounts.list | content |
| `merchantap_account_lfp_merc_get` | read | merchantapi.accounts.lfpMerchantStates.get | content |
| `merchantap_account_lfp_sto_list` | read | merchantapi.accounts.lfpStores.list | content |
| `merchantap_account_lfp_stor_get` | read | merchantapi.accounts.lfpStores.get | content |
| `merchantap_account_merchan_list` | read | merchantapi.accounts.merchantReviews.list | content |
| `merchantap_account_merchant_get` | read | merchantapi.accounts.merchantReviews.get | content |
| `merchantap_account_notific_list` | read | merchantapi.accounts.notificationsubscriptions.list | content |
| `merchantap_account_notifica_get` | read | merchantapi.accounts.notificationsubscriptions.get | content |
| `merchantap_account_omnicha_list` | read | merchantapi.accounts.omnichannelSettings.list | content |
| `merchantap_account_omnichan_get` | read | merchantapi.accounts.omnichannelSettings.get | content |
| `merchantap_account_online_list` | read | merchantapi.accounts.onlineReturnPolicies.list | content |
| `merchantap_account_online_r_get` | read | merchantapi.accounts.onlineReturnPolicies.get | content |
| `merchantap_account_products_get` | read | merchantapi.accounts.products.get | content |
| `merchantap_account_program_list` | read | merchantapi.accounts.programs.list | content |
| `merchantap_account_programs_get` | read | merchantapi.accounts.programs.get | content |
| `merchantap_account_promoti_list` | read | merchantapi.accounts.promotions.list | content |
| `merchantap_account_promotio_get` | read | merchantapi.accounts.promotions.get | content |
| `merchantap_account_regions_list` | read | merchantapi.accounts.regions.list | content |
| `merchantap_account_relatio_list` | read | merchantapi.accounts.relationships.list | content |
| `merchantap_account_relation_get` | read | merchantapi.accounts.relationships.get | content |
| `merchantap_account_service_list` | read | merchantapi.accounts.services.list | content |
| `merchantap_account_services_get` | read | merchantapi.accounts.services.get | content |
| `merchantap_account_terms_of_get` | read | merchantapi.accounts.termsOfServiceAgreementStates.get | content |
| `merchantap_account_users_create` | write | merchantapi.accounts.users.create | content |
| `merchantap_account_users_delete` | destructive | merchantapi.accounts.users.delete | content |
| `merchantap_accounts_create_and` | write | merchantapi.accounts.createAndConfigure | content |
| `merchantap_accounts_create_test` | write | merchantapi.accounts.createTestAccount | content |
| `merchantap_accounts_delete` | destructive | merchantapi.accounts.delete | content |
| `merchantap_accounts_get` | read | merchantapi.accounts.get | content |
| `merchantap_accounts_issues_list` | read | merchantapi.accounts.issues.list | content |
| `merchantap_accounts_limits_get` | read | merchantapi.accounts.limits.get | content |
| `merchantap_accounts_limits_list` | read | merchantapi.accounts.limits.list | content |
| `merchantap_accounts_list` | read | merchantapi.accounts.list | content |
| `merchantap_accounts_list_subacc` | read | merchantapi.accounts.listSubaccounts | content |
| `merchantap_accounts_patch` | write | merchantapi.accounts.patch | content |
| `merchantap_accounts_product_get` | read | merchantapi.accounts.productReviews.get | content |
| `merchantap_accounts_quotas_list` | read | merchantapi.accounts.quotas.list | content |
| `merchantap_accounts_regions_get` | read | merchantapi.accounts.regions.get | content |
| `merchantap_accounts_users_get` | read | merchantapi.accounts.users.get | content |
| `merchantap_accounts_users_list` | read | merchantapi.accounts.users.list | content |
| `merchantap_accounts_users_patch` | write | merchantapi.accounts.users.patch | content |
| `merchantap_issuereso_renderacco` | read | merchantapi.issueresolution.renderaccountissues | content |
| `merchantap_issuereso_renderprod` | read | merchantapi.issueresolution.renderproductissues | content |
| `merchantap_issuereso_triggeract` | write | merchantapi.issueresolution.triggeraction | content |
| `merchantap_terms_of_retrieve_l` | read | merchantapi.termsOfService.retrieveLatest | content |
| `merchantap_terms_of_serv_accept` | write | merchantapi.termsOfService.accept | content |
| `merchantap_terms_of_service_get` | read | merchantapi.termsOfService.get | content |

## Gateway tools (3)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_call` | dynamic | Call an API method | (none) |
| `api_describe` | read | Describe an API method | (none) |
| `api_search` | read | Search API methods | (none) |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gmerchant: API methods | (none) |

## Generated APIs

Each API links to Google's documentation for it, as Google's Discovery directory names it (`documentationLink`, kept in `data/catalog.json`). The link is the API's documentation home, not a page per method: the directory gives no link per method, and Google's REST reference pages are laid out differently from product to product.

- Merchant API (`merchantapi/reviews_v1alpha`), 8 methods in the catalog. Documentation: <https://developers.google.com/merchant/api>
- CSS API (`css/v1`), 13 methods in the catalog. Documentation: <https://developers.google.com/comparison-shopping-services/api/overview>
- Manufacturer Center API (`manufacturers/v1`), 8 methods in the catalog. Documentation: <https://developers.google.com/manufacturers/>
- Merchant API (`merchantapi/accounts_v1`), 76 methods in the catalog. Documentation: <https://developers.google.com/merchant/api>
- Merchant API (`merchantapi/conversions_v1`), 6 methods in the catalog. Documentation: <https://developers.google.com/merchant/api>
- Merchant API (`merchantapi/datasources_v1`), 7 methods in the catalog. Documentation: <https://developers.google.com/merchant/api>
- Merchant API (`merchantapi/inventories_v1`), 6 methods in the catalog. Documentation: <https://developers.google.com/merchant/api>
- Merchant API (`merchantapi/issueresolution_v1`), 4 methods in the catalog. Documentation: <https://developers.google.com/merchant/api>
- Merchant API (`merchantapi/lfp_v1`), 7 methods in the catalog. Documentation: <https://developers.google.com/merchant/api>
- Merchant API (`merchantapi/loyaltycustomers_v1`), 1 methods in the catalog. Documentation: <https://developers.google.com/merchant/api>
- Merchant API (`merchantapi/notifications_v1`), 5 methods in the catalog. Documentation: <https://developers.google.com/merchant/api>
- Merchant API (`merchantapi/ordertracking_v1`), 1 methods in the catalog. Documentation: <https://developers.google.com/merchant/api>
- Merchant API (`merchantapi/products_v1`), 5 methods in the catalog. Documentation: <https://developers.google.com/merchant/api>
- Merchant API (`merchantapi/promotions_v1`), 3 methods in the catalog. Documentation: <https://developers.google.com/merchant/api>
- Merchant API (`merchantapi/quota_v1`), 3 methods in the catalog. Documentation: <https://developers.google.com/merchant/api>
- Merchant API (`merchantapi/reports_v1`), 1 methods in the catalog. Documentation: <https://developers.google.com/merchant/api>

## Gateway APIs (reached through api_search, api_describe, api_call)

- Merchant API (`merchantapi/accounts_v1`), 76 methods. Documentation: <https://developers.google.com/merchant/api>
- Merchant API (`merchantapi/conversions_v1`), 6 methods. Documentation: <https://developers.google.com/merchant/api>
- Merchant API (`merchantapi/datasources_v1`), 7 methods. Documentation: <https://developers.google.com/merchant/api>
- Merchant API (`merchantapi/inventories_v1`), 6 methods. Documentation: <https://developers.google.com/merchant/api>
- Merchant API (`merchantapi/issueresolution_v1`), 4 methods. Documentation: <https://developers.google.com/merchant/api>
- Merchant API (`merchantapi/lfp_v1`), 7 methods. Documentation: <https://developers.google.com/merchant/api>
- Merchant API (`merchantapi/notifications_v1`), 5 methods. Documentation: <https://developers.google.com/merchant/api>
- Merchant API (`merchantapi/ordertracking_v1`), 1 methods. Documentation: <https://developers.google.com/merchant/api>
- Merchant API (`merchantapi/products_v1`), 5 methods. Documentation: <https://developers.google.com/merchant/api>
- Merchant API (`merchantapi/promotions_v1`), 3 methods. Documentation: <https://developers.google.com/merchant/api>
- Merchant API (`merchantapi/quota_v1`), 3 methods. Documentation: <https://developers.google.com/merchant/api>
- Merchant API (`merchantapi/reports_v1`), 1 methods. Documentation: <https://developers.google.com/merchant/api>

