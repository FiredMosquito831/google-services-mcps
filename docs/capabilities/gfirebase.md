# Firebase (`gfirebase`)

Firebase management, App Check, App Distribution, Crashlytics, Hosting, Data Connect, Rules, Test Lab, FCM and Identity Toolkit.

- Plugin: `gfirebase`, MCP server: `gfirebase`, login: Desktop OAuth client, then `login developer`
- Install: `claude plugin install gfirebase@google-services-mcps`
- Tools: 315 total. Curated 13, per-method 298, gateway 3. Read 147, write 123, destructive 44, dynamic 1.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 315, google 45, curated 16 tools, each counting the 7 runtime tools this server registers (`account_remove`, `account_set_default`, `accounts_list`, `auth_login`, `auth_setup_client`, `auth_status`, `health`). "(all)" means the product has no such toolset yet, so it lists every tool.

## Not registered by this server (2)

The tool map (`plugins/<id>/tool-map.json`) also lists these, so the consent hook knows every name, but this server never registers them, and the counts above leave them out.

- Sign-in tools of other sign-in kinds: `auth_setup_admin`, `auth_setup_service_account`.

## Toolset google (38)

The tools that match Google's official MCP server for this product (https://github.com/firebase/firebase-tools/tree/e432e8bb47dc9c2a3960fc610fb40492bf84c1ae/src/mcp).

| Tool | Google's tool | Note |
|---|---|---|
| `firebase_projects_list` | `firebase_list_projects` |  |
| `firebase_projects_get` | `firebase_get_project` |  |
| `firebase_projects_search_apps` | `firebase_list_apps` | Every app of a project (iOS, Android and web) in one list; Google's tool filters by platform. |
| `firebase_get_sdk_config` | `firebase_get_sdk_config` | One tool for the three app platforms, as Google's is; the web configuration is the object Google returns, and an Android or iOS one is the text of google-services.json or GoogleService-Info.plist, decoded from the base64 the API sends. |
| `firebase_projects_add_firebase` | `firebase_create_project` | Adds Firebase to a Google Cloud project that exists already (Firebase Management projects.addFirebase). Google's create_project also makes the Cloud project; this tool does not, so create it in the Cloud console or with the gcloud plugin first. |
| `firebase_web_apps_create` | `firebase_create_app` |  |
| `firebase_android_apps_create` | `firebase_create_app` |  |
| `firebase_ios_apps_create` | `firebase_create_app` |  |
| `firebase_apps_sha_create` | `firebase_create_android_sha` |  |
| `firebaseru_releases_list` | `firebase_get_security_rules` | The rules releases of a project; with firebaser_projects_rulesets_get it gives the rules source, as Google's tool does. Realtime Database rules are not covered (no API here). |
| `firebaser_projects_releases_get` | (none) | One rules release by name. The generated firebaseru_releases_list gives the recent ones, and firebaser_projects_rulesets_get the rules source. Google's server has no release lookup. |
| `firebaser_projects_rulesets_get` | `firebase_get_security_rules` |  |
| `firebaseru_projects_test` | `firebase_validate_security_rules` | Checks a rules source. Google marks it read-only, and since 1.24.2 (D2) the suite counts it as a read too, so it does not ask. |
| `firebaseap_backends_list` | `apphosting_list_backends` |  |
| `firebaseap_backends_get` | `apphosting_fetch_logs` | The backend and its state. Google's tool also reads its build and run logs, which are Cloud Logging: use the gcloud server's logging_entries_list. |
| `firebase_operations_get` | (none) | Polls a long-running operation that a create returned (Firebase Management API); Google's server waits for its own creates, so it has no such tool. A read. |
| `firebasecr_apps_issues_get` | `crashlytics_get_issue` |  |
| `firebasecr_apps_issues_patch` | `crashlytics_update_issue` |  |
| `firebasecr_apps_events_list` | `crashlytics_list_events` |  |
| `firebasec_apps_events_batch_get` | `crashlytics_batch_get_events` |  |
| `firebasecr_apps_reports_get` | `crashlytics_get_report` |  |
| `firebasecr_issues_notes_list` | `crashlytics_list_notes` |  |
| `firebasecr_issues_notes_create` | `crashlytics_create_note` |  |
| `firebasecr_issues_notes_delete` | `crashlytics_delete_note` |  |
| `firebaseda_list` | `dataconnect_list_locations` |  |
| `firebaseda_services_list` | `dataconnect_list_services` |  |
| `firebased_services_schemas_list` | `dataconnect_list_services` | The schemas of a Data Connect service; Google's list_services returns them with the services. |
| `firebaseda_connectors_list` | `dataconnect_list_services` | The connectors of a Data Connect service; Google's list_services returns them with the services. |
| `firebaseda_execute_graphql` | `dataconnect_execute_graphql` | Runs any GraphQL operation, mutations too. A write, so it asks first. |
| `firebaseda_execute_graphql_read` | `dataconnect_execute_graphql_read` | Runs a GraphQL query. Google marks it read-only, and since 1.24.2 (D2) the suite counts it as a read too, so it does not ask. |
| `firebaseda_generate_query` | `dataconnect_generate_query` | Writes a GraphQL query from a prompt. Google marks it read-only, and since 1.24.2 (D2) the suite counts it as a read too, so it does not ask. |
| `firebaseda_generate_schema` | `dataconnect_generate_schema` | Writes a Data Connect schema from a prompt. Google marks it read-only, and since 1.24.2 (D2) the suite counts it as a read too, so it does not ask. |
| `fcm_projects_messages_send` | `messaging_send_message` | Sends a push message to a device or topic. Destructive here (it cannot be taken back), so it asks twice. |
| `firestore_get_document` | `firestore_get_document` | Firestore is a gcloud API in this suite; this curated tool reads one document here. Fields come back as plain JSON. |
| `firestore_list_documents` | `firestore_list_documents` |  |
| `firestore_query_collection` | `firestore_query_collection` | Firestore runQuery: field conditions joined with AND, an order and a limit; values as plain JSON. A read, as Google marks it. |
| `remoteconfig_get_template` | `remoteconfig_get_template` | Remote Config is in no API list here; this curated tool reads the active template or a given version. |
| `auth_get_users` | `auth_get_users` | Identity Toolkit v1 accounts.lookup (by uid, email or phone) or accounts.query (a page). Password hashes and salts are left out. |

