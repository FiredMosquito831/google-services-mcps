# Workspace Admin (`gadmin`)

Google Workspace administration: Cloud Identity, Chrome management and policy, Groups Settings, licensing, reports, alerts, Vault, reseller and Cloud Search admin.

- Plugin: `gadmin`, MCP server: `gadmin`, login: Service account with domain-wide delegation, then `setup-admin`
- Install: `claude plugin install gadmin@google-services-mcps`
- Tools: 366 total. Curated 19, per-method 343, gateway 3. Read 153, write 152, destructive 60, dynamic 1.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

## Curated tools (19)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `admin_domains_list` | read | List domains | admin.directory.domain, admin.directory.domain.readonly |
| `admin_group_create` | write | Create group | admin.directory.group |
| `admin_group_delete` | destructive | Delete group | admin.directory.group |
| `admin_group_get` | read | Get group | admin.directory.group, admin.directory.group.readonly |
| `admin_group_member_add` | write | Add group member | admin.directory.group, admin.directory.group.member |
| `admin_group_members_list` | read | List group members | admin.directory.group, admin.directory.group.readonly |
| `admin_groups_list` | read | List groups | admin.directory.group, admin.directory.group.readonly |
| `admin_member_remove` | destructive | Remove group member | admin.directory.group, admin.directory.group.member |
| `admin_orgunit_create` | write | Create org unit | admin.directory.orgunit |
| `admin_orgunit_delete` | destructive | Delete org unit | admin.directory.orgunit |
| `admin_orgunit_get` | read | Get org unit | admin.directory.orgunit, admin.directory.orgunit.readonly |
| `admin_orgunit_update` | write | Update org unit | admin.directory.orgunit |
| `admin_orgunits_list` | read | List org units | admin.directory.orgunit, admin.directory.orgunit.readonly |
| `admin_user_create` | write | Create user | admin.directory.user |
| `admin_user_delete` | destructive | Delete user | admin.directory.user |
| `admin_user_get` | read | Get user | admin.directory.user, admin.directory.user.readonly |
| `admin_user_move_org_unit` | write | Move user to org unit | admin.directory.user |
| `admin_user_set_suspended` | write | Suspend or restore user | admin.directory.user |
| `admin_users_list` | read | List users | admin.directory.user, admin.directory.user.readonly |

