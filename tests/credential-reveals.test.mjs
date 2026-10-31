// Credential reveals (1.26.2). A read never asks the user (CLAUDE.md), so no read may hand the model a credential.
// Two mechanisms close the hole, and this file pins both:
//   1. A method whose purpose is to return a credential is a write in config/tool-kinds.json. Both classifiers give
//      write, the built plugins carry it, the plugin's own hook asks, and a server with writes off does not list it.
//   2. A read that returns a credential as one field among many keeps working, and that field is replaced in its result
//      (src/core/credential-fields.ts), by the method's response schema, in a generated tool and through api_call.
// The contract scans: every Discovery snapshot (data/discovery) is walked from each read method's response schema, and
// every credential-like property must be listed, or reviewed below as not a credential. The catalog is scanned by method
// id. A new credential field or method that appears after a Discovery refresh fails here until it has a decision.
// The gateway-only APIs have no snapshot; tests/fixtures/credential-schemas.json holds their schemas, pruned from
// Google's Discovery documents to the properties on the way to a listed field.
// Every test works in temp folders. No network call is made: responses are fakes, and the write is declined at the gate.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const { CREDENTIAL_FIELDS, credentialFieldsOf, redactCredentials, redactedText } = await import(dist('core/credential-fields.js'));
const { generateDiscoveryTools, loadToolKinds } = await import(dist('core/discovery/tools.js'));
const apiKeyClient = await import(dist('core/discovery/apikey-client.js'));
const gw = await import(dist('core/gateway.js'));
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
const dataDirBefore = process.env.GSM_DATA_DIR;
afterEach(() => {
  apiKeyClient.setFetchForTests(undefined);
  gw.setRequestForTests(undefined);
  gw.setFetchForTests(undefined);
  // The gateway tests point GSM_DATA_DIR at a temp catalog; nothing after them may inherit it.
  if (dataDirBefore === undefined) delete process.env.GSM_DATA_DIR;
  else process.env.GSM_DATA_DIR = dataDirBefore;
});

const kindsFile = readJson('config', 'tool-kinds.json');
const overrides = Object.fromEntries(Object.entries(kindsFile).filter(([key]) => key !== 'notes'));
const nameOf = (id) => id.slice(id.lastIndexOf('.') + 1);
const full = (plugin, tool) => `mcp__plugin_${plugin}_${plugin}__${tool}`;
const catalog = readJson('data', 'catalog.json');
const servers = readJson('config', 'servers.json').servers;
const fixture = readJson('tests', 'fixtures', 'credential-schemas.json');

/**
 * The credential reveals that are writes (owner-approved, spec 2026-10-30-adversarial-review, decision 1). Per method:
 * the plugin, its generated tool when there is one, whether a gateway API of the plugin carries it, and Google's words.
 */
const WRITES = [
  { id: 'secretmanager.projects.secrets.versions.access', plugin: 'gcloud', gateway: true, evidence: 'This call returns the secret data.' },
  { id: 'secretmanager.projects.locations.secrets.versions.access', plugin: 'gcloud', gateway: true, evidence: 'This call returns the secret data.' },
  { id: 'apigee.organizations.developers.apps.keys.get', plugin: 'gcloud', gateway: true, evidence: 'including the key and secret value' },
  { id: 'apigee.organizations.appgroups.apps.keys.get', plugin: 'gcloud', gateway: true, evidence: 'including the key and secret value' },
  { id: 'integrations.projects.locations.authConfigs.get', plugin: 'gcloud', gateway: true, evidence: 'Returns the decrypted auth config.' },
  { id: 'integrations.projects.locations.products.authConfigs.get', plugin: 'gcloud', gateway: true, evidence: 'Returns the decrypted auth config.' },
  {
    id: 'analyticsadmin.properties.dataStreams.measurementProtocolSecrets.get',
    plugin: 'ganalytics',
    tool: 'gaadmin_prope_data_measur_get',
    gateway: true,
    evidence: 'secretValue: Output only. The measurement protocol secret value.',
  },
  {
    id: 'androidenterprise.enterprises.getServiceAccount',
    plugin: 'gplay',
    tool: 'androident_enterprises_get_service_acco',
    gateway: false,
    evidence: 'Returns a service account and credentials ... The credentials contain private key data',
  },
  { id: 'androidmanagement.enterprises.enrollmentTokens.get', plugin: 'gplay', gateway: true, evidence: 'Only the following fields are populated: name, expirationTimestamp, allowPersonalUsage, value, qrCode.' },
  { id: 'androidmanagement.enterprises.migrationTokens.get', plugin: 'gplay', gateway: true, evidence: 'value: Output only. The value of the migration token.' },
  {
    id: 'identitytoolkit.relyingparty.getOobConfirmationCode',
    plugin: 'gfirebase',
    tool: 'identityto_relyingpa_get_oob_co',
    gateway: false,
    evidence: 'oobCode: The code to be send to the user. (reset password, change email)',
  },
  {
    id: 'directory.verificationCodes.list',
    plugin: 'gadmin',
    tool: 'admin_verification_codes_list',
    gateway: false,
    evidence: 'Returns the current set of valid backup verification codes for the specified user.',
  },
  { id: 'redis.projects.locations.instances.getAuthString', plugin: 'gcloud', gateway: true, evidence: 'Gets the AUTH string for a Redis instance.' },
  { id: 'compute.interconnects.getMacsecConfig', plugin: 'gcloud', gateway: true, evidence: 'cak: An auto-generated Connectivity Association Key (CAK) for this key.' },
  { id: 'aiplatform.vertexExpress.retrieveExpressProject', plugin: 'gai', gateway: true, evidence: 'defaultApiKey: Output only. The default API key string of the project.' },
  {
    id: 'parametermanager.projects.locations.parameters.versions.render',
    plugin: 'gcloud',
    gateway: true,
    evidence: 'renderedPayload: ... substitutions of all (if any) references to a SecretManager SecretVersion resources.',
  },
  {
    id: 'parametermanager.projects.locations.templates.versions.render',
    plugin: 'gcloud',
    gateway: true,
    evidence: 'renderedPayload: ... all the variables resolved using the provided parameter version.',
  },
];

/**
 * Reads that return a credential among other fields. They stay reads, and the listed fields are replaced. Per method:
 * the Discovery document (snapshot or fixture) and the fields it must reach.
 */
