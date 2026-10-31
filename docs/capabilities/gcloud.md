# Google Cloud (`gcloud`)

Google Cloud console APIs: projects, service enablement, API keys, billing, monitoring, storage, BigQuery and IAM, plus the rest of the infrastructure, data, devops, networking, security and governance APIs.

- Plugin: `gcloud`, MCP server: `gcloud`, login: Desktop OAuth client, then `login cloud`
- Install: `claude plugin install gcloud@google-services-mcps`
- Tools: 395 total. Curated 41, per-method 350, gateway 3. Read 197, write 135, destructive 62, dynamic 1.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 395, google 68, curated 44 tools, each with the 9 runtime tools of the map counted. "(all)" means the product has no such toolset yet, so it lists every tool.

## Toolset google (59)

The tools that match Google's official MCP server for this product (https://docs.cloud.google.com/resource-manager/reference/mcp, https://docs.cloud.google.com/api-keys/docs/reference/mcp/tools_list, https://docs.cloud.google.com/bigquery/docs/reference/mcp/tools_list, https://docs.cloud.google.com/billing/docs/reference/mcp/tools_list, https://docs.cloud.google.com/iam/docs/reference/mcp/tools_list, https://docs.cloud.google.com/logging/docs/reference/v2_mcp/mcp/tools_list, https://docs.cloud.google.com/monitoring/api/ref_v3_mcp/mcp/tools_list, https://docs.cloud.google.com/storage/docs/reference/mcp/tools_list).

| Tool | Google's tool | Note |
|---|---|---|
| `cloud_projects_search` | `search_projects` |  |
| `cloud_project_iam_policy` | (none) | Google's IAM server reads deny policies and roles, not who holds a role on a project. Kept because that is the first IAM question; Resource Manager's getIamPolicy, a read. |
| `cloud_apikeys_list` | `apikeys_list_keys` |  |
| `cloud_apikey_get` | `apikeys_get_key` |  |
| `cloud_apikey_reveal` | `apikeys_get_key_string` |  |
| `cloud_apikey_create` | `apikeys_create_key` |  |
| `apikeys_projects_locations_keys_patch` | `apikeys_update_key` |  |
| `cloud_apikey_delete` | `apikeys_delete_key` |  |
| `apikeys_project_locatio_keys_undelete` | `apikeys_undelete_key` |  |
| `apikeys_keys_lookup_key` | `apikeys_lookup_key` |  |
| `bq_dataset_list` | `list_dataset_ids` |  |
| `bigquery_datasets_get` | `get_dataset_info` |  |
| `bq_table_list` | `list_table_ids` |  |
| `bq_table_get` | `get_table_info` |  |
| `bq_table_preview` | (none) | No tool of Google's BigQuery server reads rows without a query. Kept: tabledata.list, which has no query cost. |
| `bq_query_read` | `execute_sql_readonly` | A dry run first refuses any statement that is not a SELECT, so it stays a read; bigquery_jobs_query (execute_sql) runs any statement and asks first. |
| `bigquery_jobs_query` | `execute_sql` |  |
| `bq_job_get` | `get_query_results` |  |
| `bigquery_jobs_get` | `get_job` |  |
| `bigquery_jobs_cancel` | `cancel_job` |  |
| `billing_billing_accounts_list` | `list_billing_accounts` |  |
| `billing_billing_accounts_get` | `get_billing_account` |  |
| `billing_billing_accounts_create` | `create_billing_account` |  |
| `billing_billing_accounts_move` | `move_billing_account` |  |
| `billing_billing_accoun_get_iam_policy` | `get_iam_policy` |  |
| `billing_billing_accoun_set_iam_policy` | `set_iam_policy` |  |
| `billing_billing_accoun_test_iam_permi` | `test_iam_permissions` |  |
| `billing_projects_get_billing_info` | `get_project_billing_info` |  |
| `billing_billing_account_projects_list` | `list_project_billing_info` |  |
| `billing_services_list` | `list_services`, `get_service` | Google's get_service has no method in Cloud Billing v1; the list covers it. |
| `billing_services_skus_list` | `list_skus`, `get_sku` | Google's get_sku has no method in Cloud Billing v1; the list covers it, and billing_price_lookup finds SKUs by words. |
| `billing_price_lookup` | `list_prices`, `get_price`, `list_billing_account_prices`, `get_billing_account_price` | Prices of one SKU (v1beta skus.price.get), or SKUs of a service found by words and region with their list prices, and a billing account's own prices (v1beta billingAccounts.skus.price.get). Google's SKU-group and billing-account SKU and service listings are reached with the gateway (api_call) in the all toolset. |
| `iam_policies_list_policies` | `list_deny_policies` |  |
| `iam_policies_get` | `get_deny_policy` |  |
| `iam_policies_create_policy` | `create_deny_policy` |  |
| `iam_policies_update` | `update_deny_policy` |  |
| `iam_policies_delete` | `delete_deny_policy` |  |
| `iam_policies_operations_get` | `get_deny_policy_status` |  |
| `iam_roles_list` | `list_roles` | Reads only. Google's create_role, update_role, delete_role and undelete_role (IAM v1) are reached with the gateway (api_call) in the all toolset. IAM lists only the cloud-platform scope for roles, so a readonly login cannot run it. |
| `iam_role_get` | `get_role` | IAM lists only the cloud-platform scope for roles, so a readonly login cannot run it. |
| `logging_entries_list` | `list_log_entries` | Google's list_log_names, list_buckets, list_views (and the observability server's sinks and log scopes) are reached with the gateway (api_call) in the all toolset. Without a time limit the last day is searched, as gcloud logging read does. |
| `monitor_projects_time_series_list` | `list_timeseries` |  |
| `monitoring_query_promql` | `query_range` | Also runs instant queries (Prometheus /query) when no range is given. Our kind is read, as Google marks query_range; since 1.24.5 the gateway's Prometheus POST queries (query, query_range, query_exemplars, series, labels) are reads too (config/tool-kinds.json). |
| `monitor_projects_metric_descript_list` | `list_metric_descriptors` |  |
| `monitor_projects_alert_policies_list` | `list_alert_policies` |  |
| `monitor_projects_alert_policies_get` | `get_alert_policy` |  |
| `monitor_projects_alerts_list` | `list_alerts` |  |
| `monitor_projects_alerts_get` | `get_alert` |  |
| `monitoring_dashboards_list` | `list_dashboards` |  |
| `monitoring_dashboard_get` | `get_dashboard` |  |
| `storage_buckets_list` | `list_buckets` |  |
| `storage_buckets_insert` | `create_bucket` |  |
| `storage_buckets_delete` | `delete_bucket` |  |
| `storage_objects_list` | `list_objects` |  |
| `storage_objects_get` | `get_object_metadata` |  |
| `gcs_read_text` | `read_text` | Google's read_text is deprecated in favour of read_object; kept for text, decoded with the object's charset. |
| `gcs_read_object` | `read_object` |  |
| `gcs_write_text` | `write_text` | Unlike Google's write_text it does not replace an existing object unless overwrite is true (ifGenerationMatch=0). It also uploads a local file (local_path). |
| `storage_objects_delete` | `delete_object` |  |

## Curated tools (41)

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
| `billing_price_lookup` | read | Look up Google Cloud prices | cloud-billing.readonly, cloud-billing |
| `bq_dataset_list` | read | List BigQuery datasets | bigquery.readonly, cloud-platform.read-only |
| `bq_job_get` | read | Get BigQuery job rows | bigquery.readonly, cloud-platform.read-only |
| `bq_query_read` | read | Run read-only BigQuery query | bigquery.readonly, cloud-platform.read-only |
| `bq_table_get` | read | Get BigQuery table schema | bigquery.readonly, cloud-platform.read-only |
| `bq_table_list` | read | List BigQuery tables | bigquery.readonly, cloud-platform.read-only |
| `bq_table_preview` | read | Preview BigQuery table rows | bigquery.readonly, cloud-platform.read-only |
| `cloud_apikey_create` | write | Create API key | apikeys, cloud-platform |
| `cloud_apikey_delete` | destructive | Delete API key | apikeys, cloud-platform |
| `cloud_apikey_get` | read | Get API key | apikeys, apikeys.readonly |
| `cloud_apikey_reveal` | write | Reveal API key string | apikeys, apikeys.readonly |
| `cloud_apikeys_list` | read | List API keys | apikeys, apikeys.readonly |
| `cloud_operation_get` | read | Get operation status | cloud-platform, cloud-platform.read-only |
| `cloud_project_create` | write | Create project | cloud-platform |
| `cloud_project_delete` | destructive | Delete project | cloud-platform |
| `cloud_project_get` | read | Get project | cloud-platform, cloud-platform.read-only |
| `cloud_project_iam_policy` | read | Get project IAM policy | cloud-platform, cloud-platform.read-only |
| `cloud_projects_search` | read | Search projects | cloud-platform, cloud-platform.read-only |
| `cloud_service_disable` | destructive | Disable API | cloud-platform, service.management |
| `cloud_service_enable` | write | Enable API | cloud-platform, service.management |
| `cloud_services_list` | read | List APIs on a project | cloud-platform, cloud-platform.read-only |
| `gcs_read_object` | read | Read a Cloud Storage object as base64 | devstorage.read_only, cloud-platform.read-only |
| `gcs_read_text` | read | Read a Cloud Storage object as text | devstorage.read_only, cloud-platform.read-only |
| `gcs_write_text` | write | Write a Cloud Storage object | devstorage.read_write, devstorage.full_control |
| `health` | read | Server health | (none) |
| `iam_role_get` | read | Get an IAM role | cloud-platform |
| `iam_roles_list` | read | List IAM roles | cloud-platform |
| `logging_entries_list` | read | List log entries | logging.read, cloud-platform.read-only |
| `monitoring_dashboard_get` | read | Get a monitoring dashboard | monitoring.read, monitoring |
| `monitoring_dashboards_list` | read | List monitoring dashboards | monitoring.read, monitoring |
| `monitoring_query_promql` | read | Query Cloud Monitoring with PromQL | monitoring.read, monitoring |
| `project_enable_missing` | write | Enable the APIs the MCPs need | cloud-platform, service.management |
| `project_readiness` | read | Check a project for the MCPs | cloud-platform, cloud-platform.read-only |

