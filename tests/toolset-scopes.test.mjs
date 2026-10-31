// Login scopes that follow the toolset (GSM_TOOLSET, --toolset): requirementsForSpecs keeps only the tools of the
// toolset, and counts the gateway methods only when the toolset holds api_call. The login runs in this process with a
// fake browser step; the chat sign-in runs against the built gmail plugin with no browser. Nothing calls Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;

const { runLogin } = await import(DIST('cli/login.js'));
const { runScopes } = await import(DIST('cli/scopes.js'));
const { parseCliArgs, parseToolset, parseSetupAdminArgs } = await import(DIST('cli/args.js'));
const { loadConfig } = await import(DIST('core/config.js'));
const { loadRegistry } = await import(DIST('core/registry.js'));
const { resolveScopes, requirementsFor, requirementsForSpecs } = await import(DIST('core/scopes.js'));
const { GATEWAY_TOOL_NAMES } = await import(DIST('core/toolset.js'));
const { gatewayTools } = await import(DIST('core/gateway.js'));
const { createSignIn } = await import(DIST('core/inchat-login.js'));
const { saveAccount, accountTokenFile } = await import(DIST('core/accounts.js'));
const { UsageError } = await import(DIST('cli/types.js'));

const G = (name) => `https://www.googleapis.com/auth/${name}`;
const EMAIL = G('userinfo.email');
const sorted = (list) => [...list].sort();
const registry = () => loadRegistry(DIST('core/registry.js'));

// 1.39.0: gmail_create_label in place of gmail_users_labels_create, and no gmail_search.
const GMAIL_GOOGLE = [
  'gmail_create_draft',
  'gmail_create_label',
  'gmail_get_attachment',
  'gmail_get_message',
  'gmail_get_thread',
  'gmail_label',
  'gmail_list_drafts',
  'gmail_list_labels',
  'gmail_search_threads',
  'gmail_send_draft',
  'gmail_trash',
  'gmail_unlabel',
  'gmail_untrash',
];