const REDACTED_READS = [
  { id: 'youtube.liveStreams.list', doc: 'youtube.v3', fields: ['IngestionInfo.streamName'] },
  { id: 'identitytoolkit.relyingparty.getAccountInfo', doc: 'identitytoolkit.v3', fields: ['UserInfo.passwordHash', 'UserInfo.salt'] },
  { id: 'identitytoolkit.relyingparty.downloadAccount', doc: 'identitytoolkit.v3', fields: ['UserInfo.passwordHash', 'UserInfo.salt'] },
  { id: 'identitytoolkit.relyingparty.getProjectConfig', doc: 'identitytoolkit.v3', fields: ['IdpConfig.secret'] },
  { id: 'identitytoolkit.projects.accounts.lookup', doc: 'identitytoolkit.v1', fields: ['GoogleCloudIdentitytoolkitV1UserInfo.passwordHash', 'GoogleCloudIdentitytoolkitV1UserInfo.salt'] },
  { id: 'identitytoolkit.projects.accounts.batchGet', doc: 'identitytoolkit.v1', fields: ['GoogleCloudIdentitytoolkitV1UserInfo.passwordHash', 'GoogleCloudIdentitytoolkitV1UserInfo.salt'] },
  { id: 'identitytoolkit.projects.accounts.query', doc: 'identitytoolkit.v1', fields: ['GoogleCloudIdentitytoolkitV1UserInfo.passwordHash', 'GoogleCloudIdentitytoolkitV1UserInfo.salt'] },
  { id: 'identitytoolkit.projects.getConfig', doc: 'identitytoolkit.v2', fields: ['GoogleCloudIdentitytoolkitAdminV2HashConfig.signerKey'] },
  { id: 'analyticsadmin.properties.dataStreams.measurementProtocolSecrets.list', doc: 'analyticsadmin.v1beta', fields: ['GoogleAnalyticsAdminV1betaMeasurementProtocolSecret.secretValue'] },
  { id: 'analyticsadmin.properties.dataStreams.measurementProtocolSecrets.list', doc: 'analyticsadmin.v1alpha', fields: ['GoogleAnalyticsAdminV1alphaMeasurementProtocolSecret.secretValue'] },
  { id: 'integrations.projects.locations.authConfigs.list', doc: 'integrations.v1', fields: ['GoogleCloudIntegrationsV1alphaAuthConfig.decryptedCredential'] },
  { id: 'androidmanagement.enterprises.enrollmentTokens.list', doc: 'androidmanagement.v1', fields: ['EnrollmentToken.value', 'EnrollmentToken.qrCode'] },
  { id: 'androidmanagement.enterprises.migrationTokens.list', doc: 'androidmanagement.v1', fields: ['MigrationToken.value'] },
  { id: 'androidmanagement.enterprises.get', doc: 'androidmanagement.v1', fields: ['SigninDetail.signinEnrollmentToken', 'SigninDetail.qrCode'] },
];

/**
 * Credential-like properties that a read returns in the Discovery snapshots, reviewed and not a credential the read
 * gives away. Key: "<document name>|<schema>|<property>". A new one makes the snapshot scan fail until it is decided.
 */
const REVIEWED = {
  'admin|MobileDevice|devicePasswordStatus': 'a status, not a password',
  'admin|User|password': "Google: the password value is never returned in the API's response body",
  'analyticsadmin|GoogleAnalyticsAdminV1betaChangeHistoryChangeChangeHistoryResource|measurementProtocolSecret': 'a container: its secretValue is listed',
  'analyticsadmin|GoogleAnalyticsAdminV1betaListMeasurementProtocolSecretsResponse|measurementProtocolSecrets': 'a container: its secretValue is listed',
  'apikeys|V2Key|keyString': 'Output only; "can be accessed only through the GetKeyString method", which is a write',
  'calendar|EntryPoint|passcode': 'conference access code, shown to every invitee in the event',
  'calendar|EntryPoint|password': 'conference access code, shown to every invitee in the event',
  'calendar|EntryPoint|pin': 'conference access code, shown to every invitee in the event',
  'cloudbilling|OAuthFlows|authorizationCode': 'an OAuth flow description (URLs and scopes), not a code',
  'cloudbilling|OAuthFlows|password': 'an OAuth flow description (URLs and scopes), not a password',
  'cloudbilling|SecurityScheme|apiKeySecurityScheme': 'describes where an API key goes, not a key',
  'cloudidentity|OidcIdpConfig|changePasswordUri': 'a URL',
  'cloudidentity|OidcRpConfig|clientSecret': 'Input only',
  'cloudidentity|SamlIdpConfig|changePasswordUri': 'a URL',
  'discoveryengine|A2aV1OAuthFlows|authorizationCode': 'an OAuth flow description (URLs and scopes), not a code',
  'discoveryengine|A2aV1OAuthFlows|password': 'an OAuth flow description (URLs and scopes), not a password',
  'discoveryengine|A2aV1SecurityScheme|apiKeySecurityScheme': 'describes where an API key goes, not a key',
  'discoveryengine|GoogleCloudDiscoveryengineV1DataConnectorRealtimeSyncConfig|realtimeSyncSecret': 'the id of a Secret Manager secret, a reference',
  'firebaseappcheck|GoogleFirebaseAppcheckV1DebugToken|token': 'Input only; "this field will never be populated in any response"',
  'firebaseappcheck|GoogleFirebaseAppcheckV1DeviceCheckConfig|privateKey': 'Input only; "this field will never be populated in any response"',
  'firebaseappcheck|GoogleFirebaseAppcheckV1RecaptchaV3Config|siteSecret': 'Input only; "this field will never be populated in any response"',
  'firebaseapphosting|EnvironmentVariable|secret': 'a secret version name, a reference',
  'firebase|AndroidApp|apiKeyId': 'the id of an API key, not the key string',
  'firebase|FirebaseAppInfo|apiKeyId': 'the id of an API key, not the key string',
  'firebase|IosApp|apiKeyId': 'the id of an API key, not the key string',
  'firebase|WebAppConfig|apiKey': 'a Firebase web config key, public by design (it ships in every web app)',
  'firebase|WebApp|apiKeyId': 'the id of an API key, not the key string',
  'gamesConfiguration|AchievementConfiguration|token': 'a resource identifier',
  'gamesConfiguration|LeaderboardConfiguration|token': 'a resource identifier',
  'games|RecallToken|token': "the developer's own persona identifier, given to Google by LinkPersona",
  'gmailpostmastertools|DomainVerificationToken|token': 'a DNS verification value, published in the domain TXT record',
  'gmail|CseKeyPair|privateKeyMetadata': 'metadata about where the private key is held, not the key',
  'gmail|CsePrivateKeyMetadata|privateKeyMetadataId': 'an id',
  'gmail|SignAndEncryptKeyPairs|signingKeyPairId': 'an id',
  'gmail|SmimeInfo|encryptedKeyPassword': 'goes with the pkcs12 upload, which Google never returns',
  'gmail|SmtpMsa|password': 'Google: a write-only field, never populated in responses',
  'health|EndpointAuthorization|secret': 'Input only',
  'identitytoolkit|IdentitytoolkitRelyingpartyGetProjectConfigResponse|apiKey': 'the browser API key, public by design',
  'identitytoolkit|IdentitytoolkitRelyingpartyGetProjectConfigResponse|legacyResetPasswordTemplate': 'an email template',
  'identitytoolkit|IdentitytoolkitRelyingpartyGetProjectConfigResponse|resetPasswordTemplate': 'an email template',
  'identitytoolkit|UserInfo|rawPassword': 'input for account uploads; Identity Platform stores only hashes, and v1 documents it as input only',
  'meet|PhoneAccess|pin': 'dial-in PIN, shown to every participant',
  'storage|ObjectCustomContextPayload|value': "the value of the object's own context metadata",
  'tagmanager|Environment|authorizationCode': "the gtm_auth value, published in the environment's container snippet",
  'youtubereporting|GdataMedia|token': 'a media fingerprint',
};

