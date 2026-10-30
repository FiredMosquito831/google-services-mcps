// The toolset option (GSM_TOOLSET, the plugin option "toolset"): all (default), google and curated.
// Run after compiling (npm test does). The runtime tests start a real server over stdio with a temp token folder that
// holds a fake token (fake values only). No network call is made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dist = (p) => new URL(`../dist/${p}`, import.meta.url).href;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const readJson = (...parts) => JSON.parse(readFileSync(join(ROOT, ...parts), 'utf8'));

const { readToolset, selectToolset, withOrigin, fallbackNote, TOOLSETS, LIST_METHODS_SUFFIX } = await import(dist('core/toolset.js'));
const discovery = await import(dist('core/discovery/tools.js'));
const { loadConfig } = await import(dist('core/config.js'));
const { registryFromProducts, loadRegistryFile } = await import(dist('cli/products.js'));

const temps = [];
const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
test.after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/** A tool definition for the selection tests. */
const tool = (name, origin, extra = {}) => ({ name, title: name, description: `${name}.`, kind: 'read', inputSchema: {}, handler: async () => name, ...(origin ? { origin } : {}), ...extra });

const GMAIL_GOOGLE = [
  'gmail_search',
  'gmail_search_threads',
  'gmail_get_thread',
  'gmail_get_message',
  'gmail_get_attachment',
  'gmail_list_drafts',
  'gmail_create_draft',
  'gmail_send_draft',
  'gmail_list_labels',
  'gmail_users_labels_create',
  'gmail_label',
  'gmail_unlabel',
  'gmail_trash',
  'gmail_untrash',
];
/** The lean gsc list (no official Google MCP server for Search Console, 1.11.0). */
const GSC_GOOGLE = [
  'sc_sites_list',
  'sc_site_get',
  'sc_search_analytics_query',
  'sc_url_inspect',
  'sc_sitemaps_list',
  'sc_sitemap_get',
  'sc_sitemap_submit',
  'indexing_url_notifications_get_metadata',
  'indexing_url_notifications_publish',
];
/** The gchat list (1.12.0): Google's 9 Chat MCP tools, two of them through the generated notification-setting tools. */
const CHAT_GOOGLE = [
  'chat_search_conversations',
  'chat_list_messages',
  'chat_search_messages',
  'chat_list_members',
  'chat_send_message',
  'chat_mark_read',
  'chat_mark_unread',
  'chat_users_spaces_space_notificatio_get',
  'chat_users_spaces_space_notificat_patch',
];
/** The gcontacts list (1.13.0): Google's 3 People MCP tools. */
const CONTACTS_GOOGLE = ['contacts_search_directory', 'contacts_search', 'profile_me'];
/** The gclassroom list (1.14.0): curated tools for 15 of Google's 16 Classroom MCP tools, generated ones for the rest. */
const CLASSROOM_GOOGLE = [
  'classroom_list_courses',
  'classroom_get_course',
  'classroom_list_topics',
  'classroom_create_topic',
  'classroom_list_coursework',
  'classroom_get_coursework',
  'classroom_cour_cour_list_1590',
  'classroom_cour_cour_crea_e311',
  'classroom_cour_cour_crea_3302',
  'classroom_cour_cour_patc_dea2',
  'classroom_cours_course_modify',
  'classroom_cour_cour_patc_480d',
  'classroom_list_submissions',
  'classroom_get_rubric',
  'classroom_create_rubric',
  'classroom_get_roster',
  'classroom_list_announcements',
  'classroom_get_announcements',
  'classroom_create_announcement',
  'classroom_get_guardians',
];
/** The lean lists of the products with no official Google MCP server (1.15.0). */
const LEAN_GOOGLE = {
  gmeet: [
    'meet_spaces_create',
    'meet_spaces_get',
    'meet_conference_records_list',
    'meet_conference_records_get',
    'meet_conference_recor_participants_list',
    'meet_conference_record_transcripts_list',
    'meet_conference_transcript_entries_list',
    'meet_conference_records_recordings_list',
    'meet_conference_record_smart_notes_list',
    'meet_conference_records_smart_notes_get',
  ],
  gtasks: ['tasks_tasklists_list', 'tasks_tasks_list', 'tasks_tasks_get', 'tasks_tasks_insert', 'tasks_tasks_patch', 'tasks_tasks_delete', 'keep_notes_list', 'keep_notes_get'],
  gapps: [
    'appsscript_projects_get',
    'appsscript_projects_get_content',
    'appsscript_projects_update_content',
    'appsscript_projects_versions_create',
    'appsscript_projects_deployments_list',
    'appsscript_projects_deployments_create',
    'appsscript_processes_list',
    'appsscript_scripts_run',
  ],
};
/** The gads list (1.16.0): Google's 3 Google Ads MCP tools, all reads. */
const ADS_GOOGLE = ['ads_list_customers', 'ads_search', 'ads_resource_metadata'];
/** The tools runServer adds for a server of an OAuth group. No toolset removes them. */
const RUNTIME_OAUTH = ['account_remove', 'account_set_default', 'accounts_list', 'auth_login', 'auth_setup_client', 'auth_status', 'health'];

// ---------------------------------------------------------------------------
// Reading the setting

