# Google Play (`gplay`)

Google Play developer publishing and reporting, Play Games Services, Android Enterprise and Management, Play Integrity and device APIs.

- Plugin: `gplay`, MCP server: `gplay`, login: Desktop OAuth client, then `login developer`
- Install: `claude plugin install gplay@google-services-mcps`
- Tools: 361 total. Curated 8, per-method 349, gateway 3. Read 153, write 165, destructive 42, dynamic 1.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

## Curated tools (8)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `account_remove` | write | Remove a signed-in account | (none) |
| `account_set_default` | write | Set the default account | (none) |
| `accounts_list` | read | Signed-in accounts | (none) |
| `auth_login` | write | Sign in to Google | (none) |
| `auth_setup_admin` | write | Set up the workspace admin account | (none) |
| `auth_setup_client` | write | Save the Google OAuth client | (none) |
| `auth_status` | read | Sign-in status | (none) |
| `health` | read | Server health | (none) |

## Per-method tools (349)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `androiddev_customers_configurati_create` | write | androiddeviceprovisioning.customers.configurations.create | (none) |
| `androiddev_customers_configurati_delete` | destructive | androiddeviceprovisioning.customers.configurations.delete | (none) |
| `androiddev_customers_configuratio_patch` | write | androiddeviceprovisioning.customers.configurations.patch | (none) |
| `androiddev_customers_configuration_list` | read | androiddeviceprovisioning.customers.configurations.list | (none) |
| `androiddev_customers_configurations_get` | read | androiddeviceprovisioning.customers.configurations.get | (none) |
| `androiddev_customers_devices_apply_conf` | write | androiddeviceprovisioning.customers.devices.applyConfiguration | (none) |
| `androiddev_customers_devices_get` | read | androiddeviceprovisioning.customers.devices.get | (none) |
| `androiddev_customers_devices_list` | read | androiddeviceprovisioning.customers.devices.list | (none) |
| `androiddev_customers_devices_remove_con` | write | androiddeviceprovisioning.customers.devices.removeConfiguration | (none) |
| `androiddev_customers_devices_unclaim` | write | androiddeviceprovisioning.customers.devices.unclaim | (none) |
| `androiddev_customers_dpcs_list` | read | androiddeviceprovisioning.customers.dpcs.list | (none) |
| `androiddev_customers_list` | read | androiddeviceprovisioning.customers.list | (none) |
| `androiddev_operations_get` | read | androiddeviceprovisioning.operations.get | (none) |
| `androiddev_packages_package_regis_check` | read | androiddeveloperidstatus.packages.packageRegistrationStatus.check | (none) |
| `androiddev_partner_vendors_custome_list` | read | androiddeviceprovisioning.partners.vendors.customers.list | (none) |
| `androiddev_partners_customers_create` | write | androiddeviceprovisioning.partners.customers.create | (none) |
| `androiddev_partners_customers_list` | read | androiddeviceprovisioning.partners.customers.list | (none) |
| `androiddev_partners_devices_claim` | write | androiddeviceprovisioning.partners.devices.claim | (none) |
| `androiddev_partners_devices_claim_async` | write | androiddeviceprovisioning.partners.devices.claimAsync | (none) |
| `androiddev_partners_devices_find_by_ide` | write | androiddeviceprovisioning.partners.devices.findByIdentifier | (none) |
| `androiddev_partners_devices_find_by_own` | write | androiddeviceprovisioning.partners.devices.findByOwner | (none) |
| `androiddev_partners_devices_get` | read | androiddeviceprovisioning.partners.devices.get | (none) |
| `androiddev_partners_devices_get_sim_loc` | read | androiddeviceprovisioning.partners.devices.getSimLockState | (none) |
| `androiddev_partners_devices_metadata` | write | androiddeviceprovisioning.partners.devices.metadata | (none) |
| `androiddev_partners_devices_unclaim` | write | androiddeviceprovisioning.partners.devices.unclaim | (none) |
| `androiddev_partners_devices_unclaim_asy` | write | androiddeviceprovisioning.partners.devices.unclaimAsync | (none) |
| `androiddev_partners_devices_update_meta` | write | androiddeviceprovisioning.partners.devices.updateMetadataAsync | (none) |
| `androiddev_partners_vendors_list` | read | androiddeviceprovisioning.partners.vendors.list | (none) |
| `androident_devices_force_report_upload` | write | androidenterprise.devices.forceReportUpload | androidenterprise |
| `androident_devices_get` | read | androidenterprise.devices.get | androidenterprise |
| `androident_devices_get_state` | read | androidenterprise.devices.getState | androidenterprise |
| `androident_devices_list` | read | androidenterprise.devices.list | androidenterprise |
| `androident_devices_set_state` | write | androidenterprise.devices.setState | androidenterprise |
| `androident_devices_update` | write | androidenterprise.devices.update | androidenterprise |
| `androident_enrollment_tokens_create` | write | androidenterprise.enrollmentTokens.create | androidenterprise |
| `androident_enterprises_acknowledge_noti` | write | androidenterprise.enterprises.acknowledgeNotificationSet | androidenterprise |
| `androident_enterprises_complete_signup` | write | androidenterprise.enterprises.completeSignup | androidenterprise |
| `androident_enterprises_create_web_token` | write | androidenterprise.enterprises.createWebToken | androidenterprise |
| `androident_enterprises_enroll` | write | androidenterprise.enterprises.enroll | androidenterprise |
| `androident_enterprises_generate_enterpr` | write | androidenterprise.enterprises.generateEnterpriseUpgradeUrl | androidenterprise |
| `androident_enterprises_generate_signup` | write | androidenterprise.enterprises.generateSignupUrl | androidenterprise |
| `androident_enterprises_get` | read | androidenterprise.enterprises.get | androidenterprise |
| `androident_enterprises_get_service_acco` | read | androidenterprise.enterprises.getServiceAccount | androidenterprise |
| `androident_enterprises_get_store_layout` | read | androidenterprise.enterprises.getStoreLayout | androidenterprise |
| `androident_enterprises_list` | read | androidenterprise.enterprises.list | androidenterprise |
| `androident_enterprises_pull_notificatio` | write | androidenterprise.enterprises.pullNotificationSet | androidenterprise |
| `androident_enterprises_send_test_push_n` | write | androidenterprise.enterprises.sendTestPushNotification | androidenterprise |
| `androident_enterprises_set_account` | write | androidenterprise.enterprises.setAccount | androidenterprise |
| `androident_enterprises_set_store_layout` | write | androidenterprise.enterprises.setStoreLayout | androidenterprise |
| `androident_enterprises_unenroll` | write | androidenterprise.enterprises.unenroll | androidenterprise |
| `androident_entitlements_delete` | destructive | androidenterprise.entitlements.delete | androidenterprise |
| `androident_entitlements_get` | read | androidenterprise.entitlements.get | androidenterprise |
| `androident_entitlements_list` | read | androidenterprise.entitlements.list | androidenterprise |
| `androident_entitlements_update` | write | androidenterprise.entitlements.update | androidenterprise |
| `androident_grouplicenses_get` | read | androidenterprise.grouplicenses.get | androidenterprise |
| `androident_grouplicenses_list` | read | androidenterprise.grouplicenses.list | androidenterprise |
| `androident_grouplicenseusers_list` | read | androidenterprise.grouplicenseusers.list | androidenterprise |
| `androident_installs_delete` | destructive | androidenterprise.installs.delete | androidenterprise |
| `androident_installs_get` | read | androidenterprise.installs.get | androidenterprise |
| `androident_installs_list` | read | androidenterprise.installs.list | androidenterprise |
| `androident_installs_update` | write | androidenterprise.installs.update | androidenterprise |
| `androident_managedconfigura_delete_6d4f` | destructive | androidenterprise.managedconfigurationsforuser.delete | androidenterprise |
| `androident_managedconfigura_delete_cbf8` | destructive | androidenterprise.managedconfigurationsfordevice.delete | androidenterprise |
| `androident_managedconfigura_update_9b5d` | write | androidenterprise.managedconfigurationsforuser.update | androidenterprise |
| `androident_managedconfigura_update_e059` | write | androidenterprise.managedconfigurationsfordevice.update | androidenterprise |
| `androident_managedconfigurati_list_5929` | read | androidenterprise.managedconfigurationsforuser.list | androidenterprise |
| `androident_managedconfigurati_list_c1b3` | read | androidenterprise.managedconfigurationsfordevice.list | androidenterprise |
| `androident_managedconfiguratio_get_0e5e` | read | androidenterprise.managedconfigurationsfordevice.get | androidenterprise |
| `androident_managedconfiguratio_get_ae15` | read | androidenterprise.managedconfigurationsforuser.get | androidenterprise |
| `androident_managedconfigurationsse_list` | read | androidenterprise.managedconfigurationssettings.list | androidenterprise |
| `androident_permissions_get` | read | androidenterprise.permissions.get | androidenterprise |
| `androident_products_approve` | write | androidenterprise.products.approve | androidenterprise |
| `androident_products_generate_approval_u` | write | androidenterprise.products.generateApprovalUrl | androidenterprise |
| `androident_products_get` | read | androidenterprise.products.get | androidenterprise |
| `androident_products_get_app_restriction` | read | androidenterprise.products.getAppRestrictionsSchema | androidenterprise |
| `androident_products_get_permissions` | read | androidenterprise.products.getPermissions | androidenterprise |
| `androident_products_list` | read | androidenterprise.products.list | androidenterprise |
| `androident_products_unapprove` | write | androidenterprise.products.unapprove | androidenterprise |
| `androident_serviceaccountkeys_delete` | destructive | androidenterprise.serviceaccountkeys.delete | androidenterprise |
| `androident_serviceaccountkeys_insert` | write | androidenterprise.serviceaccountkeys.insert | androidenterprise |
| `androident_serviceaccountkeys_list` | read | androidenterprise.serviceaccountkeys.list | androidenterprise |
| `androident_storelayoutclusters_delete` | destructive | androidenterprise.storelayoutclusters.delete | androidenterprise |
| `androident_storelayoutclusters_get` | read | androidenterprise.storelayoutclusters.get | androidenterprise |
| `androident_storelayoutclusters_insert` | write | androidenterprise.storelayoutclusters.insert | androidenterprise |
| `androident_storelayoutclusters_list` | read | androidenterprise.storelayoutclusters.list | androidenterprise |
| `androident_storelayoutclusters_update` | write | androidenterprise.storelayoutclusters.update | androidenterprise |
| `androident_storelayoutpages_delete` | destructive | androidenterprise.storelayoutpages.delete | androidenterprise |
| `androident_storelayoutpages_get` | read | androidenterprise.storelayoutpages.get | androidenterprise |
| `androident_storelayoutpages_insert` | write | androidenterprise.storelayoutpages.insert | androidenterprise |
| `androident_storelayoutpages_list` | read | androidenterprise.storelayoutpages.list | androidenterprise |
| `androident_storelayoutpages_update` | write | androidenterprise.storelayoutpages.update | androidenterprise |
| `androident_users_delete` | destructive | androidenterprise.users.delete | androidenterprise |
| `androident_users_generate_authenticatio` | write | androidenterprise.users.generateAuthenticationToken | androidenterprise |
| `androident_users_get` | read | androidenterprise.users.get | androidenterprise |
| `androident_users_get_available_product` | read | androidenterprise.users.getAvailableProductSet | androidenterprise |
| `androident_users_insert` | write | androidenterprise.users.insert | androidenterprise |
| `androident_users_list` | read | androidenterprise.users.list | androidenterprise |
| `androident_users_revoke_device_access` | destructive | androidenterprise.users.revokeDeviceAccess | androidenterprise |
| `androident_users_set_available_product` | write | androidenterprise.users.setAvailableProductSet | androidenterprise |
| `androident_users_update` | write | androidenterprise.users.update | androidenterprise |
| `androident_webapps_delete` | destructive | androidenterprise.webapps.delete | androidenterprise |
| `androident_webapps_get` | read | androidenterprise.webapps.get | androidenterprise |
| `androident_webapps_insert` | write | androidenterprise.webapps.insert | androidenterprise |
| `androident_webapps_list` | read | androidenterprise.webapps.list | androidenterprise |
| `androident_webapps_update` | write | androidenterprise.webapps.update | androidenterprise |
| `androidpub_applica_tracks_releases_list` | read | androidpublisher.applications.tracks.releases.list | androidpublisher |
| `androidpub_applicatio_device_tie_create` | write | androidpublisher.applications.deviceTierConfigs.create | androidpublisher |
| `androidpub_application_device_tier_list` | read | androidpublisher.applications.deviceTierConfigs.list | androidpublisher |
| `androidpub_applications_data_safety` | write | androidpublisher.applications.dataSafety | androidpublisher |
| `androidpub_applications_device_tier_get` | read | androidpublisher.applications.deviceTierConfigs.get | androidpublisher |
| `androidpub_apprecovery_add_targeting` | write | androidpublisher.apprecovery.addTargeting | androidpublisher |
| `androidpub_apprecovery_cancel` | destructive | androidpublisher.apprecovery.cancel | androidpublisher |
| `androidpub_apprecovery_create` | write | androidpublisher.apprecovery.create | androidpublisher |
| `androidpub_apprecovery_deploy` | write | androidpublisher.apprecovery.deploy | androidpublisher |
| `androidpub_apprecovery_list` | read | androidpublisher.apprecovery.list | androidpublisher |
| `androidpub_appsigning_enroll_app` | write | androidpublisher.appsigning.enrollApp | androidpublisher |
| `androidpub_appsigning_rotate_app_signin` | write | androidpublisher.appsigning.rotateAppSigningKey | androidpublisher |
| `androidpub_appstoreapp_updateappst_4937` | write | androidpublisher.appstoreappsreview.updateappstorehostedapp | androidpublisher |
| `androidpub_appstoreapp_updateappst_927b` | write | androidpublisher.appstoreappsreview.updateappstorehostedapppublishstatus | androidpublisher |
| `androidpub_appstoreappsr_createappstore` | write | androidpublisher.appstoreappsreview.createappstorehostedapp | androidpublisher |
| `androidpub_appstorecat_recentappvie_get` | read | androidpublisher.appstorecatalog.recentappviews.get | androidpublisher |
| `androidpub_appstorecat_recentupdat_list` | read | androidpublisher.appstorecatalog.recentupdateevents.list | androidpublisher |
| `androidpub_edits_apks_addexternallyhost` | write | androidpublisher.edits.apks.addexternallyhosted | androidpublisher |
| `androidpub_edits_apks_list` | read | androidpublisher.edits.apks.list | androidpublisher |
| `androidpub_edits_bundles_list` | read | androidpublisher.edits.bundles.list | androidpublisher |
| `androidpub_edits_commit` | write | androidpublisher.edits.commit | androidpublisher |
| `androidpub_edits_countryavailabilit_get` | read | androidpublisher.edits.countryavailability.get | androidpublisher |
| `androidpub_edits_delete` | destructive | androidpublisher.edits.delete | androidpublisher |
| `androidpub_edits_details_get` | read | androidpublisher.edits.details.get | androidpublisher |
| `androidpub_edits_details_patch` | write | androidpublisher.edits.details.patch | androidpublisher |
| `androidpub_edits_details_update` | write | androidpublisher.edits.details.update | androidpublisher |
| `androidpub_edits_expansionfiles_get` | read | androidpublisher.edits.expansionfiles.get | androidpublisher |
| `androidpub_edits_expansionfiles_patch` | write | androidpublisher.edits.expansionfiles.patch | androidpublisher |
| `androidpub_edits_expansionfiles_update` | write | androidpublisher.edits.expansionfiles.update | androidpublisher |
| `androidpub_edits_get` | read | androidpublisher.edits.get | androidpublisher |
| `androidpub_edits_images_delete` | destructive | androidpublisher.edits.images.delete | androidpublisher |
| `androidpub_edits_images_deleteall` | destructive | androidpublisher.edits.images.deleteall | androidpublisher |
| `androidpub_edits_images_list` | read | androidpublisher.edits.images.list | androidpublisher |
| `androidpub_edits_insert` | write | androidpublisher.edits.insert | androidpublisher |
| `androidpub_edits_listings_delete` | destructive | androidpublisher.edits.listings.delete | androidpublisher |
| `androidpub_edits_listings_deleteall` | destructive | androidpublisher.edits.listings.deleteall | androidpublisher |
| `androidpub_edits_listings_get` | read | androidpublisher.edits.listings.get | androidpublisher |
| `androidpub_edits_listings_list` | read | androidpublisher.edits.listings.list | androidpublisher |
| `androidpub_edits_listings_patch` | write | androidpublisher.edits.listings.patch | androidpublisher |
| `androidpub_edits_listings_update` | write | androidpublisher.edits.listings.update | androidpublisher |
| `androidpub_edits_testers_get` | read | androidpublisher.edits.testers.get | androidpublisher |
| `androidpub_edits_testers_patch` | write | androidpublisher.edits.testers.patch | androidpublisher |
| `androidpub_edits_testers_update` | write | androidpublisher.edits.testers.update | androidpublisher |
| `androidpub_edits_tracks_create` | write | androidpublisher.edits.tracks.create | androidpublisher |
| `androidpub_edits_tracks_get` | read | androidpublisher.edits.tracks.get | androidpublisher |
| `androidpub_edits_tracks_list` | read | androidpublisher.edits.tracks.list | androidpublisher |
| `androidpub_edits_tracks_patch` | write | androidpublisher.edits.tracks.patch | androidpublisher |
| `androidpub_edits_tracks_update` | write | androidpublisher.edits.tracks.update | androidpublisher |
| `androidpub_edits_validate` | read | androidpublisher.edits.validate | androidpublisher |
| `androidpub_externaltrans_createexternal` | write | androidpublisher.externaltransactions.createexternaltransaction | androidpublisher |
| `androidpub_externaltrans_getexternaltra` | read | androidpublisher.externaltransactions.getexternaltransaction | androidpublisher |
| `androidpub_externaltrans_refundexternal` | write | androidpublisher.externaltransactions.refundexternaltransaction | androidpublisher |
| `androidpub_generatedapks_download` | read | androidpublisher.generatedapks.download | androidpublisher |
| `androidpub_generatedapks_list` | read | androidpublisher.generatedapks.list | androidpublisher |
| `androidpub_grants_create` | write | androidpublisher.grants.create | androidpublisher |
| `androidpub_grants_delete` | destructive | androidpublisher.grants.delete | androidpublisher |
| `androidpub_grants_patch` | write | androidpublisher.grants.patch | androidpublisher |
| `androidpub_inappproducts_batch_delete` | destructive | androidpublisher.inappproducts.batchDelete | androidpublisher |
| `androidpub_inappproducts_batch_get` | read | androidpublisher.inappproducts.batchGet | androidpublisher |
| `androidpub_inappproducts_batch_update` | write | androidpublisher.inappproducts.batchUpdate | androidpublisher |
| `androidpub_inappproducts_delete` | destructive | androidpublisher.inappproducts.delete | androidpublisher |
| `androidpub_inappproducts_get` | read | androidpublisher.inappproducts.get | androidpublisher |
| `androidpub_inappproducts_insert` | write | androidpublisher.inappproducts.insert | androidpublisher |
| `androidpub_inappproducts_list` | read | androidpublisher.inappproducts.list | androidpublisher |
| `androidpub_inappproducts_patch` | write | androidpublisher.inappproducts.patch | androidpublisher |
| `androidpub_inappproducts_update` | write | androidpublisher.inappproducts.update | androidpublisher |
| `androidpub_mon_onet_purc_offe_batc_55d4` | write | androidpublisher.monetization.onetimeproducts.purchaseOptions.offers.batchUpdate | androidpublisher |
| `androidpub_mon_onet_purc_offe_batc_b8dd` | write | androidpublisher.monetization.onetimeproducts.purchaseOptions.offers.batchUpdateStates | androidpublisher |
| `androidpub_mon_onet_purc_offe_batc_cb12` | destructive | androidpublisher.monetization.onetimeproducts.purchaseOptions.offers.batchDelete | androidpublisher |
| `androidpub_mon_onet_purc_offe_batc_ec87` | read | androidpublisher.monetization.onetimeproducts.purchaseOptions.offers.batchGet | androidpublisher |
| `androidpub_mon_subs_base_offe_batc_492b` | write | androidpublisher.monetization.subscriptions.basePlans.offers.batchUpdateStates | androidpublisher |
| `androidpub_mon_subs_base_offe_batc_6e72` | read | androidpublisher.monetization.subscriptions.basePlans.offers.batchGet | androidpublisher |
| `androidpub_mon_subs_base_offe_batc_9d1e` | write | androidpublisher.monetization.subscriptions.basePlans.offers.batchUpdate | androidpublisher |
| `androidpub_mone_oneti_purch_offer_activ` | write | androidpublisher.monetization.onetimeproducts.purchaseOptions.offers.activate | androidpublisher |
| `androidpub_mone_oneti_purch_offer_cance` | destructive | androidpublisher.monetization.onetimeproducts.purchaseOptions.offers.cancel | androidpublisher |
| `androidpub_mone_oneti_purch_offer_deact` | destructive | androidpublisher.monetization.onetimeproducts.purchaseOptions.offers.deactivate | androidpublisher |
| `androidpub_monet_oneti_purch_offer_list` | read | androidpublisher.monetization.onetimeproducts.purchaseOptions.offers.list | androidpublisher |
| `androidpub_monet_subsc_base_offer_activ` | write | androidpublisher.monetization.subscriptions.basePlans.offers.activate | androidpublisher |
| `androidpub_monet_subsc_base_offer_creat` | write | androidpublisher.monetization.subscriptions.basePlans.offers.create | androidpublisher |
| `androidpub_monet_subsc_base_offer_deact` | destructive | androidpublisher.monetization.subscriptions.basePlans.offers.deactivate | androidpublisher |
| `androidpub_monet_subsc_base_offer_delet` | destructive | androidpublisher.monetization.subscriptions.basePlans.offers.delete | androidpublisher |
| `androidpub_monet_subsc_base_offer_patch` | write | androidpublisher.monetization.subscriptions.basePlans.offers.patch | androidpublisher |
| `androidpub_monet_subsc_base_offers_get` | read | androidpublisher.monetization.subscriptions.basePlans.offers.get | androidpublisher |
| `androidpub_monet_subsc_base_offers_list` | read | androidpublisher.monetization.subscriptions.basePlans.offers.list | androidpublisher |
| `androidpub_moneti_onetim_purcha_batch_d` | destructive | androidpublisher.monetization.onetimeproducts.purchaseOptions.batchDelete | androidpublisher |
| `androidpub_moneti_onetim_purcha_batch_u` | write | androidpublisher.monetization.onetimeproducts.purchaseOptions.batchUpdateStates | androidpublisher |
| `androidpub_moneti_subscr_base_p_activat` | write | androidpublisher.monetization.subscriptions.basePlans.activate | androidpublisher |
| `androidpub_moneti_subscr_base_p_batch_m` | write | androidpublisher.monetization.subscriptions.basePlans.batchMigratePrices | androidpublisher |
| `androidpub_moneti_subscr_base_p_batch_u` | write | androidpublisher.monetization.subscriptions.basePlans.batchUpdateStates | androidpublisher |
| `androidpub_moneti_subscr_base_p_deactiv` | destructive | androidpublisher.monetization.subscriptions.basePlans.deactivate | androidpublisher |
| `androidpub_moneti_subscr_base_p_migrate` | write | androidpublisher.monetization.subscriptions.basePlans.migratePrices | androidpublisher |
| `androidpub_moneti_subscr_base_pl_delete` | destructive | androidpublisher.monetization.subscriptions.basePlans.delete | androidpublisher |
| `androidpub_monetiza_onetimepr_batch_del` | destructive | androidpublisher.monetization.onetimeproducts.batchDelete | androidpublisher |
| `androidpub_monetiza_onetimepr_batch_get` | read | androidpublisher.monetization.onetimeproducts.batchGet | androidpublisher |
| `androidpub_monetiza_onetimepr_batch_upd` | write | androidpublisher.monetization.onetimeproducts.batchUpdate | androidpublisher |
| `androidpub_monetiza_subscript_batch_get` | read | androidpublisher.monetization.subscriptions.batchGet | androidpublisher |
| `androidpub_monetiza_subscript_batch_upd` | write | androidpublisher.monetization.subscriptions.batchUpdate | androidpublisher |
| `androidpub_monetizat_subscripti_archive` | destructive | androidpublisher.monetization.subscriptions.archive | androidpublisher |
| `androidpub_monetizati_onetimepro_delete` | destructive | androidpublisher.monetization.onetimeproducts.delete | androidpublisher |
| `androidpub_monetizati_onetimeprod_patch` | write | androidpublisher.monetization.onetimeproducts.patch | androidpublisher |
| `androidpub_monetizati_subscripti_create` | write | androidpublisher.monetization.subscriptions.create | androidpublisher |
| `androidpub_monetizati_subscripti_delete` | destructive | androidpublisher.monetization.subscriptions.delete | androidpublisher |
| `androidpub_monetizati_subscriptio_patch` | write | androidpublisher.monetization.subscriptions.patch | androidpublisher |
| `androidpub_monetizatio_onetimeprod_list` | read | androidpublisher.monetization.onetimeproducts.list | androidpublisher |
| `androidpub_monetizatio_onetimeprodu_get` | read | androidpublisher.monetization.onetimeproducts.get | androidpublisher |
| `androidpub_monetizatio_subscriptio_list` | read | androidpublisher.monetization.subscriptions.list | androidpublisher |
| `androidpub_monetizatio_subscription_get` | read | androidpublisher.monetization.subscriptions.get | androidpublisher |
| `androidpub_monetization_convert_region` | write | androidpublisher.monetization.convertRegionPrices | androidpublisher |
| `androidpub_orders_batchget` | read | androidpublisher.orders.batchget | androidpublisher |
| `androidpub_orders_get` | read | androidpublisher.orders.get | androidpublisher |
| `androidpub_orders_refund` | write | androidpublisher.orders.refund | androidpublisher |
| `androidpub_orders_reviewrefund` | write | androidpublisher.orders.reviewrefund | androidpublisher |
| `androidpub_purchas_subscrip_cancel_07cb` | destructive | androidpublisher.purchases.subscriptionsv2.cancel | androidpublisher |
| `androidpub_purchas_subscrip_cancel_0abf` | destructive | androidpublisher.purchases.subscriptions.cancel | androidpublisher |
| `androidpub_purchase_productsv_getproduc` | read | androidpublisher.purchases.productsv2.getproductpurchasev2 | androidpublisher |
| `androidpub_purchase_subscrip_defer_073c` | write | androidpublisher.purchases.subscriptions.defer | androidpublisher |
| `androidpub_purchase_subscrip_defer_2791` | write | androidpublisher.purchases.subscriptionsv2.defer | androidpublisher |
| `androidpub_purchase_subscript_acknowled` | write | androidpublisher.purchases.subscriptions.acknowledge | androidpublisher |
| `androidpub_purchases_products_acknowled` | write | androidpublisher.purchases.products.acknowledge | androidpublisher |
| `androidpub_purchases_products_consume` | write | androidpublisher.purchases.products.consume | androidpublisher |
| `androidpub_purchases_products_get` | read | androidpublisher.purchases.products.get | androidpublisher |
| `androidpub_purchases_subscriptio_revoke` | destructive | androidpublisher.purchases.subscriptionsv2.revoke | androidpublisher |
| `androidpub_purchases_subscriptionsv_get` | read | androidpublisher.purchases.subscriptionsv2.get | androidpublisher |
| `androidpub_purchases_voidedpurchas_list` | read | androidpublisher.purchases.voidedpurchases.list | androidpublisher |
| `androidpub_reviews_get` | read | androidpublisher.reviews.get | androidpublisher |
| `androidpub_reviews_list` | read | androidpublisher.reviews.list | androidpublisher |
| `androidpub_reviews_reply` | write | androidpublisher.reviews.reply | androidpublisher |
| `androidpub_systemapks_variants_create` | write | androidpublisher.systemapks.variants.create | androidpublisher |
| `androidpub_systemapks_variants_download` | read | androidpublisher.systemapks.variants.download | androidpublisher |
| `androidpub_systemapks_variants_get` | read | androidpublisher.systemapks.variants.get | androidpublisher |
| `androidpub_systemapks_variants_list` | read | androidpublisher.systemapks.variants.list | androidpublisher |
| `androidpub_users_create` | write | androidpublisher.users.create | androidpublisher |
| `androidpub_users_delete` | destructive | androidpublisher.users.delete | androidpublisher |
| `androidpub_users_list` | read | androidpublisher.users.list | androidpublisher |
| `androidpub_users_patch` | write | androidpublisher.users.patch | androidpublisher |
| `chromewebs_publishers_items_cancel_subm` | write | chromewebstore.publishers.items.cancelSubmission | chromewebstore |
| `chromewebs_publishers_items_fetch_statu` | read | chromewebstore.publishers.items.fetchStatus | chromewebstore, chromewebstore.readonly |
| `chromewebs_publishers_items_publish` | write | chromewebstore.publishers.items.publish | chromewebstore |
| `chromewebs_publishers_items_set_publish` | write | chromewebstore.publishers.items.setPublishedDeployPercentage | chromewebstore |
| `games_accesstokens_generate_play_groupi` | write | games.accesstokens.generatePlayGroupingApiToken | games |
| `games_accesstokens_generate_recall_play` | write | games.accesstokens.generateRecallPlayGroupingApiToken | androidpublisher |
| `games_achievement_definitions_list` | read | games.achievementDefinitions.list | games |
| `games_achievements_increment` | write | games.achievements.increment | games |
| `games_achievements_list` | read | games.achievements.list | games |
| `games_achievements_reveal` | write | games.achievements.reveal | games |
| `games_achievements_set_steps_at_least` | write | games.achievements.setStepsAtLeast | games |
| `games_achievements_unlock` | write | games.achievements.unlock | games |
| `games_achievements_update_multiple` | write | games.achievements.updateMultiple | games |
| `games_applications_get` | read | games.applications.get | games |
| `games_applications_get_end_point` | read | games.applications.getEndPoint | games |
| `games_applications_played` | write | games.applications.played | games |
| `games_applications_verify` | read | games.applications.verify | games |
| `games_events_list_by_player` | read | games.events.listByPlayer | games |
| `games_events_list_definitions` | read | games.events.listDefinitions | games |
| `games_events_record` | write | games.events.record | games |
| `games_game_stats_batch_record_events` | write | games.gameStats.batchRecordEvents | games |
| `games_leaderboards_get` | read | games.leaderboards.get | games |
| `games_leaderboards_list` | read | games.leaderboards.list | games |
| `games_metagame_get_metagame_config` | read | games.metagame.getMetagameConfig | games |
| `games_metagame_list_categories_by_playe` | read | games.metagame.listCategoriesByPlayer | games |
| `games_players_get` | read | games.players.get | games |
| `games_players_get_multiple_application` | read | games.players.getMultipleApplicationPlayerIds | games |
| `games_players_get_scoped_player_ids` | read | games.players.getScopedPlayerIds | games |
| `games_players_list` | read | games.players.list | games |
| `games_recall_games_player_tokens` | read | games.recall.gamesPlayerTokens | androidpublisher |
| `games_recall_last_token_from_all_develo` | read | games.recall.lastTokenFromAllDeveloperGames | androidpublisher |
| `games_recall_link_persona` | write | games.recall.linkPersona | androidpublisher |
| `games_recall_reset_persona` | write | games.recall.resetPersona | androidpublisher |
| `games_recall_retrieve_tokens` | read | games.recall.retrieveTokens | androidpublisher |
| `games_recall_unlink_persona` | write | games.recall.unlinkPersona | androidpublisher |
| `games_revisions_check` | read | games.revisions.check | games |
| `games_scores_get` | read | games.scores.get | games |
| `games_scores_list` | read | games.scores.list | games |
| `games_scores_list_window` | read | games.scores.listWindow | games |
| `games_scores_submit` | write | games.scores.submit | games |
| `games_scores_submit_multiple` | write | games.scores.submitMultiple | games |
| `games_snapshots_get` | read | games.snapshots.get | drive.appdata, games |
| `games_snapshots_list` | read | games.snapshots.list | drive.appdata, games |
| `games_stats_get` | read | games.stats.get | games |
| `gamesconfi_achievement_configura_delete` | destructive | gamesConfiguration.achievementConfigurations.delete | androidpublisher |
| `gamesconfi_achievement_configura_insert` | write | gamesConfiguration.achievementConfigurations.insert | androidpublisher |
| `gamesconfi_achievement_configura_update` | write | gamesConfiguration.achievementConfigurations.update | androidpublisher |
| `gamesconfi_achievement_configurati_list` | read | gamesConfiguration.achievementConfigurations.list | androidpublisher |
| `gamesconfi_achievement_configuratio_get` | read | gamesConfiguration.achievementConfigurations.get | androidpublisher |
| `gamesconfi_leaderboard_configura_delete` | destructive | gamesConfiguration.leaderboardConfigurations.delete | androidpublisher |
| `gamesconfi_leaderboard_configura_insert` | write | gamesConfiguration.leaderboardConfigurations.insert | androidpublisher |
| `gamesconfi_leaderboard_configura_update` | write | gamesConfiguration.leaderboardConfigurations.update | androidpublisher |
| `gamesconfi_leaderboard_configurati_list` | read | gamesConfiguration.leaderboardConfigurations.list | androidpublisher |
| `gamesconfi_leaderboard_configuratio_get` | read | gamesConfiguration.leaderboardConfigurations.get | androidpublisher |
| `gamesmanag_achievements_reset` | destructive | gamesManagement.achievements.reset | games |
| `gamesmanag_achievements_reset_all` | write | gamesManagement.achievements.resetAll | games |
| `gamesmanag_achievements_reset_all_for_a` | write | gamesManagement.achievements.resetAllForAllPlayers | games |
| `gamesmanag_achievements_reset_for_all_p` | write | gamesManagement.achievements.resetForAllPlayers | games |
| `gamesmanag_achievements_reset_multiple` | write | gamesManagement.achievements.resetMultipleForAllPlayers | games |
| `gamesmanag_applications_list_hidden` | read | gamesManagement.applications.listHidden | games |
| `gamesmanag_events_reset` | destructive | gamesManagement.events.reset | games |
| `gamesmanag_events_reset_all` | write | gamesManagement.events.resetAll | games |
| `gamesmanag_events_reset_all_for_all_pla` | write | gamesManagement.events.resetAllForAllPlayers | games |
| `gamesmanag_events_reset_for_all_players` | write | gamesManagement.events.resetForAllPlayers | games |
| `gamesmanag_events_reset_multiple_for_al` | write | gamesManagement.events.resetMultipleForAllPlayers | games |
| `gamesmanag_players_hide` | write | gamesManagement.players.hide | games |
| `gamesmanag_players_unhide` | destructive | gamesManagement.players.unhide | games |
| `gamesmanag_scores_reset` | destructive | gamesManagement.scores.reset | games |
| `gamesmanag_scores_reset_all` | write | gamesManagement.scores.resetAll | games |
| `gamesmanag_scores_reset_all_for_all_pla` | write | gamesManagement.scores.resetAllForAllPlayers | games |
| `gamesmanag_scores_reset_for_all_players` | write | gamesManagement.scores.resetForAllPlayers | games |
| `gamesmanag_scores_reset_multiple_for_al` | write | gamesManagement.scores.resetMultipleForAllPlayers | games |
| `playdevelo_anomalies_list` | read | playdeveloperreporting.anomalies.list | playdeveloperreporting |
| `playdevelo_apps_fetch_release_filter_op` | read | playdeveloperreporting.apps.fetchReleaseFilterOptions | playdeveloperreporting |
| `playdevelo_apps_search` | read | playdeveloperreporting.apps.search | playdeveloperreporting |
| `playdevelo_vitals_anonrssandswapm_query` | write | playdeveloperreporting.vitals.anonrssandswapmemoryusage.query | playdeveloperreporting |
| `playdevelo_vitals_anonrssandswapmem_get` | read | playdeveloperreporting.vitals.anonrssandswapmemoryusage.get | playdeveloperreporting |
| `playdevelo_vitals_anrrate_get` | read | playdeveloperreporting.vitals.anrrate.get | playdeveloperreporting |
| `playdevelo_vitals_anrrate_query` | write | playdeveloperreporting.vitals.anrrate.query | playdeveloperreporting |
| `playdevelo_vitals_bitmapmemoryusa_query` | write | playdeveloperreporting.vitals.bitmapmemoryusage.query | playdeveloperreporting |
| `playdevelo_vitals_bitmapmemoryusage_get` | read | playdeveloperreporting.vitals.bitmapmemoryusage.get | playdeveloperreporting |
| `playdevelo_vitals_crashrate_get` | read | playdeveloperreporting.vitals.crashrate.get | playdeveloperreporting |
| `playdevelo_vitals_crashrate_query` | write | playdeveloperreporting.vitals.crashrate.query | playdeveloperreporting |
| `playdevelo_vitals_errors_counts_get` | read | playdeveloperreporting.vitals.errors.counts.get | playdeveloperreporting |
| `playdevelo_vitals_errors_counts_query` | write | playdeveloperreporting.vitals.errors.counts.query | playdeveloperreporting |
| `playdevelo_vitals_errors_issues_search` | read | playdeveloperreporting.vitals.errors.issues.search | playdeveloperreporting |
| `playdevelo_vitals_errors_reports_search` | read | playdeveloperreporting.vitals.errors.reports.search | playdeveloperreporting |
| `playdevelo_vitals_excessivewakeup_query` | write | playdeveloperreporting.vitals.excessivewakeuprate.query | playdeveloperreporting |
| `playdevelo_vitals_excessivewakeupra_get` | read | playdeveloperreporting.vitals.excessivewakeuprate.get | playdeveloperreporting |
| `playdevelo_vitals_lmkrate_get` | read | playdeveloperreporting.vitals.lmkrate.get | playdeveloperreporting |
| `playdevelo_vitals_lmkrate_query` | write | playdeveloperreporting.vitals.lmkrate.query | playdeveloperreporting |
| `playdevelo_vitals_slowrenderingra_query` | write | playdeveloperreporting.vitals.slowrenderingrate.query | playdeveloperreporting |
| `playdevelo_vitals_slowrenderingrate_get` | read | playdeveloperreporting.vitals.slowrenderingrate.get | playdeveloperreporting |
| `playdevelo_vitals_slowstartrate_get` | read | playdeveloperreporting.vitals.slowstartrate.get | playdeveloperreporting |
| `playdevelo_vitals_slowstartrate_query` | write | playdeveloperreporting.vitals.slowstartrate.query | playdeveloperreporting |
| `playdevelo_vitals_stuckbackground_query` | write | playdeveloperreporting.vitals.stuckbackgroundwakelockrate.query | playdeveloperreporting |
| `playdevelo_vitals_stuckbackgroundwa_get` | read | playdeveloperreporting.vitals.stuckbackgroundwakelockrate.get | playdeveloperreporting |
| `playgroupi_apps_tokens_tags_create_or_u` | write | playgrouping.apps.tokens.tags.createOrUpdate | (none) |
| `playgroupi_apps_tokens_verify` | write | playgrouping.apps.tokens.verify | (none) |
| `playintegr_device_recall_write` | write | playintegrity.deviceRecall.write | playintegrity |
| `playintegr_v1_decode_integrity_token` | write | playintegrity.decodeIntegrityToken | playintegrity |
| `playintegr_v1_decode_pc_integrity_token` | write | playintegrity.decodePcIntegrityToken | playintegrity |
| `smartdevic_enterpri_structur_rooms_list` | read | smartdevicemanagement.enterprises.structures.rooms.list | sdm.service |
| `smartdevic_enterpri_structure_rooms_get` | read | smartdevicemanagement.enterprises.structures.rooms.get | sdm.service |
| `smartdevic_enterpris_devices_execute_co` | write | smartdevicemanagement.enterprises.devices.executeCommand | sdm.service |
| `smartdevic_enterprises_devices_get` | read | smartdevicemanagement.enterprises.devices.get | sdm.service |
| `smartdevic_enterprises_devices_list` | read | smartdevicemanagement.enterprises.devices.list | sdm.service |
| `smartdevic_enterprises_structures_get` | read | smartdevicemanagement.enterprises.structures.get | sdm.service |
| `smartdevic_enterprises_structures_list` | read | smartdevicemanagement.enterprises.structures.list | sdm.service |

