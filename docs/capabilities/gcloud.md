# Google Cloud (`gcloud`)

Google Cloud console APIs: projects, service enablement, API keys, billing, monitoring, storage, BigQuery and IAM, plus the rest of the infrastructure, data, devops, networking, security and governance APIs.

- Plugin: `gcloud`, MCP server: `gcloud`, login: Desktop OAuth client, then `login cloud`
- Install: `claude plugin install gcloud@google-services-mcps`
- Tools: 376 total. Curated 22, per-method 350, gateway 3. Read 185, write 139, destructive 51, dynamic 1.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

## Curated tools (22)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `auth_status` | read | Login status | (none) |
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
| `health` | read | Server health | (none) |

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
| `bigquery_routines_set_iam_policy` | write | bigquery.routines.setIamPolicy | bigquery, cloud-platform |
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
| `bigquery_tables_set_iam_policy` | write | bigquery.tables.setIamPolicy | bigquery, cloud-platform |
| `bigquery_tables_test_iam_permissions` | read | bigquery.tables.testIamPermissions | bigquery, cloud-platform |
| `bigquery_tables_update` | write | bigquery.tables.update | bigquery, cloud-platform |
| `billing_billing_ac_sub_account_create` | write | cloudbilling.billingAccounts.subAccounts.create | cloud-billing, cloud-platform |
| `billing_billing_acc_sub_accounts_list` | read | cloudbilling.billingAccounts.subAccounts.list | cloud-billing, cloud-billing.readonly |
| `billing_billing_accoun_get_iam_policy` | read | cloudbilling.billingAccounts.getIamPolicy | cloud-billing, cloud-billing.readonly |
| `billing_billing_accoun_set_iam_policy` | write | cloudbilling.billingAccounts.setIamPolicy | cloud-billing, cloud-platform |
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
| `crm_folders_set_iam_policy` | write | cloudresourcemanager.folders.setIamPolicy | cloud-platform |
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
| `crm_organizations_set_iam_policy` | write | cloudresourcemanager.organizations.setIamPolicy | cloud-platform |
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
| `crm_projects_set_iam_policy` | write | cloudresourcemanager.projects.setIamPolicy | cloud-platform |
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
| `crm_tag_keys_set_iam_policy` | write | cloudresourcemanager.tagKeys.setIamPolicy | cloud-platform |
| `crm_tag_keys_test_iam_permissions` | read | cloudresourcemanager.tagKeys.testIamPermissions | cloud-platform |
| `crm_tag_values_create` | write | cloudresourcemanager.tagValues.create | cloud-platform |
| `crm_tag_values_delete` | destructive | cloudresourcemanager.tagValues.delete | cloud-platform |
| `crm_tag_values_get` | read | cloudresourcemanager.tagValues.get | cloud-platform, cloud-platform.read-only |
| `crm_tag_values_get_iam_policy` | read | cloudresourcemanager.tagValues.getIamPolicy | cloud-platform, cloud-platform.read-only |
| `crm_tag_values_get_namespaced` | read | cloudresourcemanager.tagValues.getNamespaced | cloud-platform, cloud-platform.read-only |
| `crm_tag_values_list` | read | cloudresourcemanager.tagValues.list | cloud-platform, cloud-platform.read-only |
| `crm_tag_values_patch` | write | cloudresourcemanager.tagValues.patch | cloud-platform |
| `crm_tag_values_set_iam_policy` | write | cloudresourcemanager.tagValues.setIamPolicy | cloud-platform |
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
| `monitor_projects_time_series_query` | write | monitoring.projects.timeSeries.query | cloud-platform, monitoring |
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
| `storage_buckets_set_iam_policy` | write | storage.buckets.setIamPolicy | cloud-platform, devstorage.full_control |
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
| `storage_managed_folder_set_iam_policy` | write | storage.managedFolders.setIamPolicy | cloud-platform, devstorage.full_control |
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
| `storage_objects_set_iam_policy` | write | storage.objects.setIamPolicy | cloud-platform, devstorage.full_control |
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

