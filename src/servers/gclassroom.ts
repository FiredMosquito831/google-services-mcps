/**
 * Curated Google Classroom tools (classroom_*) of the gclassroom server, with readable names in place of the hashed
 * generated ones (the 64-character budget hashes them, for example classroom_cour_stud_list_140b). They match the tools
 * of Google's Classroom MCP server (developers.google.com/workspace/classroom/reference/mcp/tools_list) for the common
 * tasks: courses, topics, coursework and material summaries with an optional submission overview, coursework details,
 * the roster, announcements, submissions, rubrics and guardians. Google's search_course_standards has no public REST
 * method, so it has no tool here. Answers carry the Classroom web links Google documents.
 *
 * Reads never ask. classroom_create_topic, classroom_create_announcement (a draft unless publish is true) and
 * classroom_create_rubric are writes, so the gate asks first. An announcement that is published (publish, or
 * scheduled_time) posts to the students, so that call is gated as destructive (destructiveWhen; the destructive rule,
 * docs/SECURITY.md). The Classroom API has no client library in this package,
 * so the calls go through the account's auth client (cloud-http.ts).
 *
 * Auth: OAuth user token from `gsm login workspace-user`.
 */
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { getAuthClient, googleScopes } from '../core/auth.js';
import { defineTool, type ToolDef } from '../core/tools.js';
import { formatInZone, ianaZone, type Zone } from './calendar-time.js';
import { makeCloudCall, statusOf, type CloudCall } from './cloud-http.js';

const API = 'https://classroom.googleapis.com/v1';
const WEB = 'https://classroom.google.com';

const COURSES_READ = googleScopes('classroom.courses', 'classroom.courses.readonly');
const TOPICS_READ = googleScopes('classroom.topics', 'classroom.topics.readonly');
const TOPICS_WRITE = googleScopes('classroom.topics');
const COURSEWORK_READ = googleScopes('classroom.coursework.me', 'classroom.coursework.me.readonly', 'classroom.coursework.students', 'classroom.coursework.students.readonly');
const SUBMISSIONS_READ = googleScopes(
  'classroom.coursework.me',
  'classroom.coursework.me.readonly',
  'classroom.coursework.students',
  'classroom.coursework.students.readonly',
  'classroom.student-submissions.me.readonly',
  'classroom.student-submissions.students.readonly',
);
const RUBRIC_WRITE = googleScopes('classroom.coursework.students');
const ROSTER_READ = googleScopes('classroom.rosters', 'classroom.rosters.readonly', 'classroom.profile.emails', 'classroom.profile.photos');
const ANNOUNCEMENTS_READ = googleScopes('classroom.announcements', 'classroom.announcements.readonly');
const ANNOUNCEMENTS_WRITE = googleScopes('classroom.announcements');
// The tool reads other students' guardians (a teacher's or an admin's task), so the student's own
// classroom.guardianlinks.me.readonly is not listed, as in Google's get_guardian_info.
const GUARDIANS_READ = googleScopes('classroom.guardianlinks.students', 'classroom.guardianlinks.students.readonly');

/** Ids one batch read takes, as Google's get_course_work, get_announcements and get_guardian_info do. Each id is one request. */
export const CLASSROOM_BATCH_MAX = 50;
/** Materials one coursework item or announcement may have (Classroom API). */
export const CLASSROOM_MATERIALS_MAX = 20;
/** Criteria one rubric may have, as Google's create_course_work_rubric says. */
export const CLASSROOM_RUBRIC_CRITERIA_MAX = 50;
/** Characters of an announcement's text in a summary (the full text is in classroom_get_announcements). */
export const ANNOUNCEMENT_SUMMARY_CHARS = 300;

// ---------- Links ----------

const enc = encodeURIComponent;
export const courseLinks = (courseId: string) => ({
  stream: `${WEB}/c/${enc(courseId)}`,
  classwork: `${WEB}/w/${enc(courseId)}/t/all`,
  people: `${WEB}/r/${enc(courseId)}/sort-name`,
});
const announcementLink = (courseId: string, id: string) => `${WEB}/c/${enc(courseId)}/p/${enc(id)}`;

// ---------- Page tokens of two lists ----------

/**
 * One opaque token for two Classroom lists read together (coursework and materials, teachers and students). Per list:
 * a token reads its next page, null means it has no more pages (it is not read again), undefined means not read.
 */
export function packTokens(a: string | null | undefined, b: string | null | undefined): string | undefined {
  if (!a && !b) return undefined;
  return Buffer.from(JSON.stringify({ a: a ?? null, b: b ?? null }), 'utf8').toString('base64url');
}

/** The two tokens of packTokens. undefined means that list starts at its first page; null means it has no more pages. */
export function unpackTokens(token: string | undefined): { a: string | null | undefined; b: string | null | undefined } {
  if (!token) return { a: undefined, b: undefined };
  try {
    const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as { a?: unknown; b?: unknown };
    const pick = (v: unknown) => (typeof v === 'string' ? v : v === null ? null : undefined);
    return { a: pick(parsed.a), b: pick(parsed.b) };
  } catch {
    throw new Error('page_token is not a next_page_token of this tool.');
  }
}

// ---------- Dates ----------

interface GDate {
  year?: number;
  month?: number;
  day?: number;
}
interface GTime {
  hours?: number;
  minutes?: number;
}

/**
 * A due date: Classroom keeps it as a UTC date and time of day. RFC 3339 in UTC, or in timeZone when one is given; a
 * date without a time is the date as given.
 */
