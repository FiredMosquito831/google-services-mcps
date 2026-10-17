# Google Analytics (`ganalytics`)

Google Analytics admin and data APIs for GA4 properties, configuration and reports.

- Plugin: `ganalytics`, MCP server: `ganalytics`, login: Desktop OAuth client, then `login business`
- Install: `claude plugin install ganalytics@google-services-mcps`
- Tools: 75 total. Curated 5, per-method 66, gateway 3. Read 37, write 27, destructive 10, dynamic 1.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

## Curated tools (5)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `auth_login` | write | Sign in to Google | (none) |
| `auth_setup_admin` | write | Set up the workspace admin account | (none) |
| `auth_setup_client` | write | Save the Google OAuth client | (none) |
| `auth_status` | read | Sign-in status | (none) |
| `health` | read | Server health | (none) |

## Per-method tools (66)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `gaadmin_account_summarie_list` | read | analyticsadmin.accountSummaries.list | analytics.edit, analytics.readonly |
| `gaadmin_accounts_delete` | destructive | analyticsadmin.accounts.delete | analytics.edit |
| `gaadmin_accounts_get` | read | analyticsadmin.accounts.get | analytics.edit, analytics.readonly |
| `gaadmin_accounts_get_data_sha` | read | analyticsadmin.accounts.getDataSharingSettings | analytics.edit, analytics.readonly |
| `gaadmin_accounts_list` | read | analyticsadmin.accounts.list | analytics.edit, analytics.readonly |
| `gaadmin_accounts_patch` | write | analyticsadmin.accounts.patch | analytics.edit |
| `gaadmin_accounts_provision_ac` | write | analyticsadmin.accounts.provisionAccountTicket | analytics.edit |
| `gaadmin_accounts_run_access_r` | read | analyticsadmin.accounts.runAccessReport | analytics.edit, analytics.readonly |
| `gaadmin_accounts_search_chang` | read | analyticsadmin.accounts.searchChangeHistoryEvents | analytics.edit |
| `gaadmin_prop_custo_archi_7523` | destructive | analyticsadmin.properties.customDimensions.archive | analytics.edit |
| `gaadmin_prop_custo_archi_b061` | destructive | analyticsadmin.properties.customMetrics.archive | analytics.edit |
| `gaadmin_prop_custo_creat_0335` | write | analyticsadmin.properties.customDimensions.create | analytics.edit |
| `gaadmin_prop_custo_creat_b4ea` | write | analyticsadmin.properties.customMetrics.create | analytics.edit |
| `gaadmin_prop_custo_patch_232f` | write | analyticsadmin.properties.customDimensions.patch | analytics.edit |
| `gaadmin_prop_custo_patch_92c7` | write | analyticsadmin.properties.customMetrics.patch | analytics.edit |
| `gaadmin_prop_data_measu_creat` | write | analyticsadmin.properties.dataStreams.measurementProtocolSecrets.create | analytics.edit |
| `gaadmin_prop_data_measu_delet` | destructive | analyticsadmin.properties.dataStreams.measurementProtocolSecrets.delete | analytics.edit |
| `gaadmin_prop_data_measu_patch` | write | analyticsadmin.properties.dataStreams.measurementProtocolSecrets.patch | analytics.edit |
| `gaadmin_prope_data_measu_list` | read | analyticsadmin.properties.dataStreams.measurementProtocolSecrets.list | analytics.edit, analytics.readonly |
| `gaadmin_prope_data_measur_get` | read | analyticsadmin.properties.dataStreams.measurementProtocolSecrets.get | analytics.edit, analytics.readonly |
| `gaadmin_proper_convers_create` | write | analyticsadmin.properties.conversionEvents.create | analytics.edit |
| `gaadmin_proper_convers_delete` | destructive | analyticsadmin.properties.conversionEvents.delete | analytics.edit |
| `gaadmin_proper_data_st_create` | write | analyticsadmin.properties.dataStreams.create | analytics.edit |
| `gaadmin_proper_data_st_delete` | destructive | analyticsadmin.properties.dataStreams.delete | analytics.edit |
| `gaadmin_proper_firebas_create` | write | analyticsadmin.properties.firebaseLinks.create | analytics.edit |
| `gaadmin_proper_firebas_delete` | destructive | analyticsadmin.properties.firebaseLinks.delete | analytics.edit |
| `gaadmin_proper_key_eve_create` | write | analyticsadmin.properties.keyEvents.create | analytics.edit |
| `gaadmin_proper_key_eve_delete` | destructive | analyticsadmin.properties.keyEvents.delete | analytics.edit |
| `gaadmin_propert_convers_patch` | write | analyticsadmin.properties.conversionEvents.patch | analytics.edit |
| `gaadmin_propert_conversi_list` | read | analyticsadmin.properties.conversionEvents.list | analytics.edit, analytics.readonly |
| `gaadmin_propert_custom_d_list` | read | analyticsadmin.properties.customDimensions.list | analytics.edit, analytics.readonly |
| `gaadmin_propert_custom_m_list` | read | analyticsadmin.properties.customMetrics.list | analytics.edit, analytics.readonly |
| `gaadmin_propert_data_st_patch` | write | analyticsadmin.properties.dataStreams.patch | analytics.edit |
| `gaadmin_propert_data_str_list` | read | analyticsadmin.properties.dataStreams.list | analytics.edit, analytics.readonly |
| `gaadmin_propert_firebase_list` | read | analyticsadmin.properties.firebaseLinks.list | analytics.edit, analytics.readonly |
| `gaadmin_propert_google_a_list` | read | analyticsadmin.properties.googleAdsLinks.list | analytics.edit, analytics.readonly |
| `gaadmin_propert_google_create` | write | analyticsadmin.properties.googleAdsLinks.create | analytics.edit |
| `gaadmin_propert_google_delete` | destructive | analyticsadmin.properties.googleAdsLinks.delete | analytics.edit |
| `gaadmin_propert_google_patch` | write | analyticsadmin.properties.googleAdsLinks.patch | analytics.edit |
| `gaadmin_propert_key_eve_patch` | write | analyticsadmin.properties.keyEvents.patch | analytics.edit |
| `gaadmin_propert_key_even_list` | read | analyticsadmin.properties.keyEvents.list | analytics.edit, analytics.readonly |
| `gaadmin_properti_conversi_get` | read | analyticsadmin.properties.conversionEvents.get | analytics.edit, analytics.readonly |
| `gaadmin_properti_custom_d_get` | read | analyticsadmin.properties.customDimensions.get | analytics.edit, analytics.readonly |
| `gaadmin_properti_custom_m_get` | read | analyticsadmin.properties.customMetrics.get | analytics.edit, analytics.readonly |
| `gaadmin_properti_data_str_get` | read | analyticsadmin.properties.dataStreams.get | analytics.edit, analytics.readonly |
| `gaadmin_properti_key_even_get` | read | analyticsadmin.properties.keyEvents.get | analytics.edit, analytics.readonly |
| `gaadmin_properties_acknowledg` | write | analyticsadmin.properties.acknowledgeUserDataCollection | analytics.edit |
| `gaadmin_properties_create` | write | analyticsadmin.properties.create | analytics.edit |
| `gaadmin_properties_delete` | destructive | analyticsadmin.properties.delete | analytics.edit |
| `gaadmin_properties_get` | read | analyticsadmin.properties.get | analytics.edit, analytics.readonly |
| `gaadmin_properties_get_data_r` | read | analyticsadmin.properties.getDataRetentionSettings | analytics.edit, analytics.readonly |
| `gaadmin_properties_list` | read | analyticsadmin.properties.list | analytics.edit, analytics.readonly |
| `gaadmin_properties_patch` | write | analyticsadmin.properties.patch | analytics.edit |
| `gaadmin_properties_run_access` | read | analyticsadmin.properties.runAccessReport | analytics.edit, analytics.readonly |
| `gaadmin_properties_update_dat` | write | analyticsadmin.properties.updateDataRetentionSettings | analytics.edit |
| `gadata_propert_audienc_create` | write | analyticsdata.properties.audienceExports.create | analytics, analytics.readonly |
| `gadata_propert_audience_query` | write | analyticsdata.properties.audienceExports.query | analytics, analytics.readonly |
| `gadata_properti_audience_list` | read | analyticsdata.properties.audienceExports.list | analytics, analytics.readonly |
| `gadata_propertie_audience_get` | read | analyticsdata.properties.audienceExports.get | analytics, analytics.readonly |
| `gadata_properties_batch_run_p` | write | analyticsdata.properties.batchRunPivotReports | analytics, analytics.readonly |
| `gadata_properties_batch_run_r` | read | analyticsdata.properties.batchRunReports | analytics, analytics.readonly |
| `gadata_properties_check_compa` | read | analyticsdata.properties.checkCompatibility | analytics, analytics.readonly |
| `gadata_properties_get_metadat` | read | analyticsdata.properties.getMetadata | analytics, analytics.readonly |
| `gadata_properties_run_pivot_r` | read | analyticsdata.properties.runPivotReport | analytics, analytics.readonly |
| `gadata_properties_run_realtim` | read | analyticsdata.properties.runRealtimeReport | analytics, analytics.readonly |
| `gadata_properties_run_report` | read | analyticsdata.properties.runReport | analytics, analytics.readonly |

## Gateway tools (3)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_call` | dynamic | Call an API method | (none) |
| `api_describe` | read | Describe an API method | (none) |
| `api_search` | read | Search API methods | (none) |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | ganalytics: API methods | (none) |

## Generated APIs

- Google Analytics Admin API (`analyticsadmin/v1beta`), 55 methods in the catalog
- Google Analytics Data API (`analyticsdata/v1beta`), 11 methods in the catalog

## Gateway APIs (reached through api_search, api_describe, api_call)

- Google Analytics Admin API (`analyticsadmin/v1alpha`), 166 methods

