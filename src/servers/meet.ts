/**
 * Curated Google Meet tools (meet_*) of the gmeet server, in place of a run of generated calls. The generated tools
 * cover all 24 Meet REST v2 methods; finding a conference and reading what was said in it took several of them and
 * returned resource names instead of names. These two do the job in one call each (adversarial review of gmeet, F3):
 *
 *   meet_find_conference  a meeting code, a space or a time range to conference records, with the meeting code and link
 *                         of each space and the people who joined.
 *   meet_get_transcript   the transcript entries of a conference with the speakers' names, paged. The API names a speaker
 *                         only by a participant resource, so the names come from the conference's participants.
 *
 * Both are reads. Nothing here changes a space, a member or a conference.
 *
 * Auth: OAuth user token from `gsm login workspace-user`.
 */
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { getAuthClient, googleScopes } from '../core/auth.js';
import { defineTool, type ToolDef } from '../core/tools.js';
import { formatInZone, ianaZone, type Zone } from './calendar-time.js';
import { makeCloudCall, type CloudCall } from './cloud-http.js';

const API = 'https://meet.googleapis.com/v2';

/** The scopes of the Meet reads: a space the app created, or any space the user can see. Either one covers a tool. */
const READ = googleScopes('meetings.space.created', 'meetings.space.readonly');

/** Conference records this tool asks for at most: Discovery's pageSize maximum. */
export const MEET_RECORDS_MAX = 100;
/** Participants read per conference record (Discovery's own default) and the most shown for one record. */
export const MEET_PARTICIPANTS_MAX = 25;
/** Characters of one transcript entry, default and maximum. */
export const TRANSCRIPT_ENTRY_CHARS = 800;
export const TRANSCRIPT_ENTRY_CHARS_MAX = 4000;

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i;

interface ConferenceRecord {
  name?: string;
  space?: string;
  startTime?: string;
  endTime?: string;
  expireTime?: string;
}

interface Participant {
  name?: string;
  signedinUser?: { displayName?: string; user?: string };
  anonymousUser?: { displayName?: string };
  phoneUser?: { displayName?: string };
  earliestStartTime?: string;
  latestEndTime?: string;
}

interface Transcript {
  name?: string;
  state?: string;
  startTime?: string;
  endTime?: string;
  docsDestination?: { document?: string; exportUri?: string };
}

interface TranscriptEntry {
  name?: string;
  participant?: string;
  startTime?: string;
  endTime?: string;
  text?: string;
  languageCode?: string;
}

/**
 * The `filter` of conferenceRecords.list for a space and a time range (Discovery's own syntax: the fields
 * `space.meeting_code`, `space.name`, `start_time` and `end_time`, joined with AND).
 */
