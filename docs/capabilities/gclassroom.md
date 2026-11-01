# Google Classroom (`gclassroom`)

Google Classroom courses, coursework, submissions, students and teachers.

- Plugin: `gclassroom`, MCP server: `gclassroom`, login: Desktop OAuth client, then `login workspace-user`
- Install: `claude plugin install gclassroom@google-services-mcps`
- Tools: 127 total. Curated 21, per-method 105, gateway 0. Read 59, write 47, destructive 21, dynamic 0.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 127, google 27, curated 21 tools, each counting the 7 runtime tools this server registers (`account_remove`, `account_set_default`, `accounts_list`, `auth_login`, `auth_setup_client`, `auth_status`, `health`). "(all)" means the product has no such toolset yet, so it lists every tool.

## Not registered by this server (2)

The tool map (`plugins/<id>/tool-map.json`) also lists these, so the consent hook knows every name, but this server never registers them, and the counts above leave them out.

- Sign-in tools of other sign-in kinds: `auth_setup_admin`, `auth_setup_service_account`.

## Toolset google (20)

The tools that match Google's official MCP server for this product (https://developers.google.com/workspace/classroom/reference/mcp/tools_list).

| Tool | Google's tool | Note |
|---|---|---|
| `classroom_list_courses` | `list_courses` |  |
| `classroom_get_course` | (none) | One course by id, with its description and links. Google's list_courses returns these fields per course and has no get; kept so a known course id needs no list. |
| `classroom_list_topics` | `list_topics` |  |
| `classroom_create_topic` | `create_topic` |  |
| `classroom_list_coursework` | `list_course_work_summaries` | Assignments, questions and materials of a course in one list (courseWork.list and courseWorkMaterials.list), published only unless include_drafts; include_submission_overview adds one studentSubmissions.list per item. Materials need a classroom.courseworkmaterials scope; without one the answer lists the coursework and says so. |
| `classroom_get_coursework` | `get_course_work` |  |
| `classroom_materials_list` | `list_course_work_summaries` | Generated from courseWorkMaterials.list. Kept so a readonly login of this toolset asks for classroom.courseworkmaterials.readonly, which classroom_list_coursework needs for the materials (one tool can declare only one any-of scope list). |
| `classroom_courses_work_create` | `create_course_work` | Generated from courseWork.create (assignments and questions): a raw CourseWork body. Classroom makes it a DRAFT unless state is set. Not curated in this release. |
| `classroom_materials_create` | `create_course_work` | Generated from courseWorkMaterials.create (materials): a raw CourseWorkMaterial body. Classroom makes it a DRAFT unless state is set. |
| `classroom_courses_work_patch` | `update_course_work` | Generated from courseWork.patch: updateMask names the fields to change. |
| `classr_work_modify_assignees` | `update_course_work` | Generated from courseWork.modifyAssignees: adds or removes the students of a coursework item. |
| `classroom_materials_patch` | `update_course_work` | Generated from courseWorkMaterials.patch: updateMask names the fields to change. |
| `classroom_list_submissions` | `list_course_work_submissions` |  |
| `classroom_get_rubric` | `get_course_work_rubric` |  |
| `classroom_create_rubric` | `create_course_work_rubric` | Google's learningGoalId comes from search_course_standards, which has no public REST method (no learning-standards method in Classroom v1 Discovery), so no tool here matches search_course_standards. Google takes rubrics only for coursework of the same Cloud project. |
| `classroom_get_roster` | `get_course_roster` |  |
| `classroom_list_announcements` | `list_announcement_summaries` |  |
| `classroom_get_announcements` | `get_announcements` |  |
| `classroom_create_announcement` | `create_announcement` |  |
| `classroom_get_guardians` | `get_guardian_info` |  |