## Per-method tools (343)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `admin_activities_list` | read | reports.activities.list | admin.reports.audit.readonly |
| `admin_activities_watch` | write | reports.activities.watch | admin.reports.audit.readonly |
| `admin_applications_get` | read | datatransfer.applications.get | admin.datatransfer, admin.datatransfer.readonly |
| `admin_applications_list` | read | datatransfer.applications.list | admin.datatransfer, admin.datatransfer.readonly |
| `admin_asps_delete` | destructive | directory.asps.delete | admin.directory.user.security |
| `admin_asps_get` | read | directory.asps.get | admin.directory.user.security |
| `admin_asps_list` | read | directory.asps.list | admin.directory.user.security |
| `admin_channels_stop_9bac` | destructive | admin.channels.stop | admin.directory.user, admin.directory.user.alias |
| `admin_channels_stop_9bac_2` | destructive | admin.channels.stop | admin.reports.audit.readonly |
| `admin_chromeosdevices_action` | write | directory.chromeosdevices.action | admin.directory.device.chromeos |
| `admin_chromeosdevices_get` | read | directory.chromeosdevices.get | admin.directory.device.chromeos, admin.directory.device.chromeos.readonly |
| `admin_chromeosdevices_list` | read | directory.chromeosdevices.list | admin.directory.device.chromeos, admin.directory.device.chromeos.readonly |
| `admin_chromeosdevices_move_devices_to` | write | directory.chromeosdevices.moveDevicesToOu | admin.directory.device.chromeos |
| `admin_chromeosdevices_patch` | write | directory.chromeosdevices.patch | admin.directory.device.chromeos |
| `admin_chromeosdevices_update` | write | directory.chromeosdevices.update | admin.directory.device.chromeos |
| `admin_custom_device_chrome_comman_get` | read | admin.customer.devices.chromeos.commands.get | admin.directory.device.chromeos, admin.directory.device.chromeos.readonly |
| `admin_custome_chrome_print_s_batch_cr` | write | admin.customers.chrome.printServers.batchCreatePrintServers | admin.chrome.printers |
| `admin_custome_chrome_print_s_batch_de` | write | admin.customers.chrome.printServers.batchDeletePrintServers | admin.chrome.printers |
| `admin_custome_chrome_printer_batch_cr` | write | admin.customers.chrome.printers.batchCreatePrinters | admin.chrome.printers |
| `admin_custome_chrome_printer_batch_de` | write | admin.customers.chrome.printers.batchDeletePrinters | admin.chrome.printers |
| `admin_custome_chrome_printer_list_pri` | read | admin.customers.chrome.printers.listPrinterModels | admin.chrome.printers, admin.chrome.printers.readonly |
| `admin_custome_devices_chromeo_batch_c` | write | admin.customer.devices.chromeos.batchChangeStatus | admin.directory.device.chromeos |
| `admin_custome_devices_chromeo_count_c` | read | admin.customer.devices.chromeos.countChromeOsDevices | admin.directory.device.chromeos, admin.directory.device.chromeos.readonly |
| `admin_custome_devices_chromeo_issue_c` | write | admin.customer.devices.chromeos.issueCommand | admin.directory.device.chromeos |
| `admin_customer_chrome_print_se_create` | write | admin.customers.chrome.printServers.create | admin.chrome.printers |
| `admin_customer_chrome_print_se_delete` | destructive | admin.customers.chrome.printServers.delete | admin.chrome.printers |
| `admin_customer_chrome_print_ser_patch` | write | admin.customers.chrome.printServers.patch | admin.chrome.printers |
| `admin_customer_chrome_printers_create` | write | admin.customers.chrome.printers.create | admin.chrome.printers |
| `admin_customer_chrome_printers_delete` | destructive | admin.customers.chrome.printers.delete | admin.chrome.printers |
| `admin_customer_usage_reports_get` | read | reports.customerUsageReports.get | admin.reports.usage.readonly |
| `admin_customers_chrome_print_ser_list` | read | admin.customers.chrome.printServers.list | admin.chrome.printers, admin.chrome.printers.readonly |
| `admin_customers_chrome_print_serv_get` | read | admin.customers.chrome.printServers.get | admin.chrome.printers, admin.chrome.printers.readonly |
| `admin_customers_chrome_printers_get` | read | admin.customers.chrome.printers.get | admin.chrome.printers, admin.chrome.printers.readonly |
| `admin_customers_chrome_printers_list` | read | admin.customers.chrome.printers.list | admin.chrome.printers, admin.chrome.printers.readonly |
| `admin_customers_chrome_printers_patch` | write | admin.customers.chrome.printers.patch | admin.chrome.printers |
| `admin_customers_get` | read | directory.customers.get | admin.directory.customer, admin.directory.customer.readonly |
| `admin_customers_patch` | write | directory.customers.patch | admin.directory.customer |
| `admin_customers_update` | write | directory.customers.update | admin.directory.customer |
| `admin_domain_aliases_delete` | destructive | directory.domainAliases.delete | admin.directory.domain |
| `admin_domain_aliases_get` | read | directory.domainAliases.get | admin.directory.domain, admin.directory.domain.readonly |
| `admin_domain_aliases_insert` | write | directory.domainAliases.insert | admin.directory.domain |
| `admin_domain_aliases_list` | read | directory.domainAliases.list | admin.directory.domain, admin.directory.domain.readonly |
| `admin_domains_delete` | destructive | directory.domains.delete | admin.directory.domain |
| `admin_domains_get` | read | directory.domains.get | admin.directory.domain, admin.directory.domain.readonly |
| `admin_domains_insert` | write | directory.domains.insert | admin.directory.domain |
| `admin_domains_list_5673` | read | directory.domains.list | admin.directory.domain, admin.directory.domain.readonly |
| `admin_entity_usage_reports_get` | read | reports.entityUsageReports.get | admin.reports.usage.readonly |
| `admin_groups_aliases_delete` | destructive | directory.groups.aliases.delete | admin.directory.group |
| `admin_groups_aliases_insert` | write | directory.groups.aliases.insert | admin.directory.group |
| `admin_groups_aliases_list` | read | directory.groups.aliases.list | admin.directory.group, admin.directory.group.readonly |
| `admin_groups_delete` | destructive | directory.groups.delete | admin.directory.group |
| `admin_groups_get` | read | directory.groups.get | admin.directory.group, admin.directory.group.readonly |
| `admin_groups_insert` | write | directory.groups.insert | admin.directory.group |
| `admin_groups_list_20ea` | read | directory.groups.list | admin.directory.group, admin.directory.group.readonly |
| `admin_groups_patch` | write | directory.groups.patch | admin.directory.group |
| `admin_groups_update` | write | directory.groups.update | admin.directory.group |
| `admin_members_delete` | destructive | directory.members.delete | admin.directory.group, admin.directory.group.member |
| `admin_members_get` | read | directory.members.get | admin.directory.group, admin.directory.group.member |
| `admin_members_has_member` | read | directory.members.hasMember | admin.directory.group, admin.directory.group.member |
| `admin_members_insert` | write | directory.members.insert | admin.directory.group, admin.directory.group.member |
| `admin_members_list` | read | directory.members.list | admin.directory.group, admin.directory.group.member |
| `admin_members_patch` | write | directory.members.patch | admin.directory.group, admin.directory.group.member |
| `admin_members_update` | write | directory.members.update | admin.directory.group, admin.directory.group.member |
| `admin_mobiledevices_action` | write | directory.mobiledevices.action | admin.directory.device.mobile, admin.directory.device.mobile.action |
| `admin_mobiledevices_delete` | destructive | directory.mobiledevices.delete | admin.directory.device.mobile |
| `admin_mobiledevices_get` | read | directory.mobiledevices.get | admin.directory.device.mobile, admin.directory.device.mobile.action |
| `admin_mobiledevices_list` | read | directory.mobiledevices.list | admin.directory.device.mobile, admin.directory.device.mobile.action |
| `admin_orgunits_delete` | destructive | directory.orgunits.delete | admin.directory.orgunit |
| `admin_orgunits_get` | read | directory.orgunits.get | admin.directory.orgunit, admin.directory.orgunit.readonly |
| `admin_orgunits_insert` | write | directory.orgunits.insert | admin.directory.orgunit |
| `admin_orgunits_list_dd84` | read | directory.orgunits.list | admin.directory.orgunit, admin.directory.orgunit.readonly |
| `admin_orgunits_patch` | write | directory.orgunits.patch | admin.directory.orgunit |
| `admin_orgunits_update` | write | directory.orgunits.update | admin.directory.orgunit |
| `admin_privileges_list` | read | directory.privileges.list | admin.directory.rolemanagement, admin.directory.rolemanagement.readonly |
| `admin_resources_buildings_delete` | destructive | directory.resources.buildings.delete | admin.directory.resource.calendar |
| `admin_resources_buildings_get` | read | directory.resources.buildings.get | admin.directory.resource.calendar, admin.directory.resource.calendar.readonly |
| `admin_resources_buildings_insert` | write | directory.resources.buildings.insert | admin.directory.resource.calendar |
| `admin_resources_buildings_list` | read | directory.resources.buildings.list | admin.directory.resource.calendar, admin.directory.resource.calendar.readonly |
| `admin_resources_buildings_patch` | write | directory.resources.buildings.patch | admin.directory.resource.calendar |
| `admin_resources_buildings_update` | write | directory.resources.buildings.update | admin.directory.resource.calendar |
| `admin_resources_calendars_delete` | destructive | directory.resources.calendars.delete | admin.directory.resource.calendar |
| `admin_resources_calendars_get` | read | directory.resources.calendars.get | admin.directory.resource.calendar, admin.directory.resource.calendar.readonly |
| `admin_resources_calendars_insert` | write | directory.resources.calendars.insert | admin.directory.resource.calendar |
| `admin_resources_calendars_list` | read | directory.resources.calendars.list | admin.directory.resource.calendar, admin.directory.resource.calendar.readonly |
| `admin_resources_calendars_patch` | write | directory.resources.calendars.patch | admin.directory.resource.calendar |
| `admin_resources_calendars_update` | write | directory.resources.calendars.update | admin.directory.resource.calendar |
| `admin_resources_features_delete` | destructive | directory.resources.features.delete | admin.directory.resource.calendar |
| `admin_resources_features_get` | read | directory.resources.features.get | admin.directory.resource.calendar, admin.directory.resource.calendar.readonly |
| `admin_resources_features_insert` | write | directory.resources.features.insert | admin.directory.resource.calendar |
| `admin_resources_features_list` | read | directory.resources.features.list | admin.directory.resource.calendar, admin.directory.resource.calendar.readonly |
| `admin_resources_features_patch` | write | directory.resources.features.patch | admin.directory.resource.calendar |
| `admin_resources_features_rename` | write | directory.resources.features.rename | admin.directory.resource.calendar |
| `admin_resources_features_update` | write | directory.resources.features.update | admin.directory.resource.calendar |
| `admin_role_assignments_delete` | destructive | directory.roleAssignments.delete | admin.directory.rolemanagement |
| `admin_role_assignments_get` | read | directory.roleAssignments.get | admin.directory.rolemanagement, admin.directory.rolemanagement.readonly |
| `admin_role_assignments_insert` | write | directory.roleAssignments.insert | admin.directory.rolemanagement |
| `admin_role_assignments_list` | read | directory.roleAssignments.list | admin.directory.rolemanagement, admin.directory.rolemanagement.readonly |
| `admin_roles_delete` | destructive | directory.roles.delete | admin.directory.rolemanagement |
| `admin_roles_get` | read | directory.roles.get | admin.directory.rolemanagement, admin.directory.rolemanagement.readonly |
| `admin_roles_insert` | write | directory.roles.insert | admin.directory.rolemanagement |
| `admin_roles_list` | read | directory.roles.list | admin.directory.rolemanagement, admin.directory.rolemanagement.readonly |
| `admin_roles_patch` | write | directory.roles.patch | admin.directory.rolemanagement |
| `admin_roles_update` | write | directory.roles.update | admin.directory.rolemanagement |
| `admin_schemas_delete` | destructive | directory.schemas.delete | admin.directory.userschema |
| `admin_schemas_get` | read | directory.schemas.get | admin.directory.userschema, admin.directory.userschema.readonly |
| `admin_schemas_insert` | write | directory.schemas.insert | admin.directory.userschema |
| `admin_schemas_list` | read | directory.schemas.list | admin.directory.userschema, admin.directory.userschema.readonly |
| `admin_schemas_patch` | write | directory.schemas.patch | admin.directory.userschema |
| `admin_schemas_update` | write | directory.schemas.update | admin.directory.userschema |
| `admin_tokens_delete` | destructive | directory.tokens.delete | admin.directory.user.security |
| `admin_tokens_get` | read | directory.tokens.get | admin.directory.user.security |
| `admin_tokens_list` | read | directory.tokens.list | admin.directory.user.security |
| `admin_transfers_get` | read | datatransfer.transfers.get | admin.datatransfer, admin.datatransfer.readonly |
| `admin_transfers_insert` | write | datatransfer.transfers.insert | admin.datatransfer |
| `admin_transfers_list` | read | datatransfer.transfers.list | admin.datatransfer, admin.datatransfer.readonly |
| `admin_two_step_verification_turn_off` | write | directory.twoStepVerification.turnOff | admin.directory.user.security |
| `admin_user_usage_report_get` | read | reports.userUsageReport.get | admin.reports.usage.readonly |
| `admin_users_aliases_delete` | destructive | directory.users.aliases.delete | admin.directory.user, admin.directory.user.alias |
| `admin_users_aliases_insert` | write | directory.users.aliases.insert | admin.directory.user, admin.directory.user.alias |
| `admin_users_aliases_list` | read | directory.users.aliases.list | admin.directory.user, admin.directory.user.alias |
| `admin_users_aliases_watch` | write | directory.users.aliases.watch | admin.directory.user, admin.directory.user.alias |
| `admin_users_create_guest` | write | directory.users.createGuest | admin.directory.user |
| `admin_users_delete` | destructive | directory.users.delete | admin.directory.user |
| `admin_users_get` | read | directory.users.get | admin.directory.user, admin.directory.user.readonly |
| `admin_users_insert` | write | directory.users.insert | admin.directory.user |
| `admin_users_list_a3ea` | read | directory.users.list | admin.directory.user, admin.directory.user.readonly |
| `admin_users_make_admin` | write | directory.users.makeAdmin | admin.directory.user |
| `admin_users_patch` | write | directory.users.patch | admin.directory.user |
| `admin_users_photos_delete` | destructive | directory.users.photos.delete | admin.directory.user |
| `admin_users_photos_get` | read | directory.users.photos.get | admin.directory.user, admin.directory.user.readonly |
| `admin_users_photos_patch` | write | directory.users.photos.patch | admin.directory.user |
| `admin_users_photos_update` | write | directory.users.photos.update | admin.directory.user |
| `admin_users_sign_out` | write | directory.users.signOut | admin.directory.user.security |
| `admin_users_undelete` | write | directory.users.undelete | admin.directory.user |
| `admin_users_update` | write | directory.users.update | admin.directory.user |
| `admin_users_watch` | write | directory.users.watch | admin.directory.user, admin.directory.user.readonly |
| `admin_verification_codes_generate` | write | directory.verificationCodes.generate | admin.directory.user.security |
| `admin_verification_codes_invalidate` | write | directory.verificationCodes.invalidate | admin.directory.user.security |
| `admin_verification_codes_list` | read | directory.verificationCodes.list | admin.directory.user.security |
| `alerts_alerts_batch_delete` | destructive | alertcenter.alerts.batchDelete | apps.alerts |
| `alerts_alerts_batch_undelete` | write | alertcenter.alerts.batchUndelete | apps.alerts |
| `alerts_alerts_delete` | destructive | alertcenter.alerts.delete | apps.alerts |
| `alerts_alerts_feedback_create` | write | alertcenter.alerts.feedback.create | apps.alerts |
| `alerts_alerts_feedback_list` | read | alertcenter.alerts.feedback.list | apps.alerts |
| `alerts_alerts_get` | read | alertcenter.alerts.get | apps.alerts |
| `alerts_alerts_get_metadata` | read | alertcenter.alerts.getMetadata | apps.alerts |
| `alerts_alerts_list` | read | alertcenter.alerts.list | apps.alerts |
| `alerts_alerts_undelete` | write | alertcenter.alerts.undelete | apps.alerts |
| `alerts_v1beta1_get_settings` | read | alertcenter.getSettings | apps.alerts |
| `alerts_v1beta1_update_settings` | write | alertcenter.updateSettings | apps.alerts |
| `chromepoli_cust_poli_group_batch_862a` | destructive | chromepolicy.customers.policies.groups.batchDelete | chrome.management.policy |
| `chromepoli_cust_poli_group_batch_c498` | write | chromepolicy.customers.policies.groups.batchModify | chrome.management.policy |
| `chromepoli_cust_poli_netwo_defin_020b` | write | chromepolicy.customers.policies.networks.defineNetwork | chrome.management.policy |
| `chromepoli_cust_poli_netwo_defin_84ef` | write | chromepolicy.customers.policies.networks.defineCertificate | chrome.management.policy |
| `chromepoli_cust_poli_netwo_remov_5af6` | write | chromepolicy.customers.policies.networks.removeNetwork | chrome.management.policy |
| `chromepoli_cust_poli_netwo_remov_dd3a` | write | chromepolicy.customers.policies.networks.removeCertificate | chrome.management.policy |
| `chromepoli_cust_poli_orgun_batch_74a0` | write | chromepolicy.customers.policies.orgunits.batchInherit | chrome.management.policy |
| `chromepoli_cust_poli_orgun_batch_aaa3` | write | chromepolicy.customers.policies.orgunits.batchModify | chrome.management.policy |
| `chromepoli_custo_polici_groups_list_g` | read | chromepolicy.customers.policies.groups.listGroupPriorityOrdering | chrome.management.policy, chrome.management.policy.readonly |
| `chromepoli_custo_polici_groups_update` | write | chromepolicy.customers.policies.groups.updateGroupPriorityOrdering | chrome.management.policy |
| `chromepoli_customers_policies_resolve` | write | chromepolicy.customers.policies.resolve | chrome.management.policy, chrome.management.policy.readonly |
| `chromepoli_customers_policy_sche_list` | read | chromepolicy.customers.policySchemas.list | chrome.management.policy, chrome.management.policy.readonly |
| `chromepoli_customers_policy_schem_get` | read | chromepolicy.customers.policySchemas.get | chrome.management.policy, chrome.management.policy.readonly |
| `cloudid_allowlisted_domains_create` | write | cloudidentity.allowlistedDomains.create | cloud-identity.allowlisteddomains |
| `cloudid_allowlisted_domains_delete` | destructive | cloudidentity.allowlistedDomains.delete | cloud-identity.allowlisteddomains |
| `cloudid_allowlisted_domains_get` | read | cloudidentity.allowlistedDomains.get | cloud-identity.allowlisteddomains, cloud-identity.allowlisteddomains.readonly |
| `cloudid_allowlisted_domains_list` | read | cloudidentity.allowlistedDomains.list | cloud-identity.allowlisteddomains, cloud-identity.allowlisteddomains.readonly |
| `cloudid_customers_userinvit_is_invita` | read | cloudidentity.customers.userinvitations.isInvitableUser | (none) |
| `cloudid_customers_userinvitati_cancel` | destructive | cloudidentity.customers.userinvitations.cancel | (none) |
| `cloudid_customers_userinvitation_list` | read | cloudidentity.customers.userinvitations.list | (none) |
| `cloudid_customers_userinvitation_send` | destructive | cloudidentity.customers.userinvitations.send | (none) |
| `cloudid_customers_userinvitations_get` | read | cloudidentity.customers.userinvitations.get | (none) |
| `cloudid_devices_cancel_wipe` | write | cloudidentity.devices.cancelWipe | cloud-identity.devices |
| `cloudid_devices_create` | write | cloudidentity.devices.create | cloud-identity.devices |
| `cloudid_devices_delete` | destructive | cloudidentity.devices.delete | cloud-identity.devices |
| `cloudid_devices_device_client_s_list` | read | cloudidentity.devices.deviceUsers.clientStates.list | cloud-identity.devices, cloud-identity.devices.readonly |
| `cloudid_devices_device_client_s_patch` | write | cloudidentity.devices.deviceUsers.clientStates.patch | cloud-identity.devices |
| `cloudid_devices_device_u_client_s_get` | read | cloudidentity.devices.deviceUsers.clientStates.get | cloud-identity.devices, cloud-identity.devices.readonly |
| `cloudid_devices_device_use_cancel_wip` | write | cloudidentity.devices.deviceUsers.cancelWipe | cloud-identity.devices |
| `cloudid_devices_device_users_approve` | write | cloudidentity.devices.deviceUsers.approve | cloud-identity.devices |
| `cloudid_devices_device_users_block` | write | cloudidentity.devices.deviceUsers.block | cloud-identity.devices |
| `cloudid_devices_device_users_delete` | destructive | cloudidentity.devices.deviceUsers.delete | cloud-identity.devices |
| `cloudid_devices_device_users_get` | read | cloudidentity.devices.deviceUsers.get | cloud-identity.devices, cloud-identity.devices.readonly |
| `cloudid_devices_device_users_list` | read | cloudidentity.devices.deviceUsers.list | cloud-identity.devices, cloud-identity.devices.readonly |
| `cloudid_devices_device_users_lookup` | read | cloudidentity.devices.deviceUsers.lookup | cloud-identity.devices.lookup |
| `cloudid_devices_device_users_wipe` | destructive | cloudidentity.devices.deviceUsers.wipe | cloud-identity.devices |
| `cloudid_devices_get` | read | cloudidentity.devices.get | cloud-identity.devices, cloud-identity.devices.readonly |
| `cloudid_devices_list` | read | cloudidentity.devices.list | cloud-identity.devices, cloud-identity.devices.readonly |
| `cloudid_devices_wipe` | destructive | cloudidentity.devices.wipe | cloud-identity.devices |
| `cloudid_groups_create` | write | cloudidentity.groups.create | cloud-identity.groups, cloud-platform |
| `cloudid_groups_delete` | destructive | cloudidentity.groups.delete | cloud-identity.groups, cloud-platform |
| `cloudid_groups_get` | read | cloudidentity.groups.get | cloud-identity.groups, cloud-identity.groups.readonly |
| `cloudid_groups_get_security_settings` | read | cloudidentity.groups.getSecuritySettings | cloud-identity.groups, cloud-identity.groups.readonly |
| `cloudid_groups_list` | read | cloudidentity.groups.list | cloud-identity.groups, cloud-identity.groups.readonly |
| `cloudid_groups_lookup` | read | cloudidentity.groups.lookup | cloud-identity.groups, cloud-identity.groups.readonly |
| `cloudid_groups_membersh_search_t_0765` | read | cloudidentity.groups.memberships.searchTransitiveGroups | cloud-identity.groups, cloud-identity.groups.readonly |
| `cloudid_groups_membersh_search_t_50d2` | read | cloudidentity.groups.memberships.searchTransitiveMemberships | cloud-identity.groups, cloud-identity.groups.readonly |
| `cloudid_groups_membership_check_trans` | read | cloudidentity.groups.memberships.checkTransitiveMembership | cloud-identity.groups, cloud-identity.groups.readonly |
| `cloudid_groups_membership_get_members` | read | cloudidentity.groups.memberships.getMembershipGraph | cloud-identity.groups, cloud-identity.groups.readonly |
| `cloudid_groups_membership_modify_memb` | write | cloudidentity.groups.memberships.modifyMembershipRoles | cloud-identity.groups, cloud-platform |
| `cloudid_groups_membership_search_dire` | read | cloudidentity.groups.memberships.searchDirectGroups | cloud-identity.groups, cloud-identity.groups.readonly |
| `cloudid_groups_memberships_create` | write | cloudidentity.groups.memberships.create | cloud-identity.groups, cloud-platform |
| `cloudid_groups_memberships_delete` | destructive | cloudidentity.groups.memberships.delete | cloud-identity.groups, cloud-platform |
| `cloudid_groups_memberships_get` | read | cloudidentity.groups.memberships.get | cloud-identity.groups, cloud-identity.groups.readonly |
| `cloudid_groups_memberships_list` | read | cloudidentity.groups.memberships.list | cloud-identity.groups, cloud-identity.groups.readonly |
| `cloudid_groups_memberships_lookup` | read | cloudidentity.groups.memberships.lookup | cloud-identity.groups, cloud-identity.groups.readonly |
| `cloudid_groups_patch` | write | cloudidentity.groups.patch | cloud-identity.groups, cloud-platform |
| `cloudid_groups_search` | read | cloudidentity.groups.search | cloud-identity.groups, cloud-identity.groups.readonly |
| `cloudid_groups_update_security_settin` | write | cloudidentity.groups.updateSecuritySettings | cloud-identity.groups, cloud-platform |
| `cloudid_inbound_oidc_sso_profi_create` | write | cloudidentity.inboundOidcSsoProfiles.create | cloud-identity.inboundsso, cloud-platform |
| `cloudid_inbound_oidc_sso_profi_delete` | destructive | cloudidentity.inboundOidcSsoProfiles.delete | cloud-identity.inboundsso, cloud-platform |
| `cloudid_inbound_oidc_sso_profil_patch` | write | cloudidentity.inboundOidcSsoProfiles.patch | cloud-identity.inboundsso, cloud-platform |
| `cloudid_inbound_oidc_sso_profile_list` | read | cloudidentity.inboundOidcSsoProfiles.list | cloud-identity.inboundsso, cloud-identity.inboundsso.readonly |
| `cloudid_inbound_oidc_sso_profiles_get` | read | cloudidentity.inboundOidcSsoProfiles.get | cloud-identity.inboundsso, cloud-identity.inboundsso.readonly |
| `cloudid_inbound_sa_idp_credent_delete` | destructive | cloudidentity.inboundSamlSsoProfiles.idpCredentials.delete | cloud-identity.inboundsso, cloud-platform |
| `cloudid_inbound_sam_idp_credenti_list` | read | cloudidentity.inboundSamlSsoProfiles.idpCredentials.list | cloud-identity.inboundsso, cloud-identity.inboundsso.readonly |
| `cloudid_inbound_saml_idp_credenti_add` | write | cloudidentity.inboundSamlSsoProfiles.idpCredentials.add | cloud-identity.inboundsso, cloud-platform |
| `cloudid_inbound_saml_idp_credenti_get` | read | cloudidentity.inboundSamlSsoProfiles.idpCredentials.get | cloud-identity.inboundsso, cloud-identity.inboundsso.readonly |
| `cloudid_inbound_saml_sso_profi_create` | write | cloudidentity.inboundSamlSsoProfiles.create | cloud-identity.inboundsso, cloud-platform |
| `cloudid_inbound_saml_sso_profi_delete` | destructive | cloudidentity.inboundSamlSsoProfiles.delete | cloud-identity.inboundsso, cloud-platform |
| `cloudid_inbound_saml_sso_profil_patch` | write | cloudidentity.inboundSamlSsoProfiles.patch | cloud-identity.inboundsso, cloud-platform |
| `cloudid_inbound_saml_sso_profile_list` | read | cloudidentity.inboundSamlSsoProfiles.list | cloud-identity.inboundsso, cloud-identity.inboundsso.readonly |
| `cloudid_inbound_saml_sso_profiles_get` | read | cloudidentity.inboundSamlSsoProfiles.get | cloud-identity.inboundsso, cloud-identity.inboundsso.readonly |
| `cloudid_inbound_sso_assignment_create` | write | cloudidentity.inboundSsoAssignments.create | cloud-identity.inboundsso, cloud-platform |
| `cloudid_inbound_sso_assignment_delete` | destructive | cloudidentity.inboundSsoAssignments.delete | cloud-identity.inboundsso, cloud-platform |
| `cloudid_inbound_sso_assignments_get` | read | cloudidentity.inboundSsoAssignments.get | cloud-identity.inboundsso, cloud-identity.inboundsso.readonly |
| `cloudid_inbound_sso_assignments_list` | read | cloudidentity.inboundSsoAssignments.list | cloud-identity.inboundsso, cloud-identity.inboundsso.readonly |
| `cloudid_inbound_sso_assignments_patch` | write | cloudidentity.inboundSsoAssignments.patch | cloud-identity.inboundsso, cloud-platform |
| `cloudid_policies_create` | write | cloudidentity.policies.create | cloud-identity.policies |
| `cloudid_policies_delete` | destructive | cloudidentity.policies.delete | cloud-identity.policies |
| `cloudid_policies_get` | read | cloudidentity.policies.get | cloud-identity.policies, cloud-identity.policies.readonly |
| `cloudid_policies_list` | read | cloudidentity.policies.list | cloud-identity.policies, cloud-identity.policies.readonly |
| `cloudid_policies_patch` | write | cloudidentity.policies.patch | cloud-identity.policies |
| `cloudsearc_debu_data_items_unmap_list` | read | cloudsearch.debug.datasources.items.unmappedids.list | cloud_search, cloud_search.debug |
| `cloudsearc_debug_dataso_items_check_a` | read | cloudsearch.debug.datasources.items.checkAccess | cloud_search, cloud_search.debug |
| `cloudsearc_debug_datasou_items_search` | read | cloudsearch.debug.datasources.items.searchByViewUrl | cloud_search, cloud_search.debug |
| `cloudsearc_debug_identi_items_list_fo` | read | cloudsearch.debug.identitysources.items.listForunmappedidentity | cloud_search, cloud_search.debug |
| `cloudsearc_debug_identit_unmappe_list` | read | cloudsearch.debug.identitysources.unmappedids.list | cloud_search, cloud_search.debug |
| `cloudsearc_inde_data_items_delet_3223` | write | cloudsearch.indexing.datasources.items.deleteQueueItems | cloud_search, cloud_search.indexing |
| `cloudsearc_inde_data_items_delet_8e25` | destructive | cloudsearch.indexing.datasources.items.delete | cloud_search, cloud_search.indexing |
| `cloudsearc_indexi_dataso_items_unrese` | write | cloudsearch.indexing.datasources.items.unreserve | cloud_search, cloud_search.indexing |
| `cloudsearc_indexi_dataso_items_upload` | write | cloudsearch.indexing.datasources.items.upload | cloud_search, cloud_search.indexing |
| `cloudsearc_indexi_datasou_items_index` | write | cloudsearch.indexing.datasources.items.index | cloud_search, cloud_search.indexing |
| `cloudsearc_indexin_datasou_items_list` | read | cloudsearch.indexing.datasources.items.list | cloud_search, cloud_search.indexing |
| `cloudsearc_indexin_datasou_items_poll` | write | cloudsearch.indexing.datasources.items.poll | cloud_search, cloud_search.indexing |
| `cloudsearc_indexin_datasou_items_push` | write | cloudsearch.indexing.datasources.items.push | cloud_search, cloud_search.indexing |
| `cloudsearc_indexin_datasour_items_get` | read | cloudsearch.indexing.datasources.items.get | cloud_search, cloud_search.indexing |
| `cloudsearc_indexing_datasour_delete_s` | destructive | cloudsearch.indexing.datasources.deleteSchema | cloud_search, cloud_search.settings |
| `cloudsearc_indexing_datasour_get_sche` | read | cloudsearch.indexing.datasources.getSchema | cloud_search, cloud_search.settings |
| `cloudsearc_indexing_datasour_update_s` | write | cloudsearch.indexing.datasources.updateSchema | cloud_search, cloud_search.settings |
| `cloudsearc_operations_get` | read | cloudsearch.operations.get | cloud_search, cloud_search.debug |
| `cloudsearc_operations_lro_list` | read | cloudsearch.operations.lro.list | cloud_search, cloud_search.debug |
| `cloudsearc_query_remove_activity` | write | cloudsearch.query.removeActivity | cloud_search, cloud_search.query |
| `cloudsearc_query_search` | read | cloudsearch.query.search | cloud_search, cloud_search.query |
| `cloudsearc_query_sources_list` | read | cloudsearch.query.sources.list | cloud_search, cloud_search.query |
| `cloudsearc_query_suggest` | write | cloudsearch.query.suggest | cloud_search, cloud_search.query |
| `cloudsearc_settings_datasource_create` | write | cloudsearch.settings.datasources.create | cloud_search, cloud_search.settings |
| `cloudsearc_settings_datasource_delete` | destructive | cloudsearch.settings.datasources.delete | cloud_search, cloud_search.settings |
| `cloudsearc_settings_datasource_update` | write | cloudsearch.settings.datasources.update | cloud_search, cloud_search.settings |
| `cloudsearc_settings_datasources_get` | read | cloudsearch.settings.datasources.get | cloud_search, cloud_search.settings |
| `cloudsearc_settings_datasources_list` | read | cloudsearch.settings.datasources.list | cloud_search, cloud_search.settings |
| `cloudsearc_settings_datasources_patch` | write | cloudsearch.settings.datasources.patch | cloud_search, cloud_search.settings |
| `cloudsearc_settings_get_customer` | read | cloudsearch.settings.getCustomer | cloud_search, cloud_search.settings |
| `cloudsearc_settings_searchappl_create` | write | cloudsearch.settings.searchapplications.create | cloud_search, cloud_search.settings |
| `cloudsearc_settings_searchappl_delete` | destructive | cloudsearch.settings.searchapplications.delete | cloud_search, cloud_search.settings |
| `cloudsearc_settings_searchappl_update` | write | cloudsearch.settings.searchapplications.update | cloud_search, cloud_search.settings |
| `cloudsearc_settings_searchappli_patch` | write | cloudsearch.settings.searchapplications.patch | cloud_search, cloud_search.settings |
| `cloudsearc_settings_searchappli_reset` | destructive | cloudsearch.settings.searchapplications.reset | cloud_search, cloud_search.settings |
| `cloudsearc_settings_searchapplic_list` | read | cloudsearch.settings.searchapplications.list | cloud_search, cloud_search.settings |
| `cloudsearc_settings_searchapplica_get` | read | cloudsearch.settings.searchapplications.get | cloud_search, cloud_search.settings |
| `cloudsearc_settings_update_customer` | write | cloudsearch.settings.updateCustomer | cloud_search, cloud_search.settings |
| `cloudsearc_stats_get_index` | read | cloudsearch.stats.getIndex | cloud_search, cloud_search.stats |
| `cloudsearc_stats_get_query` | read | cloudsearch.stats.getQuery | cloud_search, cloud_search.stats |
| `cloudsearc_stats_get_searchapplicatio` | read | cloudsearch.stats.getSearchapplication | cloud_search, cloud_search.stats |
| `cloudsearc_stats_get_session` | read | cloudsearch.stats.getSession | cloud_search, cloud_search.stats |
| `cloudsearc_stats_get_user` | read | cloudsearch.stats.getUser | cloud_search, cloud_search.stats |
| `cloudsearc_stats_index_datasource_get` | read | cloudsearch.stats.index.datasources.get | cloud_search, cloud_search.stats |
| `cloudsearc_stats_query_searchappl_get` | read | cloudsearch.stats.query.searchapplications.get | cloud_search, cloud_search.stats |
| `cloudsearc_stats_session_searchap_get` | read | cloudsearch.stats.session.searchapplications.get | cloud_search, cloud_search.stats |
| `cloudsearc_stats_user_searchappli_get` | read | cloudsearch.stats.user.searchapplications.get | cloud_search, cloud_search.stats |
| `cloudsearc_v1_initialize_customer` | write | cloudsearch.initializeCustomer | cloud_search, cloud_search.settings |
| `groupset_groups_get` | read | groupsSettings.groups.get | apps.groups.settings |
| `groupset_groups_patch` | write | groupsSettings.groups.patch | apps.groups.settings |
| `groupset_groups_update` | write | groupsSettings.groups.update | apps.groups.settings |
| `license_license_ass_list_for_pro_17d9` | read | licensing.licenseAssignments.listForProduct | apps.licensing |
| `license_license_ass_list_for_pro_9489` | read | licensing.licenseAssignments.listForProductAndSku | apps.licensing |
| `license_license_assignments_delete` | destructive | licensing.licenseAssignments.delete | apps.licensing |
| `license_license_assignments_get` | read | licensing.licenseAssignments.get | apps.licensing |
| `license_license_assignments_insert` | write | licensing.licenseAssignments.insert | apps.licensing |
| `license_license_assignments_patch` | write | licensing.licenseAssignments.patch | apps.licensing |
| `license_license_assignments_update` | write | licensing.licenseAssignments.update | apps.licensing |
| `reseller_customers_get` | read | reseller.customers.get | apps.order, apps.order.readonly |
| `reseller_customers_insert` | write | reseller.customers.insert | apps.order |
| `reseller_customers_patch` | write | reseller.customers.patch | apps.order |
| `reseller_customers_update` | write | reseller.customers.update | apps.order |
| `reseller_resellernotif_getwatchdetail` | read | reseller.resellernotify.getwatchdetails | apps.order, apps.order.readonly |
| `reseller_resellernotify_register` | write | reseller.resellernotify.register | apps.order |
| `reseller_resellernotify_unregister` | write | reseller.resellernotify.unregister | apps.order |
| `reseller_subscriptions_activate` | write | reseller.subscriptions.activate | apps.order |
| `reseller_subscriptions_change_plan` | write | reseller.subscriptions.changePlan | apps.order |
| `reseller_subscriptions_change_renewal` | write | reseller.subscriptions.changeRenewalSettings | apps.order |
| `reseller_subscriptions_change_seats` | write | reseller.subscriptions.changeSeats | apps.order |
| `reseller_subscriptions_delete` | destructive | reseller.subscriptions.delete | apps.order |
| `reseller_subscriptions_get` | read | reseller.subscriptions.get | apps.order, apps.order.readonly |
| `reseller_subscriptions_insert` | write | reseller.subscriptions.insert | apps.order |
| `reseller_subscriptions_list` | read | reseller.subscriptions.list | apps.order, apps.order.readonly |
| `reseller_subscriptions_start_paid_ser` | write | reseller.subscriptions.startPaidService | apps.order |
| `reseller_subscriptions_suspend` | destructive | reseller.subscriptions.suspend | apps.order |
| `vault_matters_add_permissions` | write | vault.matters.addPermissions | ediscovery |
| `vault_matters_close` | destructive | vault.matters.close | ediscovery |
| `vault_matters_count` | write | vault.matters.count | ediscovery |
| `vault_matters_create` | write | vault.matters.create | ediscovery |
| `vault_matters_delete` | destructive | vault.matters.delete | ediscovery |
| `vault_matters_exports_create` | write | vault.matters.exports.create | ediscovery |
| `vault_matters_exports_delete` | destructive | vault.matters.exports.delete | ediscovery |
| `vault_matters_exports_get` | read | vault.matters.exports.get | ediscovery, ediscovery.readonly |
| `vault_matters_exports_list` | read | vault.matters.exports.list | ediscovery, ediscovery.readonly |
| `vault_matters_get` | read | vault.matters.get | ediscovery, ediscovery.readonly |
| `vault_matters_holds_accounts_create` | write | vault.matters.holds.accounts.create | ediscovery |
| `vault_matters_holds_accounts_delete` | destructive | vault.matters.holds.accounts.delete | ediscovery |
| `vault_matters_holds_accounts_list` | read | vault.matters.holds.accounts.list | ediscovery, ediscovery.readonly |
| `vault_matters_holds_add_held_accounts` | write | vault.matters.holds.addHeldAccounts | ediscovery |
| `vault_matters_holds_create` | write | vault.matters.holds.create | ediscovery |
| `vault_matters_holds_delete` | destructive | vault.matters.holds.delete | ediscovery |
| `vault_matters_holds_get` | read | vault.matters.holds.get | ediscovery, ediscovery.readonly |
| `vault_matters_holds_list` | read | vault.matters.holds.list | ediscovery, ediscovery.readonly |
| `vault_matters_holds_remove_held_accou` | write | vault.matters.holds.removeHeldAccounts | ediscovery |
| `vault_matters_holds_update` | write | vault.matters.holds.update | ediscovery |
| `vault_matters_list` | read | vault.matters.list | ediscovery, ediscovery.readonly |
| `vault_matters_remove_permissions` | destructive | vault.matters.removePermissions | ediscovery |
| `vault_matters_reopen` | write | vault.matters.reopen | ediscovery |
| `vault_matters_saved_queries_create` | write | vault.matters.savedQueries.create | ediscovery |
| `vault_matters_saved_queries_delete` | destructive | vault.matters.savedQueries.delete | ediscovery |
| `vault_matters_saved_queries_get` | read | vault.matters.savedQueries.get | ediscovery, ediscovery.readonly |
| `vault_matters_saved_queries_list` | read | vault.matters.savedQueries.list | ediscovery, ediscovery.readonly |
| `vault_matters_undelete` | write | vault.matters.undelete | ediscovery |
| `vault_matters_update` | write | vault.matters.update | ediscovery |
| `vault_operations_cancel` | destructive | vault.operations.cancel | ediscovery |
| `vault_operations_delete` | destructive | vault.operations.delete | ediscovery |
| `vault_operations_get` | read | vault.operations.get | ediscovery, ediscovery.readonly |
| `vault_operations_list` | read | vault.operations.list | ediscovery, ediscovery.readonly |
| `verifiedac_challenge_generate` | write | verifiedaccess.challenge.generate | verifiedaccess |
| `verifiedac_challenge_verify` | write | verifiedaccess.challenge.verify | verifiedaccess |

