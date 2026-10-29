# Firebase (`gfirebase`)

Firebase management, App Check, App Distribution, Crashlytics, Hosting, Data Connect, Rules, Test Lab, FCM and Identity Toolkit.

- Plugin: `gfirebase`, MCP server: `gfirebase`, login: Desktop OAuth client, then `login developer`
- Install: `claude plugin install gfirebase@google-services-mcps`
- Tools: 310 total. Curated 9, per-method 297, gateway 3. Read 138, write 127, destructive 44, dynamic 1.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 310, google 310 (all), curated 12 tools, each with the 9 runtime tools of the map counted. "(all)" means the product has no such toolset yet, so it lists every tool.

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

## Per-method tools (297)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `devicerun_proj_loca_opera_cance` | destructive | devicerun.projects.locations.operations.cancel | cloud-platform |
| `devicerun_proj_loca_opera_delet` | destructive | devicerun.projects.locations.operations.delete | cloud-platform |
| `devicerun_proj_loca_sessi_batch` | read | devicerun.projects.locations.sessions.batchGet | cloud-platform |
| `devicerun_proj_loca_sessi_cance` | destructive | devicerun.projects.locations.sessions.cancel | cloud-platform |
| `devicerun_proj_loca_sessi_creat` | write | devicerun.projects.locations.sessions.create | cloud-platform |
| `devicerun_proj_loca_sessi_delet` | destructive | devicerun.projects.locations.sessions.delete | cloud-platform |
| `devicerun_proj_locat_devic_list` | read | devicerun.projects.locations.devices.list | cloud-platform |
| `devicerun_proj_locat_opera_list` | read | devicerun.projects.locations.operations.list | cloud-platform |
| `devicerun_proj_locat_sessi_list` | read | devicerun.projects.locations.sessions.list | cloud-platform |
| `devicerun_proj_locat_softw_list` | read | devicerun.projects.locations.softwareVersions.list | cloud-platform |
| `devicerun_proje_locat_devic_get` | read | devicerun.projects.locations.devices.get | cloud-platform |
| `devicerun_proje_locat_opera_get` | read | devicerun.projects.locations.operations.get | cloud-platform |
| `devicerun_proje_locat_sessi_get` | read | devicerun.projects.locations.sessions.get | cloud-platform |
| `devicerun_proje_locat_softw_get` | read | devicerun.projects.locations.softwareVersions.get | cloud-platform |
| `devicerun_project_location_list` | read | devicerun.projects.locations.list | cloud-platform |
| `devicerun_projects_location_get` | read | devicerun.projects.locations.get | cloud-platform |
| `fcm_projec_regist_topic_create` | write | fcm.projects.registrations.topicSubscriptions.create | cloud-platform, firebase.messaging |
| `fcm_projec_regist_topic_delete` | destructive | fcm.projects.registrations.topicSubscriptions.delete | cloud-platform, firebase.messaging |
| `fcm_projec_regist_topic_s_patch` | write | fcm.projects.registrations.topicSubscriptions.patch | cloud-platform, firebase.messaging |
| `fcm_projec_registr_topic_s_list` | read | fcm.projects.registrations.topicSubscriptions.list | cloud-platform, firebase.messaging |
| `fcm_project_registr_topic_s_get` | read | fcm.projects.registrations.topicSubscriptions.get | cloud-platform, firebase.messaging |
| `fcm_projects_messages_send` | destructive | fcm.projects.messages.send | cloud-platform, firebase.messaging |
| `fcmdata_proje_andro_delive_list` | read | fcmdata.projects.androidApps.deliveryData.list | cloud-platform |
| `firebase_available_project_list` | read | firebase.availableProjects.list | cloud-platform, cloud-platform.read-only |
| `firebase_operations_get` | read | firebase.operations.get | cloud-platform, cloud-platform.read-only |
| `firebase_proje_andro_sha_create` | write | firebase.projects.androidApps.sha.create | cloud-platform, firebase |
| `firebase_proje_andro_sha_delete` | destructive | firebase.projects.androidApps.sha.delete | cloud-platform, firebase |
| `firebase_projec_androi_sha_list` | read | firebase.projects.androidApps.sha.list | cloud-platform, cloud-platform.read-only |
| `firebase_projec_android_get_con` | read | firebase.projects.androidApps.getConfig | cloud-platform, cloud-platform.read-only |
| `firebase_projec_android_undelet` | write | firebase.projects.androidApps.undelete | cloud-platform, firebase |
| `firebase_projec_default_finaliz` | write | firebase.projects.defaultLocation.finalize | cloud-platform, firebase |
| `firebase_projec_ios_app_get_con` | read | firebase.projects.iosApps.getConfig | cloud-platform, cloud-platform.read-only |
| `firebase_projec_ios_app_undelet` | write | firebase.projects.iosApps.undelete | cloud-platform, firebase |
| `firebase_projec_web_app_get_con` | read | firebase.projects.webApps.getConfig | cloud-platform, cloud-platform.read-only |
| `firebase_projec_web_app_undelet` | write | firebase.projects.webApps.undelete | cloud-platform, firebase |
| `firebase_project_android_create` | write | firebase.projects.androidApps.create | cloud-platform, firebase |
| `firebase_project_android_remove` | destructive | firebase.projects.androidApps.remove | cloud-platform, firebase |
| `firebase_project_ios_app_create` | write | firebase.projects.iosApps.create | cloud-platform, firebase |
| `firebase_project_ios_app_remove` | destructive | firebase.projects.iosApps.remove | cloud-platform, firebase |
| `firebase_project_ios_apps_patch` | write | firebase.projects.iosApps.patch | cloud-platform, firebase |
| `firebase_project_web_app_create` | write | firebase.projects.webApps.create | cloud-platform, firebase |
| `firebase_project_web_app_remove` | destructive | firebase.projects.webApps.remove | cloud-platform, firebase |
| `firebase_project_web_apps_patch` | write | firebase.projects.webApps.patch | cloud-platform, firebase |
| `firebase_projects_add_firebase` | write | firebase.projects.addFirebase | cloud-platform, firebase |
| `firebase_projects_add_google_an` | write | firebase.projects.addGoogleAnalytics | cloud-platform, firebase |
| `firebase_projects_android_a_get` | read | firebase.projects.androidApps.get | cloud-platform, cloud-platform.read-only |
| `firebase_projects_android_list` | read | firebase.projects.androidApps.list | cloud-platform, cloud-platform.read-only |
| `firebase_projects_android_patch` | write | firebase.projects.androidApps.patch | cloud-platform, firebase |
| `firebase_projects_availabl_list` | read | firebase.projects.availableLocations.list | cloud-platform, cloud-platform.read-only |
| `firebase_projects_get` | read | firebase.projects.get | cloud-platform, cloud-platform.read-only |
| `firebase_projects_get_admin_sdk` | read | firebase.projects.getAdminSdkConfig | cloud-platform, cloud-platform.read-only |
| `firebase_projects_get_analytics` | read | firebase.projects.getAnalyticsDetails | cloud-platform, cloud-platform.read-only |
| `firebase_projects_ios_apps_get` | read | firebase.projects.iosApps.get | cloud-platform, cloud-platform.read-only |
| `firebase_projects_ios_apps_list` | read | firebase.projects.iosApps.list | cloud-platform, cloud-platform.read-only |
| `firebase_projects_list` | read | firebase.projects.list | cloud-platform, cloud-platform.read-only |
| `firebase_projects_patch` | write | firebase.projects.patch | cloud-platform, firebase |
| `firebase_projects_remove_analyt` | write | firebase.projects.removeAnalytics | cloud-platform, firebase |
| `firebase_projects_search_apps` | read | firebase.projects.searchApps | cloud-platform, cloud-platform.read-only |
| `firebase_projects_web_apps_get` | read | firebase.projects.webApps.get | cloud-platform, cloud-platform.read-only |
| `firebase_projects_web_apps_list` | read | firebase.projects.webApps.list | cloud-platform, cloud-platform.read-only |
| `firebaseap_jwks_get` | read | firebaseappcheck.jwks.get | cloud-platform, firebase |
| `firebaseap_oauth_c_exchang_3c21` | write | firebaseappcheck.oauthClients.exchangeAppAttestAttestation | cloud-platform, firebase |
| `firebaseap_oauth_c_exchang_7abc` | write | firebaseappcheck.oauthClients.exchangeAppAttestAssertion | cloud-platform, firebase |
| `firebaseap_oauth_cli_exchange_d` | write | firebaseappcheck.oauthClients.exchangeDebugToken | cloud-platform, firebase |
| `firebaseap_oauth_cli_generate_a` | write | firebaseappcheck.oauthClients.generateAppAttestChallenge | cloud-platform, firebase |
| `firebaseap_pro_app_rec_bat_4579` | read | firebaseappcheck.projects.apps.recaptchaV3Config.batchGet | cloud-platform, firebase |
| `firebaseap_pro_app_rec_bat_b8b0` | read | firebaseappcheck.projects.apps.recaptchaEnterpriseConfig.batchGet | cloud-platform, firebase |
| `firebaseap_pro_app_rec_get_2829` | read | firebaseappcheck.projects.apps.recaptchaV3Config.get | cloud-platform, firebase |
| `firebaseap_pro_app_rec_get_f29c` | read | firebaseappcheck.projects.apps.recaptchaEnterpriseConfig.get | cloud-platform, firebase |
| `firebaseap_pro_app_rec_pat_1cf4` | write | firebaseappcheck.projects.apps.recaptchaEnterpriseConfig.patch | cloud-platform, firebase |
| `firebaseap_pro_app_rec_pat_3d2e` | write | firebaseappcheck.projects.apps.recaptchaV3Config.patch | cloud-platform, firebase |
| `firebaseap_pro_app_rel_fee_dele` | destructive | firebaseappdistribution.projects.apps.releases.feedbackReports.delete | cloud-platform |
| `firebaseap_pro_app_rel_fee_list` | read | firebaseappdistribution.projects.apps.releases.feedbackReports.list | cloud-platform |
| `firebaseap_pro_app_rel_feed_get` | read | firebaseappdistribution.projects.apps.releases.feedbackReports.get | cloud-platform |
| `firebaseap_pro_app_rel_ope_canc` | destructive | firebaseappdistribution.projects.apps.releases.operations.cancel | cloud-platform |
| `firebaseap_pro_app_rel_ope_dele` | destructive | firebaseappdistribution.projects.apps.releases.operations.delete | cloud-platform |
| `firebaseap_pro_app_rel_ope_list` | read | firebaseappdistribution.projects.apps.releases.operations.list | cloud-platform |
| `firebaseap_pro_app_rel_ope_wait` | write | firebaseappdistribution.projects.apps.releases.operations.wait | cloud-platform |
| `firebaseap_pro_app_rel_oper_get` | read | firebaseappdistribution.projects.apps.releases.operations.get | cloud-platform |
| `firebaseap_pro_loc_bac_bui_crea` | write | firebaseapphosting.projects.locations.backends.builds.create | cloud-platform |
| `firebaseap_pro_loc_bac_bui_dele` | destructive | firebaseapphosting.projects.locations.backends.builds.delete | cloud-platform |
| `firebaseap_pro_loc_bac_bui_list` | read | firebaseapphosting.projects.locations.backends.builds.list | cloud-platform |
| `firebaseap_pro_loc_bac_buil_get` | read | firebaseapphosting.projects.locations.backends.builds.get | cloud-platform |
| `firebaseap_pro_loc_bac_dom_crea` | write | firebaseapphosting.projects.locations.backends.domains.create | cloud-platform |
| `firebaseap_pro_loc_bac_dom_dele` | destructive | firebaseapphosting.projects.locations.backends.domains.delete | cloud-platform |
| `firebaseap_pro_loc_bac_dom_list` | read | firebaseapphosting.projects.locations.backends.domains.list | cloud-platform |
| `firebaseap_pro_loc_bac_dom_patc` | write | firebaseapphosting.projects.locations.backends.domains.patch | cloud-platform |
| `firebaseap_pro_loc_bac_doma_get` | read | firebaseapphosting.projects.locations.backends.domains.get | cloud-platform |
| `firebaseap_pro_loc_bac_rol_crea` | write | firebaseapphosting.projects.locations.backends.rollouts.create | cloud-platform |
| `firebaseap_pro_loc_bac_rol_list` | read | firebaseapphosting.projects.locations.backends.rollouts.list | cloud-platform |
| `firebaseap_pro_loc_bac_roll_get` | read | firebaseapphosting.projects.locations.backends.rollouts.get | cloud-platform |
| `firebaseap_pro_loc_bac_tra_patc` | write | firebaseapphosting.projects.locations.backends.traffic.patch | cloud-platform |
| `firebaseap_pro_loc_bac_traf_get` | read | firebaseapphosting.projects.locations.backends.traffic.get | cloud-platform |
| `firebaseap_proj_apps_app_batch` | read | firebaseappcheck.projects.apps.appAttestConfig.batchGet | cloud-platform, firebase |
| `firebaseap_proj_apps_app_patch` | write | firebaseappcheck.projects.apps.appAttestConfig.patch | cloud-platform, firebase |
| `firebaseap_proj_apps_debu_creat` | write | firebaseappcheck.projects.apps.debugTokens.create | cloud-platform, firebase |
| `firebaseap_proj_apps_debu_delet` | destructive | firebaseappcheck.projects.apps.debugTokens.delete | cloud-platform, firebase |
| `firebaseap_proj_apps_debu_patch` | write | firebaseappcheck.projects.apps.debugTokens.patch | cloud-platform, firebase |
| `firebaseap_proj_apps_debug_list` | read | firebaseappcheck.projects.apps.debugTokens.list | cloud-platform, firebase |
| `firebaseap_proj_apps_devi_batch` | read | firebaseappcheck.projects.apps.deviceCheckConfig.batchGet | cloud-platform, firebase |
| `firebaseap_proj_apps_devi_patch` | write | firebaseappcheck.projects.apps.deviceCheckConfig.patch | cloud-platform, firebase |
| `firebaseap_proj_apps_excha_0c66` | write | firebaseappcheck.projects.apps.exchangeAppAttestAttestation | cloud-platform, firebase |
| `firebaseap_proj_apps_excha_30d5` | write | firebaseappcheck.projects.apps.exchangeRecaptchaEnterpriseToken | cloud-platform, firebase |
| `firebaseap_proj_apps_excha_371c` | write | firebaseappcheck.projects.apps.exchangeDeviceCheckToken | cloud-platform, firebase |
| `firebaseap_proj_apps_excha_5334` | write | firebaseappcheck.projects.apps.exchangeAppAttestAssertion | cloud-platform, firebase |
| `firebaseap_proj_apps_excha_60a2` | write | firebaseappcheck.projects.apps.exchangePlayIntegrityToken | cloud-platform, firebase |
| `firebaseap_proj_apps_excha_8583` | write | firebaseappcheck.projects.apps.exchangeCustomToken | cloud-platform, firebase |
| `firebaseap_proj_apps_excha_ae2a` | write | firebaseappcheck.projects.apps.exchangeDebugToken | cloud-platform, firebase |
| `firebaseap_proj_apps_excha_dbb1` | write | firebaseappcheck.projects.apps.exchangeRecaptchaV3Token | cloud-platform, firebase |
| `firebaseap_proj_apps_gener_10a3` | write | firebaseappcheck.projects.apps.generatePlayIntegrityChallenge | cloud-platform, firebase |
| `firebaseap_proj_apps_gener_928d` | write | firebaseappcheck.projects.apps.generateAppAttestChallenge | cloud-platform, firebase |
| `firebaseap_proj_apps_play_batch` | read | firebaseappcheck.projects.apps.playIntegrityConfig.batchGet | cloud-platform, firebase |
| `firebaseap_proj_apps_play_patch` | write | firebaseappcheck.projects.apps.playIntegrityConfig.patch | cloud-platform, firebase |
| `firebaseap_proj_apps_rele_batch` | destructive | firebaseappdistribution.projects.apps.releases.batchDelete | cloud-platform |
| `firebaseap_proj_apps_rele_distr` | write | firebaseappdistribution.projects.apps.releases.distribute | cloud-platform |
| `firebaseap_proj_apps_rele_patch` | write | firebaseappdistribution.projects.apps.releases.patch | cloud-platform |
| `firebaseap_proj_apps_relea_list` | read | firebaseappdistribution.projects.apps.releases.list | cloud-platform |
| `firebaseap_proj_grou_batch_3c7d` | write | firebaseappdistribution.projects.groups.batchJoin | cloud-platform |
| `firebaseap_proj_grou_batch_6ce0` | write | firebaseappdistribution.projects.groups.batchLeave | cloud-platform |
| `firebaseap_proj_loca_back_creat` | write | firebaseapphosting.projects.locations.backends.create | cloud-platform |
| `firebaseap_proj_loca_back_delet` | destructive | firebaseapphosting.projects.locations.backends.delete | cloud-platform |
| `firebaseap_proj_loca_back_patch` | write | firebaseapphosting.projects.locations.backends.patch | cloud-platform |
| `firebaseap_proj_loca_backe_list` | read | firebaseapphosting.projects.locations.backends.list | cloud-platform |
| `firebaseap_proj_loca_oper_cance` | destructive | firebaseapphosting.projects.locations.operations.cancel | cloud-platform |
| `firebaseap_proj_loca_oper_delet` | destructive | firebaseapphosting.projects.locations.operations.delete | cloud-platform |
| `firebaseap_proj_loca_opera_list` | read | firebaseapphosting.projects.locations.operations.list | cloud-platform |
| `firebaseap_proj_locat_backe_get` | read | firebaseapphosting.projects.locations.backends.get | cloud-platform |
| `firebaseap_proj_locat_opera_get` | read | firebaseapphosting.projects.locations.operations.get | cloud-platform |
| `firebaseap_proj_serv_reso_batch` | write | firebaseappcheck.projects.services.resourcePolicies.batchUpdate | cloud-platform, firebase |
| `firebaseap_proj_serv_reso_creat` | write | firebaseappcheck.projects.services.resourcePolicies.create | cloud-platform, firebase |
| `firebaseap_proj_serv_reso_delet` | destructive | firebaseappcheck.projects.services.resourcePolicies.delete | cloud-platform, firebase |
| `firebaseap_proj_serv_reso_patch` | write | firebaseappcheck.projects.services.resourcePolicies.patch | cloud-platform, firebase |
| `firebaseap_proj_serv_resou_list` | read | firebaseappcheck.projects.services.resourcePolicies.list | cloud-platform, firebase |
| `firebaseap_proj_servi_resou_get` | read | firebaseappcheck.projects.services.resourcePolicies.get | cloud-platform, firebase |
| `firebaseap_proj_test_batch_8e11` | destructive | firebaseappdistribution.projects.testers.batchRemove | cloud-platform |
| `firebaseap_proj_test_batch_a43b` | write | firebaseappdistribution.projects.testers.batchAdd | cloud-platform |
| `firebaseap_proje_apps_app_a_get` | read | firebaseappcheck.projects.apps.appAttestConfig.get | cloud-platform, firebase |
| `firebaseap_proje_apps_debug_get` | read | firebaseappcheck.projects.apps.debugTokens.get | cloud-platform, firebase |
| `firebaseap_proje_apps_devic_get` | read | firebaseappcheck.projects.apps.deviceCheckConfig.get | cloud-platform, firebase |
| `firebaseap_proje_apps_play_get` | read | firebaseappcheck.projects.apps.playIntegrityConfig.get | cloud-platform, firebase |
| `firebaseap_proje_apps_relea_get` | read | firebaseappdistribution.projects.apps.releases.get | cloud-platform |
| `firebaseap_projec_groups_create` | write | firebaseappdistribution.projects.groups.create | cloud-platform |
| `firebaseap_projec_groups_delete` | destructive | firebaseappdistribution.projects.groups.delete | cloud-platform |
| `firebaseap_projec_servic_batch` | write | firebaseappcheck.projects.services.batchUpdate | cloud-platform, firebase |
| `firebaseap_projec_service_patch` | write | firebaseappcheck.projects.services.patch | cloud-platform, firebase |
| `firebaseap_projec_testers_patch` | write | firebaseappdistribution.projects.testers.patch | cloud-platform |
| `firebaseap_project_apps_get_aab` | read | firebaseappdistribution.projects.apps.getAabInfo | cloud-platform |
| `firebaseap_project_apps_mint_ap` | write | firebaseappcheck.projects.apps.mintAppCheckToken | cloud-platform, firebase |
| `firebaseap_project_groups_patch` | write | firebaseappdistribution.projects.groups.patch | cloud-platform |
| `firebaseap_project_locatio_list` | read | firebaseapphosting.projects.locations.list | cloud-platform |
| `firebaseap_project_location_get` | read | firebaseapphosting.projects.locations.get | cloud-platform |
| `firebaseap_project_service_list` | read | firebaseappcheck.projects.services.list | cloud-platform, firebase |
| `firebaseap_project_services_get` | read | firebaseappcheck.projects.services.get | cloud-platform, firebase |
| `firebaseap_project_testers_list` | read | firebaseappdistribution.projects.testers.list | cloud-platform |
| `firebaseap_projects_groups_get` | read | firebaseappdistribution.projects.groups.get | cloud-platform |
| `firebaseap_projects_groups_list` | read | firebaseappdistribution.projects.groups.list | cloud-platform |
| `firebasecr_pro_app_iss_not_crea` | write | firebasecrashlytics.projects.apps.issues.notes.create | cloud-platform, firebase |
| `firebasecr_pro_app_iss_not_dele` | destructive | firebasecrashlytics.projects.apps.issues.notes.delete | cloud-platform, firebase |
| `firebasecr_pro_app_iss_not_list` | read | firebasecrashlytics.projects.apps.issues.notes.list | cloud-platform, firebase |
| `firebasecr_proj_apps_even_batch` | read | firebasecrashlytics.projects.apps.events.batchGet | cloud-platform, firebase |
| `firebasecr_proj_apps_event_list` | read | firebasecrashlytics.projects.apps.events.list | cloud-platform, firebase |
| `firebasecr_proj_apps_issu_batch` | write | firebasecrashlytics.projects.apps.issues.batchUpdate | cloud-platform, firebase |
| `firebasecr_proj_apps_issu_patch` | write | firebasecrashlytics.projects.apps.issues.patch | cloud-platform, firebase |
| `firebasecr_proj_apps_repor_list` | read | firebasecrashlytics.projects.apps.reports.list | cloud-platform, firebase |
| `firebasecr_proj_apps_user_delet` | destructive | firebasecrashlytics.projects.apps.users.deleteCrashReports | cloud-platform, firebase |
| `firebasecr_proje_apps_issue_get` | read | firebasecrashlytics.projects.apps.issues.get | cloud-platform, firebase |
| `firebasecr_proje_apps_repor_get` | read | firebasecrashlytics.projects.apps.reports.get | cloud-platform, firebase |
| `firebaseda_pro_loc_ser_con_674d` | write | firebasedataconnect.projects.locations.services.connectors.impersonateQuery | cloud-platform |
| `firebaseda_pro_loc_ser_con_9a6d` | write | firebasedataconnect.projects.locations.services.connectors.executeQuery | cloud-platform |
| `firebaseda_pro_loc_ser_con_c6c3` | write | firebasedataconnect.projects.locations.services.connectors.impersonateMutation | cloud-platform |
| `firebaseda_pro_loc_ser_con_crea` | write | firebasedataconnect.projects.locations.services.connectors.create | cloud-platform |
| `firebaseda_pro_loc_ser_con_dele` | destructive | firebasedataconnect.projects.locations.services.connectors.delete | cloud-platform |
| `firebaseda_pro_loc_ser_con_f17e` | write | firebasedataconnect.projects.locations.services.connectors.executeMutation | cloud-platform |
| `firebaseda_pro_loc_ser_con_list` | read | firebasedataconnect.projects.locations.services.connectors.list | cloud-platform |
| `firebaseda_pro_loc_ser_con_patc` | write | firebasedataconnect.projects.locations.services.connectors.patch | cloud-platform |
| `firebaseda_pro_loc_ser_conn_get` | read | firebasedataconnect.projects.locations.services.connectors.get | cloud-platform |
| `firebaseda_pro_loc_ser_exe_1fce` | write | firebasedataconnect.projects.locations.services.executeGraphql | cloud-platform |
| `firebaseda_pro_loc_ser_exe_3072` | write | firebasedataconnect.projects.locations.services.executeGraphqlRead | cloud-platform |
| `firebaseda_pro_loc_ser_gen_8f53` | write | firebasedataconnect.projects.locations.services.generateQuery | cloud-platform |
| `firebaseda_pro_loc_ser_gen_cf40` | write | firebasedataconnect.projects.locations.services.generateSchema | cloud-platform |
| `firebaseda_pro_loc_ser_pos_0946` | read | firebasedataconnect.projects.locations.services.postgrest.rpc.postgrestQueryFunction | cloud-platform |
| `firebaseda_pro_loc_ser_pos_257a` | write | firebasedataconnect.projects.locations.services.postgrest.postgrestUpsert | cloud-platform |
| `firebaseda_pro_loc_ser_pos_34c4` | write | firebasedataconnect.projects.locations.services.postgrest.postgrestInsert | cloud-platform |
| `firebaseda_pro_loc_ser_pos_621f` | write | firebasedataconnect.projects.locations.services.postgrest.rpc.postgrestCallFunction | cloud-platform |
| `firebaseda_pro_loc_ser_pos_7f54` | write | firebasedataconnect.projects.locations.services.postgrest.postgrestUpdate | cloud-platform |
| `firebaseda_pro_loc_ser_pos_9d50` | read | firebasedataconnect.projects.locations.services.postgrest.postgrestSelect | cloud-platform |
| `firebaseda_pro_loc_ser_pos_d433` | destructive | firebasedataconnect.projects.locations.services.postgrest.postgrestDelete | cloud-platform |
| `firebaseda_pro_loc_ser_sch_crea` | write | firebasedataconnect.projects.locations.services.schemas.create | cloud-platform |
| `firebaseda_pro_loc_ser_sch_dele` | destructive | firebasedataconnect.projects.locations.services.schemas.delete | cloud-platform |
| `firebaseda_pro_loc_ser_sch_list` | read | firebasedataconnect.projects.locations.services.schemas.list | cloud-platform |
| `firebaseda_pro_loc_ser_sch_migr` | write | firebasedataconnect.projects.locations.services.schemas.migrate | cloud-platform |
| `firebaseda_pro_loc_ser_sch_patc` | write | firebasedataconnect.projects.locations.services.schemas.patch | cloud-platform |
| `firebaseda_pro_loc_ser_sche_get` | read | firebasedataconnect.projects.locations.services.schemas.get | cloud-platform |
| `firebaseda_proj_loca_inst_creat` | write | firebasedatabase.projects.locations.instances.create | cloud-platform, firebase |
| `firebaseda_proj_loca_inst_delet` | destructive | firebasedatabase.projects.locations.instances.delete | cloud-platform, firebase |
| `firebaseda_proj_loca_inst_disab` | destructive | firebasedatabase.projects.locations.instances.disable | cloud-platform, firebase |
| `firebaseda_proj_loca_inst_reena` | write | firebasedatabase.projects.locations.instances.reenable | cloud-platform, firebase |
| `firebaseda_proj_loca_inst_undel` | write | firebasedatabase.projects.locations.instances.undelete | cloud-platform, firebase |
| `firebaseda_proj_loca_insta_list` | read | firebasedatabase.projects.locations.instances.list | cloud-platform, cloud-platform.read-only |
| `firebaseda_proj_loca_oper_cance` | destructive | firebasedataconnect.projects.locations.operations.cancel | cloud-platform |
| `firebaseda_proj_loca_oper_delet` | destructive | firebasedataconnect.projects.locations.operations.delete | cloud-platform |
| `firebaseda_proj_loca_opera_list` | read | firebasedataconnect.projects.locations.operations.list | cloud-platform |
| `firebaseda_proj_loca_serv_creat` | write | firebasedataconnect.projects.locations.services.create | cloud-platform |
| `firebaseda_proj_loca_serv_delet` | destructive | firebasedataconnect.projects.locations.services.delete | cloud-platform |
| `firebaseda_proj_loca_serv_intro` | write | firebasedataconnect.projects.locations.services.introspectGraphql | cloud-platform |
| `firebaseda_proj_loca_serv_patch` | write | firebasedataconnect.projects.locations.services.patch | cloud-platform |
| `firebaseda_proj_loca_servi_list` | read | firebasedataconnect.projects.locations.services.list | cloud-platform |
| `firebaseda_proj_locat_insta_get` | read | firebasedatabase.projects.locations.instances.get | cloud-platform, cloud-platform.read-only |
| `firebaseda_proj_locat_opera_get` | read | firebasedataconnect.projects.locations.operations.get | cloud-platform |
| `firebaseda_proj_locat_servi_get` | read | firebasedataconnect.projects.locations.services.get | cloud-platform |
| `firebaseda_project_locatio_list` | read | firebasedataconnect.projects.locations.list | cloud-platform |
| `firebaseda_project_location_get` | read | firebasedataconnect.projects.locations.get | cloud-platform |
| `firebaseho_operations_cancel` | destructive | firebasehosting.operations.cancel | (none) |
| `firebaseho_operations_delete` | destructive | firebasehosting.operations.delete | (none) |
| `firebaseho_operations_list` | read | firebasehosting.operations.list | (none) |
| `firebaseho_pro_sit_cus_ope_canc` | destructive | firebasehosting.projects.sites.customDomains.operations.cancel | cloud-platform, firebase |
| `firebaseho_pro_sit_cus_ope_dele` | destructive | firebasehosting.projects.sites.customDomains.operations.delete | cloud-platform, firebase |
| `firebaseml_operations_cancel` | destructive | firebaseml.operations.cancel | cloud-platform |
| `firebaseml_operations_delete` | destructive | firebaseml.operations.delete | cloud-platform |
| `firebaseml_operations_list` | read | firebaseml.operations.list | cloud-platform |
| `firebaseru_projec_releas_create` | write | firebaserules.projects.releases.create | cloud-platform, firebase |
| `firebaseru_projec_releas_delete` | destructive | firebaserules.projects.releases.delete | cloud-platform, firebase |
| `firebaseru_projec_releas_get_ex` | read | firebaserules.projects.releases.getExecutable | cloud-platform, firebase |
| `firebaseru_projec_release_patch` | write | firebaserules.projects.releases.patch | cloud-platform, firebase |
| `firebaseru_projec_rulese_create` | write | firebaserules.projects.rulesets.create | cloud-platform, firebase |
| `firebaseru_projec_rulese_delete` | destructive | firebaserules.projects.rulesets.delete | cloud-platform, firebase |
| `firebaseru_project_release_list` | read | firebaserules.projects.releases.list | cloud-platform, firebase |
| `firebaseru_project_releases_get` | read | firebaserules.projects.releases.get | cloud-platform, firebase |
| `firebaseru_project_ruleset_list` | read | firebaserules.projects.rulesets.list | cloud-platform, firebase |
| `firebaseru_project_rulesets_get` | read | firebaserules.projects.rulesets.get | cloud-platform, firebase |
| `firebaseru_projects_test` | write | firebaserules.projects.test | cloud-platform, firebase |
| `firebasest_projec_bucket_add_fi` | write | firebasestorage.projects.buckets.addFirebase | cloud-platform, firebase |
| `firebasest_projec_bucket_remove` | write | firebasestorage.projects.buckets.removeFirebase | cloud-platform, firebase |
| `firebasest_projec_defaul_create` | write | firebasestorage.projects.defaultBucket.create | cloud-platform, firebase |
| `firebasest_project_buckets_list` | read | firebasestorage.projects.buckets.list | cloud-platform, firebase |
| `firebasest_projects_buckets_get` | read | firebasestorage.projects.buckets.get | cloud-platform, firebase |
| `firebasest_projects_delete_defa` | destructive | firebasestorage.projects.deleteDefaultBucket | cloud-platform, firebase |
| `firebasest_projects_get_default` | read | firebasestorage.projects.getDefaultBucket | cloud-platform, firebase |
| `identityto_relyingpa_create_aut` | write | identitytoolkit.relyingparty.createAuthUri | cloud-platform |
| `identityto_relyingpa_delete_acc` | write | identitytoolkit.relyingparty.deleteAccount | cloud-platform |
| `identityto_relyingpa_download_a` | read | identitytoolkit.relyingparty.downloadAccount | cloud-platform, firebase |
| `identityto_relyingpa_email_link` | write | identitytoolkit.relyingparty.emailLinkSignin | cloud-platform |
| `identityto_relyingpa_get_accoun` | read | identitytoolkit.relyingparty.getAccountInfo | cloud-platform |
| `identityto_relyingpa_get_oob_co` | read | identitytoolkit.relyingparty.getOobConfirmationCode | cloud-platform |
| `identityto_relyingpa_get_projec` | read | identitytoolkit.relyingparty.getProjectConfig | cloud-platform |
| `identityto_relyingpa_get_public` | read | identitytoolkit.relyingparty.getPublicKeys | cloud-platform |
| `identityto_relyingpa_get_recapt` | read | identitytoolkit.relyingparty.getRecaptchaParam | cloud-platform |
| `identityto_relyingpa_reset_pass` | write | identitytoolkit.relyingparty.resetPassword | cloud-platform |
| `identityto_relyingpa_send_verif` | write | identitytoolkit.relyingparty.sendVerificationCode | cloud-platform |
| `identityto_relyingpa_set_accoun` | write | identitytoolkit.relyingparty.setAccountInfo | cloud-platform |
| `identityto_relyingpa_set_projec` | write | identitytoolkit.relyingparty.setProjectConfig | cloud-platform |
| `identityto_relyingpa_sign_out_u` | write | identitytoolkit.relyingparty.signOutUser | cloud-platform |
| `identityto_relyingpa_signup_new` | write | identitytoolkit.relyingparty.signupNewUser | cloud-platform |
| `identityto_relyingpa_upload_acc` | write | identitytoolkit.relyingparty.uploadAccount | cloud-platform, firebase |
| `identityto_relyingpa_verify_ass` | write | identitytoolkit.relyingparty.verifyAssertion | cloud-platform |
| `identityto_relyingpa_verify_cus` | write | identitytoolkit.relyingparty.verifyCustomToken | cloud-platform |
| `identityto_relyingpa_verify_pas` | write | identitytoolkit.relyingparty.verifyPassword | cloud-platform |
| `identityto_relyingpa_verify_pho` | write | identitytoolkit.relyingparty.verifyPhoneNumber | cloud-platform |
| `testing_application_get_apk_det` | read | testing.applicationDetailService.getApkDetails | cloud-platform |
| `testing_project_device_s_cancel` | destructive | testing.projects.deviceSessions.cancel | cloud-platform |
| `testing_project_device_s_create` | write | testing.projects.deviceSessions.create | cloud-platform |
| `testing_project_test_mat_cancel` | destructive | testing.projects.testMatrices.cancel | cloud-platform |
| `testing_project_test_mat_create` | write | testing.projects.testMatrices.create | cloud-platform |
| `testing_projects_device_s_patch` | write | testing.projects.deviceSessions.patch | cloud-platform |
| `testing_projects_device_se_list` | read | testing.projects.deviceSessions.list | cloud-platform |
| `testing_projects_device_ses_get` | read | testing.projects.deviceSessions.get | cloud-platform |
| `testing_projects_test_matri_get` | read | testing.projects.testMatrices.get | cloud-platform, cloud-platform.read-only |
| `testing_test_environment_ca_get` | read | testing.testEnvironmentCatalog.get | cloud-platform, cloud-platform.read-only |
| `toolresult_pro_his_exe_clu_list` | read | toolresults.projects.histories.executions.clusters.list | cloud-platform |
| `toolresult_pro_his_exe_clus_get` | read | toolresults.projects.histories.executions.clusters.get | cloud-platform |
| `toolresult_pro_his_exe_env_list` | read | toolresults.projects.histories.executions.environments.list | cloud-platform |
| `toolresult_pro_his_exe_envi_get` | read | toolresults.projects.histories.executions.environments.get | cloud-platform |
| `toolresult_pro_his_exe_ste_203c` | read | toolresults.projects.histories.executions.steps.getPerfMetricsSummary | cloud-platform |
| `toolresult_pro_his_exe_ste_2837` | write | toolresults.projects.histories.executions.steps.perfSampleSeries.create | cloud-platform |
| `toolresult_pro_his_exe_ste_344f` | read | toolresults.projects.histories.executions.steps.testCases.get | cloud-platform |
| `toolresult_pro_his_exe_ste_8c77` | read | toolresults.projects.histories.executions.steps.get | cloud-platform |
| `toolresult_pro_his_exe_ste_8edc` | write | toolresults.projects.histories.executions.steps.perfMetricsSummary.create | cloud-platform |
| `toolresult_pro_his_exe_ste_9bac` | read | toolresults.projects.histories.executions.steps.perfSampleSeries.list | cloud-platform |
| `toolresult_pro_his_exe_ste_a21c` | read | toolresults.projects.histories.executions.steps.perfSampleSeries.get | cloud-platform |
| `toolresult_pro_his_exe_ste_acce` | read | toolresults.projects.histories.executions.steps.accessibilityClusters | cloud-platform |
| `toolresult_pro_his_exe_ste_ca67` | read | toolresults.projects.histories.executions.steps.perfSampleSeries.samples.list | cloud-platform |
| `toolresult_pro_his_exe_ste_crea` | write | toolresults.projects.histories.executions.steps.create | cloud-platform |
| `toolresult_pro_his_exe_ste_e393` | read | toolresults.projects.histories.executions.steps.thumbnails.list | cloud-platform |
| `toolresult_pro_his_exe_ste_f80f` | write | toolresults.projects.histories.executions.steps.perfSampleSeries.samples.batchCreate | cloud-platform |
| `toolresult_pro_his_exe_ste_f89c` | read | toolresults.projects.histories.executions.steps.testCases.list | cloud-platform |
| `toolresult_pro_his_exe_ste_list` | read | toolresults.projects.histories.executions.steps.list | cloud-platform |
| `toolresult_pro_his_exe_ste_patc` | write | toolresults.projects.histories.executions.steps.patch | cloud-platform |
| `toolresult_pro_his_exe_ste_publ` | write | toolresults.projects.histories.executions.steps.publishXunitXmlFiles | cloud-platform |
| `toolresult_proj_hist_exec_creat` | write | toolresults.projects.histories.executions.create | cloud-platform |
| `toolresult_proj_hist_exec_patch` | write | toolresults.projects.histories.executions.patch | cloud-platform |
| `toolresult_proj_hist_execu_list` | read | toolresults.projects.histories.executions.list | cloud-platform |
| `toolresult_proj_histo_execu_get` | read | toolresults.projects.histories.executions.get | cloud-platform |
| `toolresult_projec_histor_create` | write | toolresults.projects.histories.create | cloud-platform |
| `toolresult_project_histori_list` | read | toolresults.projects.histories.list | cloud-platform |
| `toolresult_project_historie_get` | read | toolresults.projects.histories.get | cloud-platform |
| `toolresult_projects_get_setting` | read | toolresults.projects.getSettings | cloud-platform |
| `toolresult_projects_initialize` | write | toolresults.projects.initializeSettings | cloud-platform |

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

