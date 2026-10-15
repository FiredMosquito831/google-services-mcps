# Workspace Admin (`gadmin`)

Google Workspace administration for your domain: users, groups, org units, domains, Cloud Identity, Chrome management and policy, Groups Settings, licensing, reports, alerts, Vault, reseller, data transfer and Cloud Search admin. It acts as a super admin through a service account with domain-wide delegation. It has 366 tools.

## When to install it

- You create, suspend, move or delete users and org units.
- You manage group membership or read group settings.
- You pull audit reports or check security alerts.
- You search or export Vault matters.
- Wrong choice: you have no super admin account and cannot set domain-wide delegation. Single-user tasks belong in `gmail`, `gdrive` or `gcalendar`.

## Install and set up

This product has no user login. It uses a service account with domain-wide delegation.

```
claude plugin install gadmin@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-admin --subject <super-admin-email> --key-file <key.json> --profile readonly
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gadmin`).

1. In Google Cloud, create a service account and a JSON key. If your organization blocks key creation (the default for organizations created since May 2024), ask your administrator for an exception.
2. In the Google Admin console, open Security, API controls, Domain-wide delegation. Add the service account's client ID with the scopes the profile lists. Run `node <plugin>/bin/gsm.mjs scopes workspace-admin` to print them.
3. Run `setup-admin` with a super admin's email. The key file is not copied. The suite reads it from where you put it.

Restart the MCP server (`/mcp`) after setup.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Users (hand-written) | `admin_users_list`, `admin_user_get` | read | List and read users |
| | `admin_user_create`, `admin_user_set_suspended`, `admin_user_move_org_unit` | write | Create, suspend or restore, and move users |
| | `admin_user_delete` | destructive | Delete a user |
| Groups (hand-written) | `admin_groups_list`, `admin_group_get`, `admin_group_members_list` | read | List groups, read a group and its members |
| | `admin_group_create`, `admin_group_member_add` | write | Create a group, add a member |
| | `admin_group_delete`, `admin_member_remove` | destructive | Delete a group, remove a member |
| Org units and domains (hand-written) | `admin_orgunits_list`, `admin_orgunit_get`, `admin_domains_list` | read | List org units and domains |
| | `admin_orgunit_create`, `admin_orgunit_update` | write | Create or change an org unit |
| | `admin_orgunit_delete` | destructive | Delete an org unit |
| Per-method (343) | | mixed | Directory (128 methods), Cloud Identity (70), Cloud Search (49), Vault (33), Reseller (17), Chrome Policy (14), Alert Center (11), Licensing (7), Reports (6), Data Transfer (5), Groups Settings (3) |
| Gateway (4 APIs) | `api_search`, `api_describe`, `api_call` | read, read, dynamic | Chrome Management (70 methods), Cloud Identity v1beta1 (71), Groups Migration, Verified Access v1 |

The full list is in `docs/capabilities/gadmin.md`.

## Example requests

- "Suspend jdoe@company.test until the HR review ends." Claude runs `admin_user_set_suspended`. It asks first.
- "List the members of the Finance group." Claude runs `admin_group_members_list`. No prompt.
- "Move Lee to the Sales org unit." Claude runs `admin_user_move_org_unit`. It asks first.
- "Delete the account of the former contractor." Claude runs `admin_user_delete`. It asks twice.
- "Who signed in as admin last week?" Claude runs a Reports activity read. No prompt.

## Safety

- This product can change every user in the domain. Use `readonly` until you need changes.
- Reads never ask. Writes ask first. Deletes ask twice. There are 60 destructive tools.
- A token without a write scope gets HTTP 403 on writes. Check the scopes before you test a write.
- The `confirmation` option defaults to `every-change`. Change it with `claude plugin configure gadmin`.

## Costs and limits

Admin SDK APIs are included with Google Workspace, and the fee was not fetched (UNVERIFIED). Directory allows 2,400 queries per minute per user per project, Reports 250 filter queries per minute, and Vault 600 matter reads per minute across the organization. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/workspace-cloud-search-ai.md`, section 11.

## Caveats

- Calendar on or off per org unit is not in the API, so this plugin cannot set it. Use the Admin console for that.
- Admin role requirements per API are UNVERIFIED.
- Limits for Cloud Identity, Chrome Management and Reseller are UNVERIFIED.
- Key creation can be blocked by organization policy. Ask for an exception before you set up.