## Per-method tools (350)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `apikeys_keys_lookup_key` | read | apikeys.keys.lookupKey | apikeys, apikeys.readonly |
| `apikeys_operations_get` | read | apikeys.operations.get | apikeys, apikeys.readonly |
| `apikeys_project_locatio_keys_undelete` | write | apikeys.projects.locations.keys.undelete | apikeys, cloud-platform |
| `apikeys_project_location_keys_get_key` | write | apikeys.projects.locations.keys.getKeyString | apikeys, apikeys.readonly |
| `apikeys_projects_location_keys_create` | write | apikeys.projects.locations.keys.create | apikeys, cloud-platform |
| `apikeys_projects_location_keys_delete` | destructive | apikeys.projects.locations.keys.delete | apikeys, cloud-platform |
| `apikeys_projects_locations_keys_get` | read | apikeys.projects.locations.keys.get | apikeys, apikeys.readonly |
| `apikeys_projects_locations_keys_list` | read | apikeys.projects.locations.keys.list | apikeys, apikeys.readonly |
| `apikeys_projects_locations_keys_patch` | write | apikeys.projects.locations.keys.patch | apikeys, cloud-platform |
| `assets_assets_list` | read | cloudasset.assets.list | cloud-platform, cloudasset |
| `assets_effective_iam_polici_batch_get` | read | cloudasset.effectiveIamPolicies.batchGet | cloud-platform |
| `assets_feeds_create` | write | cloudasset.feeds.create | cloud-platform |
| `assets_feeds_delete` | destructive | cloudasset.feeds.delete | cloud-platform |
| `assets_feeds_get` | read | cloudasset.feeds.get | cloud-platform |
| `assets_feeds_list` | read | cloudasset.feeds.list | cloud-platform |
| `assets_feeds_patch` | write | cloudasset.feeds.patch | cloud-platform |
| `assets_operations_get` | read | cloudasset.operations.get | cloud-platform, cloudasset |
| `assets_saved_queries_create` | write | cloudasset.savedQueries.create | cloud-platform |
| `assets_saved_queries_delete` | destructive | cloudasset.savedQueries.delete | cloud-platform |
| `assets_saved_queries_get` | read | cloudasset.savedQueries.get | cloud-platform |
| `assets_saved_queries_list` | read | cloudasset.savedQueries.list | cloud-platform |
| `assets_saved_queries_patch` | write | cloudasset.savedQueries.patch | cloud-platform |
| `assets_v1_analyze_iam_policy` | read | cloudasset.analyzeIamPolicy | cloud-platform, cloudasset |
| `assets_v1_analyze_iam_policy_longrunn` | read | cloudasset.analyzeIamPolicyLongrunning | cloud-platform, cloudasset |
| `assets_v1_analyze_move` | read | cloudasset.analyzeMove | cloud-platform |
| `assets_v1_analyze_org_policies` | read | cloudasset.analyzeOrgPolicies | cloud-platform |
| `assets_v1_analyze_org_policy_gov_0f01` | read | cloudasset.analyzeOrgPolicyGovernedAssets | cloud-platform |
| `assets_v1_analyze_org_policy_gov_37e7` | read | cloudasset.analyzeOrgPolicyGovernedContainers | cloud-platform |
| `assets_v1_batch_get_assets_history` | read | cloudasset.batchGetAssetsHistory | cloud-platform |
| `assets_v1_export_assets` | write | cloudasset.exportAssets | cloud-platform |
| `assets_v1_query_assets` | write | cloudasset.queryAssets | cloud-platform |
| `assets_v1_search_all_iam_policies` | read | cloudasset.searchAllIamPolicies | cloud-platform |
| `assets_v1_search_all_resources` | read | cloudasset.searchAllResources | cloud-platform |
| `bigquery_datasets_delete` | destructive | bigquery.datasets.delete | bigquery, cloud-platform |
| `bigquery_datasets_get` | read | bigquery.datasets.get | bigquery, cloud-platform |
| `bigquery_datasets_insert` | write | bigquery.datasets.insert | bigquery, cloud-platform |
| `bigquery_datasets_list` | read | bigquery.datasets.list | bigquery, cloud-platform |
| `bigquery_datasets_patch` | write | bigquery.datasets.patch | bigquery, cloud-platform |
| `bigquery_datasets_undelete` | write | bigquery.datasets.undelete | bigquery, cloud-platform |
| `bigquery_datasets_update` | write | bigquery.datasets.update | bigquery, cloud-platform |
| `bigquery_jobs_cancel` | destructive | bigquery.jobs.cancel | bigquery, cloud-platform |
| `bigquery_jobs_delete` | destructive | bigquery.jobs.delete | bigquery, cloud-platform |
| `bigquery_jobs_get` | read | bigquery.jobs.get | bigquery, cloud-platform |
| `bigquery_jobs_get_query_results` | read | bigquery.jobs.getQueryResults | bigquery, cloud-platform |
| `bigquery_jobs_list` | read | bigquery.jobs.list | bigquery, cloud-platform |
| `bigquery_jobs_query` | write | bigquery.jobs.query | bigquery, cloud-platform |
| `bigquery_models_delete` | destructive | bigquery.models.delete | bigquery, cloud-platform |
| `bigquery_models_get` | read | bigquery.models.get | bigquery, cloud-platform |
| `bigquery_models_list` | read | bigquery.models.list | bigquery, cloud-platform |
| `bigquery_models_patch` | write | bigquery.models.patch | bigquery, cloud-platform |
| `bigquery_projects_get_service_account` | read | bigquery.projects.getServiceAccount | bigquery, cloud-platform |
| `bigquery_projects_list` | read | bigquery.projects.list | bigquery, cloud-platform |
| `bigquery_routines_delete` | destructive | bigquery.routines.delete | bigquery, cloud-platform |
| `bigquery_routines_get` | read | bigquery.routines.get | bigquery, cloud-platform |
| `bigquery_routines_get_iam_policy` | read | bigquery.routines.getIamPolicy | bigquery, cloud-platform |
| `bigquery_routines_insert` | write | bigquery.routines.insert | bigquery, cloud-platform |
| `bigquery_routines_list` | read | bigquery.routines.list | bigquery, cloud-platform |
| `bigquery_routines_set_iam_policy` | destructive | bigquery.routines.setIamPolicy | bigquery, cloud-platform |
| `bigquery_routines_test_iam_permission` | read | bigquery.routines.testIamPermissions | bigquery, cloud-platform |
| `bigquery_routines_update` | write | bigquery.routines.update | bigquery, cloud-platform |
| `bigquery_row_access_po_get_iam_policy` | read | bigquery.rowAccessPolicies.getIamPolicy | bigquery, cloud-platform |
| `bigquery_row_access_po_test_iam_permi` | read | bigquery.rowAccessPolicies.testIamPermissions | bigquery, cloud-platform |
| `bigquery_row_access_poli_batch_delete` | destructive | bigquery.rowAccessPolicies.batchDelete | bigquery, cloud-platform |
| `bigquery_row_access_policies_delete` | destructive | bigquery.rowAccessPolicies.delete | bigquery, cloud-platform |
| `bigquery_row_access_policies_get` | read | bigquery.rowAccessPolicies.get | bigquery, cloud-platform |
| `bigquery_row_access_policies_insert` | write | bigquery.rowAccessPolicies.insert | bigquery, cloud-platform |
| `bigquery_row_access_policies_list` | read | bigquery.rowAccessPolicies.list | bigquery, cloud-platform |
| `bigquery_row_access_policies_update` | write | bigquery.rowAccessPolicies.update | bigquery, cloud-platform |
| `bigquery_tabledata_insert_all` | write | bigquery.tabledata.insertAll | bigquery, bigquery.insertdata |
| `bigquery_tabledata_list` | read | bigquery.tabledata.list | bigquery, cloud-platform |
| `bigquery_tables_delete` | destructive | bigquery.tables.delete | bigquery, cloud-platform |
| `bigquery_tables_get` | read | bigquery.tables.get | bigquery, cloud-platform |
| `bigquery_tables_get_iam_policy` | read | bigquery.tables.getIamPolicy | bigquery, cloud-platform |
| `bigquery_tables_insert` | write | bigquery.tables.insert | bigquery, cloud-platform |
| `bigquery_tables_list` | read | bigquery.tables.list | bigquery, cloud-platform |
| `bigquery_tables_patch` | write | bigquery.tables.patch | bigquery, cloud-platform |
| `bigquery_tables_set_iam_policy` | destructive | bigquery.tables.setIamPolicy | bigquery, cloud-platform |
| `bigquery_tables_test_iam_permissions` | read | bigquery.tables.testIamPermissions | bigquery, cloud-platform |
| `bigquery_tables_update` | write | bigquery.tables.update | bigquery, cloud-platform |
| `billing_billing_ac_sub_account_create` | write | cloudbilling.billingAccounts.subAccounts.create | cloud-billing, cloud-platform |
| `billing_billing_acc_sub_accounts_list` | read | cloudbilling.billingAccounts.subAccounts.list | cloud-billing, cloud-billing.readonly |
| `billing_billing_accoun_get_iam_policy` | read | cloudbilling.billingAccounts.getIamPolicy | cloud-billing, cloud-billing.readonly |
| `billing_billing_accoun_set_iam_policy` | destructive | cloudbilling.billingAccounts.setIamPolicy | cloud-billing, cloud-platform |
| `billing_billing_accoun_test_iam_permi` | read | cloudbilling.billingAccounts.testIamPermissions | cloud-billing, cloud-billing.readonly |
| `billing_billing_account_projects_list` | read | cloudbilling.billingAccounts.projects.list | cloud-billing, cloud-billing.readonly |
| `billing_billing_accounts_create` | write | cloudbilling.billingAccounts.create | cloud-billing, cloud-platform |
| `billing_billing_accounts_get` | read | cloudbilling.billingAccounts.get | cloud-billing, cloud-billing.readonly |
| `billing_billing_accounts_list` | read | cloudbilling.billingAccounts.list | cloud-billing, cloud-billing.readonly |
| `billing_billing_accounts_move` | write | cloudbilling.billingAccounts.move | cloud-billing, cloud-platform |
| `billing_billing_accounts_patch` | write | cloudbilling.billingAccounts.patch | cloud-billing, cloud-platform |
| `billing_message_send` | destructive | cloudbilling.message.send | cloud-billing, cloud-billing.readonly |
| `billing_message_stream` | write | cloudbilling.message.stream | cloud-billing, cloud-billing.readonly |
| `billing_organizati_billing_acc_create` | write | cloudbilling.organizations.billingAccounts.create | cloud-billing, cloud-platform |
| `billing_organizatio_billing_acco_list` | read | cloudbilling.organizations.billingAccounts.list | cloud-billing, cloud-billing.readonly |
| `billing_organizatio_billing_acco_move` | write | cloudbilling.organizations.billingAccounts.move | cloud-billing, cloud-platform |
| `billing_projects_get_billing_info` | read | cloudbilling.projects.getBillingInfo | cloud-billing, cloud-billing.readonly |
| `billing_projects_update_billing_info` | write | cloudbilling.projects.updateBillingInfo | cloud-billing, cloud-platform |
| `billing_services_list` | read | cloudbilling.services.list | cloud-billing, cloud-billing.readonly |
| `billing_services_skus_list` | read | cloudbilling.services.skus.list | cloud-billing, cloud-billing.readonly |
| `billing_tasks_cancel` | destructive | cloudbilling.tasks.cancel | cloud-billing, cloud-billing.readonly |
| `billing_tasks_get` | read | cloudbilling.tasks.get | cloud-billing, cloud-billing.readonly |
| `billing_tasks_push_notificatio_create` | write | cloudbilling.tasks.pushNotificationConfigs.create | cloud-billing, cloud-billing.readonly |
| `billing_tasks_push_notificatio_delete` | destructive | cloudbilling.tasks.pushNotificationConfigs.delete | cloud-billing, cloud-billing.readonly |
| `billing_tasks_push_notification_c_get` | read | cloudbilling.tasks.pushNotificationConfigs.get | cloud-billing, cloud-billing.readonly |
| `billing_tasks_push_notification_list` | read | cloudbilling.tasks.pushNotificationConfigs.list | cloud-billing, cloud-billing.readonly |
| `billing_tasks_subscribe` | read | cloudbilling.tasks.subscribe | cloud-billing, cloud-billing.readonly |
| `billing_v1_get_card` | read | cloudbilling.getCard | cloud-billing, cloud-billing.readonly |
| `cloudprofi_projects_profiles_create` | write | cloudprofiler.projects.profiles.create | cloud-platform, monitoring |
| `cloudprofi_projects_profiles_create_o` | write | cloudprofiler.projects.profiles.createOffline | cloud-platform, monitoring |
| `cloudprofi_projects_profiles_list` | read | cloudprofiler.projects.profiles.list | cloud-platform, monitoring |
| `cloudprofi_projects_profiles_patch` | write | cloudprofiler.projects.profiles.patch | cloud-platform, monitoring |
| `crm_effective_tags_list` | read | cloudresourcemanager.effectiveTags.list | cloud-platform, cloud-platform.read-only |
| `crm_folders_capabilities_get` | read | cloudresourcemanager.folders.capabilities.get | cloud-platform |
| `crm_folders_capabilities_patch` | write | cloudresourcemanager.folders.capabilities.patch | cloud-platform |
| `crm_folders_capability_configs_create` | write | cloudresourcemanager.folders.capabilityConfigs.create | cloud-platform |
| `crm_folders_capability_configs_delete` | destructive | cloudresourcemanager.folders.capabilityConfigs.delete | cloud-platform |
| `crm_folders_capability_configs_get` | read | cloudresourcemanager.folders.capabilityConfigs.get | cloud-platform, cloud-platform.read-only |
| `crm_folders_capability_configs_list` | read | cloudresourcemanager.folders.capabilityConfigs.list | cloud-platform, cloud-platform.read-only |
| `crm_folders_capability_configs_patch` | write | cloudresourcemanager.folders.capabilityConfigs.patch | cloud-platform |
| `crm_folders_create` | write | cloudresourcemanager.folders.create | cloud-platform |
| `crm_folders_delete` | destructive | cloudresourcemanager.folders.delete | cloud-platform |
| `crm_folders_get` | read | cloudresourcemanager.folders.get | cloud-platform, cloud-platform.read-only |
| `crm_folders_get_iam_policy` | read | cloudresourcemanager.folders.getIamPolicy | cloud-platform, cloud-platform.read-only |
| `crm_folders_list` | read | cloudresourcemanager.folders.list | cloud-platform, cloud-platform.read-only |
| `crm_folders_move` | write | cloudresourcemanager.folders.move | cloud-platform |
| `crm_folders_patch` | write | cloudresourcemanager.folders.patch | cloud-platform |
| `crm_folders_search` | read | cloudresourcemanager.folders.search | cloud-platform, cloud-platform.read-only |
| `crm_folders_set_iam_policy` | destructive | cloudresourcemanager.folders.setIamPolicy | cloud-platform |
| `crm_folders_test_iam_permissions` | read | cloudresourcemanager.folders.testIamPermissions | cloud-platform |
| `crm_folders_undelete` | write | cloudresourcemanager.folders.undelete | cloud-platform |
| `crm_liens_create` | write | cloudresourcemanager.liens.create | cloud-platform, cloud-platform.read-only |
| `crm_liens_delete` | destructive | cloudresourcemanager.liens.delete | cloud-platform, cloud-platform.read-only |
| `crm_liens_get` | read | cloudresourcemanager.liens.get | cloud-platform, cloud-platform.read-only |
| `crm_liens_list` | read | cloudresourcemanager.liens.list | cloud-platform, cloud-platform.read-only |
| `crm_locations_effective_tag_bindi_get` | read | cloudresourcemanager.locations.effectiveTagBindingCollections.get | cloud-platform, cloud-platform.read-only |
| `crm_locations_tag_binding_colle_patch` | write | cloudresourcemanager.locations.tagBindingCollections.patch | cloud-platform |
| `crm_locations_tag_binding_collect_get` | read | cloudresourcemanager.locations.tagBindingCollections.get | cloud-platform, cloud-platform.read-only |
| `crm_operations_get` | read | cloudresourcemanager.operations.get | cloud-platform, cloud-platform.read-only |
| `crm_organization_capability_co_create` | write | cloudresourcemanager.organizations.capabilityConfigs.create | cloud-platform |
| `crm_organization_capability_co_delete` | destructive | cloudresourcemanager.organizations.capabilityConfigs.delete | cloud-platform |
| `crm_organizations_capability_co_patch` | write | cloudresourcemanager.organizations.capabilityConfigs.patch | cloud-platform |
| `crm_organizations_capability_con_list` | read | cloudresourcemanager.organizations.capabilityConfigs.list | cloud-platform, cloud-platform.read-only |
| `crm_organizations_capability_conf_get` | read | cloudresourcemanager.organizations.capabilityConfigs.get | cloud-platform, cloud-platform.read-only |
| `crm_organizations_get` | read | cloudresourcemanager.organizations.get | cloud-platform, cloud-platform.read-only |
| `crm_organizations_get_iam_policy` | read | cloudresourcemanager.organizations.getIamPolicy | cloud-platform, cloud-platform.read-only |
| `crm_organizations_search` | read | cloudresourcemanager.organizations.search | cloud-platform, cloud-platform.read-only |
| `crm_organizations_set_iam_policy` | destructive | cloudresourcemanager.organizations.setIamPolicy | cloud-platform |
| `crm_organizations_test_iam_permission` | read | cloudresourcemanager.organizations.testIamPermissions | cloud-platform, cloud-platform.read-only |
| `crm_projects_capability_config_create` | write | cloudresourcemanager.projects.capabilityConfigs.create | cloud-platform |
| `crm_projects_capability_config_delete` | destructive | cloudresourcemanager.projects.capabilityConfigs.delete | cloud-platform |
| `crm_projects_capability_configs_get` | read | cloudresourcemanager.projects.capabilityConfigs.get | cloud-platform, cloud-platform.read-only |
| `crm_projects_capability_configs_list` | read | cloudresourcemanager.projects.capabilityConfigs.list | cloud-platform, cloud-platform.read-only |
| `crm_projects_capability_configs_patch` | write | cloudresourcemanager.projects.capabilityConfigs.patch | cloud-platform |
| `crm_projects_create` | write | cloudresourcemanager.projects.create | cloud-platform |
| `crm_projects_delete` | destructive | cloudresourcemanager.projects.delete | cloud-platform |
| `crm_projects_get` | read | cloudresourcemanager.projects.get | cloud-platform, cloud-platform.read-only |
| `crm_projects_get_iam_policy` | read | cloudresourcemanager.projects.getIamPolicy | cloud-platform, cloud-platform.read-only |
| `crm_projects_list` | read | cloudresourcemanager.projects.list | cloud-platform, cloud-platform.read-only |
| `crm_projects_move` | write | cloudresourcemanager.projects.move | cloud-platform |
| `crm_projects_patch` | write | cloudresourcemanager.projects.patch | cloud-platform |
| `crm_projects_search` | read | cloudresourcemanager.projects.search | cloud-platform, cloud-platform.read-only |
| `crm_projects_set_iam_policy` | destructive | cloudresourcemanager.projects.setIamPolicy | cloud-platform |
| `crm_projects_test_iam_permissions` | read | cloudresourcemanager.projects.testIamPermissions | cloud-platform, cloud-platform.read-only |
| `crm_projects_undelete` | write | cloudresourcemanager.projects.undelete | cloud-platform |
| `crm_tag_bindings_create` | write | cloudresourcemanager.tagBindings.create | cloud-platform |
| `crm_tag_bindings_delete` | destructive | cloudresourcemanager.tagBindings.delete | cloud-platform |
| `crm_tag_bindings_list` | read | cloudresourcemanager.tagBindings.list | cloud-platform, cloud-platform.read-only |
| `crm_tag_keys_create` | write | cloudresourcemanager.tagKeys.create | cloud-platform |
| `crm_tag_keys_delete` | destructive | cloudresourcemanager.tagKeys.delete | cloud-platform |
| `crm_tag_keys_get` | read | cloudresourcemanager.tagKeys.get | cloud-platform, cloud-platform.read-only |
| `crm_tag_keys_get_iam_policy` | read | cloudresourcemanager.tagKeys.getIamPolicy | cloud-platform, cloud-platform.read-only |
| `crm_tag_keys_get_namespaced` | read | cloudresourcemanager.tagKeys.getNamespaced | cloud-platform, cloud-platform.read-only |
| `crm_tag_keys_list` | read | cloudresourcemanager.tagKeys.list | cloud-platform, cloud-platform.read-only |
| `crm_tag_keys_patch` | write | cloudresourcemanager.tagKeys.patch | cloud-platform |
| `crm_tag_keys_set_iam_policy` | destructive | cloudresourcemanager.tagKeys.setIamPolicy | cloud-platform |
| `crm_tag_keys_test_iam_permissions` | read | cloudresourcemanager.tagKeys.testIamPermissions | cloud-platform |
| `crm_tag_values_create` | write | cloudresourcemanager.tagValues.create | cloud-platform |
| `crm_tag_values_delete` | destructive | cloudresourcemanager.tagValues.delete | cloud-platform |
| `crm_tag_values_get` | read | cloudresourcemanager.tagValues.get | cloud-platform, cloud-platform.read-only |
| `crm_tag_values_get_iam_policy` | read | cloudresourcemanager.tagValues.getIamPolicy | cloud-platform, cloud-platform.read-only |
| `crm_tag_values_get_namespaced` | read | cloudresourcemanager.tagValues.getNamespaced | cloud-platform, cloud-platform.read-only |
| `crm_tag_values_list` | read | cloudresourcemanager.tagValues.list | cloud-platform, cloud-platform.read-only |
| `crm_tag_values_patch` | write | cloudresourcemanager.tagValues.patch | cloud-platform |
| `crm_tag_values_set_iam_policy` | destructive | cloudresourcemanager.tagValues.setIamPolicy | cloud-platform |
| `crm_tag_values_tag_holds_create` | write | cloudresourcemanager.tagValues.tagHolds.create | cloud-platform |
| `crm_tag_values_tag_holds_delete` | destructive | cloudresourcemanager.tagValues.tagHolds.delete | cloud-platform |
| `crm_tag_values_tag_holds_list` | read | cloudresourcemanager.tagValues.tagHolds.list | cloud-platform, cloud-platform.read-only |
| `crm_tag_values_test_iam_permissions` | read | cloudresourcemanager.tagValues.testIamPermissions | cloud-platform |
| `crm_v3_fetch_resource_semantics` | read | cloudresourcemanager.fetchResourceSemantics | cloud-platform, cloud-platform.read-only |
| `iam_policies_create_policy` | write | iam.policies.createPolicy | cloud-platform |
| `iam_policies_delete` | destructive | iam.policies.delete | cloud-platform |
| `iam_policies_get` | read | iam.policies.get | cloud-platform |
| `iam_policies_list_policies` | read | iam.policies.listPolicies | cloud-platform |
| `iam_policies_operations_get` | read | iam.policies.operations.get | cloud-platform |
| `iam_policies_update` | write | iam.policies.update | cloud-platform |
| `monitor_folders_time_series_list` | read | monitoring.folders.timeSeries.list | cloud-platform, monitoring |
| `monitor_organization_time_series_list` | read | monitoring.organizations.timeSeries.list | cloud-platform, monitoring |
| `monitor_projects_alert_policie_create` | write | monitoring.projects.alertPolicies.create | cloud-platform, monitoring |
| `monitor_projects_alert_policie_delete` | destructive | monitoring.projects.alertPolicies.delete | cloud-platform, monitoring |
| `monitor_projects_alert_policies_get` | read | monitoring.projects.alertPolicies.get | cloud-platform, monitoring |
| `monitor_projects_alert_policies_list` | read | monitoring.projects.alertPolicies.list | cloud-platform, monitoring |
| `monitor_projects_alert_policies_patch` | write | monitoring.projects.alertPolicies.patch | cloud-platform, monitoring |
| `monitor_projects_alerts_get` | read | monitoring.projects.alerts.get | cloud-platform, monitoring |
| `monitor_projects_alerts_list` | read | monitoring.projects.alerts.list | cloud-platform, monitoring |
| `monitor_projects_collectd_time_create` | write | monitoring.projects.collectdTimeSeries.create | cloud-platform, monitoring |
| `monitor_projects_groups_create` | write | monitoring.projects.groups.create | cloud-platform, monitoring |
| `monitor_projects_groups_delete` | destructive | monitoring.projects.groups.delete | cloud-platform, monitoring |
| `monitor_projects_groups_get` | read | monitoring.projects.groups.get | cloud-platform, monitoring |
| `monitor_projects_groups_list` | read | monitoring.projects.groups.list | cloud-platform, monitoring |
| `monitor_projects_groups_members_list` | read | monitoring.projects.groups.members.list | cloud-platform, monitoring |
| `monitor_projects_groups_update` | write | monitoring.projects.groups.update | cloud-platform, monitoring |
| `monitor_projects_metric_descri_create` | write | monitoring.projects.metricDescriptors.create | cloud-platform, monitoring |
| `monitor_projects_metric_descri_delete` | destructive | monitoring.projects.metricDescriptors.delete | cloud-platform, monitoring |
| `monitor_projects_metric_descript_list` | read | monitoring.projects.metricDescriptors.list | cloud-platform, monitoring |
| `monitor_projects_metric_descripto_get` | read | monitoring.projects.metricDescriptors.get | cloud-platform, monitoring |
| `monitor_projects_monitored_resou_list` | read | monitoring.projects.monitoredResourceDescriptors.list | cloud-platform, monitoring |
| `monitor_projects_monitored_resour_get` | read | monitoring.projects.monitoredResourceDescriptors.get | cloud-platform, monitoring |
| `monitor_projects_notificat_get_verifi` | read | monitoring.projects.notificationChannels.getVerificationCode | cloud-platform, monitoring |
| `monitor_projects_notificat_send_verif` | write | monitoring.projects.notificationChannels.sendVerificationCode | cloud-platform, monitoring |
| `monitor_projects_notificati_list_11a2` | read | monitoring.projects.notificationChannels.list | cloud-platform, monitoring |
| `monitor_projects_notificati_list_7e4a` | read | monitoring.projects.notificationChannelDescriptors.list | cloud-platform, monitoring |
| `monitor_projects_notificatio_get_8dde` | read | monitoring.projects.notificationChannelDescriptors.get | cloud-platform, monitoring |
| `monitor_projects_notificatio_get_a4cc` | read | monitoring.projects.notificationChannels.get | cloud-platform, monitoring |
| `monitor_projects_notification_c_patch` | write | monitoring.projects.notificationChannels.patch | cloud-platform, monitoring |
| `monitor_projects_notification_create` | write | monitoring.projects.notificationChannels.create | cloud-platform, monitoring |
| `monitor_projects_notification_delete` | destructive | monitoring.projects.notificationChannels.delete | cloud-platform, monitoring |
| `monitor_projects_notification_verify` | write | monitoring.projects.notificationChannels.verify | cloud-platform, monitoring |
| `monitor_projects_snoozes_create` | write | monitoring.projects.snoozes.create | cloud-platform, monitoring |
| `monitor_projects_snoozes_get` | read | monitoring.projects.snoozes.get | cloud-platform, monitoring |
| `monitor_projects_snoozes_list` | read | monitoring.projects.snoozes.list | cloud-platform, monitoring |
| `monitor_projects_snoozes_patch` | write | monitoring.projects.snoozes.patch | cloud-platform, monitoring |
| `monitor_projects_time_seri_create_ser` | write | monitoring.projects.timeSeries.createService | cloud-platform, monitoring |
| `monitor_projects_time_series_create` | write | monitoring.projects.timeSeries.create | cloud-platform, monitoring |
| `monitor_projects_time_series_list` | read | monitoring.projects.timeSeries.list | cloud-platform, monitoring |
| `monitor_projects_time_series_query` | read | monitoring.projects.timeSeries.query | cloud-platform, monitoring |
| `monitor_projects_uptime_check_c_patch` | write | monitoring.projects.uptimeCheckConfigs.patch | cloud-platform, monitoring |
| `monitor_projects_uptime_check_co_list` | read | monitoring.projects.uptimeCheckConfigs.list | cloud-platform, monitoring |
| `monitor_projects_uptime_check_con_get` | read | monitoring.projects.uptimeCheckConfigs.get | cloud-platform, monitoring |
| `monitor_projects_uptime_check_create` | write | monitoring.projects.uptimeCheckConfigs.create | cloud-platform, monitoring |
| `monitor_projects_uptime_check_delete` | destructive | monitoring.projects.uptimeCheckConfigs.delete | cloud-platform, monitoring |
| `monitor_services_create` | write | monitoring.services.create | cloud-platform, monitoring |
| `monitor_services_delete` | destructive | monitoring.services.delete | cloud-platform, monitoring |
| `monitor_services_get` | read | monitoring.services.get | cloud-platform, monitoring |
| `monitor_services_list` | read | monitoring.services.list | cloud-platform, monitoring |
| `monitor_services_patch` | write | monitoring.services.patch | cloud-platform, monitoring |
| `monitor_services_service_level_create` | write | monitoring.services.serviceLevelObjectives.create | cloud-platform, monitoring |
| `monitor_services_service_level_delete` | destructive | monitoring.services.serviceLevelObjectives.delete | cloud-platform, monitoring |
| `monitor_services_service_level_o_list` | read | monitoring.services.serviceLevelObjectives.list | cloud-platform, monitoring |
| `monitor_services_service_level_ob_get` | read | monitoring.services.serviceLevelObjectives.get | cloud-platform, monitoring |
| `monitor_services_service_level_patch` | write | monitoring.services.serviceLevelObjectives.patch | cloud-platform, monitoring |
| `monitor_uptime_check_ips_list` | read | monitoring.uptimeCheckIps.list | cloud-platform, monitoring |
| `policytrou_iam_troubleshoot` | write | policytroubleshooter.iam.troubleshoot | cloud-platform |
| `serviceusa_operations_cancel` | destructive | serviceusage.operations.cancel | cloud-platform, service.management |
| `serviceusa_operations_delete` | destructive | serviceusage.operations.delete | cloud-platform, service.management |
| `serviceusa_operations_get` | read | serviceusage.operations.get | cloud-platform, service.management |
| `serviceusa_operations_list` | read | serviceusage.operations.list | cloud-platform, service.management |
| `serviceusa_services_batch_enable` | write | serviceusage.services.batchEnable | cloud-platform, service.management |
| `serviceusa_services_batch_get` | read | serviceusage.services.batchGet | cloud-platform, cloud-platform.read-only |
| `serviceusa_services_disable` | destructive | serviceusage.services.disable | cloud-platform, service.management |
| `serviceusa_services_enable` | write | serviceusage.services.enable | cloud-platform, service.management |
| `serviceusa_services_get` | read | serviceusage.services.get | cloud-platform, cloud-platform.read-only |
| `serviceusa_services_list` | read | serviceusage.services.list | cloud-platform, cloud-platform.read-only |
| `storage_anywhere_caches_disable` | destructive | storage.anywhereCaches.disable | cloud-platform, devstorage.full_control |
| `storage_anywhere_caches_get` | read | storage.anywhereCaches.get | cloud-platform, cloud-platform.read-only |
| `storage_anywhere_caches_insert` | write | storage.anywhereCaches.insert | cloud-platform, devstorage.full_control |
| `storage_anywhere_caches_list` | read | storage.anywhereCaches.list | cloud-platform, cloud-platform.read-only |
| `storage_anywhere_caches_pause` | write | storage.anywhereCaches.pause | cloud-platform, devstorage.full_control |
| `storage_anywhere_caches_resume` | write | storage.anywhereCaches.resume | cloud-platform, devstorage.full_control |
| `storage_anywhere_caches_update` | write | storage.anywhereCaches.update | cloud-platform, devstorage.full_control |
| `storage_bucket_access_controls_delete` | destructive | storage.bucketAccessControls.delete | cloud-platform, devstorage.full_control |
| `storage_bucket_access_controls_get` | read | storage.bucketAccessControls.get | cloud-platform, devstorage.full_control |
| `storage_bucket_access_controls_insert` | write | storage.bucketAccessControls.insert | cloud-platform, devstorage.full_control |
| `storage_bucket_access_controls_list` | read | storage.bucketAccessControls.list | cloud-platform, devstorage.full_control |
| `storage_bucket_access_controls_patch` | write | storage.bucketAccessControls.patch | cloud-platform, devstorage.full_control |
| `storage_bucket_access_controls_update` | write | storage.bucketAccessControls.update | cloud-platform, devstorage.full_control |
| `storage_buckets_delete` | destructive | storage.buckets.delete | cloud-platform, devstorage.full_control |
| `storage_buckets_get` | read | storage.buckets.get | cloud-platform, cloud-platform.read-only |
| `storage_buckets_get_iam_policy` | read | storage.buckets.getIamPolicy | cloud-platform, devstorage.full_control |
| `storage_buckets_get_storage_layout` | read | storage.buckets.getStorageLayout | cloud-platform, cloud-platform.read-only |
| `storage_buckets_insert` | write | storage.buckets.insert | cloud-platform, devstorage.full_control |
| `storage_buckets_list` | read | storage.buckets.list | cloud-platform, cloud-platform.read-only |
| `storage_buckets_lock_retention_policy` | write | storage.buckets.lockRetentionPolicy | cloud-platform, devstorage.full_control |
| `storage_buckets_patch` | write | storage.buckets.patch | cloud-platform, devstorage.full_control |
| `storage_buckets_relocate` | write | storage.buckets.relocate | cloud-platform, devstorage.full_control |
| `storage_buckets_restore` | write | storage.buckets.restore | cloud-platform, devstorage.full_control |
| `storage_buckets_set_iam_policy` | destructive | storage.buckets.setIamPolicy | cloud-platform, devstorage.full_control |
| `storage_buckets_test_iam_permissions` | read | storage.buckets.testIamPermissions | cloud-platform, cloud-platform.read-only |
| `storage_buckets_update` | write | storage.buckets.update | cloud-platform, devstorage.full_control |
| `storage_default_object_access_c_patch` | write | storage.defaultObjectAccessControls.patch | cloud-platform, devstorage.full_control |
| `storage_default_object_access_co_list` | read | storage.defaultObjectAccessControls.list | cloud-platform, devstorage.full_control |
| `storage_default_object_access_con_get` | read | storage.defaultObjectAccessControls.get | cloud-platform, devstorage.full_control |
| `storage_default_object_access_delete` | destructive | storage.defaultObjectAccessControls.delete | cloud-platform, devstorage.full_control |
| `storage_default_object_access_insert` | write | storage.defaultObjectAccessControls.insert | cloud-platform, devstorage.full_control |
| `storage_default_object_access_update` | write | storage.defaultObjectAccessControls.update | cloud-platform, devstorage.full_control |
| `storage_folders_delete` | destructive | storage.folders.delete | cloud-platform, devstorage.full_control |
| `storage_folders_delete_recursive` | destructive | storage.folders.deleteRecursive | cloud-platform, devstorage.full_control |
| `storage_folders_get` | read | storage.folders.get | cloud-platform, cloud-platform.read-only |
| `storage_folders_insert` | write | storage.folders.insert | cloud-platform, devstorage.full_control |
| `storage_folders_list` | read | storage.folders.list | cloud-platform, cloud-platform.read-only |
| `storage_folders_rename` | write | storage.folders.rename | cloud-platform, devstorage.full_control |
| `storage_managed_folder_get_iam_policy` | read | storage.managedFolders.getIamPolicy | cloud-platform, cloud-platform.read-only |
| `storage_managed_folder_set_iam_policy` | destructive | storage.managedFolders.setIamPolicy | cloud-platform, devstorage.full_control |
| `storage_managed_folder_test_iam_permi` | read | storage.managedFolders.testIamPermissions | cloud-platform, cloud-platform.read-only |
| `storage_managed_folders_delete` | destructive | storage.managedFolders.delete | cloud-platform, devstorage.full_control |
| `storage_managed_folders_get` | read | storage.managedFolders.get | cloud-platform, cloud-platform.read-only |
| `storage_managed_folders_insert` | write | storage.managedFolders.insert | cloud-platform, devstorage.full_control |
| `storage_managed_folders_list` | read | storage.managedFolders.list | cloud-platform, cloud-platform.read-only |
| `storage_managed_folders_update` | write | storage.managedFolders.update | cloud-platform, devstorage.full_control |
| `storage_notifications_delete` | destructive | storage.notifications.delete | cloud-platform, devstorage.full_control |
| `storage_notifications_get` | read | storage.notifications.get | cloud-platform, cloud-platform.read-only |
| `storage_notifications_insert` | write | storage.notifications.insert | cloud-platform, devstorage.full_control |
| `storage_notifications_list` | read | storage.notifications.list | cloud-platform, cloud-platform.read-only |
| `storage_object_access_controls_delete` | destructive | storage.objectAccessControls.delete | cloud-platform, devstorage.full_control |
| `storage_object_access_controls_get` | read | storage.objectAccessControls.get | cloud-platform, devstorage.full_control |
| `storage_object_access_controls_insert` | write | storage.objectAccessControls.insert | cloud-platform, devstorage.full_control |
| `storage_object_access_controls_list` | read | storage.objectAccessControls.list | cloud-platform, devstorage.full_control |
| `storage_object_access_controls_patch` | write | storage.objectAccessControls.patch | cloud-platform, devstorage.full_control |
| `storage_object_access_controls_update` | write | storage.objectAccessControls.update | cloud-platform, devstorage.full_control |
| `storage_objects_bulk_restore` | write | storage.objects.bulkRestore | cloud-platform, devstorage.full_control |
| `storage_objects_compose` | write | storage.objects.compose | cloud-platform, devstorage.full_control |
| `storage_objects_copy` | write | storage.objects.copy | cloud-platform, devstorage.full_control |
| `storage_objects_delete` | destructive | storage.objects.delete | cloud-platform, devstorage.full_control |
| `storage_objects_get` | read | storage.objects.get | cloud-platform, cloud-platform.read-only |
| `storage_objects_get_iam_policy` | read | storage.objects.getIamPolicy | cloud-platform, cloud-platform.read-only |
| `storage_objects_list` | read | storage.objects.list | cloud-platform, cloud-platform.read-only |
| `storage_objects_move` | write | storage.objects.move | cloud-platform, devstorage.full_control |
| `storage_objects_patch` | write | storage.objects.patch | cloud-platform, devstorage.full_control |
| `storage_objects_restore` | write | storage.objects.restore | cloud-platform, devstorage.full_control |
| `storage_objects_rewrite` | write | storage.objects.rewrite | cloud-platform, devstorage.full_control |
| `storage_objects_set_iam_policy` | destructive | storage.objects.setIamPolicy | cloud-platform, devstorage.full_control |
| `storage_objects_test_iam_permissions` | read | storage.objects.testIamPermissions | cloud-platform, cloud-platform.read-only |
| `storage_objects_update` | write | storage.objects.update | cloud-platform, devstorage.full_control |
| `storage_objects_view_full_context` | read | storage.objects.viewFullContext | cloud-platform, cloud-platform.read-only |
| `storage_operations_advance_relocate_b` | write | storage.buckets.operations.advanceRelocateBucket | cloud-platform, devstorage.full_control |
| `storage_operations_cancel` | destructive | storage.buckets.operations.cancel | cloud-platform, devstorage.full_control |
| `storage_operations_get` | read | storage.buckets.operations.get | cloud-platform, cloud-platform.read-only |
| `storage_operations_list` | read | storage.buckets.operations.list | cloud-platform, cloud-platform.read-only |
| `storage_projects_hmac_keys_create` | write | storage.projects.hmacKeys.create | cloud-platform, devstorage.full_control |
| `storage_projects_hmac_keys_delete` | destructive | storage.projects.hmacKeys.delete | cloud-platform, devstorage.full_control |
| `storage_projects_hmac_keys_get` | read | storage.projects.hmacKeys.get | cloud-platform, cloud-platform.read-only |
| `storage_projects_hmac_keys_list` | read | storage.projects.hmacKeys.list | cloud-platform, cloud-platform.read-only |
| `storage_projects_hmac_keys_update` | write | storage.projects.hmacKeys.update | cloud-platform, devstorage.full_control |
| `storage_projects_service_account_get` | read | storage.projects.serviceAccount.get | cloud-platform, cloud-platform.read-only |
| `storage_rapid_caches_disable` | destructive | storage.rapidCaches.disable | cloud-platform, devstorage.full_control |
| `storage_rapid_caches_get` | read | storage.rapidCaches.get | cloud-platform, cloud-platform.read-only |
| `storage_rapid_caches_insert` | write | storage.rapidCaches.insert | cloud-platform, devstorage.full_control |
| `storage_rapid_caches_list` | read | storage.rapidCaches.list | cloud-platform, cloud-platform.read-only |
| `storage_rapid_caches_update` | write | storage.rapidCaches.update | cloud-platform, devstorage.full_control |
| `trace_projects_traces_batch_write` | write | cloudtrace.projects.traces.batchWrite | cloud-platform, trace.append |
| `trace_projects_traces_spans_create_sp` | write | cloudtrace.projects.traces.spans.createSpan | cloud-platform, trace.append |

