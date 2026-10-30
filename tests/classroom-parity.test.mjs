// The Google Classroom parity tools (1.14.0): readable curated tools for courses, topics, coursework, the roster,
// announcements, submissions, rubrics and guardians. The HTTP layer is stubbed (OAuth2Client.prototype.request), so
// nothing leaves the machine. Fake tokens in a temp folder only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';

delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { loadConfig } = await import(DIST('core/config.js'));
const cls = await import(DIST('servers/gclassroom.js'));
const { ianaZone } = await import(DIST('servers/calendar-time.js'));
const { classifyMethod } = await import(DIST('core/discovery/methods.js'));

const root = mkdtempSync(join(tmpdir(), 'gsm-classroom-parity-'));
after(() => rmSync(root, { recursive: true, force: true }));
const tokenDir = join(root, 'tokens');
mkdirSync(tokenDir);
writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
writeFileSync(join(tokenDir, 'workspace-user.token.json'), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));
const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true' });
const tools = new Map((await cls.buildTools(cfg)).map((t) => [t.name, t]));
const ctx = { gate: async () => undefined, grantedScopes: null, hasScope: () => true };
const run = (name, args) => tools.get(name).handler(args, ctx);
const parse = (name, args) => z.object(tools.get(name).inputSchema).safeParse(args);

let calls = [];
let respond = () => ({});
OAuth2Client.prototype.request = async function fakeRequest(opts) {
  const url = new URL(opts.url);
  const query = {};
  for (const [key, value] of url.searchParams) query[key] = key in query ? [].concat(query[key], value) : value;
  const call = { method: String(opts.method ?? 'GET').toUpperCase(), path: url.pathname, query, body: opts.data };
  calls.push(call);
  return { data: await respond(call), status: 200, headers: new Headers(), config: opts };
};
const reset = (responder = () => ({})) => {
  calls = [];
  respond = responder;
};
const httpError = (status, message = 'error') => {
  const err = new Error(message);
  err.response = { status, data: { error: { code: status, message } } };
  return err;
};
const G = (s) => `https://www.googleapis.com/auth/${s}`;

const READS = ['classroom_list_courses', 'classroom_get_course', 'classroom_list_topics', 'classroom_list_coursework', 'classroom_get_coursework', 'classroom_get_roster', 'classroom_list_announcements', 'classroom_get_announcements', 'classroom_list_submissions', 'classroom_get_rubric', 'classroom_get_guardians'];
const WRITES = { classroom_create_topic: 'classroom.courses.topics.create', classroom_create_announcement: 'classroom.courses.announcements.create', classroom_create_rubric: 'classroom.courses.courseWork.rubrics.create' };

// ---------------------------------------------------------------------------
// Kinds, scopes, names