## Curated tools (13)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `account_remove` | write | Remove a signed-in account | (none) |
| `account_set_default` | write | Set the default account | (none) |
| `accounts_list` | read | Signed-in accounts | (none) |
| `auth_get_users` | read | Get Firebase Authentication users | cloud-platform |
| `auth_login` | write | Sign in to Google | (none) |
| `auth_setup_client` | write | Save the Google OAuth client | (none) |
| `auth_status` | read | Sign-in status | (none) |
| `firebase_get_sdk_config` | read | Get a Firebase app's SDK configuration | cloud-platform, cloud-platform.read-only |
| `firestore_get_document` | read | Get a Firestore document | cloud-platform, datastore |
| `firestore_list_documents` | read | List Firestore documents | cloud-platform, datastore |
| `firestore_query_collection` | read | Query a Firestore collection | cloud-platform, datastore |
| `health` | read | Server health | (none) |
| `remoteconfig_get_template` | read | Get the Remote Config template | cloud-platform |

## Per-method tools (298)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `devicerun_devices_get` | read | devicerun.projects.locations.devices.get | cloud-platform |
| `devicerun_devices_list` | read | devicerun.projects.locations.devices.list | cloud-platform |
| `devicerun_get` | read | devicerun.projects.locations.get | cloud-platform |
| `devicerun_list` | read | devicerun.projects.locations.list | cloud-platform |
| `devicerun_operations_cancel` | destructive | devicerun.projects.locations.operations.cancel | cloud-platform |
| `devicerun_operations_delete` | destructive | devicerun.projects.locations.operations.delete | cloud-platform |
| `devicerun_operations_get` | read | devicerun.projects.locations.operations.get | cloud-platform |
| `devicerun_operations_list` | read | devicerun.projects.locations.operations.list | cloud-platform |
| `devicerun_sessions_batch_get` | read | devicerun.projects.locations.sessions.batchGet | cloud-platform |
| `devicerun_sessions_cancel` | destructive | devicerun.projects.locations.sessions.cancel | cloud-platform |
| `devicerun_sessions_create` | write | devicerun.projects.locations.sessions.create | cloud-platform |
| `devicerun_sessions_delete` | destructive | devicerun.projects.locations.sessions.delete | cloud-platform |
| `devicerun_sessions_get` | read | devicerun.projects.locations.sessions.get | cloud-platform |
| `devicerun_sessions_list` | read | devicerun.projects.locations.sessions.list | cloud-platform |
| `devicerun_software_vers_list` | read | devicerun.projects.locations.softwareVersions.list | cloud-platform |
| `devicerun_software_versions_get` | read | devicerun.projects.locations.softwareVersions.get | cloud-platform |
| `fcm_projects_messages_send` | destructive | fcm.projects.messages.send | cloud-platform, firebase.messaging |
| `fcm_registrations_subs_create` | write | fcm.projects.registrations.topicSubscriptions.create | cloud-platform, firebase.messaging |
| `fcm_registrations_subs_delete` | destructive | fcm.projects.registrations.topicSubscriptions.delete | cloud-platform, firebase.messaging |
| `fcm_registrations_subs_get` | read | fcm.projects.registrations.topicSubscriptions.get | cloud-platform, firebase.messaging |
| `fcm_registrations_subs_list` | read | fcm.projects.registrations.topicSubscriptions.list | cloud-platform, firebase.messaging |
| `fcm_registrations_subs_patch` | write | fcm.projects.registrations.topicSubscriptions.patch | cloud-platform, firebase.messaging |
| `fcmdata_apps_delivery_data_list` | read | fcmdata.projects.androidApps.deliveryData.list | cloud-platform |
| `fir_app_attest_config_batch_get` | read | firebaseappcheck.projects.apps.appAttestConfig.batchGet | cloud-platform, firebase |
| `fir_connectors_execute_mutation` | write | firebasedataconnect.projects.locations.services.connectors.executeMutation | cloud-platform |
| `fir_exchange_device_check_token` | write | firebaseappcheck.projects.apps.exchangeDeviceCheckToken | cloud-platform, firebase |
| `fir_exchange_recaptcha_v3_token` | write | firebaseappcheck.projects.apps.exchangeRecaptchaV3Token | cloud-platform, firebase |
| `fir_play_integrity_config_patch` | write | firebaseappcheck.projects.apps.playIntegrityConfig.patch | cloud-platform, firebase |
| `fir_rpc_postgrest_call_function` | write | firebasedataconnect.projects.locations.services.postgrest.rpc.postgrestCallFunction | cloud-platform |
| `fire_clients_attest_attestation` | write | firebaseappcheck.oauthClients.exchangeAppAttestAttestation | cloud-platform, firebase |
| `fire_postgrest_postgrest_delete` | destructive | firebasedataconnect.projects.locations.services.postgrest.postgrestDelete | cloud-platform |
| `fire_postgrest_postgrest_insert` | write | firebasedataconnect.projects.locations.services.postgrest.postgrestInsert | cloud-platform |
| `fire_postgrest_postgrest_select` | read | firebasedataconnect.projects.locations.services.postgrest.postgrestSelect | cloud-platform |
| `fire_postgrest_postgrest_update` | write | firebasedataconnect.projects.locations.services.postgrest.postgrestUpdate | cloud-platform |
| `fire_postgrest_postgrest_upsert` | write | firebasedataconnect.projects.locations.services.postgrest.postgrestUpsert | cloud-platform |
| `fireb_device_check_config_patch` | write | firebaseappcheck.projects.apps.deviceCheckConfig.patch | cloud-platform, firebase |
| `fireb_play_integrity_config_get` | read | firebaseappcheck.projects.apps.playIntegrityConfig.get | cloud-platform, firebase |
| `fireb_projects_apps_debug_token` | write | firebaseappcheck.projects.apps.exchangeDebugToken | cloud-platform, firebase |
| `fireb_recaptcha_v3_config_patch` | write | firebaseappcheck.projects.apps.recaptchaV3Config.patch | cloud-platform, firebase |
| `fireba_app_attest_config_patch` | write | firebaseappcheck.projects.apps.appAttestConfig.patch | cloud-platform, firebase |
| `fireba_apps_attest_attestation` | write | firebaseappcheck.projects.apps.exchangeAppAttestAttestation | cloud-platform, firebase |
| `fireba_apps_integrity_challenge` | write | firebaseappcheck.projects.apps.generatePlayIntegrityChallenge | cloud-platform, firebase |
| `fireba_available_projects_list` | read | firebase.availableProjects.list | cloud-platform, cloud-platform.read-only |
| `fireba_clients_attest_assertion` | write | firebaseappcheck.oauthClients.exchangeAppAttestAssertion | cloud-platform, firebase |
| `fireba_clients_attest_challenge` | write | firebaseappcheck.oauthClients.generateAppAttestChallenge | cloud-platform, firebase |
| `fireba_connectors_execute_query` | write | firebasedataconnect.projects.locations.services.connectors.executeQuery | cloud-platform |
| `fireba_device_check_config_get` | read | firebaseappcheck.projects.apps.deviceCheckConfig.get | cloud-platform, firebase |
| `fireba_postgrest_query_function` | read | firebasedataconnect.projects.locations.services.postgrest.rpc.postgrestQueryFunction | cloud-platform |
| `fireba_recaptcha_v3_config_get` | read | firebaseappcheck.projects.apps.recaptchaV3Config.get | cloud-platform, firebase |
| `fireba_releases_reports_delete` | destructive | firebaseappdistribution.projects.apps.releases.feedbackReports.delete | cloud-platform |
| `firebase_add_google_analytics` | write | firebase.projects.addGoogleAnalytics | cloud-platform, firebase |
| `firebase_android_apps_create` | write | firebase.projects.androidApps.create | cloud-platform, firebase |
| `firebase_android_apps_get` | read | firebase.projects.androidApps.get | cloud-platform, cloud-platform.read-only |
| `firebase_android_apps_list` | read | firebase.projects.androidApps.list | cloud-platform, cloud-platform.read-only |
| `firebase_android_apps_patch` | write | firebase.projects.androidApps.patch | cloud-platform, firebase |
| `firebase_android_apps_remove` | destructive | firebase.projects.androidApps.remove | cloud-platform, firebase |
| `firebase_android_apps_sha_list` | read | firebase.projects.androidApps.sha.list | cloud-platform, cloud-platform.read-only |
| `firebase_android_apps_undelete` | write | firebase.projects.androidApps.undelete | cloud-platform, firebase |
| `firebase_apps_get_config` | read | firebase.projects.androidApps.getConfig | cloud-platform, cloud-platform.read-only |
| `firebase_apps_sha_create` | write | firebase.projects.androidApps.sha.create | cloud-platform, firebase |
| `firebase_apps_sha_delete` | destructive | firebase.projects.androidApps.sha.delete | cloud-platform, firebase |
| `firebase_get_admin_sdk_config` | read | firebase.projects.getAdminSdkConfig | cloud-platform, cloud-platform.read-only |
| `firebase_get_analytics_details` | read | firebase.projects.getAnalyticsDetails | cloud-platform, cloud-platform.read-only |
| `firebase_ios_apps_create` | write | firebase.projects.iosApps.create | cloud-platform, firebase |
| `firebase_ios_apps_get_config` | read | firebase.projects.iosApps.getConfig | cloud-platform, cloud-platform.read-only |
| `firebase_ios_apps_patch` | write | firebase.projects.iosApps.patch | cloud-platform, firebase |
| `firebase_ios_apps_remove` | destructive | firebase.projects.iosApps.remove | cloud-platform, firebase |
| `firebase_ios_apps_undelete` | write | firebase.projects.iosApps.undelete | cloud-platform, firebase |
| `firebase_location_finalize` | write | firebase.projects.defaultLocation.finalize | cloud-platform, firebase |
| `firebase_locations_list` | read | firebase.projects.availableLocations.list | cloud-platform, cloud-platform.read-only |
| `firebase_operations_get` | read | firebase.operations.get | cloud-platform, cloud-platform.read-only |
| `firebase_projects_add_firebase` | write | firebase.projects.addFirebase | cloud-platform, firebase |
| `firebase_projects_get` | read | firebase.projects.get | cloud-platform, cloud-platform.read-only |
| `firebase_projects_ios_apps_get` | read | firebase.projects.iosApps.get | cloud-platform, cloud-platform.read-only |
| `firebase_projects_ios_apps_list` | read | firebase.projects.iosApps.list | cloud-platform, cloud-platform.read-only |
| `firebase_projects_list` | read | firebase.projects.list | cloud-platform, cloud-platform.read-only |
| `firebase_projects_patch` | write | firebase.projects.patch | cloud-platform, firebase |
| `firebase_projects_search_apps` | read | firebase.projects.searchApps | cloud-platform, cloud-platform.read-only |
| `firebase_projects_web_apps_get` | read | firebase.projects.webApps.get | cloud-platform, cloud-platform.read-only |
| `firebase_projects_web_apps_list` | read | firebase.projects.webApps.list | cloud-platform, cloud-platform.read-only |
| `firebase_remove_analytics` | write | firebase.projects.removeAnalytics | cloud-platform, firebase |
| `firebase_web_apps_create` | write | firebase.projects.webApps.create | cloud-platform, firebase |
| `firebase_web_apps_get_config` | read | firebase.projects.webApps.getConfig | cloud-platform, cloud-platform.read-only |
| `firebase_web_apps_patch` | write | firebase.projects.webApps.patch | cloud-platform, firebase |
| `firebase_web_apps_remove` | destructive | firebase.projects.webApps.remove | cloud-platform, firebase |
| `firebase_web_apps_undelete` | write | firebase.projects.webApps.undelete | cloud-platform, firebase |
| `firebasea_app_attest_config_get` | read | firebaseappcheck.projects.apps.appAttestConfig.get | cloud-platform, firebase |
| `firebasea_apps_attest_assertion` | write | firebaseappcheck.projects.apps.exchangeAppAttestAssertion | cloud-platform, firebase |
| `firebasea_apps_attest_challenge` | write | firebaseappcheck.projects.apps.generateAppAttestChallenge | cloud-platform, firebase |
| `firebasea_apps_debug_tokens_get` | read | firebaseappcheck.projects.apps.debugTokens.get | cloud-platform, firebase |
| `firebasea_apps_enterprise_token` | write | firebaseappcheck.projects.apps.exchangeRecaptchaEnterpriseToken | cloud-platform, firebase |
| `firebasea_apps_releases_ops_get` | read | firebaseappdistribution.projects.apps.releases.operations.get | cloud-platform |
| `firebasea_backends_domains_list` | read | firebaseapphosting.projects.locations.backends.domains.list | cloud-platform |
| `firebasea_backends_rollouts_get` | read | firebaseapphosting.projects.locations.backends.rollouts.get | cloud-platform |
| `firebasea_exchange_custom_token` | write | firebaseappcheck.projects.apps.exchangeCustomToken | cloud-platform, firebase |
| `firebasea_policies_batch_update` | write | firebaseappcheck.projects.services.resourcePolicies.batchUpdate | cloud-platform, firebase |
| `firebasea_projects_groups_patch` | write | firebaseappdistribution.projects.groups.patch | cloud-platform |
| `firebasea_projects_services_get` | read | firebaseappcheck.projects.services.get | cloud-platform, firebase |
| `firebasea_projects_testers_list` | read | firebaseappdistribution.projects.testers.list | cloud-platform |
| `firebasea_releases_batch_delete` | destructive | firebaseappdistribution.projects.apps.releases.batchDelete | cloud-platform |
| `firebasea_releases_reports_list` | read | firebaseappdistribution.projects.apps.releases.feedbackReports.list | cloud-platform |
| `firebasea_services_batch_update` | write | firebaseappcheck.projects.services.batchUpdate | cloud-platform, firebase |
| `firebasea_services_policies_get` | read | firebaseappcheck.projects.services.resourcePolicies.get | cloud-platform, firebase |
| `firebaseap_app_rec_ent_conf_get` | read | firebaseappcheck.projects.apps.recaptchaEnterpriseConfig.get | cloud-platform, firebase |
| `firebaseap_apps_get_aab_info` | read | firebaseappdistribution.projects.apps.getAabInfo | cloud-platform |
| `firebaseap_apps_integrity_token` | write | firebaseappcheck.projects.apps.exchangePlayIntegrityToken | cloud-platform, firebase |
| `firebaseap_apps_releases_get` | read | firebaseappdistribution.projects.apps.releases.get | cloud-platform |
| `firebaseap_apps_releases_list` | read | firebaseappdistribution.projects.apps.releases.list | cloud-platform |
| `firebaseap_apps_releases_patch` | write | firebaseappdistribution.projects.apps.releases.patch | cloud-platform |
| `firebaseap_apps_tokens_create` | write | firebaseappcheck.projects.apps.debugTokens.create | cloud-platform, firebase |
| `firebaseap_apps_tokens_delete` | destructive | firebaseappcheck.projects.apps.debugTokens.delete | cloud-platform, firebase |
| `firebaseap_apps_tokens_list` | read | firebaseappcheck.projects.apps.debugTokens.list | cloud-platform, firebase |
| `firebaseap_apps_tokens_patch` | write | firebaseappcheck.projects.apps.debugTokens.patch | cloud-platform, firebase |
| `firebaseap_backends_builds_get` | read | firebaseapphosting.projects.locations.backends.builds.get | cloud-platform |
| `firebaseap_backends_builds_list` | read | firebaseapphosting.projects.locations.backends.builds.list | cloud-platform |
| `firebaseap_backends_create` | write | firebaseapphosting.projects.locations.backends.create | cloud-platform |
| `firebaseap_backends_delete` | destructive | firebaseapphosting.projects.locations.backends.delete | cloud-platform |
| `firebaseap_backends_domains_get` | read | firebaseapphosting.projects.locations.backends.domains.get | cloud-platform |
| `firebaseap_backends_get` | read | firebaseapphosting.projects.locations.backends.get | cloud-platform |
| `firebaseap_backends_list` | read | firebaseapphosting.projects.locations.backends.list | cloud-platform |
| `firebaseap_backends_patch` | write | firebaseapphosting.projects.locations.backends.patch | cloud-platform |
| `firebaseap_backends_traffic_get` | read | firebaseapphosting.projects.locations.backends.traffic.get | cloud-platform |
| `firebaseap_batch_get` | read | firebaseappcheck.projects.apps.deviceCheckConfig.batchGet | cloud-platform, firebase |
| `firebaseap_builds_create` | write | firebaseapphosting.projects.locations.backends.builds.create | cloud-platform |
| `firebaseap_builds_delete` | destructive | firebaseapphosting.projects.locations.backends.builds.delete | cloud-platform |
| `firebaseap_domains_create` | write | firebaseapphosting.projects.locations.backends.domains.create | cloud-platform |
| `firebaseap_domains_delete` | destructive | firebaseapphosting.projects.locations.backends.domains.delete | cloud-platform |
| `firebaseap_domains_patch` | write | firebaseapphosting.projects.locations.backends.domains.patch | cloud-platform |
| `firebaseap_exchange_debug_token` | write | firebaseappcheck.oauthClients.exchangeDebugToken | cloud-platform, firebase |
| `firebaseap_get` | read | firebaseapphosting.projects.locations.get | cloud-platform |
| `firebaseap_groups_batch_join` | write | firebaseappdistribution.projects.groups.batchJoin | cloud-platform |
| `firebaseap_groups_batch_leave` | write | firebaseappdistribution.projects.groups.batchLeave | cloud-platform |
| `firebaseap_groups_create` | write | firebaseappdistribution.projects.groups.create | cloud-platform |
| `firebaseap_groups_delete` | destructive | firebaseappdistribution.projects.groups.delete | cloud-platform |
| `firebaseap_jwks_get` | read | firebaseappcheck.jwks.get | cloud-platform, firebase |
| `firebaseap_list` | read | firebaseapphosting.projects.locations.list | cloud-platform |
| `firebaseap_mint_app_check_token` | write | firebaseappcheck.projects.apps.mintAppCheckToken | cloud-platform, firebase |
| `firebaseap_operations_cancel` | destructive | firebaseapphosting.projects.locations.operations.cancel | cloud-platform |
| `firebaseap_operations_delete` | destructive | firebaseapphosting.projects.locations.operations.delete | cloud-platform |
| `firebaseap_operations_get` | read | firebaseapphosting.projects.locations.operations.get | cloud-platform |
| `firebaseap_operations_list` | read | firebaseapphosting.projects.locations.operations.list | cloud-platform |
| `firebaseap_patch` | write | firebaseappcheck.projects.apps.recaptchaEnterpriseConfig.patch | cloud-platform, firebase |
| `firebaseap_pla_int_con_batc_get` | read | firebaseappcheck.projects.apps.playIntegrityConfig.batchGet | cloud-platform, firebase |
| `firebaseap_policies_create` | write | firebaseappcheck.projects.services.resourcePolicies.create | cloud-platform, firebase |
| `firebaseap_policies_delete` | destructive | firebaseappcheck.projects.services.resourcePolicies.delete | cloud-platform, firebase |
| `firebaseap_policies_list` | read | firebaseappcheck.projects.services.resourcePolicies.list | cloud-platform, firebase |
| `firebaseap_policies_patch` | write | firebaseappcheck.projects.services.resourcePolicies.patch | cloud-platform, firebase |
| `firebaseap_projects_groups_get` | read | firebaseappdistribution.projects.groups.get | cloud-platform |
| `firebaseap_projects_groups_list` | read | firebaseappdistribution.projects.groups.list | cloud-platform |
| `firebaseap_rec_ent_con_batc_get` | read | firebaseappcheck.projects.apps.recaptchaEnterpriseConfig.batchGet | cloud-platform, firebase |
| `firebaseap_rec_v3_conf_batc_get` | read | firebaseappcheck.projects.apps.recaptchaV3Config.batchGet | cloud-platform, firebase |
| `firebaseap_releases_distribute` | write | firebaseappdistribution.projects.apps.releases.distribute | cloud-platform |
| `firebaseap_releases_ops_cancel` | destructive | firebaseappdistribution.projects.apps.releases.operations.cancel | cloud-platform |
| `firebaseap_releases_ops_delete` | destructive | firebaseappdistribution.projects.apps.releases.operations.delete | cloud-platform |
| `firebaseap_releases_ops_list` | read | firebaseappdistribution.projects.apps.releases.operations.list | cloud-platform |
| `firebaseap_releases_ops_wait` | write | firebaseappdistribution.projects.apps.releases.operations.wait | cloud-platform |
| `firebaseap_releases_reports_get` | read | firebaseappdistribution.projects.apps.releases.feedbackReports.get | cloud-platform |
| `firebaseap_rollouts_create` | write | firebaseapphosting.projects.locations.backends.rollouts.create | cloud-platform |
| `firebaseap_rollouts_list` | read | firebaseapphosting.projects.locations.backends.rollouts.list | cloud-platform |
| `firebaseap_services_list` | read | firebaseappcheck.projects.services.list | cloud-platform, firebase |
| `firebaseap_services_patch` | write | firebaseappcheck.projects.services.patch | cloud-platform, firebase |
| `firebaseap_testers_batch_add` | write | firebaseappdistribution.projects.testers.batchAdd | cloud-platform |
| `firebaseap_testers_batch_remove` | destructive | firebaseappdistribution.projects.testers.batchRemove | cloud-platform |
| `firebaseap_testers_patch` | write | firebaseappdistribution.projects.testers.patch | cloud-platform |
| `firebaseap_traffic_patch` | write | firebaseapphosting.projects.locations.backends.traffic.patch | cloud-platform |
| `firebasec_apps_events_batch_get` | read | firebasecrashlytics.projects.apps.events.batchGet | cloud-platform, firebase |
| `firebasec_generate_alert_policy` | write | firebasecrashlytics.projects.apps.generateAlertPolicy | cloud-platform, firebase |
| `firebasecr_apps_events_list` | read | firebasecrashlytics.projects.apps.events.list | cloud-platform, firebase |
| `firebasecr_apps_issues_get` | read | firebasecrashlytics.projects.apps.issues.get | cloud-platform, firebase |
| `firebasecr_apps_issues_patch` | write | firebasecrashlytics.projects.apps.issues.patch | cloud-platform, firebase |
| `firebasecr_apps_reports_get` | read | firebasecrashlytics.projects.apps.reports.get | cloud-platform, firebase |
| `firebasecr_apps_reports_list` | read | firebasecrashlytics.projects.apps.reports.list | cloud-platform, firebase |
| `firebasecr_delete_crash_reports` | destructive | firebasecrashlytics.projects.apps.users.deleteCrashReports | cloud-platform, firebase |
| `firebasecr_issues_batch_update` | write | firebasecrashlytics.projects.apps.issues.batchUpdate | cloud-platform, firebase |
| `firebasecr_issues_notes_create` | write | firebasecrashlytics.projects.apps.issues.notes.create | cloud-platform, firebase |
| `firebasecr_issues_notes_delete` | destructive | firebasecrashlytics.projects.apps.issues.notes.delete | cloud-platform, firebase |
| `firebasecr_issues_notes_list` | read | firebasecrashlytics.projects.apps.issues.notes.list | cloud-platform, firebase |
| `firebased_services_schemas_list` | read | firebasedataconnect.projects.locations.services.schemas.list | cloud-platform |
| `firebaseda_connectors_create` | write | firebasedataconnect.projects.locations.services.connectors.create | cloud-platform |
| `firebaseda_connectors_delete` | destructive | firebasedataconnect.projects.locations.services.connectors.delete | cloud-platform |
| `firebaseda_connectors_get` | read | firebasedataconnect.projects.locations.services.connectors.get | cloud-platform |
| `firebaseda_connectors_list` | read | firebasedataconnect.projects.locations.services.connectors.list | cloud-platform |
| `firebaseda_connectors_patch` | write | firebasedataconnect.projects.locations.services.connectors.patch | cloud-platform |
| `firebaseda_execute_graphql` | write | firebasedataconnect.projects.locations.services.executeGraphql | cloud-platform |
| `firebaseda_execute_graphql_read` | read | firebasedataconnect.projects.locations.services.executeGraphqlRead | cloud-platform |
| `firebaseda_generate_query` | read | firebasedataconnect.projects.locations.services.generateQuery | cloud-platform |
| `firebaseda_generate_schema` | read | firebasedataconnect.projects.locations.services.generateSchema | cloud-platform |
| `firebaseda_get` | read | firebasedataconnect.projects.locations.get | cloud-platform |
| `firebaseda_impersonate_mutation` | write | firebasedataconnect.projects.locations.services.connectors.impersonateMutation | cloud-platform |
| `firebaseda_impersonate_query` | write | firebasedataconnect.projects.locations.services.connectors.impersonateQuery | cloud-platform |
| `firebaseda_instances_create` | write | firebasedatabase.projects.locations.instances.create | cloud-platform, firebase |
| `firebaseda_instances_delete` | destructive | firebasedatabase.projects.locations.instances.delete | cloud-platform, firebase |
| `firebaseda_instances_disable` | destructive | firebasedatabase.projects.locations.instances.disable | cloud-platform, firebase |
| `firebaseda_instances_get` | read | firebasedatabase.projects.locations.instances.get | cloud-platform, cloud-platform.read-only |
| `firebaseda_instances_list` | read | firebasedatabase.projects.locations.instances.list | cloud-platform, cloud-platform.read-only |
| `firebaseda_instances_reenable` | write | firebasedatabase.projects.locations.instances.reenable | cloud-platform, firebase |
| `firebaseda_instances_undelete` | write | firebasedatabase.projects.locations.instances.undelete | cloud-platform, firebase |
| `firebaseda_introspect_graphql` | write | firebasedataconnect.projects.locations.services.introspectGraphql | cloud-platform |
| `firebaseda_list` | read | firebasedataconnect.projects.locations.list | cloud-platform |
| `firebaseda_operations_cancel` | destructive | firebasedataconnect.projects.locations.operations.cancel | cloud-platform |
| `firebaseda_operations_delete` | destructive | firebasedataconnect.projects.locations.operations.delete | cloud-platform |
| `firebaseda_operations_get` | read | firebasedataconnect.projects.locations.operations.get | cloud-platform |
| `firebaseda_operations_list` | read | firebasedataconnect.projects.locations.operations.list | cloud-platform |
| `firebaseda_schemas_create` | write | firebasedataconnect.projects.locations.services.schemas.create | cloud-platform |
| `firebaseda_schemas_delete` | destructive | firebasedataconnect.projects.locations.services.schemas.delete | cloud-platform |
| `firebaseda_schemas_migrate` | write | firebasedataconnect.projects.locations.services.schemas.migrate | cloud-platform |
| `firebaseda_schemas_patch` | write | firebasedataconnect.projects.locations.services.schemas.patch | cloud-platform |
| `firebaseda_services_create` | write | firebasedataconnect.projects.locations.services.create | cloud-platform |
| `firebaseda_services_delete` | destructive | firebasedataconnect.projects.locations.services.delete | cloud-platform |
| `firebaseda_services_get` | read | firebasedataconnect.projects.locations.services.get | cloud-platform |
| `firebaseda_services_list` | read | firebasedataconnect.projects.locations.services.list | cloud-platform |
| `firebaseda_services_patch` | write | firebasedataconnect.projects.locations.services.patch | cloud-platform |
| `firebaseda_services_schemas_get` | read | firebasedataconnect.projects.locations.services.schemas.get | cloud-platform |
| `firebaseho_domains_ops_cancel` | destructive | firebasehosting.projects.sites.customDomains.operations.cancel | cloud-platform, firebase |
| `firebaseho_domains_ops_delete` | destructive | firebasehosting.projects.sites.customDomains.operations.delete | cloud-platform, firebase |
| `firebaseho_operations_cancel` | destructive | firebasehosting.operations.cancel | (none) |
| `firebaseho_operations_delete` | destructive | firebasehosting.operations.delete | (none) |
| `firebaseho_operations_list` | read | firebasehosting.operations.list | (none) |
| `firebaseml_operations_cancel` | destructive | firebaseml.operations.cancel | cloud-platform |
| `firebaseml_operations_delete` | destructive | firebaseml.operations.delete | cloud-platform |
| `firebaseml_operations_list` | read | firebaseml.operations.list | cloud-platform |
| `firebaser_projects_releases_get` | read | firebaserules.projects.releases.get | cloud-platform, firebase |
| `firebaser_projects_rulesets_get` | read | firebaserules.projects.rulesets.get | cloud-platform, firebase |
| `firebaseru_get_executable` | read | firebaserules.projects.releases.getExecutable | cloud-platform, firebase |
| `firebaseru_projects_test` | read | firebaserules.projects.test | cloud-platform, firebase |
| `firebaseru_releases_create` | write | firebaserules.projects.releases.create | cloud-platform, firebase |
| `firebaseru_releases_delete` | destructive | firebaserules.projects.releases.delete | cloud-platform, firebase |
| `firebaseru_releases_list` | read | firebaserules.projects.releases.list | cloud-platform, firebase |
| `firebaseru_releases_patch` | write | firebaserules.projects.releases.patch | cloud-platform, firebase |
| `firebaseru_rulesets_create` | write | firebaserules.projects.rulesets.create | cloud-platform, firebase |
| `firebaseru_rulesets_delete` | destructive | firebaserules.projects.rulesets.delete | cloud-platform, firebase |
| `firebaseru_rulesets_list` | read | firebaserules.projects.rulesets.list | cloud-platform, firebase |
| `firebases_default_bucket_create` | write | firebasestorage.projects.defaultBucket.create | cloud-platform, firebase |
| `firebases_delete_default_bucket` | destructive | firebasestorage.projects.deleteDefaultBucket | cloud-platform, firebase |
| `firebases_projects_buckets_list` | read | firebasestorage.projects.buckets.list | cloud-platform, firebase |
| `firebasest_buckets_add_firebase` | write | firebasestorage.projects.buckets.addFirebase | cloud-platform, firebase |
| `firebasest_get_default_bucket` | read | firebasestorage.projects.getDefaultBucket | cloud-platform, firebase |
| `firebasest_projects_buckets_get` | read | firebasestorage.projects.buckets.get | cloud-platform, firebase |
| `firebasest_remove_firebase` | write | firebasestorage.projects.buckets.removeFirebase | cloud-platform, firebase |
| `ident_get_oob_confirmation_code` | write | identitytoolkit.relyingparty.getOobConfirmationCode | cloud-platform |
| `identity_send_verification_code` | write | identitytoolkit.relyingparty.sendVerificationCode | cloud-platform |
| `identityto_create_auth_uri` | write | identitytoolkit.relyingparty.createAuthUri | cloud-platform |
| `identityto_delete_acct` | write | identitytoolkit.relyingparty.deleteAccount | cloud-platform |
| `identityto_download_acct` | read | identitytoolkit.relyingparty.downloadAccount | cloud-platform, firebase |
| `identityto_email_link_signin` | write | identitytoolkit.relyingparty.emailLinkSignin | cloud-platform |
| `identityto_get_acct_info` | read | identitytoolkit.relyingparty.getAccountInfo | cloud-platform |
| `identityto_get_project_config` | read | identitytoolkit.relyingparty.getProjectConfig | cloud-platform |
| `identityto_get_public_keys` | read | identitytoolkit.relyingparty.getPublicKeys | cloud-platform |
| `identityto_get_recaptcha_param` | read | identitytoolkit.relyingparty.getRecaptchaParam | cloud-platform |
| `identityto_reset_password` | write | identitytoolkit.relyingparty.resetPassword | cloud-platform |
| `identityto_set_acct_info` | write | identitytoolkit.relyingparty.setAccountInfo | cloud-platform |
| `identityto_set_project_config` | write | identitytoolkit.relyingparty.setProjectConfig | cloud-platform |
| `identityto_sign_out_user` | write | identitytoolkit.relyingparty.signOutUser | cloud-platform |
| `identityto_signup_new_user` | write | identitytoolkit.relyingparty.signupNewUser | cloud-platform |
| `identityto_upload_acct` | write | identitytoolkit.relyingparty.uploadAccount | cloud-platform, firebase |
| `identityto_verify_assertion` | write | identitytoolkit.relyingparty.verifyAssertion | cloud-platform |
| `identityto_verify_custom_token` | write | identitytoolkit.relyingparty.verifyCustomToken | cloud-platform |
| `identityto_verify_password` | write | identitytoolkit.relyingparty.verifyPassword | cloud-platform |
| `identityto_verify_phone_number` | write | identitytoolkit.relyingparty.verifyPhoneNumber | cloud-platform |
| `testing_device_sessions_cancel` | destructive | testing.projects.deviceSessions.cancel | cloud-platform |
| `testing_device_sessions_create` | write | testing.projects.deviceSessions.create | cloud-platform |
| `testing_device_sessions_get` | read | testing.projects.deviceSessions.get | cloud-platform |
| `testing_device_sessions_list` | read | testing.projects.deviceSessions.list | cloud-platform |
| `testing_device_sessions_patch` | write | testing.projects.deviceSessions.patch | cloud-platform |
| `testing_service_get_apk_details` | read | testing.applicationDetailService.getApkDetails | cloud-platform |
| `testing_test_env_catalog_get` | read | testing.testEnvironmentCatalog.get | cloud-platform, cloud-platform.read-only |
| `testing_test_matrices_cancel` | destructive | testing.projects.testMatrices.cancel | cloud-platform |
| `testing_test_matrices_create` | write | testing.projects.testMatrices.create | cloud-platform |
| `testing_test_matrices_get` | read | testing.projects.testMatrices.get | cloud-platform, cloud-platform.read-only |
| `too_execs_steps_thumbnails_list` | read | toolresults.projects.histories.executions.steps.thumbnails.list | cloud-platform |
| `too_series_samples_batch_create` | write | toolresults.projects.histories.executions.steps.perfSampleSeries.samples.batchCreate | cloud-platform |
| `tool_execs_steps_summary_create` | write | toolresults.projects.histories.executions.steps.perfMetricsSummary.create | cloud-platform |
| `toolr_execs_steps_series_create` | write | toolresults.projects.histories.executions.steps.perfSampleSeries.create | cloud-platform |
| `toolr_steps_series_samples_list` | read | toolresults.projects.histories.executions.steps.perfSampleSeries.samples.list | cloud-platform |
| `toolre_execs_steps_series_list` | read | toolresults.projects.histories.executions.steps.perfSampleSeries.list | cloud-platform |
| `toolre_get_perf_metrics_summary` | read | toolresults.projects.histories.executions.steps.getPerfMetricsSummary | cloud-platform |
| `toolre_publish_xunit_xml_files` | write | toolresults.projects.histories.executions.steps.publishXunitXmlFiles | cloud-platform |
| `toolresu_accessibility_clusters` | read | toolresults.projects.histories.executions.steps.accessibilityClusters | cloud-platform |
| `toolresu_execs_steps_cases_list` | read | toolresults.projects.histories.executions.steps.testCases.list | cloud-platform |
| `toolresu_execs_steps_series_get` | read | toolresults.projects.histories.executions.steps.perfSampleSeries.get | cloud-platform |
| `toolresul_execs_steps_cases_get` | read | toolresults.projects.histories.executions.steps.testCases.get | cloud-platform |
| `toolresul_histories_execs_patch` | write | toolresults.projects.histories.executions.patch | cloud-platform |
| `toolresul_projects_get_settings` | read | toolresults.projects.getSettings | cloud-platform |
| `toolresult_execs_clusters_get` | read | toolresults.projects.histories.executions.clusters.get | cloud-platform |
| `toolresult_execs_clusters_list` | read | toolresults.projects.histories.executions.clusters.list | cloud-platform |
| `toolresult_execs_create` | write | toolresults.projects.histories.executions.create | cloud-platform |
| `toolresult_execs_envs_get` | read | toolresults.projects.histories.executions.environments.get | cloud-platform |
| `toolresult_execs_envs_list` | read | toolresults.projects.histories.executions.environments.list | cloud-platform |
| `toolresult_execs_steps_create` | write | toolresults.projects.histories.executions.steps.create | cloud-platform |
| `toolresult_execs_steps_get` | read | toolresults.projects.histories.executions.steps.get | cloud-platform |
| `toolresult_execs_steps_list` | read | toolresults.projects.histories.executions.steps.list | cloud-platform |
| `toolresult_execs_steps_patch` | write | toolresults.projects.histories.executions.steps.patch | cloud-platform |
| `toolresult_histories_create` | write | toolresults.projects.histories.create | cloud-platform |
| `toolresult_histories_execs_get` | read | toolresults.projects.histories.executions.get | cloud-platform |
| `toolresult_histories_execs_list` | read | toolresults.projects.histories.executions.list | cloud-platform |
| `toolresult_histories_get` | read | toolresults.projects.histories.get | cloud-platform |
| `toolresult_histories_list` | read | toolresults.projects.histories.list | cloud-platform |
| `toolresult_initialize_settings` | write | toolresults.projects.initializeSettings | cloud-platform |

