# Google Classroom (`gclassroom`)

Google Classroom courses, coursework, submissions, students and teachers.

- Plugin: `gclassroom`, MCP server: `gclassroom`, login: Desktop OAuth client, then `login workspace-user`
- Install: `claude plugin install gclassroom@google-services-mcps`
- Tools: 128 total. Curated 23, per-method 104, gateway 0. Read 58, write 52, destructive 18, dynamic 0.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 128, google 29, curated 23 tools, each with the 9 runtime tools of the map counted. "(all)" means the product has no such toolset yet, so it lists every tool.

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
| `classroom_cour_cour_list_1590` | `list_course_work_summaries` | Generated from courseWorkMaterials.list. Kept so a readonly login of this toolset asks for classroom.courseworkmaterials.readonly, which classroom_list_coursework needs for the materials (one tool can declare only one any-of scope list). |
| `classroom_cour_cour_crea_e311` | `create_course_work` | Generated from courseWork.create (assignments and questions): a raw CourseWork body. Classroom makes it a DRAFT unless state is set. Not curated in this release. |
| `classroom_cour_cour_crea_3302` | `create_course_work` | Generated from courseWorkMaterials.create (materials): a raw CourseWorkMaterial body. Classroom makes it a DRAFT unless state is set. |
| `classroom_cour_cour_patc_dea2` | `update_course_work` | Generated from courseWork.patch: updateMask names the fields to change. |
| `classroom_cours_course_modify` | `update_course_work` | Generated from courseWork.modifyAssignees: adds or removes the students of a coursework item. |
| `classroom_cour_cour_patc_480d` | `update_course_work` | Generated from courseWorkMaterials.patch: updateMask names the fields to change. |
| `classroom_list_submissions` | `list_course_work_submissions` |  |
| `classroom_get_rubric` | `get_course_work_rubric` |  |
| `classroom_create_rubric` | `create_course_work_rubric` | Google's learningGoalId comes from search_course_standards, which has no public REST method (no learning-standards method in Classroom v1 Discovery), so no tool here matches search_course_standards. Google takes rubrics only for coursework of the same Cloud project. |
| `classroom_get_roster` | `get_course_roster` |  |
| `classroom_list_announcements` | `list_announcement_summaries` |  |
| `classroom_get_announcements` | `get_announcements` |  |
| `classroom_create_announcement` | `create_announcement` |  |
| `classroom_get_guardians` | `get_guardian_info` |  |

## Curated tools (23)

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