test('config: GSM_TOOLSET unset or empty is all; a toolset is read case-insensitively; an unknown value is all with one note', () => {
  const lines = [];
  const warn = (line) => lines.push(line);
  assert.deepEqual(TOOLSETS, ['all', 'google', 'curated']);
  assert.equal(readToolset(undefined, warn), 'all');
  assert.equal(readToolset('  ', warn), 'all');
  assert.equal(readToolset(' Google ', warn), 'google');
  assert.equal(readToolset('curated', warn), 'curated');
  assert.equal(lines.length, 0);
  assert.equal(readToolset('everything', warn), 'all');
  assert.deepEqual(lines, ['[config] GSM_TOOLSET "everything" is not a toolset (all, google, curated); using all.']);
  const dir = tempDir('gsm-toolset-cfg-');
  assert.equal(loadConfig({ GSM_TOKEN_DIR: dir }).toolset, 'all');
  assert.equal(loadConfig({ GSM_TOKEN_DIR: dir, GSM_TOOLSET: 'google' }).toolset, 'google');
});

test('the list tool name in toolset.ts is the one the generator uses', () => {
  assert.equal(LIST_METHODS_SUFFIX, discovery.LIST_METHODS_SUFFIX);
});

// ---------------------------------------------------------------------------
// The selection rule

test('all returns the same array, with nothing outside it and no note', () => {
  const tools = [tool('a', 'curated'), tool('b', 'generated'), tool('api_call', 'gateway')];
  for (const lists of [undefined, { google: ['a'] }]) {
    const s = selectToolset(tools, 'all', lists);
    assert.equal(s.tools, tools, 'the input array itself');
    assert.equal(s.effective, 'all');
    assert.equal(s.outside, 0);
    assert.equal('note' in s, false);
  }
});

test('google keeps exactly the listed tools; a product without a list falls back to all with a note', () => {
  const tools = [tool('a', 'curated'), tool('b', 'generated'), tool('c', 'generated'), tool('api_call', 'gateway')];
  const s = selectToolset(tools, 'google', { google: ['c', 'a', 'not_a_tool'] });
  assert.deepEqual(s.tools.map((t) => t.name), ['a', 'c']);
  assert.equal(s.effective, 'google');
  assert.equal(s.outside, 2);
  assert.equal('note' in s, false);
  for (const lists of [undefined, {}, { google: [] }]) {
    const none = selectToolset(tools, 'google', lists);
    assert.equal(none.tools, tools);
    assert.equal(none.effective, 'all');
    assert.equal(none.note, 'toolset google is not defined for this product yet; showing all tools');
  }
  assert.equal(fallbackNote('google', 'undefined'), 'toolset google is not defined for this product yet; showing all tools');
});

test('curated keeps the curated and gateway tools (and untagged ones), drops generated tools and api_methods; none falls back', () => {
  const tools = [tool('a', 'curated'), tool('b', 'generated'), tool('api_methods', 'generated'), tool('api_search', 'gateway'), tool('api_call', 'gateway'), tool('plain')];
  const s = selectToolset(tools, 'curated', undefined);
  assert.deepEqual(s.tools.map((t) => t.name), ['a', 'api_search', 'api_call', 'plain']);
  assert.equal(s.outside, 2);
  const generatedOnly = [tool('b', 'generated'), tool('api_methods', 'generated')];
  const none = selectToolset(generatedOnly, 'curated', undefined);
  assert.equal(none.tools, generatedOnly);
  assert.equal(none.effective, 'all');
  assert.equal(none.note, 'toolset curated has no tools for this product (it has no hand-written or gateway tools); showing all tools');
});

test('api_methods inside a toolset lists only the methods whose tools are in it', async () => {
  const rows = [
    { method: 'x.a', tool: 'a', httpMethod: 'GET', kind: 'read', description: '' },
    { method: 'x.b', tool: 'b', httpMethod: 'GET', kind: 'read', description: '' },
  ];
  const list = tool('api_methods', 'generated', { handler: async () => rows });
  const tools = [tool('a', 'generated'), tool('b', 'generated'), list];
  const s = selectToolset(tools, 'google', { google: ['a', 'api_methods'] });
  const narrowed = s.tools.find((t) => t.name === 'api_methods');
  assert.notEqual(narrowed, list, 'a new tool; the original is not changed');
  assert.deepEqual(await narrowed.handler({}, {}), [rows[0]]);
  assert.match(narrowed.description, /In the toolset "google" it lists only the methods whose tools are in that toolset\.$/);
  assert.deepEqual(await list.handler({}, {}), rows);
});

test('withOrigin tags copies and leaves the input tools unchanged', () => {
  const input = [tool('a'), tool('b')];
  const tagged = withOrigin('generated', input);
  assert.deepEqual(tagged.map((t) => t.origin), ['generated', 'generated']);
  assert.equal(input.some((t) => 'origin' in t), false);
  assert.equal(tagged[0].handler, input[0].handler);
});

// ---------------------------------------------------------------------------
// The data: config/products.json, config/servers.json and the plugin files

test('every tool a listed toolset names exists in the plugin tool map, and the three copies of the list agree', () => {
  const products = readJson('config', 'products.json').products;
  const servers = readJson('config', 'servers.json').servers;
  let listed = 0;
  for (const [id, product] of Object.entries(products)) {
    const server = servers.find((s) => s.plugin === id);
    const fromProducts = Object.fromEntries(Object.entries(product.toolsets ?? {}).map(([k, v]) => [k, v.tools]));
    assert.deepEqual(server.toolsets ?? {}, fromProducts, `${id}: config/servers.json is stale (node scripts/gen-servers.mjs)`);
    const plugin = readJson('plugins', id, 'servers.json').servers[0];
    assert.deepEqual(plugin.toolsets ?? {}, fromProducts, `${id}: plugins/${id}/servers.json is stale (npm run build)`);
    const names = new Set(readJson('plugins', id, 'tool-map.json').map((t) => t.name.slice(`mcp__plugin_${id}_${server.name}__`.length)));
    for (const [toolset, list] of Object.entries(fromProducts)) {
      for (const name of list) {
        assert.ok(names.has(name), `${id}: toolset ${toolset} names ${name}, which is not in plugins/${id}/tool-map.json`);
        listed += 1;
      }
    }
  }
  assert.ok(listed >= GMAIL_GOOGLE.length);
  assert.deepEqual(products.gmail.toolsets.google.tools, GMAIL_GOOGLE);
});

