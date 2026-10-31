// The destructive rule and the POST reads of 1.26.3 (spec 2026-10-30-adversarial-review, owner decisions 2 and 3).
//
// The rule (docs/SECURITY.md, CLAUDE.md): a method is destructive (it asks twice, and it asks even under confirmation
// destructive-only) when it (a) sends a message, invitation or notification to other people, (b) grants or changes
// sharing, permissions, roles, ownership or admin privilege, (c) disables a security control (2-step verification, SSO,
// keys), (d) wipes, resets or issues a command to a device, (e) publishes, deploys, commits a release or ends a live
// session, (f) moves money, (g) replaces or deletes whole content, (h) permanently destroys key material or held data.
// Everything else keeps its kind.
//
// Each entry is pinned in config/tool-kinds.json, given by both classifiers for every catalog version, carried by the
// built plugins (generated tools in tool-map.json, gateway methods in method-kinds.json), decided by the plugin's own
// hook, and seen by a running server. The curated tools follow the rule by their kind (chat_send_message) or per call
// (destructiveWhen: Calendar invitations, a published Classroom announcement, a Cloud Storage overwrite).
// Every test works in temp folders. No network call is made: the server children stub their HTTP layer and point any
// other request at a closed loopback port, and a declined approval sends nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const dist = (p) => new URL(`../dist/${p}`, import.meta.url).href;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const readJson = (...parts) => JSON.parse(readFileSync(join(ROOT, ...parts), 'utf8'));

const { classifyMethod } = await import(dist('core/discovery/methods.js'));
const { fallbackClassify } = await import(dist('cli/method-kinds.js'));
const { callKind } = await import(dist('core/tools.js'));
const { confirmationFooter } = await import(dist('core/policy.js'));
const { loadConfig } = await import(dist('core/config.js'));

const temps = [];
const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
test.after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

const kindsFile = readJson('config', 'tool-kinds.json');
const overrides = Object.fromEntries(Object.entries(kindsFile).filter(([key]) => key !== 'notes'));
const nameOf = (id) => id.slice(id.lastIndexOf('.') + 1);
const full = (plugin, tool) => `mcp__plugin_${plugin}_${plugin}__${tool}`;
const CREDENTIAL = /token|credential|secret|password|authoriz|key/i;
const catalog = readJson('data', 'catalog.json');

/**
 * The methods made destructive by the rule, by exact id. Per method: the rule part, the plugin that carries it, its
 * generated tool (or null), whether the plugin's gateway carries it, the catalog versions, and Google's words.
 */