/**
 * Reachable catalog methods that are reads and whose id names a credential (see ID_WORDS). Each one is decided:
 * redacted (a listed field, see REDACTED_READS), gateway-names (only the gateway serves it, and its name-based
 * redaction removes the value), or not a credential.
 */
const ID_WORDS = /secret|password|credential|privatekey|apikey|keystring|streamkey|token|authstring|macsec/i;
const DECIDED_IDS = {
  'analyticsadmin.properties.dataStreams.measurementProtocolSecrets.list': 'redacted',
  'androidmanagement.enterprises.enrollmentTokens.list': 'redacted',
  'androidmanagement.enterprises.migrationTokens.list': 'redacted',
  'chromemanagement.customers.enrollmentTokens.get': 'gateway-names: token',
  'chromemanagement.customers.enrollmentTokens.list': 'gateway-names: token',
  'cloudidentity.inboundSamlSsoProfiles.idpCredentials.get': 'not a credential: the IdP public keys',
  'cloudidentity.inboundSamlSsoProfiles.idpCredentials.list': 'not a credential: the IdP public keys',
  'composer.projects.locations.environments.userWorkloadsSecrets.get': 'not a credential: "Values of the data field in the response are cleared."',
  'composer.projects.locations.environments.userWorkloadsSecrets.list': 'not a credential: the values are cleared',
  'dataform.projects.locations.repositories.computeAccessTokenStatus': 'not a credential: a status',
  'directory.tokens.get': 'not a credential: the client id, scopes and display text of a grant, no token value',
  'directory.tokens.list': 'not a credential: the client id, scopes and display text of a grant, no token value',
  'discoveryengine.projects.locations.collections.dataConnector.checkRefreshToken': 'not a credential: the scopes and connection of a stored token',
  'drive.changes.getStartPageToken': 'not a credential: a page token',
  'firebaseappcheck.projects.apps.debugTokens.get': 'not a credential: "this field will never be populated in any response"',
  'firebaseappcheck.projects.apps.debugTokens.list': 'not a credential: "this field will never be populated in any response"',
  'games.recall.gamesPlayerTokens': "not a credential: the developer's own persona identifiers",
  'games.recall.lastTokenFromAllDeveloperGames': "not a credential: the developer's own persona identifiers",
  'games.recall.retrieveTokens': "not a credential: the developer's own persona identifiers",
  'gmailpostmastertools.domains.getVerificationToken': 'not a credential: a DNS verification value',
  'iam.locations.workforcePools.providers.scimTenants.tokens.get': 'not a credential: securityToken "Will be set only during creation."',
  'iam.locations.workforcePools.providers.scimTenants.tokens.list': 'not a credential: securityToken "Will be set only during creation."',
  'iam.projects.locations.oauthClients.credentials.get': 'gateway-names: clientSecret',
  'iam.projects.locations.oauthClients.credentials.list': 'gateway-names: clientSecret',
  'identitytoolkit.getPasswordPolicy': 'not a credential: a policy',
  'networkconnectivity.projects.locations.serviceConnectionTokens.get': 'gateway-names: token',
  'networkconnectivity.projects.locations.serviceConnectionTokens.list': 'gateway-names: token',
  'recommendationengine.projects.locations.catalogs.eventStores.predictionApiKeyRegistrations.list': 'gateway-names: apiKey',
  'redis.projects.locations.clusters.tokenAuthUsers.authTokens.get': 'gateway-names: token',
  'redis.projects.locations.clusters.tokenAuthUsers.authTokens.list': 'gateway-names: token',
  'redis.projects.locations.clusters.tokenAuthUsers.get': 'not a credential: a user',
  'redis.projects.locations.clusters.tokenAuthUsers.list': 'not a credential: users',
  'secretmanager.projects.locations.secrets.get': 'not a credential: "Gets metadata for a given Secret."',
  'secretmanager.projects.locations.secrets.getIamPolicy': 'not a credential: a policy',
  'secretmanager.projects.locations.secrets.list': 'not a credential: metadata',
  'secretmanager.projects.locations.secrets.testIamPermissions': 'not a credential: permissions',
  'secretmanager.projects.locations.secrets.versions.get': 'not a credential: metadata',
  'secretmanager.projects.locations.secrets.versions.list': 'not a credential: "This call does not return secret data."',
  'secretmanager.projects.secrets.get': 'not a credential: "Gets metadata for a given Secret."',
  'secretmanager.projects.secrets.getIamPolicy': 'not a credential: a policy',
  'secretmanager.projects.secrets.list': 'not a credential: metadata',
  'secretmanager.projects.secrets.testIamPermissions': 'not a credential: permissions',
  'secretmanager.projects.secrets.versions.get': 'not a credential: metadata',
  'secretmanager.projects.secrets.versions.list': 'not a credential: "This call does not return secret data."',
};

// ---------------------------------------------------------------------------
// Schema walking helpers for the scans

/** Credential-like property names. Pages, sync and other opaque tokens are not matched (^token$ only). */
const CREDENTIAL_PROP =
  /secret|password|passwd|passphrase|privatekey|keystring|apikey|accesstoken|refreshtoken|idtoken|authtoken|bearertoken|sessiontoken|oauthtoken|activationtoken|enrollmenttoken|oobcode|^salt$|streamname|streamkey|signerkey|signingkey|verificationcode|authorizationcode|authcode|^pin$|passcode|^credentials?$|^jwt$|sastoken|consumerkey|^token$|^authstring$|^cak$/i;
const SCALAR_TYPES = new Set(['boolean', 'integer', 'number']);
const isCandidate = (prop, schemaName, node) => {
  if (SCALAR_TYPES.has(node.type) || node.enum) return false;
  if (CREDENTIAL_PROP.test(prop)) return true;
  return /^(value|data|qrCode)$/.test(prop) && /token|secret|password|credential|payload/i.test(schemaName);
};

/** Every "schema.property" reachable from a schema whose property passes `pick`. */
function reachableProps(schemas, rootRef, pick) {
  const memo = new Map();
  const reach = (name, stack) => {
    if (memo.has(name)) return memo.get(name);
    if (stack.has(name)) return [];
    stack.add(name);
    const out = [];
    const visit = (n) => {
      if (!n) return;
      if (n.$ref) {
        out.push(...reach(n.$ref, stack));
        return;
      }
      if (n.items) visit(n.items);
      if (n.additionalProperties && typeof n.additionalProperties === 'object') visit(n.additionalProperties);
      for (const [prop, child] of Object.entries(n.properties ?? {})) {
        if (pick(prop, name, child)) out.push(`${name}.${prop}`);
        visit(child);
      }
    };
    visit(schemas[name]);
    stack.delete(name);
    const unique = [...new Set(out)];
    memo.set(name, unique);
    return unique;
  };
  return reach(rootRef, new Set());
}

function* methodsOf(doc) {
  const walk = function* (resources) {
    for (const r of Object.values(resources ?? {})) {
      for (const [name, m] of Object.entries(r.methods ?? {})) yield [name, m];
      yield* walk(r.resources);
    }
  };
  yield* walk(doc.resources);
}