export function dueOf(date: GDate | undefined, time: GTime | undefined, zone: Zone | undefined): string | undefined {
  if (!date?.year || !date.month || !date.day) return undefined;
  const ymd = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  if (!time) return ymd;
  const ms = Date.UTC(date.year, date.month - 1, date.day, time.hours ?? 0, time.minutes ?? 0);
  return zone ? formatInZone(ms, zone) : new Date(ms).toISOString().replace('.000Z', 'Z');
}

/** An RFC 3339 time from Classroom, shown in the zone when one is given. */
const timeIn = (value: string | undefined, zone: Zone | undefined): string | undefined =>
  value && zone && !Number.isNaN(Date.parse(value)) ? formatInZone(Date.parse(value), zone) : value;

const zoneOf = (timeZone: string | undefined): Zone | undefined => (timeZone === undefined ? undefined : ianaZone(timeZone));

// ---------- Answers ----------

interface Material {
  driveFile?: { driveFile?: { id?: string; title?: string; alternateLink?: string }; shareMode?: string };
  youtubeVideo?: { id?: string; title?: string; alternateLink?: string };
  link?: { url?: string; title?: string };
  form?: { formUrl?: string; title?: string; responseUrl?: string };
  gem?: { url?: string; title?: string };
  notebook?: { url?: string; title?: string };
}

/** One material, short: its kind, title and link. */
export function materialOf(m: Material) {
  if (m.driveFile) return { kind: 'drive_file', title: m.driveFile.driveFile?.title, id: m.driveFile.driveFile?.id, link: m.driveFile.driveFile?.alternateLink, share_mode: m.driveFile.shareMode };
  if (m.youtubeVideo) return { kind: 'youtube', title: m.youtubeVideo.title, link: m.youtubeVideo.alternateLink };
  if (m.link) return { kind: 'link', title: m.link.title, link: m.link.url };
  if (m.form) return { kind: 'form', title: m.form.title, link: m.form.formUrl, responses: m.form.responseUrl };
  if (m.gem) return { kind: 'gem', title: m.gem.title, link: m.gem.url };
  if (m.notebook) return { kind: 'notebook', title: m.notebook.title, link: m.notebook.url };
  return { kind: 'other' };
}

interface Course {
  id?: string;
  name?: string;
  section?: string;
  room?: string;
  subject?: string;
  description?: string;
  descriptionHeading?: string;
  courseState?: string;
  alternateLink?: string;
  ownerId?: string;
  creationTime?: string;
  updateTime?: string;
  enrollmentCode?: string;
  calendarId?: string;
  teacherGroupEmail?: string;
  courseGroupEmail?: string;
}

function courseSummary(c: Course, zone: Zone | undefined) {
  const id = c.id ?? '';
  return {
    id: c.id,
    name: c.name,
    ...(c.section ? { section: c.section } : {}),
    ...(c.room ? { room: c.room } : {}),
    ...(c.subject ? { subject: c.subject } : {}),
    state: c.courseState,
    owner_id: c.ownerId,
    created: timeIn(c.creationTime, zone),
    link: c.alternateLink ?? courseLinks(id).stream,
    classwork_link: courseLinks(id).classwork,
  };
}

interface CourseWorkItem {
  id?: string;
  title?: string;
  description?: string;
  state?: string;
  workType?: string;
  topicId?: string;
  maxPoints?: number;
  dueDate?: GDate;
  dueTime?: GTime;
  scheduledTime?: string;
  creationTime?: string;
  updateTime?: string;
  alternateLink?: string;
  assigneeMode?: string;
  individualStudentsOptions?: { studentIds?: string[] };
  materials?: Material[];
  multipleChoiceQuestion?: { choices?: string[] };
  submissionModificationMode?: string;
  creatorUserId?: string;
}

/** A coursework item or material in a list: no description, no materials, a link. Materials have the type MATERIAL. */
function courseworkSummary(courseId: string, w: CourseWorkItem, material: boolean, zone: Zone | undefined) {
  return {
    id: w.id,
    type: material ? 'MATERIAL' : w.workType,
    title: w.title,
    state: w.state,
    ...(w.topicId ? { topic_id: w.topicId } : {}),
    ...(!material && w.maxPoints !== undefined ? { max_points: w.maxPoints } : {}),
    ...(!material && w.dueDate ? { due: dueOf(w.dueDate, w.dueTime, zone) } : {}),
    ...(w.scheduledTime ? { scheduled: timeIn(w.scheduledTime, zone) } : {}),
    updated: timeIn(w.updateTime, zone),
    link: w.alternateLink ?? courseLinks(courseId).classwork,
  };
}

function courseworkDetail(courseId: string, w: CourseWorkItem, material: boolean, zone: Zone | undefined) {
  return {
    ...courseworkSummary(courseId, w, material, zone),
    description: w.description ?? '',
    materials: (w.materials ?? []).map(materialOf),
    assignees: w.assigneeMode === 'INDIVIDUAL_STUDENTS' ? { students: w.individualStudentsOptions?.studentIds ?? [] } : 'all students',
    ...(w.multipleChoiceQuestion?.choices ? { choices: w.multipleChoiceQuestion.choices } : {}),
    ...(w.submissionModificationMode ? { submission_modification: w.submissionModificationMode } : {}),
    created: timeIn(w.creationTime, zone),
    creator_id: w.creatorUserId,
  };
}

interface Submission {
  id?: string;
  userId?: string;
  state?: string;
  late?: boolean;
  assignedGrade?: number;
  draftGrade?: number;
  alternateLink?: string;
  courseWorkType?: string;
  assignmentSubmission?: { attachments?: Material[] };
  shortAnswerSubmission?: { answer?: string };
  multipleChoiceSubmission?: { answer?: string };
  assignedRubricGrades?: Record<string, { points?: number; levelId?: string; criterionId?: string }>;
  draftRubricGrades?: Record<string, { points?: number; levelId?: string; criterionId?: string }>;
}

