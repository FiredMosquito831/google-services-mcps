# Google Meet (`gmeet`)

Google Meet spaces, conference records, participants and recordings.

- Plugin: `gmeet`, MCP server: `gmeet`, login: Desktop OAuth client, then `login workspace-user`
- Install: `claude plugin install gmeet@google-services-mcps`
- Tools: 34 total. Curated 9, per-method 24, gateway 0. Read 23, write 9, destructive 2, dynamic 0.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 34, google 18, curated 9 tools, each counting the 7 runtime tools this server registers (`account_remove`, `account_set_default`, `accounts_list`, `auth_login`, `auth_setup_client`, `auth_status`, `health`). "(all)" means the product has no such toolset yet, so it lists every tool.

## Not registered by this server (2)

The tool map (`plugins/<id>/tool-map.json`) also lists these, so the consent hook knows every name, but this server never registers them, and the counts above leave them out.

- Sign-in tools of other sign-in kinds: `auth_setup_admin`, `auth_setup_service_account`.

## Toolset google (11)

Google has no official MCP server for this product. The google toolset is a lean set chosen here: No official Google MCP server for Google Meet was found (Google's Cloud and Workspace MCP lists, 2026-10-29; a negative, not confirmed by Google); a lean set chosen here.

| Tool | Google's tool | Note |
|---|---|---|
| `meet_spaces_create` | (none) | Makes a new meeting space and returns its meeting link and code. A write, so it asks first. |
| `meet_spaces_get` | (none) | A meeting space by its name (spaces/{space}) or meeting code: its link, code and settings. |
| `meet_find_conference` | (none) | Start here for a meeting that took place: a meeting code, a space or a time range to conference records, with the meeting code and link of each space and who joined. It replaces several calls (the record list, the space, the participants) and resolves the names. Read only. |
| `meet_get_transcript` | (none) | The spoken text of a conference, entry by entry with the speaker's name and time, paged. The speaker comes from the conference participants (an entry names only a participant resource); the transcript's Google Doc id is there for the gdrive plugin. Read only. |
| `meet_conference_records_list` | (none) | Past and current conferences (one per meeting held in a space), newest first; filter by space or time. Start here for a meeting that took place. |
| `meet_conference_records_get` | (none) | One conference: its space, start and end time. |
| `meet_records_participants_list` | (none) | Who joined a conference, with join and leave times. |
| `meet_records_transcripts_list` | (none) | The transcripts of a conference and their Google Docs. |
| `meet_records_transcripts_entries_list` | (none) | The spoken text of a transcript, entry by entry with the speaker and time. |
| `meet_conference_records_recordings_list` | (none) | The recordings of a conference and their Drive files. |
| `meet_records_smart_notes_list` | (none) | The notes Gemini took in a conference (smart notes) and their Google Docs. |

## Curated tools (9)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `account_remove` | write | Remove a signed-in account | (none) |
| `account_set_default` | write | Set the default account | (none) |
| `accounts_list` | read | Signed-in accounts | (none) |
| `auth_login` | write | Sign in to Google | (none) |
| `auth_setup_client` | write | Save the Google OAuth client | (none) |
| `auth_status` | read | Sign-in status | (none) |
| `health` | read | Server health | (none) |
| `meet_find_conference` | read | Find a Meet conference | meetings.space.created, meetings.space.readonly |
| `meet_get_transcript` | read | Read a Meet transcript | meetings.space.created, meetings.space.readonly |

## Per-method tools (24)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `meet_conference_records_get` | read | meet.conferenceRecords.get | meetings.space.created, meetings.space.readonly |
| `meet_conference_records_list` | read | meet.conferenceRecords.list | meetings.space.created, meetings.space.readonly |
| `meet_conference_records_recordings_get` | read | meet.conferenceRecords.recordings.get | meetings.space.created, meetings.space.readonly |
| `meet_conference_records_recordings_list` | read | meet.conferenceRecords.recordings.list | meetings.space.created, meetings.space.readonly |
| `meet_conference_records_smart_notes_get` | read | meet.conferenceRecords.smartNotes.get | meetings.space.created, meetings.space.readonly |
| `meet_conference_records_transcripts_get` | read | meet.conferenceRecords.transcripts.get | meetings.space.created, meetings.space.readonly |
| `meet_records_participants_get` | read | meet.conferenceRecords.participants.get | meetings.space.created, meetings.space.readonly |
| `meet_records_participants_list` | read | meet.conferenceRecords.participants.list | meetings.space.created, meetings.space.readonly |
| `meet_records_participants_sessions_get` | read | meet.conferenceRecords.participants.participantSessions.get | meetings.space.created, meetings.space.readonly |
| `meet_records_participants_sessions_list` | read | meet.conferenceRecords.participants.participantSessions.list | meetings.space.created, meetings.space.readonly |
| `meet_records_smart_notes_list` | read | meet.conferenceRecords.smartNotes.list | meetings.space.created, meetings.space.readonly |
| `meet_records_transcripts_entries_get` | read | meet.conferenceRecords.transcripts.entries.get | meetings.space.created, meetings.space.readonly |
| `meet_records_transcripts_entries_list` | read | meet.conferenceRecords.transcripts.entries.list | meetings.space.created, meetings.space.readonly |
| `meet_records_transcripts_list` | read | meet.conferenceRecords.transcripts.list | meetings.space.created, meetings.space.readonly |
| `meet_spaces_create` | write | meet.spaces.create | meetings.space.created |
| `meet_spaces_end_active_conference` | destructive | meet.spaces.endActiveConference | meetings.space.created |
| `meet_spaces_get` | read | meet.spaces.get | meetings.space.created, meetings.space.readonly |
| `meet_spaces_members_batch_update` | write | meet.spaces.members.batchUpdate | meetings.space.created |
| `meet_spaces_members_create` | write | meet.spaces.members.create | meetings.space.created |
| `meet_spaces_members_delete` | destructive | meet.spaces.members.delete | meetings.space.created |
| `meet_spaces_members_get` | read | meet.spaces.members.get | meetings.space.created, meetings.space.readonly |
| `meet_spaces_members_list` | read | meet.spaces.members.list | meetings.space.created, meetings.space.readonly |
| `meet_spaces_members_patch` | write | meet.spaces.members.patch | meetings.space.created |
| `meet_spaces_patch` | write | meet.spaces.patch | meetings.space.created, meetings.space.settings |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gmeet: API methods | (none) |

## Generated APIs

Each API links to Google's documentation for it, as Google's Discovery directory names it (`documentationLink`, kept in `data/catalog.json`). The link is the API's documentation home, not a page per method: the directory gives no link per method, and Google's REST reference pages are laid out differently from product to product.

- Google Meet API (`meet/v2`), 24 methods in the catalog. Documentation: <https://developers.google.com/workspace/meet/api>

## Gateway APIs (reached through api_search, api_describe, api_call)

None.