const snapshotFiles = readdirSync(join(ROOT, 'data', 'discovery')).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
const snapshot = (key) => readJson('data', 'discovery', `${key}.json`);
/** A document (snapshot or fixture) as { name, schemas, responseOf(id) }. */
function docFor(key) {
  if (snapshotFiles.includes(`${key}.json`)) {
    const doc = snapshot(key);
    const responses = new Map([...methodsOf(doc)].map(([, m]) => [m.id, m.response]));
    return { name: doc.name, schemas: doc.schemas, responseOf: (id) => responses.get(id) };
  }
  const doc = fixture.apis[key];
  assert.ok(doc, `${key} is a snapshot or in the fixture`);
  return { name: doc.name, schemas: doc.schemas, responseOf: (id) => doc.methods[id]?.response };
}
const isListed = (api, schemaProp) => {
  const dot = schemaProp.lastIndexOf('.');
  return credentialFieldsOf(api, schemaProp.slice(0, dot)).has(schemaProp.slice(dot + 1));
};

// ---------------------------------------------------------------------------
// 1. The writes

test('config/tool-kinds.json pins each credential reveal as a write, and adds no note', () => {
  for (const m of WRITES) assert.equal(kindsFile[m.id], 'write', m.id);
  assert.equal(WRITES.length, 17);
  assert.equal(new Set(WRITES.map((m) => m.id)).size, WRITES.length, 'no duplicate');
  // A note is appended to the description of every generated tool of its API, so none was added.
  for (const api of ['apigee', 'integrations', 'analyticsadmin', 'androidenterprise', 'androidmanagement', 'identitytoolkit', 'directory', 'admin', 'redis', 'aiplatform', 'parametermanager']) {
    assert.equal(kindsFile.notes[api], undefined, api);
  }
});

test('both classifiers give write for every catalog version of each reveal, and the verb and name rules alone give read', () => {
  const seen = new Map(WRITES.map((m) => [m.id, []]));
  for (const api of catalog.apis) {
    for (const [id, verb] of api.methods) {
      if (!seen.has(id)) continue;
      assert.equal(classifyMethod(verb, nameOf(id), id, overrides), 'write', `${id} ${api.version}: classifyMethod`);
      assert.equal(fallbackClassify(verb, nameOf(id), id, overrides), 'write', `${id} ${api.version}: the plugin copy`);
      // Without the override the method is a read: the entry in tool-kinds.json is what makes it ask.
      assert.equal(classifyMethod(verb, nameOf(id), id, {}), 'read', `${id} ${api.version}: the verb and name rules`);
      seen.get(id).push(`${api.name}:${api.version}`);
    }
  }
  for (const [id, versions] of seen) assert.ok(versions.length >= 1, `${id} is in the catalog`);
});

test('the built plugins carry the reveal kinds: the generated tool in tool-map.json, the gateway method in method-kinds.json', () => {
  for (const m of WRITES) {
    assert.deepEqual(readJson('plugins', m.plugin, 'tool-kinds.json'), kindsFile, `${m.plugin} carries config/tool-kinds.json`);
    const map = readJson('plugins', m.plugin, 'tool-map.json');
    if (m.tool) {
      const entry = map.find((t) => t.name === full(m.plugin, m.tool));
      assert.ok(entry, `${m.plugin} lists ${m.tool}`);
      assert.equal(entry.methodId, m.id, m.tool);
      assert.equal(entry.kind, 'write', m.tool);
    } else {
      assert.equal(map.some((t) => t.methodId === m.id), false, `${m.id} has no generated tool in ${m.plugin}`);
    }
    if (m.gateway) assert.equal(readJson('plugins', m.plugin, 'method-kinds.json')[m.id], 'write', `${m.plugin} gateway ${m.id}`);
  }
});

/** Runs a built plugin's own hook with a temp token folder (no policy file) and the default confirmation mode. */
function runPluginHook(plugin, toolName, toolInput) {
  const tokenDir = tempDir('gsm-cred-hook-');
  const env = { ...process.env, GSM_TOKEN_DIR: tokenDir };
  delete env.CLAUDE_PLUGIN_OPTION_CONFIRMATION;
  const event = { session_id: 's', hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput, tool_use_id: 't' };
  const res = spawnSync(process.execPath, [join(ROOT, 'plugins', plugin, 'bin', 'gsm-hook.mjs')], { input: JSON.stringify(event), env, encoding: 'utf8', timeout: 60_000 });
  assert.equal(res.status, 0, res.stderr);
  return res.stdout;
}

test("the plugins' own hooks ask before each reveal, as a tool and through api_call; a redacted read runs without a prompt", () => {
  for (const m of WRITES) {
    const outputs = [];
    if (m.tool) outputs.push(runPluginHook(m.plugin, full(m.plugin, m.tool), { name: 'x' }));
    if (m.gateway) outputs.push(runPluginHook(m.plugin, full(m.plugin, 'api_call'), { method: m.id, pathParams: {} }));
    assert.ok(outputs.length > 0, m.id);
    for (const out of outputs) {
      const decision = JSON.parse(out).hookSpecificOutput;
      assert.equal(decision.permissionDecision, 'ask', m.id);
      assert.match(decision.permissionDecisionReason, /^About to change Google data: /, m.id);
      assert.ok(decision.permissionDecisionReason.includes(`Method: ${m.id}`), m.id);
    }
  }
  assert.equal(runPluginHook('gyoutube', full('gyoutube', 'youtube_live_streams_list'), { part: ['cdn'] }), '', 'liveStreams.list stays a read');
  assert.equal(
    runPluginHook('ganalytics', full('ganalytics', 'api_call'), { method: 'analyticsadmin.properties.dataStreams.measurementProtocolSecrets.list', pathParams: {} }),
    '',
    'the secrets list stays a read',
  );
});

// ---------------------------------------------------------------------------
// 2. The redacted reads, and the contract scans

test('each listed field is a property of its schema in a snapshot or the fixture, and is reached by at least one read', () => {
  const docs = [
    ...snapshotFiles.map((f) => docFor(f.slice(0, -'.json'.length))),
    ...Object.keys(fixture.apis).map((key) => docFor(key)),
  ];
  for (const rule of CREDENTIAL_FIELDS) {
    const holders = docs.flatMap((d) =>
      d.name !== rule.api
        ? []
        : Object.entries(d.schemas ?? {})
            .filter(([name, s]) => credentialFieldsOf(rule.api, name).get(rule.field) === rule && s.properties?.[rule.field])
            .map(([name]) => name),
    );
    assert.ok(holders.length > 0, `${rule.api} ${rule.schema}.${rule.field} matches a schema property`);
  }
});

test('every confirmed redacted read stays a read in both classifiers and its response reaches each of its fields', () => {
  for (const r of REDACTED_READS) {
    const verb = catalog.apis.flatMap((a) => a.methods).find(([id]) => id === r.id)?.[1];
    assert.ok(verb, `${r.id} is in the catalog`);
    assert.equal(classifyMethod(verb, nameOf(r.id), r.id, overrides), 'read', r.id);
    assert.equal(fallbackClassify(verb, nameOf(r.id), r.id, overrides), 'read', r.id);
    const doc = docFor(r.doc);
    const response = doc.responseOf(r.id);
    assert.ok(response, `${r.id} has a response schema in ${r.doc}`);
    const reached = reachableProps(doc.schemas, response, (prop, schema) => isListed(doc.name, `${schema}.${prop}`));
    for (const field of r.fields) assert.ok(reached.includes(field), `${r.id} (${r.doc}) reaches ${field}`);
  }
});