test('the gmail google list names the official Google tool each one matches (or says why it is kept)', () => {
  const google = readJson('config', 'products.json').products.gmail.toolsets.google;
  const official = new Set(Object.values(google.matches).flat());
  // The 11 tools of Google's Gmail MCP server (developers.google.com/workspace/gmail/api/reference/mcp/tools_list).
  for (const name of ['search_threads', 'get_thread', 'get_message', 'list_drafts', 'create_draft', 'list_labels', 'create_label', 'label_thread', 'unlabel_thread', 'label_message', 'unlabel_message']) {
    assert.ok(official.has(name), `no tool of ours matches ${name}`);
  }
  assert.deepEqual(google.matches.gmail_send_draft, []);
  assert.match(google.notes.gmail_send_draft, /no send tool/);
});

test('the gcalendar google list covers the 9 tools of Google\'s Calendar MCP server, and search_events says why it is a keyword search', () => {
  const google = readJson('config', 'products.json').products.gcalendar.toolsets.google;
  assert.deepEqual(google.tools, [
    'calendar_list_calendars',
    'calendar_list_events',
    'calendar_get_event',
    'calendar_suggest_time',
    'calendar_create_event',
    'calendar_update_event',
    'calendar_delete_event',
    'calendar_respond',
  ]);
  const official = new Set(Object.values(google.matches).flat());
  // developers.google.com/workspace/calendar/api/v3/reference/mcp/tools_list
  for (const name of ['list_events', 'get_event', 'list_calendars', 'suggest_time', 'create_event', 'update_event', 'delete_event', 'respond_to_event', 'search_events']) {
    assert.ok(official.has(name), `no tool of ours matches ${name}`);
  }
  assert.equal(official.size, 9);
  assert.match(google.notes.calendar_list_events, /semantic search of the primary calendar with no public API/);
});

test('the gdrive google list covers the 20 tools of Google\'s Drive, Docs, Sheets and Slides MCP servers', () => {
  const google = readJson('config', 'products.json').products.gdrive.toolsets.google;
  assert.equal(google.tools.length, 19);
  const official = new Set(Object.values(google.matches).flat());
  const expected = [
    // Drive (developers.google.com/workspace/drive/api/reference/mcp/tools_list)
    'search_files', 'list_recent_files', 'get_file_metadata', 'get_file_permissions', 'read_file_content', 'download_file_content', 'create_file', 'copy_file',
    // Docs, Sheets, Slides
    'read_doc', 'update_doc',
    'get_values', 'get_spreadsheet', 'update_spreadsheet', 'update_values', 'update_formulas', 'insert_dimension',
    'read_presentation', 'read_slide_page', 'read_slide_page_thumbnail', 'update_presentation',
  ];
  for (const name of expected) assert.ok(official.has(name), `no tool of ours matches ${name}`);
  assert.equal(official.size, 20);
  assert.deepEqual(google.matches.sheets_write_values, ['update_values', 'update_formulas']);
  assert.match(google.notes.drive_read_text, /PDF and image text is not read/);
});

test("the gcloud google list covers the tools of Google's Cloud MCP servers for its APIs, without a shell command", () => {
  const google = readJson('config', 'products.json').products.gcloud.toolsets.google;
  assert.equal(google.tools.length, 59);
  assert.equal(google.source.length, 8);
  const official = new Set(Object.values(google.matches).flat());
  // docs.cloud.google.com/<product>/.../mcp/tools_list: Resource Manager, API Keys, BigQuery, IAM, Logging, Monitoring,
  // Cloud Storage, and the Cloud Billing tools that are not SKU groups or billing-account SKU and service listings.
  const expected = {
    resourcemanager: ['search_projects'],
    apikeys: ['apikeys_list_keys', 'apikeys_get_key', 'apikeys_get_key_string', 'apikeys_create_key', 'apikeys_update_key', 'apikeys_delete_key', 'apikeys_undelete_key', 'apikeys_lookup_key'],
    bigquery: ['list_dataset_ids', 'get_dataset_info', 'list_table_ids', 'get_table_info', 'execute_sql_readonly', 'execute_sql', 'get_query_results', 'cancel_job', 'get_job'],
    billing: [
      'get_billing_account', 'list_billing_accounts', 'create_billing_account', 'move_billing_account', 'get_iam_policy', 'set_iam_policy', 'test_iam_permissions',
      'get_project_billing_info', 'list_project_billing_info', 'list_prices', 'get_price', 'list_billing_account_prices', 'get_billing_account_price',
      'list_services', 'get_service', 'list_skus', 'get_sku',
    ],
    iam: ['list_deny_policies', 'get_deny_policy', 'create_deny_policy', 'update_deny_policy', 'delete_deny_policy', 'get_deny_policy_status', 'list_roles', 'get_role'],
    logging: ['list_log_entries'],
    monitoring: ['list_timeseries', 'query_range', 'get_alert_policy', 'list_alert_policies', 'get_alert', 'list_alerts', 'list_metric_descriptors', 'list_dashboards', 'get_dashboard'],
    storage: ['list_buckets', 'list_objects', 'create_bucket', 'delete_bucket', 'read_text', 'read_object', 'write_text', 'delete_object', 'get_object_metadata'],
  };
  for (const [area, names] of Object.entries(expected)) for (const name of names) assert.ok(official.has(name), `${area}: no tool of ours matches ${name}`);
  assert.equal(official.size, Object.values(expected).flat().length);
  // Not copied: Google's shell-command tools would bypass the approval gate.
  assert.equal(google.tools.some((t) => /gcloud_command|bq_command/.test(t)), false);
  assert.equal(official.has('run_gcloud_command'), false);
  for (const name of ['cloud_project_iam_policy', 'bq_table_preview']) assert.deepEqual(google.matches[name], [], name);
  assert.match(google.notes.gcs_write_text, /does not replace an existing object unless overwrite is true/);
  assert.match(google.notes.iam_roles_list, /readonly login cannot run it/);
});

