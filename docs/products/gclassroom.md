# Google Classroom (`gclassroom`)

Install with the simplest command: `node gsm.mjs install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Google Classroom courses, coursework and course materials, announcements, submissions, students, teachers, groups and rubrics. It reads and manages class work for the courses that the signed-in user can access. It has 105 tools and no gateway.

## When to install it

- You check coursework, due dates and submissions for a class you teach.
- You post announcements or coursework to a course.
- You manage the roster: students, teachers and student groups.
- Wrong choice: you need school-wide user administration. Use `gadmin`.

## Install and set up

```
claude plugin install gclassroom@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-client <client_secret.json>
node <plugin>/bin/gsm.mjs login workspace-user --profile readonly
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gclassroom`).

1. In a Google Cloud project, enable the Google Classroom API.
2. Set up the OAuth consent screen. Use Internal for a Workspace domain. Create an OAuth client ID of type Desktop app and download the JSON file.
3. Run `setup-client`, then `login workspace-user`. Restart the MCP server (`/mcp`) after login.

Start with `--profile readonly`. Changes need a `readwrite` login and the plugin option `allow_writes`. Which roles can call each method is UNVERIFIED. The account needs access to each course it works on.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Courses | list and get | read | List courses and read one |
| | create, update | write | Create or change a course |
| | delete | destructive | Delete a course |
| Coursework and materials | list and get | read | Read assignments and materials |
| | create, update | write | Post or change coursework and materials |
| | delete, add-on attachment delete | destructive | Delete coursework or its attachments |
| Submissions | list and get | read | Check who turned in what |
| | patch, return, reclaim, turn in, modify attachments | write | Grade, return or reclaim work, and turn in work for a student |
| Students and teachers | list and get | read | Read the roster |
| | create students, student groups and group members; create teachers | write | Add people to a course |
| | delete students, teachers, student groups | destructive | Remove people from a course |
| Announcements, rubrics, groups | list, get, create, update | read, write | Read and post announcements, rubrics and student groups |
| | delete | destructive | Delete announcements, rubrics and groups |
| Per-method (104) | | | Read 44, write 43, destructive 18 in total |
| Gateway | none | | No gateway tools. All methods are per-method tools. |

The full list is in `docs/capabilities/gclassroom.md`.

## Example requests

- "Which students have not turned in the Chapter 4 quiz?" Claude lists coursework and submissions. No prompt.
- "Post an announcement in Biology 101: the lab moved to room 12." Claude creates an announcement. It asks first.
- "Add Ms. Ortiz as a teacher in the Spanish course." Claude adds a teacher. It asks first.
- "Delete the old draft assignment." Claude runs a coursework delete. It asks twice.

## Safety

- Reads never ask. Writes ask first. Deletes ask twice.
- Announcements and coursework reach students when they are published. Check the course before you approve.
- Removing students, teachers or groups changes who can see the course.
- Student records are personal data. Keep results out of shared notes unless you need them there.
- The `confirmation` option defaults to `every-change`. Change it with `claude plugin configure gclassroom`.

## Costs and limits

Classroom is included with Google Workspace for Education, and the fee was not fetched (UNVERIFIED). It allows 1,200 queries per minute per user, 3,000 per minute per project and 4,000,000 per day. The limit is a 60-second moving average, so short bursts are allowed. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/workspace-cloud-search-ai.md`, section 9.

## Caveats

- Education-edition eligibility and scope classification are UNVERIFIED.
- Which roles can call which method is UNVERIFIED.
- Course, coursework and student count limits are not on the page (UNVERIFIED).
- There are no hand-written tools. Every operation is a per-method tool, so check the exact method in `docs/capabilities/gclassroom.md`.