## Gateway tools (3)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_call` | dynamic | Call an API method | (none) |
| `api_describe` | read | Describe an API method | (none) |
| `api_search` | read | Search API methods | (none) |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gadmin: API methods | (none) |

## Generated APIs

- Admin SDK API (`admin/reports_v1`), 6 methods in the catalog
- Google Workspace Alert Center API (`alertcenter/v1beta1`), 11 methods in the catalog
- Cloud Identity API (`cloudidentity/v1`), 70 methods in the catalog
- Chrome Policy API (`chromepolicy/v1`), 14 methods in the catalog
- Groups Settings API (`groupssettings/v1`), 3 methods in the catalog
- Google Vault API (`vault/v1`), 33 methods in the catalog
- Google Workspace Reseller API (`reseller/v1`), 17 methods in the catalog
- Enterprise License Manager API (`licensing/v1`), 7 methods in the catalog
- Chrome Verified Access API (`verifiedaccess/v2`), 2 methods in the catalog
- Cloud Search API (`cloudsearch/v1`), 49 methods in the catalog
- Admin SDK API (`admin/datatransfer_v1`), 5 methods in the catalog
- Admin SDK API (`admin/directory_v1`), 128 methods in the catalog

## Gateway APIs (reached through api_search, api_describe, api_call)

- Groups Migration API (`groupsmigration/v1`), 1 methods
- Chrome Management API (`chromemanagement/v1`), 70 methods
- Cloud Identity API (`cloudidentity/v1beta1`), 71 methods
- Chrome Verified Access API (`verifiedaccess/v1`), 2 methods

