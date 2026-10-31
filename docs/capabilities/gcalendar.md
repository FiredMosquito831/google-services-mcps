# Google Calendar (`gcalendar`)

Google Calendar calendars, events and calendar settings.

- Plugin: `gcalendar`, MCP server: `gcalendar`, login: Desktop OAuth client, then `login workspace-user`
- Install: `claude plugin install gcalendar@google-services-mcps`
- Tools: 55 total. Curated 16, per-method 38, gateway 0. Read 21, write 23, destructive 11, dynamic 0.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 55, google 15, curated 16 tools, each counting the 7 runtime tools this server registers (`account_remove`, `account_set_default`, `accounts_list`, `auth_login`, `auth_setup_client`, `auth_status`, `health`). "(all)" means the product has no such toolset yet, so it lists every tool.

## Not registered by this server (2)

The tool map (`plugins/<id>/tool-map.json`) also lists these, so the consent hook knows every name, but this server never registers them, and the counts above leave them out.

- Sign-in tools of other sign-in kinds: `auth_setup_admin`, `auth_setup_service_account`.

## Toolset google (8)

The tools that match Google's official MCP server for this product (https://developers.google.com/workspace/calendar/api/v3/reference/mcp/tools_list).

| Tool | Google's tool | Note |
|---|---|---|
| `calendar_list_calendars` | `list_calendars` |  |
| `calendar_list_events` | `list_events`, `search_events` | Google's search_events is a semantic search of the primary calendar with no public API; the keyword search of calendar_list_events (q) stands in for it. Without time_min the list starts now, as before 1.8.0; include_past gives Google's no-lower-bound list. |
| `calendar_get_event` | `get_event` |  |
| `calendar_suggest_time` | `suggest_time` | Computed here from free/busy (freebusy.query) and the window, duration and working hours given; Google's preferences object is not public, so its exact ranking is not copied. |
| `calendar_create_event` | `create_event` |  |
| `calendar_update_event` | `update_event` |  |
| `calendar_delete_event` | `delete_event` | Destructive, so it asks first, as in Google's server (destructiveHint). |
| `calendar_respond` | `respond_to_event` |  |

## Curated tools (16)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `account_remove` | write | Remove a signed-in account | (none) |
| `account_set_default` | write | Set the default account | (none) |
| `accounts_list` | read | Signed-in accounts | (none) |
| `auth_login` | write | Sign in to Google | (none) |
| `auth_setup_client` | write | Save the Google OAuth client | (none) |
| `auth_status` | read | Sign-in status | (none) |
| `calendar_create_event` | write | Create calendar event | calendar, calendar.events |
| `calendar_delete_event` | destructive | Delete calendar event | calendar, calendar.events |
| `calendar_freebusy` | read | Check free/busy | calendar, calendar.events.freebusy |
| `calendar_get_event` | read | Get calendar event | calendar, calendar.events |
| `calendar_list_calendars` | read | List calendars | calendar, calendar.calendarlist |
| `calendar_list_events` | read | List calendar events | calendar, calendar.events |
| `calendar_respond` | write | Respond to an invitation | calendar, calendar.events |
| `calendar_suggest_time` | read | Suggest meeting times | calendar, calendar.events.freebusy |
| `calendar_update_event` | write | Update calendar event | calendar, calendar.events |
| `health` | read | Server health | (none) |

## Per-method tools (38)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `calendar_acl_delete` | destructive | calendar.acl.delete | calendar, calendar.acls |
| `calendar_acl_get` | read | calendar.acl.get | calendar, calendar.acls |
| `calendar_acl_insert` | destructive | calendar.acl.insert | calendar, calendar.acls |
| `calendar_acl_list` | read | calendar.acl.list | calendar, calendar.acls |
| `calendar_acl_patch` | destructive | calendar.acl.patch | calendar, calendar.acls |
| `calendar_acl_update` | destructive | calendar.acl.update | calendar, calendar.acls |
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
| `calendar_calendars_transfer_own` | destructive | calendar.calendars.transferOwnership | calendar, calendar.calendars |
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
| `calendar_freebusy_query` | read | calendar.freebusy.query | calendar, calendar.events.freebusy |
| `calendar_settings_get` | read | calendar.settings.get | calendar, calendar.readonly |
| `calendar_settings_list` | read | calendar.settings.list | calendar, calendar.readonly |
| `calendar_settings_watch` | write | calendar.settings.watch | calendar, calendar.readonly |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gcalendar: API methods | (none) |

## Generated APIs

Each API links to Google's documentation for it, as Google's Discovery directory names it (`documentationLink`, kept in `data/catalog.json`). The link is the API's documentation home, not a page per method: the directory gives no link per method, and Google's REST reference pages are laid out differently from product to product.

- Google Calendar API (`calendar/v3`), 38 methods in the catalog. Documentation: <http://code.google.com/apis/calendar/v3/>

## Gateway APIs (reached through api_search, api_describe, api_call)

None.

