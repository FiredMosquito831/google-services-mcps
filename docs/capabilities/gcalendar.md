# Google Calendar (`gcalendar`)

Google Calendar calendars, events and calendar settings.

- Plugin: `gcalendar`, MCP server: `gcalendar`, login: Desktop OAuth client, then `login workspace-user`
- Install: `claude plugin install gcalendar@google-services-mcps`
- Tools: 51 total. Curated 12, per-method 38, gateway 0. Read 18, write 26, destructive 7, dynamic 0.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

## Curated tools (12)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `auth_login` | write | Sign in to Google | (none) |
| `auth_setup_admin` | write | Set up the workspace admin account | (none) |
| `auth_setup_client` | write | Save the Google OAuth client | (none) |
| `auth_status` | read | Sign-in status | (none) |
| `calendar_create_event` | write | Create calendar event | calendar, calendar.events |
| `calendar_delete_event` | destructive | Delete calendar event | calendar, calendar.events |
| `calendar_freebusy` | read | Check free/busy | calendar, calendar.events.freebusy |
| `calendar_get_event` | read | Get calendar event | calendar, calendar.events |
| `calendar_list_calendars` | read | List calendars | calendar, calendar.calendarlist |
| `calendar_list_events` | read | List calendar events | calendar, calendar.events |
| `calendar_update_event` | write | Update calendar event | calendar, calendar.events |
| `health` | read | Server health | (none) |

## Per-method tools (38)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `calendar_acl_delete` | destructive | calendar.acl.delete | calendar, calendar.acls |
| `calendar_acl_get` | read | calendar.acl.get | calendar, calendar.acls |
| `calendar_acl_insert` | write | calendar.acl.insert | calendar, calendar.acls |
| `calendar_acl_list` | read | calendar.acl.list | calendar, calendar.acls |
| `calendar_acl_patch` | write | calendar.acl.patch | calendar, calendar.acls |
| `calendar_acl_update` | write | calendar.acl.update | calendar, calendar.acls |
| `calendar_acl_watch` | write | calendar.acl.watch | calendar, calendar.acls |
| `calendar_calendar_list_delete` | destructive | calendar.calendarList.delete | calendar, calendar.app.created |
| `calendar_calendar_list_get` | read | calendar.calendarList.get | calendar, calendar.app.created |
| `calendar_calendar_list_insert` | write | calendar.calendarList.insert | calendar, calendar.calendarlist |
| `calendar_calendar_list_list` | read | calendar.calendarList.list | calendar, calendar.calendarlist |
| `calendar_calendar_list_patch` | write | calendar.calendarList.patch | calendar, calendar.app.created |
| `calendar_calendar_list_update` | write | calendar.calendarList.update | calendar, calendar.app.created |
| `calendar_calendar_list_watch` | write | calendar.calendarList.watch | calendar, calendar.calendarlist |
| `calendar_calendars_clear` | destructive | calendar.calendars.clear | calendar, calendar.calendars |
| `calendar_calendars_delete` | destructive | calendar.calendars.delete | calendar, calendar.app.created |
| `calendar_calendars_get` | read | calendar.calendars.get | calendar, calendar.app.created |
| `calendar_calendars_insert` | write | calendar.calendars.insert | calendar, calendar.app.created |
| `calendar_calendars_patch` | write | calendar.calendars.patch | calendar, calendar.app.created |
| `calendar_calendars_transfer_own` | write | calendar.calendars.transferOwnership | calendar, calendar.calendars |
| `calendar_calendars_update` | write | calendar.calendars.update | calendar, calendar.app.created |
| `calendar_channels_stop` | destructive | calendar.channels.stop | calendar, calendar.acls |
| `calendar_colors_get` | read | calendar.colors.get | calendar, calendar.app.created |
| `calendar_events_delete` | destructive | calendar.events.delete | calendar, calendar.app.created |
| `calendar_events_get` | read | calendar.events.get | calendar, calendar.app.created |
| `calendar_events_import` | write | calendar.events.import | calendar, calendar.app.created |
| `calendar_events_insert` | write | calendar.events.insert | calendar, calendar.app.created |
| `calendar_events_instances` | read | calendar.events.instances | calendar, calendar.app.created |
| `calendar_events_list` | read | calendar.events.list | calendar, calendar.app.created |
| `calendar_events_move` | write | calendar.events.move | calendar, calendar.events |
| `calendar_events_patch` | write | calendar.events.patch | calendar, calendar.app.created |
| `calendar_events_quick_add` | write | calendar.events.quickAdd | calendar, calendar.app.created |
| `calendar_events_update` | write | calendar.events.update | calendar, calendar.app.created |
| `calendar_events_watch` | write | calendar.events.watch | calendar, calendar.app.created |
| `calendar_freebusy_query` | write | calendar.freebusy.query | calendar, calendar.events.freebusy |
| `calendar_settings_get` | read | calendar.settings.get | calendar, calendar.readonly |
| `calendar_settings_list` | read | calendar.settings.list | calendar, calendar.readonly |
| `calendar_settings_watch` | write | calendar.settings.watch | calendar, calendar.readonly |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gcalendar: API methods | (none) |

## Generated APIs

- Google Calendar API (`calendar/v3`), 38 methods in the catalog

## Gateway APIs (reached through api_search, api_describe, api_call)

None.

