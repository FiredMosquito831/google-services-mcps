# Google Meet (`gmeet`)

Install with the simplest command: `npx google-services-mcps install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Google Meet spaces, conference records, participants, recordings, transcripts and smart notes. It creates and updates meeting spaces, and reads the records of meetings that already happened. It has no gateway, and it does not join or start a call.

## When to install it

- You create a meeting space and set its settings or members.
- You list past meetings and see who joined and when.
- You fetch recordings, transcripts or smart notes after a meeting.
- Wrong choice: you need to control a live call. The tools manage spaces and read records only. Calendar invitations are in `gcalendar`.

## Install and set up

```
claude plugin install gmeet@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-client <client_secret.json>
node <plugin>/bin/gsm.mjs login workspace-user --profile readonly
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gmeet`).

1. In a Google Cloud project, enable the Google Meet REST API.
2. Set up the OAuth consent screen. Use Internal for a Workspace domain. Create an OAuth client ID of type Desktop app and download the JSON file.
3. Run `setup-client`, then `login workspace-user`. Restart the MCP server (`/mcp`) after login.

Start with `--profile readonly`. Creating or changing spaces needs a `readwrite` login and the plugin option `allow_writes`.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Spaces | `meet_spaces_get` | read | Read a meeting space |
| | `meet_spaces_create`, `meet_spaces_patch` | write | Create a space, change its settings |
| | `meet_spaces_end_active_conference` | write | End the active conference in a space |
| Space members | list, get | read | List and read space members |
| | create, patch, batch update | write | Add or change members |
| | `meet_spaces_members_delete` | destructive | Remove a member |
| Conference records | `meet_conference_records_list`, `meet_conference_records_get` | read | List and read past and current meetings |
| Participants | participant list and get, session list and get | read | Who joined, when, and for how long |
| Recordings and transcripts | recordings and transcripts list and get, transcript entries | read | Fetch recording and transcript records and text entries |
| Smart notes | list and get | read | Read the smart notes of a meeting |
| Gateway | none | | No gateway tools. All methods are per-method tools. |

The full list is in `docs/capabilities/gmeet.md`.

Google has no official MCP server for Meet (none was found on 2026-10-29). With the plugin option `toolset: google`, the server lists a small set chosen here instead: `meet_spaces_create`, `meet_spaces_get`, the conference record list and get, participants, transcripts and transcript entries, recordings, and smart notes list and get (10 tools), plus `health` and the sign-in tools. The member changes and ending a conference stay in the `all` toolset. A `readonly` login with that toolset asks for `meetings.space.readonly`; a `readwrite` login for `meetings.space.created` and, since 1.33.0, `meetings.space.readonly`.

Scopes, with every toolset: `meetings.space.created` lets the app "create, modify, and read metadata about meeting spaces created by your app", and `meetings.space.readonly` lets it "read metadata about any meeting space the user has access to" (Google's Meet scope table). Until 1.33.0 a `readwrite` or `full` login asked only for `meetings.space.created`, which covers every tool, so the records, transcripts and recordings of meetings this app did not create were out of reach. Since 1.33.0 both ask for `meetings.space.readonly` too (`scopePolicy.prefer` in `config/products.json`). A token from an earlier `readwrite` login lacks it: sign in again, naming the account (`--account`, in the chat `auth_login` with `account`), so the stored scopes are kept.

## Example requests

- "Create a Meet space for the board call and give me the link." Claude runs `meet_spaces_create`. It asks first.
- "Who attended yesterday's design review?" Claude lists conference records, then participants. No prompt.
- "Get the transcript of last week's sync." Claude runs the transcript read tools. No prompt.
- "End the call in the Board space." Claude runs `meet_spaces_end_active_conference`. It asks twice: ending a live session is destructive (since 1.26.3).
- "Remove Dana from the Board space members." Claude runs `meet_spaces_members_delete`. It asks twice.

## Safety

- Reads never ask. Creates and changes ask first. Ending a conference and removing a member ask twice.
- Ending a conference removes everyone from it.
- Recordings and transcripts hold private meeting content. Fetch them only when you need them.
- The `confirmation` option defaults to `every-change`. Change it with `printf '%s' '{"confirmation":"destructive-only"}' | claude plugin configure gmeet@google-services-mcps --values-stdin` (JSON on stdin), or `/plugin configure gmeet@google-services-mcps` in Claude Code.

## Costs and limits

Standard use is free, and Google plans overage charges later in 2026 with no amount given. Space creation allows 100 per minute per project and 10 per user per minute. Recording and transcript limits are UNVERIFIED. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/workspace-cloud-search-ai.md`, section 6.

## Caveats

- Create space calls are limited to 10 per user per minute. Reuse a space instead of creating one per meeting.
- Recording, transcript and conference size limits are not on the page (UNVERIFIED).
- Meet scope classification and any app review are UNVERIFIED.