/** Counts of a coursework item's submissions: by state, late, graded. One submission (a student's own) shows itself. */
export function submissionOverview(list: Submission[]) {
  if (list.length === 1 && list[0]) {
    const s = list[0];
    return { your_submission: { state: s.state, late: s.late ?? false, ...(s.assignedGrade !== undefined ? { grade: s.assignedGrade } : {}) } };
  }
  const byState: Record<string, number> = {};
  for (const s of list) byState[s.state ?? 'UNKNOWN'] = (byState[s.state ?? 'UNKNOWN'] ?? 0) + 1;
  return {
    submissions: list.length,
    by_state: byState,
    late: list.filter((s) => s.late).length,
    graded: list.filter((s) => s.assignedGrade !== undefined).length,
  };
}

interface Person {
  userId?: string;
  profile?: { id?: string; name?: { fullName?: string }; emailAddress?: string };
}
const personOf = (p: Person) => ({ user_id: p.userId ?? p.profile?.id, name: p.profile?.name?.fullName, ...(p.profile?.emailAddress ? { email: p.profile.emailAddress } : {}) });

// ---------- Inputs ----------

const courseId = z.string().min(1).describe('The course id (from classroom_list_courses), or an alias such as d:school_course.');
const timeZone = z
  .string()
  .optional()
  .describe('IANA time zone for the dates in the answer, for example Europe/Berlin (Classroom shows dates in the user\'s zone). Default: UTC.');
const pageSize = (def: number) => z.number().int().min(1).optional().describe(`Items per page. Default ${def}.`);
const pageToken = z.string().optional().describe('next_page_token from the previous call, with the same other arguments.');
const ids = (what: string) => z.array(z.string().min(1)).min(1).max(CLASSROOM_BATCH_MAX).describe(`${what}, 1 to ${CLASSROOM_BATCH_MAX}.`);

