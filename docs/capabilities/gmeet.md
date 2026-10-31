# Google Meet (`gmeet`)

Google Meet spaces, conference records, participants and recordings.

- Plugin: `gmeet`, MCP server: `gmeet`, login: Desktop OAuth client, then `login workspace-user`
- Install: `claude plugin install gmeet@google-services-mcps`
- Tools: 34 total. Curated 9, per-method 24, gateway 0. Read 21, write 11, destructive 2, dynamic 0.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 34, google 19, curated 34 (all) tools, each with the 9 runtime tools of the map counted. "(all)" means the product has no such toolset yet, so it lists every tool.

## Toolset google (10)

Google has no official MCP server for this product. The google toolset is a lean set chosen here: No official Google MCP server for Google Meet was found (Google's Cloud and Workspace MCP lists, 2026-10-29; a negative, not confirmed by Google); a lean set chosen here..

| Tool | Google's tool | Note |
|---|---|---|
| `meet_spaces_create` | (none) | Makes a new meeting space and returns its meeting link and code. A write, so it asks first. |
| `meet_spaces_get` | (none) | A meeting space by its name (spaces/{space}) or meeting code: its link, code and settings. |
| `meet_conference_records_list` | (none) | Past and current conferences (one per meeting held in a space), newest first; filter by space or time. Start here for a meeting that took place. |
| `meet_conference_records_get` | (none) | One conference: its space, start and end time. |
| `meet_conference_recor_participants_list` | (none) | Who joined a conference, with join and leave times. |
| `meet_conference_record_transcripts_list` | (none) | The transcripts of a conference and their Google Docs. |
| `meet_conference_transcript_entries_list` | (none) | The spoken text of a transcript, entry by entry with the speaker and time. |
| `meet_conference_records_recordings_list` | (none) | The recordings of a conference and their Drive files. |
| `meet_conference_record_smart_notes_list` | (none) | The notes Gemini took in a conference (smart notes) and their Google Docs. |
| `meet_conference_records_smart_notes_get` | (none) | One smart notes entry and the Google Doc that holds it. |

## Curated tools (9)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `account_remove` | write | Remove a signed-in account | (none) |
| `account_set_default` | write | Set the default account | (none) |
| `accounts_list` | read | Signed-in accounts | (none) |
| `auth_login` | write | Sign in to Google | (none) |
| `auth_setup_admin` | write | Set up the workspace admin account | (none) |
| `auth_setup_client` | write | Save the Google OAuth client | (none) |
| `auth_setup_service_account` | write | Set up the service account key | (none) |
| `auth_status` | read | Sign-in status | (none) |
| `health` | read | Server health | (none) |

## Per-method tools (24)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `meet_conferenc_participa_participa_list` | read | meet.conferenceRecords.participants.participantSessions.list | meetings.space.created, meetings.space.readonly |
| `meet_conferenc_participa_participan_get` | read | meet.conferenceRecords.participants.participantSessions.get | meetings.space.created, meetings.space.readonly |
| `meet_conference_recor_participants_list` | read | meet.conferenceRecords.participants.list | meetings.space.created, meetings.space.readonly |
| `meet_conference_record_participants_get` | read | meet.conferenceRecords.participants.get | meetings.space.created, meetings.space.readonly |
| `meet_conference_record_smart_notes_list` | read | meet.conferenceRecords.smartNotes.list | meetings.space.created, meetings.space.readonly |
| `meet_conference_record_transcripts_list` | read | meet.conferenceRecords.transcripts.list | meetings.space.created, meetings.space.readonly |
| `meet_conference_records_get` | read | meet.conferenceRecords.get | meetings.space.created, meetings.space.readonly |
| `meet_conference_records_list` | read | meet.conferenceRecords.list | meetings.space.created, meetings.space.readonly |
| `meet_conference_records_recordings_get` | read | meet.conferenceRecords.recordings.get | meetings.space.created, meetings.space.readonly |
| `meet_conference_records_recordings_list` | read | meet.conferenceRecords.recordings.list | meetings.space.created, meetings.space.readonly |
| `meet_conference_records_smart_notes_get` | read | meet.conferenceRecords.smartNotes.get | meetings.space.created, meetings.space.readonly |
| `meet_conference_records_transcripts_get` | read | meet.conferenceRecords.transcripts.get | meetings.space.created, meetings.space.readonly |
| `meet_conference_transcript_entries_list` | read | meet.conferenceRecords.transcripts.entries.list | meetings.space.created, meetings.space.readonly |
| `meet_conference_transcripts_entries_get` | read | meet.conferenceRecords.transcripts.entries.get | meetings.space.created, meetings.space.readonly |
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