## Gateway tools (3)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_call` | dynamic | Call an API method | (none) |
| `api_describe` | read | Describe an API method | (none) |
| `api_search` | read | Search API methods | (none) |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gfirebase: API methods | (none) |

## Generated APIs

Each API links to Google's documentation for it, as Google's Discovery directory names it (`documentationLink`, kept in `data/catalog.json`). The link is the API's documentation home, not a page per method: the directory gives no link per method, and Google's REST reference pages are laid out differently from product to product.

- Firebase Management API (`firebase/v1beta1`), 37 methods in the catalog. Documentation: <https://firebase.google.com>
- Firebase App Check API (`firebaseappcheck/v1`), 46 methods in the catalog. Documentation: <https://firebase.google.com/docs/app-check>
- Firebase App Distribution API (`firebaseappdistribution/v1`), 26 methods in the catalog. Documentation: <https://firebase.google.com/products/app-distribution>
- Firebase App Hosting API (`firebaseapphosting/v1`), 25 methods in the catalog. Documentation: <https://firebase.google.com/docs/app-hosting>
- Firebase Crashlytics API (`firebasecrashlytics/v1alpha`), 12 methods in the catalog. Documentation: <https://firebase.google.com/docs/crashlytics>
- Firebase Realtime Database Management API (`firebasedatabase/v1beta`), 7 methods in the catalog. Documentation: <https://firebase.google.com/docs/reference/rest/database/database-management/rest/>
- Firebase SQL Connect API (`firebasedataconnect/v1`), 38 methods in the catalog. Documentation: <https://firebase.google.com/docs/data-connect>
- Firebase Hosting API (`firebasehosting/v1`), 5 methods in the catalog. Documentation: <https://firebase.google.com/docs/hosting/>
- Firebase ML API (`firebaseml/v1`), 3 methods in the catalog. Documentation: <https://firebase.google.com>
- Firebase Rules API (`firebaserules/v1`), 11 methods in the catalog. Documentation: <https://firebase.google.com/docs/storage/security>
- Cloud Storage for Firebase API (`firebasestorage/v1beta`), 7 methods in the catalog. Documentation: <https://firebase.google.com/docs/storage>
- Identity Toolkit API (`identitytoolkit/v3`), 20 methods in the catalog. Documentation: <https://cloud.google.com/identity-platform>
- Firebase Cloud Messaging API (`fcm/v1`), 6 methods in the catalog. Documentation: <https://firebase.google.com/docs/cloud-messaging>
- Firebase Cloud Messaging Data API (`fcmdata/v1beta1`), 1 methods in the catalog. Documentation: <https://firebase.google.com/docs/cloud-messaging>
- Cloud Testing API (`testing/v1`), 10 methods in the catalog. Documentation: <https://firebase.google.com/docs/test-lab/>
- Cloud Tool Results API (`toolresults/v1beta3`), 29 methods in the catalog. Documentation: <https://firebase.google.com/docs/test-lab/>
- Device Run API (`devicerun/v1alpha`), 16 methods in the catalog. Documentation: <https://docs.cloud.google.com/developer-device-platform/device-run>

