# Ads and Publisher (`gads`)

Google Ads API (accounts, campaigns, ad groups, ads, keywords, budgets, conversions, assets and GAQL reporting, with every other method through the gateway), plus advertising and publisher APIs: Search Ads 360, Display & Video 360, Campaign Manager, Ad Exchange, AdSense, AdMob, Real-time Bidding and more.

- Plugin: `gads`, MCP server: `gads`, login: Desktop OAuth client, then `login business`
- Install: `claude plugin install gads@google-services-mcps`
- Tools: 338 total. Curated 11, per-method 323, gateway 3. Read 105, write 189, destructive 20, dynamic 24.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 338, google 10, curated 14 tools, each counting the 7 runtime tools this server registers (`account_remove`, `account_set_default`, `accounts_list`, `auth_login`, `auth_setup_client`, `auth_status`, `health`). "(all)" means the product has no such toolset yet, so it lists every tool.

## Not registered by this server (2)

The tool map (`plugins/<id>/tool-map.json`) also lists these, so the consent hook knows every name, but this server never registers them, and the counts above leave them out.

- Sign-in tools of other sign-in kinds: `auth_setup_admin`, `auth_setup_service_account`.

## Toolset google (3)

The tools that match Google's official MCP server for this product (https://developers.google.com/google-ads/api/docs/developer-toolkit/mcp-server, https://github.com/googleads/google-ads-mcp).

| Tool | Google's tool | Note |
|---|---|---|
| `ads_list_customers` | `list_accessible_customers` | The customer resource names the signed-in user can reach; the digits are the customer_id of the other tools. Google's server exposes it as customers_list_accessible_customers. |
| `ads_search` | `search` | One page of GAQL, at most 500 rows, given as text or as fields, resource, conditions, orderings and limit (Google's structured form, with PARAMETERS omit_unselected_resource_names=true). It calls googleAds:search, not searchStream, and never sends pageSize; next_page_token with page_token reads the next page. Google's server is read-only, so ads_mutate (validate first, then gated changes) is not in this list; it stays in the all and curated toolsets. The manager account is ads_login_customer_id (GSM_ADS_LOGIN_CUSTOMER_ID) unless a call names its own login_customer_id, which applies to that call only. |
| `ads_resource_metadata` | `get_resource_metadata` | The two field queries Google's get_resource_metadata runs (the resource's attributes, then every field selectable with it), as selectable, filterable and sortable name lists. |

## Curated tools (11)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `account_remove` | write | Remove a signed-in account | (none) |
| `account_set_default` | write | Set the default account | (none) |
| `accounts_list` | read | Signed-in accounts | (none) |
| `ads_list_customers` | read | List Google Ads accounts | adwords |
| `ads_mutate` | dynamic | Change Google Ads resources | adwords |
| `ads_resource_metadata` | read | Fields of a Google Ads resource | adwords |
| `ads_search` | read | Search Google Ads (GAQL) | adwords |
| `auth_login` | write | Sign in to Google | (none) |
| `auth_setup_client` | write | Save the Google OAuth client | (none) |
| `auth_status` | read | Sign-in status | (none) |
| `health` | read | Server health | (none) |

