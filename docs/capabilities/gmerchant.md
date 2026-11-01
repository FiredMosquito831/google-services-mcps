# Merchant Center (`gmerchant`)

Merchant Center: Merchant API and Comparison Shopping Service, through a service account key.

- Plugin: `gmerchant`, MCP server: `gmerchant`, login: Service account key, then `setup-service-account` (no login)
- Install: `claude plugin install gmerchant@google-services-mcps`
- Tools: 153 total. Curated 3, per-method 146, gateway 3. Read 72, write 60, destructive 20, dynamic 1.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 153, google 16, curated 6 tools, each counting the 3 runtime tools this server registers (`auth_setup_service_account`, `auth_status`, `health`). "(all)" means the product has no such toolset yet, so it lists every tool.

## Not registered by this server (14)

The tool map (`plugins/<id>/tool-map.json`) also lists these, so the consent hook knows every name, but this server never registers them, and the counts above leave them out.

- Sign-in tools of other sign-in kinds: `account_remove`, `account_set_default`, `accounts_list`, `auth_login`, `auth_setup_admin`, `auth_setup_client`.
- Tools the service account key's fixed scopes do not cover (they need manufacturercenter): `manufactu_accounts_products_get`, `manufactu_accts_products_delete`, `manufactu_accts_products_update`, `manufactu_certifications_delete`, `manufactur_accts_products_list`, `manufactur_certifications_get`, `manufactur_certifications_list`, `manufactur_certifications_patch`.

## Toolset google (13)

The tools that match Google's official MCP server for this product (https://developers.google.com/merchant/api/guides/agentic-tools/merchant-data-mcp).

| Tool | Google's tool | Note |
|---|---|---|
| `merchantap_accounts_list` | `list_accounts` | The Merchant Center accounts the service account can reach (accounts.list). Start here for an account id. |
| `merchantap_accounts_issues_list` | `list_account_issues` | Account-level issues that affect the whole account. |
| `merchantap_accts_programs_list` | `list_programs` | Programs, such as free listings and Shopping ads, with their state, regions and unmet requirements. |
| `merc_get_automatic_improvements` | `get_automatic_improvements` | Automatic improvement settings: item updates, image improvements and shipping improvements. |
| `merchantap_accts_products_list` | `list_products` | The products of an account, a page at a time (products.list; the name ends in a hash because of the 64-character budget). |
| `merchanta_accounts_products_get` | `get_product_by_name` | One product by its exact resource name, accounts/{account}/products/{product}. |
| `merchantap_accts_statuses_list` | `list_aggregate_product_statuses` | Product issues aggregated by reporting context and country, for the health of the product data. |
| `merchantap_accts_reports_search` | `report_search` | A Merchant reports query (product performance, statuses, price insights, competitive visibility) in the Merchant Center Query Language. |
| `merc_accounts_data_sources_list` | `list_data_sources` | The data sources of an account. |
| `merch_accounts_data_sources_get` | `get_data_source` | One data source. |
| `merch_accts_data_sources_create` | `create_data_source` | Creates a data source. A write, so it asks first. |
| `merchantap_accts_sources_fetch` | `fetch_data_source` | Fetches and processes a data source's file now. Google says it triggers processing, so since 1.24.2 (D2) the suite counts it as a write, and it asks first. |
| `merchantap_sources_uploads_get` | `get_file_upload` | The latest file upload of a data source and its processing state (accounts/{account}/dataSources/{datasource}/fileUploads/latest). |

## Curated tools (3)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `auth_setup_service_account` | write | Set up the service account key | (none) |
| `auth_status` | read | Sign-in status | (none) |
| `health` | read | Server health | (none) |