const DESTRUCTIVE = [
  // (a) sends a message, invitation or notification to other people
  { id: 'chat.spaces.messages.create', rule: 'a', plugin: 'gchat', tool: 'chat_spaces_messages_create', gateway: false, versions: ['chat:v1'], evidence: 'Creates a message in a Google Chat space.' },
  { id: 'gmail.users.settings.forwardingAddresses.create', rule: 'a', plugin: 'gmail', tool: 'gmail_users_settings_forwarding_create', gateway: false, versions: ['gmail:v1'], evidence: 'If ownership verification is required, a message will be sent to the recipient' },
  { id: 'classroom.userProfiles.guardianInvitations.create', rule: 'a', plugin: 'gclassroom', tool: 'classroom_user_guardi_create', gateway: false, versions: ['classroom:v1'], evidence: 'Creates a guardian invitation, and sends an email to the guardian' },
  { id: 'classroom.invitations.create', rule: 'a', plugin: 'gclassroom', tool: 'classroom_invitations_create', gateway: false, versions: ['classroom:v1'], evidence: 'An invitation to join a course (role STUDENT, TEACHER or OWNER)' },
  // (b) grants or changes sharing, permissions, roles, ownership or admin privilege
  { id: 'drive.permissions.create', rule: 'b', plugin: 'gdrive', tool: 'drive_permissions_create', gateway: false, versions: ['drive:v3'], evidence: 'Creates a permission for a file or shared drive.' },
  { id: 'drive.permissions.insert', rule: 'b', plugin: 'gdrive', tool: null, gateway: true, versions: ['drive:v2'], evidence: 'Inserts a permission for a file or shared drive.' },
  { id: 'drive.permissions.patch', rule: 'b', plugin: 'gdrive', tool: null, gateway: true, versions: ['drive:v2'], evidence: 'Updates a permission using patch semantics.' },
  { id: 'drive.permissions.update', rule: 'b', plugin: 'gdrive', tool: 'drive_permissions_update', gateway: true, versions: ['drive:v2', 'drive:v3'], evidence: 'Updates a permission.' },
  { id: 'calendar.acl.insert', rule: 'b', plugin: 'gcalendar', tool: 'calendar_acl_insert', gateway: false, versions: ['calendar:v3'], evidence: 'Creates an access control rule.' },
  { id: 'calendar.acl.patch', rule: 'b', plugin: 'gcalendar', tool: 'calendar_acl_patch', gateway: false, versions: ['calendar:v3'], evidence: 'Updates an access control rule.' },
  { id: 'calendar.acl.update', rule: 'b', plugin: 'gcalendar', tool: 'calendar_acl_update', gateway: false, versions: ['calendar:v3'], evidence: 'Updates an access control rule.' },
  { id: 'calendar.calendars.transferOwnership', rule: 'b', plugin: 'gcalendar', tool: 'calendar_calendars_transfer_own', gateway: false, versions: ['calendar:v3'], evidence: 'Transfers a secondary calendar between users' },
  { id: 'keep.notes.permissions.batchCreate', rule: 'b', plugin: 'gtasks', tool: 'keep_notes_permissions_batch_create', gateway: false, versions: ['keep:v1'], evidence: 'Creates one or more permissions on the note.' },
  { id: 'tagmanager.accounts.user_permissions.create', rule: 'b', plugin: 'gtm', tool: 'tagmgr_accounts_user_permissions_create', gateway: false, versions: ['tagmanager:v2'], evidence: "Creates a user's Account & Container access." },
  { id: 'tagmanager.accounts.user_permissions.update', rule: 'b', plugin: 'gtm', tool: 'tagmgr_accounts_user_permissions_update', gateway: false, versions: ['tagmanager:v2'], evidence: "Updates a user's Account & Container access." },
  { id: 'tagmanager.accounts.permissions.create', rule: 'b', plugin: 'gtm', tool: null, gateway: true, versions: ['tagmanager:v1'], evidence: "Creates a user's Account & Container Permissions." },
  { id: 'tagmanager.accounts.permissions.update', rule: 'b', plugin: 'gtm', tool: null, gateway: true, versions: ['tagmanager:v1'], evidence: "Updates a user's Account & Container Permissions." },
  { id: 'mybusinessaccountmanagement.accounts.admins.create', rule: 'b', plugin: 'gbusiness', tool: 'mbaccount_account_admins_create', gateway: false, versions: ['mybusinessaccountmanagement:v1'], evidence: 'Invites the specified user to become an administrator for the specified account.' },
  { id: 'mybusinessaccountmanagement.accounts.admins.patch', rule: 'b', plugin: 'gbusiness', tool: 'mbaccount_accounts_admins_patch', gateway: false, versions: ['mybusinessaccountmanagement:v1'], evidence: 'Updates the Admin for the specified Account Admin.' },
  { id: 'mybusinessaccountmanagement.locations.admins.create', rule: 'b', plugin: 'gbusiness', tool: 'mbaccount_locatio_admins_create', gateway: false, versions: ['mybusinessaccountmanagement:v1'], evidence: 'Invites the specified user to become an administrator for the specified location.' },
  { id: 'mybusinessaccountmanagement.locations.admins.patch', rule: 'b', plugin: 'gbusiness', tool: 'mbaccount_location_admins_patch', gateway: false, versions: ['mybusinessaccountmanagement:v1'], evidence: 'Only the AdminRole of the Admin can be updated.' },
  { id: 'mybusinessaccountmanagement.locations.transfer', rule: 'b', plugin: 'gbusiness', tool: 'mbaccount_locations_transfer', gateway: false, versions: ['mybusinessaccountmanagement:v1'], evidence: 'Moves a location from an account that the user owns to another account' },
  { id: 'datatransfer.transfers.insert', rule: 'b', plugin: 'gadmin', tool: 'admin_transfers_insert', gateway: false, versions: ['admin:datatransfer_v1'], evidence: 'the transfer of the ownership of user data between users' },
  { id: 'directory.users.makeAdmin', rule: 'b', plugin: 'gadmin', tool: 'admin_users_make_admin', gateway: false, versions: ['admin:directory_v1'], evidence: 'Makes a user a super administrator.' },
  { id: 'directory.roleAssignments.insert', rule: 'b', plugin: 'gadmin', tool: 'admin_role_assignments_insert', gateway: false, versions: ['admin:directory_v1'], evidence: 'Creates a role assignment.' },
  { id: 'directory.roles.insert', rule: 'b', plugin: 'gadmin', tool: 'admin_roles_insert', gateway: false, versions: ['admin:directory_v1'], evidence: 'Creates a role.' },
  { id: 'directory.roles.patch', rule: 'b', plugin: 'gadmin', tool: 'admin_roles_patch', gateway: false, versions: ['admin:directory_v1'], evidence: 'Patches a role.' },
  { id: 'directory.roles.update', rule: 'b', plugin: 'gadmin', tool: 'admin_roles_update', gateway: false, versions: ['admin:directory_v1'], evidence: 'Updates a role.' },
  { id: 'gmail.users.settings.delegates.create', rule: 'b', plugin: 'gmail', tool: 'gmail_users_settings_delegates_create', gateway: false, versions: ['gmail:v1'], evidence: "Delegates can read, send, and delete messages, as well as view and add contacts, for the delegator's account." },
  { id: 'gmail.users.settings.updateAutoForwarding', rule: 'b', plugin: 'gmail', tool: 'gmail_users_settings_update_auto_forwar', gateway: false, versions: ['gmail:v1'], evidence: 'Whether all incoming mail is automatically forwarded to another address.' },
  { id: 'merchantapi.accounts.developerRegistration.unregisterGcp', rule: 'b', plugin: 'gmerchant', tool: 'merchantap_accoun_develo_unregi', gateway: true, versions: ['merchantapi:accounts_v1', 'merchantapi:accounts_v1beta'], evidence: 'Unregister the calling GCP from the calling shopping account.' },
  { id: 'merchantapi.accounts.homepage.unclaim', rule: 'b', plugin: 'gmerchant', tool: 'merchantap_accoun_homepa_unclai', gateway: true, versions: ['merchantapi:accounts_v1', 'merchantapi:accounts_v1beta'], evidence: "Unclaims a store's homepage." },
  { id: 'siteVerification.webResource.patch', rule: 'b', plugin: 'gsc', tool: 'siteverif_web_resource_patch', gateway: false, versions: ['siteVerification:v1'], evidence: 'Modify the list of owners for your website or domain.' },
  { id: 'siteVerification.webResource.update', rule: 'b', plugin: 'gsc', tool: 'siteverif_web_resource_update', gateway: false, versions: ['siteVerification:v1'], evidence: 'Modify the list of owners for your website or domain.' },
  { id: 'classroom.courses.courseWork.studentSubmissions.return', rule: 'b', plugin: 'gclassroom', tool: 'classroom_cour_cour_stud_retu', gateway: false, versions: ['classroom:v1'], evidence: 'Returning a student submission transfers ownership of attached Drive files to the student' },
  // (c) disables a security control
  { id: 'directory.twoStepVerification.turnOff', rule: 'c', plugin: 'gadmin', tool: 'admin_two_step_verification_turn_off', gateway: false, versions: ['admin:directory_v1'], evidence: 'Turns off 2-Step Verification for user.' },
  { id: 'cloudidentity.inboundSamlSsoProfiles.create', rule: 'c', plugin: 'gadmin', tool: 'cloudid_inbound_saml_sso_profi_create', gateway: true, versions: ['cloudidentity:v1', 'cloudidentity:v1beta1'], evidence: 'Creates an InboundSamlSsoProfile for a customer.' },
  { id: 'cloudidentity.inboundSamlSsoProfiles.patch', rule: 'c', plugin: 'gadmin', tool: 'cloudid_inbound_saml_sso_profil_patch', gateway: true, versions: ['cloudidentity:v1', 'cloudidentity:v1beta1'], evidence: 'Updates an InboundSamlSsoProfile.' },
  { id: 'cloudidentity.inboundSamlSsoProfiles.idpCredentials.add', rule: 'c', plugin: 'gadmin', tool: 'cloudid_inbound_saml_idp_credenti_add', gateway: true, versions: ['cloudidentity:v1', 'cloudidentity:v1beta1'], evidence: 'Adds an IdpCredential. Up to 2 credentials are allowed.' },
  { id: 'cloudidentity.inboundOidcSsoProfiles.create', rule: 'c', plugin: 'gadmin', tool: 'cloudid_inbound_oidc_sso_profi_create', gateway: true, versions: ['cloudidentity:v1', 'cloudidentity:v1beta1'], evidence: 'Creates an InboundOidcSsoProfile for a customer.' },
  { id: 'cloudidentity.inboundOidcSsoProfiles.patch', rule: 'c', plugin: 'gadmin', tool: 'cloudid_inbound_oidc_sso_profil_patch', gateway: true, versions: ['cloudidentity:v1', 'cloudidentity:v1beta1'], evidence: 'Updates an InboundOidcSsoProfile.' },
  { id: 'cloudidentity.inboundSsoAssignments.create', rule: 'c', plugin: 'gadmin', tool: 'cloudid_inbound_sso_assignment_create', gateway: true, versions: ['cloudidentity:v1', 'cloudidentity:v1beta1'], evidence: 'To disable SSO, Create (or Update) an assignment that has `sso_mode` == `SSO_OFF`.' },
  { id: 'cloudidentity.inboundSsoAssignments.patch', rule: 'c', plugin: 'gadmin', tool: 'cloudid_inbound_sso_assignments_patch', gateway: true, versions: ['cloudidentity:v1', 'cloudidentity:v1beta1'], evidence: 'Updates an InboundSsoAssignment.' },
  // (d) wipes, resets or issues a command to a device
  { id: 'directory.mobiledevices.action', rule: 'd', plugin: 'gadmin', tool: 'admin_mobiledevices_action', gateway: false, versions: ['admin:directory_v1'], evidence: 'Takes an action that affects a mobile device. For example, remotely wiping a device.' },
  { id: 'directory.chromeosdevices.action', rule: 'd', plugin: 'gadmin', tool: 'admin_chromeosdevices_action', gateway: false, versions: ['admin:directory_v1'], evidence: 'This includes deprovisioning, disabling, and re-enabling devices.' },
  { id: 'admin.customer.devices.chromeos.batchChangeStatus', rule: 'd', plugin: 'gadmin', tool: 'admin_custome_devices_chromeo_batch_c', gateway: false, versions: ['admin:directory_v1'], evidence: 'Changes the status of a batch of ChromeOS devices.' },
  { id: 'admin.customer.devices.chromeos.issueCommand', rule: 'd', plugin: 'gadmin', tool: 'admin_custome_devices_chromeo_issue_c', gateway: false, versions: ['admin:directory_v1'], evidence: 'Issues a command for the device to execute. (REMOTE_POWERWASH: Wipes the device by performing a power wash)' },
  { id: 'androidmanagement.enterprises.devices.issueCommand', rule: 'd', plugin: 'gplay', tool: null, gateway: true, versions: ['androidmanagement:v1'], evidence: 'Issues a command to a device.' },
  // (e) publishes, deploys, commits a release or ends a live session
  { id: 'tagmanager.accounts.containers.versions.publish', rule: 'e', plugin: 'gtm', tool: 'tagmgr_accounts_containers_versions_publish', gateway: true, versions: ['tagmanager:v1', 'tagmanager:v2'], evidence: 'Publishes a Container Version.' },
  { id: 'androidpublisher.edits.commit', rule: 'e', plugin: 'gplay', tool: 'androidpub_edits_commit', gateway: false, versions: ['androidpublisher:v3'], evidence: 'Commits an app edit.' },
  { id: 'youtube.liveBroadcasts.transition', rule: 'e', plugin: 'gyoutube', tool: 'youtube_live_broadcast_transition', gateway: false, versions: ['youtube:v3'], evidence: 'Transition a broadcast to a given status. (complete: The broadcast is finished.)' },
  { id: 'meet.spaces.endActiveConference', rule: 'e', plugin: 'gmeet', tool: 'meet_spaces_end_active_conference', gateway: false, versions: ['meet:v2'], evidence: "Ends an active conference (if there's one)." },
  // (f) moves money
  { id: 'androidpublisher.orders.refund', rule: 'f', plugin: 'gplay', tool: 'androidpub_orders_refund', gateway: false, versions: ['androidpublisher:v3'], evidence: "Refunds a user's subscription or in-app purchase order." },
  { id: 'androidpublisher.externaltransactions.refundexternaltransaction', rule: 'f', plugin: 'gplay', tool: 'androidpub_externaltrans_refundexternal', gateway: false, versions: ['androidpublisher:v3'], evidence: 'Refunds or partially refunds an existing external transaction.' },
  { id: 'androidpublisher.monetization.subscriptions.basePlans.migratePrices', rule: 'f', plugin: 'gplay', tool: 'androidpub_moneti_subscr_base_p_migrate', gateway: false, versions: ['androidpublisher:v3'], evidence: 'Requests result in Google Play notifying affected subscribers.' },
  { id: 'androidpublisher.monetization.subscriptions.basePlans.batchMigratePrices', rule: 'f', plugin: 'gplay', tool: 'androidpub_moneti_subscr_base_p_batch_m', gateway: false, versions: ['androidpublisher:v3'], evidence: 'Batch variant of the MigrateBasePlanPrices endpoint.' },
  { id: 'reseller.subscriptions.changeSeats', rule: 'f', plugin: 'gadmin', tool: 'reseller_subscriptions_change_seats', gateway: false, versions: ['reseller:v1'], evidence: "Updates a subscription's user license settings." },
  { id: 'reseller.subscriptions.insert', rule: 'f', plugin: 'gadmin', tool: 'reseller_subscriptions_insert', gateway: false, versions: ['reseller:v1'], evidence: 'Creates or transfer a subscription.' },
  // (g) replaces or deletes whole content
  { id: 'script.projects.updateContent', rule: 'g', plugin: 'gapps', tool: 'appsscript_projects_update_content', gateway: false, versions: ['script:v1'], evidence: 'This clears all the existing files in the project.' },
  { id: 'docs.documents.batchUpdate', rule: 'g', plugin: 'gdrive', tool: 'docs_documents_batch_update', gateway: false, versions: ['docs:v1'], evidence: 'Applies one or more updates to the document. (DeleteContentRangeRequest)' },
  { id: 'sheets.spreadsheets.batchUpdate', rule: 'g', plugin: 'gdrive', tool: 'sheets_spreadsheets_batch_update', gateway: false, versions: ['sheets:v4'], evidence: 'Applies one or more updates to the spreadsheet. (DeleteSheetRequest)' },
  { id: 'slides.presentations.batchUpdate', rule: 'g', plugin: 'gdrive', tool: 'slides_presentations_batch_update', gateway: false, versions: ['slides:v1'], evidence: 'Applies one or more updates to the presentation. (DeleteObjectRequest)' },
  { id: 'youtube.videos.update', rule: 'g', plugin: 'gyoutube', tool: 'youtube_videos_update', gateway: false, versions: ['youtube:v3'], evidence: "a property that already has a value, the property's existing value will be deleted" },
  { id: 'tagmanager.accounts.containers.workspaces.create_version', rule: 'g', plugin: 'gtm', tool: 'tagmgr_accounts_containe_workspac_create_ve', gateway: false, versions: ['tagmanager:v2'], evidence: 'Creates a Container Version from the entities present in the workspace, deletes the workspace' },
  // (h) permanently destroys key material or held data
  { id: 'gmail.users.settings.cse.keypairs.obliterate', rule: 'h', plugin: 'gmail', tool: 'gmail_users_setting_cse_keypair_obliter', gateway: false, versions: ['gmail:v1'], evidence: 'Deletes a client-side encryption key pair permanently and immediately.' },
  { id: 'vault.matters.holds.removeHeldAccounts', rule: 'h', plugin: 'gadmin', tool: 'vault_matters_holds_remove_held_accou', gateway: false, versions: ['vault:v1'], evidence: 'Removes the specified accounts from a hold.' },
];