const temps = [];
function tempTokens(env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-toolset-scopes-'));
  temps.push(dir);
  writeFileSync(join(dir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  return { dir, cfg: loadConfig({ GSM_TOKEN_DIR: dir, ...env }) };
}
test.after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function capture() {
  const lines = [];
  return { lines, out: { log: (t) => lines.push(t), warn: (t) => lines.push(t) }, text: () => lines.join('\n') };
}

const quiet = { warn: () => undefined };
const toolsOf = (reqs) => reqs.filter((r) => !r.gateway).map((r) => r.tool.split('/')[1]).sort();
/** The same requirements without the toolset's preferred scopes (1.25.0): what the greedy rule alone resolves. */
const withoutPrefer = (reqs) => reqs.map(({ prefer: _prefer, ...rest }) => rest);

test('GATEWAY_TOOL_NAMES are the names of the gateway tools', () => {
  const { cfg } = tempTokens();
  const names = gatewayTools({ product: 'gmail', group: 'workspace-user', apis: [{ api: 'gmailpostmastertools', version: 'v1' }], cfg }).map((t) => t.name);
  assert.deepEqual(names, [...GATEWAY_TOOL_NAMES]);
});

test('requirements: no toolset and all are the same list; google keeps the gmail list and no gateway method (no api_call)', async () => {
  const { cfg } = tempTokens();
  for (const server of ['gmail', 'gcalendar', 'gsc']) {
    const plain = await requirementsFor([server], cfg, quiet);
    assert.deepEqual(await requirementsFor([server], cfg, { ...quiet, toolset: 'all' }), plain, server);
  }
  const google = await requirementsFor(['gmail'], cfg, { ...quiet, toolset: 'google' });
  assert.deepEqual(toolsOf(google), GMAIL_GOOGLE);
  assert.equal(google.filter((r) => r.gateway).length, 0, 'the google list has no api_call, so no gateway method counts');
  assert.deepEqual(resolveScopes(google, 'readonly').scopes, [G('gmail.readonly')]);
  assert.deepEqual(resolveScopes(google, 'readwrite').scopes, [G('gmail.modify')]);
});

test('requirements: the gcalendar google list resolves to its preferred event, list and free/busy scopes (readonly since 1.40.1, readwrite since 1.25.0)', async () => {
  const { cfg } = tempTokens();
  const google = await requirementsFor(['gcalendar'], cfg, { ...quiet, toolset: 'google' });
  assert.equal(google.length, 8);
  // The three read scopes Google's Calendar MCP server names, in place of calendar.readonly (the greedy rule's one scope).
  assert.deepEqual(resolveScopes(google, 'readonly').scopes, [G('calendar.calendarlist.readonly'), G('calendar.events.freebusy'), G('calendar.events.readonly')]);
  assert.deepEqual(resolveScopes(withoutPrefer(google), 'readonly').scopes, [G('calendar.readonly')]);
  assert.deepEqual(resolveScopes(await requirementsFor(['gcalendar'], cfg, quiet), 'readonly').scopes, [G('calendar.acls.readonly'), G('calendar.readonly')], 'the all toolset is unchanged');
  // Since 1.25.0 the list prefers calendar.events, calendar.calendarlist.readonly and calendar.events.freebusy, the
  // scopes Google's Calendar MCP server uses for the same tasks (no tool of the list manages calendars or sharing).
  assert.deepEqual(resolveScopes(google, 'readwrite').scopes, [G('calendar.calendarlist.readonly'), G('calendar.events'), G('calendar.events.freebusy')]);
  // The greedy cover alone takes the one scope that covers all eight tools: calendar.events covers neither list_calendars
  // nor suggest_time (free/busy), so calendar wins on coverage. Same answer as the all toolset gives.
  assert.deepEqual(resolveScopes(withoutPrefer(google), 'readwrite').scopes, [G('calendar')]);
  assert.deepEqual(resolveScopes(await requirementsFor(['gcalendar'], cfg, quiet), 'readwrite').scopes, [G('calendar')]);
});

test('requirements: the gdrive google list resolves to drive.readonly (readonly) and drive (readwrite), no gateway method', async () => {
  const { cfg } = tempTokens();
  const google = await requirementsFor(['gdrive'], cfg, { ...quiet, toolset: 'google' });
  assert.equal(google.length, 19);
  assert.equal(google.filter((r) => r.gateway).length, 0);
  assert.deepEqual(resolveScopes(google, 'readonly').scopes, [G('drive.readonly')]);
  // drive covers all 19 tools; drive.file does not cover drive_search, drive_read_text, drive_get_file or drive_list_recent.
  assert.deepEqual(resolveScopes(google, 'readwrite').scopes, [G('drive')]);
});

test('requirements: the gcloud google list (59 tools, no gateway) resolves to Cloud read-only scopes and to cloud-platform', async () => {
  const { cfg } = tempTokens();
  const google = await requirementsFor(['gcloud'], cfg, { ...quiet, toolset: 'google' });
  assert.equal(google.length, 59);
  assert.equal(google.filter((r) => r.gateway).length, 0, 'no api_call in the list, so no gateway method counts');
  const readonly = resolveScopes(google, 'readonly');
  // Since 1.32.1 monitoring.read counts as view-only (Google: "View monitoring data ..."), so the Monitoring reads join.
  assert.deepEqual(readonly.scopes, [G('cloud-billing.readonly'), G('cloud-platform.read-only'), G('monitoring.read')]);
  // IAM lists only cloud-platform, so these reads stay outside a readonly login, as with the all toolset.
  for (const tool of ['iam_roles_list', 'iam_role_get', 'iam_policies_get']) {
    assert.ok(readonly.uncovered.includes(`gcloud/${tool}`), tool);
  }
  for (const tool of ['monitoring_query_promql', 'monitoring_dashboards_list', 'monitoring_dashboard_get', 'logging_entries_list', 'gcs_read_text', 'billing_price_lookup', 'bq_query_read', 'cloud_projects_search']) {
    assert.ok(readonly.covered.includes(`gcloud/${tool}`), tool);
  }
  // cloud-platform covers every tool but the curated BigQuery reads, which list bigquery and not cloud-platform.
  assert.deepEqual(resolveScopes(google, 'readwrite').scopes, [G('bigquery'), G('cloud-platform')]);
});

test('requirements: curated keeps the curated tools and, with api_call, the gateway methods', async () => {
  const { cfg } = tempTokens();
  const all = await requirementsFor(['gmail'], cfg, quiet);
  const curated = await requirementsFor(['gmail'], cfg, { ...quiet, toolset: 'curated' });
  assert.deepEqual(toolsOf(curated), [
    'gmail_create_draft',
    'gmail_create_label',
    'gmail_get_attachment',
    'gmail_get_message',
    'gmail_get_thread',
    'gmail_label',
    'gmail_list_drafts',
    'gmail_list_labels',
    'gmail_reply',
    'gmail_search',
    'gmail_search_threads',
    'gmail_send',
    'gmail_send_draft',
    'gmail_trash',
    'gmail_unlabel',
    'gmail_untrash',
  ]);
  assert.deepEqual(
    curated.filter((r) => r.gateway),
    all.filter((r) => r.gateway),
    'every gateway method counts, as api_call is in the curated toolset',
  );
  assert.deepEqual(resolveScopes(curated, 'readonly').scopes, [G('gmail.readonly')]);
  assert.deepEqual(resolveScopes(curated, 'readwrite').scopes, [G('gmail.modify')]);
});

test('requirements: a toolset a product does not have counts every tool, and says so', async () => {
  const { cfg } = tempTokens();
  const lines = [];
  // gfirebase's server entry without its google list (it has one since 1.20.0), as a product without a list is.
  const { toolsets: _dropped, ...spec } = registry().servers.find((s) => s.name === 'gfirebase');
  const google = await requirementsForSpecs([spec], cfg, { warn: (l) => lines.push(l), toolset: 'google' });
  assert.deepEqual(google, await requirementsFor(['gfirebase'], cfg, quiet));
  assert.deepEqual(lines, ['[gfirebase] toolset google is not defined for this product yet; every tool counts toward the scopes.']);
});

test('requirements: the gfirebase google list (38 tools, no gateway) resolves to firebase.readonly and to cloud-platform', async () => {
  const { cfg } = tempTokens();
  const google = await requirementsFor(['gfirebase'], cfg, { ...quiet, toolset: 'google' });
  assert.equal(google.length, 38);
  assert.equal(google.filter((r) => r.gateway).length, 0, 'no api_call in the list, so no gateway method counts');
  const readonly = resolveScopes(google, 'readonly');
  assert.deepEqual(readonly.scopes, [G('firebase.readonly')]);
  // Firestore, Remote Config, Authentication users, Crashlytics and Data Connect publish no read-only scope, so a
  // readonly login covers none of them, in the all toolset as well.
  for (const tool of ['firestore_get_document', 'firestore_query_collection', 'remoteconfig_get_template', 'auth_get_users']) assert.ok(readonly.uncovered.includes(`gfirebase/${tool}`), tool);
  assert.deepEqual(resolveScopes(google, 'readwrite').scopes, [G('cloud-platform')]);
  // The all toolset resolves as before 1.20.0: the five curated tools need no scope it does not already ask for.
  const all = await requirementsFor(['gfirebase'], cfg, quiet);
  assert.deepEqual(resolveScopes(all, 'readonly').scopes, [G('cloud-platform.read-only'), G('firebase.readonly')]);
  assert.deepEqual(resolveScopes(all, 'readwrite').scopes, [G('cloud-platform')]);
});

test('requirements: the lean gtm, gyoutube and gbusiness lists resolve to the narrow scopes of their tools', async () => {
  const { cfg } = tempTokens();
  // Saving a version needs tagmanager.edit.containerversions and publishing tagmanager.publish; neither has a read-only form.
  // The reads take tagmanager.readonly, the list's preferred scope since 1.25.0 (no tool of the list edits a container).
  const GTM_READWRITE = [G('tagmanager.edit.containerversions'), G('tagmanager.publish'), G('tagmanager.readonly')];
  const GTM_READWRITE_GREEDY = [G('tagmanager.edit.containers'), G('tagmanager.edit.containerversions'), G('tagmanager.publish')];
  const YT_READONLY = [G('youtube.readonly')];
  const YT_READWRITE = [G('youtube'), G('youtube.force-ssl')];
  const resolved = async (id) => {
    const reqs = await requirementsFor([id], cfg, { ...quiet, toolset: 'google' });
    return { n: reqs.length, gateway: reqs.filter((r) => r.gateway).length, readonly: resolveScopes(reqs, 'readonly'), readwrite: resolveScopes(reqs, 'readwrite').scopes, greedy: resolveScopes(withoutPrefer(reqs), 'readwrite').scopes };
  };
  const gtm = await resolved('gtm');
  assert.equal(gtm.n, 13);
  assert.equal(gtm.gateway, 0, 'the tagmanager v1 gateway does not count: no api_call in the list');
  assert.deepEqual(gtm.readonly.scopes, [G('tagmanager.readonly')]);
  assert.deepEqual(gtm.readwrite, GTM_READWRITE);
  assert.deepEqual(gtm.greedy, GTM_READWRITE_GREEDY);
  const yt = await resolved('gyoutube');
  assert.equal(yt.n, 10);
  assert.deepEqual(yt.readonly.scopes, YT_READONLY);
  // commentThreads.list and captions.list list only youtube.force-ssl (or youtubepartner), which have no read-only form.
  for (const tool of ['youtube_comment_threads_list', 'youtube_captions_list']) assert.ok(yt.readonly.uncovered.includes(`gyoutube/${tool}`), tool);
  assert.deepEqual(yt.readwrite, YT_READWRITE);
  const gb = await resolved('gbusiness');
  assert.equal(gb.n, 8);
  // Google's Business Profile Discovery documents list no scope; the product declares business.manage for them (scopeOverrides,
  // 1.24.1). It has no read-only form, so a readonly login covers none of the eight (as in the all toolset).
  assert.deepEqual(gb.readonly.scopes, []);
  assert.equal(gb.readonly.uncovered.length, 8);
  assert.deepEqual(gb.readwrite, [G('business.manage')]);
});

test('requirements: the lean gsc google list resolves to webmasters.readonly (readonly) and webmasters with indexing (readwrite)', async () => {
  const { cfg } = tempTokens();
  const google = await requirementsFor(['gsc'], cfg, { ...quiet, toolset: 'google' });
  assert.equal(google.length, 9);
  const readonly = resolveScopes(google, 'readonly');
  assert.deepEqual(readonly.scopes, [G('webmasters.readonly')]);
  // The Indexing API has no read-only scope, so its metadata read stays outside a readonly login.
  assert.ok(readonly.uncovered.includes('gsc/indexing_url_notifications_get_metadata'));
  // Since 1.34.0 the Indexing API is an optional part (--with indexing): readwrite asks for indexing only when named.
  assert.deepEqual(resolveScopes(google, 'readwrite').scopes, [G('webmasters')]);
  assert.deepEqual(resolveScopes(google, 'readwrite', ['indexing']).scopes, [G('indexing'), G('webmasters')]);
  // The all toolset also asks for siteverification (the Site Verification tools), which the lean list does not hold.
  const all = await requirementsFor(['gsc'], cfg, quiet);
  assert.deepEqual(resolveScopes(all, 'readwrite').scopes, [G('siteverification'), G('webmasters')]);
  assert.deepEqual(resolveScopes(all, 'readwrite', ['indexing']).scopes, [G('indexing'), G('siteverification'), G('webmasters')]);
});

test('requirements: the gchat google list resolves to Chat user scopes only, never the Chat app scopes', async () => {
  const { cfg } = tempTokens();
  const google = await requirementsFor(['gchat'], cfg, { ...quiet, toolset: 'google' });
  assert.equal(google.length, 9);
  const readonly = resolveScopes(google, 'readonly');
  assert.deepEqual(readonly.scopes, [G('chat.memberships.readonly'), G('chat.messages.readonly'), G('chat.spaces.readonly')]);
  // The notification settings have no read-only scope, so their read stays outside a readonly login.
  assert.ok(readonly.uncovered.includes('gchat/chat_users_spaces_space_notificatio_get'));
  const readwrite = resolveScopes(google, 'readwrite').scopes;
  // Since 1.25.0 the list prefers the six scopes of Google's Chat MCP server: read-only spaces, members and messages,
  // messages.create for sending, and the two user-state scopes.
  assert.deepEqual(readwrite, [
    G('chat.memberships.readonly'),
    G('chat.messages.create'),
    G('chat.messages.readonly'),
    G('chat.spaces.readonly'),
    G('chat.users.readstate'),
    G('chat.users.spacesettings'),
  ]);
  assert.deepEqual(resolveScopes(withoutPrefer(google), 'readwrite').scopes, [G('chat.memberships'), G('chat.messages'), G('chat.spaces'), G('chat.users.readstate'), G('chat.users.spacesettings')]);
  for (const app of ['chat.bot', 'chat.import']) assert.equal(readwrite.includes(G(app)), false, app);
  // The all toolset resolves as before 1.12.0: its generated tools still list chat.bot and chat.import.
  const all = resolveScopes(await requirementsFor(['gchat'], cfg, quiet), 'readwrite').scopes;
  assert.ok(all.includes(G('chat.bot')) && all.includes(G('chat.import')));
});

test('requirements: the gcontacts google list resolves to contacts and directory scopes, no gateway method', async () => {
  const { cfg } = tempTokens();
  const google = await requirementsFor(['gcontacts'], cfg, { ...quiet, toolset: 'google' });
  assert.deepEqual(toolsOf(google), ['contacts_search', 'contacts_search_directory', 'profile_me']);
  assert.equal(google.filter((r) => r.gateway).length, 0, 'the gateway methods (dataportability, health) do not count');
  const readonly = resolveScopes(google, 'readonly');
  // Since 1.35.1 userinfo.profile (Google: "See your personal info") is view-only, so profile_me gets the name too.
  assert.deepEqual(readonly.scopes, [G('contacts.readonly'), G('directory.readonly'), G('userinfo.profile')]);
  assert.deepEqual(readonly.uncovered, []);
  // contacts_search only searches: its preferred scope is contacts.readonly since 1.25.0, as in Google's People MCP server.
  // Since 1.35.1 the product prefers userinfo.profile for readwrite (every sign-in adds userinfo.email anyway).
  assert.deepEqual(resolveScopes(google, 'readwrite').scopes, [G('contacts.readonly'), G('directory.readonly'), G('userinfo.profile')]);
  assert.deepEqual(resolveScopes(withoutPrefer(google), 'readwrite').scopes, [G('contacts'), G('directory.readonly'), G('userinfo.profile')]);
});

test('requirements: the gclassroom google list resolves to the Classroom read-only scopes, materials included', async () => {
  const { cfg } = tempTokens();
  const google = await requirementsFor(['gclassroom'], cfg, { ...quiet, toolset: 'google' });
  assert.equal(google.length, 20);
  const C = (s) => G(`classroom.${s}`);
  // Since 1.33.0 the product prefers both coursework scopes for readonly (scopePolicy.prefer): a teacher's taught classes
  // beside a student's own work.
  assert.deepEqual(resolveScopes(google, 'readonly').scopes, [
    C('announcements.readonly'),
    C('courses.readonly'),
    C('coursework.me.readonly'),
    C('coursework.students.readonly'),
    C('courseworkmaterials.readonly'),
    C('guardianlinks.students.readonly'),
    C('rosters.readonly'),
    C('topics.readonly'),
  ]);
  // No tool of the list changes a course, a roster or a guardian, so since 1.25.0 those three are read-only scopes.
  assert.deepEqual(resolveScopes(google, 'readwrite').scopes, [
    C('announcements'),
    C('courses.readonly'),
    C('coursework.students'),
    C('courseworkmaterials'),
    C('guardianlinks.students.readonly'),
    C('rosters.readonly'),
    C('topics'),
  ]);
  assert.deepEqual(resolveScopes(withoutPrefer(google), 'readwrite').scopes, [
    C('announcements'),
    C('courses'),
    C('coursework.students'),
    C('courseworkmaterials'),
    C('guardianlinks.students'),
    C('rosters'),
    C('topics'),
  ]);
  // Without the generated materials list, no tool of the list would bring the materials scope to a readonly login.
  const withoutMaterialsList = google.filter((r) => r.tool !== 'gclassroom/classroom_cour_cour_list_1590');
  assert.equal(resolveScopes(withoutMaterialsList, 'readonly').scopes.includes(C('courseworkmaterials.readonly')), false);
});

test('requirements: the lean gmeet, gtasks and gapps lists resolve to the narrow scopes of their tools', async () => {
  const { cfg } = tempTokens();
  // gtasks' Keep is an optional part since 1.34.0, so its lists are resolved with the part named, as before.
  const resolved = async (id, include = []) => {
    const reqs = await requirementsFor([id], cfg, { ...quiet, toolset: 'google' });
    return { n: reqs.length, readonly: resolveScopes(reqs, 'readonly', include), readwrite: resolveScopes(reqs, 'readwrite', include).scopes, full: resolveScopes(reqs, 'full', include).scopes };
  };
  const meet = await resolved('gmeet');
  assert.equal(meet.n, 10);
  assert.deepEqual(meet.readonly.scopes, [G('meetings.space.readonly')]);
  // Since 1.33.0 readwrite keeps the reads' reach over every space the user can see (scopePolicy.prefer).
  assert.deepEqual(meet.readwrite, [G('meetings.space.created'), G('meetings.space.readonly')]);
  const tasks = await resolved('gtasks', ['keep']);
  assert.equal(tasks.n, 8);
  assert.deepEqual(tasks.readonly.scopes, [G('keep.readonly'), G('tasks.readonly')]);
  // The Keep reads list keep and keep.readonly; the greedy rule takes the write scope on a tie, as in the all toolset.
  // The list has no Keep write, so since 1.25.0 it prefers keep.readonly.
  assert.deepEqual(tasks.readwrite, [G('keep.readonly'), G('tasks')]);
  assert.deepEqual(resolveScopes(withoutPrefer(await requirementsFor(['gtasks'], cfg, { ...quiet, toolset: 'google' })), 'readwrite', ['keep']).scopes, [G('keep'), G('tasks')]);
  // Without --with keep, no Keep scope is asked for (1.34.0).
  const tasksOnly = await resolved('gtasks');
  assert.deepEqual(tasksOnly.readonly.scopes, [G('tasks.readonly')]);
  assert.deepEqual(tasksOnly.readwrite, [G('tasks')]);
  assert.deepEqual(tasksOnly.full, [G('tasks')]);
  const apps = await resolved('gapps');
  assert.equal(apps.n, 8);
  // script.processes is view-only by Google's description ("View Google Apps Script processes"), so since 1.32.1 the
  // processes list joins a readonly login.
  assert.deepEqual(apps.readonly.scopes, [G('script.deployments.readonly'), G('script.processes'), G('script.projects.readonly')]);
  assert.ok(apps.readonly.covered.includes('gapps/appsscript_processes_list'));
  assert.deepEqual(apps.readwrite, [G('script.deployments'), G('script.processes'), G('script.projects'), EMAIL]);
  // Until 1.36.0 full took the broadest scope scripts.run lists, the full Gmail scope. Now that scope is the optional part
  // mail of gapps and full prefers userinfo.email for scripts.run (scopePolicy), as readwrite picks it: neither asks for
  // https://mail.google.com/ unless the login names mail.
  assert.equal(apps.full.includes('https://mail.google.com/'), false);
  assert.deepEqual(apps.full, apps.readwrite);
  assert.ok((await resolved('gapps', ['mail'])).full.includes('https://mail.google.com/'));
  assert.equal(apps.readwrite.includes('https://mail.google.com/'), false);
});

test('requirements: the gads google list (3 reads, no gateway) resolves to adwords; adwords has no read-only form', async () => {
  const { cfg } = tempTokens();
  const google = await requirementsFor(['gads'], cfg, { ...quiet, toolset: 'google' });
  assert.deepEqual(toolsOf(google), ['ads_list_customers', 'ads_resource_metadata', 'ads_search']);
  assert.equal(google.filter((r) => r.gateway).length, 0, 'no api_call in the list, so no gateway method counts');
  // Google Ads publishes no read-only scope, so a readonly login covers none of the three, as with the all toolset.
  const readonly = resolveScopes(google, 'readonly');
  assert.deepEqual(readonly.scopes, []);
  assert.deepEqual(readonly.uncovered.sort(), ['gads/ads_list_customers', 'gads/ads_resource_metadata', 'gads/ads_search']);
  assert.deepEqual(resolveScopes(google, 'readwrite').scopes, [G('adwords')]);
  assert.deepEqual(resolveScopes(google, 'full').scopes, [G('adwords')]);
});

test('requirements: the ganalytics google list resolves to analytics.readonly, and adds analytics.edit for readwrite, as Google asks', async () => {
  const { cfg } = tempTokens();
  const google = await requirementsFor(['ganalytics'], cfg, { ...quiet, toolset: 'google' });
  assert.equal(google.length, 9);
  assert.equal(google.filter((r) => r.gateway).length, 0, 'no api_call in the list, so no gateway method counts');
  const readonly = resolveScopes(google, 'readonly');
  assert.deepEqual(readonly.scopes, [G('analytics.readonly')]);
  // The one write: Google's server asks for analytics.edit only with --allow-write.
  assert.deepEqual(readonly.uncovered, ['ganalytics/ga_annotation_create']);
  assert.deepEqual(resolveScopes(google, 'readwrite').scopes, [G('analytics.edit'), G('analytics.readonly')]);
  // The all toolset counts the gateway (analyticsadmin v1alpha) and resolves as before 1.17.0.
  const all = await requirementsFor(['ganalytics'], cfg, quiet);
  assert.deepEqual(resolveScopes(all, 'readwrite').scopes, [G('analytics'), G('analytics.edit'), G('analytics.manage.users')]);
});

test('requirements: the gai google list (6 tools, no gateway) resolves to cloud-platform.read-only and to cloud-platform', async () => {
  const { cfg } = tempTokens();
  const google = await requirementsFor(['gai'], cfg, { ...quiet, toolset: 'google' });
  assert.equal(google.length, 6);
  assert.equal(google.filter((r) => r.gateway).length, 0, 'no api_call in the list, so no gateway method counts');
  const readonly = resolveScopes(google, 'readonly');
  assert.deepEqual(readonly.scopes, [G('cloud-platform.read-only')]);
  // Discovery lists cloud-platform.read-only for generateContent and embedContent, but not for countTokens or Agent Search.
  assert.deepEqual(readonly.uncovered.sort(), [
    'gai/discoverye_pro_loc_coll_engi_serv_sear_a054',
    'gai/discoverye_proj_loca_coll_engin_servi_answe',
    'gai/discoverye_projec_locati_collec_engine_list',
    'gai/vertex_count_tokens',
  ]);
  assert.deepEqual(resolveScopes(google, 'readwrite').scopes, [G('cloud-platform')]);
  // The all toolset resolves as before 1.21.0, except that since 1.32.1 readonly also takes devstorage.read_only (view-only
  // by Google's description), the only read scope of the Gemini API's file and cached-content reads (gateway).
  const all = await requirementsFor(['gai'], cfg, quiet);
  assert.deepEqual(resolveScopes(all, 'readonly').scopes, [G('cloud-platform.read-only'), G('devstorage.read_only')]);
  assert.deepEqual(resolveScopes(all, 'readwrite').scopes, [G('cloud-platform'), G('devstorage.read_only')]);
});

test('requirements: the lean gadmin google list resolves to the read-only Directory and audit scopes, and adds the write scopes and alerts for readwrite', async () => {
  const { cfg } = tempTokens();
  const google = await requirementsFor(['gadmin'], cfg, { ...quiet, toolset: 'google' });
  assert.equal(google.length, 10);
  assert.equal(google.filter((r) => r.gateway).length, 0);
  const readonly = resolveScopes(google, 'readonly');
  assert.deepEqual(readonly.scopes, ['domain', 'group', 'orgunit', 'user'].map((s) => G(`admin.directory.${s}.readonly`)).concat(G('admin.reports.audit.readonly')));
  // The alert center lists only apps.alerts, which has no read-only form; the two writes need the write scopes.
  assert.deepEqual(readonly.uncovered.sort(), ['gadmin/admin_group_member_add', 'gadmin/admin_user_set_suspended', 'gadmin/alerts_alerts_list']);
  // Since 1.25.0 the list prefers read-only Directory scopes where no tool of it writes (groups, org units, domains), and
  // group.member for the one group write (adding a member).
  assert.deepEqual(resolveScopes(google, 'readwrite').scopes, [
    G('admin.directory.domain.readonly'),
    G('admin.directory.group.member'),
    G('admin.directory.group.readonly'),
    G('admin.directory.orgunit.readonly'),
    G('admin.directory.user'),
    G('admin.reports.audit.readonly'),
    G('apps.alerts'),
  ]);
  assert.deepEqual(resolveScopes(withoutPrefer(google), 'readwrite').scopes, ['domain', 'group', 'orgunit', 'user'].map((s) => G(`admin.directory.${s}`)).concat(G('admin.reports.audit.readonly'), G('apps.alerts')));
});

test('requirements: the gmerchant google list (13 generated tools, no gateway) needs content, which has no read-only form', async () => {
  const { cfg } = tempTokens();
  const google = await requirementsFor(['gmerchant'], cfg, { ...quiet, toolset: 'google' });
  assert.equal(google.length, 13);
  assert.equal(google.filter((r) => r.gateway).length, 0);
  assert.deepEqual(resolveScopes(google, 'readonly').scopes, []);
  assert.deepEqual(resolveScopes(google, 'readwrite').scopes, [G('content')]);
  // The service-account key's scopes are fixed (src/core/service-account-scopes.ts), so these figures size nothing at sign-in.
});

test('--toolset: parsed for login, scopes and setup-admin; an unknown value is a usage error', () => {
  assert.equal(parseToolset(undefined), undefined);
  assert.equal(parseToolset('Google'), 'google');
  assert.throws(() => parseToolset('lean'), (err) => err instanceof UsageError && /--toolset must be one of: all, google, curated/.test(err.message));
  for (const command of ['login', 'scopes']) assert.equal(parseCliArgs([command, 'workspace-user', '--toolset', 'curated']).values.toolset, 'curated');
  const admin = ['--subject', 'admin@example.com', '--key-file', 'k.json'];
  assert.equal('toolset' in parseSetupAdminArgs(parseCliArgs(['setup-admin', ...admin]).values), false, 'no key without the flag');
  assert.equal(parseSetupAdminArgs(parseCliArgs(['setup-admin', ...admin, '--toolset', 'google']).values).toolset, 'google');
});

test('gsm scopes --toolset google: the gmail scopes of that toolset; without it the output has no toolset', async () => {
  const saved = process.env.GSM_TOOLSET;
  delete process.env.GSM_TOOLSET;
  try {
    const json = capture();
    await runScopes({ group: 'workspace-user', servers: ['gmail'], json: true, toolset: 'google' }, registry(), json.out);
    const parsed = JSON.parse(json.lines.join('\n'));
    assert.equal(parsed.toolset, 'google');
    assert.equal(parsed.tools, GMAIL_GOOGLE.length);
    assert.equal(parsed.gatewayMethods, 0);
    assert.deepEqual(parsed.profiles.readonly.scopes, [G('gmail.readonly')]);
    assert.deepEqual(parsed.profiles.readwrite.scopes, [G('gmail.modify')]);

    const text = capture();
    await runScopes({ group: 'workspace-user', servers: ['gmail'], json: false, toolset: 'google' }, registry(), text.out);
    assert.match(text.text(), /^Toolset google: only the tools of this toolset are counted \(/m);

    const plain = capture();
    await runScopes({ group: 'workspace-user', servers: ['gmail'], json: true }, registry(), plain.out);
    assert.equal('toolset' in JSON.parse(plain.lines.join('\n')), false);
    assert.equal(JSON.parse(plain.lines.join('\n')).tools > 90, true);

    // GSM_TOOLSET applies when --toolset is not given.
    process.env.GSM_TOOLSET = 'google';
    const fromEnv = capture();
    await runScopes({ group: 'workspace-user', servers: ['gmail'], json: true }, registry(), fromEnv.out);
    assert.equal(JSON.parse(fromEnv.lines.join('\n')).toolset, 'google');
  } finally {
    if (saved === undefined) delete process.env.GSM_TOOLSET;
    else process.env.GSM_TOOLSET = saved;
  }
});

/** A fake browser step that records the scopes asked for and grants them all. */
function fakeGoogle(account) {
  const seen = {};
  return {
    seen,
    deps: (cfg) => ({
      cfg,
      loopback: async (_id, _secret, scopes) => {
        seen.scopes = sorted(scopes);
        return { access_token: 'fake-access', refresh_token: 'fake-refresh', scope: scopes.join(' ') };
      },
      accountOf: async () => account,
    }),
  };
}

test('login --toolset google asks for gmail.readonly only; GSM_TOOLSET does the same; a named account keeps its other scopes', async () => {
  const flag = tempTokens();
  const google = fakeGoogle('person@example.com');
  const run = capture();
  assert.equal(await runLogin({ group: 'workspace-user', servers: ['gmail'], profile: 'readonly', toolset: 'google' }, registry, run.out, google.deps(flag.cfg)), 0, run.text());
  assert.deepEqual(google.seen.scopes, sorted([G('gmail.readonly'), EMAIL]));
  assert.match(run.text(), /^Toolset google: only the tools of this toolset count toward the scopes/m);

  const env = tempTokens({ GSM_TOOLSET: 'google' });
  const viaEnv = fakeGoogle('person@example.com');
  assert.equal(await runLogin({ group: 'workspace-user', servers: ['gmail'], profile: 'readwrite' }, registry, capture().out, viaEnv.deps(env.cfg)), 0);
  assert.deepEqual(viaEnv.seen.scopes, sorted([G('gmail.modify'), EMAIL]));

  // The account holds a Drive scope from another product of the group. A gmail login with the google toolset that names
  // the account keeps it (merge), so the toolset never takes scopes away from the other servers.
  const merge = tempTokens();
  saveAccount('workspace-user', 'person@example.com', { refresh_token: 'r', scope: `${G('drive.readonly')} ${EMAIL}` }, merge.cfg);
  const named = fakeGoogle('person@example.com');
  const out = capture();
  assert.equal(
    await runLogin({ group: 'workspace-user', servers: ['gmail'], profile: 'readonly', toolset: 'google', account: 'person@example.com' }, registry, out.out, named.deps(merge.cfg)),
    0,
    out.text(),
  );
  assert.deepEqual(named.seen.scopes, sorted([G('drive.readonly'), G('gmail.readonly'), EMAIL]));
  const stored = JSON.parse(readFileSync(accountTokenFile('workspace-user', 'person@example.com', merge.cfg), 'utf8')).scope.split(' ');
  assert.ok(stored.includes(G('drive.readonly')));
  assert.equal(/Not requested again/.test(out.text()), false, 'drive.readonly is a scope of the group, not a foreign one');
});

test('login without a toolset asks for the same scopes as before (all)', async () => {
  const a = tempTokens();
  const plain = fakeGoogle('person@example.com');
  await runLogin({ group: 'workspace-user', servers: ['gmail'], profile: 'readwrite' }, registry, capture().out, plain.deps(a.cfg));
  const b = tempTokens();
  const all = fakeGoogle('person@example.com');
  const out = capture();
  await runLogin({ group: 'workspace-user', servers: ['gmail'], profile: 'readwrite', toolset: 'all' }, registry, out.out, all.deps(b.cfg));
  assert.deepEqual(all.seen.scopes, plain.seen.scopes);
  assert.deepEqual(plain.seen.scopes, sorted([G('gmail.modify'), G('gmail.settings.basic'), EMAIL]));
  assert.equal(/Toolset/.test(out.text()), false);
});

test('the chat sign-in passes --toolset to the login when the server has one, and nothing for all', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-toolset-argv-'));
  temps.push(dir);
  writeFileSync(join(dir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'x', client_secret: 'y' } }));
  // A fake gsm CLI: it records its argv and prints a sign-in address, then exits.
  const cli = join(dir, 'fake-gsm.mjs');
  writeFileSync(
    cli,
    [
      `import { writeFileSync } from 'node:fs';`,
      `writeFileSync(process.env.ARGV_FILE, JSON.stringify(process.argv.slice(2)));`,
      `console.log('https://accounts.google.com/o/oauth2/v2/auth?scope=x');`,
      '',
    ].join('\n'),
  );
  const argvFor = async (toolset, file) => {
    process.env.ARGV_FILE = join(dir, file);
    const signIn = createSignIn({
      cliFile: cli,
      group: 'workspace-user',
      server: 'gmail',
      cfg: loadConfig({ GSM_TOKEN_DIR: dir, ...(toolset ? { GSM_TOOLSET: toolset } : {}) }),
      adcScopes: () => [],
      onSignedIn: () => undefined,
    });
    await signIn.start('readonly', 'oauth');
    // Wait for the child to write its argv (it exits right after printing).
    for (let i = 0; i < 100; i++) {
      try {
        return JSON.parse(readFileSync(join(dir, file), 'utf8'));
      } catch {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    throw new Error('the fake CLI did not run');
  };
  try {
    const google = await argvFor('google', 'google.json');
    assert.ok(google.includes('--toolset=google'), google.join(' '));
    const all = await argvFor(undefined, 'all.json');
    assert.equal(all.some((a) => a.startsWith('--toolset')), false, all.join(' '));
    assert.deepEqual(all.slice(0, 6), ['login', 'workspace-user', '--profile', 'readonly', '--servers', 'gmail']);
  } finally {
    delete process.env.ARGV_FILE;
  }
});

// ---------------------------------------------------------------------------
// The chat sign-in on the built gmail plugin

const pluginServer = (id) => join(REPO, 'plugins', id, 'servers', `${id}.mjs`);

async function withServer(serverFile, tokenDir, extraEnv, fn) {
  const env = { ...process.env, GSM_TOKEN_DIR: tokenDir, GSM_NO_BROWSER: '1', ...extraEnv };
  delete env.GSM_API_KEY;
  const child = spawn(process.execPath, [serverFile], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map();
  createInterface({ input: child.stdout }).on('line', (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.id !== undefined && waiting.has(msg.id)) {
      waiting.get(msg.id)(msg);
      waiting.delete(msg.id);
    }
  });
  let nextId = 1;
  const request = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => reject(new Error(`timeout on ${method}`)), 120000);
      waiting.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  const call = async (name, args = {}) => (await request('tools/call', { name, arguments: args })).result.content[0].text;
  try {
    await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    return await fn({ call });
  } finally {
    child.stdin.end();
    child.kill();
  }
}

const askedIn = (answer) => new URL(answer.match(/https:\/\/accounts\.google\.com\S+/)[0]).searchParams.get('scope').split(' ').sort();

test('auth_login on gmail with the google toolset asks for gmail.readonly (readonly) and gmail.modify (readwrite) only', async () => {
  const { dir } = tempTokens();
  await withServer(pluginServer('gmail'), dir, { GSM_TOOLSET: 'google' }, async ({ call }) => {
    assert.deepEqual(askedIn(await call('auth_login', { method: 'oauth', profile: 'readonly' })), sorted([G('gmail.readonly'), EMAIL]));
  });
  await withServer(pluginServer('gmail'), dir, { GSM_TOOLSET: 'google' }, async ({ call }) => {
    assert.deepEqual(askedIn(await call('auth_login', { method: 'oauth', profile: 'readwrite' })), sorted([G('gmail.modify'), EMAIL]));
  });
});
