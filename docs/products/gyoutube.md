# YouTube and Blogger (`gyoutube`)

YouTube Data API, YouTube Analytics API, YouTube Reporting API and Blogger. It searches and reads videos, channels, playlists and comments, manages captions and playlists, handles live chat moderation, and reads or publishes blog posts. It has 125 tools and no gateway.

## When to install it

- You look up videos, channels or comments, or read video statistics.
- You manage playlists, captions or comments on your channel.
- You need YouTube Analytics or Reporting data for a channel you own.
- You write, publish or edit Blogger posts.
- Wrong choice: heavy search or bulk upload work. The daily quota is small.

## Install and set up

```
claude plugin install gyoutube@google-services-mcps --scope user
node <plugin>/bin/gsm.mjs setup-client <client_secret.json>
node <plugin>/bin/gsm.mjs login business --profile readonly
node <plugin>/bin/gsm.mjs status
```

`<plugin>` is the plugin folder (in this repo, `plugins/gyoutube`).

1. In a Google Cloud project, enable the YouTube Data API v3, and the YouTube Analytics, YouTube Reporting and Blogger APIs if you use them.
2. Set up the OAuth consent screen. Use Internal for a Workspace domain. Create an OAuth client ID of type Desktop app and download the JSON file.
3. Run `setup-client`, then `login business`. Restart the MCP server (`/mcp`) after login.

Start with `--profile readonly`. Insert, update and delete always need user authorization. Changes also need a `readwrite` login and the plugin option `allow_writes`.

## What it can do

| Area | Tools | Safety | What it does |
|---|---|---|---|
| Search and read | `youtube_search_list`, `youtube_videos_batch_get_stats`, comment threads and comments list, playlists list | read | Search videos, read video statistics, read comments and playlists |
| Write | `youtube_playlists_insert`, `youtube_playlists_update`, `youtube_comments_insert`, `youtube_comments_update`, `youtube_comment_threads_insert` | write | Create or change playlists, reply to or edit comments |
| | `youtube_comments_mark_as_spam`, and the comment moderation tool | write | Mark a comment as spam or set its moderation status |
| Delete | `youtube_comments_delete`, `youtube_playlists_delete`, captions, channel sections, live broadcasts, live chat messages, bans and moderators | destructive | Remove comments, playlists, captions and other items |
| Blogger | posts, pages and comments: list, get, insert, update, publish, revert | read, write | Read, write and publish blog posts and pages |
| Blogger delete | posts, pages, comments | destructive | Delete blog items |
| YouTube Analytics (8) and Reporting (8) | reports and report jobs | read | Channel analytics and bulk reports |
| Gateway | none | | No gateway tools. All methods are per-method tools. |

The full list is in `docs/capabilities/gyoutube.md`.

## Example requests

- "Show the top 10 comments on my last video." Claude runs a comment threads read. No prompt.
- "Find videos about home solar from the last month." Claude runs `youtube_search_list`. No prompt. Search is limited to 100 calls per day.
- "Publish my draft blog post Spring recap." Claude runs the Blogger publish tool. It asks first, and the post goes live.
- "Mark the spam comment as spam." Claude runs `youtube_comments_mark_as_spam`. It asks first.
- "Delete that comment." Claude runs `youtube_comments_delete`. It asks twice.

## Safety

- Reads never ask. Writes ask first. Deletes ask twice.
- Blogger publish makes a post public.
- Abuse report submissions are write calls. Check the report before you approve it.
- The `confirmation` option defaults to `every-change`. Change it with `claude plugin configure gyoutube`.

## Costs and limits

The fee is UNVERIFIED. The default is 10,000 units per day for all endpoints, except search.list and videos.insert, which each allow 100 calls per day. More quota needs a compliance audit first. See `docs/LIMITS-AND-COSTS.md` and `docs/limits/ads-business-youtube-play.md`, section 6.

## Caveats

- The unit cost of `search.list` and of `videos.insert` is UNVERIFIED. The sources disagree.
- The error code for the daily cap is UNVERIFIED.
- Report jobs expire after 60 days. Download each report once and keep it.
- The daily download limits for Reporting are UNVERIFIED.