## Gateway tools (3)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_call` | dynamic | Call an API method | (none) |
| `api_describe` | read | Describe an API method | (none) |
| `api_search` | read | Search API methods | (none) |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gplay: API methods | (none) |

## Generated APIs

- Google Play Android Developer API (`androidpublisher/v3`), 145 methods in the catalog
- Google Play Developer Reporting API (`playdeveloperreporting/v1beta1`), 25 methods in the catalog
- Google Play Games Services API (`games/v1`), 40 methods in the catalog
- Google Play Games Services Management API (`gamesManagement/v1management`), 18 methods in the catalog
- Google Play Games Services Publishing API (`gamesConfiguration/v1configuration`), 10 methods in the catalog
- Google Play EMM API (`androidenterprise/v1`), 77 methods in the catalog
- Android Device Provisioning Partner API (`androiddeviceprovisioning/v1`), 27 methods in the catalog
- Google Play Integrity API (`playintegrity/v1`), 3 methods in the catalog
- Google Play Grouping API (`playgrouping/v1alpha1`), 2 methods in the catalog
- Android Developer ID Status API (`androiddeveloperidstatus/v1`), 1 methods in the catalog
- Chrome Web Store API (`chromewebstore/v2`), 5 methods in the catalog
- Smart Device Management API (`smartdevicemanagement/v1`), 7 methods in the catalog

## Gateway APIs (reached through api_search, api_describe, api_call)

- Android Management API (`androidmanagement/v1`), 36 methods
- HomeGraph API (`homegraph/v1`), 5 methods
- Payments Reseller Subscription API (`paymentsresellersubscription/v1`), 14 methods
- Google Wallet API (`walletobjects/v1`), 99 methods
- Google Play Custom App Publishing API (`playcustomapp/v1`), 1 methods
- Chrome Web Store API (`chromewebstore/v1.1`), 4 methods
- Google Play Developer Reporting API (`playdeveloperreporting/v1alpha1`), 25 methods

