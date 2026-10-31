/**
 * Credential fields in Google API responses, and their removal from the result of a read.
 *
 * A read never asks the user (CLAUDE.md), so a read must not hand the model a credential. A method whose purpose is to
 * return a credential is a write in config/tool-kinds.json, so it asks first (Secret Manager access, an Apigee key, a
 * Measurement Protocol secret, ...). A method that returns many things, of which one field is a credential (a live
 * stream's key, a user's password hash), stays a read, and that field is replaced in the result of every read call.
 *
 * The list below is data: one entry per Discovery schema property. The redaction walks a response along the method's
 * response schema, so every method that returns the schema is covered by the same entry, in a generated tool and through
 * the gateway's api_call alike. Nothing here is a per-method or per-name branch.
 *
 * Only a read call is redacted. A write or destructive call has been approved (or allowed by the user's own settings),
 * and its result is the way to see the value. The gateway's own name-based redaction (SECRET_KEYS in gateway.ts) still
 * applies to every gateway result, as before. Curated tools are not changed here.
 *
 * tests/credential-reveals.test.mjs scans every Discovery snapshot for credential-like fields that a read returns, and
 * fails on one that is neither listed here, nor a write, nor reviewed as not a credential.
 */
import { patternMatches } from './discovery/methods.js';

export interface CredentialField {
  /** The Discovery document's name, for example "youtube" or "admin". */
  api: string;
  /** The schema that holds the field: its exact name, or a pattern where "*" stands for one or more characters. */
  schema: string;
  /** The property whose value is a credential. */
  field: string;
  /** What the value is, shown in its place. */
  what: string;
  /** Method ids that return the value after a prompt, when there are any. */
  reveal?: readonly string[];
}

/**
 * Every credential field that a read returns, by Discovery schema. The evidence for each one is in docs/SECURITY.md
 * ("Credential fields in read results"). A field Google documents as input only, a reference to a secret, a hash, an
 * encrypted value or a value that is public by design is not listed.
 */
