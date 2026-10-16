# Google Meet (`gmeet`)

Google Meet spaces, conference records, participants and recordings.

- Plugin: `gmeet`, MCP server: `gmeet`, login: Desktop OAuth client, then `login workspace-user`
- Install: `claude plugin install gmeet@google-services-mcps`
- Tools: 27 total. Curated 2, per-method 24, gateway 0. Read 20, write 6, destructive 1, dynamic 0.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

## Curated tools (2)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `auth_status` | read | Login status | (none) |
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
| `meet_spaces_end_active_conference` | write | meet.spaces.endActiveConference | meetings.space.created |
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

- Google Meet API (`meet/v2`), 24 methods in the catalog

## Gateway APIs (reached through api_search, api_describe, api_call)

None.