## Gateway APIs (reached through api_search, api_describe, api_call)

- Firebase App Check API (`firebaseappcheck/v1beta`), 57 methods. Documentation: <https://firebase.google.com/docs/app-check>
- Firebase App Distribution API (`firebaseappdistribution/v1alpha`), 23 methods. Documentation: <https://firebase.google.com/products/app-distribution>
- Firebase App Hosting API (`firebaseapphosting/v1beta`), 26 methods. Documentation: <https://firebase.google.com/docs/app-hosting>
- Firebase SQL Connect API (`firebasedataconnect/v1beta`), 38 methods. Documentation: <https://firebase.google.com/docs/data-connect>
- Firebase Hosting API (`firebasehosting/v1beta1`), 66 methods. Documentation: <https://firebase.google.com/docs/hosting/>
- Firebase ML API (`firebaseml/v1beta2`), 7 methods. Documentation: <https://firebase.google.com>
- Firebase ML API (`firebaseml/v2beta`), 3 methods. Documentation: <https://firebase.google.com>
- Identity Toolkit API (`identitytoolkit/v1`), 41 methods. Documentation: <https://cloud.google.com/identity-platform>
- Identity Toolkit API (`identitytoolkit/v2`), 50 methods. Documentation: <https://cloud.google.com/identity-platform>
- Device Run API (`devicerun/v1`), 10 methods. Documentation: <https://docs.cloud.google.com/developer-device-platform/device-run>