## Per-method tools (323)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `admob_accounts_ad_units_list` | read | admob.accounts.adUnits.list | admob.readonly |
| `admob_accounts_apps_list` | read | admob.accounts.apps.list | admob.readonly |
| `admob_accounts_get` | read | admob.accounts.get | admob.readonly, admob.report |
| `admob_accounts_list` | read | admob.accounts.list | admob.readonly, admob.report |
| `admob_accounts_mediation_report_generate` | read | admob.accounts.mediationReport.generate | admob.readonly, admob.report |
| `admob_accounts_network_report_generate` | read | admob.accounts.networkReport.generate | admob.readonly, admob.report |
| `dis_youtube_asset_types_associations_list` | read | displayvideo.advertisers.lineItems.youtubeAssetTypes.youtubeAssetAssociations.list | display-video |
| `disp_negative_keyword_lists_keywords_list` | read | displayvideo.advertisers.negativeKeywordLists.negativeKeywords.list | display-video |
| `displa_line_items_bulk_edit_asgn_tgt_opts` | write | displayvideo.advertisers.lineItems.bulkEditAssignedTargetingOptions | display-video |
| `displa_line_items_bulk_list_asgn_tgt_opts` | read | displayvideo.advertisers.lineItems.bulkListAssignedTargetingOptions | display-video |
| `displa_location_lists_locations_bulk_edit` | write | displayvideo.advertisers.locationLists.assignedLocations.bulkEdit | display-video |
| `displayv_invoices_lookup_invoice_currency` | read | displayvideo.advertisers.invoices.lookupInvoiceCurrency | display-video, display-video-mediaplanning |
| `displayv_line_items_tgt_types_opts_create` | write | displayvideo.advertisers.lineItems.targetingTypes.assignedTargetingOptions.create | display-video |
| `displayv_line_items_tgt_types_opts_delete` | destructive | displayvideo.advertisers.lineItems.targetingTypes.assignedTargetingOptions.delete | display-video |
| `displayvi_advertisers_ad_group_ads_create` | write | displayvideo.advertisers.adGroupAds.create | display-video |
| `displayvi_advertisers_ad_group_ads_delete` | destructive | displayvideo.advertisers.adGroupAds.delete | display-video |
| `displayvi_advertisers_channels_sites_list` | read | displayvideo.advertisers.channels.sites.list | display-video |
| `displayvi_advertisers_location_lists_list` | read | displayvideo.advertisers.locationLists.list | display-video |
| `displayvi_advs_groups_tgt_types_opts_list` | read | displayvideo.advertisers.adGroups.targetingTypes.assignedTargetingOptions.list | display-video |
| `displayvi_advs_negative_keyword_lists_get` | read | displayvideo.advertisers.negativeKeywordLists.get | display-video |
| `displayvi_location_lists_locations_create` | write | displayvideo.advertisers.locationLists.assignedLocations.create | display-video |
| `displayvi_location_lists_locations_delete` | destructive | displayvideo.advertisers.locationLists.assignedLocations.delete | display-video |
| `displayvi_sdfdownloadtasks_operations_get` | read | displayvideo.sdfdownloadtasks.operations.get | display-video, doubleclickbidmanager |
| `displayvid_adv_ad_gro_you_ass_typ_ass_cre` | write | displayvideo.advertisers.adGroups.youtubeAssetTypes.youtubeAssetAssociations.create | display-video |
| `displayvid_adv_ad_gro_you_ass_typ_ass_del` | destructive | displayvideo.advertisers.adGroups.youtubeAssetTypes.youtubeAssetAssociations.delete | display-video |
| `displayvid_adv_ad_gro_you_ass_typ_ass_lis` | read | displayvideo.advertisers.adGroups.youtubeAssetTypes.youtubeAssetAssociations.list | display-video |
| `displayvid_advertisers_ad_assets_create` | write | displayvideo.advertisers.adAssets.create | display-video |
| `displayvid_advertisers_ad_assets_get` | read | displayvideo.advertisers.adAssets.get | display-video |
| `displayvid_advertisers_ad_assets_list` | read | displayvideo.advertisers.adAssets.list | display-video |
| `displayvid_advertisers_ad_assets_patch` | write | displayvideo.advertisers.adAssets.patch | display-video |
| `displayvid_advertisers_ad_group_ads_get` | read | displayvideo.advertisers.adGroupAds.get | display-video |
| `displayvid_advertisers_ad_group_ads_list` | read | displayvideo.advertisers.adGroupAds.list | display-video |
| `displayvid_advertisers_ad_group_ads_patch` | write | displayvideo.advertisers.adGroupAds.patch | display-video |
| `displayvid_advertisers_ad_groups_create` | write | displayvideo.advertisers.adGroups.create | display-video |
| `displayvid_advertisers_ad_groups_delete` | destructive | displayvideo.advertisers.adGroups.delete | display-video |
| `displayvid_advertisers_ad_groups_get` | read | displayvideo.advertisers.adGroups.get | display-video |
| `displayvid_advertisers_ad_groups_list` | read | displayvideo.advertisers.adGroups.list | display-video |
| `displayvid_advertisers_ad_groups_patch` | write | displayvideo.advertisers.adGroups.patch | display-video |
| `displayvid_advertisers_audit` | read | displayvideo.advertisers.audit | display-video |
| `displayvid_advertisers_campaigns_create` | write | displayvideo.advertisers.campaigns.create | display-video, display-video-mediaplanning |
| `displayvid_advertisers_campaigns_delete` | destructive | displayvideo.advertisers.campaigns.delete | display-video, display-video-mediaplanning |
| `displayvid_advertisers_campaigns_get` | read | displayvideo.advertisers.campaigns.get | display-video, display-video-mediaplanning |
| `displayvid_advertisers_campaigns_list` | read | displayvideo.advertisers.campaigns.list | display-video, display-video-mediaplanning |
| `displayvid_advertisers_campaigns_patch` | write | displayvideo.advertisers.campaigns.patch | display-video, display-video-mediaplanning |
| `displayvid_advertisers_channels_create` | write | displayvideo.advertisers.channels.create | display-video |
| `displayvid_advertisers_channels_get` | read | displayvideo.advertisers.channels.get | display-video |
| `displayvid_advertisers_channels_list` | read | displayvideo.advertisers.channels.list | display-video |
| `displayvid_advertisers_channels_patch` | write | displayvideo.advertisers.channels.patch | display-video |
| `displayvid_advertisers_create` | write | displayvideo.advertisers.create | display-video |
| `displayvid_advertisers_creatives_create` | write | displayvideo.advertisers.creatives.create | display-video |
| `displayvid_advertisers_creatives_delete` | destructive | displayvideo.advertisers.creatives.delete | display-video |
| `displayvid_advertisers_creatives_get` | read | displayvideo.advertisers.creatives.get | display-video |
| `displayvid_advertisers_creatives_list` | read | displayvideo.advertisers.creatives.list | display-video |
| `displayvid_advertisers_creatives_patch` | write | displayvideo.advertisers.creatives.patch | display-video |
| `displayvid_advertisers_delete` | destructive | displayvideo.advertisers.delete | display-video |
| `displayvid_advertisers_get` | read | displayvideo.advertisers.get | display-video |
| `displayvid_advertisers_invoices_list` | read | displayvideo.advertisers.invoices.list | display-video, display-video-mediaplanning |
| `displayvid_advertisers_line_items_create` | write | displayvideo.advertisers.lineItems.create | display-video |
| `displayvid_advertisers_line_items_delete` | destructive | displayvideo.advertisers.lineItems.delete | display-video |
| `displayvid_advertisers_line_items_get` | read | displayvideo.advertisers.lineItems.get | display-video |
| `displayvid_advertisers_line_items_list` | read | displayvideo.advertisers.lineItems.list | display-video |
| `displayvid_advertisers_line_items_patch` | write | displayvideo.advertisers.lineItems.patch | display-video |
| `displayvid_advertisers_list` | read | displayvideo.advertisers.list | display-video |
| `displayvid_advertisers_location_lists_get` | read | displayvideo.advertisers.locationLists.get | display-video |
| `displayvid_advertisers_patch` | write | displayvideo.advertisers.patch | display-video |
| `displayvid_advs_ad_assets_bulk_create` | write | displayvideo.advertisers.adAssets.bulkCreate | display-video |
| `displayvid_advs_chans_sites_bulk_edit` | write | displayvideo.advertisers.channels.sites.bulkEdit | display-video |
| `displayvid_advs_chans_sites_create` | write | displayvideo.advertisers.channels.sites.create | display-video |
| `displayvid_advs_chans_sites_delete` | destructive | displayvideo.advertisers.channels.sites.delete | display-video |
| `displayvid_advs_chans_sites_replace` | write | displayvideo.advertisers.channels.sites.replace | display-video |
| `displayvid_advs_edit_asgn_tgt_opts` | write | displayvideo.advertisers.editAssignedTargetingOptions | display-video |
| `displayvid_advs_groups_tgt_types_opts_get` | read | displayvideo.advertisers.adGroups.targetingTypes.assignedTargetingOptions.get | display-video |
| `displayvid_advs_insertion_orders_create` | write | displayvideo.advertisers.insertionOrders.create | display-video |
| `displayvid_advs_insertion_orders_delete` | destructive | displayvideo.advertisers.insertionOrders.delete | display-video |
| `displayvid_advs_insertion_orders_get` | read | displayvideo.advertisers.insertionOrders.get | display-video |
| `displayvid_advs_insertion_orders_list` | read | displayvideo.advertisers.insertionOrders.list | display-video |
| `displayvid_advs_insertion_orders_patch` | write | displayvideo.advertisers.insertionOrders.patch | display-video |
| `displayvid_advs_line_items_bulk_update` | write | displayvideo.advertisers.lineItems.bulkUpdate | display-video |
| `displayvid_advs_line_items_duplicate` | write | displayvideo.advertisers.lineItems.duplicate | display-video |
| `displayvid_advs_list_asgn_tgt_opts` | read | displayvideo.advertisers.listAssignedTargetingOptions | display-video |
| `displayvid_advs_location_lists_create` | write | displayvideo.advertisers.locationLists.create | display-video |
| `displayvid_advs_location_lists_patch` | write | displayvideo.advertisers.locationLists.patch | display-video |
| `displayvid_advs_tgt_types_opts_create` | write | displayvideo.advertisers.targetingTypes.assignedTargetingOptions.create | display-video |
| `displayvid_advs_tgt_types_opts_delete` | destructive | displayvideo.advertisers.targetingTypes.assignedTargetingOptions.delete | display-video |
| `displayvid_advs_tgt_types_opts_get` | read | displayvideo.advertisers.targetingTypes.assignedTargetingOptions.get | display-video |
| `displayvid_advs_tgt_types_opts_list` | read | displayvideo.advertisers.targetingTypes.assignedTargetingOptions.list | display-video |
| `displayvid_associations_create` | write | displayvideo.advertisers.lineItems.youtubeAssetTypes.youtubeAssetAssociations.create | display-video |
| `displayvid_associations_delete` | destructive | displayvideo.advertisers.lineItems.youtubeAssetTypes.youtubeAssetAssociations.delete | display-video |
| `displayvid_auds_create` | write | displayvideo.firstPartyAndPartnerAudiences.create | display-video |
| `displayvid_auds_get` | read | displayvideo.firstPartyAndPartnerAudiences.get | display-video |
| `displayvid_auds_list` | read | displayvideo.firstPartyAndPartnerAudiences.list | display-video |
| `displayvid_auds_patch` | write | displayvideo.firstPartyAndPartnerAudiences.patch | display-video |
| `displayvid_combined_audiences_get` | read | displayvideo.combinedAudiences.get | display-video |
| `displayvid_combined_audiences_list` | read | displayvideo.combinedAudiences.list | display-video |
| `displayvid_custom_lists_get` | read | displayvideo.customLists.get | display-video |
| `displayvid_custom_lists_list` | read | displayvideo.customLists.list | display-video |
| `displayvid_edit_customer_match_members` | write | displayvideo.firstPartyAndPartnerAudiences.editCustomerMatchMembers | display-video |
| `displayvid_floodlight_groups_get` | read | displayvideo.floodlightGroups.get | display-video |
| `displayvid_floodlight_groups_patch` | write | displayvideo.floodlightGroups.patch | display-video |
| `displayvid_google_audiences_get` | read | displayvideo.googleAudiences.get | display-video |
| `displayvid_google_audiences_list` | read | displayvideo.googleAudiences.list | display-video |
| `displayvid_groups_activities_get` | read | displayvideo.floodlightGroups.floodlightActivities.get | display-video |
| `displayvid_groups_activities_list` | read | displayvideo.floodlightGroups.floodlightActivities.list | display-video |
| `displayvid_groups_bulk_edit_asgn_tgt_opts` | write | displayvideo.advertisers.adGroups.bulkEditAssignedTargetingOptions | display-video |
| `displayvid_groups_bulk_list_asgn_tgt_opts` | read | displayvideo.advertisers.adGroups.bulkListAssignedTargetingOptions | display-video |
| `displayvid_groups_tgt_types_opts_create` | write | displayvideo.advertisers.adGroups.targetingTypes.assignedTargetingOptions.create | display-video |
| `displayvid_groups_tgt_types_opts_delete` | destructive | displayvideo.advertisers.adGroups.targetingTypes.assignedTargetingOptions.delete | display-video |
| `displayvid_keywords_bulk_edit` | write | displayvideo.advertisers.negativeKeywordLists.negativeKeywords.bulkEdit | display-video |
| `displayvid_keywords_create` | write | displayvideo.advertisers.negativeKeywordLists.negativeKeywords.create | display-video |
| `displayvid_keywords_delete` | destructive | displayvideo.advertisers.negativeKeywordLists.negativeKeywords.delete | display-video |
| `displayvid_keywords_replace` | write | displayvideo.advertisers.negativeKeywordLists.negativeKeywords.replace | display-video |
| `displayvid_line_items_tgt_types_opts_get` | read | displayvideo.advertisers.lineItems.targetingTypes.assignedTargetingOptions.get | display-video |
| `displayvid_line_items_tgt_types_opts_list` | read | displayvideo.advertisers.lineItems.targetingTypes.assignedTargetingOptions.list | display-video |
| `displayvid_location_lists_locations_list` | read | displayvideo.advertisers.locationLists.assignedLocations.list | display-video |
| `displayvid_negative_keyword_lists_create` | write | displayvideo.advertisers.negativeKeywordLists.create | display-video |
| `displayvid_negative_keyword_lists_delete` | destructive | displayvideo.advertisers.negativeKeywordLists.delete | display-video |
| `displayvid_negative_keyword_lists_list` | read | displayvideo.advertisers.negativeKeywordLists.list | display-video |
| `displayvid_negative_keyword_lists_patch` | write | displayvideo.advertisers.negativeKeywordLists.patch | display-video |
| `displayvid_sdfdownloadtasks_create` | write | displayvideo.sdfdownloadtasks.create | display-video |
| `displayvid_tgt_types_tgt_opts_get` | read | displayvideo.targetingTypes.targetingOptions.get | display-video |
| `displayvid_tgt_types_tgt_opts_list` | read | displayvideo.targetingTypes.targetingOptions.list | display-video |
| `displayvid_tgt_types_tgt_opts_search` | read | displayvideo.targetingTypes.targetingOptions.search | display-video |
| `doubleclic_queries_create` | write | doubleclickbidmanager.queries.create | doubleclickbidmanager |
| `doubleclic_queries_delete` | destructive | doubleclickbidmanager.queries.delete | doubleclickbidmanager |
| `doubleclic_queries_get` | read | doubleclickbidmanager.queries.get | doubleclickbidmanager |
| `doubleclic_queries_list` | read | doubleclickbidmanager.queries.list | doubleclickbidmanager |
| `doubleclic_queries_reports_get` | read | doubleclickbidmanager.queries.reports.get | doubleclickbidmanager |
| `doubleclic_queries_reports_list` | read | doubleclickbidmanager.queries.reports.list | doubleclickbidmanager |
| `doubleclic_queries_run` | write | doubleclickbidmanager.queries.run | doubleclickbidmanager |
| `googl_remove_automatically_created_assets` | write | googleads.customers.adGroupAds.removeAutomaticallyCreatedAssets | adwords |
| `googleads_account_budget_proposals_mutate` | dynamic | googleads.customers.accountBudgetProposals.mutate | adwords |
| `googleads_ad_group_assets_mutate` | dynamic | googleads.customers.adGroupAssets.mutate | adwords |
| `googleads_ad_group_criteria_mutate` | dynamic | googleads.customers.adGroupCriteria.mutate | adwords |
| `googleads_asset_group_assets_mutate` | dynamic | googleads.customers.assetGroupAssets.mutate | adwords |
| `googleads_bidding_strategies_mutate` | dynamic | googleads.customers.biddingStrategies.mutate | adwords |
| `googleads_campaign_assets_mutate` | dynamic | googleads.customers.campaignAssets.mutate | adwords |
| `googleads_campaign_budgets_mutate` | dynamic | googleads.customers.campaignBudgets.mutate | adwords |
| `googleads_campaign_conv_goals_mutate` | dynamic | googleads.customers.campaignConversionGoals.mutate | adwords |
| `googleads_campaign_criteria_mutate` | dynamic | googleads.customers.campaignCriteria.mutate | adwords |
| `googleads_conversion_actions_mutate` | dynamic | googleads.customers.conversionActions.mutate | adwords |
| `googleads_create_customer_client` | write | googleads.customers.createCustomerClient | adwords |
| `googleads_criteria_mutate` | dynamic | googleads.customers.customerNegativeCriteria.mutate | adwords |
| `googleads_custom_conversion_goals_mutate` | dynamic | googleads.customers.customConversionGoals.mutate | adwords |
| `googleads_customer_assets_mutate` | dynamic | googleads.customers.customerAssets.mutate | adwords |
| `googleads_customers_ad_group_ads_mutate` | dynamic | googleads.customers.adGroupAds.mutate | adwords |
| `googleads_customers_ad_groups_mutate` | dynamic | googleads.customers.adGroups.mutate | adwords |
| `googleads_customers_ads_mutate` | dynamic | googleads.customers.ads.mutate | adwords |
| `googleads_customers_asset_groups_mutate` | dynamic | googleads.customers.assetGroups.mutate | adwords |
| `googleads_customers_asset_sets_mutate` | dynamic | googleads.customers.assetSets.mutate | adwords |
| `googleads_customers_assets_mutate` | dynamic | googleads.customers.assets.mutate | adwords |
| `googleads_customers_campaigns_mutate` | dynamic | googleads.customers.campaigns.mutate | adwords |
| `googleads_customers_google_ads_mutate` | dynamic | googleads.customers.googleAds.mutate | adwords |
| `googleads_customers_google_ads_search` | read | googleads.customers.googleAds.search | adwords |
| `googleads_customers_mutate` | dynamic | googleads.customers.mutate | adwords |
| `googleads_enable_p_max_brand_guidelines` | write | googleads.customers.campaigns.enablePMaxBrandGuidelines | adwords |
| `googleads_generate_keyword_ideas` | read | googleads.customers.generateKeywordIdeas | adwords |
| `googleads_geo_target_constants_suggest` | read | googleads.geoTargetConstants.suggest | adwords |
| `googleads_google_ads_fields_get` | read | googleads.googleAdsFields.get | adwords |
| `googleads_google_ads_fields_search` | read | googleads.googleAdsFields.search | adwords |
| `googleads_google_ads_search_stream` | read | googleads.customers.googleAds.searchStream | adwords |
| `googleads_keyword_theme_constants_suggest` | read | googleads.keywordThemeConstants.suggest | adwords |
| `googleads_list_accessible_customers` | read | googleads.customers.listAccessibleCustomers | adwords |
| `sea_keyword_plan_campaign_keywords_mutate` | write | searchads360.customers.keywordPlanCampaignKeywords.mutate | doubleclicksearch |
| `searc_remove_automatically_created_assets` | write | searchads360.customers.adGroupAds.removeAutomaticallyCreatedAssets | doubleclicksearch |
| `search_configure_campaign_lifecycle_goals` | write | searchads360.customers.campaignLifecycleGoal.configureCampaignLifecycleGoals | doubleclicksearch |
| `search_configure_customer_lifecycle_goals` | write | searchads360.customers.customerLifecycleGoal.configureCustomerLifecycleGoals | doubleclicksearch |
| `searchads3_ad_group_ad_labels_mutate` | write | searchads360.customers.adGroupAdLabels.mutate | doubleclicksearch |
| `searchads3_ad_group_asset_sets_mutate` | write | searchads360.customers.adGroupAssetSets.mutate | doubleclicksearch |
| `searchads3_ad_group_assets_mutate` | write | searchads360.customers.adGroupAssets.mutate | doubleclicksearch |
| `searchads3_ad_group_bid_modifiers_mutate` | write | searchads360.customers.adGroupBidModifiers.mutate | doubleclicksearch |
| `searchads3_ad_group_criteria_mutate` | write | searchads360.customers.adGroupCriteria.mutate | doubleclicksearch |
| `searchads3_ad_group_customizers_mutate` | write | searchads360.customers.adGroupCustomizers.mutate | doubleclicksearch |
| `searchads3_ad_group_labels_mutate` | write | searchads360.customers.adGroupLabels.mutate | doubleclicksearch |
| `searchads3_adjustments_mutate` | write | searchads360.customers.biddingSeasonalityAdjustments.mutate | doubleclicksearch |
| `searchads3_append_lead_conversation` | write | searchads360.customers.localServices.appendLeadConversation | doubleclicksearch |
| `searchads3_asset_group_assets_mutate` | write | searchads360.customers.assetGroupAssets.mutate | doubleclicksearch |
| `searchads3_asset_group_signals_mutate` | write | searchads360.customers.assetGroupSignals.mutate | doubleclicksearch |
| `searchads3_asset_set_assets_mutate` | write | searchads360.customers.assetSetAssets.mutate | doubleclicksearch |
| `searchads3_batch_jobs_add_operations` | write | searchads360.customers.batchJobs.addOperations | doubleclicksearch |
| `searchads3_batch_jobs_list_results` | read | searchads360.customers.batchJobs.listResults | doubleclicksearch |
| `searchads3_bidding_data_exclusions_mutate` | write | searchads360.customers.biddingDataExclusions.mutate | doubleclicksearch |
| `searchads3_bidding_strategies_mutate` | write | searchads360.customers.biddingStrategies.mutate | doubleclicksearch |
| `searchads3_campaign_asset_sets_mutate` | write | searchads360.customers.campaignAssetSets.mutate | doubleclicksearch |
| `searchads3_campaign_assets_mutate` | write | searchads360.customers.campaignAssets.mutate | doubleclicksearch |
| `searchads3_campaign_bid_modifiers_mutate` | write | searchads360.customers.campaignBidModifiers.mutate | doubleclicksearch |
| `searchads3_campaign_budgets_mutate` | write | searchads360.customers.campaignBudgets.mutate | doubleclicksearch |
| `searchads3_campaign_conv_goals_mutate` | write | searchads360.customers.campaignConversionGoals.mutate | doubleclicksearch |
| `searchads3_campaign_criteria_mutate` | write | searchads360.customers.campaignCriteria.mutate | doubleclicksearch |
| `searchads3_campaign_customizers_mutate` | write | searchads360.customers.campaignCustomizers.mutate | doubleclicksearch |
| `searchads3_campaign_drafts_mutate` | write | searchads360.customers.campaignDrafts.mutate | doubleclicksearch |
| `searchads3_campaign_drafts_promote` | write | searchads360.customers.campaignDrafts.promote | doubleclicksearch |
| `searchads3_campaign_goal_configs_mutate` | write | searchads360.customers.CampaignGoalConfigs.mutate | doubleclicksearch |
| `searchads3_campaign_groups_mutate` | write | searchads360.customers.campaignGroups.mutate | doubleclicksearch |
| `searchads3_campaign_labels_mutate` | write | searchads360.customers.campaignLabels.mutate | doubleclicksearch |
| `searchads3_campaign_shared_sets_mutate` | write | searchads360.customers.campaignSharedSets.mutate | doubleclicksearch |
| `searchads3_conv_custom_variables_mutate` | write | searchads360.customers.conversionCustomVariables.mutate | doubleclicksearch |
| `searchads3_conv_value_rule_sets_mutate` | write | searchads360.customers.conversionValueRuleSets.mutate | doubleclicksearch |
| `searchads3_conversion_actions_mutate` | write | searchads360.customers.conversionActions.mutate | doubleclicksearch |
| `searchads3_conversion_value_rules_mutate` | write | searchads360.customers.conversionValueRules.mutate | doubleclicksearch |
| `searchads3_create_customer_client` | write | searchads360.customers.createCustomerClient | doubleclicksearch |
| `searchads3_criteria_mutate` | write | searchads360.customers.customerNegativeCriteria.mutate | doubleclicksearch |
| `searchads3_custom_audiences_mutate` | write | searchads360.customers.customAudiences.mutate | doubleclicksearch |
| `searchads3_custom_conversion_goals_mutate` | write | searchads360.customers.customConversionGoals.mutate | doubleclicksearch |
| `searchads3_custom_interests_mutate` | write | searchads360.customers.customInterests.mutate | doubleclicksearch |
| `searchads3_customer_asset_sets_mutate` | write | searchads360.customers.customerAssetSets.mutate | doubleclicksearch |
| `searchads3_customer_assets_mutate` | write | searchads360.customers.customerAssets.mutate | doubleclicksearch |
| `searchads3_customer_client_links_mutate` | write | searchads360.customers.customerClientLinks.mutate | doubleclicksearch |
| `searchads3_customer_conv_goals_mutate` | write | searchads360.customers.customerConversionGoals.mutate | doubleclicksearch |
| `searchads3_customer_customizers_mutate` | write | searchads360.customers.CustomerCustomizers.mutate | doubleclicksearch |
| `searchads3_customer_labels_mutate` | write | searchads360.customers.customerLabels.mutate | doubleclicksearch |
| `searchads3_customer_manager_links_mutate` | write | searchads360.customers.customerManagerLinks.mutate | doubleclicksearch |
| `searchads3_customer_user_accesses_mutate` | write | searchads360.customers.customerUserAccesses.mutate | doubleclicksearch |
| `searchads3_customers_account_links_create` | write | searchads360.customers.accountLinks.create | doubleclicksearch |
| `searchads3_customers_account_links_mutate` | write | searchads360.customers.accountLinks.mutate | doubleclicksearch |
| `searchads3_customers_ad_group_ads_mutate` | write | searchads360.customers.adGroupAds.mutate | doubleclicksearch |
| `searchads3_customers_ad_groups_mutate` | write | searchads360.customers.adGroups.mutate | doubleclicksearch |
| `searchads3_customers_ad_parameters_mutate` | write | searchads360.customers.adParameters.mutate | doubleclicksearch |
| `searchads3_customers_ads_mutate` | write | searchads360.customers.ads.mutate | doubleclicksearch |
| `searchads3_customers_asset_groups_mutate` | write | searchads360.customers.assetGroups.mutate | doubleclicksearch |
| `searchads3_customers_asset_sets_mutate` | write | searchads360.customers.assetSets.mutate | doubleclicksearch |
| `searchads3_customers_assets_mutate` | write | searchads360.customers.assets.mutate | doubleclicksearch |
| `searchads3_customers_audiences_mutate` | write | searchads360.customers.audiences.mutate | doubleclicksearch |
| `searchads3_customers_batch_jobs_mutate` | write | searchads360.customers.batchJobs.mutate | doubleclicksearch |
| `searchads3_customers_batch_jobs_run` | write | searchads360.customers.batchJobs.run | doubleclicksearch |
| `searchads3_customers_budget_opts` | write | searchads360.customers.suggestSmartCampaignBudgetOptions | doubleclicksearch |
| `searchads3_customers_campaigns_mutate` | write | searchads360.customers.campaigns.mutate | doubleclicksearch |
| `searchads3_customers_composition_insights` | write | searchads360.customers.generateAudienceCompositionInsights | doubleclicksearch |
| `searchads3_customers_created_asset` | write | searchads360.customers.removeCampaignAutomaticallyCreatedAsset | doubleclicksearch |
| `searchads3_customers_custom_columns_get` | read | searchads360.customers.customColumns.get | doubleclicksearch |
| `searchads3_customers_custom_columns_list` | read | searchads360.customers.customColumns.list | doubleclicksearch |
| `searchads3_customers_data_links_create` | write | searchads360.customers.dataLinks.create | doubleclicksearch |
| `searchads3_customers_data_links_remove` | destructive | searchads360.customers.dataLinks.remove | doubleclicksearch |
| `searchads3_customers_data_links_update` | write | searchads360.customers.dataLinks.update | doubleclicksearch |
| `searchads3_customers_experiments_mutate` | write | searchads360.customers.experiments.mutate | doubleclicksearch |
| `searchads3_customers_forecast_metrics` | write | searchads360.customers.generateKeywordForecastMetrics | doubleclicksearch |
| `searchads3_customers_goals_mutate` | write | searchads360.customers.Goals.mutate | doubleclicksearch |
| `searchads3_customers_historical_metrics` | write | searchads360.customers.generateKeywordHistoricalMetrics | doubleclicksearch |
| `searchads3_customers_invoices_list` | read | searchads360.customers.invoices.list | doubleclicksearch |
| `searchads3_customers_keyword_plans_mutate` | write | searchads360.customers.keywordPlans.mutate | doubleclicksearch |
| `searchads3_customers_labels_mutate` | write | searchads360.customers.labels.mutate | doubleclicksearch |
| `searchads3_customers_mutate` | write | searchads360.customers.mutate | doubleclicksearch |
| `searchads3_customers_product_links_create` | write | searchads360.customers.productLinks.create | doubleclicksearch |
| `searchads3_customers_product_links_remove` | destructive | searchads360.customers.productLinks.remove | doubleclicksearch |
| `searchads3_customers_search_ads360_mutate` | write | searchads360.customers.searchAds360.mutate | doubleclicksearch |
| `searchads3_customers_search_ads360_search` | read | searchads360.customers.searchAds360.search | doubleclicksearch |
| `searchads3_customers_shared_sets_mutate` | write | searchads360.customers.sharedSets.mutate | doubleclicksearch |
| `searchads3_customers_upload_user_data` | write | searchads360.customers.uploadUserData | doubleclicksearch |
| `searchads3_customers_user_lists_mutate` | write | searchads360.customers.userLists.mutate | doubleclicksearch |
| `searchads3_customizer_attributes_mutate` | write | searchads360.customers.customizerAttributes.mutate | doubleclicksearch |
| `searchads3_customizers_mutate` | write | searchads360.customers.AdGroupCriterionCustomizers.mutate | doubleclicksearch |
| `searchads3_drafts_list_async_errors` | read | searchads360.customers.campaignDrafts.listAsyncErrors | doubleclicksearch |
| `searchads3_enable_p_max_brand_guidelines` | write | searchads360.customers.campaigns.enablePMaxBrandGuidelines | doubleclicksearch |
| `searchads3_experiment_arms_mutate` | write | searchads360.customers.experimentArms.mutate | doubleclicksearch |
| `searchads3_experiments_end_experiment` | write | searchads360.customers.experiments.endExperiment | doubleclicksearch |
| `searchads3_experiments_promote_experiment` | write | searchads360.customers.experiments.promoteExperiment | doubleclicksearch |
| `searchads3_exps_list_exp_async_errors` | read | searchads360.customers.experiments.listExperimentAsyncErrors | doubleclicksearch |
| `searchads3_filters_mutate` | write | searchads360.customers.assetGroupListingGroupFilters.mutate | doubleclicksearch |
| `searchads3_generate_ad_group_themes` | write | searchads360.customers.generateAdGroupThemes | doubleclicksearch |
| `searchads3_generate_aud_overlap_insights` | write | searchads360.customers.generateAudienceOverlapInsights | doubleclicksearch |
| `searchads3_generate_audience_definition` | write | searchads360.customers.generateAudienceDefinition | doubleclicksearch |
| `searchads3_generate_benchmarks_metrics` | write | searchads360.customers.generateBenchmarksMetrics | doubleclicksearch |
| `searchads3_generate_keyword_ideas` | write | searchads360.customers.generateKeywordIdeas | doubleclicksearch |
| `searchads3_generate_reach_forecast` | write | searchads360.customers.generateReachForecast | doubleclicksearch |
| `searchads3_geo_target_constants_suggest` | write | searchads360.geoTargetConstants.suggest | doubleclicksearch |
| `searchads3_get_identity_verification` | read | searchads360.customers.getIdentityVerification | doubleclicksearch |
| `searchads3_get_smart_campaign_status` | read | searchads360.customers.smartCampaignSettings.getSmartCampaignStatus | doubleclicksearch |
| `searchads3_incentives_apply_incentive` | write | searchads360.customers.incentives.applyIncentive | doubleclicksearch |
| `searchads3_incentives_fetch_incentive` | read | searchads360.incentives.fetchIncentive | doubleclicksearch |
| `searchads3_invitations_mutate` | write | searchads360.customers.customerUserAccessInvitations.mutate | doubleclicksearch |
| `searchads3_keyword_plan_ad_groups_mutate` | write | searchads360.customers.keywordPlanAdGroups.mutate | doubleclicksearch |
| `searchads3_keyword_plan_campaigns_mutate` | write | searchads360.customers.keywordPlanCampaigns.mutate | doubleclicksearch |
| `searchads3_keywords_mutate` | write | searchads360.customers.keywordPlanAdGroupKeywords.mutate | doubleclicksearch |
| `searchads3_labels_mutate` | write | searchads360.customers.adGroupCriterionLabels.mutate | doubleclicksearch |
| `searchads3_leads_provide_lead_feedback` | write | searchads360.customers.localServicesLeads.provideLeadFeedback | doubleclicksearch |
| `searchads3_links_move_manager_link` | write | searchads360.customers.customerManagerLinks.moveManagerLink | doubleclicksearch |
| `searchads3_list_accessible_customers` | read | searchads360.customers.listAccessibleCustomers | doubleclicksearch |
| `searchads3_list_insights_eligible_dates` | read | searchads360.audienceInsights.listInsightsEligibleDates | doubleclicksearch |
| `searchads3_list_plannable_user_interests` | read | searchads360.listPlannableUserInterests | doubleclicksearch |
| `searchads3_mutate` | write | searchads360.customers.conversionGoalCampaignConfigs.mutate | doubleclicksearch |
| `searchads3_offline_user_data_jobs_add_ops` | write | searchads360.customers.offlineUserDataJobs.addOperations | doubleclicksearch |
| `searchads3_offline_user_data_jobs_create` | write | searchads360.customers.offlineUserDataJobs.create | doubleclicksearch |
| `searchads3_offline_user_data_jobs_run` | write | searchads360.customers.offlineUserDataJobs.run | doubleclicksearch |
| `searchads3_payments_accounts_list` | read | searchads360.customers.paymentsAccounts.list | doubleclicksearch |
| `searchads3_rec_subs_mutate_rec_sub` | write | searchads360.customers.recommendationSubscriptions.mutateRecommendationSubscription | doubleclicksearch |
| `searchads3_recommendations_dismiss` | write | searchads360.customers.recommendations.dismiss | doubleclicksearch |
| `searchads3_recommendations_generate` | write | searchads360.customers.recommendations.generate | doubleclicksearch |
| `searchads3_regenerate_shareable_link_id` | write | searchads360.customers.thirdPartyAppAnalyticsLinks.regenerateShareableLinkId | doubleclicksearch |
| `searchads3_remarketing_actions_mutate` | write | searchads360.customers.remarketingActions.mutate | doubleclicksearch |
| `searchads3_schemas_mutate` | write | searchads360.customers.customerSkAdNetworkConversionValueSchemas.mutate | doubleclicksearch |
| `searchads3_search_ads360_campaigns_mutate` | write | searchads360.customers.searchAds360Campaigns.mutate | doubleclicksearch |
| `searchads3_search_ads360_fields_get` | read | searchads360.searchAds360Fields.get | doubleclicksearch |
| `searchads3_search_ads360_fields_search` | read | searchads360.searchAds360Fields.search | doubleclicksearch |
| `searchads3_search_aud_insights_attributes` | read | searchads360.customers.searchAudienceInsightsAttributes | doubleclicksearch |
| `searchads3_shared_criteria_mutate` | write | searchads360.customers.sharedCriteria.mutate | doubleclicksearch |
| `searchads3_smart_campaign_settings_mutate` | write | searchads360.customers.smartCampaignSettings.mutate | doubleclicksearch |
| `searchads3_start_identity_verification` | write | searchads360.customers.startIdentityVerification | doubleclicksearch |
| `searchads3_suggest_keyword_themes` | write | searchads360.customers.suggestKeywordThemes | doubleclicksearch |
| `searchads3_suggest_smart_campaign_ad` | write | searchads360.customers.suggestSmartCampaignAd | doubleclicksearch |
| `searchads3_upload_call_conversions` | write | searchads360.customers.uploadCallConversions | doubleclicksearch |
| `searchads3_upload_click_conversions` | write | searchads360.customers.uploadClickConversions | doubleclicksearch |
| `searchads3_upload_conversion_adjustments` | write | searchads360.customers.uploadConversionAdjustments | doubleclicksearch |
| `searchads3_v23_generate_conversion_rates` | write | searchads360.generateConversionRates | doubleclicksearch |
| `searchads3_v23_list_benchmarks_locations` | read | searchads360.listBenchmarksLocations | doubleclicksearch |
| `searchads3_v23_list_benchmarks_products` | read | searchads360.listBenchmarksProducts | doubleclicksearch |
| `searchads3_v23_list_benchmarks_sources` | read | searchads360.listBenchmarksSources | doubleclicksearch |
| `searchads3_v23_list_plannable_locations` | read | searchads360.listPlannableLocations | doubleclicksearch |
| `searchads3_v23_list_plannable_products` | read | searchads360.listPlannableProducts | doubleclicksearch |
| `searchads3_v23_list_plannable_user_lists` | read | searchads360.listPlannableUserLists | doubleclicksearch |
| `searchads_account_budget_proposals_mutate` | write | searchads360.customers.accountBudgetProposals.mutate | doubleclicksearch |
| `searchads_customers_billing_setups_mutate` | write | searchads360.customers.billingSetups.mutate | doubleclicksearch |
| `searchads_customers_recommendations_apply` | write | searchads360.customers.recommendations.apply | doubleclicksearch |
| `searchads_customers_suggest_travel_assets` | write | searchads360.customers.suggestTravelAssets | doubleclicksearch |
| `searchads_experiments_graduate_experiment` | write | searchads360.customers.experiments.graduateExperiment | doubleclicksearch |
| `searchads_experiments_schedule_experiment` | write | searchads360.customers.experiments.scheduleExperiment | doubleclicksearch |
| `searchads_generate_insights_finder_report` | write | searchads360.customers.generateInsightsFinderReport | doubleclicksearch |
| `searchads_generate_suggested_tgt_insights` | write | searchads360.customers.generateSuggestedTargetingInsights | doubleclicksearch |
| `searchads_generate_tgt_suggestion_metrics` | write | searchads360.customers.generateTargetingSuggestionMetrics | doubleclicksearch |
| `searchads_keyword_theme_constants_suggest` | write | searchads360.keywordThemeConstants.suggest | doubleclicksearch |
| `searchads_list_benchmarks_available_dates` | read | searchads360.listBenchmarksAvailableDates | doubleclicksearch |
| `searchads_product_link_invitations_create` | write | searchads360.customers.productLinkInvitations.create | doubleclicksearch |
| `searchads_product_link_invitations_remove` | destructive | searchads360.customers.productLinkInvitations.remove | doubleclicksearch |
| `searchads_product_link_invitations_update` | write | searchads360.customers.productLinkInvitations.update | doubleclicksearch |
| `searchads_user_list_customer_types_mutate` | write | searchads360.customers.userListCustomerTypes.mutate | doubleclicksearch |