## Curated tools (21)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `account_remove` | write | Remove a signed-in account | (none) |
| `account_set_default` | write | Set the default account | (none) |
| `accounts_list` | read | Signed-in accounts | (none) |
| `auth_login` | write | Sign in to Google | (none) |
| `auth_setup_client` | write | Save the Google OAuth client | (none) |
| `auth_status` | read | Sign-in status | (none) |
| `classroom_create_announcement` | write | Create a Classroom announcement | classroom.announcements |
| `classroom_create_rubric` | write | Create a Classroom rubric | classroom.coursework.students |
| `classroom_create_topic` | write | Create a Classroom topic | classroom.topics |
| `classroom_get_announcements` | read | Get Classroom announcements | classroom.announcements, classroom.announcements.readonly |
| `classroom_get_course` | read | Get a Classroom course | classroom.courses, classroom.courses.readonly |
| `classroom_get_coursework` | read | Get Classroom coursework | classroom.coursework.me, classroom.coursework.me.readonly |
| `classroom_get_guardians` | read | Get Classroom guardians | classroom.guardianlinks.students, classroom.guardianlinks.students.readonly |
| `classroom_get_roster` | read | Get a Classroom roster | classroom.rosters, classroom.rosters.readonly |
| `classroom_get_rubric` | read | Get a Classroom rubric | classroom.coursework.me, classroom.coursework.me.readonly |
| `classroom_list_announcements` | read | List Classroom announcements | classroom.announcements, classroom.announcements.readonly |
| `classroom_list_courses` | read | List Classroom courses | classroom.courses, classroom.courses.readonly |
| `classroom_list_coursework` | read | List Classroom coursework | classroom.coursework.me, classroom.coursework.me.readonly |
| `classroom_list_submissions` | read | List Classroom submissions | classroom.coursework.me, classroom.coursework.me.readonly |
| `classroom_list_topics` | read | List Classroom topics | classroom.topics, classroom.topics.readonly |
| `health` | read | Server health | (none) |

