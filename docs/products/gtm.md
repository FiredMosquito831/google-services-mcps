# Tag Manager (`gtm`)

Install with the simplest command: `npx google-services-mcps install --agent claude --plugin <id>` (see docs/TUTORIAL.md).

Google Tag Manager accounts, containers, workspaces, tags, triggers, variables, folders, templates, versions and environments. It edits a container's draft workspace and publishes versions. A published version goes live on the website. It has 118 tools, one of them hand-written.

## When to install it

- You audit or copy tags, triggers and variables in a container.
- You change a workspace draft and publish it.
- You check which container version is live.
- Wrong choice: you only want analytics data. Use `ganalytics`.

## Install and set up

```
claude plugin install gtm@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-client <client_secret.json>
node <plugin>/bin/gsm.mjs login business --profile readonly
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gtm`).

1. In a Google Cloud project, enable the Tag Manager API. The application must be registered in the Google API Console to receive any quota.
2. Set up the OAuth consent screen. Use Internal for a Workspace domain. Create an OAuth client ID of type Desktop app and download the JSON file.
3. Run `setup-client`, then `login business`. Restart the MCP server (`/mcp`) after login.

Start with `--profile readonly`. Changes need a `readwrite` login and the plugin option `allow_writes`. The `business` login is shared with the other business products.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Read | list and get for accounts, containers, workspaces, tags, triggers, variables, templates, folders, clients, zones | read | Inspect a container |
| Live version | `tagmgr_accounts_containers_versions_live` | read | Read which version is live |
| Draft edits | create and update for tags, triggers, variables, folders, templates, clients, transformations, zones, gtag configs | write | Change the workspace draft |
| Publish | `gtm_publish_version` (hand-written) | destructive | Publish a version, with an approval that names the container, the version and what it changes against what is live |
| Save a version | `tagmgr_accts_ctrs_ws_create_ver` | destructive | Save a workspace as a version; Google then deletes the workspace |
| Set latest / combine | set-latest-version, combine | write | Bookkeeping for workspace sync |
| Environments | environment reauthorize | write | Reauthorize an environment |
| Deletes | delete for tags, triggers, variables, folders, templates and others | destructive | Remove workspace items |
| Per-method (106) | | mixed | Tag Manager API v2: generated tools, including the publish and save-as-version tools the list above replaces in the `google` toolset |
| Gateway (1 API) | `api_search`, `api_describe`, `api_call` | read, read, dynamic | Tag Manager API v1 (49 methods) |

The full list is in `docs/capabilities/gtm.md`.

Google has no official MCP server for Tag Manager. With the plugin option `toolset: google`, the server lists a small set chosen here: accounts, containers (list, and `tagmgr_accounts_containers_lookup` for the container behind a GTM-XXXX id), workspaces (list, get and status), tags, triggers and variables (list and get), the live version, one version by id, the version headers, saving a version and publishing it, plus `health` and the sign-in tools: 17 tools. Publishing there is the hand-written `gtm_publish_version`, which reads the container, the version and what is live before it asks, and says what changes; the generated publish tool stays in `all` and `curated`. A `readonly` login with that toolset asks for `tagmanager.readonly`; a `readwrite` login (since 1.25.0) for `tagmanager.readonly`, `tagmanager.publish` and `tagmanager.edit.containerversions`.

## Example requests

- "List the tags in container GTM-ABC123 that fire on every page view." Claude lists tags and triggers. No prompt.
- "Create a GA4 configuration tag with measurement ID G-XYZ in the draft." Claude creates the tag in the workspace. It asks first. The draft is not live yet.
- "Publish version 12 to the live site." Claude runs `gtm_publish_version` with the container path and version 12. The approval names the container and its GTM id, the version and its notes, the tags, triggers and variables added, changed or removed against what is live now, and any Custom HTML it would put on the page. It asks twice, and then the version goes live.
- "Delete the unused trigger Old click." Claude runs the trigger delete tool. It asks twice.

## Safety

- Draft edits do not reach visitors until a version is published.
- Publishing goes live on the website. Since 1.26.3 it is destructive, so Claude asks twice, and since 2.14.0 `gtm_publish_version` shows what the version changes before it does: the approval is built from reads of the container, the version and the live version (prepare), and the publish sends the fingerprint of the version it read, so a version changed in between is refused by Google instead of published unread.
- Setting the latest version does not change what is live: it sets the version Google compares a workspace against when it detects changes (Discovery: "Sets the latest version used for synchronization of workspaces when detecting conflicts and errors").
- Deletes ask twice, and since 1.26.3 so do publishing, saving a workspace as a version (Google deletes the workspace) and granting or changing user permissions.
- The `confirmation` option defaults to `every-change`. Change it with `printf '%s' '{"confirmation":"destructive-only"}' | claude plugin configure gtm@google-services-mcps --values-stdin` (JSON on stdin), or `/plugin configure gtm@google-services-mcps` in Claude Code.

## Costs and limits

The fee is UNVERIFIED. The project quota is 10,000 requests per day and 0.25 queries per second, enforced as 25 requests per 100 seconds. Over quota, the API returns HTTP 403. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/ads-business-youtube-play.md`, section 5.

## Caveats

- At 0.25 queries per second, a large sync takes a long time. Cache container metadata within a session.
- Per-method costs are UNVERIFIED. The page does not list them.
- Container, tag, trigger and version size or count limits are UNVERIFIED.
- The gateway reaches the older Tag Manager API v1, and 2.14.0 did not check whether Google still serves it: the API's v1 reference pages answered 404 on 2026-10-30, and data/discovery holds only v2. Check a method with `api_describe` before relying on it.
