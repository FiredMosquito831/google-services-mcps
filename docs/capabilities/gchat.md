# Google Chat (`gchat`)

Google Chat spaces, messages and members, plus Workspace Events subscriptions.

- Plugin: `gchat`, MCP server: `gchat`, login: Desktop OAuth client, then `login workspace-user`
- Install: `claude plugin install gchat@google-services-mcps`
- Tools: 70 total. Curated 9, per-method 60, gateway 0. Read 31, write 31, destructive 8, dynamic 0.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

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

## Per-method tools (60)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `chat_custom_emojis_create` | write | chat.customEmojis.create | chat.customemojis |
| `chat_custom_emojis_delete` | destructive | chat.customEmojis.delete | chat.customemojis |
| `chat_custom_emojis_get` | read | chat.customEmojis.get | chat.customemojis, chat.customemojis.readonly |
| `chat_custom_emojis_list` | read | chat.customEmojis.list | chat.customemojis, chat.customemojis.readonly |
| `chat_media_download` | read | chat.media.download | chat.bot, chat.messages |
| `chat_spaces_complete_import` | write | chat.spaces.completeImport | chat.import |
| `chat_spaces_create` | write | chat.spaces.create | chat.app.spaces, chat.app.spaces.create |
| `chat_spaces_delete` | destructive | chat.spaces.delete | chat.admin.delete, chat.app.delete |
| `chat_spaces_find_direct_message` | read | chat.spaces.findDirectMessage | chat.bot, chat.spaces |
| `chat_spaces_find_group_chats` | read | chat.spaces.findGroupChats | chat.memberships, chat.memberships.readonly |
| `chat_spaces_get` | read | chat.spaces.get | chat.admin.spaces, chat.admin.spaces.readonly |
| `chat_spaces_list` | read | chat.spaces.list | chat.bot, chat.spaces |
| `chat_spaces_members_create` | write | chat.spaces.members.create | chat.admin.memberships, chat.app.memberships |
| `chat_spaces_members_delete` | destructive | chat.spaces.members.delete | chat.admin.memberships, chat.app.memberships |
| `chat_spaces_members_get` | read | chat.spaces.members.get | chat.admin.memberships, chat.admin.memberships.readonly |
| `chat_spaces_members_list` | read | chat.spaces.members.list | chat.admin.memberships, chat.admin.memberships.readonly |
| `chat_spaces_members_patch` | write | chat.spaces.members.patch | chat.admin.memberships, chat.app.memberships |
| `chat_spaces_message_pins_create` | write | chat.spaces.messagePins.create | chat.spaces, chat.spaces.pins |
| `chat_spaces_message_pins_delete` | destructive | chat.spaces.messagePins.delete | chat.spaces, chat.spaces.pins |
| `chat_spaces_message_pins_list` | read | chat.spaces.messagePins.list | chat.spaces, chat.spaces.pins |
| `chat_spaces_messages_attachments_get` | read | chat.spaces.messages.attachments.get | chat.bot |
| `chat_spaces_messages_create` | write | chat.spaces.messages.create | chat.bot, chat.import |
| `chat_spaces_messages_delete` | destructive | chat.spaces.messages.delete | chat.bot, chat.import |
| `chat_spaces_messages_get` | read | chat.spaces.messages.get | chat.app.messages.readonly, chat.bot |
| `chat_spaces_messages_list` | read | chat.spaces.messages.list | chat.app.messages.readonly, chat.import |
| `chat_spaces_messages_patch` | write | chat.spaces.messages.patch | chat.bot, chat.import |
| `chat_spaces_messages_reactions_create` | write | chat.spaces.messages.reactions.create | chat.import, chat.messages |
| `chat_spaces_messages_reactions_delete` | destructive | chat.spaces.messages.reactions.delete | chat.import, chat.messages |
| `chat_spaces_messages_reactions_list` | read | chat.spaces.messages.reactions.list | chat.messages, chat.messages.reactions |
| `chat_spaces_messages_search` | read | chat.spaces.messages.search | chat.messages, chat.messages.readonly |
| `chat_spaces_messages_update` | write | chat.spaces.messages.update | chat.bot, chat.import |
| `chat_spaces_patch` | write | chat.spaces.patch | chat.admin.spaces, chat.app.spaces |
| `chat_spaces_search` | read | chat.spaces.search | chat.admin.spaces, chat.admin.spaces.readonly |
| `chat_spaces_setup` | write | chat.spaces.setup | chat.spaces, chat.spaces.create |
| `chat_spaces_space_events_get` | read | chat.spaces.spaceEvents.get | chat.app.all.memberships.readonly, chat.app.all.messages.readonly |
| `chat_spaces_space_events_list` | read | chat.spaces.spaceEvents.list | chat.app.all.memberships.readonly, chat.app.all.messages.readonly |
| `chat_users_availability_get` | read | chat.users.availability.get | chat.users.availability, chat.users.availability.readonly |
| `chat_users_availability_mark_as_active` | write | chat.users.availability.markAsActive | chat.users.availability |
| `chat_users_availability_mark_as_away` | write | chat.users.availability.markAsAway | chat.users.availability |
| `chat_users_availability_mark_as_do_not` | write | chat.users.availability.markAsDoNotDisturb | chat.users.availability |
| `chat_users_availability_patch` | write | chat.users.availability.patch | chat.users.availability |
| `chat_users_sections_create` | write | chat.users.sections.create | chat.users.sections |
| `chat_users_sections_delete` | destructive | chat.users.sections.delete | chat.users.sections |
| `chat_users_sections_items_list` | read | chat.users.sections.items.list | chat.users.sections, chat.users.sections.readonly |
| `chat_users_sections_items_move` | write | chat.users.sections.items.move | chat.users.sections |
| `chat_users_sections_list` | read | chat.users.sections.list | chat.users.sections, chat.users.sections.readonly |
| `chat_users_sections_patch` | write | chat.users.sections.patch | chat.users.sections |
| `chat_users_sections_position` | write | chat.users.sections.position | chat.users.sections |
| `chat_users_spaces_get_space_read_state` | read | chat.users.spaces.getSpaceReadState | chat.users.readstate, chat.users.readstate.readonly |
| `chat_users_spaces_space_notificat_patch` | write | chat.users.spaces.spaceNotificationSetting.patch | chat.users.spacesettings |
| `chat_users_spaces_space_notificatio_get` | read | chat.users.spaces.spaceNotificationSetting.get | chat.users.spacesettings |
| `chat_users_spaces_threads_get_thread_re` | read | chat.users.spaces.threads.getThreadReadState | chat.users.readstate, chat.users.readstate.readonly |
| `chat_users_spaces_update_space_read_sta` | write | chat.users.spaces.updateSpaceReadState | chat.users.readstate |
| `workspacee_operations_get` | read | workspaceevents.operations.get | chat.bot, chat.memberships |
| `workspacee_subscriptions_create` | write | workspaceevents.subscriptions.create | chat.app.all.memberships.readonly, chat.app.all.messages.readonly |
| `workspacee_subscriptions_delete` | destructive | workspaceevents.subscriptions.delete | chat.bot, chat.memberships |
| `workspacee_subscriptions_get` | read | workspaceevents.subscriptions.get | chat.bot, chat.memberships |
| `workspacee_subscriptions_list` | read | workspaceevents.subscriptions.list | chat.bot, chat.memberships |
| `workspacee_subscriptions_patch` | write | workspaceevents.subscriptions.patch | chat.app.all.memberships.readonly, chat.app.all.messages.readonly |
| `workspacee_subscriptions_reactivate` | write | workspaceevents.subscriptions.reactivate | chat.app.all.memberships.readonly, chat.app.all.messages.readonly |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gchat: API methods | (none) |

## Generated APIs

- Google Chat API (`chat/v1`), 54 methods in the catalog
- Google Workspace Events API (`workspaceevents/v1`), 7 methods in the catalog

## Gateway APIs (reached through api_search, api_describe, api_call)

None.