export async function buildTools(cfg: RuntimeConfig): Promise<ToolDef[]> {
  // The account is chosen per call (see account-context.ts), so the client is not cached here.
  const call: CloudCall = makeCloudCall(() => getAuthClient('workspace-user', cfg));
  const course = (id: string) => `${API}/courses/${enc(id)}`;

  /** Every page of a list (a roster lookup for names). */
  const allPages = async <T>(url: string, key: string, query: Record<string, string | number | undefined> = {}): Promise<T[]> => {
    const out: T[] = [];
    let token: string | undefined;
    do {
      const res = await call<Record<string, unknown>>({ url, query: { ...query, pageToken: token } });
      out.push(...((res.data[key] as T[] | undefined) ?? []));
      token = (res.data.nextPageToken as string | undefined) || undefined;
    } while (token);
    return out;
  };

  return [
    // ---- read ----
    defineTool({
      name: 'classroom_list_courses',
      title: 'List Classroom courses',
      description:
        "List your Google Classroom courses: name, section, room, subject, state and links (matches list_courses in Google's Classroom MCP server). Start here to get course ids; courses often share a name, so use the section to tell them apart. Active courses by default. role narrows to courses you teach or take. Each course has its stream link (https://classroom.google.com/c/{course_id}) and Classwork link.",
      kind: 'read',
      scopes: COURSES_READ,
      inputSchema: {
        states: z
          .array(z.enum(['ACTIVE', 'ARCHIVED', 'PROVISIONED', 'DECLINED', 'SUSPENDED']))
          .optional()
          .describe('Course states to list. Default ["ACTIVE"].'),
        role: z.enum(['teacher', 'student']).optional().describe('Only courses you teach, or only courses you take. Default: both.'),
        name_contains: z.string().optional().describe('Only courses whose name contains this text (case-insensitive), on this page.'),
        page_size: pageSize(10),
        page_token: pageToken,
        time_zone: timeZone,
      },
      async handler({ states, role, name_contains, page_size, page_token, time_zone }) {
        const zone = zoneOf(time_zone);
        const url = new URL(`${API}/courses`);
        for (const s of states?.length ? states : ['ACTIVE']) url.searchParams.append('courseStates', s);
        const res = await call<{ courses?: Course[]; nextPageToken?: string }>({
          url: url.toString(),
          query: { pageSize: page_size ?? 10, pageToken: page_token, ...(role === 'teacher' ? { teacherId: 'me' } : role === 'student' ? { studentId: 'me' } : {}) },
        });
        const needle = name_contains?.trim().toLowerCase();
        const courses = (res.data.courses ?? []).filter((c) => !needle || (c.name ?? '').toLowerCase().includes(needle));
        return {
          courses: courses.map((c) => ({ ...courseSummary(c, zone), ...(role ? { your_role: role } : {}) })),
          next_page_token: res.data.nextPageToken || undefined,
        };
      },
    }),
    defineTool({
      name: 'classroom_get_course',
      title: 'Get a Classroom course',
      description:
        'Read one course: its name, section, room, subject, description, state, owner, calendar and teacher group, and its stream, Classwork and People links. Google\'s list_courses returns these per course; this reads one by id.',
      kind: 'read',
      scopes: COURSES_READ,
      inputSchema: { course_id: courseId, time_zone: timeZone },
      async handler({ course_id, time_zone }) {
        const zone = zoneOf(time_zone);
        const c = (await call<Course>({ url: course(course_id) })).data;
        return {
          ...courseSummary(c, zone),
          ...(c.descriptionHeading ? { description_heading: c.descriptionHeading } : {}),
          ...(c.description ? { description: c.description } : {}),
          ...(c.enrollmentCode ? { enrollment_code: c.enrollmentCode } : {}),
          ...(c.calendarId ? { calendar_id: c.calendarId } : {}),
          ...(c.teacherGroupEmail ? { teacher_group_email: c.teacherGroupEmail } : {}),
          updated: timeIn(c.updateTime, zone),
          people_link: courseLinks(c.id ?? course_id).people,
        };
      },
    }),
    defineTool({
      name: 'classroom_list_topics',
      title: 'List Classroom topics',
      description:
        "List the topics of a course, which organize its classwork (matches list_topics in Google's Classroom MCP server). Use a topic id to filter classroom_list_coursework.",
      kind: 'read',
      scopes: TOPICS_READ,
      inputSchema: { course_id: courseId, page_size: pageSize(20), page_token: pageToken },
      async handler({ course_id, page_size, page_token }) {
        const res = await call<{ topic?: Array<{ topicId?: string; name?: string; updateTime?: string }>; nextPageToken?: string }>({
          url: `${course(course_id)}/topics`,
          query: { pageSize: page_size ?? 20, pageToken: page_token },
        });
        return { topics: (res.data.topic ?? []).map((t) => ({ id: t.topicId, name: t.name, updated: t.updateTime })), next_page_token: res.data.nextPageToken || undefined };
      },
    }),
    defineTool({
      name: 'classroom_list_coursework',
      title: 'List Classroom coursework',
      description:
        "List the assignments, questions and materials of a course, newest change first (matches list_course_work_summaries in Google's Classroom MCP server). Published items by default; include_drafts adds drafts and scheduled items (teachers). Short entries with a link; classroom_get_coursework gives the instructions, materials and settings. include_submission_overview adds, per assignment or question, the submission counts (teachers) or your own submission's state and grade (students). Materials need a classroom.courseworkmaterials scope; without one the answer lists the coursework and says so.",
      kind: 'read',
      scopes: COURSEWORK_READ,
      inputSchema: {
        course_id: courseId,
        types: z
          .array(z.enum(['ASSIGNMENT', 'SHORT_ANSWER_QUESTION', 'MULTIPLE_CHOICE_QUESTION', 'MATERIAL']))
          .optional()
          .describe('Only these types. Default: all.'),
        topic_ids: z.array(z.string()).optional().describe('Only items in these topics (from classroom_list_topics).'),
        title_contains: z.string().optional().describe('Only items whose title contains this text (case-insensitive), on this page.'),
        include_drafts: z.boolean().optional().describe('Also drafts and scheduled items (teachers only). Default false.'),
        include_submission_overview: z.boolean().optional().describe('Add submission counts or your own submission per assignment and question (one request each). Default false.'),
        page_size: pageSize(10),
        page_token: pageToken,
        time_zone: timeZone,
      },
      async handler({ course_id, types, topic_ids, title_contains, include_drafts, include_submission_overview, page_size, page_token, time_zone }) {
        const zone = zoneOf(time_zone);
        const tokens = unpackTokens(page_token);
        const wantWork = !types?.length || types.some((t) => t !== 'MATERIAL');
        const wantMaterials = !types?.length || types.includes('MATERIAL');
        const size = page_size ?? 10;
        const states = include_drafts ? ['PUBLISHED', 'DRAFT'] : ['PUBLISHED'];
        const listUrl = (path: string, stateParam: string) => {
          const url = new URL(`${course(course_id)}/${path}`);
          for (const s of states) url.searchParams.append(stateParam, s);
          return url.toString();
        };
        let work: CourseWorkItem[] = [];
        let materials: CourseWorkItem[] = [];
        let workNext: string | undefined;
        let materialsNext: string | undefined;
        let note: string | undefined;
        if (wantWork && tokens.a !== null) {
          const res = await call<{ courseWork?: CourseWorkItem[]; nextPageToken?: string }>({ url: listUrl('courseWork', 'courseWorkStates'), query: { pageSize: size, pageToken: tokens.a ?? undefined } });
          work = res.data.courseWork ?? [];
          workNext = res.data.nextPageToken || undefined;
        }
        if (wantMaterials && tokens.b !== null) {
          try {
            const res = await call<{ courseWorkMaterial?: CourseWorkItem[]; nextPageToken?: string }>({
              url: listUrl('courseWorkMaterials', 'courseWorkMaterialStates'),
              query: { pageSize: size, pageToken: tokens.b ?? undefined },
            });
            materials = res.data.courseWorkMaterial ?? [];
            materialsNext = res.data.nextPageToken || undefined;
          } catch (err) {
            if (statusOf(err) !== 403) throw err;
            note = 'Materials were not listed: the sign-in lacks a classroom.courseworkmaterials scope (or this account cannot see them).';
          }
        }
        const needle = title_contains?.trim().toLowerCase();
        const keep = (w: CourseWorkItem, material: boolean) =>
          (!types?.length || types.includes((material ? 'MATERIAL' : w.workType) as never)) &&
          (!topic_ids?.length || (w.topicId !== undefined && topic_ids.includes(w.topicId))) &&
          (!needle || (w.title ?? '').toLowerCase().includes(needle));
        const items = [
          ...work.filter((w) => keep(w, false)).map((w) => ({ w, material: false })),
          ...materials.filter((w) => keep(w, true)).map((w) => ({ w, material: true })),
        ].sort((x, y) => Date.parse(y.w.updateTime ?? '') - Date.parse(x.w.updateTime ?? ''));
        const out = [];
        for (const { w, material } of items) {
          const summary: Record<string, unknown> = courseworkSummary(course_id, w, material, zone);
          if (include_submission_overview && !material && w.id) {
            const subs = await allPages<Submission>(`${course(course_id)}/courseWork/${enc(w.id)}/studentSubmissions`, 'studentSubmissions');
            summary.submission_overview = submissionOverview(subs);
          }
          out.push(summary);
        }
        // A list with no more pages keeps null in the token, so the next call does not read it again.
        const next = workNext || materialsNext ? packTokens(wantWork ? (workNext ?? null) : null, wantMaterials && !note ? (materialsNext ?? null) : null) : undefined;
        return { course_id, coursework: out, ...(note ? { note } : {}), next_page_token: next, classwork_link: courseLinks(course_id).classwork };
      },
    }),
    defineTool({
      name: 'classroom_get_coursework',
      title: 'Get Classroom coursework',
      description: `Read up to ${CLASSROOM_BATCH_MAX} coursework items or materials of a course by id: instructions, materials, assignees, points, due date, choices and links (matches get_course_work in Google's Classroom MCP server). Ids come from classroom_list_coursework; each id is looked up as coursework, then as a material. Ids not found are listed apart.`,
      kind: 'read',
      scopes: COURSEWORK_READ,
      inputSchema: { course_id: courseId, coursework_ids: ids('Coursework or material ids'), time_zone: timeZone },
      async handler({ course_id, coursework_ids, time_zone }) {
        const zone = zoneOf(time_zone);
        const found = [];
        const notFound: string[] = [];
        for (const id of [...new Set(coursework_ids)]) {
          try {
            found.push(courseworkDetail(course_id, (await call<CourseWorkItem>({ url: `${course(course_id)}/courseWork/${enc(id)}` })).data, false, zone));
            continue;
          } catch (err) {
            if (statusOf(err) !== 404) throw err;
          }
          try {
            found.push(courseworkDetail(course_id, (await call<CourseWorkItem>({ url: `${course(course_id)}/courseWorkMaterials/${enc(id)}` })).data, true, zone));
          } catch (err) {
            if (statusOf(err) !== 404 && statusOf(err) !== 403) throw err;
            notFound.push(id);
          }
        }
        return { course_id, coursework: found, ...(notFound.length ? { not_found: notFound } : {}) };
      },
    }),
    defineTool({
      name: 'classroom_get_roster',
      title: 'Get a Classroom roster',
      description:
        "List the teachers and students of a course with user ids, names and (with the classroom.profile.emails scope) email addresses (matches get_course_roster in Google's Classroom MCP server). Use student ids for classroom_list_submissions and classroom_get_guardians. The People page is https://classroom.google.com/r/{course_id}/sort-name.",
      kind: 'read',
      scopes: ROSTER_READ,
      inputSchema: { course_id: courseId, page_size: pageSize(30), page_token: pageToken },
      async handler({ course_id, page_size, page_token }) {
        const tokens = unpackTokens(page_token);
        const size = page_size ?? 30;
        const read = async (path: string, key: string, token: string | null | undefined) => {
          if (token === null) return { people: [] as Person[], next: undefined };
          const res = await call<Record<string, unknown>>({ url: `${course(course_id)}/${path}`, query: { pageSize: size, pageToken: token ?? undefined } });
          return { people: (res.data[key] as Person[] | undefined) ?? [], next: (res.data.nextPageToken as string | undefined) || undefined };
        };
        const teachers = await read('teachers', 'teachers', tokens.a);
        const students = await read('students', 'students', tokens.b);
        return {
          course_id,
          teachers: teachers.people.map(personOf),
          students: students.people.map(personOf),
          next_page_token: teachers.next || students.next ? packTokens(teachers.next ?? null, students.next ?? null) : undefined,
          people_link: courseLinks(course_id).people,
        };
      },
    }),
    defineTool({
      name: 'classroom_list_announcements',
      title: 'List Classroom announcements',
      description: `List a course's announcements, newest first, with their text cut at ${ANNOUNCEMENT_SUMMARY_CHARS} characters (matches list_announcement_summaries in Google's Classroom MCP server). Published ones by default; include_drafts adds drafts and scheduled ones (teachers). classroom_get_announcements gives the full text and materials. Each has its link, https://classroom.google.com/c/{course_id}/p/{announcement_id}.`,
      kind: 'read',
      scopes: ANNOUNCEMENTS_READ,
      inputSchema: {
        course_id: courseId,
        text_contains: z.string().optional().describe('Only announcements whose text contains this (case-insensitive), on this page.'),
        include_drafts: z.boolean().optional().describe('Also drafts and scheduled announcements (teachers only). Default false.'),
        page_size: pageSize(10),
        page_token: pageToken,
        time_zone: timeZone,
      },
      async handler({ course_id, text_contains, include_drafts, page_size, page_token, time_zone }) {
        const zone = zoneOf(time_zone);
        const url = new URL(`${course(course_id)}/announcements`);
        for (const s of include_drafts ? ['PUBLISHED', 'DRAFT'] : ['PUBLISHED']) url.searchParams.append('announcementStates', s);
        const res = await call<{ announcements?: Array<{ id?: string; text?: string; state?: string; updateTime?: string; creationTime?: string; scheduledTime?: string; materials?: Material[]; alternateLink?: string }>; nextPageToken?: string }>({
          url: url.toString(),
          query: { pageSize: page_size ?? 10, pageToken: page_token, orderBy: 'updateTime desc' },
        });
        const needle = text_contains?.trim().toLowerCase();
        const list = (res.data.announcements ?? []).filter((a) => !needle || (a.text ?? '').toLowerCase().includes(needle));
        return {
          course_id,
          announcements: list.map((a) => {
            const text = a.text ?? '';
            return {
              id: a.id,
              text: text.length > ANNOUNCEMENT_SUMMARY_CHARS ? `${text.slice(0, ANNOUNCEMENT_SUMMARY_CHARS)}...` : text,
              ...(text.length > ANNOUNCEMENT_SUMMARY_CHARS ? { text_truncated: true } : {}),
              state: a.state,
              ...(a.scheduledTime ? { scheduled: timeIn(a.scheduledTime, zone) } : {}),
              updated: timeIn(a.updateTime, zone),
              materials: (a.materials ?? []).length,
              link: a.alternateLink ?? announcementLink(course_id, a.id ?? ''),
            };
          }),
          next_page_token: res.data.nextPageToken || undefined,
        };
      },
    }),
    defineTool({
      name: 'classroom_get_announcements',
      title: 'Get Classroom announcements',
      description: `Read up to ${CLASSROOM_BATCH_MAX} announcements of a course by id: full text, materials, assignees, state and link (matches get_announcements in Google's Classroom MCP server). Ids come from classroom_list_announcements; ids not found are listed apart.`,
      kind: 'read',
      scopes: ANNOUNCEMENTS_READ,
      inputSchema: { course_id: courseId, announcement_ids: ids('Announcement ids'), time_zone: timeZone },
      async handler({ course_id, announcement_ids, time_zone }) {
        const zone = zoneOf(time_zone);
        const found = [];
        const notFound: string[] = [];
        for (const id of [...new Set(announcement_ids)]) {
          try {
            const a = (
              await call<{ id?: string; text?: string; state?: string; materials?: Material[]; assigneeMode?: string; individualStudentsOptions?: { studentIds?: string[] }; creationTime?: string; updateTime?: string; scheduledTime?: string; alternateLink?: string; creatorUserId?: string }>({
                url: `${course(course_id)}/announcements/${enc(id)}`,
              })
            ).data;
            found.push({
              id: a.id,
              text: a.text ?? '',
              state: a.state,
              materials: (a.materials ?? []).map(materialOf),
              assignees: a.assigneeMode === 'INDIVIDUAL_STUDENTS' ? { students: a.individualStudentsOptions?.studentIds ?? [] } : 'all students',
              created: timeIn(a.creationTime, zone),
              updated: timeIn(a.updateTime, zone),
              ...(a.scheduledTime ? { scheduled: timeIn(a.scheduledTime, zone) } : {}),
              creator_id: a.creatorUserId,
              link: a.alternateLink ?? announcementLink(course_id, a.id ?? id),
            });
          } catch (err) {
            if (statusOf(err) !== 404) throw err;
            notFound.push(id);
          }
        }
        return { course_id, announcements: found, ...(notFound.length ? { not_found: notFound } : {}) };
      },
    }),
    defineTool({
      name: 'classroom_list_submissions',
      title: 'List Classroom submissions',
      description:
        "List the student submissions of one coursework item: student, state, late, grade and grade percentage (matches list_course_work_submissions in Google's Classroom MCP server). include_student_work adds the attachments, the answer and the rubric grades; it is always on for student_ids. Student names come from the roster (needs a classroom.rosters scope; without one, ids only). Filter by states and late. A student sees only their own submission.",
      kind: 'read',
      scopes: SUBMISSIONS_READ,
      inputSchema: {
        course_id: courseId,
        coursework_id: z.string().min(1).describe('The coursework id (from classroom_list_coursework).'),
        student_ids: z.array(z.string().min(1)).max(CLASSROOM_BATCH_MAX).optional().describe(`Only these students (ids from classroom_get_roster), at most ${CLASSROOM_BATCH_MAX}; one request each.`),
        states: z.array(z.enum(['NEW', 'CREATED', 'TURNED_IN', 'RETURNED', 'RECLAIMED_BY_STUDENT'])).optional().describe('Only these submission states.'),
        late: z.boolean().optional().describe('true: only late submissions; false: only those not late.'),
        include_student_work: z.boolean().optional().describe('Add attachments, answers and rubric grades. Default false.'),
        page_size: pageSize(10),
        page_token: pageToken,
      },
      async handler({ course_id, coursework_id, student_ids, states, late, include_student_work, page_size, page_token }) {
        const work = (await call<CourseWorkItem>({ url: `${course(course_id)}/courseWork/${enc(coursework_id)}` })).data;
        const base = `${course(course_id)}/courseWork/${enc(coursework_id)}/studentSubmissions`;
        const listUrl = () => {
          const url = new URL(base);
          for (const s of states ?? []) url.searchParams.append('states', s);
          return url.toString();
        };
        const lateFilter = late === undefined ? undefined : late ? 'LATE_ONLY' : 'NOT_LATE_ONLY';
        let subs: Submission[] = [];
        let next: string | undefined;
        if (student_ids?.length) {
          for (const id of [...new Set(student_ids)]) {
            const res = await call<{ studentSubmissions?: Submission[] }>({ url: listUrl(), query: { userId: id, late: lateFilter } });
            subs.push(...(res.data.studentSubmissions ?? []));
          }
        } else {
          const res = await call<{ studentSubmissions?: Submission[]; nextPageToken?: string }>({ url: listUrl(), query: { pageSize: page_size ?? 10, pageToken: page_token, late: lateFilter } });
          subs = res.data.studentSubmissions ?? [];
          next = res.data.nextPageToken || undefined;
        }
        const names = new Map<string, string>();
        let note: string | undefined;
        try {
          for (const s of await allPages<Person>(`${course(course_id)}/students`, 'students', { pageSize: 100 })) {
            const id = s.userId ?? s.profile?.id;
            if (id && s.profile?.name?.fullName) names.set(id, s.profile.name.fullName);
          }
        } catch (err) {
          if (statusOf(err) !== 403) throw err;
          note = 'Student names are left out: the sign-in lacks a classroom.rosters scope.';
        }
        const withWork = include_student_work === true || Boolean(student_ids?.length);
        const grades = (g: Submission['assignedRubricGrades']) => Object.values(g ?? {}).map((r) => ({ criterion_id: r.criterionId, level_id: r.levelId, points: r.points }));
        return {
          course_id,
          coursework_id,
          title: work.title,
          max_points: work.maxPoints,
          submissions: subs.map((s) => ({
            id: s.id,
            student_id: s.userId,
            ...(s.userId && names.has(s.userId) ? { student_name: names.get(s.userId) } : {}),
            state: s.state,
            late: s.late ?? false,
            ...(s.assignedGrade !== undefined ? { grade: s.assignedGrade } : {}),
            ...(s.assignedGrade !== undefined && work.maxPoints ? { grade_percentage: Math.round((s.assignedGrade / work.maxPoints) * 10000) / 100 } : {}),
            ...(s.draftGrade !== undefined ? { draft_grade: s.draftGrade } : {}),
            ...(withWork
              ? {
                  attachments: (s.assignmentSubmission?.attachments ?? []).map(materialOf),
                  ...(s.shortAnswerSubmission?.answer !== undefined ? { answer: s.shortAnswerSubmission.answer } : {}),
                  ...(s.multipleChoiceSubmission?.answer !== undefined ? { answer: s.multipleChoiceSubmission.answer } : {}),
                  ...(s.assignedRubricGrades ? { rubric_grades: grades(s.assignedRubricGrades) } : {}),
                  ...(s.draftRubricGrades ? { draft_rubric_grades: grades(s.draftRubricGrades) } : {}),
                }
              : {}),
            link: s.alternateLink,
          })),
          ...(note ? { note } : {}),
          next_page_token: next,
        };
      },
    }),
    defineTool({
      name: 'classroom_get_rubric',
      title: 'Get a Classroom rubric',
      description: "Read the grading rubric of one coursework item: its criteria and their levels with points (matches get_course_work_rubric in Google's Classroom MCP server). No rubric gives rubric: null.",
      kind: 'read',
      scopes: COURSEWORK_READ,
      inputSchema: { course_id: courseId, coursework_id: z.string().min(1).describe('The coursework id.') },
      async handler({ course_id, coursework_id }) {
        const res = await call<{ rubrics?: Array<{ id?: string; criteria?: Array<{ id?: string; title?: string; description?: string; levels?: Array<{ id?: string; title?: string; description?: string; points?: number }> }> }> }>({
          url: `${course(course_id)}/courseWork/${enc(coursework_id)}/rubrics`,
        });
        const rubric = res.data.rubrics?.[0];
        if (!rubric) return { course_id, coursework_id, rubric: null };
        return {
          course_id,
          coursework_id,
          rubric: {
            id: rubric.id,
            criteria: (rubric.criteria ?? []).map((c) => ({ id: c.id, title: c.title, description: c.description, levels: (c.levels ?? []).map((l) => ({ id: l.id, title: l.title, description: l.description, points: l.points })) })),
          },
        };
      },
    }),
    defineTool({
      name: 'classroom_get_guardians',
      title: 'Get Classroom guardians',
      description: `List the guardians of up to ${CLASSROOM_BATCH_MAX} students, by student id from classroom_get_roster (matches get_guardian_info in Google's Classroom MCP server). One request per student. A student with no guardian, or whom you may not see, has an empty list.`,
      kind: 'read',
      scopes: GUARDIANS_READ,
      inputSchema: { student_ids: ids('Student ids') },
      async handler({ student_ids }) {
        const out = [];
        for (const id of [...new Set(student_ids)]) {
          try {
            const list = await allPages<{ guardianId?: string; guardianProfile?: { name?: { fullName?: string }; emailAddress?: string } }>(`${API}/userProfiles/${enc(id)}/guardians`, 'guardians');
            out.push({ student_id: id, guardians: list.map((g) => ({ guardian_id: g.guardianId, name: g.guardianProfile?.name?.fullName, ...(g.guardianProfile?.emailAddress ? { email: g.guardianProfile.emailAddress } : {}) })) });
          } catch (err) {
            if (statusOf(err) !== 404 && statusOf(err) !== 403) throw err;
            out.push({ student_id: id, guardians: [], note: (err as Error).message });
          }
        }
        return { students: out };
      },
    }),

    // ---- write ----
    defineTool({
      name: 'classroom_create_topic',
      title: 'Create a Classroom topic',
      description: "Create a topic in a course, to organize its classwork (matches create_topic in Google's Classroom MCP server). Teachers only. It asks first.",
      kind: 'write',
      scopes: TOPICS_WRITE,
      inputSchema: { course_id: courseId, name: z.string().trim().min(1).describe('The topic name.') },
      async handler({ course_id, name }) {
        const t = (await call<{ topicId?: string; name?: string }>({ url: `${course(course_id)}/topics`, method: 'POST', body: { name } })).data;
        return { id: t.topicId, name: t.name, classwork_link: courseLinks(course_id).classwork };
      },
    }),
    defineTool({
      name: 'classroom_create_announcement',
      title: 'Create a Classroom announcement',
      description:
        "Create an announcement in a course stream (matches create_announcement in Google's Classroom MCP server). It is a draft that students cannot see unless publish is true, or until scheduled_time when that is set; a draft has no link of its own, so find it under Drafts on the stream page (https://classroom.google.com/c/{course_id}). Teachers only. Attach links and Drive files; at most 20 materials. assignee_ids limits it to some students. It asks first; with publish or scheduled_time it posts to the students, so it asks as a destructive action.",
      kind: 'write',
      // Publishing, now or at scheduled_time, posts the text to the students: a send to other people (the destructive rule).
      destructiveWhen: ({ publish, scheduled_time }) => publish === true || scheduled_time !== undefined,
      scopes: ANNOUNCEMENTS_WRITE,
      inputSchema: {
        course_id: courseId,
        text: z.string().trim().min(1).max(30000).describe('The announcement text (at most 30,000 characters).'),
        links: z.array(z.string().url()).optional().describe('Web links to attach.'),
        drive_file_ids: z.array(z.string().min(1)).optional().describe('Drive file ids to attach (students can view them).'),
        assignee_ids: z.array(z.string().min(1)).optional().describe('Only these students see it (ids from classroom_get_roster). Default: all students.'),
        scheduled_time: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i, 'scheduled_time must be RFC 3339 with an offset')
          .optional()
          .describe('Publish it at this time (RFC 3339). It stays a draft until then.'),
        publish: z.boolean().optional().describe('Publish now, so students see it at once. Default false: a draft. Not with scheduled_time.'),
      },
      async handler({ course_id, text, links, drive_file_ids, assignee_ids, scheduled_time, publish }) {
        if (publish === true && scheduled_time !== undefined) throw new Error('Give publish or scheduled_time, not both: a scheduled announcement stays a draft until its time.');
        const materials = [...(links ?? []).map((url) => ({ link: { url } })), ...(drive_file_ids ?? []).map((id) => ({ driveFile: { driveFile: { id }, shareMode: 'VIEW' } }))];
        if (materials.length > CLASSROOM_MATERIALS_MAX) throw new Error(`At most ${CLASSROOM_MATERIALS_MAX} materials per announcement (Classroom API); ${materials.length} were given.`);
        const a = (
          await call<{ id?: string; state?: string; alternateLink?: string; scheduledTime?: string }>({
            url: `${course(course_id)}/announcements`,
            method: 'POST',
            body: {
              text,
              state: publish === true ? 'PUBLISHED' : 'DRAFT',
              ...(materials.length ? { materials } : {}),
              ...(assignee_ids?.length ? { assigneeMode: 'INDIVIDUAL_STUDENTS', individualStudentsOptions: { studentIds: [...new Set(assignee_ids)] } } : {}),
              ...(scheduled_time ? { scheduledTime: scheduled_time } : {}),
            },
          })
        ).data;
        return {
          id: a.id,
          state: a.state,
          ...(a.scheduledTime ? { scheduled: a.scheduledTime } : {}),
          link: a.alternateLink ?? courseLinks(course_id).stream,
          ...(a.state !== 'PUBLISHED' ? { note: 'A draft: students do not see it yet. It is under Drafts on the stream page.' } : {}),
        };
      },
    }),
    defineTool({
      name: 'classroom_create_rubric',
      title: 'Create a Classroom rubric',
      description: `Create the grading rubric of an assignment that has none (matches create_course_work_rubric in Google's Classroom MCP server). Each criterion has a title and levels; give points to every level of the rubric or to none, distinct within a criterion, and at least one above zero. At most ${CLASSROOM_RUBRIC_CRITERIA_MAX} criteria. Google takes rubrics only for coursework made by the same Google Cloud project and, it says, an eligible Workspace for Education license; it refuses others. It asks first.`,
      kind: 'write',
      scopes: RUBRIC_WRITE,
      inputSchema: {
        course_id: courseId,
        coursework_id: z.string().min(1).describe('The assignment id.'),
        criteria: z
          .array(
            z.object({
              title: z.string().trim().min(1),
              description: z.string().optional(),
              levels: z
                .array(z.object({ title: z.string().optional(), description: z.string().optional(), points: z.number().min(0).optional() }))
                .min(1),
            }),
          )
          .min(1)
          .max(CLASSROOM_RUBRIC_CRITERIA_MAX)
          .describe('The criteria, each with its levels.'),
      },
      async handler({ course_id, coursework_id, criteria }) {
        checkRubric(criteria);
        const r = (
          await call<{ id?: string; criteria?: Array<{ id?: string; title?: string; levels?: Array<{ id?: string; points?: number }> }> }>({
            url: `${course(course_id)}/courseWork/${enc(coursework_id)}/rubrics`,
            method: 'POST',
            body: { criteria: criteria.map((c) => ({ title: c.title, ...(c.description !== undefined ? { description: c.description } : {}), levels: c.levels })) },
          })
        ).data;
        return { id: r.id, criteria: (r.criteria ?? []).map((c) => ({ id: c.id, title: c.title, levels: (c.levels ?? []).length })) };
      },
    }),
  ];
}

/**
 * Classroom's rubric rules, checked before the request: every level has a title or points; points on every level of the
 * rubric or on none; points distinct within a criterion; at least one level above zero when points are used.
 */
export function checkRubric(criteria: ReadonlyArray<{ title: string; levels: ReadonlyArray<{ title?: string; points?: number }> }>): void {
  const levels = criteria.flatMap((c) => c.levels);
  const withPoints = levels.filter((l) => l.points !== undefined).length;
  if (withPoints !== 0 && withPoints !== levels.length) throw new Error('Give points to every level of the rubric, or to none.');
  for (const c of criteria) {
    for (const l of c.levels) if (l.points === undefined && !l.title?.trim()) throw new Error(`A level of "${c.title}" has neither a title nor points.`);
    const pts = c.levels.map((l) => l.points).filter((p): p is number => p !== undefined);
    if (new Set(pts).size !== pts.length) throw new Error(`The levels of "${c.title}" must have distinct points.`);
  }
  if (withPoints && !levels.some((l) => (l.points ?? 0) > 0)) throw new Error('At least one level must have points above zero.');
}
