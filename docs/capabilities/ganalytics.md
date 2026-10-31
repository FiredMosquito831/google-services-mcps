# Google Analytics (`ganalytics`)

Google Analytics admin and data APIs for GA4 properties, configuration and reports.

- Plugin: `ganalytics`, MCP server: `ganalytics`, login: Desktop OAuth client, then `login business`
- Install: `claude plugin install ganalytics@google-services-mcps`
- Tools: 82 total. Curated 12, per-method 66, gateway 3. Read 43, write 28, destructive 10, dynamic 1.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 82, google 16, curated 15 tools, each counting the 7 runtime tools this server registers (`account_remove`, `account_set_default`, `accounts_list`, `auth_login`, `auth_setup_client`, `auth_status`, `health`). "(all)" means the product has no such toolset yet, so it lists every tool.

## Not registered by this server (2)

The tool map (`plugins/<id>/tool-map.json`) also lists these, so the consent hook knows every name, but this server never registers them, and the counts above leave them out.

- Sign-in tools of other sign-in kinds: `auth_setup_admin`, `auth_setup_service_account`.

## Toolset google (9)

The tools that match Google's official MCP server for this product (https://github.com/googleanalytics/google-analytics-mcp).

| Tool | Google's tool | Note |
|---|---|---|
| `gaadmin_acct_summaries_list` | `get_account_summaries` | The accounts and properties the signed-in user can see (Admin API v1beta accountSummaries.list). Start here for a property id. |
| `gaadmin_properties_get` | `get_property_details` | One property's details: name, time zone, currency, industry, service level (Admin API v1beta). |
| `gaadmin_pro_goo_ads_link_list` | `list_google_ads_links` | The Google Ads accounts linked to a property (Admin API v1beta). |
| `gadata_props_get_meta` | `get_custom_dimensions_and_metrics` | Every dimension and metric the property can report on, custom ones flagged with customDefinition; Google's tool returns only the custom ones. Pass name properties/<id>/metadata. |
| `ga_run_report` | `run_report`, `run_conversions_report` | A report with rows keyed by dimension and metric name, row_count, next_offset and, on request, the property's quota. With conversion_spec it runs Google's conversions report on Data API v1alpha, as run_conversions_report does. |
| `ga_run_realtime_report` | `run_realtime_report` | The last 30 minutes. The Data API has no offset for realtime reports, so there is none here (Google's tool lists one). |
| `ga_run_funnel_report` | `run_funnel_report` | Data API v1alpha runFunnelReport, which no generated tool or gateway method of this server reaches; steps as event names or filter expressions. |
| `ga_annotations_list` | `list_property_annotations` | Admin API v1alpha, which the generated tools do not cover (it is a gateway API here). |
| `ga_annotation_create` | `create_property_annotation` | A write: it asks first, and the approval shows the exact annotation. Needs analytics.edit, which Google's server asks for only with --allow-write. |

## Curated tools (12)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `account_remove` | write | Remove a signed-in account | (none) |
| `account_set_default` | write | Set the default account | (none) |
| `accounts_list` | read | Signed-in accounts | (none) |
| `auth_login` | write | Sign in to Google | (none) |
| `auth_setup_client` | write | Save the Google OAuth client | (none) |
| `auth_status` | read | Sign-in status | (none) |
| `ga_annotation_create` | write | Create a Google Analytics annotation | analytics.edit |
| `ga_annotations_list` | read | List Google Analytics annotations | analytics.edit, analytics.readonly |
| `ga_run_funnel_report` | read | Run a Google Analytics funnel report | analytics, analytics.readonly |
| `ga_run_realtime_report` | read | Run a Google Analytics realtime report | analytics, analytics.readonly |
| `ga_run_report` | read | Run a Google Analytics report | analytics, analytics.readonly |
| `health` | read | Server health | (none) |

## Per-method tools (66)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `gaa_get_data_sharing_settings` | read | analyticsadmin.accounts.getDataSharingSettings | analytics.edit, analytics.readonly |
| `gaad_properties_access_report` | read | analyticsadmin.properties.runAccessReport | analytics.edit, analytics.readonly |
| `gaad_props_retention_settings` | read | analyticsadmin.properties.getDataRetentionSettings | analytics.edit, analytics.readonly |
| `gaadm_accounts_history_events` | read | analyticsadmin.accounts.searchChangeHistoryEvents | analytics.edit |
| `gaadm_props_key_events_create` | write | analyticsadmin.properties.keyEvents.create | analytics.edit |
| `gaadm_props_key_events_delete` | destructive | analyticsadmin.properties.keyEvents.delete | analytics.edit |
| `gaadmi_props_key_events_patch` | write | analyticsadmin.properties.keyEvents.patch | analytics.edit |
| `gaadmi_streams_secrets_create` | write | analyticsadmin.properties.dataStreams.measurementProtocolSecrets.create | analytics.edit |
| `gaadmi_streams_secrets_delete` | destructive | analyticsadmin.properties.dataStreams.measurementProtocolSecrets.delete | analytics.edit |
| `gaadmin_accounts_delete` | destructive | analyticsadmin.accounts.delete | analytics.edit |
| `gaadmin_accounts_get` | read | analyticsadmin.accounts.get | analytics.edit, analytics.readonly |
| `gaadmin_accounts_list` | read | analyticsadmin.accounts.list | analytics.edit, analytics.readonly |
| `gaadmin_accounts_patch` | write | analyticsadmin.accounts.patch | analytics.edit |
| `gaadmin_acct_summaries_list` | read | analyticsadmin.accountSummaries.list | analytics.edit, analytics.readonly |
| `gaadmin_pro_goo_ads_link_crea` | write | analyticsadmin.properties.googleAdsLinks.create | analytics.edit |
| `gaadmin_pro_goo_ads_link_dele` | destructive | analyticsadmin.properties.googleAdsLinks.delete | analytics.edit |
| `gaadmin_pro_goo_ads_link_list` | read | analyticsadmin.properties.googleAdsLinks.list | analytics.edit, analytics.readonly |
| `gaadmin_pro_upd_dat_rete_sett` | write | analyticsadmin.properties.updateDataRetentionSettings | analytics.edit |
| `gaadmin_properties_create` | write | analyticsadmin.properties.create | analytics.edit |
| `gaadmin_properties_data_coll` | write | analyticsadmin.properties.acknowledgeUserDataCollection | analytics.edit |
| `gaadmin_properties_delete` | destructive | analyticsadmin.properties.delete | analytics.edit |
| `gaadmin_properties_get` | read | analyticsadmin.properties.get | analytics.edit, analytics.readonly |
| `gaadmin_properties_list` | read | analyticsadmin.properties.list | analytics.edit, analytics.readonly |
| `gaadmin_properties_patch` | write | analyticsadmin.properties.patch | analytics.edit |
| `gaadmin_props_conv_events_get` | read | analyticsadmin.properties.conversionEvents.get | analytics.edit, analytics.readonly |
| `gaadmin_props_custom_dims_get` | read | analyticsadmin.properties.customDimensions.get | analytics.edit, analytics.readonly |
| `gaadmin_props_dims_archive` | destructive | analyticsadmin.properties.customDimensions.archive | analytics.edit |
| `gaadmin_props_dims_create` | write | analyticsadmin.properties.customDimensions.create | analytics.edit |
| `gaadmin_props_dims_list` | read | analyticsadmin.properties.customDimensions.list | analytics.edit, analytics.readonly |
| `gaadmin_props_dims_patch` | write | analyticsadmin.properties.customDimensions.patch | analytics.edit |
| `gaadmin_props_events_create` | write | analyticsadmin.properties.conversionEvents.create | analytics.edit |
| `gaadmin_props_events_delete` | destructive | analyticsadmin.properties.conversionEvents.delete | analytics.edit |
| `gaadmin_props_events_list` | read | analyticsadmin.properties.conversionEvents.list | analytics.edit, analytics.readonly |
| `gaadmin_props_events_patch` | write | analyticsadmin.properties.conversionEvents.patch | analytics.edit |
| `gaadmin_props_key_events_get` | read | analyticsadmin.properties.keyEvents.get | analytics.edit, analytics.readonly |
| `gaadmin_props_key_events_list` | read | analyticsadmin.properties.keyEvents.list | analytics.edit, analytics.readonly |
| `gaadmin_props_links_create` | write | analyticsadmin.properties.firebaseLinks.create | analytics.edit |
| `gaadmin_props_links_delete` | destructive | analyticsadmin.properties.firebaseLinks.delete | analytics.edit |
| `gaadmin_props_links_list` | read | analyticsadmin.properties.firebaseLinks.list | analytics.edit, analytics.readonly |
| `gaadmin_props_links_patch` | write | analyticsadmin.properties.googleAdsLinks.patch | analytics.edit |
| `gaadmin_props_metrics_archive` | destructive | analyticsadmin.properties.customMetrics.archive | analytics.edit |
| `gaadmin_props_metrics_create` | write | analyticsadmin.properties.customMetrics.create | analytics.edit |
| `gaadmin_props_metrics_get` | read | analyticsadmin.properties.customMetrics.get | analytics.edit, analytics.readonly |
| `gaadmin_props_metrics_list` | read | analyticsadmin.properties.customMetrics.list | analytics.edit, analytics.readonly |
| `gaadmin_props_metrics_patch` | write | analyticsadmin.properties.customMetrics.patch | analytics.edit |
| `gaadmin_props_streams_create` | write | analyticsadmin.properties.dataStreams.create | analytics.edit |
| `gaadmin_props_streams_delete` | destructive | analyticsadmin.properties.dataStreams.delete | analytics.edit |
| `gaadmin_props_streams_get` | read | analyticsadmin.properties.dataStreams.get | analytics.edit, analytics.readonly |
| `gaadmin_props_streams_list` | read | analyticsadmin.properties.dataStreams.list | analytics.edit, analytics.readonly |
| `gaadmin_props_streams_patch` | write | analyticsadmin.properties.dataStreams.patch | analytics.edit |
| `gaadmin_provision_acct_ticket` | write | analyticsadmin.accounts.provisionAccountTicket | analytics.edit |
| `gaadmin_run_access_report` | read | analyticsadmin.accounts.runAccessReport | analytics.edit, analytics.readonly |
| `gaadmin_streams_secrets_get` | write | analyticsadmin.properties.dataStreams.measurementProtocolSecrets.get | analytics.edit, analytics.readonly |
| `gaadmin_streams_secrets_list` | read | analyticsadmin.properties.dataStreams.measurementProtocolSecrets.list | analytics.edit, analytics.readonly |
| `gaadmin_streams_secrets_patch` | write | analyticsadmin.properties.dataStreams.measurementProtocolSecrets.patch | analytics.edit |
| `gadat_batch_run_pivot_reports` | read | analyticsdata.properties.batchRunPivotReports | analytics, analytics.readonly |
| `gadata_batch_run_reports` | read | analyticsdata.properties.batchRunReports | analytics, analytics.readonly |
| `gadata_check_compatibility` | read | analyticsdata.properties.checkCompatibility | analytics, analytics.readonly |
| `gadata_properties_run_report` | read | analyticsdata.properties.runReport | analytics, analytics.readonly |
| `gadata_props_aud_exports_get` | read | analyticsdata.properties.audienceExports.get | analytics, analytics.readonly |
| `gadata_props_aud_exports_list` | read | analyticsdata.properties.audienceExports.list | analytics, analytics.readonly |
| `gadata_props_exports_create` | write | analyticsdata.properties.audienceExports.create | analytics, analytics.readonly |
| `gadata_props_exports_query` | read | analyticsdata.properties.audienceExports.query | analytics, analytics.readonly |
| `gadata_props_get_meta` | read | analyticsdata.properties.getMetadata | analytics, analytics.readonly |
| `gadata_props_run_pivot_report` | read | analyticsdata.properties.runPivotReport | analytics, analytics.readonly |
| `gadata_run_realtime_report` | read | analyticsdata.properties.runRealtimeReport | analytics, analytics.readonly |

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

Each API links to Google's documentation for it, as Google's Discovery directory names it (`documentationLink`, kept in `data/catalog.json`). The link is the API's documentation home, not a page per method: the directory gives no link per method, and Google's REST reference pages are laid out differently from product to product.

- Google Analytics Admin API (`analyticsadmin/v1beta`), 55 methods in the catalog. Documentation: <http://code.google.com/apis/analytics/docs/mgmt/home.html>
- Google Analytics Data API (`analyticsdata/v1beta`), 11 methods in the catalog. Documentation: <https://developers.google.com/analytics/devguides/reporting/data/v1/>

## Gateway APIs (reached through api_search, api_describe, api_call)

- Google Analytics Admin API (`analyticsadmin/v1alpha`), 166 methods. Documentation: <http://code.google.com/apis/analytics/docs/mgmt/home.html>