test('the gsc google list is a lean set: no official server, so every tool says why it is kept', () => {
  const google = readJson('config', 'products.json').products.gsc.toolsets.google;
  assert.deepEqual(google.tools, GSC_GOOGLE);
  assert.match(google.source, /^No official Google MCP server for Search Console was found/);
  for (const tool of google.tools) {
    assert.deepEqual(google.matches[tool], [], tool);
    assert.ok(typeof google.notes[tool] === 'string' && google.notes[tool].length > 10, `${tool} has a note`);
  }
  // The deletes, the property add and the generated duplicates stay in the all toolset.
  for (const name of ['sc_site_delete', 'sc_sitemap_delete', 'sc_site_add', 'searchcons_searchanalytics_query']) assert.equal(google.tools.includes(name), false, name);
  assert.match(google.notes.indexing_url_notifications_publish, /JobPosting or BroadcastEvent/);
});

test("the gchat google list covers the 9 tools of Google's Chat MCP server, with chat_list_members for list_memberships", () => {
  const google = readJson('config', 'products.json').products.gchat.toolsets.google;
  assert.deepEqual(google.tools, CHAT_GOOGLE);
  assert.equal(google.source, 'https://developers.google.com/workspace/chat/api/reference/mcp/tools_list');
  const official = new Set(Object.values(google.matches).flat());
  // developers.google.com/workspace/chat/api/reference/mcp/tools_list
  for (const name of ['search_conversations', 'list_messages', 'search_messages', 'send_message', 'list_memberships', 'mark_as_read', 'mark_as_unread', 'get_notification_settings', 'update_notification_settings']) {
    assert.ok(official.has(name), `no tool of ours matches ${name}`);
  }
  assert.equal(official.size, 9);
  // The generated members list names the Chat app scopes (chat.bot, chat.import); the curated one stands in for it.
  assert.equal(google.tools.includes('chat_spaces_members_list'), false);
  assert.match(google.notes.chat_list_members, /chat\.bot/);
  assert.match(google.notes.chat_mark_read, /no public REST method/);
});

test("the gcontacts google list covers the 3 tools of Google's People MCP server, and leaves out the gateway", () => {
  const google = readJson('config', 'products.json').products.gcontacts.toolsets.google;
  assert.deepEqual(google.tools, CONTACTS_GOOGLE);
  assert.equal(google.source, 'https://developers.google.com/people/api/mcp/tools_list');
  assert.deepEqual(google.matches, { contacts_search_directory: ['search_directory_people'], contacts_search: ['search_contacts'], profile_me: ['get_user_profile'] });
  assert.equal(google.tools.includes('api_call'), false, 'no gateway method counts toward its scopes');
  assert.match(google.notes.contacts_search, /warm-up/);
});

test("the gclassroom google list covers 15 of the 16 tools of Google's Classroom MCP server; search_course_standards has no public method", () => {
  const google = readJson('config', 'products.json').products.gclassroom.toolsets.google;
  assert.deepEqual(google.tools, CLASSROOM_GOOGLE);
  assert.equal(google.source, 'https://developers.google.com/workspace/classroom/reference/mcp/tools_list');
  const official = new Set(Object.values(google.matches).flat());
  const expected = [
    'list_courses', 'list_course_work_summaries', 'get_course_work', 'create_course_work', 'update_course_work', 'list_course_work_submissions',
    'list_topics', 'create_topic', 'list_announcement_summaries', 'get_announcements', 'create_announcement',
    'get_course_work_rubric', 'create_course_work_rubric', 'get_course_roster', 'get_guardian_info',
  ];
  for (const name of expected) assert.ok(official.has(name), `no tool of ours matches ${name}`);
  assert.equal(official.size, 15);
  assert.equal(official.has('search_course_standards'), false);
  assert.match(google.notes.classroom_create_rubric, /search_course_standards, which has no public REST method/);
  assert.deepEqual(google.matches.classroom_get_course, []);
});

test('the gmeet, gtasks and gapps google lists are lean sets: no official server, every tool says why it is kept', () => {
  const products = readJson('config', 'products.json').products;
  const names = { gmeet: 'Google Meet', gtasks: 'Google Tasks or Google Keep', gapps: 'Apps Script' };
  for (const [id, tools] of Object.entries(LEAN_GOOGLE)) {
    const google = products[id].toolsets.google;
    assert.deepEqual(google.tools, tools, id);
    assert.ok(google.source.startsWith(`No official Google MCP server for ${names[id]} was found`), id);
    for (const tool of tools) {
      assert.deepEqual(google.matches[tool], [], `${id}/${tool}`);
      assert.ok(typeof google.notes[tool] === 'string' && google.notes[tool].length > 10, `${id}/${tool} has a note`);
    }
  }
  // Kept out: the member and space deletes of Meet, the list deletes and clear of Tasks, the Keep writes, the Apps Script
  // deployment delete and the Marketplace licence reads.
  for (const name of ['meet_spaces_members_delete', 'meet_spaces_end_active_conference']) assert.equal(LEAN_GOOGLE.gmeet.includes(name), false, name);
  for (const name of ['tasks_tasklists_delete', 'tasks_tasks_clear', 'keep_notes_create', 'keep_notes_delete']) assert.equal(LEAN_GOOGLE.gtasks.includes(name), false, name);
  for (const name of ['appsscript_projects_deployments_delete', 'appsmarket_user_license_get']) assert.equal(LEAN_GOOGLE.gapps.includes(name), false, name);
  // The kinds in the plugin tool maps: scripts.run is destructive, tasks.delete is destructive, the rest as classified.
  const kindOf = (id, tool) => readJson('plugins', id, 'tool-map.json').find((t) => t.name === `mcp__plugin_${id}_${id}__${tool}`).kind;
  assert.equal(kindOf('gapps', 'appsscript_scripts_run'), 'destructive');
  assert.equal(kindOf('gtasks', 'tasks_tasks_delete'), 'destructive');
  assert.equal(kindOf('gmeet', 'meet_spaces_create'), 'write');
  assert.match(products.gapps.toolsets.google.notes.appsscript_scripts_run, /asks twice/);
});