test('snapshot scan: every credential-like field a read returns is listed, or reviewed as not a credential', () => {
  const unknown = [];
  const covered = new Set();
  for (const file of snapshotFiles) {
    const doc = readJson('data', 'discovery', file);
    for (const [name, m] of methodsOf(doc)) {
      if (!m.response || classifyMethod(m.httpMethod, name, m.id, overrides) !== 'read') continue;
      for (const sp of reachableProps(doc.schemas ?? {}, m.response, isCandidate)) {
        const dot = sp.lastIndexOf('.');
        const key = `${doc.name}|${sp.slice(0, dot)}|${sp.slice(dot + 1)}`;
        if (isListed(doc.name, sp)) continue;
        if (REVIEWED[key]) {
          covered.add(key);
          continue;
        }
        unknown.push(`${key} (${m.id}, ${file})`);
      }
    }
  }
  assert.deepEqual([...new Set(unknown)], [], 'decide each one: a CREDENTIAL_FIELDS entry, a write in config/tool-kinds.json, or a REVIEWED reason');
  // Each reviewed entry is still found, so the list does not hide a field it no longer describes.
  assert.deepEqual(Object.keys(REVIEWED).filter((k) => !covered.has(k)), []);
});

test('catalog scan: every read whose method id names a credential is decided', () => {
  const reach = new Set(servers.flatMap((s) => [...(s.apis ?? []), ...(s.gatewayApis ?? [])].map((a) => `${a.api}.${a.version}`)));
  const generated = new Set(servers.flatMap((s) => (s.apis ?? []).map((a) => `${a.api}.${a.version}`)));
  const found = new Set();
  const undecided = [];
  for (const api of catalog.apis) {
    if (!reach.has(`${api.name}.${api.version}`)) continue;
    for (const [id, verb] of api.methods) {
      if (!ID_WORDS.test(id.slice(id.indexOf('.') + 1))) continue;
      if (classifyMethod(verb, nameOf(id), id, overrides) !== 'read') continue;
      found.add(id);
      const decision = DECIDED_IDS[id];
      if (!decision) {
        undecided.push(`${id} (${api.version})`);
        continue;
      }
      // The gateway's name-based redaction covers only api_call: no generated tool may serve such a method.
      if (decision.startsWith('gateway-names')) assert.equal(generated.has(`${api.name}.${api.version}`), false, `${id} ${api.version} is gateway-only`);
      if (decision === 'redacted') assert.ok(REDACTED_READS.some((r) => r.id === id), `${id} is a confirmed redacted read`);
    }
  }
  assert.deepEqual(undecided, [], 'decide each one in DECIDED_IDS, or make it a write in config/tool-kinds.json');
  assert.deepEqual(Object.keys(DECIDED_IDS).filter((id) => !found.has(id)), [], 'each decided id is still a reachable read');
});

// ---------------------------------------------------------------------------
// 3. Redaction behaviour

test('redactCredentials replaces only the listed fields, keeps key order, and returns the same object when nothing is listed', () => {
  const yt = snapshot('youtube.v3');
  const response = {
    kind: 'youtube#liveStreamListResponse',
    items: [
      {
        id: 's1',
        snippet: { title: 'Main' },
        cdn: { ingestionType: 'rtmp', ingestionInfo: { streamName: 'abcd-efgh-ijkl-mnop', ingestionAddress: 'rtmp://a.rtmp.youtube.com/live2' }, resolution: '1080p' },
      },
      { id: 's2', cdn: { ingestionInfo: { streamName: '' } } },
    ],
  };
  const out = redactCredentials(response, { api: 'youtube', schema: 'LiveStreamListResponse', schemas: yt.schemas });
  assert.equal(out.items[0].cdn.ingestionInfo.streamName, '[redacted: stream key]');
  assert.equal(out.items[0].cdn.ingestionInfo.ingestionAddress, 'rtmp://a.rtmp.youtube.com/live2');
  assert.deepEqual(Object.keys(out.items[0].cdn.ingestionInfo), ['streamName', 'ingestionAddress']);
  assert.equal(out.items[1].cdn.ingestionInfo.streamName, '', 'an empty value has nothing to hide');
  assert.equal(JSON.stringify(response).includes('abcd-efgh-ijkl-mnop'), true, 'the input is not changed');
  assert.equal(JSON.stringify(out).includes('abcd-efgh-ijkl-mnop'), false);
  // Nothing to replace: the same object, so the JSON text is byte-identical.
  const plain = { items: [{ id: 's3', snippet: { title: 'x' } }] };
  assert.equal(redactCredentials(plain, { api: 'youtube', schema: 'LiveStreamListResponse', schemas: yt.schemas }), plain);
  assert.equal(redactCredentials(response, { api: 'gmail', schema: 'LiveStreamListResponse', schemas: yt.schemas }), response, 'an API without listed fields');
  assert.equal(redactCredentials(response, { api: 'youtube', schema: undefined, schemas: yt.schemas }), response, 'no response schema');
});

test('the placeholder names the write that shows the value, when there is one', () => {
  assert.equal(redactedText({ what: 'stream key' }), '[redacted: stream key]');
  const rule = CREDENTIAL_FIELDS.find((r) => r.api === 'analyticsadmin');
  assert.equal(
    redactedText(rule),
    '[redacted: Measurement Protocol secret; to see it, call analyticsadmin.properties.dataStreams.measurementProtocolSecrets.get, which asks first]',
  );
  // Every reveal method named in a placeholder is a write, so it asks first as the text says.
  for (const r of CREDENTIAL_FIELDS) for (const id of r.reveal ?? []) assert.equal(kindsFile[id], 'write', `${id} is a write`);
});

test('Google Ads: a nested webhook secret in a search row and in each element of a searchStream answer', () => {
  const ads = snapshot('googleads.v26');
  const row = {
    asset: {
      resourceName: 'customers/1/assets/2',
      leadFormAsset: { deliveryMethods: [{ webhook: { advertiserWebhookUrl: 'https://example.com/hook', googleSecret: 'shared-secret-123', payloadSchemaVersion: '3' } }] },
    },
  };
  const search = redactCredentials({ results: [row] }, { api: 'googleads', schema: 'GoogleAdsGoogleadsV26Services__SearchGoogleAdsResponse', schemas: ads.schemas });
  assert.equal(search.results[0].asset.leadFormAsset.deliveryMethods[0].webhook.googleSecret, '[redacted: webhook anti-spoofing secret]');
  assert.equal(search.results[0].asset.leadFormAsset.deliveryMethods[0].webhook.advertiserWebhookUrl, 'https://example.com/hook');
  const stream = redactCredentials([{ results: [row] }, { results: [row] }], {
    api: 'googleads',
    schema: 'GoogleAdsGoogleadsV26Services__SearchGoogleAdsStreamResponse',
    schemas: ads.schemas,
  });
  assert.equal(stream.length, 2);
  for (const chunk of stream) assert.equal(chunk.results[0].asset.leadFormAsset.deliveryMethods[0].webhook.googleSecret, '[redacted: webhook anti-spoofing secret]');
});