- Firebase Management API (`firebase/v1beta1`), 37 methods in the catalog
- Firebase App Check API (`firebaseappcheck/v1`), 46 methods in the catalog
- Firebase App Distribution API (`firebaseappdistribution/v1`), 26 methods in the catalog
- Firebase App Hosting API (`firebaseapphosting/v1`), 25 methods in the catalog
- Firebase Crashlytics API (`firebasecrashlytics/v1alpha`), 11 methods in the catalog
- Firebase Realtime Database Management API (`firebasedatabase/v1beta`), 7 methods in the catalog
- Firebase SQL Connect API (`firebasedataconnect/v1`), 38 methods in the catalog
- Firebase Hosting API (`firebasehosting/v1`), 5 methods in the catalog
- Firebase ML API (`firebaseml/v1`), 3 methods in the catalog
- Firebase Rules API (`firebaserules/v1`), 11 methods in the catalog
- Cloud Storage for Firebase API (`firebasestorage/v1beta`), 7 methods in the catalog
- Identity Toolkit API (`identitytoolkit/v3`), 20 methods in the catalog
- Firebase Cloud Messaging API (`fcm/v1`), 6 methods in the catalog
- Firebase Cloud Messaging Data API (`fcmdata/v1beta1`), 1 methods in the catalog
- Cloud Testing API (`testing/v1`), 10 methods in the catalog
- Cloud Tool Results API (`toolresults/v1beta3`), 29 methods in the catalog
- Device Run API (`devicerun/v1alpha`), 16 methods in the catalog

## Gateway APIs (reached through api_search, api_describe, api_call)

- Firebase App Check API (`firebaseappcheck/v1beta`), 57 methods
- Firebase App Distribution API (`firebaseappdistribution/v1alpha`), 23 methods
- Firebase App Hosting API (`firebaseapphosting/v1beta`), 26 methods
- Firebase SQL Connect API (`firebasedataconnect/v1beta`), 38 methods
- Firebase Hosting API (`firebasehosting/v1beta1`), 66 methods
- Firebase ML API (`firebaseml/v1beta2`), 7 methods
- Firebase ML API (`firebaseml/v2beta`), 3 methods
- Identity Toolkit API (`identitytoolkit/v1`), 41 methods
- Identity Toolkit API (`identitytoolkit/v2`), 50 methods

