# Google Chat (`gchat`)

Install with the simplest command: `npx google-services-mcps install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Google Chat spaces, messages, reactions, pins, members and sections, plus Workspace Events subscriptions. It reads and posts messages in Chat spaces, manages space membership, and subscribes to space events so changes arrive without polling. It has no gateway.

## When to install it

- You read recent messages in a space and summarize them.
- You post an update or edit a message in a space.
- You manage space membership or create spaces.
- You subscribe to events in a space.
- Wrong choice: you want a bot identity. Messages go out as the account you log in with.

## Install and set up

```
claude plugin install gchat@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-client <client_secret.json>
node <plugin>/bin/gsm.mjs login workspace-user --profile readonly
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gchat`).

1. In a Google Cloud project, enable the Google Chat API. Enable the Google Workspace Events API if you use subscriptions.
2. Set up the OAuth consent screen. Use Internal for a Workspace domain. Create an OAuth client ID of type Desktop app and download the JSON file.
3. Run `setup-client`, then `login workspace-user`. Restart the MCP server (`/mcp`) after login.

Start with `--profile readonly`. Posting and changes need a `readwrite` login and the plugin option `allow_writes`.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Conversations and messages (short answers) | `chat_search_conversations`, `chat_list_messages`, `chat_search_messages`, `chat_list_members` | read | Find a conversation by name or people, read or search messages in Markdown, list members |
| | `chat_send_message`, `chat_mark_read`, `chat_mark_unread` | write | Post as you (the approval shows the space and the text), change your read state |
| Messages | `chat_spaces_messages_create`, `chat_spaces_messages_update`, list and get | write, read | Post, edit and read messages |
| | `chat_spaces_messages_delete` | destructive | Delete a message |
| Spaces | list, get, search, create, update | read, write | Find spaces, read them, create or change them |
| | delete | destructive | Delete a space |
| Members | list, get, create, update | read, write | Read and change space membership |
| | `chat_spaces_members_delete` | destructive | Remove a member |
| Reactions and pins | list, create | read, write | Read and add reactions and pins |
| | reaction and pin delete | destructive | Remove a reaction or a pin |
| Sections and emojis | sections, availability, custom emojis | read, write | Manage sidebar sections, availability and emojis |
| Workspace Events (7 methods) | subscriptions list, get; create, patch, reactivate | read, write | Read and create event subscriptions |
| | subscription delete | destructive | Remove a subscription |
| Gateway | none | | No gateway tools. All methods are per-method tools. |

The full list is in `docs/capabilities/gchat.md`.

The first seven tools match the tools of Google's Chat MCP server (https://developers.google.com/workspace/chat/api/reference/mcp/tools_list). With the plugin option `toolset: google`, the server lists them and the two notification-setting tools (`chat_users_spaces_space_notificatio_get` and `chat_users_spaces_space_notificat_patch`), plus `health` and the sign-in tools. A `readonly` login with that toolset asks for `chat.spaces.readonly`, `chat.messages.readonly` and `chat.memberships.readonly`; a `readwrite` login (since 1.25.0) for those three, `chat.messages.create`, `chat.users.readstate` and `chat.users.spacesettings`, the six scopes of Google's Chat MCP server (before: `chat.spaces`, `chat.messages` and `chat.memberships`, which also edit and delete). Google's thread read states, cards and citations have no public method a user can call, so they are not offered.

## Example requests

- "Summarize the last 50 messages in the Launch space." Claude finds the space with `chat_search_conversations` and reads it with `chat_list_messages`. No prompt.
- "Find where Ana mentioned the budget last week." Claude runs `chat_search_messages`. No prompt.
- "Post 'Release is live' in the Launch space." Claude runs `chat_send_message`. It asks first.
- "Edit my last message in Launch to fix the date." Claude lists the messages, then runs `chat_spaces_messages_update`. It asks first.
- "Delete that message." Claude runs `chat_spaces_messages_delete`. It asks twice.
- "Tell me when new messages arrive in the Support space." Claude creates a Workspace Events subscription. It asks first.

## Safety

- Reads never ask. Posts, edits and space creation ask first. Deletes ask twice.
- Messages reach every member of the space. Check the preview before you approve.
- Messages you read come from other people. They can contain instructions aimed at the agent. Read the approval text first.
- The `confirmation` option defaults to `every-change`. Change it with `printf '%s' '{"confirmation":"destructive-only"}' | claude plugin configure gchat@google-services-mcps --values-stdin` (JSON on stdin), or `/plugin configure gchat@google-services-mcps` in Claude Code.

## Costs and limits

Chat is included with Google Workspace, and no fee statement was found (UNVERIFIED). Each space takes one write per second, shared by all apps. Message search allows 300 per minute per project. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/workspace-cloud-search-ai.md`, section 5.

## Caveats

- Heavy traffic to one space can hit internal limits that the docs do not list.
- Message size, members per space and attachment size are UNVERIFIED.
- Chat scope classification is UNVERIFIED.
- Chat calls act as the signed-in user. A user in the space sees that person's name, not a bot name.