/** Generated tools of one snapshot, served by the apikey group with a fake key and a fake fetch (no network). */
function generatedTools(key, apiName, version) {
  const tokenDir = tempDir('gsm-cred-gen-');
  const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_API_KEY: 'test-key-not-real' });
  const { tools } = generateDiscoveryTools('credtest', 'apikey', [{ apiName, apiVersion: version, doc: snapshot(key) }], loadToolKinds(ROOT), cfg, 60);
  return (methodId) => {
    const tool = tools.find((t) => t.methodId === methodId);
    assert.ok(tool, `${methodId} is generated`);
    return tool;
  };
}
function answerWith(data) {
  const calls = [];
  apiKeyClient.setFetchForTests(async (url, init) => {
    calls.push({ url: String(url), method: init?.method });
    return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return calls;
}

test('generated tools: a read replaces the field, the write that creates the same resource returns it', async () => {
  const tool = generatedTools('youtube.v3', 'youtube', 'v3');
  const list = tool('youtube.liveStreams.list');
  assert.equal(list.kind, 'read');
  answerWith({ items: [{ id: 's1', cdn: { ingestionInfo: { streamName: 'live-key-0001', ingestionAddress: 'rtmp://x' } } }] });
  const listed = await list.handler({ part: ['cdn'], mine: true });
  assert.equal(listed.items[0].cdn.ingestionInfo.streamName, '[redacted: stream key]');
  assert.equal(listed.items[0].cdn.ingestionInfo.ingestionAddress, 'rtmp://x');

  const insert = tool('youtube.liveStreams.insert');
  assert.equal(insert.kind, 'write');
  answerWith({ id: 's2', cdn: { ingestionInfo: { streamName: 'live-key-0002' } } });
  const created = await insert.handler({ part: ['cdn'], body: { cdn: { ingestionType: 'rtmp' } } });
  assert.equal(created.cdn.ingestionInfo.streamName, 'live-key-0002', 'the approved write shows the new key');
});

test('generated tools: Identity Toolkit account reads drop password hashes and salts, the rest stays', async () => {
  const tool = generatedTools('identitytoolkit.v3', 'identitytoolkit', 'v3');
  const read = tool('identitytoolkit.relyingparty.getAccountInfo');
  assert.equal(read.kind, 'read');
  answerWith({ kind: 'identitytoolkit#GetAccountInfoResponse', users: [{ localId: 'u1', email: 'a@example.com', passwordHash: 'aGFzaA==', salt: 'c2FsdA==', providerUserInfo: [] }] });
  const out = await read.handler({ body: { localId: ['u1'] } });
  assert.deepEqual(out.users[0], { localId: 'u1', email: 'a@example.com', passwordHash: '[redacted: password hash]', salt: '[redacted: password salt]', providerUserInfo: [] });
  // getOobConfirmationCode mints a reset code: it is a write now.
  assert.equal(tool('identitytoolkit.relyingparty.getOobConfirmationCode').kind, 'write');
});

test('generated tools: the Measurement Protocol secrets list hides each value and names the get method; the get is a write', async () => {
  const tool = generatedTools('analyticsadmin.v1beta', 'analyticsadmin', 'v1beta');
  const list = tool('analyticsadmin.properties.dataStreams.measurementProtocolSecrets.list');
  assert.equal(list.kind, 'read');
  answerWith({ measurementProtocolSecrets: [{ name: 'properties/1/dataStreams/2/measurementProtocolSecrets/3', displayName: 'Server', secretValue: 'mp-secret-0001' }] });
  const out = await list.handler({ parent: 'properties/1/dataStreams/2' });
  assert.equal(
    out.measurementProtocolSecrets[0].secretValue,
    '[redacted: Measurement Protocol secret; to see it, call analyticsadmin.properties.dataStreams.measurementProtocolSecrets.get, which asks first]',
  );
  assert.equal(out.measurementProtocolSecrets[0].displayName, 'Server');
  const get = tool('analyticsadmin.properties.dataStreams.measurementProtocolSecrets.get');
  assert.equal(get.kind, 'write');
  answerWith({ name: 'properties/1/dataStreams/2/measurementProtocolSecrets/3', secretValue: 'mp-secret-0001' });
  assert.equal((await get.handler({ name: 'properties/1/dataStreams/2/measurementProtocolSecrets/3' })).secretValue, 'mp-secret-0001', 'the approved write shows it');
});

test('generated tools: the other listed fields of generated APIs are replaced in their reads', async () => {
  const cases = [
    {
      key: 'monitoring.v3',
      api: 'monitoring',
      version: 'v3',
      method: 'monitoring.projects.uptimeCheckConfigs.get',
      args: { name: 'projects/p/uptimeCheckConfigs/u' },
      data: { name: 'u', httpCheck: { authInfo: { username: 'probe', password: 'pw-0001' } } },
      check: (out) => assert.deepEqual(out.httpCheck.authInfo, { username: 'probe', password: '[redacted: uptime check password]' }),
    },
    {
      key: 'merchantapi.datasources_v1',
      api: 'merchantapi',
      version: 'datasources_v1',
      method: 'merchantapi.accounts.dataSources.get',
      args: { name: 'accounts/1/dataSources/2' },
      data: { name: 'd', primaryProductDataSource: {}, fileInput: { fetchSettings: { fetchUri: 'sftp://x', username: 'u', password: 'pw-0002' } } },
      check: (out) => assert.equal(out.fileInput.fetchSettings.password, '[redacted: fetch password]'),
    },
    {
      key: 'drive.v3',
      api: 'drive',
      version: 'v3',
      method: 'drive.files.get',
      args: { fileId: 'f1' },
      data: { id: 'f1', clientEncryptionDetails: { decryptionMetadata: { jwt: 'eyJhbGciOi.payload.sig', kaclsName: 'kacls' } } },
      check: (out) => assert.deepEqual(out.clientEncryptionDetails.decryptionMetadata, { jwt: '[redacted: key access JWT]', kaclsName: 'kacls' }),
    },
  ];
  for (const c of cases) {
    const read = generatedTools(c.key, c.api, c.version)(c.method);
    assert.equal(read.kind, 'read', c.method);
    answerWith(c.data);
    c.check(await read.handler(c.args));
  }
});

// ---------------------------------------------------------------------------
// 4. The gateway

/**
 * A fake product served by api_call with injected requests: Android Management (the fixture's pruned schemas), Apigee
 * and Secret Manager (the response shapes Google documents, written out here).
 */
function credentialGateway() {
  const dataDir = tempDir('gsm-cred-gw-data-');
  const tokenDir = tempDir('gsm-cred-gw-token-');
  const scope = 'https://www.googleapis.com/auth/cloud-platform';
  const amapiMethods = [
    ['androidmanagement.enterprises.enrollmentTokens.list', 'GET', 'v1/{+parent}/enrollmentTokens', [scope], ''],
    ['androidmanagement.enterprises.enrollmentTokens.get', 'GET', 'v1/{+name}', [scope], ''],
  ];
  const apigeeMethods = [
    ['apigee.organizations.developers.apps.get', 'GET', 'v1/{+name}', [scope], ''],
    ['apigee.organizations.developers.apps.keys.get', 'GET', 'v1/{+name}', [scope], ''],
  ];
  const secretMethods = [['secretmanager.projects.secrets.versions.access', 'GET', 'v1/{+name}:access', [scope], '']];
  const api = (name, title, methods) => ({ name, version: 'v1', title, description: title, rootUrl: `https://${name}.googleapis.com/`, servicePath: '', methods });
  writeFileSync(
    join(dataDir, 'catalog.json'),
    JSON.stringify({ apis: [api('androidmanagement', 'Android Management API', amapiMethods), api('apigee', 'Apigee API', apigeeMethods), api('secretmanager', 'Secret Manager API', secretMethods)] }),
  );
  // The real kinds, beside the catalog, as in an installed plugin.
  writeFileSync(join(dataDir, 'tool-kinds.json'), readFileSync(join(ROOT, 'config', 'tool-kinds.json')));
  const pathParam = (name) => ({ [name]: { type: 'string', location: 'path', required: true } });
  const method = (id, path, response, param = 'name') => ({ id, path, httpMethod: 'GET', parameters: pathParam(param), response: { $ref: response } });
  const amapi = fixture.apis['androidmanagement.v1'];
  const discovery = {
    androidmanagement: {
      name: 'androidmanagement',
      version: 'v1',
      schemas: amapi.schemas,
      resources: {
        enrollmentTokens: {
          methods: {
            list: method('androidmanagement.enterprises.enrollmentTokens.list', 'v1/{+parent}/enrollmentTokens', amapi.methods['androidmanagement.enterprises.enrollmentTokens.list'].response, 'parent'),
            get: method('androidmanagement.enterprises.enrollmentTokens.get', 'v1/{+name}', 'EnrollmentToken'),
          },
        },
      },
    },
    apigee: {
      name: 'apigee',
      version: 'v1',
      schemas: {
        GoogleCloudApigeeV1DeveloperApp: { type: 'object', properties: { name: { type: 'string' }, credentials: { type: 'array', items: { $ref: 'GoogleCloudApigeeV1Credential' } } } },
        GoogleCloudApigeeV1Credential: { type: 'object', properties: { consumerKey: { type: 'string' }, consumerSecret: { type: 'string' }, status: { type: 'string' } } },
        GoogleCloudApigeeV1DeveloperAppKey: { type: 'object', properties: { consumerKey: { type: 'string' }, consumerSecret: { type: 'string' } } },
      },
      resources: {
        apps: {
          methods: {
            get: method('apigee.organizations.developers.apps.get', 'v1/{+name}', 'GoogleCloudApigeeV1DeveloperApp'),
            keysGet: method('apigee.organizations.developers.apps.keys.get', 'v1/{+name}', 'GoogleCloudApigeeV1DeveloperAppKey'),
          },
        },
      },
    },
    secretmanager: {
      name: 'secretmanager',
      version: 'v1',
      schemas: {
        AccessSecretVersionResponse: { type: 'object', properties: { name: { type: 'string' }, payload: { $ref: 'SecretPayload' } } },
        SecretPayload: { type: 'object', properties: { data: { type: 'string', format: 'byte' }, dataCrc32c: { type: 'string' } } },
      },
      resources: { versions: { methods: { access: method('secretmanager.projects.secrets.versions.access', 'v1/{+name}:access', 'AccessSecretVersionResponse') } } },
    },
  };
  mkdirSync(join(tokenDir, 'discovery-cache'), { recursive: true });
  for (const [name, doc] of Object.entries(discovery)) writeFileSync(join(tokenDir, 'discovery-cache', `${name}.v1.json`), JSON.stringify(doc));
  process.env.GSM_DATA_DIR = dataDir;
  const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir });
  const apis = ['androidmanagement', 'apigee', 'secretmanager'].map((name) => ({ api: name, version: 'v1' }));
  const tools = gw.gatewayTools({ product: 'credtest', group: 'cloud', apis, cfg });
  return Object.fromEntries(tools.map((t) => [t.name, t]));
}
function gateRecorder(allow) {
  const calls = [];
  return {
    calls,
    gate: async (input) => {
      calls.push(input);
      if (!allow) throw new Error('You declined this action. Nothing was changed.');
    },
  };
}
function gatewayAnswers(data) {
  const calls = [];
  gw.setRequestForTests(async (req) => {
    calls.push(req);
    return { status: 200, data };
  });
  return calls;
}