test('eleven reads and three writes that follow classifyMethod; readable names within the budget; no confirm', () => {
  assert.deepEqual([...tools.keys()].sort(), [...READS, ...Object.keys(WRITES)].sort());
  for (const name of READS) assert.equal(tools.get(name).kind, 'read', name);
  for (const [name, id] of Object.entries(WRITES)) {
    assert.equal(tools.get(name).kind, 'write', name);
    assert.equal(classifyMethod('POST', 'create', id), 'write', id);
  }
  for (const t of tools.values()) {
    // mcp__plugin_gclassroom_gclassroom__ leaves 29 characters.
    assert.ok(t.name.length <= 29, `${t.name} fits the tool-name budget`);
    assert.equal(t.inputSchema.confirm, undefined, `${t.name}: no model-controlled confirm`);
    assert.match(t.description, /Google's/, `${t.name} names Google's tool`);
  }
  assert.deepEqual(tools.get('classroom_create_topic').scopes, [G('classroom.topics')]);
  assert.deepEqual(tools.get('classroom_create_announcement').scopes, [G('classroom.announcements')]);
  assert.deepEqual(tools.get('classroom_get_guardians').scopes, [G('classroom.guardianlinks.students'), G('classroom.guardianlinks.students.readonly')]);
});

// ---------------------------------------------------------------------------
// Helpers

test('links, the packed page token of two lists, and due dates in UTC or a zone', () => {
  assert.deepEqual(cls.courseLinks('123'), {
    stream: 'https://classroom.google.com/c/123',
    classwork: 'https://classroom.google.com/w/123/t/all',
    people: 'https://classroom.google.com/r/123/sort-name',
  });
  assert.equal(cls.packTokens(undefined, undefined), undefined);
  assert.equal(cls.packTokens(null, null), undefined);
  assert.deepEqual(cls.unpackTokens(cls.packTokens('w2', null)), { a: 'w2', b: null });
  assert.deepEqual(cls.unpackTokens(undefined), { a: undefined, b: undefined });
  assert.throws(() => cls.unpackTokens('not-a-token'), /not a next_page_token of this tool/);
  assert.equal(cls.dueOf({ year: 2026, month: 11, day: 3 }, { hours: 22, minutes: 59 }, undefined), '2026-11-03T22:59:00Z');
  assert.equal(cls.dueOf({ year: 2026, month: 11, day: 3 }, { hours: 22, minutes: 59 }, ianaZone('Europe/Berlin')), '2026-11-03T23:59:00+01:00');
  assert.equal(cls.dueOf({ year: 2026, month: 11, day: 3 }, undefined, undefined), '2026-11-03');
  assert.equal(cls.dueOf(undefined, undefined, undefined), undefined);
});

test('checkRubric: points on every level or none, distinct within a criterion, one above zero, a title or points', () => {
  const ok = [{ title: 'Clarity', levels: [{ title: 'Poor', points: 0 }, { title: 'Good', points: 2 }] }];
  cls.checkRubric(ok);
  cls.checkRubric([{ title: 'Effort', levels: [{ title: 'Some' }, { title: 'Lots' }] }]);
  assert.throws(() => cls.checkRubric([{ title: 'A', levels: [{ title: 'x', points: 1 }, { title: 'y' }] }]), /every level of the rubric, or to none/);
  assert.throws(() => cls.checkRubric([{ title: 'A', levels: [{ points: 1 }, { points: 1 }] }]), /distinct points/);
  assert.throws(() => cls.checkRubric([{ title: 'A', levels: [{ points: 0 }] }]), /above zero/);
  assert.throws(() => cls.checkRubric([{ title: 'A', levels: [{ description: 'no title' }] }]), /neither a title nor points/);
});

// ---------------------------------------------------------------------------
// Courses and topics

test('list_courses: ACTIVE by default, role as teacherId/studentId me, a name filter, stream and Classwork links', async () => {
  reset(() => ({ courses: [{ id: '10', name: 'Biology', section: 'Period 2', courseState: 'ACTIVE', alternateLink: 'https://classroom.google.com/c/MTA', creationTime: '2026-09-01T07:00:00Z' }, { id: '11', name: 'Art', courseState: 'ACTIVE' }], nextPageToken: 'n' }));
  const res = await run('classroom_list_courses', { role: 'teacher', name_contains: 'bio', time_zone: 'Europe/Berlin' });
  assert.deepEqual(calls.map((c) => [c.path, c.query]), [['/v1/courses', { courseStates: 'ACTIVE', pageSize: '10', teacherId: 'me' }]]);
  assert.deepEqual(res.courses, [
    { id: '10', name: 'Biology', section: 'Period 2', state: 'ACTIVE', owner_id: undefined, created: '2026-09-01T09:00:00+02:00', link: 'https://classroom.google.com/c/MTA', classwork_link: 'https://classroom.google.com/w/10/t/all', your_role: 'teacher' },
  ]);
  assert.equal(res.next_page_token, 'n');
  reset(() => ({}));
  await run('classroom_list_courses', { states: ['ARCHIVED', 'ACTIVE'], role: 'student', page_size: 50, page_token: 'p' });
  assert.deepEqual(calls[0].query, { courseStates: ['ARCHIVED', 'ACTIVE'], pageSize: '50', pageToken: 'p', studentId: 'me' });
  await assert.rejects(run('classroom_list_courses', { time_zone: 'Mars/Base' }), /not a known IANA time zone/);
});

test('get_course and list_topics; create_topic posts the name', async () => {
  reset(() => ({ id: 'd:bio', name: 'Biology', description: 'Cells', calendarId: 'cal@group', courseState: 'ACTIVE' }));
  const c = await run('classroom_get_course', { course_id: 'd:bio' });
  assert.equal(calls[0].path, '/v1/courses/d%3Abio');
  assert.equal(c.description, 'Cells');
  assert.equal(c.people_link, 'https://classroom.google.com/r/d%3Abio/sort-name');
  reset(() => ({ topic: [{ topicId: 't1', name: 'Unit 1', updateTime: '2026-10-01T00:00:00Z' }] }));
  assert.deepEqual((await run('classroom_list_topics', { course_id: '10' })).topics, [{ id: 't1', name: 'Unit 1', updated: '2026-10-01T00:00:00Z' }]);
  assert.deepEqual(calls[0].query, { pageSize: '20' });
  reset(() => ({ topicId: 't2', name: 'Unit 2' }));
  assert.deepEqual(await run('classroom_create_topic', { course_id: '10', name: 'Unit 2' }), { id: 't2', name: 'Unit 2', classwork_link: 'https://classroom.google.com/w/10/t/all' });
  assert.deepEqual(calls.map((c) => [c.method, c.path, c.body]), [['POST', '/v1/courses/10/topics', { name: 'Unit 2' }]]);
});

// ---------------------------------------------------------------------------
// Coursework

const WORK = [
  { id: 'w1', title: 'Essay', workType: 'ASSIGNMENT', state: 'PUBLISHED', topicId: 't1', maxPoints: 20, dueDate: { year: 2026, month: 11, day: 3 }, dueTime: { hours: 22, minutes: 59 }, updateTime: '2026-10-02T00:00:00Z', alternateLink: 'https://classroom.google.com/c/x/a/w1/details' },
  { id: 'w2', title: 'Quiz', workType: 'MULTIPLE_CHOICE_QUESTION', state: 'PUBLISHED', updateTime: '2026-10-04T00:00:00Z' },
];
const MATERIALS = [{ id: 'm1', title: 'Reading list', state: 'PUBLISHED', topicId: 't1', updateTime: '2026-10-03T00:00:00Z', materials: [{ link: { url: 'https://example.com' } }] }];

test('list_coursework: assignments, questions and materials in one list, newest change first, published only by default', async () => {
  reset((c) => (c.path.endsWith('/courseWork') ? { courseWork: WORK, nextPageToken: 'wn' } : { courseWorkMaterial: MATERIALS }));
  const res = await run('classroom_list_coursework', { course_id: '10' });
  assert.deepEqual(calls.map((c) => [c.path, c.query]), [
    ['/v1/courses/10/courseWork', { courseWorkStates: 'PUBLISHED', pageSize: '10' }],
    ['/v1/courses/10/courseWorkMaterials', { courseWorkMaterialStates: 'PUBLISHED', pageSize: '10' }],
  ]);
  assert.deepEqual(res.coursework.map((w) => [w.id, w.type]), [['w2', 'MULTIPLE_CHOICE_QUESTION'], ['m1', 'MATERIAL'], ['w1', 'ASSIGNMENT']]);
  assert.deepEqual(res.coursework[2], { id: 'w1', type: 'ASSIGNMENT', title: 'Essay', state: 'PUBLISHED', topic_id: 't1', max_points: 20, due: '2026-11-03T22:59:00Z', updated: '2026-10-02T00:00:00Z', link: 'https://classroom.google.com/c/x/a/w1/details' });
  assert.equal(res.coursework[0].link, 'https://classroom.google.com/w/10/t/all', 'no alternateLink: the Classwork page');
  // The next page reads only the list that has more.
  assert.deepEqual(cls.unpackTokens(res.next_page_token), { a: 'wn', b: null });
  reset(() => ({ courseWork: [] }));
  await run('classroom_list_coursework', { course_id: '10', page_token: res.next_page_token });
  assert.deepEqual(calls.map((c) => [c.path, c.query.pageToken]), [['/v1/courses/10/courseWork', 'wn']]);
});

test('list_coursework: types, topics and title filter; drafts on request; materials without their scope give a note', async () => {
  reset((c) => (c.path.endsWith('/courseWork') ? { courseWork: WORK } : { courseWorkMaterial: MATERIALS }));
  const only = await run('classroom_list_coursework', { course_id: '10', types: ['MATERIAL'], topic_ids: ['t1'], include_drafts: true });
  assert.deepEqual(calls.map((c) => [c.path, c.query.courseWorkMaterialStates]), [['/v1/courses/10/courseWorkMaterials', ['PUBLISHED', 'DRAFT']]], 'no coursework request for materials only');
  assert.deepEqual(only.coursework.map((w) => w.id), ['m1']);
  reset((c) => (c.path.endsWith('/courseWork') ? { courseWork: WORK } : { courseWorkMaterial: MATERIALS }));
  assert.deepEqual((await run('classroom_list_coursework', { course_id: '10', title_contains: 'ESS' })).coursework.map((w) => w.id), ['w1']);
  reset((c) => {
    if (c.path.endsWith('/courseWorkMaterials')) throw httpError(403, 'Request had insufficient authentication scopes.');
    return { courseWork: WORK };
  });
  const partial = await run('classroom_list_coursework', { course_id: '10' });
  assert.deepEqual(partial.coursework.map((w) => w.id), ['w2', 'w1']);
  assert.match(partial.note, /classroom\.courseworkmaterials scope/);
  reset((c) => {
    if (c.path.endsWith('/courseWorkMaterials')) throw httpError(500, 'backend');
    return { courseWork: WORK };
  });
  await assert.rejects(run('classroom_list_coursework', { course_id: '10' }), /backend/, 'only a 403 is taken for a missing scope');
});

test('list_coursework: the submission overview counts states, late and graded; a single submission is the caller\'s own', async () => {
  const subs = [{ state: 'TURNED_IN', late: true }, { state: 'TURNED_IN', assignedGrade: 18 }, { state: 'CREATED' }];
  reset((c) => (c.path.endsWith('/studentSubmissions') ? { studentSubmissions: c.path.includes('/w1/') ? subs : [{ state: 'RETURNED', assignedGrade: 5 }] } : c.path.endsWith('/courseWork') ? { courseWork: WORK } : {}));
  const res = await run('classroom_list_coursework', { course_id: '10', include_submission_overview: true, types: ['ASSIGNMENT', 'MULTIPLE_CHOICE_QUESTION'] });
  const byId = Object.fromEntries(res.coursework.map((w) => [w.id, w.submission_overview]));
  assert.deepEqual(byId.w1, { submissions: 3, by_state: { TURNED_IN: 2, CREATED: 1 }, late: 1, graded: 1 });
  assert.deepEqual(byId.w2, { your_submission: { state: 'RETURNED', late: false, grade: 5 } });
});

test('get_coursework: each id as coursework, then as a material; not found apart; at most 50 ids', async () => {
  reset((c) => {
    if (c.path === '/v1/courses/10/courseWork/w1') return { ...WORK[0], description: 'Write 500 words', materials: [{ driveFile: { driveFile: { id: 'f1', title: 'Template', alternateLink: 'https://drive/f1' }, shareMode: 'STUDENT_COPY' } }], assigneeMode: 'INDIVIDUAL_STUDENTS', individualStudentsOptions: { studentIds: ['s1'] } };
    if (c.path === '/v1/courses/10/courseWorkMaterials/m1') return MATERIALS[0];
    throw httpError(404, 'Requested entity was not found.');
  });
  const res = await run('classroom_get_coursework', { course_id: '10', coursework_ids: ['w1', 'm1', 'zz', 'w1'] });
  assert.deepEqual(calls.map((c) => c.path), [
    '/v1/courses/10/courseWork/w1',
    '/v1/courses/10/courseWork/m1',
    '/v1/courses/10/courseWorkMaterials/m1',
    '/v1/courses/10/courseWork/zz',
    '/v1/courses/10/courseWorkMaterials/zz',
  ]);
  assert.equal(res.coursework[0].description, 'Write 500 words');
  assert.deepEqual(res.coursework[0].materials, [{ kind: 'drive_file', title: 'Template', id: 'f1', link: 'https://drive/f1', share_mode: 'STUDENT_COPY' }]);
  assert.deepEqual(res.coursework[0].assignees, { students: ['s1'] });
  assert.equal(res.coursework[1].type, 'MATERIAL');
  assert.deepEqual(res.not_found, ['zz']);
  const many = Array.from({ length: cls.CLASSROOM_BATCH_MAX + 1 }, (_, i) => `w${i}`);
  assert.equal(parse('classroom_get_coursework', { course_id: '10', coursework_ids: many.slice(0, cls.CLASSROOM_BATCH_MAX) }).success, true);
  assert.equal(parse('classroom_get_coursework', { course_id: '10', coursework_ids: many }).success, false);
});

// ---------------------------------------------------------------------------
// Roster, submissions, guardians

test('get_roster: teachers and students with names and emails, one token for both lists', async () => {
  reset((c) =>
    c.path.endsWith('/teachers')
      ? { teachers: [{ userId: 'u1', profile: { name: { fullName: 'Ms T' }, emailAddress: 't@school.edu' } }] }
      : { students: [{ userId: 's1', profile: { name: { fullName: 'Sam' } } }], nextPageToken: 'sn' },
  );
  const res = await run('classroom_get_roster', { course_id: '10' });
  assert.deepEqual(res.teachers, [{ user_id: 'u1', name: 'Ms T', email: 't@school.edu' }]);
  assert.deepEqual(res.students, [{ user_id: 's1', name: 'Sam' }]);
  assert.deepEqual(cls.unpackTokens(res.next_page_token), { a: null, b: 'sn' });
  assert.equal(res.people_link, 'https://classroom.google.com/r/10/sort-name');
  reset(() => ({ students: [] }));
  await run('classroom_get_roster', { course_id: '10', page_token: res.next_page_token });
  assert.deepEqual(calls.map((c) => [c.path, c.query.pageToken]), [['/v1/courses/10/students', 'sn']]);
});

test('list_submissions: names from the roster, grade percentage, student work on request; one request per named student', async () => {
  const sub = { id: 'sub1', userId: 's1', state: 'TURNED_IN', late: true, assignedGrade: 15, alternateLink: 'https://classroom/sub1', assignmentSubmission: { attachments: [{ link: { url: 'https://doc', title: 'My essay' } }] }, assignedRubricGrades: { c1: { criterionId: 'c1', levelId: 'l2', points: 2 } } };
  reset((c) => (c.path.endsWith('/studentSubmissions') ? { studentSubmissions: [sub], nextPageToken: 'n' } : c.path.endsWith('/students') ? { students: [{ userId: 's1', profile: { name: { fullName: 'Sam' } } }] } : { title: 'Essay', maxPoints: 20 }));
  const res = await run('classroom_list_submissions', { course_id: '10', coursework_id: 'w1', states: ['TURNED_IN'], late: true });
  assert.deepEqual(calls.map((c) => c.path), ['/v1/courses/10/courseWork/w1', '/v1/courses/10/courseWork/w1/studentSubmissions', '/v1/courses/10/students']);
  assert.deepEqual(calls[1].query, { states: 'TURNED_IN', pageSize: '10', late: 'LATE_ONLY' });
  assert.deepEqual(res.submissions, [{ id: 'sub1', student_id: 's1', student_name: 'Sam', state: 'TURNED_IN', late: true, grade: 15, grade_percentage: 75, link: 'https://classroom/sub1' }]);
  assert.equal(res.next_page_token, 'n');
  calls = [];
  const work = await run('classroom_list_submissions', { course_id: '10', coursework_id: 'w1', student_ids: ['s1', 's2'], late: false });
  assert.deepEqual(calls.filter((c) => c.path.endsWith('/studentSubmissions')).map((c) => [c.query.userId, c.query.late]), [['s1', 'NOT_LATE_ONLY'], ['s2', 'NOT_LATE_ONLY']]);
  assert.deepEqual(work.submissions[0].attachments, [{ kind: 'link', title: 'My essay', link: 'https://doc' }]);
  assert.deepEqual(work.submissions[0].rubric_grades, [{ criterion_id: 'c1', level_id: 'l2', points: 2 }]);
  reset((c) => {
    if (c.path.endsWith('/students')) throw httpError(403, 'insufficient');
    return c.path.endsWith('/studentSubmissions') ? { studentSubmissions: [sub] } : { maxPoints: 20 };
  });
  const noNames = await run('classroom_list_submissions', { course_id: '10', coursework_id: 'w1' });
  assert.equal(noNames.submissions[0].student_name, undefined);
  assert.match(noNames.note, /classroom\.rosters scope/);
});

test('get_guardians: one list per student; a student Google refuses has an empty list and the reason', async () => {
  reset((c) => {
    if (c.path.includes('/s2/')) throw httpError(403, 'The caller does not have permission');
    return { guardians: [{ guardianId: 'g1', guardianProfile: { name: { fullName: 'Pat' }, emailAddress: 'pat@example.com' } }] };
  });
  const res = await run('classroom_get_guardians', { student_ids: ['s1', 's2'] });
  assert.deepEqual(calls.map((c) => c.path), ['/v1/userProfiles/s1/guardians', '/v1/userProfiles/s2/guardians']);
  assert.deepEqual(res.students, [
    { student_id: 's1', guardians: [{ guardian_id: 'g1', name: 'Pat', email: 'pat@example.com' }] },
    { student_id: 's2', guardians: [], note: 'The caller does not have permission' },
  ]);
  assert.equal(parse('classroom_get_guardians', { student_ids: Array.from({ length: 51 }, (_, i) => `s${i}`) }).success, false);
});

// ---------------------------------------------------------------------------
// Announcements and rubrics

test('announcements: summaries cut at 300 characters with their links; get reads each id, not found apart', async () => {
  const long = 'n'.repeat(cls.ANNOUNCEMENT_SUMMARY_CHARS + 1);
  reset(() => ({ announcements: [{ id: 'a1', text: long, state: 'PUBLISHED', updateTime: '2026-10-05T00:00:00Z', materials: [{}, {}] }, { id: 'a2', text: 'Field trip', state: 'PUBLISHED' }] }));
  const list = await run('classroom_list_announcements', { course_id: '10', include_drafts: true });
  assert.deepEqual(calls[0].query, { announcementStates: ['PUBLISHED', 'DRAFT'], pageSize: '10', orderBy: 'updateTime desc' });
  assert.equal(list.announcements[0].text, `${long.slice(0, cls.ANNOUNCEMENT_SUMMARY_CHARS)}...`);
  assert.equal(list.announcements[0].text_truncated, true);
  assert.equal(list.announcements[0].materials, 2);
  assert.equal(list.announcements[0].link, 'https://classroom.google.com/c/10/p/a1');
  assert.equal(list.announcements[1].text_truncated, undefined);
  reset(() => ({ announcements: [{ id: 'a2', text: 'Field trip' }, { id: 'a3', text: 'Exam' }] }));
  assert.deepEqual((await run('classroom_list_announcements', { course_id: '10', text_contains: 'TRIP' })).announcements.map((a) => a.id), ['a2']);

  reset((c) => {
    if (c.path.endsWith('/a9')) throw httpError(404, 'not found');
    return { id: 'a1', text: long, state: 'PUBLISHED', materials: [{ youtubeVideo: { title: 'Intro', alternateLink: 'https://youtu.be/x' } }] };
  });
  const got = await run('classroom_get_announcements', { course_id: '10', announcement_ids: ['a1', 'a9'] });
  assert.equal(got.announcements[0].text, long, 'the full text');
  assert.deepEqual(got.announcements[0].materials, [{ kind: 'youtube', title: 'Intro', link: 'https://youtu.be/x' }]);
  assert.equal(got.announcements[0].assignees, 'all students');
  assert.deepEqual(got.not_found, ['a9']);
});

test('create_announcement: a draft by default; publish or a schedule; links and Drive files; assignees; refusals before any request', async () => {
  reset((c) => ({ id: 'a5', state: c.body.state, scheduledTime: c.body.scheduledTime }));
  const draft = await run('classroom_create_announcement', { course_id: '10', text: 'Bring goggles', links: ['https://example.com/lab'], drive_file_ids: ['f1'], assignee_ids: ['s1', 's1', 's2'] });
  assert.deepEqual(calls.map((c) => [c.method, c.path]), [['POST', '/v1/courses/10/announcements']]);
  assert.deepEqual(calls[0].body, {
    text: 'Bring goggles',
    state: 'DRAFT',
    materials: [{ link: { url: 'https://example.com/lab' } }, { driveFile: { driveFile: { id: 'f1' }, shareMode: 'VIEW' } }],
    assigneeMode: 'INDIVIDUAL_STUDENTS',
    individualStudentsOptions: { studentIds: ['s1', 's2'] },
  });
  assert.equal(draft.link, 'https://classroom.google.com/c/10');
  assert.match(draft.note, /A draft: students do not see it yet/);
  reset((c) => ({ id: 'a6', state: c.body.state, alternateLink: 'https://classroom.google.com/c/10/p/a6' }));
  const now = await run('classroom_create_announcement', { course_id: '10', text: 'Now', publish: true });
  assert.equal(calls[0].body.state, 'PUBLISHED');
  assert.equal(now.note, undefined);
  reset((c) => ({ id: 'a7', state: c.body.state, scheduledTime: c.body.scheduledTime }));
  await run('classroom_create_announcement', { course_id: '10', text: 'Later', scheduled_time: '2026-11-02T07:00:00Z' });
  assert.deepEqual([calls[0].body.state, calls[0].body.scheduledTime], ['DRAFT', '2026-11-02T07:00:00Z']);
  reset();
  await assert.rejects(run('classroom_create_announcement', { course_id: '10', text: 'x', publish: true, scheduled_time: '2026-11-02T07:00:00Z' }), /not both/);
  const links = Array.from({ length: cls.CLASSROOM_MATERIALS_MAX + 1 }, (_, i) => `https://example.com/${i}`);
  await assert.rejects(run('classroom_create_announcement', { course_id: '10', text: 'x', links }), /At most 20 materials/);
  assert.equal(calls.length, 0);
  assert.equal(parse('classroom_create_announcement', { course_id: '10', text: '   ' }).success, false);
});

test('rubrics: get returns the criteria or null; create checks the rules before the request and posts the criteria', async () => {
  reset(() => ({ rubrics: [{ id: 'r1', criteria: [{ id: 'c1', title: 'Clarity', levels: [{ id: 'l1', title: 'Good', points: 2 }] }] }] }));
  const got = await run('classroom_get_rubric', { course_id: '10', coursework_id: 'w1' });
  assert.equal(calls[0].path, '/v1/courses/10/courseWork/w1/rubrics');
  assert.deepEqual(got.rubric, { id: 'r1', criteria: [{ id: 'c1', title: 'Clarity', description: undefined, levels: [{ id: 'l1', title: 'Good', description: undefined, points: 2 }] }] });
  reset(() => ({}));
  assert.equal((await run('classroom_get_rubric', { course_id: '10', coursework_id: 'w2' })).rubric, null);

  reset(() => ({ id: 'r2', criteria: [{ id: 'c9', title: 'Clarity', levels: [{}, {}] }] }));
  const criteria = [{ title: 'Clarity', description: 'Is it clear?', levels: [{ title: 'Poor', points: 0 }, { title: 'Good', points: 2 }] }];
  const made = await run('classroom_create_rubric', { course_id: '10', coursework_id: 'w1', criteria });
  assert.deepEqual(calls.map((c) => [c.method, c.path, c.body]), [['POST', '/v1/courses/10/courseWork/w1/rubrics', { criteria }]]);
  assert.deepEqual(made, { id: 'r2', criteria: [{ id: 'c9', title: 'Clarity', levels: 2 }] });
  reset();
  await assert.rejects(run('classroom_create_rubric', { course_id: '10', coursework_id: 'w1', criteria: [{ title: 'A', levels: [{ points: 1 }, { points: 1 }] }] }), /distinct points/);
  assert.equal(calls.length, 0);
  const tooMany = Array.from({ length: cls.CLASSROOM_RUBRIC_CRITERIA_MAX + 1 }, (_, i) => ({ title: `c${i}`, levels: [{ title: 'x' }] }));
  assert.equal(parse('classroom_create_rubric', { course_id: '10', coursework_id: 'w1', criteria: tooMany }).success, false);
});