test('both registry loaders carry the toolsets: the CLI conversion of config/products.json and a plugin servers.json', () => {
  const reg = registryFromProducts(readJson('config', 'products.json'), ROOT);
  assert.deepEqual(reg.servers.find((s) => s.name === 'gmail').toolsets, { google: GMAIL_GOOGLE });
  assert.deepEqual(reg.servers.find((s) => s.name === 'gsc').toolsets, { google: GSC_GOOGLE });
  assert.deepEqual(reg.servers.find((s) => s.name === 'gchat').toolsets, { google: CHAT_GOOGLE });
  assert.deepEqual(reg.servers.find((s) => s.name === 'gcontacts').toolsets, { google: CONTACTS_GOOGLE });
  assert.deepEqual(reg.servers.find((s) => s.name === 'gclassroom').toolsets, { google: CLASSROOM_GOOGLE });
  for (const [id, tools] of Object.entries(LEAN_GOOGLE)) assert.deepEqual(reg.servers.find((s) => s.name === id).toolsets, { google: tools }, id);
  assert.deepEqual(reg.servers.find((s) => s.name === 'gads').toolsets, { google: ADS_GOOGLE });
  assert.equal(reg.servers.find((s) => s.name === 'gyoutube').toolsets, undefined);
  const plugin = loadRegistryFile(join(ROOT, 'plugins', 'gmail', 'servers.json'));
  assert.deepEqual(plugin.servers[0].toolsets, { google: GMAIL_GOOGLE });
});

/** Runs a copy of scripts/gen-servers.mjs on a products.json with one product, in a temp root. */
function genServers(product) {
  const root = tempDir('gsm-gen-servers-');
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'config'));
  cpSync(join(ROOT, 'scripts', 'gen-servers.mjs'), join(root, 'scripts', 'gen-servers.mjs'));
  const base = { title: 'X', description: 'X.', group: 'workspace-user', server: { name: 'gx', curated: null }, generated: [{ api: 'gmail', version: 'v1' }] };
  writeFileSync(join(root, 'config', 'products.json'), JSON.stringify({ products: { gx: { ...base, ...product } } }));
  const res = spawnSync(process.execPath, [join(root, 'scripts', 'gen-servers.mjs')], { encoding: 'utf8' });
  const out = join(root, 'config', 'servers.json');
  return { status: res.status, stderr: res.stderr, map: existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : undefined };
}

test('gen-servers copies a valid toolset and rejects unknown or implicit names, unmatched tools and duplicates', () => {
  const ok = genServers({ toolsets: { google: { tools: ['a_b', 'c'], matches: { a_b: ['official_a'], c: [] }, notes: { c: 'why' } } } });
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(ok.map.servers[0].toolsets, { google: ['a_b', 'c'] });
  const none = genServers({});
  assert.equal(none.status, 0, none.stderr);
  assert.equal('toolsets' in none.map.servers[0], false, 'a product without toolsets gets no key');

  const refused = [
    [{ lean: { tools: ['a'], matches: { a: ['x'] } } }, /unknown toolset "lean"/],
    [{ all: { tools: ['a'], matches: { a: ['x'] } } }, /"all" is implicit/],
    [{ curated: { tools: ['a'], matches: { a: ['x'] } } }, /"curated" is implicit/],
    [{ google: { tools: ['a'], matches: {} } }, /matches\["a"\] must list/],
    [{ google: { tools: ['a'], matches: { a: [] } } }, /needs a note/],
    [{ google: { tools: ['a', 'a'], matches: { a: ['x'] } } }, /lists a tool twice/],
    [{ google: { tools: [], matches: {} } }, /non-empty list/],
    [{ google: ['a'] }, /must be an object with tools and matches/],
    // source: a URL or a list of URLs; text only when no tool matches an official one.
    [{ google: { tools: ['a'], matches: { a: ['x'] }, source: 'Google has none' } }, /source must be a URL or a list of URLs$/m],
    [{ google: { tools: ['a'], matches: { a: ['x'] }, source: [] } }, /source must be a URL or a list of URLs/],
    [{ google: { tools: ['a'], matches: { a: ['x'] }, source: ['https://a', 'b'] } }, /source must be a URL or a list of URLs/],
    [{ google: { tools: ['a'], matches: { a: [] }, notes: { a: 'n' }, source: '  ' } }, /or text that says there is no official server/],
  ];
  for (const source of ['https://a.example/tools', ['https://a.example', 'https://b.example']]) {
    const res = genServers({ toolsets: { google: { tools: ['a'], matches: { a: ['x'] }, source } } });
    assert.equal(res.status, 0, res.stderr);
  }
  const lean = genServers({ toolsets: { google: { tools: ['a'], matches: { a: [] }, notes: { a: 'n' }, source: 'No official Google MCP server; a lean set chosen here.' } } });
  assert.equal(lean.status, 0, lean.stderr);
  assert.deepEqual(lean.map.servers[0].toolsets, { google: ['a'] }, 'the source stays in config/products.json');
  for (const [toolsets, message] of refused) {
    const res = genServers({ toolsets });
    assert.notEqual(res.status, 0, JSON.stringify(toolsets));
    assert.match(res.stderr, message);
    assert.equal(res.map, undefined, 'nothing is written');
  }
});