## Per-method tools (146)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `css_accounts_css_products_get` | read | css.accounts.cssProducts.get | content |
| `css_accounts_css_products_list` | read | css.accounts.cssProducts.list | content |
| `css_accounts_get` | read | css.accounts.get | content |
| `css_accounts_labels_create` | write | css.accounts.labels.create | content |
| `css_accounts_labels_delete` | destructive | css.accounts.labels.delete | content |
| `css_accounts_labels_list` | read | css.accounts.labels.list | content |
| `css_accounts_labels_patch` | write | css.accounts.labels.patch | content |
| `css_accounts_quotas_list` | read | css.accounts.quotas.list | content |
| `css_accounts_update_labels` | write | css.accounts.updateLabels | content |
| `css_accts_delete` | destructive | css.accounts.cssProductInputs.delete | content |
| `css_accts_insert` | write | css.accounts.cssProductInputs.insert | content |
| `css_accts_list_child_accts` | read | css.accounts.listChildAccounts | content |
| `css_accts_patch` | write | css.accounts.cssProductInputs.patch | content |
| `mer_accounts_data_sources_patch` | write | merchantapi.accounts.dataSources.patch | content |
| `mer_omnichannel_settings_create` | write | merchantapi.accounts.omnichannelSettings.create | content |
| `mer_providers_link_lfp_provider` | write | merchantapi.accounts.omnichannelSettings.lfpProviders.linkLfpProvider | content |
| `mer_registration_unregister_gcp` | destructive | merchantapi.accounts.developerRegistration.unregisterGcp | content |
| `merc_accounts_data_sources_list` | read | merchantapi.accounts.dataSources.list | content |
| `merc_accts_product_reviews_list` | read | merchantapi.accounts.productReviews.list | content |
| `merc_get_automatic_improvements` | read | merchantapi.accounts.automaticImprovements.getAutomaticImprovements | content |
| `merc_get_developer_registration` | read | merchantapi.accounts.developerRegistration.getDeveloperRegistration | content |
| `merc_omnichannel_settings_patch` | write | merchantapi.accounts.omnichannelSettings.patch | content |
| `merch_accounts_data_sources_get` | read | merchantapi.accounts.dataSources.get | content |
| `merch_accts_data_sources_create` | write | merchantapi.accounts.dataSources.create | content |
| `merch_accts_data_sources_delete` | destructive | merchantapi.accounts.dataSources.delete | content |
| `merch_accts_product_reviews_get` | read | merchantapi.accounts.productReviews.get | content |
| `merch_omnichannel_settings_list` | read | merchantapi.accounts.omnichannelSettings.list | content |
| `merch_registration_register_gcp` | write | merchantapi.accounts.developerRegistration.registerGcp | content |
| `mercha_checkout_settings_create` | write | merchantapi.accounts.programs.checkoutSettings.create | content |
| `mercha_delete_checkout_settings` | destructive | merchantapi.accounts.programs.checkoutSettings.deleteCheckoutSettings | content |
| `mercha_homepage_update_homepage` | write | merchantapi.accounts.homepage.updateHomepage | content |
| `mercha_omnichannel_settings_get` | read | merchantapi.accounts.omnichannelSettings.get | content |
| `mercha_reg_get_acc_for_gcp_regi` | read | merchantapi.accounts.developerRegistration.getAccountForGcpRegistration | content |
| `mercha_request_inv_verification` | write | merchantapi.accounts.omnichannelSettings.requestInventoryVerification | content |
| `mercha_retrieve_for_application` | read | merchantapi.accounts.termsOfServiceAgreementStates.retrieveForApplication | content |
| `mercha_shipping_settings_insert` | write | merchantapi.accounts.shippingSettings.insert | content |
| `mercha_update_autofeed_settings` | write | merchantapi.accounts.autofeedSettings.updateAutofeedSettings | content |
| `mercha_update_business_identity` | write | merchantapi.accounts.businessIdentity.updateBusinessIdentity | content |
| `mercha_update_checkout_settings` | write | merchantapi.accounts.programs.checkoutSettings.updateCheckoutSettings | content |
| `mercha_update_email_preferences` | write | merchantapi.accounts.emailPreferences.updateEmailPreferences | content |
| `merchanta_accounts_products_get` | read | merchantapi.accounts.products.get | content |
| `merchanta_accounts_programs_get` | read | merchantapi.accounts.programs.get | content |
| `merchanta_accounts_regions_list` | read | merchantapi.accounts.regions.list | content |
| `merchanta_accounts_services_get` | read | merchantapi.accounts.services.get | content |
| `merchanta_accounts_users_create` | write | merchantapi.accounts.users.create | content |
| `merchanta_accounts_users_delete` | destructive | merchantapi.accounts.users.delete | content |
| `merchanta_accts_lfp_invs_insert` | write | merchantapi.accounts.lfpInventories.insert | content |
| `merchanta_accts_lfp_stores_list` | read | merchantapi.accounts.lfpStores.list | content |
| `merchanta_accts_policies_create` | write | merchantapi.accounts.onlineReturnPolicies.create | content |
| `merchanta_accts_policies_delete` | destructive | merchantapi.accounts.onlineReturnPolicies.delete | content |
| `merchanta_accts_programs_enable` | write | merchantapi.accounts.programs.enable | content |
| `merchanta_accts_promotions_list` | read | merchantapi.accounts.promotions.list | content |
| `merchanta_accts_services_reject` | write | merchantapi.accounts.services.reject | content |
| `merchanta_get_autofeed_settings` | read | merchantapi.accounts.autofeedSettings.getAutofeedSettings | content |
| `merchanta_get_business_identity` | read | merchantapi.accounts.businessIdentity.getBusinessIdentity | content |
| `merchanta_get_checkout_settings` | read | merchantapi.accounts.programs.checkoutSettings.getCheckoutSettings | content |
| `merchanta_get_email_preferences` | read | merchantapi.accounts.emailPreferences.getEmailPreferences | content |
| `merchanta_get_shipping_settings` | read | merchantapi.accounts.shippingSettings.getShippingSettings | content |
| `merchanta_homepage_get_homepage` | read | merchantapi.accounts.homepage.getHomepage | content |
| `merchantap_acc_imp_upd_aut_impr` | write | merchantapi.accounts.automaticImprovements.updateAutomaticImprovements | content |
| `merchantap_acc_lfp_mer_stat_get` | read | merchantapi.accounts.lfpMerchantStates.get | content |
| `merchantap_acc_pro_reg_inv_dele` | destructive | merchantapi.accounts.products.regionalInventories.delete | content |
| `merchantap_acc_pro_reg_inv_inse` | write | merchantapi.accounts.products.regionalInventories.insert | content |
| `merchantap_acc_pro_reg_inv_list` | read | merchantapi.accounts.products.regionalInventories.list | content |
| `merchantap_acco_prod_revi_delet` | destructive | merchantapi.accounts.productReviews.delete | content |
| `merchantap_acco_prod_revi_inser` | write | merchantapi.accounts.productReviews.insert | content |
| `merchantap_accounts_delete` | destructive | merchantapi.accounts.delete | content |
| `merchantap_accounts_get` | read | merchantapi.accounts.get | content |
| `merchantap_accounts_issues_list` | read | merchantapi.accounts.issues.list | content |
| `merchantap_accounts_limits_get` | read | merchantapi.accounts.limits.get | content |
| `merchantap_accounts_limits_list` | read | merchantapi.accounts.limits.list | content |
| `merchantap_accounts_list` | read | merchantapi.accounts.list | content |
| `merchantap_accounts_patch` | write | merchantapi.accounts.patch | content |
| `merchantap_accounts_quotas_list` | read | merchantapi.accounts.quotas.list | content |
| `merchantap_accounts_regions_get` | read | merchantapi.accounts.regions.get | content |
| `merchantap_accounts_users_get` | read | merchantapi.accounts.users.get | content |
| `merchantap_accounts_users_list` | read | merchantapi.accounts.users.list | content |
| `merchantap_accounts_users_patch` | write | merchantapi.accounts.users.patch | content |
| `merchantap_accts_gbp_accts_list` | read | merchantapi.accounts.gbpAccounts.list | content |
| `merchantap_accts_homepage_claim` | write | merchantapi.accounts.homepage.claim | content |
| `merchantap_accts_inputs_delete` | destructive | merchantapi.accounts.productInputs.delete | content |
| `merchantap_accts_inputs_insert` | write | merchantapi.accounts.productInputs.insert | content |
| `merchantap_accts_inputs_patch` | write | merchantapi.accounts.productInputs.patch | content |
| `merchantap_accts_lfp_stores_get` | read | merchantapi.accounts.lfpStores.get | content |
| `merchantap_accts_link_gbp_acct` | write | merchantapi.accounts.gbpAccounts.linkGbpAccount | content |
| `merchantap_accts_me_verify_self` | write | merchantapi.accounts.users.me.verifySelf | content |
| `merchantap_accts_policies_get` | read | merchantapi.accounts.onlineReturnPolicies.get | content |
| `merchantap_accts_policies_list` | read | merchantapi.accounts.onlineReturnPolicies.list | content |
| `merchantap_accts_products_list` | read | merchantapi.accounts.products.list | content |
| `merchantap_accts_programs_list` | read | merchantapi.accounts.programs.list | content |
| `merchantap_accts_promotions_get` | read | merchantapi.accounts.promotions.get | content |
| `merchantap_accts_regions_create` | write | merchantapi.accounts.regions.create | content |
| `merchantap_accts_regions_delete` | destructive | merchantapi.accounts.regions.delete | content |
| `merchantap_accts_regions_patch` | write | merchantapi.accounts.regions.patch | content |
| `merchantap_accts_reports_search` | read | merchantapi.accounts.reports.search | content |
| `merchantap_accts_reviews_delete` | destructive | merchantapi.accounts.merchantReviews.delete | content |
| `merchantap_accts_reviews_get` | read | merchantapi.accounts.merchantReviews.get | content |
| `merchantap_accts_reviews_insert` | write | merchantapi.accounts.merchantReviews.insert | content |
| `merchantap_accts_reviews_list` | read | merchantapi.accounts.merchantReviews.list | content |
| `merchantap_accts_sales_insert` | write | merchantapi.accounts.lfpSales.insert | content |
| `merchantap_accts_services_list` | read | merchantapi.accounts.services.list | content |
| `merchantap_accts_signals_create` | write | merchantapi.accounts.orderTrackingSignals.create | content |
| `merchantap_accts_sources_create` | write | merchantapi.accounts.conversionSources.create | content |
| `merchantap_accts_sources_delete` | destructive | merchantapi.accounts.conversionSources.delete | content |
| `merchantap_accts_sources_fetch` | write | merchantapi.accounts.dataSources.fetch | content |
| `merchantap_accts_sources_get` | read | merchantapi.accounts.conversionSources.get | content |
| `merchantap_accts_sources_list` | read | merchantapi.accounts.conversionSources.list | content |
| `merchantap_accts_sources_patch` | write | merchantapi.accounts.conversionSources.patch | content |
| `merchantap_accts_states_get` | read | merchantapi.accounts.termsOfServiceAgreementStates.get | content |
| `merchantap_accts_statuses_list` | read | merchantapi.accounts.aggregateProductStatuses.list | content |
| `merchantap_accts_stores_delete` | destructive | merchantapi.accounts.lfpStores.delete | content |
| `merchantap_accts_stores_insert` | write | merchantapi.accounts.lfpStores.insert | content |
| `merchantap_create` | write | merchantapi.accounts.notificationsubscriptions.create | content |
| `merchantap_create_and_configure` | write | merchantapi.accounts.createAndConfigure | content |
| `merchantap_create_test_acct` | write | merchantapi.accounts.createTestAccount | content |
| `merchantap_customers_manage` | write | merchantapi.accounts.loyaltyCustomers.manage | content |
| `merchantap_delete` | destructive | merchantapi.accounts.notificationsubscriptions.delete | content |
| `merchantap_get` | read | merchantapi.accounts.notificationsubscriptions.get | content |
| `merchantap_get_business_info` | read | merchantapi.accounts.businessInfo.getBusinessInfo | content |
| `merchantap_homepage_unclaim` | destructive | merchantapi.accounts.homepage.unclaim | content |
| `merchantap_list` | read | merchantapi.accounts.notificationsubscriptions.list | content |
| `merchantap_list_subaccounts` | read | merchantapi.accounts.listSubaccounts | content |
| `merchantap_patch` | write | merchantapi.accounts.notificationsubscriptions.patch | content |
| `merchantap_products_invs_delete` | destructive | merchantapi.accounts.products.localInventories.delete | content |
| `merchantap_products_invs_insert` | write | merchantapi.accounts.products.localInventories.insert | content |
| `merchantap_products_invs_list` | read | merchantapi.accounts.products.localInventories.list | content |
| `merchantap_programs_disable` | destructive | merchantapi.accounts.programs.disable | content |
| `merchantap_promotions_insert` | write | merchantapi.accounts.promotions.insert | content |
| `merchantap_providers_find` | read | merchantapi.accounts.omnichannelSettings.lfpProviders.find | content |
| `merchantap_regions_batch_create` | write | merchantapi.accounts.regions.batchCreate | content |
| `merchantap_regions_batch_delete` | destructive | merchantapi.accounts.regions.batchDelete | content |
| `merchantap_regions_batch_update` | write | merchantapi.accounts.regions.batchUpdate | content |
| `merchantap_relationships_get` | read | merchantapi.accounts.relationships.get | content |
| `merchantap_relationships_list` | read | merchantapi.accounts.relationships.list | content |
| `merchantap_relationships_patch` | write | merchantapi.accounts.relationships.patch | content |
| `merchantap_renderaccountissues` | read | merchantapi.issueresolution.renderaccountissues | content |
| `merchantap_renderproductissues` | read | merchantapi.issueresolution.renderproductissues | content |
| `merchantap_retrieve_latest` | read | merchantapi.termsOfService.retrieveLatest | content |
| `merchantap_service_accept` | write | merchantapi.termsOfService.accept | content |
| `merchantap_services_approve` | write | merchantapi.accounts.services.approve | content |
| `merchantap_services_propose` | write | merchantapi.accounts.services.propose | content |
| `merchantap_sources_undelete` | write | merchantapi.accounts.conversionSources.undelete | content |
| `merchantap_sources_uploads_get` | read | merchantapi.accounts.dataSources.fileUploads.get | content |
| `merchantap_terms_of_service_get` | read | merchantapi.termsOfService.get | content |
| `merchantap_triggeraction` | write | merchantapi.issueresolution.triggeraction | content |
| `merchantap_update_business_info` | write | merchantapi.accounts.businessInfo.updateBusinessInfo | content |

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