export const CREDENTIAL_FIELDS: readonly CredentialField[] = [
  // YouTube: the stream name is the stream key, which lets anyone broadcast to the channel.
  { api: 'youtube', schema: 'IngestionInfo', field: 'streamName', what: 'stream key' },

  // Identity Toolkit (Firebase Auth): user password hashes and salts, the project's hash signer key, IdP client secrets.
  { api: 'identitytoolkit', schema: 'UserInfo', field: 'passwordHash', what: 'password hash' },
  { api: 'identitytoolkit', schema: 'UserInfo', field: 'salt', what: 'password salt' },
  { api: 'identitytoolkit', schema: 'IdpConfig', field: 'secret', what: 'OAuth client secret' },
  { api: 'identitytoolkit', schema: 'GoogleCloudIdentitytoolkitV1UserInfo', field: 'passwordHash', what: 'password hash' },
  { api: 'identitytoolkit', schema: 'GoogleCloudIdentitytoolkitV1UserInfo', field: 'salt', what: 'password salt' },
  { api: 'identitytoolkit', schema: 'GoogleCloudIdentitytoolkitAdminV2HashConfig', field: 'signerKey', what: 'password hash signer key' },

  // Google Analytics: the Measurement Protocol API secret. The get method is a write, so it asks and shows the value.
  {
    api: 'analyticsadmin',
    schema: 'GoogleAnalyticsAdminV1*MeasurementProtocolSecret',
    field: 'secretValue',
    what: 'Measurement Protocol secret',
    reveal: ['analyticsadmin.properties.dataStreams.measurementProtocolSecrets.get'],
  },

  // Apigee is served only through api_call, whose name list already replaces an app's whole "credentials" array; the key
  // reads (keys.get), which return the consumer key and secret at the top level, are writes.

  // Application Integration: decrypted auth configs and client certificate keys.
  {
    api: 'integrations',
    schema: 'GoogleCloudIntegrationsV1alphaAuthConfig',
    field: 'decryptedCredential',
    what: 'decrypted auth credential',
    reveal: ['integrations.projects.locations.authConfigs.get', 'integrations.projects.locations.products.authConfigs.get'],
  },
  { api: 'integrations', schema: 'GoogleCloudIntegrationsV1alphaClientCertificate', field: 'encryptedPrivateKey', what: 'client certificate private key' },
  { api: 'integrations', schema: 'GoogleCloudIntegrationsV1alphaClientCertificate', field: 'passphrase', what: 'private key passphrase' },

  // Android Management: enrollment and migration tokens. The get methods are writes, so they ask and show them.
  {
    api: 'androidmanagement',
    schema: 'EnrollmentToken',
    field: 'value',
    what: 'enrollment token',
    reveal: ['androidmanagement.enterprises.enrollmentTokens.get'],
  },
  {
    api: 'androidmanagement',
    schema: 'EnrollmentToken',
    field: 'qrCode',
    what: 'enrollment QR code, which holds the token',
    reveal: ['androidmanagement.enterprises.enrollmentTokens.get'],
  },
  {
    api: 'androidmanagement',
    schema: 'MigrationToken',
    field: 'value',
    what: 'migration token',
    reveal: ['androidmanagement.enterprises.migrationTokens.get'],
  },
  { api: 'androidmanagement', schema: 'SigninDetail', field: 'signinEnrollmentToken', what: 'sign-in enrollment token' },
  { api: 'androidmanagement', schema: 'SigninDetail', field: 'qrCode', what: 'enrollment QR code, which holds the token' },

  // Integration Connectors: end-user authentication secrets in plain text.
  { api: 'connectors', schema: 'EUASecret', field: 'secretValue', what: 'end-user authentication secret' },

  // Customer Engagement Suite: the WhatsApp two-step verification PIN.
  { api: 'ces', schema: 'WhatsAppCredentials', field: 'pin', what: 'WhatsApp two-step verification PIN' },

  // Campaign Manager 360: Floodlight third-party authentication tokens.
  { api: 'dfareporting', schema: 'ThirdPartyAuthenticationToken', field: 'value', what: 'third-party authentication token' },

  // Dialogflow: the auth code for the Call Companion UI, in an agent reply.
  { api: 'dialogflow', schema: 'GoogleCloudDialogflowV2AutomatedAgentReply', field: 'callCompanionAuthCode', what: 'Call Companion auth code' },
  { api: 'dialogflow', schema: 'GoogleCloudDialogflowV2beta1AutomatedAgentReply', field: 'callCompanionAuthCode', what: 'Call Companion auth code' },

  // Sensitive Data Protection: a raw (unwrapped) crypto key stored in a de-identify config.
  { api: 'dlp', schema: 'GooglePrivacyDlpV2UnwrappedCryptoKey', field: 'key', what: 'unwrapped crypto key' },

  // Eventarc: the token a provider uses to register a channel.
  { api: 'eventarc', schema: 'Channel', field: 'activationToken', what: 'channel activation token' },

  // NetApp Volumes: the generated cluster peering passphrase.
  { api: 'netapp', schema: 'CacheParameters', field: 'passphrase', what: 'cluster peering passphrase' },
  { api: 'netapp', schema: 'HybridPeeringDetails', field: 'passphrase', what: 'cluster peering passphrase' },

  // Drive client-side encryption: the signed JWT that authorizes the user with the key access control service.
  { api: 'drive', schema: 'DecryptionMetadata', field: 'jwt', what: 'key access JWT' },

  // Google Ads and Search Ads 360: the lead form webhook secret, and the Business Profile authorization token.
  { api: 'googleads', schema: 'GoogleAdsGoogleadsV*Common__WebhookDelivery', field: 'googleSecret', what: 'webhook anti-spoofing secret' },
  {
    api: 'googleads',
    schema: 'GoogleAdsGoogleadsV*Common__BusinessProfileLocationSet',
    field: 'httpAuthorizationToken',
    what: 'Business Profile authorization token',
  },
  { api: 'searchads360', schema: 'GoogleAdsSearchads360V*Common__WebhookDelivery', field: 'googleSecret', what: 'webhook anti-spoofing secret' },
  {
    api: 'searchads360',
    schema: 'GoogleAdsSearchads360V*Common__BusinessProfileLocationSet',
    field: 'httpAuthorizationToken',
    what: 'Business Profile authorization token',
  },

  // Generated tools have no name-based redaction, so stored passwords and tokens that a read may return are listed.
  { api: 'monitoring', schema: 'BasicAuthentication', field: 'password', what: 'uptime check password' },
  { api: 'merchantapi', schema: 'FetchSettings', field: 'password', what: 'fetch password' },
  {
    api: 'discoveryengine',
    schema: 'GoogleCloudDiscoveryengine*AlloyDbConnectionConfig',
    field: 'password',
    what: 'database password',
  },
  { api: 'discoveryengine', schema: 'A2aV1AuthenticationInfo', field: 'credentials', what: 'push notification credentials' },
  { api: 'discoveryengine', schema: 'A2aV1PushNotificationConfig', field: 'token', what: 'push notification token' },
  { api: 'cloudbilling', schema: 'AuthenticationInfo', field: 'credentials', what: 'push notification credentials' },
  { api: 'cloudbilling', schema: 'PushNotificationConfig', field: 'token', what: 'push notification token' },
];

/** The text that takes a credential's place in a read result. */
export function redactedText(rule: Pick<CredentialField, 'what' | 'reveal'>): string {
  if (!rule.reveal || rule.reveal.length === 0) return `[redacted: ${rule.what}]`;
  return `[redacted: ${rule.what}; to see it, call ${rule.reveal.join(' or ')}, which asks first]`;
}

