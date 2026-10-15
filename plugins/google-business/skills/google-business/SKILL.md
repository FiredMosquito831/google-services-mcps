---
name: google-business
description: Work with Google business tools through the google-business plugin MCP server (gbiz): Google Analytics admin and data, Tag Manager, YouTube and YouTube Analytics, and Business Profile. Use for analytics reports, tag configuration, channel stats, and business listing management.
---

# Google Business via MCP

## Server in this plugin

`gbiz` exposes these Google APIs as generated tools:
- **Google Analytics:** `analyticsadmin` (properties, data streams, access) and `analyticsdata` (reports, realtime).
- **Tag Manager:** `tagmanager` (accounts, containers, workspaces, tags, triggers, variables, publishing).
- **YouTube:** `youtube` (channels, videos, playlists) and `youtubeAnalytics` (reports).
- **Business Profile:** `mybusinessaccountmanagement`, `mybusinessbusinessinformation`, `mybusinessverifications`, `businessprofileperformance`, `mybusinessnotifications`.

Use the `api_methods` tools to find method names and their read or write kind.

## One-time setup

1. In Google Cloud console, enable the APIs you plan to use (Google Analytics Admin and Data, Tag Manager, YouTube Data, YouTube Analytics, Business Profile APIs). Some Business Profile APIs need access approval from Google first.
2. Create an OAuth client of type **Desktop app** and save it:
   `node <plugin>/bin/gsm.mjs setup-client <client_secret.json>`
3. Log in: `node <plugin>/bin/gsm.mjs login business`
4. Check with `node <plugin>/bin/gsm.mjs status`.

## Safety rules

- Read tools are always available. Write tools (create or change properties, tags, listings) appear only when **Allow write tools** is on.
- Tag Manager publishing makes tags live on real websites. Treat publish and delete calls as destructive: preview first, then confirm.
- Business Profile listing changes are visible to the public. Confirm the change with the user before writing.
- Analytics reports can be large. Ask for the dimensions and metrics you need, and a bounded date range.

## Typical flows

- **Traffic report:** find the property with the analytics admin tools, then run a report with `analyticsdata` (for example a `runReport` method) for a date range.
- **Check a tag before publishing:** list the workspace's tags and triggers in `tagmanager`, review the draft, and publish only after confirmation.
- **Channel stats:** `youtube` channels list with the `statistics` part.
