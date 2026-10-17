# Contacts and Profile (`gcontacts`)

Google Contacts and People, personal health metrics, Data Portability, and the OAuth2 userinfo endpoints.

- Plugin: `gcontacts`, MCP server: `gcontacts`, login: Desktop OAuth client, then `login workspace-user`
- Install: `claude plugin install gcontacts@google-services-mcps`
- Tools: 68 total. Curated 5, per-method 59, gateway 3. Read 34, write 24, destructive 9, dynamic 1.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

## Curated tools (5)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `auth_login` | write | Sign in to Google | (none) |
| `auth_setup_admin` | write | Set up the workspace admin account | (none) |
| `auth_setup_client` | write | Save the Google OAuth client | (none) |
| `auth_status` | read | Sign-in status | (none) |
| `health` | read | Server health | (none) |

## Per-method tools (59)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `dataportab_access_type_check` | read | dataportability.accessType.check | dataportability.alerts.subscriptions, dataportability.chrome.autofill |
| `dataportab_archive_j_get_portab` | read | dataportability.archiveJobs.getPortabilityArchiveState | dataportability.alerts.subscriptions, dataportability.chrome.autofill |
| `dataportab_archive_jobs_cancel` | destructive | dataportability.archiveJobs.cancel | dataportability.alerts.subscriptions, dataportability.chrome.autofill |
| `dataportab_archive_jobs_retry` | write | dataportability.archiveJobs.retry | dataportability.alerts.subscriptions, dataportability.chrome.autofill |
| `dataportab_authorization_reset` | destructive | dataportability.authorization.reset | dataportability.alerts.subscriptions, dataportability.chrome.autofill |
| `dataportab_portability_initiate` | write | dataportability.portabilityArchive.initiate | dataportability.alerts.subscriptions, dataportability.chrome.autofill |
| `health_proje_subsc_subsc_create` | write | health.projects.subscribers.subscriptions.create | cloud-platform |
| `health_proje_subsc_subsc_delete` | destructive | health.projects.subscribers.subscriptions.delete | cloud-platform |
| `health_proje_subsc_subscr_patch` | write | health.projects.subscribers.subscriptions.patch | cloud-platform |
| `health_proje_subscr_subscr_list` | read | health.projects.subscribers.subscriptions.list | cloud-platform |
| `health_projects_subscrib_create` | write | health.projects.subscribers.create | cloud-platform |
| `health_projects_subscrib_delete` | destructive | health.projects.subscribers.delete | cloud-platform |
| `health_projects_subscribe_patch` | write | health.projects.subscribers.patch | cloud-platform |
| `health_projects_subscriber_list` | read | health.projects.subscribers.list | cloud-platform |
| `health_shl_m_get_shl_manifest` | read | health.shl.m.getShlManifest | (none) |
| `health_shl_r_get` | read | health.shl.r.get | (none) |
| `health_users_data_data_p_batch` | destructive | health.users.dataTypes.dataPoints.batchDelete | googlehealth.activity_and_fitness.writeonly, googlehealth.health_metrics_and_measurements.writeonly |
| `health_users_data_data_p_create` | write | health.users.dataTypes.dataPoints.create | googlehealth.activity_and_fitness.writeonly, googlehealth.health_metrics_and_measurements.writeonly |
| `health_users_data_data_p_daily` | write | health.users.dataTypes.dataPoints.dailyRollUp | googlehealth.activity_and_fitness.readonly, googlehealth.activity_and_fitness.writeonly |
| `health_users_data_data_p_export` | read | health.users.dataTypes.dataPoints.exportExerciseTcx | googlehealth.activity_and_fitness.readonly, googlehealth.location.readonly |
| `health_users_data_data_p_patch` | write | health.users.dataTypes.dataPoints.patch | googlehealth.activity_and_fitness.writeonly, googlehealth.health_metrics_and_measurements.writeonly |
| `health_users_data_data_p_reconc` | read | health.users.dataTypes.dataPoints.reconcile | googlehealth.activity_and_fitness.readonly, googlehealth.activity_and_fitness.writeonly |
| `health_users_data_data_p_roll_u` | write | health.users.dataTypes.dataPoints.rollUp | googlehealth.activity_and_fitness.readonly, googlehealth.activity_and_fitness.writeonly |
| `health_users_data_t_data_p_list` | read | health.users.dataTypes.dataPoints.list | googlehealth.activity_and_fitness.readonly, googlehealth.activity_and_fitness.writeonly |
| `health_users_data_t_data_po_get` | read | health.users.dataTypes.dataPoints.get | googlehealth.activity_and_fitness.readonly, googlehealth.activity_and_fitness.writeonly |
| `health_users_get_identity` | read | health.users.getIdentity | googlehealth.activity_and_fitness.readonly, googlehealth.ecg.readonly |
| `health_users_get_irn_profile` | read | health.users.getIrnProfile | googlehealth.irn.readonly |
| `health_users_get_profile` | read | health.users.getProfile | googlehealth.profile.readonly |
| `health_users_get_settings` | read | health.users.getSettings | googlehealth.settings.readonly |
| `health_users_paired_device_list` | read | health.users.pairedDevices.list | googlehealth.settings.readonly |
| `health_users_paired_devices_get` | read | health.users.pairedDevices.get | googlehealth.settings.readonly |
| `health_users_update_profile` | write | health.users.updateProfile | googlehealth.profile.writeonly |
| `health_users_update_settings` | write | health.users.updateSettings | googlehealth.settings.writeonly |
| `oauth2_userinfo_get` | read | oauth2.userinfo.get | openid, userinfo.email |
| `oauth2_userinfo_v2_me_get` | read | oauth2.userinfo.v2.me.get | openid, userinfo.email |
| `people_contact_g_members_modify` | write | people.contactGroups.members.modify | contacts |
| `people_contact_groups_batch_get` | read | people.contactGroups.batchGet | contacts, contacts.readonly |
| `people_contact_groups_create` | write | people.contactGroups.create | contacts |
| `people_contact_groups_delete` | destructive | people.contactGroups.delete | contacts |
| `people_contact_groups_get` | read | people.contactGroups.get | contacts, contacts.readonly |
| `people_contact_groups_list` | read | people.contactGroups.list | contacts, contacts.readonly |
| `people_contact_groups_update` | write | people.contactGroups.update | contacts |
| `people_other_conta_copy_other_c` | write | people.otherContacts.copyOtherContactToMyContactsGroup | contacts, contacts.other.readonly |
| `people_other_contacts_list` | read | people.otherContacts.list | contacts.other.readonly |
| `people_other_contacts_search` | read | people.otherContacts.search | contacts.other.readonly |
| `people_people_batch_create_cont` | write | people.people.batchCreateContacts | contacts |
| `people_people_batch_delete_cont` | destructive | people.people.batchDeleteContacts | contacts |
| `people_people_batch_update_cont` | write | people.people.batchUpdateContacts | contacts |
| `people_people_connections_list` | read | people.people.connections.list | contacts, contacts.readonly |
| `people_people_create_contact` | write | people.people.createContact | contacts |
| `people_people_delete_contact` | destructive | people.people.deleteContact | contacts |
| `people_people_delete_contact_ph` | destructive | people.people.deleteContactPhoto | contacts |
| `people_people_get` | read | people.people.get | contacts, contacts.other.readonly |
| `people_people_get_batch_get` | read | people.people.getBatchGet | contacts, contacts.other.readonly |
| `people_people_list_directory_pe` | read | people.people.listDirectoryPeople | directory.readonly |
| `people_people_search_contacts` | read | people.people.searchContacts | contacts, contacts.readonly |
| `people_people_search_directory` | read | people.people.searchDirectoryPeople | directory.readonly |
| `people_people_update_contact` | write | people.people.updateContact | contacts |
| `people_people_update_contact_ph` | write | people.people.updateContactPhoto | contacts |

## Gateway tools (3)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_call` | dynamic | Call an API method | (none) |
| `api_describe` | read | Describe an API method | (none) |
| `api_search` | read | Search API methods | (none) |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gcontacts: API methods | (none) |

## Generated APIs

- People API (`people/v1`), 24 methods in the catalog
- Google Health API (`health/v4`), 27 methods in the catalog
- Data Portability API (`dataportability/v1`), 6 methods in the catalog
- Google OAuth2 API (`oauth2/v2`), 3 methods in the catalog

## Gateway APIs (reached through api_search, api_describe, api_call)

- Data Portability API (`dataportability/v1beta`), 6 methods
- Google Health API (`health/v4beta`), 27 methods