## Gateway tools (3)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_call` | dynamic | Call an API method | (none) |
| `api_describe` | read | Describe an API method | (none) |
| `api_search` | read | Search API methods | (none) |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gcloud: API methods | (none) |

## Generated APIs

Each API links to Google's documentation for it, as Google's Discovery directory names it (`documentationLink`, kept in `data/catalog.json`). The link is the API's documentation home, not a page per method: the directory gives no link per method, and Google's REST reference pages are laid out differently from product to product.

- Service Usage API (`serviceusage/v1`), 10 methods in the catalog. Documentation: <https://cloud.google.com/service-usage/>
- Cloud Resource Manager API (`cloudresourcemanager/v3`), 92 methods in the catalog. Documentation: <https://cloud.google.com/resource-manager>
- API Keys API (`apikeys/v2`), 9 methods in the catalog. Documentation: <https://cloud.google.com/api-keys/docs>
- Cloud Billing API (`cloudbilling/v1`), 28 methods in the catalog. Documentation: <https://cloud.google.com/billing/docs/apis>
- Cloud Monitoring API (`monitoring/v3`), 56 methods in the catalog. Documentation: <https://cloud.google.com/monitoring/api/>
- Cloud Storage API (`storage/v1`), 87 methods in the catalog. Documentation: <https://cloud.google.com/storage/docs/apis>
- BigQuery API (`bigquery/v2`), 47 methods in the catalog. Documentation: <https://cloud.google.com/bigquery/>
- Identity and Access Management (IAM) API (`iam/v2`), 6 methods in the catalog. Documentation: <https://cloud.google.com/iam/>
- Cloud Asset API (`cloudasset/v1`), 24 methods in the catalog. Documentation: <https://cloud.google.com/asset-inventory/docs/quickstart>
- Cloud Trace API (`cloudtrace/v2`), 2 methods in the catalog. Documentation: <https://cloud.google.com/trace/>
- Cloud Profiler API (`cloudprofiler/v2`), 4 methods in the catalog. Documentation: <https://cloud.google.com/profiler/>
- Policy Troubleshooter API (`policytroubleshooter/v3`), 1 methods in the catalog. Documentation: <https://cloud.google.com/iam/>