## Gateway tools (3)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_call` | dynamic | Call an API method | (none) |
| `api_describe` | read | Describe an API method | (none) |
| `api_search` | read | Search API methods | (none) |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gads: API methods | (none) |

## Generated APIs

Each API links to Google's documentation for it, as Google's Discovery directory names it (`documentationLink`, kept in `data/catalog.json`). The link is the API's documentation home, not a page per method: the directory gives no link per method, and Google's REST reference pages are laid out differently from product to product.

- Google Ads API (`googleads/v26`), 177 methods in the catalog. Documentation: <https://developers.google.com/google-ads/api/>
- Search Ads 360 Reporting API (`searchads360/v23`), 161 methods in the catalog. Documentation: <https://developers.google.com/search-ads/reporting>
- Display & Video 360 API (`displayvideo/v4`), 179 methods in the catalog. Documentation: <https://developers.google.com/display-video/>
- AdMob API (`admob/v1`), 6 methods in the catalog. Documentation: <https://developers.google.com/admob/api/>
- DoubleClick Bid Manager API (`doubleclickbidmanager/v2`), 7 methods in the catalog. Documentation: <https://developers.google.com/bid-manager/>

## Gateway APIs (reached through api_search, api_describe, api_call)

- AdSense Management API (`adsense/v2`), 33 methods. Documentation: <https://developers.google.com/adsense/management/>
- Ad Exchange Buyer API II (`adexchangebuyer2/v2beta1`), 78 methods. Documentation: <https://developers.google.com/authorized-buyers/apis/reference/rest/>
- Campaign Manager 360 API (`dfareporting/v5`), 218 methods. Documentation: <https://developers.google.com/doubleclick-advertisers/>
- Real-time Bidding API (`realtimebidding/v1`), 39 methods. Documentation: <https://developers.google.com/authorized-buyers/apis/realtimebidding/reference/rest/>
- Search Ads 360 API (`doubleclicksearch/v2`), 11 methods. Documentation: <https://developers.google.com/search-ads>
- AdSense Platform API (`adsenseplatform/v1`), 11 methods. Documentation: <https://developers.google.com/adsense/platforms/>
- Google Marketing Platform Admin API (`marketingplatformadmin/v1alpha`), 22 methods. Documentation: <https://developers.google.com/analytics/devguides/config/gmp/v1>
- Authorized Buyers Marketplace API (`authorizedbuyersmarketplace/v1`), 40 methods. Documentation: <https://developers.google.com/authorized-buyers/apis/marketplace/reference/rest/>
- Data Manager API (`datamanager/v1`), 26 methods. Documentation: <https://developers.google.com/data-manager>
- Agencies and Brands API (`agenciesandbrands/v1`), 8 methods. Documentation: <https://developers.google.com/authorized-buyers/agencies-and-brands/get-started/start>
- Curation Partners API (`curationpartners/v1`), 22 methods. Documentation: <https://developers.google.com/authorized-buyers/curation/apis/guides/curationpartners/overview>
- Local Services API (`localservices/v1`), 2 methods. Documentation: <https://ads.google.com/local-services-ads/>
- Reader Revenue Subscription Linking API (`readerrevenuesubscriptionlinking/v1`), 4 methods. Documentation: <https://developers.google.com/news/subscribe/subscription-linking/overview>
- Web Content Publisher API (`webcontentpublisher/v1`), 11 methods. Documentation: <https://developers.google.com/news/subscribe>
- Checks API (`checks/v1alpha`), 15 methods. Documentation: <https://developers.google.com/checks>
- AdMob API (`admob/v1beta`), 19 methods. Documentation: <https://developers.google.com/admob/api/>
- AdSense Platform API (`adsenseplatform/v1alpha`), 19 methods. Documentation: <https://developers.google.com/adsense/platforms/>
- Authorized Buyers Marketplace API (`authorizedbuyersmarketplace/v1alpha`), 54 methods. Documentation: <https://developers.google.com/authorized-buyers/apis/marketplace/reference/rest/>
- Authorized Buyers Marketplace API (`authorizedbuyersmarketplace/v1beta`), 14 methods. Documentation: <https://developers.google.com/authorized-buyers/apis/marketplace/reference/rest/>
- Campaign Manager 360 API (`dfareporting/v3.5`), 1 methods. Documentation: <https://developers.google.com/doubleclick-advertisers/>
- Display & Video 360 API (`displayvideo/v2`), 144 methods. Documentation: <https://developers.google.com/display-video/>
- Display & Video 360 API (`displayvideo/v3`), 151 methods. Documentation: <https://developers.google.com/display-video/>
- Search Ads 360 Reporting API (`searchads360/v0`), 6 methods. Documentation: <https://developers.google.com/search-ads/reporting>
- Display & Video 360 API (`displayvideo/v4`), 179 methods. Documentation: <https://developers.google.com/display-video/>
- Google Ads API (`googleads/v26`), 177 methods. Documentation: <https://developers.google.com/google-ads/api/>
- Display & Video 360 API (`displayvideo/v5`), 178 methods. Documentation: <https://developers.google.com/display-video/>