test('plugin manifests: every .mcp.json passes GSM_TOOLSET from the toolset option, which defaults to all', () => {
  const products = readJson('config', 'products.json').products;
  for (const id of Object.keys(products)) {
    const servers = readJson('plugins', id, '.mcp.json').mcpServers;
    for (const server of Object.values(servers)) assert.equal(server.env.GSM_TOOLSET, '${user_config.toolset}', id);
    const manifest = readJson('plugins', id, '.claude-plugin', 'plugin.json');
    assert.deepEqual(Object.keys(manifest.userConfig.toolset).sort(), ['default', 'description', 'options', 'title', 'type']);
    assert.equal(manifest.userConfig.toolset.type, 'string');
    assert.equal(manifest.userConfig.toolset.title, 'Toolset');
    assert.deepEqual(manifest.userConfig.toolset.options, ['all', 'google', 'curated']);
    assert.equal(manifest.userConfig.toolset.default, 'all');
    assert.match(manifest.userConfig.toolset.description, /^Which tools this server lists\. all: every tool \(the default\)\./);
  }
});

// ---------------------------------------------------------------------------
// The real server

/** The entry scripts/bundle.mjs writes for the gmail product: curated, generated and gateway tools, each tagged. */
function gmailEntry(dir) {
  const entry = join(dir, 'gmail-entry.mjs');
  const gateway = readJson('config', 'servers.json').servers.find((s) => s.name === 'gmail').gatewayApis;
  writeFileSync(
    entry,
    [
      `import { withOrigin } from '${dist('core/toolset.js')}';`,
      `import { buildTools as curatedTools } from '${dist('servers/gmail.js')}';`,
      `import { discoveryToolsFor, toolNamesOf } from '${dist('core/discovery/tools.js')}';`,
      `import { gatewayTools } from '${dist('core/gateway.js')}';`,
      `import { runServer } from '${dist('core/tools.js')}';`,
      `await runServer({ name: 'gmail', version: '0.0.0', buildTools: async (cfg) => {`,
      `  const curated = await curatedTools(cfg);`,
      `  return [`,
      `    ...withOrigin('curated', curated),`,
      `    ...withOrigin('generated', await discoveryToolsFor('gmail', cfg, toolNamesOf(curated))),`,
      `    ...withOrigin('gateway', gatewayTools({ product: 'gmail', group: 'workspace-user', apis: ${JSON.stringify(gateway)}, cfg })),`,
      `  ];`,
      `} });`,
      '',
    ].join('\n'),
  );
  return entry;
}

/** The YouTube server: generated tools only, no toolset listed. (gtasks has a lean list since 1.15.0.) */
function gyoutubeEntry(dir) {
  const entry = join(dir, 'gyoutube-entry.mjs');
  writeFileSync(
    entry,
    [
      `import { withOrigin } from '${dist('core/toolset.js')}';`,
      `import { discoveryToolsFor } from '${dist('core/discovery/tools.js')}';`,
      `import { runServer } from '${dist('core/tools.js')}';`,
      `await runServer({ name: 'gyoutube', version: '0.0.0', buildTools: async (cfg) => withOrigin('generated', await discoveryToolsFor('gyoutube', cfg, [])) });`,
      '',
    ].join('\n'),
  );
  return entry;
}

/** The search console server (curated and generated; its google toolset is the lean list). */
function gscEntry(dir) {
  const entry = join(dir, 'gsc-entry.mjs');
  writeFileSync(
    entry,
    [
      `import { withOrigin } from '${dist('core/toolset.js')}';`,
      `import { buildTools as curatedTools } from '${dist('servers/searchconsole.js')}';`,
      `import { discoveryToolsFor, toolNamesOf } from '${dist('core/discovery/tools.js')}';`,
      `import { runServer } from '${dist('core/tools.js')}';`,
      `await runServer({ name: 'gsc', version: '0.0.0', buildTools: async (cfg) => {`,
      `  const curated = await curatedTools(cfg);`,
      `  return [...withOrigin('curated', curated), ...withOrigin('generated', await discoveryToolsFor('gsc', cfg, toolNamesOf(curated)))];`,
      `} });`,
      '',
    ].join('\n'),
  );
  return entry;
}

/** A server of curated and generated tools, as scripts/bundle.mjs writes its entry (no gateway). */
function curatedEntry(dir, name, module) {
  const entry = join(dir, `${name}-entry.mjs`);
  writeFileSync(
    entry,
    [
      `import { withOrigin } from '${dist('core/toolset.js')}';`,
      `import { buildTools as curatedTools } from '${dist(`servers/${module}.js`)}';`,
      `import { discoveryToolsFor, toolNamesOf } from '${dist('core/discovery/tools.js')}';`,
      `import { runServer } from '${dist('core/tools.js')}';`,
      `await runServer({ name: '${name}', version: '0.0.0', buildTools: async (cfg) => {`,
      `  const curated = await curatedTools(cfg);`,
      `  return [...withOrigin('curated', curated), ...withOrigin('generated', await discoveryToolsFor('${name}', cfg, toolNamesOf(curated)))];`,
      `} });`,
      '',
    ].join('\n'),
  );
  return entry;
}