- Service Usage API (`serviceusage/v1`), 10 methods in the catalog
- Cloud Resource Manager API (`cloudresourcemanager/v3`), 78 methods in the catalog
- API Keys API (`apikeys/v2`), 9 methods in the catalog
- Cloud Billing API (`cloudbilling/v1`), 28 methods in the catalog
- Cloud Monitoring API (`monitoring/v3`), 56 methods in the catalog
- Cloud Storage API (`storage/v1`), 87 methods in the catalog
- BigQuery API (`bigquery/v2`), 47 methods in the catalog
- Identity and Access Management (IAM) API (`iam/v2`), 6 methods in the catalog
- Cloud Asset API (`cloudasset/v1`), 24 methods in the catalog
- Cloud Trace API (`cloudtrace/v2`), 2 methods in the catalog
- Cloud Profiler API (`cloudprofiler/v2`), 4 methods in the catalog
- Policy Troubleshooter API (`policytroubleshooter/v3`), 1 methods in the catalog

## Gateway APIs (reached through api_search, api_describe, api_call)

- Cloud Logging API (`logging/v2`), 254 methods
- Compute Engine API (`compute/v1`), 1018 methods
- Cloud Run Admin API (`run/v2`), 59 methods
- Kubernetes Engine API (`container/v1`), 71 methods
- Cloud Key Management Service (KMS) API (`cloudkms/v1`), 87 methods
- Sensitive Data Protection (DLP) (`dlp/v2`), 150 methods
- Security Command Center API (`securitycenter/v1`), 172 methods
- Organization Policy API (`orgpolicy/v2`), 26 methods
- Access Context Manager API (`accesscontextmanager/v1`), 42 methods
- Secret Manager API (`secretmanager/v1`), 36 methods
- Cloud Pub/Sub API (`pubsub/v1`), 46 methods
- Cloud Spanner API (`spanner/v1`), 99 methods
- Cloud SQL Admin API (`sqladmin/v1`), 85 methods
- Cloud Firestore API (`firestore/v1`), 60 methods
- Cloud Functions API (`cloudfunctions/v2`), 21 methods
- Cloud Scheduler API (`cloudscheduler/v1`), 16 methods
- Cloud Tasks API (`cloudtasks/v2`), 24 methods
- Cloud DNS API (`dns/v1`), 51 methods
- Cloud Build API (`cloudbuild/v2`), 22 methods
- Artifact Registry API (`artifactregistry/v1`), 69 methods
- Error Reporting API (`clouderrorreporting/v1beta1`), 11 methods
- Cloud Shell API (`cloudshell/v1`), 10 methods
- Essential Contacts API (`essentialcontacts/v1`), 21 methods
- Public Certificate Authority API (`publicca/v1`), 1 methods
- Traffic Director API (`trafficdirector/v3`), 1 methods
- API Discovery Service (`discovery/v1`), 2 methods
- Service Control API (`servicecontrol/v2`), 2 methods
- Policy Analyzer API (`policyanalyzer/v1`), 3 methods
- Cloud Runtime Configuration API (`runtimeconfig/v1`), 3 methods
- KMS Inventory API (`kmsinventory/v1`), 4 methods
- Cloud Billing Budget API (`billingbudgets/v1`), 5 methods
- Cloud Location Finder API (`cloudlocationfinder/v1`), 5 methods
- Security Token Service API (`sts/v1`), 5 methods
- IAM Service Account Credentials API (`iamcredentials/v1`), 7 methods
- On-Demand Scanning API (`ondemandscanning/v1`), 7 methods
- Advisory Notifications API (`advisorynotifications/v1`), 8 methods
- BigQuery Connection API (`bigqueryconnection/v1`), 8 methods
- Database Center API (`databasecenter/v1beta`), 8 methods
- Data pipelines API (`datapipelines/v1`), 8 methods
- Transcoder API (`transcoder/v1`), 8 methods
- Serverless VPC Access API (`vpcaccess/v1`), 8 methods
- Cloud Product Registry API (`cloudproductregistry/v1`), 9 methods
- Cloud OS Login API (`oslogin/v1`), 9 methods
- BigQuery Data Policy API (`bigquerydatapolicy/v2`), 10 methods
- GKE Hub API (`gkehub/v2`), 10 methods
- Application Integration API (`integrations/v2`), 10 methods
- Workflow Executions API (`workflowexecutions/v1`), 10 methods
- Blockchain Node Engine API (`blockchainnodeengine/v1`), 11 methods
- Cluster Director API (`hypercomputecluster/v1`), 11 methods
- Cloud IDS API (`ids/v1`), 11 methods
- Workflows API (`workflows/v1`), 11 methods
- Cloud Commerce Partner Procurement API (`cloudcommerceprocurement/v1`), 13 methods
- Cloud Controls Partner API (`cloudcontrolspartner/v1`), 13 methods
- Parallelstore API (`parallelstore/v1`), 13 methods
- Storage Batch Operations API (`storagebatchoperations/v1`), 13 methods
- Web Security Scanner API (`websecurityscanner/v1`), 13 methods
- Batch API (`batch/v1`), 14 methods
- Service Consumer Management API (`serviceconsumermanagement/v1`), 14 methods
- Rapid Migration Assessment API (`rapidmigrationassessment/v1`), 16 methods
- Cloud Memorystore for Memcached API (`memcache/v1`), 17 methods
- Storage Transfer API (`storagetransfer/v1`), 17 methods
- Cloud Datastore API (`datastore/v1`), 18 methods
- Cloud Deployment Manager V2 API (`deploymentmanager/v2`), 18 methods
- Cloud FTP API (`ftp/v1`), 18 methods
- Cloud Data Fusion API (`datafusion/v1`), 19 methods
- Cloud Identity-Aware Proxy API (`iap/v1`), 19 methods
- Looker (Google Cloud core) API (`looker/v1`), 20 methods
- Binary Authorization API (`binaryauthorization/v1`), 21 methods
- Google Cloud Support API (`cloudsupport/v2`), 22 methods
- Service Management API (`servicemanagement/v1`), 22 methods
- Threat Intelligence API (`threatintelligence/v1beta`), 22 methods
- API Management API (`apim/v1alpha`), 23 methods
- Security Posture API (`securityposture/v1`), 23 methods
- Parameter Manager API (`parametermanager/v1`), 24 methods
- reCAPTCHA Enterprise API (`recaptchaenterprise/v1`), 24 methods
- Service Directory API (`servicedirectory/v1`), 24 methods
- Cloud TPU API (`tpu/v2`), 24 methods
- Connectors API (`connectors/v2`), 26 methods
- Cloud Filestore API (`file/v1`), 26 methods
- Access Approval API (`accessapproval/v1`), 27 methods
- Lakehouse API (`biglake/v1`), 27 methods
- OS Config API (`osconfig/v2`), 27 methods
- Policy Simulator API (`policysimulator/v1`), 27 methods
- Data Lineage API (`datalineage/v1`), 28 methods
- Cloud Domains API (`domains/v1`), 28 methods
- Pub/Sub Lite API (`pubsublite/v1`), 28 methods
- Cloud Composer API (`composer/v1`), 29 methods
- Service Networking API (`servicenetworking/v1`), 29 methods
- API Gateway API (`apigateway/v1`), 30 methods
- Workload Manager API (`workloadmanager/v1`), 31 methods
- Assured Workloads API (`assuredworkloads/v1`), 32 methods
- Datastream API (`datastream/v1`), 32 methods
- BigQuery Reservation API (`bigqueryreservation/v1`), 33 methods
- Cloud Workstations API (`workstations/v1`), 33 methods
- Analytics Hub API (`analyticshub/v1`), 35 methods
- Certificate Manager API (`certificatemanager/v1`), 36 methods
- BigQuery Data Transfer API (`bigquerydatatransfer/v1`), 37 methods
- AlloyDB API (`alloydb/v1`), 40 methods
- App Hub API (`apphub/v1`), 40 methods
- App Lifecycle Manager API (`saasservicemgmt/v1`), 42 methods
- Cloud Number Registry API (`cloudnumberregistry/v1alpha`), 44 methods
- Container Analysis API (`containeranalysis/v1`), 44 methods
- Observability API (`observability/v1`), 44 methods
- Certificate Authority API (`privateca/v1`), 44 methods
- Developer Connect API (`developerconnect/v1`), 45 methods
- Managed Service for Microsoft Active Directory API (`managedidentities/v1`), 45 methods
- Infrastructure Manager API (`config/v1`), 47 methods
- Google Cloud Memorystore for Redis API (`redis/v1`), 47 methods
- Dataproc Metastore API (`metastore/v1`), 48 methods
- Network Management API (`networkmanagement/v1`), 48 methods
- Recommender API (`recommender/v1`), 48 methods
- Audit Manager API (`auditmanager/v1`), 51 methods
- Bare Metal Solution API (`baremetalsolution/v2`), 52 methods
- BeyondCorp API (`beyondcorp/v1`), 52 methods
- Dataflow API (`dataflow/v1b3`), 57 methods
- App Engine Admin API (`appengine/v1`), 59 methods
- Backup and DR Service API (`backupdr/v1`), 61 methods
- Cloud Deploy API (`clouddeploy/v1`), 61 methods
- Secure Source Manager API (`securesourcemanager/v1`), 62 methods
- Cloud Channel API (`cloudchannel/v1`), 65 methods
- Eventarc API (`eventarc/v1`), 66 methods
- Backup for GKE API (`gkebackup/v1`), 67 methods
- Migration Center API (`migrationcenter/v1`), 67 methods
- VM Migration API (`vmmigration/v1`), 68 methods
- Database Migration API (`datamigration/v1`), 70 methods
- Google Cloud Data Catalog API (`datacatalog/v1`), 71 methods
- GKE On-Prem API (`gkeonprem/v1`), 79 methods
- Cloud Bigtable Admin API (`bigtableadmin/v2`), 82 methods
- NetApp API (`netapp/v1`), 82 methods
- SAS Portal API (`sasportal/v1alpha1`), 82 methods
- Dataform API (`dataform/v1`), 88 methods
- Managed Service for Apache Kafka API (`managedkafka/v1`), 89 methods
- Oracle Database@Google Cloud API (`oracledatabase/v1`), 95 methods
- API hub API (`apihub/v1`), 97 methods
- VMware Engine API (`vmwareengine/v1`), 102 methods
- Network Connectivity API (`networkconnectivity/v1`), 108 methods
- Network Services API (`networkservices/v1`), 122 methods
- Cloud Dataproc API (`dataproc/v1`), 136 methods
- Cloud Healthcare API (`healthcare/v1`), 154 methods
- Network Security API (`networksecurity/v1`), 185 methods
- Cloud Dataplex API (`dataplex/v1`), 206 methods
- Apigee API (`apigee/v1`), 374 methods
- AlloyDB API (`alloydb/v1alpha`), 45 methods
- AlloyDB API (`alloydb/v1beta`), 45 methods
- Analytics Hub API (`analyticshub/v1beta1`), 18 methods
- API Gateway API (`apigateway/v1beta`), 30 methods
- App Engine Admin API (`appengine/v1alpha`), 30 methods
- App Engine Admin API (`appengine/v1beta`), 63 methods
- App Hub API (`apphub/v1alpha`), 42 methods
- Artifact Registry API (`artifactregistry/v1beta1`), 24 methods
- Artifact Registry API (`artifactregistry/v1beta2`), 32 methods
- Assured Workloads API (`assuredworkloads/v1beta1`), 31 methods
- Backup and DR Service API (`backupdr/v1beta`), 73 methods
- BeyondCorp API (`beyondcorp/v1alpha`), 87 methods
- BigQuery Connection API (`bigqueryconnection/v1beta1`), 9 methods
- BigQuery Data Policy API (`bigquerydatapolicy/v1`), 9 methods
- Cloud Billing Budget API (`billingbudgets/v1beta1`), 5 methods
- Binary Authorization API (`binaryauthorization/v1beta1`), 15 methods
- Cloud Asset API (`cloudasset/v1beta1`), 8 methods
- Cloud Asset API (`cloudasset/v1p1beta1`), 2 methods
- Cloud Asset API (`cloudasset/v1p5beta1`), 1 methods
- Cloud Asset API (`cloudasset/v1p7beta1`), 2 methods
- Cloud Billing API (`cloudbilling/v1beta`), 17 methods
- Cloud Build API (`cloudbuild/v1`), 57 methods
- Cloud Controls Partner API (`cloudcontrolspartner/v1beta`), 13 methods
- Cloud Functions API (`cloudfunctions/v1`), 14 methods
- Cloud Functions API (`cloudfunctions/v2alpha`), 21 methods
- Cloud Functions API (`cloudfunctions/v2beta`), 21 methods
- Cloud Location Finder API (`cloudlocationfinder/v1alpha`), 5 methods
- Cloud Quotas API (`cloudquotas/v1`), 28 methods
- Cloud Quotas API (`cloudquotas/v1beta`), 28 methods
- Cloud Resource Manager API (`cloudresourcemanager/v1`), 38 methods
- Cloud Resource Manager API (`cloudresourcemanager/v1beta1`), 16 methods
- Cloud Resource Manager API (`cloudresourcemanager/v2`), 12 methods
- Cloud Resource Manager API (`cloudresourcemanager/v2beta1`), 12 methods
- Cloud Scheduler API (`cloudscheduler/v1beta1`), 14 methods
- Google Cloud Support API (`cloudsupport/v2beta`), 23 methods
- Cloud Tasks API (`cloudtasks/v2beta2`), 29 methods
- Cloud Tasks API (`cloudtasks/v2beta3`), 24 methods
- Cloud Trace API (`cloudtrace/v1`), 3 methods
- Cloud Trace API (`cloudtrace/v2beta1`), 5 methods
- Cloud Composer API (`composer/v1beta1`), 31 methods
- Compute Engine API (`compute/2026-09-01`), 1019 methods
- Compute Engine API (`compute/2026-10-01-preview`), 1037 methods
- Compute Engine API (`compute/alpha`), 1212 methods
- Compute Engine API (`compute/beta`), 1130 methods
- Compute Engine API (`compute/preview`), 1037 methods
- Compute Engine API (`compute/stable`), 1019 methods
- Connectors API (`connectors/v1`), 80 methods
- Kubernetes Engine API (`container/v1beta1`), 72 methods
- Container Analysis API (`containeranalysis/v1alpha1`), 33 methods
- Container Analysis API (`containeranalysis/v1beta1`), 46 methods
- Google Cloud Data Catalog API (`datacatalog/v1beta1`), 55 methods
- Dataform API (`dataform/v1beta1`), 95 methods
- Cloud Data Fusion API (`datafusion/v1beta1`), 25 methods
- Database Migration API (`datamigration/v1beta1`), 29 methods
- Cloud Datastore API (`datastore/v1beta1`), 2 methods
- Cloud Datastore API (`datastore/v1beta3`), 8 methods
- Datastream API (`datastream/v1alpha1`), 31 methods
- Cloud Deployment Manager V2 API (`deploymentmanager/alpha`), 33 methods
- Cloud Deployment Manager V2 API (`deploymentmanager/v2beta`), 32 methods
- Cloud DNS API (`dns/v1beta2`), 51 methods
- Cloud Domains API (`domains/v1alpha2`), 28 methods
- Cloud Domains API (`domains/v1beta1`), 28 methods
- Cloud Filestore API (`file/v1beta1`), 47 methods
- Cloud Firestore API (`firestore/v1beta1`), 24 methods
- Cloud Firestore API (`firestore/v1beta2`), 9 methods
- Cloud FTP API (`ftp/v1alpha`), 18 methods
- GKE Hub API (`gkehub/v1`), 73 methods
- GKE Hub API (`gkehub/v1alpha`), 77 methods
- GKE Hub API (`gkehub/v1beta`), 73 methods
- GKE Hub API (`gkehub/v1beta1`), 17 methods
- GKE Hub API (`gkehub/v2alpha`), 10 methods
- GKE Hub API (`gkehub/v2beta`), 10 methods
- Cloud Healthcare API (`healthcare/v1beta1`), 170 methods
- Identity and Access Management (IAM) API (`iam/v1`), 137 methods
- Identity and Access Management (IAM) API (`iam/v2beta`), 6 methods
- Cloud Identity-Aware Proxy API (`iap/v1beta1`), 3 methods
- Application Integration API (`integrations/v1`), 129 methods
- Managed Service for Microsoft Active Directory API (`managedidentities/v1alpha1`), 45 methods
- Managed Service for Microsoft Active Directory API (`managedidentities/v1beta1`), 45 methods
- Cloud Memorystore for Memcached API (`memcache/v1beta2`), 16 methods
- Dataproc Metastore API (`metastore/v1alpha`), 52 methods
- Dataproc Metastore API (`metastore/v1beta`), 52 methods
- Migration Center API (`migrationcenter/v1alpha1`), 72 methods
- Cloud Monitoring API (`monitoring/v1`), 17 methods
- NetApp API (`netapp/v1beta1`), 82 methods
- Network Connectivity API (`networkconnectivity/v1alpha1`), 30 methods
- Network Management API (`networkmanagement/v1beta1`), 33 methods
- Network Security API (`networksecurity/v1beta1`), 190 methods
- Network Services API (`networkservices/v1beta1`), 113 methods
- On-Demand Scanning API (`ondemandscanning/v1beta1`), 7 methods
- OS Config API (`osconfig/v1`), 28 methods
- OS Config API (`osconfig/v1alpha`), 16 methods
- OS Config API (`osconfig/v1beta`), 18 methods
- OS Config API (`osconfig/v2beta`), 27 methods
- Cloud OS Login API (`oslogin/v1alpha`), 11 methods
- Cloud OS Login API (`oslogin/v1beta`), 11 methods
- Parallelstore API (`parallelstore/v1beta`), 13 methods
- Policy Analyzer API (`policyanalyzer/v1beta1`), 3 methods
- Policy Simulator API (`policysimulator/v1alpha`), 14 methods
- Policy Simulator API (`policysimulator/v1beta`), 31 methods
- Policy Troubleshooter API (`policytroubleshooter/v1`), 1 methods
- Policy Troubleshooter API (`policytroubleshooter/v1beta`), 1 methods
- Policy Troubleshooter API (`policytroubleshooter/v3beta`), 2 methods
- Certificate Authority API (`privateca/v1beta1`), 15 methods
- Public Certificate Authority API (`publicca/v1alpha1`), 1 methods
- Public Certificate Authority API (`publicca/v1beta1`), 1 methods
- Cloud Pub/Sub API (`pubsub/v1beta1a`), 15 methods
- Cloud Pub/Sub API (`pubsub/v1beta2`), 20 methods
- Recommender API (`recommender/v1beta1`), 54 methods
- Google Cloud Memorystore for Redis API (`redis/v1beta1`), 47 methods
- Cloud Run Admin API (`run/v1`), 76 methods
- Cloud Runtime Configuration API (`runtimeconfig/v1beta1`), 22 methods
- App Lifecycle Manager API (`saasservicemgmt/v1beta1`), 77 methods
- Secret Manager API (`secretmanager/v1beta1`), 17 methods
- Secret Manager API (`secretmanager/v1beta2`), 32 methods
- Security Command Center API (`securitycenter/v1beta1`), 23 methods
- Security Command Center API (`securitycenter/v1beta2`), 61 methods
- Service Consumer Management API (`serviceconsumermanagement/v1beta1`), 14 methods
- Service Control API (`servicecontrol/v1`), 3 methods
- Service Directory API (`servicedirectory/v1beta1`), 27 methods
- Service Networking API (`servicenetworking/v1beta`), 6 methods
- Service Usage API (`serviceusage/v1beta1`), 21 methods
- Cloud SQL Admin API (`sqladmin/v1beta4`), 85 methods
- Security Token Service API (`sts/v1beta`), 1 methods
- Cloud TPU API (`tpu/v1`), 17 methods
- Cloud TPU API (`tpu/v1alpha1`), 17 methods
- Cloud TPU API (`tpu/v2alpha1`), 29 methods
- Traffic Director API (`trafficdirector/v2`), 1 methods
- VM Migration API (`vmmigration/v1alpha1`), 68 methods
- Serverless VPC Access API (`vpcaccess/v1beta1`), 8 methods
- Web Security Scanner API (`websecurityscanner/v1alpha`), 13 methods
- Web Security Scanner API (`websecurityscanner/v1beta`), 13 methods
- Workflow Executions API (`workflowexecutions/v1beta`), 4 methods
- Workflows API (`workflows/v1beta`), 10 methods
- Cloud Workstations API (`workstations/v1beta`), 32 methods