test('api_call: an enrollment token list hides each token and names the get method; the name list still applies', async () => {
  const tools = credentialGateway();
  const sent = gatewayAnswers({
    enrollmentTokens: [{ name: 'enterprises/e/enrollmentTokens/t1', value: 'ENROLL-0001', qrCode: '{"token":"ENROLL-0001"}', expirationTimestamp: '2026-11-01T00:00:00Z' }],
    password: 'stray-0001',
  });
  const gate = gateRecorder(true);
  const out = await tools.api_call.handler({ method: 'androidmanagement.enterprises.enrollmentTokens.list', pathParams: { parent: 'enterprises/e' } }, gate);
  assert.equal(gate.calls.length, 0, 'a read is not gated');
  assert.equal(sent.length, 1);
  const hint = 'to see it, call androidmanagement.enterprises.enrollmentTokens.get, which asks first]';
  assert.deepEqual(out.data.enrollmentTokens[0], {
    name: 'enterprises/e/enrollmentTokens/t1',
    value: `[redacted: enrollment token; ${hint}`,
    qrCode: `[redacted: enrollment QR code, which holds the token; ${hint}`,
    expirationTimestamp: '2026-11-01T00:00:00Z',
  });
  assert.equal(out.data.password, '[redacted]', 'the gateway name list is unchanged');
  assert.equal(JSON.stringify(out).includes('ENROLL-0001'), false);
});

test('api_call: the enrollment token get is a write now; a decline sends nothing, an approval shows the token', async () => {
  const tools = credentialGateway();
  const declined = gateRecorder(false);
  const none = gatewayAnswers({ name: 'enterprises/e/enrollmentTokens/t1', value: 'ENROLL-0001' });
  await assert.rejects(tools.api_call.handler({ method: 'androidmanagement.enterprises.enrollmentTokens.get', pathParams: { name: 'enterprises/e/enrollmentTokens/t1' } }, declined), /declined/);
  assert.equal(declined.calls.length, 1);
  assert.equal(declined.calls[0].kind, 'write');
  assert.equal(none.length, 0, 'no request after a decline');
  const approved = gateRecorder(true);
  gatewayAnswers({ name: 'enterprises/e/enrollmentTokens/t1', value: 'ENROLL-0001' });
  const out = await tools.api_call.handler({ method: 'androidmanagement.enterprises.enrollmentTokens.get', pathParams: { name: 'enterprises/e/enrollmentTokens/t1' } }, approved);
  assert.equal(out.data.value, 'ENROLL-0001', 'the approved write shows it');
});

