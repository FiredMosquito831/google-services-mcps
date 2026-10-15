/**
 * Curated tool definitions for the Workspace admin server (MCP name "gws-admin"):
 * Admin SDK Directory API for users, org units, groups, group members and domains.
 * The Discovery-generated tools are added by the generated entry (scripts/bundle.mjs).
 *
 * Calendar on/off per org unit is console-only (not in the Directory API), so there is no tool for it.
 *
 * Auth: service account with domain-wide delegation, impersonating GSM_ADMIN_SUBJECT. The client ID
 * must be authorized in the Admin console for admin.directory.user, admin.directory.group and
 * admin.directory.orgunit.
 */
import { admin, type admin_directory_v1 } from '@googleapis/admin';
import type { JWT, OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { getAuthClient, googleScopes } from '../core/auth.js';
import { defineTool, type ToolDef } from '../core/tools.js';

type Dir = admin_directory_v1.Admin;
type User = admin_directory_v1.Schema$User;
type Group = admin_directory_v1.Schema$Group;
type OrgUnit = admin_directory_v1.Schema$OrgUnit;
type Member = admin_directory_v1.Schema$Member;

const CUSTOMER = 'my_customer';

let cachedDir: Dir | undefined;
async function directory(cfg: RuntimeConfig): Promise<Dir> {
  if (!cachedDir) {
    const auth: OAuth2Client | JWT = await getAuthClient('workspace-admin', cfg);
    cachedDir = admin({ version: 'directory_v1', auth });
  }
  return cachedDir;
}

function requireText(value: string | undefined, field: string): string {
  const v = value?.trim();
  if (!v) throw new Error(`${field} is required.`);
  return v;
}

/**
 * Path-parameter form of an org unit path: no leading slash ("Sales/EU"). The SDK's
 * {+orgUnitPath} template keeps the slashes and percent-encodes each segment itself,
 * so the value must not be pre-encoded here.
 */
function ouPath(value: string | undefined, field: string): string {
  const p = requireText(value, field).replace(/^\/+/, '').replace(/\/+$/, '');
  if (!p) throw new Error(`${field} must name a unit below the root, for example /Sales.`);
  return p;
}

/** Request-body form of an org unit path: leading slash ("/Sales/EU"), "/" for the top level. */
function ouBodyPath(value: string): string {
  const p = value.trim();
  return p.startsWith('/') ? p : `/${p}`;
}

function scope(customer: string | undefined, domain: string | undefined): { customer?: string; domain?: string } {
  if (customer && domain) throw new Error('Pass either customer or domain, not both.');
  return domain ? { domain } : { customer: customer ?? CUSTOMER };
}

function summarizeUser(u: User) {
  return {
    id: u.id,
    primaryEmail: u.primaryEmail,
    name: u.name?.fullName,
    orgUnitPath: u.orgUnitPath,
    suspended: u.suspended,
    isAdmin: u.isAdmin,
    lastLoginTime: u.lastLoginTime,
    creationTime: u.creationTime,
  };
}

function summarizeGroup(g: Group) {
  return { id: g.id, email: g.email, name: g.name, description: g.description, directMembersCount: g.directMembersCount };
}

function summarizeOrgUnit(o: OrgUnit) {
  return {
    orgUnitId: o.orgUnitId,
    orgUnitPath: o.orgUnitPath,
    name: o.name,
    parentOrgUnitPath: o.parentOrgUnitPath,
    description: o.description,
  };
}

function summarizeMember(m: Member) {
  return { id: m.id, email: m.email, role: m.role, type: m.type, status: m.status };
}

/** Passwords are write-only. Strip the field from any object before it leaves this server. */
function withoutPassword(u: User): User {
  const { password: _password, ...rest } = u;
  return rest;
}

const customerField = z
  .string()
  .optional()
  .describe('Customer ID, or "my_customer" (default) for this account. Use customer or domain, not both.');
const domainField = z.string().optional().describe('One domain, for example example.com. Use customer or domain, not both.');
const queryField = z.string().optional().describe("Admin search syntax, for example orgUnitPath='/Sales'.");
const pageTokenField = z.string().optional().describe('nextPageToken from the previous page.');
const userKeyField = z.string().min(1).describe('User primary email, alias, or unique user ID.');
const groupKeyField = z.string().min(1).describe('Group email, alias, or unique group ID.');
const orgPathField = z.string().min(1).describe('Full org unit path, for example /Sales/EU.');

export async function buildTools(cfg: RuntimeConfig): Promise<ToolDef[]> {
  const api = () => directory(cfg);

  return [
    // ---- read ----
    defineTool({
      name: 'admin_users_list',
      title: 'List users',
      description: 'List users in the account or one domain. Returns summaries; use admin_user_get for the full record.',
      kind: 'read',
      scopes: googleScopes('admin.directory.user', 'admin.directory.user.readonly'),
      inputSchema: {
        customer: customerField,
        domain: domainField,
        query: queryField,
        max_results: z.number().int().min(1).max(500).default(100).describe('Page size, 1-500. Default 100.'),
        page_token: pageTokenField,
        order_by: z.enum(['email', 'familyName', 'givenName']).optional().describe('Sort field.'),
      },
      async handler({ customer, domain, query, max_results, page_token, order_by }) {
        const res = await (await api()).users.list({
          ...scope(customer, domain),
          query,
          maxResults: max_results,
          pageToken: page_token,
          orderBy: order_by,
        });
        return { users: (res.data.users ?? []).map(summarizeUser), nextPageToken: res.data.nextPageToken ?? undefined };
      },
    }),
    defineTool({
      name: 'admin_user_get',
      title: 'Get user',
      description: 'Get one user (raw record, password removed) plus the emails of the groups the user belongs to.',
      kind: 'read',
      scopes: googleScopes('admin.directory.user', 'admin.directory.user.readonly'),
      inputSchema: { user_key: userKeyField },
      async handler({ user_key }) {
        const key = requireText(user_key, 'user_key');
        const dir = await api();
        const user = (await dir.users.get({ userKey: key })).data;
        const groups = (await dir.groups.list({ userKey: key, maxResults: 200 })).data;
        return {
          ...withoutPassword(user),
          groups: (groups.groups ?? []).map((g) => g.email),
          groupsMore: Boolean(groups.nextPageToken),
        };
      },
    }),
    defineTool({
      name: 'admin_orgunits_list',
      title: 'List org units',
      description: 'List org units, or the sub-units of one org unit.',
      kind: 'read',
      scopes: googleScopes('admin.directory.orgunit', 'admin.directory.orgunit.readonly'),
      inputSchema: {
        customer_id: z.string().optional().describe('Customer ID, or "my_customer" (default).'),
        org_unit_path: z.string().optional().describe('Parent path, for example /Sales. Omit for all units.'),
        type: z.enum(['all', 'children']).optional().describe('"children" for direct children (default), "all" for every sub-unit.'),
      },
      async handler({ customer_id, org_unit_path, type }) {
        const parent = org_unit_path?.trim().replace(/\/+$/, '');
        const res = await (await api()).orgunits.list({
          customerId: customer_id ?? CUSTOMER,
          orgUnitPath: parent ? ouBodyPath(parent) : undefined,
          type,
        });
        return { organizationUnits: (res.data.organizationUnits ?? []).map(summarizeOrgUnit) };
      },
    }),
    defineTool({
      name: 'admin_orgunit_get',
      title: 'Get org unit',
      description: 'Get one org unit by its full path, for example /Sales/EU.',
      kind: 'read',
      scopes: googleScopes('admin.directory.orgunit', 'admin.directory.orgunit.readonly'),
      inputSchema: { org_unit_path: orgPathField },
      async handler({ org_unit_path }) {
        const res = await (await api()).orgunits.get({
          customerId: CUSTOMER,
          orgUnitPath: ouPath(org_unit_path, 'org_unit_path'),
        });
        return res.data;
      },
    }),
    defineTool({
      name: 'admin_groups_list',
      title: 'List groups',
      description: 'List groups in the account or one domain, or the groups one user belongs to (user_key).',
      kind: 'read',
      scopes: googleScopes('admin.directory.group', 'admin.directory.group.readonly'),
      inputSchema: {
        customer: customerField,
        domain: domainField,
        user_key: z.string().optional().describe('Only the groups this user belongs to. Cannot be combined with customer or domain.'),
        query: queryField,
        max_results: z.number().int().min(1).max(200).default(100).describe('Page size, 1-200. Default 100.'),
        page_token: pageTokenField,
      },
      async handler({ customer, domain, user_key, query, max_results, page_token }) {
        let target: { customer?: string; domain?: string; userKey?: string };
        if (user_key?.trim()) {
          if (customer || domain) throw new Error('user_key cannot be combined with customer or domain.');
          target = { userKey: user_key.trim() };
        } else {
          target = scope(customer, domain);
        }
        const res = await (await api()).groups.list({ ...target, query, maxResults: max_results, pageToken: page_token });
        return { groups: (res.data.groups ?? []).map(summarizeGroup), nextPageToken: res.data.nextPageToken ?? undefined };
      },
    }),
    defineTool({
      name: 'admin_group_get',
      title: 'Get group',
      description: 'Get one group by email or ID (raw record).',
      kind: 'read',
      scopes: googleScopes('admin.directory.group', 'admin.directory.group.readonly'),
      inputSchema: { group_key: groupKeyField },
      async handler({ group_key }) {
        return (await (await api()).groups.get({ groupKey: requireText(group_key, 'group_key') })).data;
      },
    }),
    defineTool({
      name: 'admin_group_members_list',
      title: 'List group members',
      description: 'List the members of a group, optionally filtered by role.',
      kind: 'read',
      scopes: googleScopes('admin.directory.group', 'admin.directory.group.readonly', 'admin.directory.group.member', 'admin.directory.group.member.readonly'),
      inputSchema: {
        group_key: groupKeyField,
        roles: z.string().optional().describe('Comma-separated roles to keep, for example "MEMBER,OWNER". Values: OWNER, MANAGER, MEMBER.'),
        max_results: z.number().int().min(1).max(200).default(100).describe('Page size, 1-200. Default 100.'),
        page_token: pageTokenField,
      },
      async handler({ group_key, roles, max_results, page_token }) {
        const res = await (await api()).members.list({
          groupKey: requireText(group_key, 'group_key'),
          roles,
          maxResults: max_results,
          pageToken: page_token,
        });
        return { members: (res.data.members ?? []).map(summarizeMember), nextPageToken: res.data.nextPageToken ?? undefined };
      },
    }),
    defineTool({
      name: 'admin_domains_list',
      title: 'List domains',
      description: 'List the domains of the account.',
      kind: 'read',
      scopes: googleScopes('admin.directory.domain', 'admin.directory.domain.readonly'),
      inputSchema: { customer: customerField },
      async handler({ customer }) {
        const res = await (await api()).domains.list({ customer: customer ?? CUSTOMER });
        return {
          domains: (res.data.domains ?? []).map((d) => ({ domainName: d.domainName, isPrimary: d.isPrimary, creationTime: d.creationTime })),
        };
      },
    }),

    // ---- write (registered only when GSM_ALLOW_WRITES=true) ----
    defineTool({
      name: 'admin_user_create',
      title: 'Create user',
      description: 'Create a user. The password is write-only and is never returned.',
      kind: 'write',
      scopes: googleScopes('admin.directory.user'),
      inputSchema: {
        primary_email: z.string().email().describe('Primary email, for example anna@example.com.'),
        given_name: z.string().min(1),
        family_name: z.string().min(1),
        password: z.string().min(8).describe('Initial password, at least 8 characters.'),
        org_unit_path: z.string().optional().describe('Org unit path, for example /Sales. Default: top level.'),
        change_password_at_next_login: z.boolean().default(true),
      },
      async handler({ primary_email, given_name, family_name, password, org_unit_path, change_password_at_next_login }) {
        if (!password || password.length < 8) throw new Error('password is required and must be at least 8 characters.');
        const created = await (await api()).users.insert({
          requestBody: {
            primaryEmail: requireText(primary_email, 'primary_email'),
            name: { givenName: requireText(given_name, 'given_name'), familyName: requireText(family_name, 'family_name') },
            password,
            orgUnitPath: org_unit_path ? ouBodyPath(org_unit_path) : undefined,
            changePasswordAtNextLogin: change_password_at_next_login,
          },
        });
        return summarizeUser(withoutPassword(created.data));
      },
    }),
    defineTool({
      name: 'admin_user_move_org_unit',
      title: 'Move user to org unit',
      description: 'Move a user to another org unit. Changes which Workspace services the user can access.',
      kind: 'write',
      scopes: googleScopes('admin.directory.user'),
      inputSchema: {
        user_key: userKeyField,
        org_unit_path: z.string().min(1).describe('Target path, for example /Sales/EU, or / for the top level.'),
      },
      async handler({ user_key, org_unit_path }) {
        const res = await (await api()).users.patch({
          userKey: requireText(user_key, 'user_key'),
          requestBody: { orgUnitPath: ouBodyPath(requireText(org_unit_path, 'org_unit_path')) },
        });
        return summarizeUser(res.data);
      },
    }),
    defineTool({
      name: 'admin_user_set_suspended',
      title: 'Suspend or restore user',
      description: 'Suspend (true) or restore (false) a user. Reversible.',
      kind: 'write',
      scopes: googleScopes('admin.directory.user'),
      inputSchema: { user_key: userKeyField, suspended: z.boolean() },
      async handler({ user_key, suspended }) {
        const res = await (await api()).users.patch({
          userKey: requireText(user_key, 'user_key'),
          requestBody: { suspended },
        });
        return summarizeUser(res.data);
      },
    }),
    defineTool({
      name: 'admin_orgunit_create',
      title: 'Create org unit',
      description: 'Create an org unit under a parent path.',
      kind: 'write',
      scopes: googleScopes('admin.directory.orgunit'),
      inputSchema: {
        name: z.string().min(1).describe('Unit name, not a path, for example "EU".'),
        parent_org_unit_path: z.string().default('/').describe('Parent path, for example /Sales. "/" for the top level.'),
        description: z.string().optional(),
      },
      async handler({ name, parent_org_unit_path, description }) {
        const res = await (await api()).orgunits.insert({
          customerId: CUSTOMER,
          requestBody: {
            name: requireText(name, 'name'),
            parentOrgUnitPath: ouBodyPath(parent_org_unit_path),
            description,
          },
        });
        return summarizeOrgUnit(res.data);
      },
    }),
    defineTool({
      name: 'admin_orgunit_update',
      title: 'Update org unit',
      description: 'Update an org unit (patch: only the fields you pass change). Passing a new parent moves the unit.',
      kind: 'write',
      scopes: googleScopes('admin.directory.orgunit'),
      // block_inheritance is deprecated in the Directory API (setting it has no effect), so it is not offered.
      inputSchema: {
        org_unit_path: orgPathField,
        name: z.string().min(1).optional().describe('New unit name, not a path.'),
        description: z.string().optional(),
        parent_org_unit_path: z.string().min(1).optional().describe('New parent path, for example / or /Sales.'),
      },
      async handler({ org_unit_path, name, description, parent_org_unit_path }) {
        const body: OrgUnit = {};
        if (name !== undefined) body.name = requireText(name, 'name');
        if (description !== undefined) body.description = description;
        if (parent_org_unit_path !== undefined) body.parentOrgUnitPath = ouBodyPath(parent_org_unit_path);
        if (Object.keys(body).length === 0) {
          throw new Error('Nothing to update: pass name, description or parent_org_unit_path.');
        }
        const res = await (await api()).orgunits.patch({
          customerId: CUSTOMER,
          orgUnitPath: ouPath(org_unit_path, 'org_unit_path'),
          requestBody: body,
        });
        return summarizeOrgUnit(res.data);
      },
    }),
    defineTool({
      name: 'admin_group_create',
      title: 'Create group',
      description: 'Create a group with an email address.',
      kind: 'write',
      scopes: googleScopes('admin.directory.group'),
      inputSchema: {
        email: z.string().email(),
        name: z.string().min(1).describe('Display name.'),
        description: z.string().optional(),
      },
      async handler({ email, name, description }) {
        const res = await (await api()).groups.insert({
          requestBody: { email: requireText(email, 'email'), name: requireText(name, 'name'), description },
        });
        return summarizeGroup(res.data);
      },
    }),
    defineTool({
      name: 'admin_group_member_add',
      title: 'Add group member',
      description: 'Add a user or group to a group with a role.',
      kind: 'write',
      scopes: googleScopes('admin.directory.group', 'admin.directory.group.member'),
      inputSchema: {
        group_key: groupKeyField,
        email: z.string().email().describe('Email of the user or group to add.'),
        role: z.enum(['MEMBER', 'MANAGER', 'OWNER']).default('MEMBER'),
      },
      async handler({ group_key, email, role }) {
        const res = await (await api()).members.insert({
          groupKey: requireText(group_key, 'group_key'),
          requestBody: { email: requireText(email, 'email'), role },
        });
        return summarizeMember(res.data);
      },
    }),

    // ---- destructive (asks for approval before each call). Previews only read; they never change anything. ----
    defineTool({
      name: 'admin_user_delete',
      title: 'Delete user',
      description: 'Delete a user. Recoverable for a limited time, after which the deletion is permanent.',
      kind: 'destructive',
      scopes: googleScopes('admin.directory.user'),
      inputSchema: { user_key: userKeyField },
      async preview({ user_key }) {
        const u = (await (await api()).users.get({ userKey: requireText(user_key, 'user_key') })).data;
        return {
          name: u.name?.fullName,
          email: u.primaryEmail,
          orgUnitPath: u.orgUnitPath,
          effect: 'User is deleted. Restorable for a limited time; after that the deletion is permanent.',
        };
      },
      async handler({ user_key }) {
        const key = requireText(user_key, 'user_key');
        await (await api()).users.delete({ userKey: key });
        return { deleted: true, userKey: key };
      },
    }),
    defineTool({
      name: 'admin_orgunit_delete',
      title: 'Delete org unit',
      description: 'Delete an org unit. The API refuses while users remain in it.',
      kind: 'destructive',
      scopes: googleScopes('admin.directory.orgunit'),
      inputSchema: { org_unit_path: orgPathField },
      async preview({ org_unit_path }) {
        const path = ouBodyPath(ouPath(org_unit_path, 'org_unit_path'));
        const dir = await api();
        const usersQuery = `orgUnitPath='${path}'`;
        const [children, users] = await Promise.all([
          dir.orgunits.list({ customerId: CUSTOMER, orgUnitPath: path, type: 'all' }),
          dir.users.list({ customer: CUSTOMER, query: usersQuery, maxResults: 500 }),
        ]);
        return {
          orgUnitPath: path,
          childOrgUnits: (children.data.organizationUnits ?? []).map((o) => o.orgUnitPath),
          usersInOrgUnit: (users.data.users ?? []).map((u) => u.primaryEmail),
          usersMoreExist: Boolean(users.data.nextPageToken),
          usersQuery,
          effect: 'The API refuses deletion while users remain in the org unit. Move or delete them first.',
        };
      },
      async handler({ org_unit_path }) {
        const path = ouPath(org_unit_path, 'org_unit_path');
        await (await api()).orgunits.delete({ customerId: CUSTOMER, orgUnitPath: path });
        return { deleted: true, orgUnitPath: `/${path}` };
      },
    }),
    defineTool({
      name: 'admin_group_delete',
      title: 'Delete group',
      description: 'Delete a group and its memberships.',
      kind: 'destructive',
      scopes: googleScopes('admin.directory.group'),
      inputSchema: { group_key: groupKeyField },
      async preview({ group_key }) {
        const g = (await (await api()).groups.get({ groupKey: requireText(group_key, 'group_key') })).data;
        return {
          email: g.email,
          name: g.name,
          directMembersCount: g.directMembersCount,
          effect: 'Group and its memberships are removed.',
        };
      },
      async handler({ group_key }) {
        const key = requireText(group_key, 'group_key');
        await (await api()).groups.delete({ groupKey: key });
        return { deleted: true, groupKey: key };
      },
    }),
    defineTool({
      name: 'admin_member_remove',
      title: 'Remove group member',
      description: 'Remove a user or group from a group.',
      kind: 'destructive',
      scopes: googleScopes('admin.directory.group', 'admin.directory.group.member'),
      inputSchema: { group_key: groupKeyField, member_key: z.string().min(1).describe('Member email, alias, or unique ID.') },
      async preview({ group_key, member_key }) {
        const m = (await (await api()).members.get({
          groupKey: requireText(group_key, 'group_key'),
          memberKey: requireText(member_key, 'member_key'),
        })).data;
        return { group: group_key, member: summarizeMember(m), effect: 'Member is removed from the group.' };
      },
      async handler({ group_key, member_key }) {
        const g = requireText(group_key, 'group_key');
        const m = requireText(member_key, 'member_key');
        await (await api()).members.delete({ groupKey: g, memberKey: m });
        return { removed: true, groupKey: g, memberKey: m };
      },
    }),
  ];
}