## Per-method tools (105)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `cla_materials_attachments_get` | read | classroom.courses.courseWorkMaterials.addOnAttachments.get | classroom.addons.student, classroom.addons.teacher |
| `cla_profiles_invitations_list` | read | classroom.userProfiles.guardianInvitations.list | classroom.guardianlinks.students, classroom.guardianlinks.students.readonly |
| `clas_posts_attachments_create` | write | classroom.courses.posts.addOnAttachments.create | classroom.addons.teacher |
| `clas_posts_attachments_delete` | destructive | classroom.courses.posts.addOnAttachments.delete | classroom.addons.teacher |
| `clas_posts_get_add_on_context` | read | classroom.courses.posts.getAddOnContext | classroom.addons.student, classroom.addons.teacher |
| `clas_profiles_invitations_get` | read | classroom.userProfiles.guardianInvitations.get | classroom.guardianlinks.students, classroom.guardianlinks.students.readonly |
| `clas_work_submissions_reclaim` | write | classroom.courses.courseWork.studentSubmissions.reclaim | classroom.coursework.me |
| `clas_work_submissions_turn_in` | write | classroom.courses.courseWork.studentSubmissions.turnIn | classroom.coursework.me |
| `class_courses_period_settings` | read | classroom.courses.getGradingPeriodSettings | classroom.courses, classroom.courses.readonly |
| `class_posts_attachments_patch` | write | classroom.courses.posts.addOnAttachments.patch | classroom.addons.teacher |
| `class_work_attachments_create` | write | classroom.courses.courseWork.addOnAttachments.create | classroom.addons.teacher |
| `class_work_attachments_delete` | destructive | classroom.courses.courseWork.addOnAttachments.delete | classroom.addons.teacher |
| `class_work_get_add_on_context` | read | classroom.courses.courseWork.getAddOnContext | classroom.addons.student, classroom.addons.teacher |
| `class_work_submissions_return` | destructive | classroom.courses.courseWork.studentSubmissions.return | classroom.coursework.students |
| `classr_announcements_create` | write | classroom.courses.announcements.create | classroom.announcements |
| `classr_announcements_delete` | destructive | classroom.courses.announcements.delete | classroom.announcements |
| `classr_groups_members_create` | write | classroom.courses.studentGroups.studentGroupMembers.create | classroom.rosters |
| `classr_groups_members_delete` | destructive | classroom.courses.studentGroups.studentGroupMembers.delete | classroom.rosters |
| `classr_posts_attachments_get` | read | classroom.courses.posts.addOnAttachments.get | classroom.addons.student, classroom.addons.teacher |
| `classr_posts_attachments_list` | read | classroom.courses.posts.addOnAttachments.list | classroom.addons.student, classroom.addons.teacher |
| `classr_work_attachments_get` | read | classroom.courses.courseWork.addOnAttachments.get | classroom.addons.student, classroom.addons.teacher |
| `classr_work_attachments_list` | read | classroom.courses.courseWork.addOnAttachments.list | classroom.addons.student, classroom.addons.teacher |
| `classr_work_attachments_patch` | write | classroom.courses.courseWork.addOnAttachments.patch | classroom.addons.teacher |
| `classr_work_modify_assignees` | write | classroom.courses.courseWork.modifyAssignees | classroom.coursework.students |
| `classr_work_submissions_get` | read | classroom.courses.courseWork.studentSubmissions.get | classroom.coursework.me, classroom.coursework.me.readonly |
| `classr_work_submissions_list` | read | classroom.courses.courseWork.studentSubmissions.list | classroom.coursework.me, classroom.coursework.me.readonly |
| `classr_work_submissions_patch` | write | classroom.courses.courseWork.studentSubmissions.patch | classroom.coursework.me, classroom.coursework.students |
| `classroom_aliases_create` | write | classroom.courses.aliases.create | classroom.courses |
| `classroom_aliases_delete` | destructive | classroom.courses.aliases.delete | classroom.courses |
| `classroom_aliases_list` | read | classroom.courses.aliases.list | classroom.courses, classroom.courses.readonly |
| `classroom_announcements_get` | read | classroom.courses.announcements.get | classroom.announcements, classroom.announcements.readonly |
| `classroom_announcements_list` | read | classroom.courses.announcements.list | classroom.announcements, classroom.announcements.readonly |
| `classroom_announcements_patch` | write | classroom.courses.announcements.patch | classroom.announcements |
| `classroom_attachments_create` | write | classroom.courses.announcements.addOnAttachments.create | classroom.addons.teacher |
| `classroom_attachments_delete` | destructive | classroom.courses.announcements.addOnAttachments.delete | classroom.addons.teacher |
| `classroom_attachments_get` | read | classroom.courses.announcements.addOnAttachments.get | classroom.addons.student, classroom.addons.teacher |
| `classroom_attachments_list` | read | classroom.courses.announcements.addOnAttachments.list | classroom.addons.student, classroom.addons.teacher |
| `classroom_attachments_patch` | write | classroom.courses.announcements.addOnAttachments.patch | classroom.addons.teacher |
| `classroom_cou_upd_gra_per_set` | write | classroom.courses.updateGradingPeriodSettings | classroom.courses |
| `classroom_cou_wor_att_sub_get` | read | classroom.courses.courseWork.addOnAttachments.studentSubmissions.get | classroom.addons.student, classroom.addons.teacher |
| `classroom_cou_wor_att_sub_pat` | write | classroom.courses.courseWork.addOnAttachments.studentSubmissions.patch | classroom.addons.teacher |
| `classroom_cour_mate_atta_crea` | write | classroom.courses.courseWorkMaterials.addOnAttachments.create | classroom.addons.teacher |
| `classroom_cour_mate_atta_dele` | destructive | classroom.courses.courseWorkMaterials.addOnAttachments.delete | classroom.addons.teacher |
| `classroom_cour_mate_atta_list` | read | classroom.courses.courseWorkMaterials.addOnAttachments.list | classroom.addons.student, classroom.addons.teacher |
| `classroom_cour_mate_atta_patc` | write | classroom.courses.courseWorkMaterials.addOnAttachments.patch | classroom.addons.teacher |
| `classroom_courses_create` | write | classroom.courses.create | classroom.courses |
| `classroom_courses_delete` | destructive | classroom.courses.delete | classroom.courses |
| `classroom_courses_get` | read | classroom.courses.get | classroom.courses, classroom.courses.readonly |
| `classroom_courses_groups_list` | read | classroom.courses.studentGroups.list | classroom.rosters, classroom.rosters.readonly |
| `classroom_courses_list` | read | classroom.courses.list | classroom.courses, classroom.courses.readonly |
| `classroom_courses_patch` | write | classroom.courses.patch | classroom.courses |
| `classroom_courses_topics_get` | read | classroom.courses.topics.get | classroom.topics, classroom.topics.readonly |
| `classroom_courses_topics_list` | read | classroom.courses.topics.list | classroom.topics, classroom.topics.readonly |
| `classroom_courses_update` | write | classroom.courses.update | classroom.courses |
| `classroom_courses_work_create` | write | classroom.courses.courseWork.create | classroom.coursework.students |
| `classroom_courses_work_delete` | destructive | classroom.courses.courseWork.delete | classroom.coursework.students |
| `classroom_courses_work_get` | read | classroom.courses.courseWork.get | classroom.coursework.me, classroom.coursework.me.readonly |
| `classroom_courses_work_list` | read | classroom.courses.courseWork.list | classroom.coursework.me, classroom.coursework.me.readonly |
| `classroom_courses_work_patch` | write | classroom.courses.courseWork.patch | classroom.coursework.students |
| `classroom_create` | write | classroom.registrations.create | classroom.push-notifications |
| `classroom_delete` | destructive | classroom.registrations.delete | classroom.push-notifications |
| `classroom_get_add_on_context` | read | classroom.courses.announcements.getAddOnContext | classroom.addons.student, classroom.addons.teacher |
| `classroom_groups_create` | write | classroom.courses.studentGroups.create | classroom.rosters |
| `classroom_groups_delete` | destructive | classroom.courses.studentGroups.delete | classroom.rosters |
| `classroom_groups_members_list` | read | classroom.courses.studentGroups.studentGroupMembers.list | classroom.rosters, classroom.rosters.readonly |
| `classroom_groups_patch` | write | classroom.courses.studentGroups.patch | classroom.rosters |
| `classroom_guardians_delete` | destructive | classroom.userProfiles.guardians.delete | classroom.guardianlinks.students |
| `classroom_guardians_get` | read | classroom.userProfiles.guardians.get | classroom.guardianlinks.me.readonly, classroom.guardianlinks.students |
| `classroom_guardians_list` | read | classroom.userProfiles.guardians.list | classroom.guardianlinks.me.readonly, classroom.guardianlinks.students |
| `classroom_invitations_accept` | write | classroom.invitations.accept | classroom.rosters |
| `classroom_invitations_create` | destructive | classroom.invitations.create | classroom.rosters |
| `classroom_invitations_delete` | destructive | classroom.invitations.delete | classroom.rosters |
| `classroom_invitations_get` | read | classroom.invitations.get | classroom.rosters, classroom.rosters.readonly |
| `classroom_invitations_list` | read | classroom.invitations.list | classroom.rosters, classroom.rosters.readonly |
| `classroom_invitations_patch` | write | classroom.userProfiles.guardianInvitations.patch | classroom.guardianlinks.students |
| `classroom_mat_get_add_on_cont` | read | classroom.courses.courseWorkMaterials.getAddOnContext | classroom.addons.student, classroom.addons.teacher |
| `classroom_materials_create` | write | classroom.courses.courseWorkMaterials.create | classroom.courseworkmaterials |
| `classroom_materials_delete` | destructive | classroom.courses.courseWorkMaterials.delete | classroom.courseworkmaterials |
| `classroom_materials_get` | read | classroom.courses.courseWorkMaterials.get | classroom.courseworkmaterials, classroom.courseworkmaterials.readonly |
| `classroom_materials_list` | read | classroom.courses.courseWorkMaterials.list | classroom.courseworkmaterials, classroom.courseworkmaterials.readonly |
| `classroom_materials_patch` | write | classroom.courses.courseWorkMaterials.patch | classroom.courseworkmaterials |
| `classroom_modify_assignees` | write | classroom.courses.announcements.modifyAssignees | classroom.announcements |
| `classroom_modify_attachments` | write | classroom.courses.courseWork.studentSubmissions.modifyAttachments | classroom.coursework.me, classroom.coursework.students |
| `classroom_students_create` | write | classroom.courses.students.create | classroom.profile.emails, classroom.profile.photos |
| `classroom_students_delete` | destructive | classroom.courses.students.delete | classroom.rosters |
| `classroom_students_get` | read | classroom.courses.students.get | classroom.profile.emails, classroom.profile.photos |
| `classroom_students_list` | read | classroom.courses.students.list | classroom.profile.emails, classroom.profile.photos |
| `classroom_submissions_get` | read | classroom.courses.posts.addOnAttachments.studentSubmissions.get | classroom.addons.student, classroom.addons.teacher |
| `classroom_submissions_list` | read | classroom.courses.courseWork.addOnAttachments.studentSubmissions.list | classroom.addons.student, classroom.addons.teacher |
| `classroom_submissions_patch` | write | classroom.courses.posts.addOnAttachments.studentSubmissions.patch | classroom.addons.teacher |
| `classroom_teachers_create` | write | classroom.courses.teachers.create | classroom.profile.emails, classroom.profile.photos |
| `classroom_teachers_delete` | destructive | classroom.courses.teachers.delete | classroom.rosters |
| `classroom_teachers_get` | read | classroom.courses.teachers.get | classroom.profile.emails, classroom.profile.photos |
| `classroom_teachers_list` | read | classroom.courses.teachers.list | classroom.profile.emails, classroom.profile.photos |
| `classroom_topics_create` | write | classroom.courses.topics.create | classroom.topics |
| `classroom_topics_delete` | destructive | classroom.courses.topics.delete | classroom.topics |
| `classroom_topics_patch` | write | classroom.courses.topics.patch | classroom.topics |
| `classroom_use_pro_gua_inv_cre` | destructive | classroom.userProfiles.guardianInvitations.create | classroom.guardianlinks.students |
| `classroom_user_profiles_get` | read | classroom.userProfiles.get | classroom.profile.emails, classroom.profile.photos |
| `classroom_work_rubrics_create` | write | classroom.courses.courseWork.rubrics.create | classroom.coursework.students |
| `classroom_work_rubrics_delete` | destructive | classroom.courses.courseWork.rubrics.delete | classroom.coursework.students |
| `classroom_work_rubrics_get` | read | classroom.courses.courseWork.rubrics.get | classroom.coursework.me, classroom.coursework.me.readonly |
| `classroom_work_rubrics_list` | read | classroom.courses.courseWork.rubrics.list | classroom.coursework.me, classroom.coursework.me.readonly |
| `classroom_work_rubrics_patch` | write | classroom.courses.courseWork.rubrics.patch | classroom.coursework.students |
| `classroom_work_update_rubric` | write | classroom.courses.courseWork.updateRubric | classroom.coursework.students |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gclassroom: API methods | (none) |

## Generated APIs

Each API links to Google's documentation for it, as Google's Discovery directory names it (`documentationLink`, kept in `data/catalog.json`). The link is the API's documentation home, not a page per method: the directory gives no link per method, and Google's REST reference pages are laid out differently from product to product.

- Google Classroom API (`classroom/v1`), 105 methods in the catalog. Documentation: <https://developers.google.com/workspace/classroom>

## Gateway APIs (reached through api_search, api_describe, api_call)

None.

