/**
 * Curated Contacts and profile tools of the gcontacts server. They match the tools of Google's People MCP server
 * (developers.google.com/people/api/mcp/tools_list): search the Workspace directory, search your contacts, and read your
 * own profile. The generated people_* tools need a readMask and the right sources from the caller; these set sensible
 * ones, send the warm-up request Google asks for before a contact search, and return short entries.
 *
 * All three are reads. Like Google's tools, the search descriptions tell the model to show the people found and let the
 * person confirm which one is meant before a result goes into another tool.
 *
 * Auth: OAuth user token from `gsm login workspace-user`.
 */
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { getAuthClient, googleScopes } from '../core/auth.js';
import { defineTool, type ToolDef } from '../core/tools.js';
import { makeCloudCall, type CloudCall } from './cloud-http.js';

const PEOPLE = 'https://people.googleapis.com/v1';
const USERINFO = 'https://www.googleapis.com/oauth2/v2/userinfo';

/** The person fields read when the caller names none: enough to tell people apart and reach them. */
export const DEFAULT_PERSON_FIELDS = ['names', 'emailAddresses', 'phoneNumbers', 'organizations'] as const;
/** The person fields a caller may ask for (the readMask values of searchContacts and searchDirectoryPeople). */
export const PERSON_FIELDS = [
  'addresses',
  'ageRanges',
  'biographies',
  'birthdays',
  'calendarUrls',
  'clientData',
  'coverPhotos',
  'emailAddresses',
  'events',
  'externalIds',
  'genders',
  'imClients',
  'interests',
  'locales',
  'locations',
  'memberships',
  'metadata',
  'miscKeywords',
  'names',
  'nicknames',
  'occupations',
  'organizations',
  'phoneNumbers',
  'photos',
  'relations',
  'sipAddresses',
  'skills',
  'urls',
  'userDefined',
] as const;

const CAUTION =
  'If more than one person matches, show them and ask which one is meant. Even when one person is found, show who it is and let the user confirm before using the result in another tool (an email, a draft, an invitation, a message): never pass a result on without that confirmation.';

/** The readMask of a search: the fields asked for, else the defaults. Each field once, in the order given. */
export function readMaskOf(fields: readonly string[] | undefined): string {
  const list = fields?.length ? fields : DEFAULT_PERSON_FIELDS;
  return [...new Set(list)].join(',');
}

interface Person {
  resourceName?: string;
  names?: Array<{ displayName?: string; givenName?: string; familyName?: string; metadata?: { primary?: boolean } }>;
  emailAddresses?: Array<{ value?: string; type?: string; metadata?: { primary?: boolean } }>;
  phoneNumbers?: Array<{ value?: string; canonicalForm?: string; type?: string }>;
  organizations?: Array<{ name?: string; title?: string; department?: string }>;
  [field: string]: unknown;
}

const primaryFirst = <T extends { metadata?: { primary?: boolean } }>(list: T[] | undefined): T[] =>
  [...(list ?? [])].sort((a, b) => Number(b.metadata?.primary === true) - Number(a.metadata?.primary === true));

/**
 * One person, short: the name, the email addresses and phone numbers, and the organization; any other field asked for
 * is passed through as Google returns it.
 */
export function personSummary(p: Person) {
  const { resourceName, names, emailAddresses, phoneNumbers, organizations, etag: _etag, ...rest } = p;
  const name = primaryFirst(names)[0];
  return {
    resource_name: resourceName,
    ...(name ? { name: name.displayName ?? [name.givenName, name.familyName].filter(Boolean).join(' ') } : {}),
    ...(emailAddresses?.length ? { emails: primaryFirst(emailAddresses).map((e) => e.value).filter(Boolean) } : {}),
    ...(phoneNumbers?.length ? { phones: phoneNumbers.map((ph) => ph.canonicalForm ?? ph.value).filter(Boolean) } : {}),
    ...(organizations?.length
      ? { organization: { name: organizations[0]?.name, title: organizations[0]?.title, department: organizations[0]?.department } }
      : {}),
    ...rest,
  };
}

const fields = z
  .array(z.enum(PERSON_FIELDS))
  .optional()
  .describe(`Person fields to return. Default: ${DEFAULT_PERSON_FIELDS.join(', ')}.`);