/** POST methods that only read or compute and change nothing: reads, by exact id. */
const POST_READS = [
  ...['anonrssandswapmemoryusage', 'anrrate', 'bitmapmemoryusage', 'crashrate', 'errors.counts', 'excessivewakeuprate', 'lmkrate', 'slowrenderingrate', 'slowstartrate', 'stuckbackgroundwakelockrate'].map((set) => ({
    id: `playdeveloperreporting.vitals.${set}.query`,
    plugin: 'gplay',
    tool: {
      anonrssandswapmemoryusage: 'playdevelo_vitals_anonrssandswapm_query',
      anrrate: 'playdevelo_vitals_anrrate_query',
      bitmapmemoryusage: 'playdevelo_vitals_bitmapmemoryusa_query',
      crashrate: 'playdevelo_vitals_crashrate_query',
      'errors.counts': 'playdevelo_vitals_errors_counts_query',
      excessivewakeuprate: 'playdevelo_vitals_excessivewakeup_query',
      lmkrate: 'playdevelo_vitals_lmkrate_query',
      slowrenderingrate: 'playdevelo_vitals_slowrenderingra_query',
      slowstartrate: 'playdevelo_vitals_slowstartrate_query',
      stuckbackgroundwakelockrate: 'playdevelo_vitals_stuckbackground_query',
    }[set],
    gateway: true,
    versions: ['playdeveloperreporting:v1alpha1', 'playdeveloperreporting:v1beta1'],
    evidence: 'Queries the metrics in the metric set.',
  })),
  { id: 'googleads.customers.generateReachForecast', plugin: 'gads', tool: null, gateway: true, versions: ['googleads:v26'], evidence: 'Generates a reach forecast for a given targeting / product mix.' },
  { id: 'googleads.customers.suggestBrands', plugin: 'gads', tool: null, gateway: true, versions: ['googleads:v26'], evidence: 'Rpc to return a list of matching brands based on a prefix for this customer.' },
  { id: 'googleads.customers.suggestSmartCampaignAd', plugin: 'gads', tool: null, gateway: true, versions: ['googleads:v26'], evidence: 'Suggests a Smart campaign ad compatible with the Ad family of resources' },
  { id: 'googleads.customers.suggestSmartCampaignBudgetOptions', plugin: 'gads', tool: null, gateway: true, versions: ['googleads:v26'], evidence: 'Returns BudgetOption suggestions.' },
  { id: 'googleads.customers.suggestTravelAssets', plugin: 'gads', tool: null, gateway: true, versions: ['googleads:v26'], evidence: 'Returns Travel Asset suggestions.' },
  { id: 'googleads.geoTargetConstants.suggest', plugin: 'gads', tool: 'googleads_geo_target_constants_suggest', gateway: true, versions: ['googleads:v26'], evidence: 'Returns GeoTargetConstant suggestions by location name or by resource name.' },
  { id: 'googleads.keywordThemeConstants.suggest', plugin: 'gads', tool: 'googleads_keyword_theme_constants_suggest', gateway: true, versions: ['googleads:v26'], evidence: 'Returns KeywordThemeConstant suggestions by keyword themes.' },
  { id: 'admob.accounts.networkReport.generate', plugin: 'gads', tool: 'admob_accounts_network_report_generate', gateway: true, versions: ['admob:v1', 'admob:v1beta'], evidence: 'Generates an AdMob Network report based on the provided report specification.' },
  { id: 'admob.accounts.mediationReport.generate', plugin: 'gads', tool: 'admob_accounts_mediation_report_generate', gateway: true, versions: ['admob:v1', 'admob:v1beta'], evidence: 'Generates an AdMob Mediation report based on the provided report specification.' },
  { id: 'admob.accounts.campaignReport.generate', plugin: 'gads', tool: null, gateway: true, versions: ['admob:v1beta'], evidence: 'Generates Campaign Report based on provided specifications.' },
  { id: 'driveactivity.activity.query', plugin: 'gdrive', tool: 'driveactiv_activity_query', gateway: false, versions: ['driveactivity:v2'], evidence: 'Query past activity in Google Drive.' },
  { id: 'areainsights.computeInsights', plugin: 'gmaps', tool: 'areainsigh_v1_compute_insights', gateway: false, versions: ['areainsights:v1'], evidence: 'This method lets you retrieve insights about areas' },
  { id: 'travelimpactmodel.flights.computeFlightEmissions', plugin: 'gmaps', tool: 'travelimpa_flights_compute_flight_emiss', gateway: false, versions: ['travelimpactmodel:v1'], evidence: 'Retrieves emission estimates.' },
  { id: 'travelimpactmodel.flights.computeTypicalFlightEmissions', plugin: 'gmaps', tool: 'travelimpa_flights_compute_typical_flig', gateway: false, versions: ['travelimpactmodel:v1'], evidence: 'Retrieves typical flight emissions estimates between two airports' },
  { id: 'travelimpactmodel.flights.computeScope3FlightEmissions', plugin: 'gmaps', tool: 'travelimpa_flights_compute_scope3_fligh', gateway: false, versions: ['travelimpactmodel:v1'], evidence: 'Retrieves GHG emissions estimates for a set of flight segments for Scope 3 reporting.' },
  { id: 'travelimpactmodel.flights.computeDetailedFlightEmissions', plugin: 'gmaps', tool: 'travelimpa_flights_compute_detailed_fli', gateway: false, versions: ['travelimpactmodel:v1'], evidence: 'Retrieves detailed emission estimates.' },
  { id: 'health.users.dataTypes.dataPoints.rollUp', plugin: 'gcontacts', tool: 'health_users_data_data_p_roll_u', gateway: true, versions: ['health:v4', 'health:v4beta'], evidence: 'Roll up data points over physical time intervals for supported data types.' },
  { id: 'health.users.dataTypes.dataPoints.dailyRollUp', plugin: 'gcontacts', tool: 'health_users_data_data_p_daily', gateway: true, versions: ['health:v4', 'health:v4beta'], evidence: 'Roll up data points over civil time intervals for supported data types.' },
  { id: 'safebrowsing.threatMatches.find', plugin: 'gsearch', tool: null, gateway: true, versions: ['safebrowsing:v4'], evidence: 'Finds the threat entries that match the Safe Browsing lists.' },
  { id: 'safebrowsing.fullHashes.find', plugin: 'gsearch', tool: null, gateway: true, versions: ['safebrowsing:v4'], evidence: 'Finds the full hashes that match the requested hash prefixes.' },
  { id: 'digitalassetlinks.assetlinks.bulkCheck', plugin: 'gsearch', tool: 'digitalass_assetlinks_bulk_check', gateway: false, versions: ['digitalassetlinks:v1'], evidence: 'Send a bundle of statement checks in a single RPC' },
  { id: 'tagmanager.accounts.containers.workspaces.folders.entities', plugin: 'gtm', tool: 'tagmgr_accoun_contai_worksp_folders_entitie', gateway: false, versions: ['tagmanager:v2'], evidence: 'List all entities in a GTM Folder.' },
  { id: 'merchantapi.issueresolution.renderaccountissues', plugin: 'gmerchant', tool: 'merchantap_issuereso_renderacco', gateway: true, versions: ['merchantapi:issueresolution_v1', 'merchantapi:issueresolution_v1beta'], evidence: 'This content and actions are meant to be rendered and shown in third-party applications.' },
  { id: 'merchantapi.issueresolution.renderproductissues', plugin: 'gmerchant', tool: 'merchantap_issuereso_renderprod', gateway: true, versions: ['merchantapi:issueresolution_v1', 'merchantapi:issueresolution_v1beta'], evidence: 'This content and actions are meant to be rendered and shown in third-party applications.' },
  { id: 'language.documents.annotateText', plugin: 'gai', tool: 'language_documents_annotate_text', gateway: true, versions: ['language:v1', 'language:v1beta2', 'language:v2'], evidence: 'provides all the features that analyzeSentiment, analyzeEntities, and analyzeSyntax provide in one call' },
  { id: 'language.documents.classifyText', plugin: 'gai', tool: 'language_documents_classify_text', gateway: true, versions: ['language:v1', 'language:v1beta2', 'language:v2'], evidence: 'Classifies a document into categories.' },
  { id: 'language.documents.moderateText', plugin: 'gai', tool: 'language_documents_moderate_text', gateway: true, versions: ['language:v1', 'language:v1beta2', 'language:v2'], evidence: 'Moderates a document for harmful and sensitive categories.' },
  ...['vision.images.annotate', 'vision.projects.images.annotate', 'vision.projects.locations.images.annotate'].map((id) => ({
    id,
    plugin: 'gai',
    tool: id.replace(/\./g, '_'),
    gateway: true,
    versions: ['vision:v1', 'vision:v1p1beta1', 'vision:v1p2beta1'],
    evidence: 'Run image detection and annotation for a batch of images.',
  })),
  ...['vision.files.annotate', 'vision.projects.files.annotate', 'vision.projects.locations.files.annotate'].map((id) => ({
    id,
    plugin: 'gai',
    tool: id.replace(/\./g, '_'),
    gateway: true,
    versions: ['vision:v1', 'vision:v1p1beta1', 'vision:v1p2beta1'],
    evidence: 'Service that performs image detection and annotation for a batch of files.',
  })),
  { id: 'speech.speech.recognize', plugin: 'gai', tool: 'speech_speech_recognize', gateway: true, versions: ['speech:v1', 'speech:v1p1beta1'], evidence: 'Performs synchronous speech recognition: receive results after all audio has been sent and processed.' },
  { id: 'texttospeech.text.synthesize', plugin: 'gai', tool: 'texttospee_text_synthesize', gateway: true, versions: ['texttospeech:v1', 'texttospeech:v1beta1'], evidence: 'Synthesizes speech synchronously: receive results after all text input has been processed.' },
];