/** The parts of a Discovery schema the walk reads. Both the trimmed snapshots and Google's full documents have them. */
export interface SchemaLike {
  $ref?: string;
  type?: string;
  properties?: Record<string, SchemaLike>;
  items?: SchemaLike;
  additionalProperties?: SchemaLike | boolean;
}

/** Where a response comes from: the API's document name, the method's response schema and the document's schemas. */
export interface ResponseShape {
  api: string;
  schema: string | undefined;
  schemas: Readonly<Record<string, SchemaLike>> | undefined;
}

const RULES_BY_API = new Map<string, CredentialField[]>();
for (const rule of CREDENTIAL_FIELDS) {
  const list = RULES_BY_API.get(rule.api) ?? [];
  list.push(rule);
  RULES_BY_API.set(rule.api, list);
}

const NO_RULES: ReadonlyMap<string, CredentialField> = new Map();
const fieldsCache = new Map<string, ReadonlyMap<string, CredentialField>>();

/** The credential fields of one schema of one API, by property name. Exact schema names and "*" patterns both match. */
export function credentialFieldsOf(api: string, schema: string): ReadonlyMap<string, CredentialField> {
  const key = `${api}\u0000${schema}`;
  const cached = fieldsCache.get(key);
  if (cached) return cached;
  const rules = RULES_BY_API.get(api) ?? [];
  const found = new Map<string, CredentialField>();
  for (const rule of rules) {
    const matches = rule.schema.includes('*') ? patternMatches(rule.schema, schema) : rule.schema === schema;
    if (matches && !found.has(rule.field)) found.set(rule.field, rule);
  }
  const result = found.size > 0 ? found : NO_RULES;
  fieldsCache.set(key, result);
  return result;
}

/** True when the API has listed credential fields. A response of any other API is returned as it is. */
export function hasCredentialFields(api: string): boolean {
  return RULES_BY_API.has(api);
}

interface Walk {
  api: string;
  schemas: Readonly<Record<string, SchemaLike>>;
}

/** Follows $ref links to the named schema. Returns the node and the name of the last schema reached. */
function resolve(node: SchemaLike | undefined, name: string | undefined, walk: Walk): { node: SchemaLike | undefined; name: string | undefined } {
  let current = node;
  let currentName = name;
  for (let hops = 0; current?.$ref && hops < 32; hops++) {
    currentName = current.$ref;
    current = walk.schemas[current.$ref];
  }
  return { node: current, name: currentName };
}

/**
 * Walks a value along its schema and replaces each listed credential field that holds a value. Copy on write: a value
 * with nothing to replace is returned as the same object, so its JSON text is unchanged.
 */
function walkValue(value: unknown, schemaNode: SchemaLike | undefined, schemaName: string | undefined, walk: Walk): unknown {
  if (value === null || typeof value !== 'object') return value;
  const { node, name } = resolve(schemaNode, schemaName, walk);
  if (!node) return value;

  if (Array.isArray(value)) {
    const items = node.items;
    if (!items) return value;
    let changed = false;
    const out = value.map((item) => {
      const next = walkValue(item, items, undefined, walk);
      if (next !== item) changed = true;
      return next;
    });
    return changed ? out : value;
  }

  const fields = name ? credentialFieldsOf(walk.api, name) : NO_RULES;
  const extra = typeof node.additionalProperties === 'object' ? node.additionalProperties : undefined;
  let out: Record<string, unknown> | undefined;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    let next: unknown = child;
    const rule = fields.get(key);
    if (rule) {
      if (child !== undefined && child !== null && child !== '') next = redactedText(rule);
    } else {
      const sub = node.properties?.[key] ?? extra;
      if (sub) next = walkValue(child, sub, undefined, walk);
    }
    if (next !== child) {
      out ??= { ...(value as Record<string, unknown>) };
      out[key] = next;
    }
  }
  return out ?? value;
}

/**
 * Replaces the listed credential fields in the result of one read call. The response is walked along the method's
 * response schema. A streamed answer (a JSON array of the declared response object, as Google Ads searchStream sends) is
 * walked element by element. Returns the same value when the API has no listed fields or nothing was replaced.
 */
export function redactCredentials(value: unknown, shape: ResponseShape): unknown {
  if (!shape.schema || !shape.schemas || !hasCredentialFields(shape.api)) return value;
  const walk: Walk = { api: shape.api, schemas: shape.schemas };
  const root: SchemaLike = { $ref: shape.schema };
  if (Array.isArray(value)) {
    const { node } = resolve(root, undefined, walk);
    if (node && !node.items && node.type !== 'array') {
      let changed = false;
      const out = value.map((item) => {
        const next = walkValue(item, root, undefined, walk);
        if (next !== item) changed = true;
        return next;
      });
      return changed ? out : value;
    }
  }
  return walkValue(value, root, undefined, walk);
}