export async function buildTools(cfg: RuntimeConfig): Promise<ToolDef[]> {
  // The account is chosen per call (see account-context.ts), so the client is not cached here.
  const call: CloudCall = makeCloudCall(() => getAuthClient('workspace-user', cfg));

  return [
    defineTool({
      name: 'contacts_search_directory',
      title: 'Search the Workspace directory',
      description: `Search the people of your organization's Google Workspace directory by name or email prefix (matches search_directory_people in Google's People MCP server). Workspace accounts only; a personal Google account has no directory. Domain profiles by default; sources can add the domain's shared contacts. ${CAUTION}`,
      kind: 'read',
      scopes: googleScopes('directory.readonly'),
      inputSchema: {
        query: z.string().min(1).describe('A name or email prefix, for example "ana" or "ana.m@".'),
        sources: z
          .array(z.enum(['profile', 'contact']))
          .min(1)
          .optional()
          .describe('profile: the domain profiles (the default); contact: the domain shared contacts.'),
        fields,
        page_size: z.number().int().min(1).max(500).optional().describe('People per page, 1 to 500. Default 10.'),
        page_token: z.string().optional().describe('next_page_token from the previous call, with the same other arguments.'),
      },
      async handler({ query, sources, fields: wanted, page_size, page_token }) {
        const url = new URL(`${PEOPLE}/people:searchDirectoryPeople`);
        for (const s of sources?.length ? [...new Set(sources)] : ['profile']) {
          url.searchParams.append('sources', s === 'contact' ? 'DIRECTORY_SOURCE_TYPE_DOMAIN_CONTACT' : 'DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE');
        }
        const res = await call<{ people?: Person[]; nextPageToken?: string; totalSize?: number }>({
          url: url.toString(),
          query: { query, readMask: readMaskOf(wanted), pageSize: page_size ?? 10, pageToken: page_token },
        });
        const people = (res.data.people ?? []).map(personSummary);
        return {
          people,
          ...(people.length > 1 ? { note: 'Several people match: ask which one is meant.' } : {}),
          next_page_token: res.data.nextPageToken || undefined,
        };
      },
    }),
    defineTool({
      name: 'contacts_search',
      title: 'Search your contacts',
      description: `Search your Google Contacts by the start of a name, nickname, email address, phone number or organization (matches search_contacts in Google's People MCP server). It sends the warm-up request Google asks for before a search, so new contacts are found. ${CAUTION}`,
      kind: 'read',
      scopes: googleScopes('contacts', 'contacts.readonly'),
      inputSchema: {
        query: z.string().min(1).describe('The start of a name, email address, phone number or organization.'),
        fields,
        max_results: z.number().int().min(1).max(30).optional().describe('1 to 30 (Google returns at most 30). Default 10.'),
      },
      async handler({ query, fields: wanted, max_results }) {
        const readMask = readMaskOf(wanted);
        // Google: "Before searching, clients should send a warmup request with an empty query to update the cache."
        await call({ url: `${PEOPLE}/people:searchContacts`, query: { query: '', readMask } });
        const res = await call<{ results?: Array<{ person?: Person }> }>({
          url: `${PEOPLE}/people:searchContacts`,
          query: { query, readMask, pageSize: max_results ?? 10 },
        });
        const people = (res.data.results ?? []).map((r) => r.person).filter((p): p is Person => !!p).map(personSummary);
        return { people, ...(people.length > 1 ? { note: 'Several people match: ask which one is meant.' } : {}) };
      },
    }),
    defineTool({
      name: 'profile_me',
      title: 'Your Google profile',
      description:
        "Your own name and email address, as Google has them for the signed-in account (matches get_user_profile in Google's People MCP server). The email comes with every sign-in; the name and picture need the userinfo.profile scope, which every profile of a contacts sign-in asks for (since 1.35.1; an older sign-in may lack it), and the answer says when the sign-in lacks it.",
      kind: 'read',
      // The scopes of oauth2.userinfo.get, as Discovery spells them: openid is a bare name, not a URL.
      scopes: ['openid', ...googleScopes('userinfo.email', 'userinfo.profile')],
      inputSchema: {},
      async handler() {
        const res = await call<{ email?: string; name?: string; given_name?: string; family_name?: string; picture?: string; verified_email?: boolean }>({ url: USERINFO });
        const u = res.data;
        return {
          ...(u.name !== undefined ? { name: u.name } : {}),
          ...(u.email !== undefined ? { email: u.email } : {}),
          ...(u.picture !== undefined ? { picture: u.picture } : {}),
          ...(u.name === undefined
            ? { note: 'Google returned no name: the sign-in lacks the userinfo.profile scope. Sign in again (auth_login with this account) to see the name.' }
            : {}),
        };
      },
    }),
  ];
}