/** GET methods that record an event: writes. */
const GET_WRITES = [
  { id: 'discoveryengine.projects.locations.collections.dataStores.userEvents.collect', plugin: 'gai', tool: 'discoverye_proj_locat_colle_data_user_colle', gateway: true, versions: ['discoveryengine:v1', 'discoveryengine:v1alpha', 'discoveryengine:v1beta'] },
  { id: 'discoveryengine.projects.locations.dataStores.userEvents.collect', plugin: 'gai', tool: 'discoverye_proje_locat_data_s_user_e_collec', gateway: true, versions: ['discoveryengine:v1', 'discoveryengine:v1alpha', 'discoveryengine:v1beta'] },
  { id: 'discoveryengine.projects.locations.userEvents.collect', plugin: 'gai', tool: 'discoverye_project_locatio_user_eve_collect', gateway: true, versions: ['discoveryengine:v1', 'discoveryengine:v1alpha', 'discoveryengine:v1beta'] },
  { id: 'recommendationengine.projects.locations.catalogs.eventStores.userEvents.collect', plugin: 'gai', tool: null, gateway: true, versions: ['recommendationengine:v1beta1'] },
].map((m) => ({ ...m, evidence: 'Writes a single user event from the browser.' }));

/**
 * The three Google Ads keyword methods. They were held back as writes because "Keyword" held "key", a credential
 * word. Since 1.41.3 a credential word is a whole word and "keyword" is not one, and since 1.41.4 they are reads by
 * the owner's decision of 2026-10-31 (Q1). tests/credential-reads.test.mjs checks them where they are used.
 */
