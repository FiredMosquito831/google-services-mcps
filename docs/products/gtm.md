# Tag Manager (`gtm`)

Google Tag Manager accounts, containers, workspaces, tags, triggers, variables, folders, templates, versions and environments. It edits a container's draft workspace and publishes versions. A published version goes live on the website. It has 110 tools.

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
| Publish | `tagmgr_accounts_containers_versions_publish`, and the set-latest-version tool | write | Publish a version or set the latest version |
| Environments | environment reauthorize | write | Reauthorize an environment |
| Deletes | delete for tags, triggers, variables, folders, templates and others | destructive | Remove workspace items |
| Per-method (106) | | mixed | Tag Manager API v2: 41 read, 53 write, 15 destructive tools |
| Gateway (1 API) | `api_search`, `api_describe`, `api_call` | read, read, dynamic | Tag Manager API v1 (49 methods) |

The full list is in `docs/capabilities/gtm.md`.

## Example requests

- "List the tags in container GTM-ABC123 that fire on every page view." Claude lists tags and triggers. No prompt.
- "Create a GA4 configuration tag with measurement ID G-XYZ in the draft." Claude creates the tag in the workspace. It asks first. The draft is not live yet.
- "Publish version 12 to the live site." Claude runs `tagmgr_accounts_containers_versions_publish`. It asks first, and the version goes live.
- "Delete the unused trigger Old click." Claude runs the trigger delete tool. It asks twice.

## Safety

- Draft edits do not reach visitors until a version is published.
- Publishing goes live on the website. The publish tool is classed write, not destructive, so Claude asks once. Read the approval text, and check the container and the version number before you approve.
- Setting the latest version also changes what is live.
- Deletes ask twice.
- The `confirmation` option defaults to `every-change`. Change it with `claude plugin configure gtm`.

## Costs and limits

The fee is UNVERIFIED. The project quota is 10,000 requests per day and 0.25 queries per second, enforced as 25 requests per 100 seconds. Over quota, the API returns HTTP 403. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/ads-business-youtube-play.md`, section 5.

## Caveats

- At 0.25 queries per second, a large sync takes a long time. Cache container metadata within a session.
- Per-method costs are UNVERIFIED. The page does not list them.
- Container, tag, trigger and version size or count limits are UNVERIFIED.
- The gateway reaches the older Tag Manager API v1. Check each method with `api_describe`.