## Per-method tools (104)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `classroom_cou_cou_add_cr_a08b` | write | classroom.courses.courseWork.addOnAttachments.create | classroom.addons.teacher |
| `classroom_cou_cou_add_cr_e443` | write | classroom.courses.courseWorkMaterials.addOnAttachments.create | classroom.addons.teacher |
| `classroom_cou_cou_add_de_2e22` | destructive | classroom.courses.courseWorkMaterials.addOnAttachments.delete | classroom.addons.teacher |
| `classroom_cou_cou_add_de_d490` | destructive | classroom.courses.courseWork.addOnAttachments.delete | classroom.addons.teacher |
| `classroom_cou_cou_add_ge_0da6` | read | classroom.courses.courseWork.addOnAttachments.get | classroom.addons.student, classroom.addons.teacher |
| `classroom_cou_cou_add_ge_d005` | read | classroom.courses.courseWorkMaterials.addOnAttachments.get | classroom.addons.student, classroom.addons.teacher |
| `classroom_cou_cou_add_li_1406` | read | classroom.courses.courseWork.addOnAttachments.list | classroom.addons.student, classroom.addons.teacher |
| `classroom_cou_cou_add_li_51f4` | read | classroom.courses.courseWorkMaterials.addOnAttachments.list | classroom.addons.student, classroom.addons.teacher |
| `classroom_cou_cou_add_pa_3930` | write | classroom.courses.courseWorkMaterials.addOnAttachments.patch | classroom.addons.teacher |
| `classroom_cou_cou_add_pa_e09c` | write | classroom.courses.courseWork.addOnAttachments.patch | classroom.addons.teacher |
| `classroom_cou_cou_add_stu_get` | read | classroom.courses.courseWork.addOnAttachments.studentSubmissions.get | classroom.addons.student, classroom.addons.teacher |
| `classroom_cou_cou_add_stu_pat` | write | classroom.courses.courseWork.addOnAttachments.studentSubmissions.patch | classroom.addons.teacher |
| `classroom_cou_pos_add_stu_get` | read | classroom.courses.posts.addOnAttachments.studentSubmissions.get | classroom.addons.student, classroom.addons.teacher |
| `classroom_cou_pos_add_stu_pat` | write | classroom.courses.posts.addOnAttachments.studentSubmissions.patch | classroom.addons.teacher |
| `classroom_cour_anno_add_creat` | write | classroom.courses.announcements.addOnAttachments.create | classroom.addons.teacher |
| `classroom_cour_anno_add_delet` | destructive | classroom.courses.announcements.addOnAttachments.delete | classroom.addons.teacher |
| `classroom_cour_anno_add_list` | read | classroom.courses.announcements.addOnAttachments.list | classroom.addons.student, classroom.addons.teacher |
| `classroom_cour_anno_add_o_get` | read | classroom.courses.announcements.addOnAttachments.get | classroom.addons.student, classroom.addons.teacher |
| `classroom_cour_anno_add_patch` | write | classroom.courses.announcements.addOnAttachments.patch | classroom.addons.teacher |
| `classroom_cour_cour_crea_3302` | write | classroom.courses.courseWorkMaterials.create | classroom.courseworkmaterials |
| `classroom_cour_cour_crea_e311` | write | classroom.courses.courseWork.create | classroom.coursework.students |
| `classroom_cour_cour_dele_357c` | destructive | classroom.courses.courseWorkMaterials.delete | classroom.courseworkmaterials |
| `classroom_cour_cour_dele_a017` | destructive | classroom.courses.courseWork.delete | classroom.coursework.students |
| `classroom_cour_cour_get_33a3` | read | classroom.courses.courseWorkMaterials.getAddOnContext | classroom.addons.student, classroom.addons.teacher |
| `classroom_cour_cour_get_b5b8` | read | classroom.courses.courseWork.getAddOnContext | classroom.addons.student, classroom.addons.teacher |
| `classroom_cour_cour_list_1590` | read | classroom.courses.courseWorkMaterials.list | classroom.courseworkmaterials, classroom.courseworkmaterials.readonly |
| `classroom_cour_cour_list_2b20` | read | classroom.courses.courseWork.list | classroom.coursework.me, classroom.coursework.me.readonly |
| `classroom_cour_cour_patc_480d` | write | classroom.courses.courseWorkMaterials.patch | classroom.courseworkmaterials |
| `classroom_cour_cour_patc_dea2` | write | classroom.courses.courseWork.patch | classroom.coursework.students |
| `classroom_cour_cour_rubr_crea` | write | classroom.courses.courseWork.rubrics.create | classroom.coursework.students |
| `classroom_cour_cour_rubr_dele` | destructive | classroom.courses.courseWork.rubrics.delete | classroom.coursework.students |
| `classroom_cour_cour_rubr_list` | read | classroom.courses.courseWork.rubrics.list | classroom.coursework.me, classroom.coursework.me.readonly |
| `classroom_cour_cour_rubr_patc` | write | classroom.courses.courseWork.rubrics.patch | classroom.coursework.students |
| `classroom_cour_cour_rubri_get` | read | classroom.courses.courseWork.rubrics.get | classroom.coursework.me, classroom.coursework.me.readonly |
| `classroom_cour_cour_stud_list` | read | classroom.courses.courseWork.studentSubmissions.list | classroom.coursework.me, classroom.coursework.me.readonly |
| `classroom_cour_cour_stud_modi` | write | classroom.courses.courseWork.studentSubmissions.modifyAttachments | classroom.coursework.me, classroom.coursework.students |
| `classroom_cour_cour_stud_patc` | write | classroom.courses.courseWork.studentSubmissions.patch | classroom.coursework.me, classroom.coursework.students |
| `classroom_cour_cour_stud_recl` | write | classroom.courses.courseWork.studentSubmissions.reclaim | classroom.coursework.me |
| `classroom_cour_cour_stud_retu` | write | classroom.courses.courseWork.studentSubmissions.return | classroom.coursework.students |
| `classroom_cour_cour_stud_turn` | write | classroom.courses.courseWork.studentSubmissions.turnIn | classroom.coursework.me |
| `classroom_cour_cour_stude_get` | read | classroom.courses.courseWork.studentSubmissions.get | classroom.coursework.me, classroom.coursework.me.readonly |
| `classroom_cour_cours_get_17da` | read | classroom.courses.courseWorkMaterials.get | classroom.courseworkmaterials, classroom.courseworkmaterials.readonly |
| `classroom_cour_cours_get_22e5` | read | classroom.courses.courseWork.get | classroom.coursework.me, classroom.coursework.me.readonly |
| `classroom_cour_post_add_creat` | write | classroom.courses.posts.addOnAttachments.create | classroom.addons.teacher |
| `classroom_cour_post_add_delet` | destructive | classroom.courses.posts.addOnAttachments.delete | classroom.addons.teacher |
| `classroom_cour_post_add_list` | read | classroom.courses.posts.addOnAttachments.list | classroom.addons.student, classroom.addons.teacher |
| `classroom_cour_post_add_o_get` | read | classroom.courses.posts.addOnAttachments.get | classroom.addons.student, classroom.addons.teacher |
| `classroom_cour_post_add_patch` | write | classroom.courses.posts.addOnAttachments.patch | classroom.addons.teacher |
| `classroom_cour_stud_crea_3f02` | write | classroom.courses.students.create | classroom.profile.emails, classroom.profile.photos |
| `classroom_cour_stud_crea_8b4f` | write | classroom.courses.studentGroups.create | classroom.rosters |
| `classroom_cour_stud_dele_42c2` | destructive | classroom.courses.students.delete | classroom.rosters |
| `classroom_cour_stud_dele_e2fa` | destructive | classroom.courses.studentGroups.delete | classroom.rosters |
| `classroom_cour_stud_list_140b` | read | classroom.courses.students.list | classroom.profile.emails, classroom.profile.photos |
| `classroom_cour_stud_list_5754` | read | classroom.courses.studentGroups.list | classroom.rosters, classroom.rosters.readonly |
| `classroom_cour_stud_stud_crea` | write | classroom.courses.studentGroups.studentGroupMembers.create | classroom.rosters |
| `classroom_cour_stud_stud_dele` | destructive | classroom.courses.studentGroups.studentGroupMembers.delete | classroom.rosters |
| `classroom_cour_stud_stud_list` | read | classroom.courses.studentGroups.studentGroupMembers.list | classroom.rosters, classroom.rosters.readonly |
| `classroom_cours_aliase_create` | write | classroom.courses.aliases.create | classroom.courses |
| `classroom_cours_aliase_delete` | destructive | classroom.courses.aliases.delete | classroom.courses |
| `classroom_cours_announ_create` | write | classroom.courses.announcements.create | classroom.announcements |
| `classroom_cours_announ_delete` | destructive | classroom.courses.announcements.delete | classroom.announcements |
| `classroom_cours_announ_get_ad` | read | classroom.courses.announcements.getAddOnContext | classroom.addons.student, classroom.addons.teacher |
| `classroom_cours_announ_modify` | write | classroom.courses.announcements.modifyAssignees | classroom.announcements |
| `classroom_cours_course_modify` | write | classroom.courses.courseWork.modifyAssignees | classroom.coursework.students |
| `classroom_cours_course_update` | write | classroom.courses.courseWork.updateRubric | classroom.coursework.students |
| `classroom_cours_teache_create` | write | classroom.courses.teachers.create | classroom.profile.emails, classroom.profile.photos |
| `classroom_cours_teache_delete` | destructive | classroom.courses.teachers.delete | classroom.rosters |
| `classroom_cours_topics_create` | write | classroom.courses.topics.create | classroom.topics |
| `classroom_cours_topics_delete` | destructive | classroom.courses.topics.delete | classroom.topics |
| `classroom_course_aliases_list` | read | classroom.courses.aliases.list | classroom.courses, classroom.courses.readonly |
| `classroom_course_announ_patch` | write | classroom.courses.announcements.patch | classroom.announcements |
| `classroom_course_announc_list` | read | classroom.courses.announcements.list | classroom.announcements, classroom.announcements.readonly |
| `classroom_course_posts_get_ad` | read | classroom.courses.posts.getAddOnContext | classroom.addons.student, classroom.addons.teacher |
| `classroom_course_studen_patch` | write | classroom.courses.studentGroups.patch | classroom.rosters |
| `classroom_course_teacher_list` | read | classroom.courses.teachers.list | classroom.profile.emails, classroom.profile.photos |
| `classroom_course_topics_patch` | write | classroom.courses.topics.patch | classroom.topics |
| `classroom_courses_announc_get` | read | classroom.courses.announcements.get | classroom.announcements, classroom.announcements.readonly |
| `classroom_courses_create` | write | classroom.courses.create | classroom.courses |
| `classroom_courses_delete` | destructive | classroom.courses.delete | classroom.courses |
| `classroom_courses_get` | read | classroom.courses.get | classroom.courses, classroom.courses.readonly |
| `classroom_courses_get_grading` | read | classroom.courses.getGradingPeriodSettings | classroom.courses, classroom.courses.readonly |
| `classroom_courses_list` | read | classroom.courses.list | classroom.courses, classroom.courses.readonly |
| `classroom_courses_patch` | write | classroom.courses.patch | classroom.courses |
| `classroom_courses_student_get` | read | classroom.courses.students.get | classroom.profile.emails, classroom.profile.photos |
| `classroom_courses_teacher_get` | read | classroom.courses.teachers.get | classroom.profile.emails, classroom.profile.photos |
| `classroom_courses_topics_get` | read | classroom.courses.topics.get | classroom.topics, classroom.topics.readonly |
| `classroom_courses_topics_list` | read | classroom.courses.topics.list | classroom.topics, classroom.topics.readonly |
| `classroom_courses_update` | write | classroom.courses.update | classroom.courses |
| `classroom_courses_update_grad` | write | classroom.courses.updateGradingPeriodSettings | classroom.courses |
| `classroom_invitations_accept` | write | classroom.invitations.accept | classroom.rosters |
| `classroom_invitations_create` | write | classroom.invitations.create | classroom.rosters |
| `classroom_invitations_delete` | destructive | classroom.invitations.delete | classroom.rosters |
| `classroom_invitations_get` | read | classroom.invitations.get | classroom.rosters, classroom.rosters.readonly |
| `classroom_invitations_list` | read | classroom.invitations.list | classroom.rosters, classroom.rosters.readonly |
| `classroom_registration_create` | write | classroom.registrations.create | classroom.push-notifications |
| `classroom_registration_delete` | destructive | classroom.registrations.delete | classroom.push-notifications |
| `classroom_user_guar_list_8842` | read | classroom.userProfiles.guardians.list | classroom.guardianlinks.me.readonly, classroom.guardianlinks.students |
| `classroom_user_guar_list_bc1c` | read | classroom.userProfiles.guardianInvitations.list | classroom.guardianlinks.students, classroom.guardianlinks.students.readonly |
| `classroom_user_guard_get_8b7f` | read | classroom.userProfiles.guardians.get | classroom.guardianlinks.me.readonly, classroom.guardianlinks.students |
| `classroom_user_guard_get_ed3d` | read | classroom.userProfiles.guardianInvitations.get | classroom.guardianlinks.students, classroom.guardianlinks.students.readonly |
| `classroom_user_guardi_create` | write | classroom.userProfiles.guardianInvitations.create | classroom.guardianlinks.students |
| `classroom_user_guardi_delete` | destructive | classroom.userProfiles.guardians.delete | classroom.guardianlinks.students |
| `classroom_user_p_guardi_patch` | write | classroom.userProfiles.guardianInvitations.patch | classroom.guardianlinks.students |
| `classroom_user_profiles_get` | read | classroom.userProfiles.get | classroom.profile.emails, classroom.profile.photos |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gclassroom: API methods | (none) |

## Generated APIs

Each API links to Google's documentation for it, as Google's Discovery directory names it (`documentationLink`, kept in `data/catalog.json`). The link is the API's documentation home, not a page per method: the directory gives no link per method, and Google's REST reference pages are laid out differently from product to product.

- Google Classroom API (`classroom/v1`), 104 methods in the catalog. Documentation: <https://developers.google.com/workspace/classroom>

## Gateway APIs (reached through api_search, api_describe, api_call)

None.

