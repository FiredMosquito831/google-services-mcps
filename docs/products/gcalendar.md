# Google Calendar (`gcalendar`)

Install with the simplest command: `node gsm.mjs install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Google Calendar calendars, events, free and busy checks, sharing rules and calendar settings. It lists and reads events, creates and updates them, and deletes them. It has no gateway. Every method is a per-method tool.

## When to install it

- You list upcoming events or check your agenda.
- You find a free slot that works for several people.
- You create, move or update events from a conversation.
- You manage calendar sharing or subscribe to calendar changes.
- Wrong choice: you need Meet recordings or transcripts. Use `gmeet`.

## Install and set up

```
claude plugin install gcalendar@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-client <client_secret.json>
node <plugin>/bin/gsm.mjs login workspace-user --profile readonly
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gcalendar`).

1. In a Google Cloud project, enable the Google Calendar API.
2. Set up the OAuth consent screen. Use Internal for a Workspace domain. An External app left in Testing loses its refresh token after 7 days.
3. Create an OAuth client ID of type Desktop app and download the JSON file.
4. Run `setup-client`, then `login workspace-user`. Restart the MCP server (`/mcp`) after login.

Start with `--profile readonly`. Event changes need a `readwrite` login and the plugin option `allow_writes`.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Read | `calendar_list_calendars`, `calendar_list_events`, `calendar_get_event`, `calendar_freebusy` | read | List calendars and events, read one event, check free and busy times |
| Write | `calendar_create_event`, `calendar_update_event` | write | Create or change an event |
| Delete | `calendar_delete_event` | destructive | Delete an event |
| Per-method (38) | | mixed | Event moves, imports, quick add and instances; calendar create, patch and clear; sharing (ACL); calendar list; settings; colors; watch channels |
| Gateway | none | | No gateway tools. All methods are per-method tools. |

The full list is in `docs/capabilities/gcalendar.md`.

## Example requests

- "What is on my calendar tomorrow?" Claude runs `calendar_list_events`. No prompt.
- "Find a 30-minute slot next week when Ana and I are both free." Claude runs `calendar_freebusy` for both calendars. No prompt.
- "Add a 3pm call with the design team on Thursday." Claude runs `calendar_create_event`. It asks first.
- "Move the 10am standup to 10:30." Claude runs `calendar_update_event`. It asks first.
- "Delete the cancelled Friday workshop." Claude runs `calendar_delete_event`. It asks twice.

## Safety

- Reads never ask. Creates and updates ask first. Deletes ask twice.
- Event writes can notify attendees. The preview shows who is invited, so check it.
- Sharing changes (ACL tools) decide who can see or edit a calendar. Some of them are destructive.
- The `confirmation` option defaults to `every-change`. Change it with `printf '%s' '{"confirmation":"destructive-only"}' | claude plugin configure gcalendar@google-services-mcps --values-stdin` (JSON on stdin), or `/plugin configure gcalendar@google-services-mcps` in Claude Code.

## Costs and limits

Calendar is included with Google Workspace. It allows 600 requests per minute per user and 10,000 per minute per project. Google plans overage charges later in 2026 with no amount given. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/workspace-cloud-search-ai.md`, section 4.

## Caveats

- Use push notifications instead of polling. Set `quotaUser` for server-side calls made for end users. The limits file gives both as advice.
- Event, attendee and calendar count limits are UNVERIFIED.
- Calendar scope classification is UNVERIFIED for each scope. Some reading scopes are sensitive and need Google review for public apps.
- Calendar settings and watch channels cover what the list in `docs/capabilities/gcalendar.md` shows. Check the exact method there.