test('api_call: an Apigee app read is unchanged (the name list replaces its credentials array), and the key read asks first', async () => {
  const tools = credentialGateway();
  const app = { name: 'my-app', credentials: [{ consumerKey: 'ck-0001', consumerSecret: 'cs-0001', status: 'approved' }] };
  gatewayAnswers(app);
  const read = await tools.api_call.handler({ method: 'apigee.organizations.developers.apps.get', pathParams: { name: 'organizations/o/developers/d/apps/my-app' } }, gateRecorder(true));
  assert.deepEqual(read.data, { name: 'my-app', credentials: '[redacted]' }, 'as before 1.26.2');
  assert.equal(CREDENTIAL_FIELDS.some((r) => r.api === 'apigee'), false, 'no listed field: api_call already hides the array');

  const declined = gateRecorder(false);
  const none = gatewayAnswers({ consumerKey: 'ck-0001', consumerSecret: 'cs-0001' });
  await assert.rejects(
    tools.api_call.handler({ method: 'apigee.organizations.developers.apps.keys.get', pathParams: { name: 'organizations/o/developers/d/apps/a/keys/ck-0001' } }, declined),
    /declined/,
  );
  assert.equal(declined.calls.length, 1);
  assert.equal(declined.calls[0].kind, 'write');
  assert.equal(declined.calls[0].methodId, 'apigee.organizations.developers.apps.keys.get');
  assert.equal(none.length, 0, 'no request after a decline');

  const approved = gateRecorder(true);
  gatewayAnswers({ consumerKey: 'ck-0001', consumerSecret: 'cs-0001' });
  const out = await tools.api_call.handler({ method: 'apigee.organizations.developers.apps.keys.get', pathParams: { name: 'organizations/o/developers/d/apps/a/keys/ck-0001' } }, approved);
  assert.equal(approved.calls.length, 1);
  assert.equal(out.data.consumerSecret, 'cs-0001', 'the approved write shows it');
});

test('api_call: Secret Manager access asks first, and without a gate it is refused', async () => {
  const tools = credentialGateway();
  const sent = gatewayAnswers({ name: 'projects/p/secrets/s/versions/1', payload: { data: 'c2VjcmV0', dataCrc32c: '1' } });
  await assert.rejects(tools.api_call.handler({ method: 'secretmanager.projects.secrets.versions.access', pathParams: { name: 'projects/p/secrets/s/versions/1' } }, undefined), /approval gate/);
  assert.equal(sent.length, 0);
  const approved = gateRecorder(true);
  const out = await tools.api_call.handler({ method: 'secretmanager.projects.secrets.versions.access', pathParams: { name: 'projects/p/secrets/s/versions/1' } }, approved);
  assert.equal(approved.calls[0].kind, 'write');
  assert.equal(out.data.payload.data, 'c2VjcmV0');
});

test('the gateway-only fixture: each listed field is replaced for every read the fixture lists', () => {
  for (const [key, doc] of Object.entries(fixture.apis)) {
    for (const [id, m] of Object.entries(doc.methods)) {
      assert.equal(classifyMethod(m.httpMethod, nameOf(id), id, overrides), 'read', `${id} is a read`);
      // A value for each path to a listed field, built from the pruned schema, comes back with the field replaced.
      const value = sampleFor(doc.schemas, m.response, new Set());
      const out = redactCredentials(value, { api: doc.name, schema: m.response, schemas: doc.schemas });
      const text = JSON.stringify(out);
      assert.equal(text.includes('SAMPLE-SECRET'), false, `${key} ${id}: ${text.slice(0, 300)}`);
      assert.ok(text.includes('[redacted: '), `${key} ${id}`);
    }
  }
});

/** A value of a pruned schema: one element per array, every leaf the text SAMPLE-SECRET. */
function sampleFor(schemas, ref, stack) {
  if (stack.has(ref)) return {};
  const next = new Set(stack).add(ref);
  const node = schemas[ref];
  const fromNode = (n) => {
    if (n.$ref) return sampleFor(schemas, n.$ref, next);
    if (n.type === 'array') return [fromNode(n.items ?? { type: 'string' })];
    if (n.additionalProperties?.$ref) return { k: sampleFor(schemas, n.additionalProperties.$ref, next) };
    if (n.properties) return Object.fromEntries(Object.entries(n.properties).map(([p, c]) => [p, fromNode(c)]));
    return 'SAMPLE-SECRET';
  };
  return fromNode(node ?? { type: 'object', properties: {} });
}

// ---------------------------------------------------------------------------
// 5. A running server

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

function childEnv(dir, tokenDir, extra = {}) {
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && !k.startsWith('CLAUDE_PLUGIN_OPTION_') && k !== 'GOOGLE_APPLICATION_CREDENTIALS'));
  return { ...base, GSM_TOKEN_DIR: tokenDir, APPDATA: join(dir, 'appdata'), CLOUDSDK_CONFIG: join(dir, 'gcloud'), ...extra };
}

async function withClient(entry, env, run, answer) {
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  const { ElicitRequestSchema } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/types.js')).href);
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env, stderr: 'pipe' });
  const client = new Client({ name: 'gsm-cred-test', version: '0.0.0' }, { capabilities: answer ? { elicitation: { form: {} } } : {} });
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

test('runServer: getServiceAccount is hidden with writes off; with writes on it asks, and a decline runs nothing', async () => {
  const dir = tempDir('gsm-cred-gplay-');
  const { generateKeyPairSync } = await import('node:crypto');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const tokenDir = join(dir, 'tokens');
  mkdirSync(tokenDir, { recursive: true });
  const keyFile = join(dir, 'key.json');
  writeFileSync(keyFile, JSON.stringify({ type: 'service_account', client_email: 'sa@test-project.iam.gserviceaccount.com', private_key: privateKey, private_key_id: 'k1' }));
  // What `gsm setup-service-account` stores: the key's path (a throwaway key in the temp folder).
  writeFileSync(join(tokenDir, 'service-account.json'), JSON.stringify({ keyFile, clientEmail: 'sa@test-project.iam.gserviceaccount.com', savedAt: '2026-10-31T00:00:00Z' }));
  const entry = generatedEntry(dir, 'gplay');
  const tool = 'androident_enterprises_get_service_acco';

  const readOnly = await withClient(entry, childEnv(dir, tokenDir), async (client) => (await client.listTools()).tools.map((t) => t.name));
  assert.equal(readOnly.includes(tool), false, 'the reveal is not registered with writes off');
  assert.ok(readOnly.includes('androident_enterprises_get'), 'the enterprise read is');

  await withClient(
    entry,
    childEnv(dir, tokenDir, { GSM_ALLOW_WRITES: 'true' }),
    async (client, asked) => {
      const listed = (await client.listTools()).tools.find((t) => t.name === tool);
      assert.ok(listed, 'registered with writes on');
      assert.equal(listed.annotations.readOnlyHint, false);
      const res = await client.callTool({ name: tool, arguments: { enterpriseId: 'e1' } });
      assert.equal(res.isError, true);
      assert.match(res.content[0].text, /You declined this action\. Nothing was changed\./);
      assert.equal(asked.length, 1, 'the gate asked once');
      assert.match(asked[0], /About to change Google data: androident_enterprises_get_service_acco/);
      assert.match(asked[0], /androidenterprise\.enterprises\.getServiceAccount/);
    },
    { action: 'decline' },
  );
  const audit = readFileSync(join(tokenDir, 'audit.log'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(audit.map((l) => [l.tool, l.methodId, l.risk, l.outcome]), [[tool, 'androidenterprise.enterprises.getServiceAccount', 'modify', 'declined']]);
});