const KEYWORD_READS = ['googleads.customers.generateKeywordIdeas', 'googleads.customers.generateKeywordHistoricalMetrics', 'googleads.customers.suggestKeywordThemes'];

const ALL = [...DESTRUCTIVE.map((m) => ({ ...m, kind: 'destructive', before: 'write' })), ...POST_READS.map((m) => ({ ...m, kind: 'read', before: 'write' })), ...GET_WRITES.map((m) => ({ ...m, kind: 'write', before: 'read' }))];

/** Every catalog method that sets an IAM policy, in an API a plugin reaches. Each one grants or changes roles. */
const servers = readJson('config', 'servers.json').servers;
const reached = new Set(servers.flatMap((s) => [...(s.apis ?? []), ...(s.gatewayApis ?? [])].map((a) => `${a.api}.${a.version}`)));
const SET_IAM = [...new Set(catalog.apis.filter((a) => reached.has(`${a.name}.${a.version}`)).flatMap((a) => a.methods.map(([id]) => id).filter((id) => id.endsWith('.setIamPolicy'))))].sort();

// ---------------------------------------------------------------------------
// 1. The data

test('config/tool-kinds.json pins every entry of the rule, the POST reads and the GET writes, and adds no note', () => {
  assert.equal(DESTRUCTIVE.length, 66);
  assert.equal(POST_READS.length, 45);
  assert.equal(GET_WRITES.length, 4);
  assert.equal(new Set(ALL.map((m) => m.id)).size, ALL.length, 'no id twice');
  for (const m of ALL) assert.equal(kindsFile[m.id], m.kind, m.id);
  for (const m of DESTRUCTIVE) assert.match(m.rule, /^[a-h]$/, m.id);
  // A note is appended to the description of every generated tool of its API, so none was added.
  assert.deepEqual(Object.keys(kindsFile.notes).sort(), ['bigquery', 'cloudidentity', 'compute', 'googleads', 'indexing', 'script', 'secretmanager', 'sqladmin', 'tagmanager']);
  // Decisions that stay: BigQuery jobs.query is a write (it runs any SQL), and the credential reveals of 1.26.2 are writes.
  assert.equal(kindsFile['bigquery.jobs.query'], 'write');
  for (const id of ['identitytoolkit.relyingparty.getOobConfirmationCode', 'secretmanager.projects.secrets.versions.access', 'apikeys.projects.locations.keys.getKeyString']) {
    assert.equal(kindsFile[id], 'write', id);
  }
});

test('every IAM policy setter a plugin reaches is destructive: it grants or changes roles and replaces the whole policy', () => {
  assert.equal(SET_IAM.length, 275);
  for (const id of SET_IAM) assert.equal(kindsFile[id], 'destructive', `${id} is listed`);
  const listed = Object.entries(overrides).filter(([id, kind]) => id.endsWith('.setIamPolicy') && kind === 'destructive').map(([id]) => id).sort();
  assert.deepEqual(listed, SET_IAM, 'no stale setIamPolicy entry');
});

test('both classifiers give the new kind on every catalog version, and the verb and name rules alone give the old one', () => {
  const expect = new Map([...ALL.map((m) => [m.id, m]), ...SET_IAM.map((id) => [id, { id, kind: 'destructive', before: 'write' }])]);
  const seen = new Map([...expect.keys()].map((id) => [id, []]));
  for (const api of catalog.apis) {
    for (const [id, verb] of api.methods) {
      const m = expect.get(id);
      if (!m) continue;
      assert.equal(classifyMethod(verb, nameOf(id), id, overrides), m.kind, `${id} ${api.version}: classifyMethod`);
      assert.equal(fallbackClassify(verb, nameOf(id), id, overrides), m.kind, `${id} ${api.version}: the plugin copy`);
      // Without the override the verb and name rules give the old kind, so the entry is what changes it.
      assert.equal(classifyMethod(verb, nameOf(id), id, {}), m.before, `${id} ${api.version}: the verb and name rules`);
      seen.get(id).push(`${api.name}:${api.version}`);
    }
  }
  for (const m of ALL) assert.deepEqual(seen.get(m.id).sort(), m.versions, `${m.id}: the catalog versions`);
  for (const id of SET_IAM) assert.ok(seen.get(id).length >= 1, id);
});

test('the credential rule holds: no other new read has a credential word, and the three Keyword methods are reads', () => {
  for (const m of POST_READS) assert.equal(CREDENTIAL.test(nameOf(m.id)), false, m.id);
  const found = new Set();
  for (const api of catalog.apis) {
    for (const [id, verb] of api.methods) {
      if (!KEYWORD_READS.includes(id)) continue;
      found.add(id);
      // The owner's decision of 2026-10-31 (Q1): an exact read entry, and no longer a credential name.
      assert.equal(kindsFile[id], 'read', `${id}: the exact read entry`);
      assert.equal(CREDENTIAL.test(nameOf(id)), true, `${id}: the old whole-name regex still matches "Keyword"`);
      assert.equal(classifyMethod(verb, nameOf(id), id, overrides), 'read', `${id} ${api.version}`);
      assert.equal(fallbackClassify(verb, nameOf(id), id, overrides), 'read', `${id} ${api.version}: the plugin copy`);
    }
  }
  assert.deepEqual([...found].sort(), [...KEYWORD_READS].sort());
  const gads = readJson('plugins', 'gads', 'method-kinds.json');
  for (const id of KEYWORD_READS) assert.equal(gads[id], 'read', `gads gateway ${id}`);
});

// ---------------------------------------------------------------------------
// 2. The built plugins

test('the built plugins carry the kinds: generated tools in tool-map.json, gateway methods in method-kinds.json', () => {
  for (const m of ALL) {
    assert.deepEqual(readJson('plugins', m.plugin, 'tool-kinds.json'), kindsFile, `${m.plugin} carries config/tool-kinds.json`);
    const map = readJson('plugins', m.plugin, 'tool-map.json');
    if (m.tool) {
      const entry = map.find((t) => t.name === full(m.plugin, m.tool));
      assert.ok(entry, `${m.plugin} lists ${m.tool}`);
      assert.equal(entry.methodId, m.id, m.tool);
      assert.equal(entry.kind, m.kind, m.tool);
    } else {
      assert.equal(map.some((t) => t.methodId === m.id), false, `${m.id} has no generated tool in ${m.plugin}`);
    }
    const table = existsSync(join(ROOT, 'plugins', m.plugin, 'method-kinds.json')) ? readJson('plugins', m.plugin, 'method-kinds.json') : {};
    if (m.gateway) assert.equal(table[m.id], m.kind, `${m.plugin} gateway ${m.id}`);
    else assert.equal(table[m.id], undefined, `${m.plugin} gateway has no ${m.id}`);
  }
  // Every setIamPolicy in any plugin's map or gateway table is destructive.
  let count = 0;
  for (const plugin of servers.map((s) => s.name)) {
    for (const t of readJson('plugins', plugin, 'tool-map.json').filter((t) => t.methodId?.endsWith('.setIamPolicy'))) {
      assert.equal(t.kind, 'destructive', `${plugin} ${t.name}`);
      count++;
    }
    const file = join(ROOT, 'plugins', plugin, 'method-kinds.json');
    if (!existsSync(file)) continue;
    for (const [id, kind] of Object.entries(JSON.parse(readFileSync(file, 'utf8')))) {
      if (!id.endsWith('.setIamPolicy')) continue;
      assert.equal(kind, 'destructive', `${plugin} gateway ${id}`);
      count++;
    }
  }
  assert.ok(count >= SET_IAM.length, `setIamPolicy entries in the plugins: ${count}`);
});