/** A temp token folder with a fake token for the group that holds every scope the plugin's tools list. Fake values only. */
function fakeLogin(dir, plugin, group) {
  const tokenDir = join(dir, 'tokens');
  mkdirSync(tokenDir, { recursive: true });
  const scopes = [...new Set(readJson('plugins', plugin, 'tool-map.json').flatMap((t) => t.scopes ?? []))].sort();
  writeFileSync(join(tokenDir, `${group}.token.json`), JSON.stringify({ access_token: 'fake', refresh_token: 'fake', scope: scopes.join(' ') }));
  return tokenDir;
}

function childEnv(dir, tokenDir, extra = {}) {
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && k !== 'GOOGLE_APPLICATION_CREDENTIALS'));
  return { ...base, GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true', APPDATA: join(dir, 'appdata'), CLOUDSDK_CONFIG: join(dir, 'gcloud'), ...extra };
}

async function withClient(entry, env, run) {
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env, stderr: 'pipe' });
  const client = new Client({ name: 'gsm-toolset-test', version: '0.0.0' });
  await client.connect(transport);
  try {
    return await run(client);
  } finally {
    await client.close();
  }
}

const listTools = (client) => client.listTools().then((r) => r.tools.sort((a, b) => (a.name < b.name ? -1 : 1)));
const health = async (client) => JSON.parse((await client.callTool({ name: 'health', arguments: {} })).content[0].text);
const dumpCount = (entry, env) => {
  const res = spawnSync(process.execPath, [entry, '--dump-tools'], { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(res.status, 0, res.stderr);
  return JSON.parse(res.stdout).tools;
};

test('runServer: unset and all list the same tools; google lists the gmail list and the runtime tools; health reports it', async () => {
  const dir = tempDir('gsm-toolset-run-');
  const entry = gmailEntry(dir);
  const tokenDir = fakeLogin(dir, 'gmail', 'workspace-user');

  const unset = await withClient(entry, childEnv(dir, tokenDir), async (c) => ({ tools: await listTools(c), health: await health(c) }));
  const all = await withClient(entry, childEnv(dir, tokenDir, { GSM_TOOLSET: 'all' }), async (c) => ({ tools: await listTools(c), health: await health(c) }));
  assert.deepEqual(all.tools, unset.tools, 'all is the same list, names and schemas');
  assert.ok(unset.tools.length > 90, `${unset.tools.length} tools`);
  assert.equal('toolset' in unset.health, false, 'the default report has no toolset field');
  assert.equal('toolset' in all.health, false);

  const google = await withClient(entry, childEnv(dir, tokenDir, { GSM_TOOLSET: 'google' }), async (c) => ({ tools: await listTools(c), health: await health(c) }));
  assert.deepEqual(google.tools.map((t) => t.name), [...GMAIL_GOOGLE, ...RUNTIME_OAUTH].sort());
  // The kept tools are the same tools: same schemas, descriptions and annotations.
  for (const t of google.tools) assert.deepEqual(t, unset.tools.find((u) => u.name === t.name), t.name);
  assert.deepEqual(google.health.toolset, { requested: 'google', effective: 'google', outsideToolset: unset.tools.length - google.tools.length });

  const curated = await withClient(entry, childEnv(dir, tokenDir, { GSM_TOOLSET: 'curated' }), listTools);
  const curatedNames = curated.map((t) => t.name);
  for (const name of ['gmail_search', 'gmail_get_message', 'gmail_send_draft', 'api_search', 'api_describe', 'api_call', ...RUNTIME_OAUTH]) assert.ok(curatedNames.includes(name), name);
  assert.equal(curatedNames.some((n) => n.startsWith('gmail_users_') || n.startsWith('gmailpostm_') || n === 'api_methods'), false, curatedNames.join(', '));

  // The hook's tool map is built from every tool, whatever the toolset.
  const full = dumpCount(entry, childEnv(dir, tokenDir));
  assert.deepEqual(dumpCount(entry, childEnv(dir, tokenDir, { GSM_TOOLSET: 'google' })), full);
  assert.deepEqual(dumpCount(entry, childEnv(dir, tokenDir, { GSM_TOOLSET: 'curated' })), full);
  assert.ok(full.length > unset.tools.length - RUNTIME_OAUTH.length);
});

test('runServer: google on a product without a list shows every tool, and health and auth_status say why', async () => {
  const dir = tempDir('gsm-toolset-fallback-');
  const entry = gyoutubeEntry(dir);
  const tokenDir = fakeLogin(dir, 'gyoutube', 'business');
  const unset = await withClient(entry, childEnv(dir, tokenDir), listTools);
  await withClient(entry, childEnv(dir, tokenDir, { GSM_TOOLSET: 'google' }), async (c) => {
    assert.deepEqual(await listTools(c), unset);
    const report = await health(c);
    assert.deepEqual(report.toolset, { requested: 'google', effective: 'all', outsideToolset: 0, note: 'toolset google is not defined for this product yet; showing all tools' });
    const status = (await c.callTool({ name: 'auth_status', arguments: {} })).content[0].text;
    assert.match(status, /Toolset: toolset google is not defined for this product yet; showing all tools\.$/);
  });
  const statusAll = await withClient(entry, childEnv(dir, tokenDir), async (c) => (await c.callTool({ name: 'auth_status', arguments: {} })).content[0].text);
  assert.equal(statusAll.includes('Toolset'), false, 'the default status line is unchanged');
});

test('runServer: google on gsc lists the lean list and the runtime tools, with the same schemas as all', async () => {
  const dir = tempDir('gsm-toolset-gsc-');
  const entry = gscEntry(dir);
  const tokenDir = fakeLogin(dir, 'gsc', 'searchconsole');
  const unset = await withClient(entry, childEnv(dir, tokenDir), listTools);
  const google = await withClient(entry, childEnv(dir, tokenDir, { GSM_TOOLSET: 'google' }), async (c) => ({ tools: await listTools(c), health: await health(c) }));
  assert.deepEqual(google.tools.map((t) => t.name), [...GSC_GOOGLE, ...RUNTIME_OAUTH].sort());
  for (const t of google.tools) assert.deepEqual(t, unset.find((u) => u.name === t.name), t.name);
  assert.deepEqual(google.health.toolset, { requested: 'google', effective: 'google', outsideToolset: unset.length - google.tools.length });
});

test('runServer: google on gchat lists its 9 tools and the runtime tools, with the same schemas as all', async () => {
  const dir = tempDir('gsm-toolset-gchat-');
  const entry = curatedEntry(dir, 'gchat', 'gchat');
  const tokenDir = fakeLogin(dir, 'gchat', 'workspace-user');
  const unset = await withClient(entry, childEnv(dir, tokenDir), listTools);
  const google = await withClient(entry, childEnv(dir, tokenDir, { GSM_TOOLSET: 'google' }), async (c) => ({ tools: await listTools(c), health: await health(c) }));
  assert.deepEqual(google.tools.map((t) => t.name), [...CHAT_GOOGLE, ...RUNTIME_OAUTH].sort());
  for (const t of google.tools) assert.deepEqual(t, unset.find((u) => u.name === t.name), t.name);
  assert.deepEqual(google.health.toolset, { requested: 'google', effective: 'google', outsideToolset: unset.length - google.tools.length });
});

test('runServer: google on gcontacts lists its 3 tools and the runtime tools, with the same schemas as all', async () => {
  const dir = tempDir('gsm-toolset-gcontacts-');
  const entry = curatedEntry(dir, 'gcontacts', 'gcontacts');
  const tokenDir = fakeLogin(dir, 'gcontacts', 'workspace-user');
  const unset = await withClient(entry, childEnv(dir, tokenDir), listTools);
  const google = await withClient(entry, childEnv(dir, tokenDir, { GSM_TOOLSET: 'google' }), listTools);
  assert.deepEqual(google.map((t) => t.name), [...CONTACTS_GOOGLE, ...RUNTIME_OAUTH].sort());
  for (const t of google) assert.deepEqual(t, unset.find((u) => u.name === t.name), t.name);
  for (const name of CONTACTS_GOOGLE) assert.equal(google.find((t) => t.name === name).annotations.readOnlyHint, true, name);
});

test('runServer: google on gclassroom lists its 20 tools and the runtime tools, with the same schemas as all', async () => {
  const dir = tempDir('gsm-toolset-gclassroom-');
  const entry = curatedEntry(dir, 'gclassroom', 'gclassroom');
  const tokenDir = fakeLogin(dir, 'gclassroom', 'workspace-user');
  const unset = await withClient(entry, childEnv(dir, tokenDir), listTools);
  const google = await withClient(entry, childEnv(dir, tokenDir, { GSM_TOOLSET: 'google' }), listTools);
  assert.deepEqual(google.map((t) => t.name), [...CLASSROOM_GOOGLE, ...RUNTIME_OAUTH].sort());
  for (const t of google) assert.deepEqual(t, unset.find((u) => u.name === t.name), t.name);
});

test('runServer: google on gads lists its 3 reads and the runtime tools, with the same schemas as all; ads_mutate is hidden', async () => {
  const dir = tempDir('gsm-toolset-gads-');
  const entry = curatedEntry(dir, 'gads', 'gads');
  const tokenDir = fakeLogin(dir, 'gads', 'business');
  const unset = await withClient(entry, childEnv(dir, tokenDir), listTools);
  assert.ok(unset.some((t) => t.name === 'ads_mutate'));
  const google = await withClient(entry, childEnv(dir, tokenDir, { GSM_TOOLSET: 'google' }), async (c) => ({ tools: await listTools(c), health: await health(c) }));
  assert.deepEqual(google.tools.map((t) => t.name), [...ADS_GOOGLE, ...RUNTIME_OAUTH].sort());
  for (const t of google.tools) assert.deepEqual(t, unset.find((u) => u.name === t.name), t.name);
  for (const name of ADS_GOOGLE) assert.equal(google.tools.find((t) => t.name === name).annotations.readOnlyHint, true, name);
  assert.deepEqual(google.health.toolset, { requested: 'google', effective: 'google', outsideToolset: unset.length - google.tools.length });
});

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

test('runServer: google on gmeet, gtasks and gapps lists the lean list and the runtime tools, with the same schemas as all', async () => {
  for (const [id, tools] of Object.entries(LEAN_GOOGLE)) {
    const dir = tempDir(`gsm-toolset-${id}-`);
    const entry = generatedEntry(dir, id);
    const tokenDir = fakeLogin(dir, id, 'workspace-user');
    const unset = await withClient(entry, childEnv(dir, tokenDir), listTools);
    const google = await withClient(entry, childEnv(dir, tokenDir, { GSM_TOOLSET: 'google' }), async (c) => ({ tools: await listTools(c), health: await health(c) }));
    assert.deepEqual(google.tools.map((t) => t.name), [...tools, ...RUNTIME_OAUTH].sort(), id);
    for (const t of google.tools) assert.deepEqual(t, unset.find((u) => u.name === t.name), `${id}/${t.name}`);
    assert.deepEqual(google.health.toolset, { requested: 'google', effective: 'google', outsideToolset: unset.length - google.tools.length }, id);
  }
});