## Gateway APIs (reached through api_search, api_describe, api_call)

- Cloud Logging API (`logging/v2`), 254 methods. Documentation: <https://cloud.google.com/logging/docs/>
- Compute Engine API (`compute/v1`), 1018 methods. Documentation: <https://developers.google.com/compute/docs/reference/latest/>
- Cloud Run Admin API (`run/v2`), 59 methods. Documentation: <https://cloud.google.com/run/>
- Kubernetes Engine API (`container/v1`), 71 methods. Documentation: <https://cloud.google.com/kubernetes-engine/docs/>
- Cloud Key Management Service (KMS) API (`cloudkms/v1`), 87 methods. Documentation: <https://cloud.google.com/kms/>
- Sensitive Data Protection (DLP) (`dlp/v2`), 150 methods. Documentation: <https://cloud.google.com/sensitive-data-protection/docs/>
- Security Command Center API (`securitycenter/v1`), 172 methods. Documentation: <https://cloud.google.com/security-command-center>
- Organization Policy API (`orgpolicy/v2`), 26 methods. Documentation: <https://cloud.google.com/orgpolicy/docs/reference/rest/index.html>
- Access Context Manager API (`accesscontextmanager/v1`), 42 methods. Documentation: <https://cloud.google.com/access-context-manager/docs/reference/rest/>
- Secret Manager API (`secretmanager/v1`), 36 methods. Documentation: <https://cloud.google.com/secret-manager/>
- Cloud Pub/Sub API (`pubsub/v1`), 46 methods. Documentation: <https://cloud.google.com/pubsub/docs>
- Cloud Spanner API (`spanner/v1`), 99 methods. Documentation: <https://cloud.google.com/spanner/>
- Cloud SQL Admin API (`sqladmin/v1`), 85 methods. Documentation: <https://cloud.google.com/sql/docs>
- Cloud Firestore API (`firestore/v1`), 60 methods. Documentation: <https://cloud.google.com/firestore>
- Cloud Functions API (`cloudfunctions/v2`), 21 methods. Documentation: <https://cloud.google.com/functions>
- Cloud Scheduler API (`cloudscheduler/v1`), 16 methods. Documentation: <https://cloud.google.com/scheduler/>
- Cloud Tasks API (`cloudtasks/v2`), 24 methods. Documentation: <https://cloud.google.com/tasks/>
- Cloud DNS API (`dns/v1`), 51 methods. Documentation: <https://cloud.google.com/dns/docs>
- Cloud Build API (`cloudbuild/v2`), 22 methods. Documentation: <https://cloud.google.com/cloud-build/docs/>
- Artifact Registry API (`artifactregistry/v1`), 69 methods. Documentation: <https://cloud.google.com/artifacts/docs/>
- Error Reporting API (`clouderrorreporting/v1beta1`), 11 methods. Documentation: <https://cloud.google.com/error-reporting/>
- Cloud Shell API (`cloudshell/v1`), 10 methods. Documentation: <https://cloud.google.com/shell/docs/>
- Essential Contacts API (`essentialcontacts/v1`), 21 methods. Documentation: <https://cloud.google.com/essentialcontacts/docs/>
- Public Certificate Authority API (`publicca/v1`), 1 methods. Documentation: <https://cloud.google.com/public-certificate-authority/docs>
- Traffic Director API (`trafficdirector/v3`), 1 methods. Documentation: <https://cloud.google.com/traffic-director>
- API Discovery Service (`discovery/v1`), 2 methods. Documentation: <https://developers.google.com/discovery>
- Service Control API (`servicecontrol/v2`), 2 methods. Documentation: <https://cloud.google.com/service-control/>
- Policy Analyzer API (`policyanalyzer/v1`), 3 methods. Documentation: <https://cloud.google.com/policy-intelligence/docs/overview>
- Cloud Runtime Configuration API (`runtimeconfig/v1`), 3 methods. Documentation: <https://cloud.google.com/deployment-manager/runtime-configurator/>
- KMS Inventory API (`kmsinventory/v1`), 4 methods. Documentation: <https://cloud.google.com/kms/>
- Cloud Billing Budget API (`billingbudgets/v1`), 5 methods. Documentation: <https://cloud.google.com/billing/docs/how-to/budget-api-overview>
- Cloud Location Finder API (`cloudlocationfinder/v1`), 5 methods. Documentation: <https://cloud.google.com/location-finder/docs>
- Security Token Service API (`sts/v1`), 5 methods. Documentation: <http://cloud.google.com/iam/docs/workload-identity-federation>
- IAM Service Account Credentials API (`iamcredentials/v1`), 7 methods. Documentation: <https://cloud.google.com/iam/docs/creating-short-lived-service-account-credentials>
- On-Demand Scanning API (`ondemandscanning/v1`), 7 methods. Documentation: <https://cloud.google.com/container-analysis/docs/on-demand-scanning/>
- Advisory Notifications API (`advisorynotifications/v1`), 8 methods. Documentation: <https://cloud.google.com/advisory-notifications>
- BigQuery Connection API (`bigqueryconnection/v1`), 8 methods. Documentation: <https://cloud.google.com/bigquery/docs/connections-api-intro>
- Database Center API (`databasecenter/v1beta`), 8 methods. Documentation: <https://docs.cloud.google.com/database-center/docs/overview>
- Data pipelines API (`datapipelines/v1`), 8 methods. Documentation: <https://cloud.google.com/dataflow/docs/guides/data-pipelines>
- Transcoder API (`transcoder/v1`), 8 methods. Documentation: <https://cloud.google.com/transcoder/docs/>
- Serverless VPC Access API (`vpcaccess/v1`), 8 methods. Documentation: <https://cloud.google.com/vpc/docs/configure-serverless-vpc-access>
- Cloud Product Registry API (`cloudproductregistry/v1`), 9 methods. Documentation: <https://docs.cloud.google.com/product-registry>
- Cloud OS Login API (`oslogin/v1`), 9 methods. Documentation: <https://cloud.google.com/compute/docs/oslogin/>
- BigQuery Data Policy API (`bigquerydatapolicy/v2`), 10 methods. Documentation: <https://cloud.google.com/bigquery/docs/column-data-masking>
- GKE Hub API (`gkehub/v2`), 10 methods. Documentation: <https://cloud.google.com/anthos/multicluster-management/connect/registering-a-cluster>
- Application Integration API (`integrations/v2`), 10 methods. Documentation: <https://cloud.google.com/application-integration>
- Workflow Executions API (`workflowexecutions/v1`), 10 methods. Documentation: <https://cloud.google.com/workflows>
- Blockchain Node Engine API (`blockchainnodeengine/v1`), 11 methods. Documentation: <https://cloud.google.com/blockchain-node-engine>
- Cluster Director API (`hypercomputecluster/v1`), 11 methods. Documentation: <https://docs.cloud.google.com/cluster-director/docs>
- Cloud IDS API (`ids/v1`), 11 methods. Documentation: <https://cloud.google.com/>
- Workflows API (`workflows/v1`), 11 methods. Documentation: <https://cloud.google.com/workflows>
- Cloud Commerce Partner Procurement API (`cloudcommerceprocurement/v1`), 13 methods. Documentation: <https://cloud.google.com/marketplace/docs/partners/>
- Cloud Controls Partner API (`cloudcontrolspartner/v1`), 13 methods. Documentation: <https://cloud.google.com/sovereign-controls-by-partners/docs/sovereign-partners/reference/rest>
- Parallelstore API (`parallelstore/v1`), 13 methods. Documentation: <https://cloud.google.com/parallelstore>
- Storage Batch Operations API (`storagebatchoperations/v1`), 13 methods. Documentation: <https://cloud.google.com/storage/docs/batch-operations/overview>
- Web Security Scanner API (`websecurityscanner/v1`), 13 methods. Documentation: <https://cloud.google.com/security-command-center/docs/concepts-web-security-scanner-overview/>
- Batch API (`batch/v1`), 14 methods. Documentation: <https://cloud.google.com/batch/>
- Service Consumer Management API (`serviceconsumermanagement/v1`), 14 methods. Documentation: <https://cloud.google.com/service-consumer-management/docs/overview>
- Rapid Migration Assessment API (`rapidmigrationassessment/v1`), 16 methods. Documentation: <https://cloud.google.com/migration-center>
- Cloud Memorystore for Memcached API (`memcache/v1`), 17 methods. Documentation: <https://cloud.google.com/memorystore/>
- Storage Transfer API (`storagetransfer/v1`), 17 methods. Documentation: <https://cloud.google.com/storage-transfer/docs>
- Cloud Datastore API (`datastore/v1`), 18 methods. Documentation: <https://cloud.google.com/datastore/>
- Cloud Deployment Manager V2 API (`deploymentmanager/v2`), 18 methods. Documentation: <https://cloud.google.com/deployment-manager>
- Cloud FTP API (`ftp/v1`), 18 methods. Documentation: <https://docs.cloud.google.com/cloud-ftp>
- Cloud Data Fusion API (`datafusion/v1`), 19 methods. Documentation: <https://cloud.google.com/data-fusion/docs>
- Cloud Identity-Aware Proxy API (`iap/v1`), 19 methods. Documentation: <https://cloud.google.com/iap>
- Looker (Google Cloud core) API (`looker/v1`), 20 methods. Documentation: <https://cloud.google.com/looker/docs/reference/rest/>
- Binary Authorization API (`binaryauthorization/v1`), 21 methods. Documentation: <https://cloud.google.com/binary-authorization/>
- Google Cloud Support API (`cloudsupport/v2`), 22 methods. Documentation: <https://cloud.google.com/support/docs/apis>
- Service Management API (`servicemanagement/v1`), 22 methods. Documentation: <https://cloud.google.com/service-management/>
- Threat Intelligence API (`threatintelligence/v1beta`), 22 methods. Documentation: <https://docs.cloud.google.com/threatintelligence/>
- API Management API (`apim/v1alpha`), 23 methods. Documentation: <https://cloud.google.com/apigee/>
- Security Posture API (`securityposture/v1`), 23 methods. Documentation: <https://cloud.google.com/security-command-center>
- Parameter Manager API (`parametermanager/v1`), 24 methods. Documentation: <https://cloud.google.com/secret-manager/parameter-manager/docs/overview>
- reCAPTCHA Enterprise API (`recaptchaenterprise/v1`), 24 methods. Documentation: <https://cloud.google.com/recaptcha-enterprise/>
- Service Directory API (`servicedirectory/v1`), 24 methods. Documentation: <https://cloud.google.com/service-directory>
- Cloud TPU API (`tpu/v2`), 24 methods. Documentation: <https://cloud.google.com/tpu/>
- Connectors API (`connectors/v2`), 26 methods. Documentation: <https://cloud.google.com/apigee/docs/api-platform/connectors/about-connectors>
- Cloud Filestore API (`file/v1`), 26 methods. Documentation: <https://cloud.google.com/filestore/>
- Access Approval API (`accessapproval/v1`), 27 methods. Documentation: <https://cloud.google.com/assured-workloads/access-approval/docs>
- Lakehouse API (`biglake/v1`), 27 methods. Documentation: <https://cloud.google.com/products/lakehouse>
- OS Config API (`osconfig/v2`), 27 methods. Documentation: <https://cloud.google.com/compute/docs/osconfig/rest>
- Policy Simulator API (`policysimulator/v1`), 27 methods. Documentation: <https://cloud.google.com/iam/docs/simulating-access>
- Data Lineage API (`datalineage/v1`), 28 methods. Documentation: <https://cloud.google.com/data-catalog>
- Cloud Domains API (`domains/v1`), 28 methods. Documentation: <https://cloud.google.com/domains/>
- Pub/Sub Lite API (`pubsublite/v1`), 28 methods. Documentation: <https://cloud.google.com/pubsub/lite/docs>
- Cloud Composer API (`composer/v1`), 29 methods. Documentation: <https://cloud.google.com/composer/>
- Service Networking API (`servicenetworking/v1`), 29 methods. Documentation: <https://cloud.google.com/service-infrastructure/docs/service-networking/getting-started>
- API Gateway API (`apigateway/v1`), 30 methods. Documentation: <https://cloud.google.com/api-gateway/docs>
- Workload Manager API (`workloadmanager/v1`), 31 methods. Documentation: <https://cloud.google.com/workload-manager/docs>
- Assured Workloads API (`assuredworkloads/v1`), 32 methods. Documentation: <https://cloud.google.com/learnmoreurl>
- Datastream API (`datastream/v1`), 32 methods. Documentation: <https://cloud.google.com/datastream/>
- BigQuery Reservation API (`bigqueryreservation/v1`), 33 methods. Documentation: <https://cloud.google.com/bigquery/>
- Cloud Workstations API (`workstations/v1`), 33 methods. Documentation: <https://cloud.google.com/workstations>
- Analytics Hub API (`analyticshub/v1`), 35 methods. Documentation: <https://cloud.google.com/bigquery/docs/analytics-hub-introduction>
- Certificate Manager API (`certificatemanager/v1`), 36 methods. Documentation: <https://docs.cloud.google.com/certificate-manager/docs/overview>
- BigQuery Data Transfer API (`bigquerydatatransfer/v1`), 37 methods. Documentation: <https://cloud.google.com/bigquery-transfer/>
- AlloyDB API (`alloydb/v1`), 40 methods. Documentation: <https://cloud.google.com/alloydb/>
- App Hub API (`apphub/v1`), 40 methods. Documentation: <https://cloud.google.com/app-hub/docs/>
- App Lifecycle Manager API (`saasservicemgmt/v1`), 42 methods. Documentation: <https://docs.cloud.google.com/app-lifecycle-manager>
- Cloud Number Registry API (`cloudnumberregistry/v1alpha`), 44 methods. Documentation: <https://docs.cloud.google.com/number-registry/reference/rest>
- Container Analysis API (`containeranalysis/v1`), 44 methods. Documentation: <https://cloud.google.com/container-analysis/api/reference/rest/>
- Observability API (`observability/v1`), 44 methods. Documentation: <https://cloud.google.com/stackdriver/docs/>
- Certificate Authority API (`privateca/v1`), 44 methods. Documentation: <https://cloud.google.com/>
- Developer Connect API (`developerconnect/v1`), 55 methods. Documentation: <http://cloud.google.com/developer-connect/docs/overview>
- Managed Service for Microsoft Active Directory API (`managedidentities/v1`), 45 methods. Documentation: <https://cloud.google.com/managed-microsoft-ad/>
- Infrastructure Manager API (`config/v1`), 47 methods. Documentation: <https://cloud.google.com/infrastructure-manager/docs>
- Google Cloud Memorystore for Redis API (`redis/v1`), 47 methods. Documentation: <https://cloud.google.com/memorystore/docs/redis/>
- Dataproc Metastore API (`metastore/v1`), 48 methods. Documentation: <https://cloud.google.com/dataproc-metastore/docs>
- Network Management API (`networkmanagement/v1`), 48 methods. Documentation: <https://cloud.google.com/>
- Recommender API (`recommender/v1`), 48 methods. Documentation: <https://cloud.google.com/recommender/docs/>
- Audit Manager API (`auditmanager/v1`), 51 methods. Documentation: <https://cloud.google.com/assured-workloads/docs/audit-manager>
- Bare Metal Solution API (`baremetalsolution/v2`), 52 methods. Documentation: <https://cloud.google.com/bare-metal>
- BeyondCorp API (`beyondcorp/v1`), 46 methods. Documentation: <https://cloud.google.com/>
- Dataflow API (`dataflow/v1b3`), 57 methods. Documentation: <https://cloud.google.com/dataflow>
- App Engine Admin API (`appengine/v1`), 59 methods. Documentation: <https://cloud.google.com/appengine/docs/admin-api/>
- Backup and DR Service API (`backupdr/v1`), 73 methods. Documentation: <https://cloud.google.com/backup-disaster-recovery>
- Cloud Deploy API (`clouddeploy/v1`), 61 methods. Documentation: <https://cloud.google.com/deploy/>
- Secure Source Manager API (`securesourcemanager/v1`), 62 methods. Documentation: <https://cloud.google.com/secure-source-manager>
- Cloud Channel API (`cloudchannel/v1`), 65 methods. Documentation: <https://cloud.google.com/channel>
- Eventarc API (`eventarc/v1`), 66 methods. Documentation: <https://cloud.google.com/eventarc>
- Backup for GKE API (`gkebackup/v1`), 67 methods. Documentation: <https://cloud.google.com/kubernetes-engine/docs/add-on/backup-for-gke>
- Migration Center API (`migrationcenter/v1`), 67 methods. Documentation: <https://cloud.google.com/migration-center>
- VM Migration API (`vmmigration/v1`), 68 methods. Documentation: <https://cloud.google.com/migrate/virtual-machines>
- Database Migration API (`datamigration/v1`), 70 methods. Documentation: <https://cloud.google.com/database-migration/>
- Google Cloud Data Catalog API (`datacatalog/v1`), 71 methods. Documentation: <https://cloud.google.com/data-catalog/docs/>
- GKE On-Prem API (`gkeonprem/v1`), 79 methods. Documentation: <https://cloud.google.com/anthos/clusters/docs/on-prem/>
- Cloud Bigtable Admin API (`bigtableadmin/v2`), 82 methods. Documentation: <https://cloud.google.com/bigtable/>
- NetApp API (`netapp/v1`), 82 methods. Documentation: <https://cloud.google.com/netapp/>
- SAS Portal API (`sasportal/v1alpha1`), 82 methods. Documentation: <https://developers.google.com/spectrum-access-system/>
- Dataform API (`dataform/v1`), 89 methods. Documentation: <https://cloud.google.com/dataform/docs>
- Managed Service for Apache Kafka API (`managedkafka/v1`), 89 methods. Documentation: <https://cloud.google.com/managed-service-for-apache-kafka/docs>
- Oracle Database@Google Cloud API (`oracledatabase/v1`), 107 methods. Documentation: <https://cloud.google.com/oracle/database/docs>
- API hub API (`apihub/v1`), 97 methods. Documentation: <https://cloud.google.com/apigee/docs/api-hub/what-is-api-hub>
- VMware Engine API (`vmwareengine/v1`), 103 methods. Documentation: <https://cloud.google.com/solutions/vmware-as-a-service>
- Network Connectivity API (`networkconnectivity/v1`), 108 methods. Documentation: <https://cloud.google.com/network-connectivity/docs/reference/networkconnectivity/rest>
- Network Services API (`networkservices/v1`), 122 methods. Documentation: <https://cloud.google.com/networking>
- Cloud Dataproc API (`dataproc/v1`), 136 methods. Documentation: <https://cloud.google.com/dataproc/>
- Cloud Healthcare API (`healthcare/v1`), 154 methods. Documentation: <https://cloud.google.com/healthcare>
- Network Security API (`networksecurity/v1`), 185 methods. Documentation: <https://cloud.google.com/networking>
- Cloud Dataplex API (`dataplex/v1`), 206 methods. Documentation: <https://cloud.google.com/dataplex/docs>
- Apigee API (`apigee/v1`), 374 methods. Documentation: <https://cloud.google.com/apigee-api-management/>
- AlloyDB API (`alloydb/v1alpha`), 45 methods. Documentation: <https://cloud.google.com/alloydb/>
- AlloyDB API (`alloydb/v1beta`), 45 methods. Documentation: <https://cloud.google.com/alloydb/>
- Analytics Hub API (`analyticshub/v1beta1`), 18 methods. Documentation: <https://cloud.google.com/bigquery/docs/analytics-hub-introduction>
- API Gateway API (`apigateway/v1beta`), 30 methods. Documentation: <https://cloud.google.com/api-gateway/docs>
- App Engine Admin API (`appengine/v1alpha`), 30 methods. Documentation: <https://cloud.google.com/appengine/docs/admin-api/>
- App Engine Admin API (`appengine/v1beta`), 63 methods. Documentation: <https://cloud.google.com/appengine/docs/admin-api/>
- App Hub API (`apphub/v1alpha`), 42 methods. Documentation: <https://cloud.google.com/app-hub/docs/>
- Artifact Registry API (`artifactregistry/v1beta1`), 24 methods. Documentation: <https://cloud.google.com/artifacts/docs/>
- Artifact Registry API (`artifactregistry/v1beta2`), 32 methods. Documentation: <https://cloud.google.com/artifacts/docs/>
- Assured Workloads API (`assuredworkloads/v1beta1`), 31 methods. Documentation: <https://cloud.google.com/learnmoreurl>
- Backup and DR Service API (`backupdr/v1beta`), 73 methods. Documentation: <https://cloud.google.com/backup-disaster-recovery>
- BeyondCorp API (`beyondcorp/v1alpha`), 76 methods. Documentation: <https://cloud.google.com/>
- BigQuery Connection API (`bigqueryconnection/v1beta1`), 9 methods. Documentation: <https://cloud.google.com/bigquery/docs/connections-api-intro>
- BigQuery Data Policy API (`bigquerydatapolicy/v1`), 9 methods. Documentation: <https://cloud.google.com/bigquery/docs/column-data-masking>
- Cloud Billing Budget API (`billingbudgets/v1beta1`), 5 methods. Documentation: <https://cloud.google.com/billing/docs/how-to/budget-api-overview>
- Binary Authorization API (`binaryauthorization/v1beta1`), 15 methods. Documentation: <https://cloud.google.com/binary-authorization/>
- Cloud Asset API (`cloudasset/v1beta1`), 8 methods. Documentation: <https://cloud.google.com/asset-inventory/docs/quickstart>
- Cloud Asset API (`cloudasset/v1p1beta1`), 2 methods. Documentation: <https://cloud.google.com/asset-inventory/docs/quickstart>
- Cloud Asset API (`cloudasset/v1p5beta1`), 1 methods. Documentation: <https://cloud.google.com/asset-inventory/docs/quickstart>
- Cloud Asset API (`cloudasset/v1p7beta1`), 2 methods. Documentation: <https://cloud.google.com/asset-inventory/docs/quickstart>
- Cloud Billing API (`cloudbilling/v1beta`), 17 methods. Documentation: <https://cloud.google.com/billing/docs/apis>
- Cloud Build API (`cloudbuild/v1`), 57 methods. Documentation: <https://cloud.google.com/cloud-build/docs/>
- Cloud Controls Partner API (`cloudcontrolspartner/v1beta`), 13 methods. Documentation: <https://cloud.google.com/sovereign-controls-by-partners/docs/sovereign-partners/reference/rest>
- Cloud Functions API (`cloudfunctions/v1`), 14 methods. Documentation: <https://cloud.google.com/functions>
- Cloud Functions API (`cloudfunctions/v2alpha`), 21 methods. Documentation: <https://cloud.google.com/functions>
- Cloud Functions API (`cloudfunctions/v2beta`), 21 methods. Documentation: <https://cloud.google.com/functions>
- Cloud Location Finder API (`cloudlocationfinder/v1alpha`), 5 methods. Documentation: <https://cloud.google.com/location-finder/docs>
- Cloud Quotas API (`cloudquotas/v1`), 28 methods. Documentation: <https://cloud.google.com/docs/quotas>
- Cloud Quotas API (`cloudquotas/v1beta`), 28 methods. Documentation: <https://cloud.google.com/docs/quotas>
- Cloud Resource Manager API (`cloudresourcemanager/v1`), 38 methods. Documentation: <https://cloud.google.com/resource-manager>
- Cloud Resource Manager API (`cloudresourcemanager/v1beta1`), 16 methods. Documentation: <https://cloud.google.com/resource-manager>
- Cloud Resource Manager API (`cloudresourcemanager/v2`), 12 methods. Documentation: <https://cloud.google.com/resource-manager>
- Cloud Resource Manager API (`cloudresourcemanager/v2beta1`), 12 methods. Documentation: <https://cloud.google.com/resource-manager>
- Cloud Scheduler API (`cloudscheduler/v1beta1`), 14 methods. Documentation: <https://cloud.google.com/scheduler/>
- Google Cloud Support API (`cloudsupport/v2beta`), 23 methods. Documentation: <https://cloud.google.com/support/docs/apis>
- Cloud Tasks API (`cloudtasks/v2beta2`), 29 methods. Documentation: <https://cloud.google.com/tasks/>
- Cloud Tasks API (`cloudtasks/v2beta3`), 24 methods. Documentation: <https://cloud.google.com/tasks/>
- Cloud Trace API (`cloudtrace/v1`), 3 methods. Documentation: <https://cloud.google.com/trace/>
- Cloud Trace API (`cloudtrace/v2beta1`), 5 methods. Documentation: <https://cloud.google.com/trace/>
- Cloud Composer API (`composer/v1beta1`), 31 methods. Documentation: <https://cloud.google.com/composer/>
- Compute Engine API (`compute/2026-09-01`), 1019 methods. Documentation: <https://cloud.google.com/compute/>
- Compute Engine API (`compute/2026-10-01-preview`), 1079 methods. Documentation: <https://cloud.google.com/compute/>
- Compute Engine API (`compute/alpha`), 1212 methods. Documentation: <https://developers.google.com/compute/docs/reference/latest/>
- Compute Engine API (`compute/beta`), 1130 methods. Documentation: <https://developers.google.com/compute/docs/reference/latest/>
- Compute Engine API (`compute/preview`), 1079 methods. Documentation: <https://cloud.google.com/compute/>
- Compute Engine API (`compute/stable`), 1019 methods. Documentation: <https://cloud.google.com/compute/>
- Connectors API (`connectors/v1`), 80 methods. Documentation: <https://cloud.google.com/apigee/docs/api-platform/connectors/about-connectors>
- Kubernetes Engine API (`container/v1beta1`), 72 methods. Documentation: <https://cloud.google.com/kubernetes-engine/docs/>
- Container Analysis API (`containeranalysis/v1alpha1`), 33 methods. Documentation: <https://cloud.google.com/container-analysis/api/reference/rest/>
- Container Analysis API (`containeranalysis/v1beta1`), 46 methods. Documentation: <https://cloud.google.com/container-analysis/api/reference/rest/>
- Google Cloud Data Catalog API (`datacatalog/v1beta1`), 55 methods. Documentation: <https://cloud.google.com/data-catalog/docs/>
- Dataform API (`dataform/v1beta1`), 96 methods. Documentation: <https://cloud.google.com/dataform/docs>
- Cloud Data Fusion API (`datafusion/v1beta1`), 25 methods. Documentation: <https://cloud.google.com/data-fusion/docs>
- Database Migration API (`datamigration/v1beta1`), 29 methods. Documentation: <https://cloud.google.com/database-migration/>
- Cloud Datastore API (`datastore/v1beta1`), 2 methods. Documentation: <https://cloud.google.com/datastore/>
- Cloud Datastore API (`datastore/v1beta3`), 8 methods. Documentation: <https://cloud.google.com/datastore/>
- Datastream API (`datastream/v1alpha1`), 31 methods. Documentation: <https://cloud.google.com/datastream/>
- Cloud Deployment Manager V2 API (`deploymentmanager/alpha`), 33 methods. Documentation: <https://cloud.google.com/deployment-manager>
- Cloud Deployment Manager V2 API (`deploymentmanager/v2beta`), 32 methods. Documentation: <https://cloud.google.com/deployment-manager>
- Cloud DNS API (`dns/v1beta2`), 51 methods. Documentation: <https://cloud.google.com/dns/docs>
- Cloud Domains API (`domains/v1alpha2`), 28 methods. Documentation: <https://cloud.google.com/domains/>
- Cloud Domains API (`domains/v1beta1`), 28 methods. Documentation: <https://cloud.google.com/domains/>
- Cloud Filestore API (`file/v1beta1`), 47 methods. Documentation: <https://cloud.google.com/filestore/>
- Cloud Firestore API (`firestore/v1beta1`), 24 methods. Documentation: <https://cloud.google.com/firestore>
- Cloud Firestore API (`firestore/v1beta2`), 9 methods. Documentation: <https://cloud.google.com/firestore>
- Cloud FTP API (`ftp/v1alpha`), 18 methods. Documentation: <https://docs.cloud.google.com/cloud-ftp>
- GKE Hub API (`gkehub/v1`), 73 methods. Documentation: <https://cloud.google.com/anthos/multicluster-management/connect/registering-a-cluster>
- GKE Hub API (`gkehub/v1alpha`), 77 methods. Documentation: <https://cloud.google.com/anthos/multicluster-management/connect/registering-a-cluster>
- GKE Hub API (`gkehub/v1beta`), 73 methods. Documentation: <https://cloud.google.com/anthos/multicluster-management/connect/registering-a-cluster>
- GKE Hub API (`gkehub/v1beta1`), 17 methods. Documentation: <https://cloud.google.com/anthos/multicluster-management/connect/registering-a-cluster>
- GKE Hub API (`gkehub/v2alpha`), 10 methods. Documentation: <https://cloud.google.com/anthos/multicluster-management/connect/registering-a-cluster>
- GKE Hub API (`gkehub/v2beta`), 10 methods. Documentation: <https://cloud.google.com/anthos/multicluster-management/connect/registering-a-cluster>
- Cloud Healthcare API (`healthcare/v1beta1`), 170 methods. Documentation: <https://cloud.google.com/healthcare>
- Identity and Access Management (IAM) API (`iam/v1`), 137 methods. Documentation: <https://cloud.google.com/iam/>
- Identity and Access Management (IAM) API (`iam/v2beta`), 6 methods. Documentation: <https://cloud.google.com/iam/>
- Cloud Identity-Aware Proxy API (`iap/v1beta1`), 3 methods. Documentation: <https://cloud.google.com/iap>
- Application Integration API (`integrations/v1`), 129 methods. Documentation: <https://cloud.google.com/application-integration>
- Managed Service for Microsoft Active Directory API (`managedidentities/v1alpha1`), 45 methods. Documentation: <https://cloud.google.com/managed-microsoft-ad/>
- Managed Service for Microsoft Active Directory API (`managedidentities/v1beta1`), 45 methods. Documentation: <https://cloud.google.com/managed-microsoft-ad/>
- Cloud Memorystore for Memcached API (`memcache/v1beta2`), 16 methods. Documentation: <https://cloud.google.com/memorystore/>
- Dataproc Metastore API (`metastore/v1alpha`), 52 methods. Documentation: <https://cloud.google.com/dataproc-metastore/docs>
- Dataproc Metastore API (`metastore/v1beta`), 52 methods. Documentation: <https://cloud.google.com/dataproc-metastore/docs>
- Migration Center API (`migrationcenter/v1alpha1`), 72 methods. Documentation: <https://cloud.google.com/migration-center>
- Cloud Monitoring API (`monitoring/v1`), 17 methods. Documentation: <https://cloud.google.com/monitoring/api/>
- NetApp API (`netapp/v1beta1`), 82 methods. Documentation: <https://cloud.google.com/netapp/>
- Network Connectivity API (`networkconnectivity/v1alpha1`), 30 methods. Documentation: <https://cloud.google.com/network-connectivity/docs/reference/networkconnectivity/rest>
- Network Management API (`networkmanagement/v1beta1`), 33 methods. Documentation: <https://cloud.google.com/>
- Network Security API (`networksecurity/v1beta1`), 190 methods. Documentation: <https://cloud.google.com/networking>
- Network Services API (`networkservices/v1beta1`), 118 methods. Documentation: <https://cloud.google.com/networking>
- On-Demand Scanning API (`ondemandscanning/v1beta1`), 7 methods. Documentation: <https://cloud.google.com/container-analysis/docs/on-demand-scanning/>
- OS Config API (`osconfig/v1`), 28 methods. Documentation: <https://cloud.google.com/compute/docs/osconfig/rest>
- OS Config API (`osconfig/v1alpha`), 16 methods. Documentation: <https://cloud.google.com/compute/docs/osconfig/rest>
- OS Config API (`osconfig/v1beta`), 18 methods. Documentation: <https://cloud.google.com/compute/docs/osconfig/rest>
- OS Config API (`osconfig/v2beta`), 27 methods. Documentation: <https://cloud.google.com/compute/docs/osconfig/rest>
- Cloud OS Login API (`oslogin/v1alpha`), 11 methods. Documentation: <https://cloud.google.com/compute/docs/oslogin/>
- Cloud OS Login API (`oslogin/v1beta`), 11 methods. Documentation: <https://cloud.google.com/compute/docs/oslogin/>
- Parallelstore API (`parallelstore/v1beta`), 13 methods. Documentation: <https://cloud.google.com/parallelstore>
- Policy Analyzer API (`policyanalyzer/v1beta1`), 3 methods. Documentation: <https://cloud.google.com/policy-intelligence/docs/overview>
- Policy Simulator API (`policysimulator/v1alpha`), 14 methods. Documentation: <https://cloud.google.com/iam/docs/simulating-access>
- Policy Simulator API (`policysimulator/v1beta`), 31 methods. Documentation: <https://cloud.google.com/iam/docs/simulating-access>
- Policy Troubleshooter API (`policytroubleshooter/v1`), 1 methods. Documentation: <https://cloud.google.com/iam/>
- Policy Troubleshooter API (`policytroubleshooter/v1beta`), 1 methods. Documentation: <https://cloud.google.com/iam/>
- Policy Troubleshooter API (`policytroubleshooter/v3beta`), 2 methods. Documentation: <https://cloud.google.com/iam/>
- Certificate Authority API (`privateca/v1beta1`), 15 methods. Documentation: <https://cloud.google.com/>
- Public Certificate Authority API (`publicca/v1alpha1`), 1 methods. Documentation: <https://cloud.google.com/public-certificate-authority/docs>
- Public Certificate Authority API (`publicca/v1beta1`), 1 methods. Documentation: <https://cloud.google.com/public-certificate-authority/docs>
- Cloud Pub/Sub API (`pubsub/v1beta1a`), 15 methods. Documentation: <https://cloud.google.com/pubsub/docs>
- Cloud Pub/Sub API (`pubsub/v1beta2`), 20 methods. Documentation: <https://cloud.google.com/pubsub/docs>
- Recommender API (`recommender/v1beta1`), 54 methods. Documentation: <https://cloud.google.com/recommender/docs/>
- Google Cloud Memorystore for Redis API (`redis/v1beta1`), 47 methods. Documentation: <https://cloud.google.com/memorystore/docs/redis/>
- Cloud Run Admin API (`run/v1`), 76 methods. Documentation: <https://cloud.google.com/run/>
- Cloud Runtime Configuration API (`runtimeconfig/v1beta1`), 22 methods. Documentation: <https://cloud.google.com/deployment-manager/runtime-configurator/>
- App Lifecycle Manager API (`saasservicemgmt/v1beta1`), 66 methods. Documentation: <https://docs.cloud.google.com/app-lifecycle-manager>
- Secret Manager API (`secretmanager/v1beta1`), 17 methods. Documentation: <https://cloud.google.com/secret-manager/>
- Secret Manager API (`secretmanager/v1beta2`), 32 methods. Documentation: <https://cloud.google.com/secret-manager/>
- Security Command Center API (`securitycenter/v1beta1`), 23 methods. Documentation: <https://cloud.google.com/security-command-center>
- Security Command Center API (`securitycenter/v1beta2`), 61 methods. Documentation: <https://cloud.google.com/security-command-center>
- Service Consumer Management API (`serviceconsumermanagement/v1beta1`), 14 methods. Documentation: <https://cloud.google.com/service-consumer-management/docs/overview>
- Service Control API (`servicecontrol/v1`), 3 methods. Documentation: <https://cloud.google.com/service-control/>
- Service Directory API (`servicedirectory/v1beta1`), 27 methods. Documentation: <https://cloud.google.com/service-directory>
- Service Networking API (`servicenetworking/v1beta`), 6 methods. Documentation: <https://cloud.google.com/service-infrastructure/docs/service-networking/getting-started>
- Service Usage API (`serviceusage/v1beta1`), 21 methods. Documentation: <https://cloud.google.com/service-usage/>
- Cloud SQL Admin API (`sqladmin/v1beta4`), 85 methods. Documentation: <https://cloud.google.com/sql/docs>
- Security Token Service API (`sts/v1beta`), 1 methods. Documentation: <http://cloud.google.com/iam/docs/workload-identity-federation>
- Cloud TPU API (`tpu/v1`), 17 methods. Documentation: <https://cloud.google.com/tpu/>
- Cloud TPU API (`tpu/v1alpha1`), 17 methods. Documentation: <https://cloud.google.com/tpu/>
- Cloud TPU API (`tpu/v2alpha1`), 29 methods. Documentation: <https://cloud.google.com/tpu/>
- Traffic Director API (`trafficdirector/v2`), 1 methods. Documentation: <https://cloud.google.com/traffic-director>
- VM Migration API (`vmmigration/v1alpha1`), 68 methods. Documentation: <https://cloud.google.com/migrate/virtual-machines>
- Serverless VPC Access API (`vpcaccess/v1beta1`), 8 methods. Documentation: <https://cloud.google.com/vpc/docs/configure-serverless-vpc-access>
- Web Security Scanner API (`websecurityscanner/v1alpha`), 13 methods. Documentation: <https://cloud.google.com/security-command-center/docs/concepts-web-security-scanner-overview/>
- Web Security Scanner API (`websecurityscanner/v1beta`), 13 methods. Documentation: <https://cloud.google.com/security-command-center/docs/concepts-web-security-scanner-overview/>
- Workflow Executions API (`workflowexecutions/v1beta`), 4 methods. Documentation: <https://cloud.google.com/workflows>
- Workflows API (`workflows/v1beta`), 10 methods. Documentation: <https://cloud.google.com/workflows>
- Cloud Workstations API (`workstations/v1beta`), 32 methods. Documentation: <https://cloud.google.com/workstations>
- Cloud Resource Manager API (`cloudresourcemanager/v3`), 92 methods. Documentation: <https://cloud.google.com/resource-manager>
- Compute Engine API (`compute/2026-11-01`), 1025 methods. Documentation: <https://cloud.google.com/compute/>
- Compute Engine API (`compute/2026-12-01-preview`), 1032 methods. Documentation: <https://cloud.google.com/compute/>