test('curated tools follow the rule: chat_send_message is destructive; the per-call ones stay writes in the tool map', () => {
  const chat = readJson('plugins', 'gchat', 'tool-map.json').find((t) => t.name === full('gchat', 'chat_send_message'));
  assert.equal(chat.kind, 'destructive', 'it sends a message to other people, like gmail_send');
  for (const [plugin, tool] of [
    ['gcalendar', 'calendar_create_event'],
    ['gcalendar', 'calendar_update_event'],
    ['gcalendar', 'calendar_respond'],
    ['gclassroom', 'classroom_create_announcement'],
    ['gcloud', 'gcs_write_text'],
  ]) {
    assert.equal(readJson('plugins', plugin, 'tool-map.json').find((t) => t.name === full(plugin, tool)).kind, 'write', `${plugin} ${tool}: a write; the server raises the calls that meet the rule`);
  }
});

// ---------------------------------------------------------------------------
// 3. The plugins' own hooks

/** Runs a built plugin's own hook with a temp token folder (no policy file) and the given confirmation mode. */
function runPluginHook(plugin, toolName, toolInput, confirmation) {
  const tokenDir = tempDir('gsm-destructive-hook-');
  const env = { ...process.env, GSM_TOKEN_DIR: tokenDir };
  delete env.CLAUDE_PLUGIN_OPTION_CONFIRMATION;
  if (confirmation) env.CLAUDE_PLUGIN_OPTION_CONFIRMATION = confirmation;
  const event = { session_id: 's', hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput, tool_use_id: 't' };
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(ROOT, 'plugins', plugin, 'bin', 'gsm-hook.mjs')], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill(), 120_000);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`hook exited ${code}: ${err}`));
      else resolve(out);
    });
    child.stdin.end(JSON.stringify(event));
  });
}

/** Runs the hooks in small batches, so a loaded machine is not flooded. */
async function inBatches(items, run, size = 6) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(run))));
  return out;
}

const callsOf = (m) => [...(m.tool ? [{ name: full(m.plugin, m.tool), input: { name: 'x' } }] : []), ...(m.gateway ? [{ name: full(m.plugin, 'api_call'), input: { method: m.id, pathParams: {} } }] : [])];

test("the plugins' own hooks: each destructive method asks under destructive-only, as a tool and through api_call", async () => {
  const sample = ['cloudresourcemanager.projects.setIamPolicy', 'storage.buckets.setIamPolicy', 'secretmanager.projects.secrets.setIamPolicy', 'aiplatform.projects.locations.models.setIamPolicy'];
  const iam = [
    { plugin: 'gcloud', tool: 'crm_projects_set_iam_policy', gateway: false, id: sample[0] },
    { plugin: 'gcloud', tool: 'storage_buckets_set_iam_policy', gateway: false, id: sample[1] },
    { plugin: 'gcloud', tool: null, gateway: true, id: sample[2] },
    { plugin: 'gai', tool: null, gateway: true, id: sample[3] },
  ];
  const jobs = [...DESTRUCTIVE, ...iam].flatMap((m) => callsOf(m).map((c) => ({ ...c, m })));
  const outputs = await inBatches(jobs, (j) => runPluginHook(j.m.plugin, j.name, j.input, 'destructive-only'));
  outputs.forEach((out, i) => {
    const { m, name } = jobs[i];
    assert.notEqual(out, '', `${name} ${m.id}: asks under destructive-only`);
    const decision = JSON.parse(out).hookSpecificOutput;
    assert.equal(decision.permissionDecision, 'ask', m.id);
    assert.match(decision.permissionDecisionReason, /^About to permanently change or delete Google data: /, m.id);
    assert.ok(decision.permissionDecisionReason.includes(`Method: ${m.id}`), m.id);
  });
  // chat_send_message, curated, asks under destructive-only too.
  const chat = JSON.parse(await runPluginHook('gchat', full('gchat', 'chat_send_message'), { conversation_id: 'spaces/A', text: 'hi' }, 'destructive-only')).hookSpecificOutput;
  assert.equal(chat.permissionDecision, 'ask');
});

test("the plugins' own hooks: each POST read runs without a prompt; each GET write asks, and runs unasked under destructive-only", async () => {
  const reads = POST_READS.flatMap((m) => callsOf(m).map((c) => ({ ...c, m })));
  const readOuts = await inBatches(reads, (j) => runPluginHook(j.m.plugin, j.name, j.input));
  readOuts.forEach((out, i) => assert.equal(out, '', `${reads[i].name} ${reads[i].m.id}: a read prints nothing`));
  const writes = GET_WRITES.flatMap((m) => callsOf(m).map((c) => ({ ...c, m })));
  const asked = await inBatches(writes, (j) => runPluginHook(j.m.plugin, j.name, j.input));
  asked.forEach((out, i) => {
    const decision = JSON.parse(out).hookSpecificOutput;
    assert.equal(decision.permissionDecision, 'ask', writes[i].m.id);
    assert.match(decision.permissionDecisionReason, /^About to change Google data: /, writes[i].m.id);
  });
  const quiet = await inBatches(writes, (j) => runPluginHook(j.m.plugin, j.name, j.input, 'destructive-only'));
  quiet.forEach((out, i) => assert.equal(out, '', `${writes[i].m.id}: a write runs unasked under destructive-only`));
});

// ---------------------------------------------------------------------------
// 4. The setting's words

test("the confirmation option, the approval footer and the docs say what destructive-only asks before", () => {
  for (const plugin of servers.map((s) => s.name)) {
    const text = readJson('plugins', plugin, '.claude-plugin', 'plugin.json').userConfig.confirmation.description;
    for (const word of ['deleting', 'sending to other people', 'sharing or permission changes', 'security changes', 'device commands', 'publishing', 'refunds', 'whole-content replacement']) {
      assert.ok(text.includes(word), `${plugin}: the confirmation option names ${word}`);
    }
  }
  assert.match(confirmationFooter(), /'destructive-only' \(ask only before destructive actions such as deleting, sending, sharing or publishing\)/);
  const security = readFileSync(join(ROOT, 'docs', 'SECURITY.md'), 'utf8');
  const claude = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
  for (const part of ['(a) sends a message, invitation or notification to other people', '(h) permanently destroys key material or held data']) {
    assert.ok(security.includes(part), `docs/SECURITY.md states the rule: ${part}`);
    assert.ok(claude.includes(part), `CLAUDE.md states the rule: ${part}`);
  }
  for (const m of ALL) assert.ok(security.includes(`\`${m.id}\``), `docs/SECURITY.md lists ${m.id}`);
});

// ---------------------------------------------------------------------------
// 5. Curated tools, per call

const cfg = loadConfig({ GSM_TOKEN_DIR: tempDir('gsm-destructive-cfg-') });
const curated = async (module) => new Map((await (await import(dist(`servers/${module}.js`))).buildTools(cfg)).map((t) => [t.name, t]));