export function conferenceFilter(space: string | undefined, startFrom: string | undefined, startTo: string | undefined): string | undefined {
  const parts: string[] = [];
  const value = space?.trim();
  if (value) {
    // A meeting code always holds a dash (abc-mnop-xyz); a space id never does (jQCFfuBOdN5z).
    if (/^spaces\//i.test(value)) parts.push(`space.name = "${value.replace(/^spaces\//i, 'spaces/')}"`);
    else if (value.includes('-')) parts.push(`space.meeting_code = "${value.toLowerCase()}"`);
    else parts.push(`space.name = "spaces/${value}"`);
  }
  if (startFrom) parts.push(`start_time >= "${startFrom}"`);
  if (startTo) parts.push(`start_time <= "${startTo}"`);
  return parts.length ? parts.join(' AND ') : undefined;
}

/** The space name of a meeting code or a space name, for spaces.get: both are `spaces/{space}` or `spaces/{meetingCode}`. */
export function spaceNameOf(value: string): string {
  const v = value.trim();
  if (/^spaces\//i.test(v)) return v;
  // spaces.get takes a meeting code in place of the space in the name (Discovery's `name` text).
  return `spaces/${v}`;
}

/** The display name of a participant, from whichever way they joined; undefined when Google gives none. */
export function participantName(p: Participant): string | undefined {
  return p.signedinUser?.displayName ?? p.anonymousUser?.displayName ?? p.phoneUser?.displayName;
}

/** One transcript entry, its text cut at maxChars (JSON escapes counted), with the speaker's name when it is known. */
export function entryOf(e: TranscriptEntry, names: Map<string, string>, zone: Zone | undefined, maxChars: number) {
  const text = e.text ?? '';
  const cut = text.length > maxChars;
  return {
    start: e.startTime && zone ? formatInZone(Date.parse(e.startTime), zone) : e.startTime,
    ...(e.endTime && zone ? { end: formatInZone(Date.parse(e.endTime), zone) } : {}),
    speaker: (e.participant ? names.get(e.participant) : undefined) ?? 'unknown speaker',
    ...(e.participant && !names.has(e.participant) ? { participant: e.participant } : {}),
    ...(e.languageCode ? { language: e.languageCode } : {}),
    text: cut ? `${text.slice(0, maxChars)}...` : text,
    ...(cut ? { text_truncated: true, text_chars: text.length } : {}),
  };
}

export async function buildTools(cfg: RuntimeConfig): Promise<ToolDef[]> {
  // The account is chosen per call (see account-context.ts), so the client is not cached here.
  const call: CloudCall = makeCloudCall(() => getAuthClient('workspace-user', cfg));

  /** Every page of a list, up to `max` items (Meet's lists carry no total). */
  const pages = async <T>(url: string, key: string, query: Record<string, string | number | undefined>, max: number): Promise<{ items: T[]; more: boolean }> => {
    const items: T[] = [];
    let token: string | undefined;
    do {
      const res = await call<Record<string, unknown>>({ url, query: { ...query, pageToken: token } });
      items.push(...((res.data[key] as T[] | undefined) ?? []));
      token = (res.data.nextPageToken as string | undefined) || undefined;
    } while (token && items.length < max);
    return { items: items.slice(0, max), more: Boolean(token) || items.length > max };
  };

  return [
    defineTool({
      name: 'meet_find_conference',
      title: 'Find a Meet conference',
      description:
        'Find Google Meet conferences (one record per meeting held in a space), newest first: when it started and ended, its space, the meeting code and link of that space, when the record expires, and who joined. Narrow by a space or meeting code and by when the meeting started. Use the record name (conferenceRecords/...) with meet_get_transcript, meet_records_participants_list, the recordings and smart notes tools, or the gdrive plugin for a recording file. Google deletes a conference record, and its transcripts, recordings and notes, 30 days after the meeting ends (expire_time). Read only.',
      kind: 'read',
      scopes: READ,
      inputSchema: {
        space: z
          .string()
          .optional()
          .describe('A meeting code (abc-mnop-xyz), a space id (jQCFfuBOdN5z) or a space name (spaces/{space}). Default: every space.'),
        start_from: z.string().regex(RFC3339, 'start_from must be RFC 3339 with an offset').optional().describe('Only meetings that started at or after this time (RFC 3339, UTC such as 2026-10-01T00:00:00Z).'),
        start_to: z.string().regex(RFC3339, 'start_to must be RFC 3339 with an offset').optional().describe('Only meetings that started at or before this time.'),
        include_participants: z.boolean().optional().describe(`Add who joined each meeting (one request per meeting, at most ${MEET_PARTICIPANTS_MAX} people per record). Default true.`),
        page_size: z.number().int().min(1).max(MEET_RECORDS_MAX).optional().describe(`Meetings per page, 1 to ${MEET_RECORDS_MAX}. Default 10.`),
        page_token: z.string().optional().describe('next_page_token from the previous call, with the same other arguments.'),
        time_zone: z.string().optional().describe('IANA time zone for the times in the answer, for example Europe/Berlin. Default: UTC (as Google returns them).'),
      },
      async handler({ space, start_from, start_to, include_participants, page_size, page_token, time_zone }) {
        const zone = time_zone === undefined ? undefined : ianaZone(time_zone);
        const filter = conferenceFilter(space, start_from, start_to);
        const res = await call<{ conferenceRecords?: ConferenceRecord[]; nextPageToken?: string }>({
          url: `${API}/conferenceRecords`,
          query: { filter, pageSize: page_size ?? 10, pageToken: page_token },
        });
        const records = res.data.conferenceRecords ?? [];
        const shown = include_participants !== false;
        // One spaces.get per distinct space: the meeting code and link are on the space, not the record.
        const spaces = new Map<string, { meeting_code?: string; meeting_uri?: string }>();
        for (const record of records) {
          const name = record.space;
          if (!name || spaces.has(name)) continue;
          try {
            const s = (await call<{ meetingCode?: string; meetingUri?: string }>({ url: `${API}/${name}` })).data;
            spaces.set(name, { meeting_code: s.meetingCode, meeting_uri: s.meetingUri });
          } catch {
            // A space the sign-in cannot read, or an ended one: the record is still shown, without its code.
            spaces.set(name, {});
          }
        }
        const conferences = [];
        for (const record of records) {
          let participants: Array<{ name?: string; joined?: string; left?: string }> | undefined;
          let more = false;
          if (shown && record.name) {
            const list = await pages<Participant>(`${API}/${record.name}/participants`, 'participants', { pageSize: MEET_PARTICIPANTS_MAX }, MEET_PARTICIPANTS_MAX);
            participants = list.items.map((p) => ({
              name: participantName(p) ?? 'unknown',
              joined: p.earliestStartTime && zone ? formatInZone(Date.parse(p.earliestStartTime), zone) : p.earliestStartTime,
              ...(p.latestEndTime ? { left: zone ? formatInZone(Date.parse(p.latestEndTime), zone) : p.latestEndTime } : {}),
            }));
            more = list.more;
          }
          const at = (v: string | undefined) => (v && zone ? formatInZone(Date.parse(v), zone) : v);
          conferences.push({
            conference: record.name,
            space: record.space,
            ...(record.space && spaces.get(record.space) ? spaces.get(record.space) : {}),
            start: at(record.startTime),
            ...(record.endTime ? { end: at(record.endTime) } : {}),
            ongoing: record.endTime === undefined,
            expires: at(record.expireTime),
            ...(participants ? { participants } : {}),
            ...(more ? { participants_note: `Only the first ${MEET_PARTICIPANTS_MAX} participants are shown; meet_records_participants_list pages through the rest.` } : {}),
          });
        }
        return { conferences, next_page_token: res.data.nextPageToken || undefined };
      },
    }),
    defineTool({
      name: 'meet_get_transcript',
      title: 'Read a Meet transcript',
      description:
        'The spoken text of a Google Meet conference, entry by entry: who spoke, when, and what was said. The speaker is resolved from the conference participants (the API names only a participant resource; a person who joined anonymously or by phone shows the name Google gives). The transcript is also a Google Doc: each transcript carries doc.document_id for the gdrive plugin and doc.export_uri. Give a conference record (from meet_find_conference) or a space or meeting code, which reads the newest conference of that space. Entries go 30 days after the meeting. Paged: page_size entries of at most max_chars each, so keep their product under the result limit (20 x 800 by default). Read only.',
      kind: 'read',
      scopes: READ,
      inputSchema: {
        conference: z.string().optional().describe('A conference record (conferenceRecords/{id}, from meet_find_conference), or just its id.'),
        space: z.string().optional().describe('A meeting code, a space id or spaces/{space}, instead of conference: reads the newest conference of that space.'),
        transcript: z.string().optional().describe('A transcript resource (conferenceRecords/{id}/transcripts/{id}) when a conference has more than one. Default: the first.'),
        page_size: z.number().int().min(1).max(100).optional().describe('Entries per call, 1 to 100. Default 20.'),
        page_token: z.string().optional().describe('next_page_token from the previous call, with the same other arguments.'),
        max_chars: z
          .number()
          .int()
          .min(100)
          .max(TRANSCRIPT_ENTRY_CHARS_MAX)
          .optional()
          .describe(`Characters of one entry's text, 100 to ${TRANSCRIPT_ENTRY_CHARS_MAX}. Default ${TRANSCRIPT_ENTRY_CHARS}.`),
        time_zone: z.string().optional().describe('IANA time zone for the times in the answer, for example Europe/Berlin. Default: UTC (as Google returns them).'),
      },
      async handler({ conference, space, transcript, page_size, page_token, max_chars, time_zone }) {
        const zone = time_zone === undefined ? undefined : ianaZone(time_zone);
        if (!conference && !space) throw new Error('Give conference (a conference record) or space (a meeting code or a space), so the transcript can be found.');
        let record = conference?.trim();
        if (record && !/^conferenceRecords\//i.test(record)) record = `conferenceRecords/${record}`;
        if (!record && space) {
          const name = spaceNameOf(space);
          const list = await call<{ conferenceRecords?: ConferenceRecord[] }>({
            url: `${API}/conferenceRecords`,
            query: { filter: `space.name = "${name}"`, pageSize: 10 },
          });
          const newest = (list.data.conferenceRecords ?? [])[0];
          if (!newest?.name) throw new Error(`No conference record for ${name}: Google keeps a record 30 days after a meeting ends.`);
          record = newest.name;
        }
        const transcripts = (await call<{ transcripts?: Transcript[]; nextPageToken?: string }>({ url: `${API}/${record}/transcripts`, query: { pageSize: 100 } })).data.transcripts ?? [];
        if (transcripts.length === 0) {
          return {
            conference: record,
            transcripts: [],
            note: 'This conference has no transcript. Recording and transcription must be turned on in the meeting, and Google deletes them 30 days after it ends.',
          };
        }
        const wanted = transcript ? transcripts.find((t) => t.name === transcript || t.name?.endsWith(`/${transcript}`)) : transcripts[0];
        if (!wanted?.name) throw new Error(`No transcript ${transcript} in ${record}.`);
        // The participant names: pages of up to 250, so a conference with more than 250 leaves some speakers by id.
        const names = new Map<string, string>();
        const people = await pages<Participant>(`${API}/${record}/participants`, 'participants', { pageSize: 250 }, 250);
        for (const p of people.items) if (p.name) names.set(p.name, participantName(p) ?? 'unknown');
        const res = await call<{ transcriptEntries?: TranscriptEntry[]; nextPageToken?: string }>({
          url: `${API}/${wanted.name}/entries`,
          query: { pageSize: page_size ?? 20, pageToken: page_token },
        });
        const cap = max_chars ?? TRANSCRIPT_ENTRY_CHARS;
        const entries = (res.data.transcriptEntries ?? []).map((e) => entryOf(e, names, zone, cap));
        return {
          conference: record,
          transcript: wanted.name,
          transcripts: transcripts.map((t) => ({
            name: t.name,
            state: t.state,
            start: t.startTime && zone ? formatInZone(Date.parse(t.startTime), zone) : t.startTime,
            ...(t.docsDestination?.document ? { doc: { document_id: t.docsDestination.document, export_uri: t.docsDestination.exportUri } } : {}),
          })),
          ...(transcripts.length > 1 ? { transcripts_note: `${transcripts.length} transcripts; this is ${wanted.name}. Give transcript to read another.` } : {}),
          entries,
          ...(people.more ? { participants_note: 'Some speakers have a participant id only: the conference has more than 250 participants.' } : {}),
          next_page_token: res.data.nextPageToken || undefined,
          ...(res.data.nextPageToken ? { next_note: 'Give next_page_token with the same arguments for the next entries.' } : {}),
        };
      },
    }),
  ];
}

