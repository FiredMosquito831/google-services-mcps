# Contacts and Profile (`gcontacts`)

Install with the simplest command: `npx google-services-mcps install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Google Contacts and People, the Google Health API (personal health metrics), Data Portability, and the OAuth2 userinfo endpoints. It searches, reads, creates and updates contacts and groups, reads your profile, and reads or writes health data points. It also starts Data Portability export jobs.

## When to install it

- You look up, add or clean up your contacts and contact groups.
- You search the Workspace directory for a person.
- You start a Data Portability export of your data.
- You read or record personal health data points, if you need that.
- Wrong choice: you need to manage users or groups across the organization. Use `gadmin`.

## Install and set up

```
claude plugin install gcontacts@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-client <client_secret.json>
node <plugin>/bin/gsm.mjs login workspace-user --profile readonly
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gcontacts`).

1. In a Google Cloud project, enable the People API. Enable the Google Health API and the Data Portability API if you use those tools.
2. Set up the OAuth consent screen. Use Internal for a Workspace domain. Create an OAuth client ID of type Desktop app and download the JSON file.
3. Run `setup-client`, then `login workspace-user`. Restart the MCP server (`/mcp`) after login.

Start with `--profile readonly`. Changes need a `readwrite` login and the plugin option `allow_writes`. To see each profile's scopes, run `node <plugin>/bin/gsm.mjs scopes workspace-user`.

**Health and Data Portability are optional parts (since 1.34.0).** A contacts login no longer asks for them unless you name them: `--with health` adds the Google Health API (its read scopes, `googlehealth.*.readonly`; with `readwrite` also its write scopes and `cloud-platform`, the only scope Google lists for the health subscriber methods), and `--with portability` adds Data Portability (one of its export scopes; Google subjects Data Portability apps to a verification process). Before 1.34.0 every `readonly` login asked for four health read scopes, and every `readwrite` login for `cloud-platform`, a Data Portability scope and seven health scopes, for a contacts sign-in.

```
node <plugin>/bin/gsm.mjs login workspace-user --profile readonly --with health
```

In the chat: `auth_login` with `"with": ["health"]` (or `["portability"]`, or both). Without them, those tools and gateway methods do not load, and the login says so in `Held back:` lines. A token that already holds these scopes keeps them when you sign in again naming the account (`--account <email>`).

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| People (short answers) | `contacts_search_directory`, `contacts_search`, `profile_me` | read | Search the Workspace directory or your contacts with a ready readMask, read your own name and email |
| Contacts | `people_people_search_contacts`, `people_people_get`, `people_contact_groups_list` | read | Search contacts, read a contact, list groups |
| | `people_people_search_directory`, `people_people_list_directory_pe` | read | Search and list people in the directory |
| | `people_people_create_contact`, `people_people_update_contact` | write | Create or change a contact |
| | `people_contact_groups_create`, `people_contact_groups_update` | write | Create or change a contact group |
| | `people_people_delete_contact`, `people_contact_groups_delete` | destructive | Delete a contact or a group |
| Health data | profile, settings, data points, paired devices, roll-up and daily roll-up | read | Read health profile, settings and data points, and roll them up over time (the roll-ups are reads since 1.26.3) |
| | data point create, patch | write | Add or change health data points |
| | data point batch delete, subscription delete | destructive | Delete health data points or subscriptions |
| Data Portability | archive jobs, portability initiate | read, write | Check access, start an export |
| | archive job cancel, authorization reset | destructive | Cancel an export, reset authorization |
| Per-method (59) | | mixed | People API (24), Google Health API (27), Data Portability (6), OAuth2 userinfo (3) |
| Gateway (2 APIs) | `api_search`, `api_describe`, `api_call` | read, read, dynamic | Data Portability v1beta and Google Health v4beta |

The full list is in `docs/capabilities/gcontacts.md`.

The first three tools match the tools of Google's People MCP server (https://developers.google.com/people/api/mcp/tools_list). They set the person fields (names, email addresses, phone numbers, organizations; `fields` picks others), send the warm-up search Google asks for before a contact search, and tell the agent to let you confirm the person before a result goes into another tool. With the plugin option `toolset: google`, the server lists these three, plus `health` and the sign-in tools. A `readonly` login with that toolset asks for `contacts.readonly`, `directory.readonly` and (since 1.35.1) `userinfo.profile`; a `readwrite` login for `contacts.readonly` (since 1.25.0; before, `contacts`), `directory.readonly` and `userinfo.profile`, since no tool of the three changes a contact. Every sign-in adds `userinfo.email`, so `profile_me` always shows your email. Your name and picture need `userinfo.profile` ("See your personal info, including any personal info you've made publicly available"): before 1.35.1 no profile asked for it (the shorter `userinfo.email` or `openid` covered `profile_me`), so the name was missing; since 1.35.1 every profile of a gcontacts sign-in asks for it, with every toolset (it counts as view-only, and `readwrite` and `full` prefer it). A token from an earlier sign-in lacks it until you sign in again; `profile_me` says so.

## Example requests

- "Find Priya Shah's phone number in my contacts." Claude runs `contacts_search`, shows the match, and asks you to confirm. No prompt.
- "What is Ana's email in our company directory?" Claude runs `contacts_search_directory`. No prompt.
- "Add Tom Lee, tom@example.com, as a contact." Claude runs `people_people_create_contact`. It asks first.
- "Delete the duplicate contact entries for Sam." Claude runs the contact delete tool. It asks twice.
- "Show my recorded health data points for last week." Claude runs the health data point read tools. No prompt.
- "Start a Data Portability export of my data." Claude runs the portability initiate tool. It asks first.

## Safety

- Reads never ask. Writes ask first. Deletes and cancellations ask twice.
- Contact and health data are sensitive. Keep the readonly profile unless you need changes.
- Health writes and deletes change personal health records.
- The `confirmation` option defaults to `every-change`. Change it with `printf '%s' '{"confirmation":"destructive-only"}' | claude plugin configure gcontacts@google-services-mcps --values-stdin` (JSON on stdin), or `/plugin configure gcontacts@google-services-mcps` in Claude Code.

## Costs and limits

The fee and the People API quotas are UNVERIFIED, because no official People API quota page was found. Check the People API quota page in the Google Cloud console before any bulk sync. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/workspace-cloud-search-ai.md`, section 7.

## Caveats

- Storing new Google Contacts is a sensitive scope and needs Google's review for a public app.
- Google Fit is being retired. Its successor, the Google Health API, is in this plugin.
- Health and Data Portability quotas are UNVERIFIED.
- The gateway reaches older versions of the Health and Data Portability APIs. Check them with `api_describe`.