test('callKind raises a write to destructive only when its arguments meet the rule, and never lowers a kind', async () => {
  const cal = await curated('gcalendar');
  const create = cal.get('calendar_create_event');
  const base = { summary: 'Review', start: '2026-11-02T10:00:00Z', end: '2026-11-02T11:00:00Z' };
  assert.equal(callKind(create, { ...base, attendees: ['ana@example.com'], send_updates: 'all' }), 'destructive');
  assert.equal(callKind(create, { ...base, attendees: ['ana@example.com'], send_updates: 'externalOnly' }), 'destructive');
  assert.equal(callKind(create, { ...base, attendees: ['ana@example.com'], send_updates: 'none' }), 'write');
  assert.equal(callKind(create, { ...base, attendees: ['ana@example.com'] }), 'write', 'send_updates defaults to none');
  assert.equal(callKind(create, { ...base, send_updates: 'all' }), 'write', 'no attendee, nobody is emailed');
  for (const name of ['calendar_update_event', 'calendar_respond']) {
    const tool = cal.get(name);
    assert.equal(callKind(tool, { event_id: 'e', send_updates: 'all' }), 'destructive', name);
    assert.equal(callKind(tool, { event_id: 'e', send_updates: 'externalOnly' }), 'destructive', name);
    assert.equal(callKind(tool, { event_id: 'e', send_updates: 'none' }), 'write', name);
    assert.equal(callKind(tool, { event_id: 'e' }), 'write', name);
  }
  assert.equal(callKind(cal.get('calendar_delete_event'), { event_id: 'e' }), 'destructive', 'a destructive tool stays destructive');

  const announce = (await curated('gclassroom')).get('classroom_create_announcement');
  assert.equal(callKind(announce, { course_id: '10', text: 'x', publish: true }), 'destructive');
  assert.equal(callKind(announce, { course_id: '10', text: 'x', scheduled_time: '2026-11-02T08:00:00Z' }), 'destructive');
  assert.equal(callKind(announce, { course_id: '10', text: 'x' }), 'write', 'a draft');
  assert.equal(callKind(announce, { course_id: '10', text: 'x', publish: false }), 'write');

  const gcs = (await curated('cloud')).get('gcs_write_text');
  assert.equal(callKind(gcs, { bucket: 'b', object: 'o', text: 'x', overwrite: true }), 'destructive');
  assert.equal(callKind(gcs, { bucket: 'b', object: 'o', text: 'x' }), 'write');

  const chat = (await curated('gchat')).get('chat_send_message');
  assert.equal(chat.kind, 'destructive');
  assert.equal(typeof chat.prepare, 'function');
  // A read never reaches the gate, and callKind never raises a read or lowers a destructive kind.
  assert.equal(callKind({ kind: 'write', destructiveWhen: () => false }, {}), 'write');
  assert.equal(callKind({ kind: 'destructive', destructiveWhen: () => false }, {}), 'destructive');
});

/** A runServer child of one curated module. Its HTTP layer is stubbed and records each request; nothing reaches Google. */
function curatedServer(module, serverName, group) {
  const dir = tempDir(`gsm-destructive-${module}-`);
  const tokens = join(dir, 'tokens');
  mkdirSync(tokens);
  writeFileSync(join(tokens, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  writeFileSync(join(tokens, `${group}.token.json`), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));
  const entry = join(dir, 'entry.mjs');
  writeFileSync(
    entry,
    [
      `import { appendFileSync } from 'node:fs';`,
      `import { createRequire } from 'node:module';`,
      `const require = createRequire(${JSON.stringify(join(ROOT, 'package.json'))});`,
      `const { OAuth2Client } = require('google-auth-library');`,
      `OAuth2Client.prototype.request = async function (opts) {`,
      `  const url = new URL(opts.url);`,
      `  const method = String(opts.method ?? 'GET').toUpperCase();`,
      `  appendFileSync(process.env.CALLS_FILE, JSON.stringify({ method, path: url.pathname }) + '\\n');`,
      `  const data = { id: 'ev-1', summary: 'Review', start: { dateTime: '2026-11-02T10:00:00Z' }, end: { dateTime: '2026-11-02T11:00:00Z' },`,
      `    attendees: [{ email: 'me@example.com', self: true, responseStatus: 'needsAction' }, { email: 'ana@example.com', responseStatus: 'accepted' }],`,
      `    name: 'spaces/AAA', displayName: 'Launch team', spaceType: 'SPACE', state: 'PUBLISHED', generation: '3', size: '5', contentType: 'text/plain' };`,
      `  return { data, status: 200, headers: new Headers(), config: opts };`,
      `};`,
      `const { runServer } = await import(${JSON.stringify(dist('core/tools.js'))});`,
      `const { buildTools } = await import(${JSON.stringify(dist(`servers/${module}.js`))});`,
      `await runServer({ name: '${serverName}', version: '0.0.0', buildTools });`,
      '',
    ].join('\n'),
  );
  return { dir, tokens, entry, callsFile: join(dir, 'calls.jsonl') };
}

const callsIn = (file) => (existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const auditOf = (tokens) => (existsSync(join(tokens, 'audit.log')) ? readFileSync(join(tokens, 'audit.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);

/** The child's environment: writes on, the plugin's hook active (as in Claude Code), and any stray request sent to a closed port. */
function serverEnv(s, extra = {}) {
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && !k.startsWith('CLAUDE_PLUGIN_OPTION_') && k !== 'GOOGLE_APPLICATION_CREDENTIALS'));
  return {
    ...base,
    GSM_TOKEN_DIR: s.tokens,
    GSM_ALLOW_WRITES: 'true',
    GSM_HOOK_ACTIVE: '1',
    CALLS_FILE: s.callsFile,
    APPDATA: join(s.dir, 'appdata'),
    CLOUDSDK_CONFIG: join(s.dir, 'gcloud'),
    HTTPS_PROXY: 'http://127.0.0.1:9',
    HTTP_PROXY: 'http://127.0.0.1:9',
    NODE_USE_ENV_PROXY: '1',
    ...extra,
  };
}

async function withClient(entry, env, run, answer) {
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  const { ElicitRequestSchema } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/types.js')).href);
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env, stderr: 'pipe' });
  const client = new Client({ name: 'gsm-destructive-test', version: '0.0.0' }, { capabilities: answer ? { elicitation: { form: {} } } : {} });
  const asked = [];
  if (answer) {
    client.setRequestHandler(ElicitRequestSchema, async (request) => {
      asked.push(request.params.message);
      return answer;
    });
  }
  await client.connect(transport);
  try {
    return await run(client, asked);
  } finally {
    await client.close();
  }
}

test('runServer, destructive-only with the hook active: a Calendar call that emails guests asks and, declined, sends nothing; one that emails nobody runs', async () => {
  const s = curatedServer('gcalendar', 'gcalendar', 'workspace-user');
  await withClient(
    s.entry,
    serverEnv(s, { GSM_CONFIRMATION: 'destructive-only' }),
    async (client, asked) => {
      const args = { summary: 'Review', start: '2026-11-02T10:00:00Z', end: '2026-11-02T11:00:00Z', attendees: ['ana@example.com'] };
      const sent = await client.callTool({ name: 'calendar_create_event', arguments: { ...args, send_updates: 'all' } });
      assert.equal(sent.isError, true);
      assert.match(sent.content[0].text, /You declined this action\. Nothing was changed\./);
      assert.equal(asked.length, 1, 'the server form asked');
      assert.match(asked[0], /^About to permanently change or delete Google data: calendar_create_event/);
      assert.match(asked[0], /"send_updates": "all"/);
      assert.deepEqual(callsIn(s.callsFile), [], 'nothing was sent');

      const respond = await client.callTool({ name: 'calendar_respond', arguments: { event_id: 'ev-1', response: 'accepted', send_updates: 'all' } });
      assert.equal(respond.isError, true);
      assert.equal(asked.length, 2, 'an answer emailed to the organizer asks too');
      assert.deepEqual(callsIn(s.callsFile), [], 'nothing was read or sent');

      const quiet = await client.callTool({ name: 'calendar_create_event', arguments: { ...args, send_updates: 'none' } });
      assert.notEqual(quiet.isError, true, quiet.content[0].text);
      assert.equal(asked.length, 2, 'a create that emails nobody runs without a question under destructive-only');
      assert.deepEqual(callsIn(s.callsFile).map((c) => c.method), ['POST']);
    },
    { action: 'decline' },
  );
  assert.deepEqual(
    auditOf(s.tokens).map((l) => [l.tool, l.risk, l.outcome]),
    [
      ['calendar_create_event', 'destructive', 'declined'],
      ['calendar_respond', 'destructive', 'declined'],
      ['calendar_create_event', 'modify', 'allowed'],
    ],
  );
});

test('runServer, destructive-only with the hook active: chat_send_message asks; a published announcement asks; a draft and a plain GCS write run', async () => {
  const chat = curatedServer('gchat', 'gchat', 'workspace-user');
  await withClient(
    chat.entry,
    serverEnv(chat, { GSM_CONFIRMATION: 'destructive-only' }),
    async (client, asked) => {
      const listed = (await client.listTools()).tools.find((t) => t.name === 'chat_send_message');
      assert.equal(listed.annotations.destructiveHint, true);
      const res = await client.callTool({ name: 'chat_send_message', arguments: { conversation_id: 'spaces/AAA', text: 'Ship it on Friday' } });
      assert.equal(res.isError, true);
      assert.equal(asked.length, 1);
      assert.match(asked[0], /Launch team/);
      assert.deepEqual(callsIn(chat.callsFile).map((c) => [c.method, c.path]), [['GET', '/v1/spaces/AAA']], 'only the read of the name; nothing posted');
    },
    { action: 'decline' },
  );
  assert.deepEqual(auditOf(chat.tokens).map((l) => [l.tool, l.risk, l.outcome]), [['chat_send_message', 'destructive', 'declined']]);

  const room = curatedServer('gclassroom', 'gclassroom', 'workspace-user');
  await withClient(
    room.entry,
    serverEnv(room, { GSM_CONFIRMATION: 'destructive-only' }),
    async (client, asked) => {
      const published = await client.callTool({ name: 'classroom_create_announcement', arguments: { course_id: '10', text: 'Test on Friday', publish: true } });
      assert.equal(published.isError, true);
      assert.equal(asked.length, 1);
      assert.match(asked[0], /^About to permanently change or delete Google data: classroom_create_announcement/);
      assert.deepEqual(callsIn(room.callsFile), []);
      const draft = await client.callTool({ name: 'classroom_create_announcement', arguments: { course_id: '10', text: 'Test on Friday' } });
      assert.notEqual(draft.isError, true, draft.content[0].text);
      assert.equal(asked.length, 1, 'a draft runs without a question under destructive-only');
      assert.deepEqual(callsIn(room.callsFile).map((c) => c.method), ['POST']);
    },
    { action: 'decline' },
  );

  const cloud = curatedServer('cloud', 'gcloud', 'cloud');
  await withClient(
    cloud.entry,
    serverEnv(cloud, { GSM_CONFIRMATION: 'destructive-only' }),
    async (client, asked) => {
      const replace = await client.callTool({ name: 'gcs_write_text', arguments: { bucket: 'my-bucket', object: 'a.txt', text: 'hello', overwrite: true } });
      assert.equal(replace.isError, true);
      assert.equal(asked.length, 1);
      assert.match(asked[0], /^About to permanently change or delete Google data: gcs_write_text/);
      assert.deepEqual(callsIn(cloud.callsFile), []);
      const fresh = await client.callTool({ name: 'gcs_write_text', arguments: { bucket: 'my-bucket', object: 'b.txt', text: 'hello' } });
      assert.notEqual(fresh.isError, true, fresh.content[0].text);
      assert.equal(asked.length, 1, 'a write that cannot replace runs without a question under destructive-only');
      assert.deepEqual(callsIn(cloud.callsFile).map((c) => c.method), ['POST']);
    },
    { action: 'decline' },
  );
});

test('runServer, every-change with the hook active: a raised call asks on the server too; a plain write is left to the hook', async () => {
  const s = curatedServer('gcalendar', 'gcalendar', 'workspace-user');
  await withClient(
    s.entry,
    serverEnv(s),
    async (client, asked) => {
      const args = { event_id: 'ev-1', summary: 'Review, moved' };
      const emailed = await client.callTool({ name: 'calendar_update_event', arguments: { ...args, send_updates: 'all' } });
      assert.equal(emailed.isError, true);
      assert.equal(asked.length, 1, 'the second question: the hook asked first in Claude Code');
      const plain = await client.callTool({ name: 'calendar_update_event', arguments: args });
      assert.notEqual(plain.isError, true, plain.content[0].text);
      assert.equal(asked.length, 1, 'a plain write is asked by the hook only');
    },
    { action: 'decline' },
  );
  assert.deepEqual(auditOf(s.tokens).map((l) => [l.risk, l.outcome]), [['destructive', 'declined'], ['modify', 'hook']]);
});

// ---------------------------------------------------------------------------
// 6. Generated tools in a running server

/** A server of generated tools only, as scripts/bundle.mjs writes its entry. */
function generatedEntry(dir, name) {
  const entry = join(dir, `${name}-entry.mjs`);
  writeFileSync(
    entry,
    [
      `import { withOrigin } from '${dist('core/toolset.js')}';`,
      `import { discoveryToolsFor } from '${dist('core/discovery/tools.js')}';`,
      `import { runServer } from '${dist('core/tools.js')}';`,
      `await runServer({ name: '${name}', version: '0.0.0', buildTools: async (cfg) => withOrigin('generated', await discoveryToolsFor('${name}', cfg, [])) });`,
      '',
    ].join('\n'),
  );
  return entry;
}

function fakeLogin(dir, group, scopes) {
  const tokenDir = join(dir, 'tokens');
  mkdirSync(tokenDir, { recursive: true });
  writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  writeFileSync(join(tokenDir, `${group}.token.json`), JSON.stringify({ access_token: 'fake', refresh_token: 'fake', expiry_date: Date.now() + 3600_000, scope: scopes.join(' ') }));
  return tokenDir;
}

test('runServer: Meet endActiveConference is listed as destructive and asks under destructive-only; declined, nothing is sent', async () => {
  const dir = tempDir('gsm-destructive-meet-');
  const tokens = fakeLogin(dir, 'workspace-user', ['https://www.googleapis.com/auth/meetings.space.created']);
  const s = { dir, tokens, callsFile: join(dir, 'calls.jsonl') };
  await withClient(
    generatedEntry(dir, 'gmeet'),
    serverEnv(s, { GSM_CONFIRMATION: 'destructive-only' }),
    async (client, asked) => {
      const tool = (await client.listTools()).tools.find((t) => t.name === 'meet_spaces_end_active_conference');
      assert.ok(tool, 'listed with writes on');
      assert.equal(tool.annotations.destructiveHint, true, 'destructive, so the next call must ask');
      const res = await client.callTool({ name: 'meet_spaces_end_active_conference', arguments: { name: 'spaces/abc-mnop-xyz' } });
      assert.equal(res.isError, true);
      assert.match(res.content[0].text, /You declined this action\. Nothing was changed\./);
      assert.equal(asked.length, 1);
      assert.match(asked[0], /meet\.spaces\.endActiveConference/);
    },
    { action: 'decline' },
  );
  assert.deepEqual(auditOf(tokens).map((l) => [l.methodId, l.risk, l.outcome]), [['meet.spaces.endActiveConference', 'destructive', 'declined']]);
});

test('runServer with writes off: the POST reads are listed; a GET that records an event is not', async () => {
  const mapsDir = tempDir('gsm-destructive-gmaps-');
  const maps = await withClient(generatedEntry(mapsDir, 'gmaps'), serverEnv({ dir: mapsDir, tokens: join(mapsDir, 'tokens'), callsFile: '' }, { GSM_ALLOW_WRITES: 'false' }), async (client) =>
    (await client.listTools()).tools.map((t) => t.name),
  );
  for (const name of ['areainsigh_v1_compute_insights', 'travelimpa_flights_compute_flight_emiss', 'travelimpa_flights_compute_typical_flig', 'travelimpa_flights_compute_scope3_fligh', 'travelimpa_flights_compute_detailed_fli']) {
    assert.ok(maps.includes(name), `${name} is a read, listed with writes off`);
  }

  const aiDir = tempDir('gsm-destructive-gai-');
  const ai = await withClient(generatedEntry(aiDir, 'gai'), serverEnv({ dir: aiDir, tokens: join(aiDir, 'tokens'), callsFile: '' }, { GSM_ALLOW_WRITES: 'false' }), async (client) =>
    (await client.listTools()).tools.map((t) => t.name),
  );
  for (const name of ['vision_images_annotate', 'speech_speech_recognize', 'texttospee_text_synthesize', 'language_documents_classify_text']) {
    assert.ok(ai.includes(name), `${name} is a read, listed with writes off`);
  }
  for (const m of GET_WRITES.filter((x) => x.tool)) assert.equal(ai.includes(m.tool), false, `${m.tool} records an event: a write, hidden with writes off`);
});
