# YouTube and Blogger (`gyoutube`)

YouTube Data, YouTube Analytics and YouTube Reporting APIs, plus Blogger.

- Plugin: `gyoutube`, MCP server: `gyoutube`, login: Desktop OAuth client, then `login business`
- Install: `claude plugin install gyoutube@google-services-mcps`
- Tools: 132 total. Curated 7, per-method 124, gateway 0. Read 59, write 51, destructive 22, dynamic 0.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 132, google 17, curated 132 (all) tools, each counting the 7 runtime tools this server registers (`account_remove`, `account_set_default`, `accounts_list`, `auth_login`, `auth_setup_client`, `auth_status`, `health`). "(all)" means the product has no such toolset yet, so it lists every tool.

## Not registered by this server (2)

The tool map (`plugins/<id>/tool-map.json`) also lists these, so the consent hook knows every name, but this server never registers them, and the counts above leave them out.

- Sign-in tools of other sign-in kinds: `auth_setup_admin`, `auth_setup_service_account`.

## Toolset google (10)

Google has no official MCP server for this product. The google toolset is a lean set chosen here: No official Google MCP server for YouTube was found (Google's Cloud and Workspace MCP lists and Google's GitHub organisations, 2026-10-29; a negative, not confirmed by Google); a lean set chosen here..

| Tool | Google's tool | Note |
|---|---|---|
| `youtube_search_list` | (none) | Search YouTube for videos, channels and playlists. Each call costs 100 units of the project's daily YouTube quota. |
| `youtube_channels_list` | (none) | Channels by id, by handle, or your own (mine): statistics and the id of the uploads playlist. |
| `youtube_videos_list` | (none) | Videos by id, or the most popular chart: title, description, statistics and duration. |
| `youtube_playlists_list` | (none) | The playlists of a channel, or by id. |
| `youtube_playlist_items_list` | (none) | The videos of a playlist; a channel's uploads playlist lists all its videos. |
| `youtube_comment_threads_list` | (none) | Top-level comments of a video or channel, with replies. Discovery lists only youtube.force-ssl for it, which has no read-only form, so a readonly login does not cover it. |
| `youtube_captions_list` | (none) | The caption tracks of a video (not their text). Needs youtube.force-ssl, like the comment threads. |
| `ytanalyt_reports_query` | (none) | YouTube Analytics for your channel: views, watch time, subscribers and more, by day, video or country. |
| `youtube_videos_update` | (none) | Changes a video's title, description, tags, category or privacy. Destructive since 1.26.3, so it asks twice: the change is public, and Google deletes a value the request leaves out, so send the whole part. |
| `youtube_comments_insert` | (none) | Posts a reply to a comment (parentId); a new top-level comment is commentThreads.insert, in the all toolset. A write, so it asks first; the reply is public. |

## Curated tools (7)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `account_remove` | write | Remove a signed-in account | (none) |
| `account_set_default` | write | Set the default account | (none) |
| `accounts_list` | read | Signed-in accounts | (none) |
| `auth_login` | write | Sign in to Google | (none) |
| `auth_setup_client` | write | Save the Google OAuth client | (none) |
| `auth_status` | read | Sign-in status | (none) |
| `health` | read | Server health | (none) |

## Per-method tools (124)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `blogger_blog_user_infos_get` | read | blogger.blogUserInfos.get | blogger, blogger.readonly |
| `blogger_blogs_get` | read | blogger.blogs.get | blogger, blogger.readonly |
| `blogger_blogs_get_by_url` | read | blogger.blogs.getByUrl | blogger, blogger.readonly |
| `blogger_blogs_list_by_user` | read | blogger.blogs.listByUser | blogger, blogger.readonly |
| `blogger_comments_approve` | write | blogger.comments.approve | blogger |
| `blogger_comments_delete` | destructive | blogger.comments.delete | blogger |
| `blogger_comments_get` | read | blogger.comments.get | blogger, blogger.readonly |
| `blogger_comments_list` | read | blogger.comments.list | blogger, blogger.readonly |
| `blogger_comments_list_by_blog` | read | blogger.comments.listByBlog | blogger, blogger.readonly |
| `blogger_comments_mark_as_spam` | write | blogger.comments.markAsSpam | blogger |
| `blogger_comments_remove_content` | write | blogger.comments.removeContent | blogger |
| `blogger_page_views_get` | read | blogger.pageViews.get | blogger |
| `blogger_pages_delete` | destructive | blogger.pages.delete | blogger |
| `blogger_pages_get` | read | blogger.pages.get | blogger, blogger.readonly |
| `blogger_pages_insert` | write | blogger.pages.insert | blogger |
| `blogger_pages_list` | read | blogger.pages.list | blogger, blogger.readonly |
| `blogger_pages_patch` | write | blogger.pages.patch | blogger |
| `blogger_pages_publish` | write | blogger.pages.publish | blogger |
| `blogger_pages_revert` | write | blogger.pages.revert | blogger |
| `blogger_pages_update` | write | blogger.pages.update | blogger |
| `blogger_post_user_infos_get` | read | blogger.postUserInfos.get | blogger, blogger.readonly |
| `blogger_post_user_infos_list` | read | blogger.postUserInfos.list | blogger, blogger.readonly |
| `blogger_posts_delete` | destructive | blogger.posts.delete | blogger |
| `blogger_posts_get` | read | blogger.posts.get | blogger, blogger.readonly |
| `blogger_posts_get_by_path` | read | blogger.posts.getByPath | blogger, blogger.readonly |
| `blogger_posts_insert` | write | blogger.posts.insert | blogger |
| `blogger_posts_list` | read | blogger.posts.list | blogger, blogger.readonly |
| `blogger_posts_patch` | write | blogger.posts.patch | blogger |
| `blogger_posts_publish` | write | blogger.posts.publish | blogger |
| `blogger_posts_revert` | write | blogger.posts.revert | blogger |
| `blogger_posts_search` | read | blogger.posts.search | blogger, blogger.readonly |
| `blogger_posts_update` | write | blogger.posts.update | blogger |
| `blogger_users_get` | read | blogger.users.get | blogger, blogger.readonly |
| `youtube_abuse_reports_insert` | write | youtube.abuseReports.insert | youtube, youtube.force-ssl |
| `youtube_activities_list` | read | youtube.activities.list | youtube, youtube.force-ssl |
| `youtube_captions_delete` | destructive | youtube.captions.delete | youtube.force-ssl, youtubepartner |
| `youtube_captions_download` | read | youtube.captions.download | youtube.force-ssl, youtubepartner |
| `youtube_captions_list` | read | youtube.captions.list | youtube.force-ssl, youtubepartner |
| `youtube_channel_sections_delete` | destructive | youtube.channelSections.delete | youtube, youtube.force-ssl |
| `youtube_channel_sections_insert` | write | youtube.channelSections.insert | youtube, youtube.force-ssl |
| `youtube_channel_sections_list` | read | youtube.channelSections.list | youtube, youtube.force-ssl |
| `youtube_channel_sections_update` | write | youtube.channelSections.update | youtube, youtube.force-ssl |
| `youtube_channels_list` | read | youtube.channels.list | youtube, youtube.force-ssl |
| `youtube_channels_update` | write | youtube.channels.update | youtube, youtube.force-ssl |
| `youtube_comment_threads_insert` | write | youtube.commentThreads.insert | youtube.force-ssl |
| `youtube_comment_threads_list` | read | youtube.commentThreads.list | youtube.force-ssl |
| `youtube_comments_delete` | destructive | youtube.comments.delete | youtube.force-ssl |
| `youtube_comments_insert` | write | youtube.comments.insert | youtube.force-ssl |
| `youtube_comments_list` | read | youtube.comments.list | youtube.force-ssl |
| `youtube_comments_mark_as_spam` | write | youtube.comments.markAsSpam | youtube.force-ssl |
| `youtube_comments_set_moderation_s` | write | youtube.comments.setModerationStatus | youtube.force-ssl |
| `youtube_comments_update` | write | youtube.comments.update | youtube.force-ssl |
| `youtube_i18n_languages_list` | read | youtube.i18nLanguages.list | youtube, youtube.force-ssl |
| `youtube_i18n_regions_list` | read | youtube.i18nRegions.list | youtube, youtube.force-ssl |
| `youtube_live_broadca_insert_cuepo` | write | youtube.liveBroadcasts.insertCuepoint | youtube, youtube.force-ssl |
| `youtube_live_broadcast_transition` | destructive | youtube.liveBroadcasts.transition | youtube, youtube.force-ssl |
| `youtube_live_broadcasts_bind` | write | youtube.liveBroadcasts.bind | youtube, youtube.force-ssl |
| `youtube_live_broadcasts_delete` | destructive | youtube.liveBroadcasts.delete | youtube, youtube.force-ssl |
| `youtube_live_broadcasts_insert` | write | youtube.liveBroadcasts.insert | youtube, youtube.force-ssl |
| `youtube_live_broadcasts_list` | read | youtube.liveBroadcasts.list | youtube, youtube.force-ssl |
| `youtube_live_broadcasts_update` | write | youtube.liveBroadcasts.update | youtube, youtube.force-ssl |
| `youtube_live_chat_bans_delete` | destructive | youtube.liveChatBans.delete | youtube, youtube.force-ssl |
| `youtube_live_chat_bans_insert` | write | youtube.liveChatBans.insert | youtube, youtube.force-ssl |
| `youtube_live_chat_mess_transition` | write | youtube.liveChatMessages.transition | youtube, youtube.force-ssl |
| `youtube_live_chat_messages_delete` | destructive | youtube.liveChatMessages.delete | youtube, youtube.force-ssl |
| `youtube_live_chat_messages_insert` | write | youtube.liveChatMessages.insert | youtube, youtube.force-ssl |
| `youtube_live_chat_messages_list` | read | youtube.liveChatMessages.list | youtube, youtube.force-ssl |
| `youtube_live_chat_moderato_delete` | destructive | youtube.liveChatModerators.delete | youtube, youtube.force-ssl |
| `youtube_live_chat_moderato_insert` | write | youtube.liveChatModerators.insert | youtube, youtube.force-ssl |
| `youtube_live_chat_moderators_list` | read | youtube.liveChatModerators.list | youtube, youtube.force-ssl |
| `youtube_live_streams_delete` | destructive | youtube.liveStreams.delete | youtube, youtube.force-ssl |
| `youtube_live_streams_insert` | write | youtube.liveStreams.insert | youtube, youtube.force-ssl |
| `youtube_live_streams_list` | read | youtube.liveStreams.list | youtube, youtube.force-ssl |
| `youtube_live_streams_update` | write | youtube.liveStreams.update | youtube, youtube.force-ssl |
| `youtube_members_list` | read | youtube.members.list | youtube.channel-memberships.creator |
| `youtube_memberships_levels_list` | read | youtube.membershipsLevels.list | youtube.channel-memberships.creator |
| `youtube_playlist_images_delete` | destructive | youtube.playlistImages.delete | youtube, youtube.force-ssl |
| `youtube_playlist_images_list` | read | youtube.playlistImages.list | youtube, youtube.force-ssl |
| `youtube_playlist_items_delete` | destructive | youtube.playlistItems.delete | youtube, youtube.force-ssl |
| `youtube_playlist_items_insert` | write | youtube.playlistItems.insert | youtube, youtube.force-ssl |
| `youtube_playlist_items_list` | read | youtube.playlistItems.list | youtube, youtube.force-ssl |
| `youtube_playlist_items_update` | write | youtube.playlistItems.update | youtube, youtube.force-ssl |
| `youtube_playlists_delete` | destructive | youtube.playlists.delete | youtube, youtube.force-ssl |
| `youtube_playlists_insert` | write | youtube.playlists.insert | youtube, youtube.force-ssl |
| `youtube_playlists_list` | read | youtube.playlists.list | youtube, youtube.force-ssl |
| `youtube_playlists_update` | write | youtube.playlists.update | youtube, youtube.force-ssl |
| `youtube_search_list` | read | youtube.search.list | youtube, youtube.force-ssl |
| `youtube_subscriptions_delete` | destructive | youtube.subscriptions.delete | youtube, youtube.force-ssl |
| `youtube_subscriptions_insert` | write | youtube.subscriptions.insert | youtube, youtube.force-ssl |
| `youtube_subscriptions_list` | read | youtube.subscriptions.list | youtube, youtube.force-ssl |
| `youtube_super_chat_events_list` | read | youtube.superChatEvents.list | youtube, youtube.force-ssl |
| `youtube_tests_insert` | write | youtube.tests.insert | youtube.readonly |
| `youtube_third_party_links_delete` | destructive | youtube.thirdPartyLinks.delete | (none) |
| `youtube_third_party_links_insert` | write | youtube.thirdPartyLinks.insert | (none) |
| `youtube_third_party_links_list` | read | youtube.thirdPartyLinks.list | (none) |
| `youtube_third_party_links_update` | write | youtube.thirdPartyLinks.update | (none) |
| `youtube_video_abuse_report_r_list` | read | youtube.videoAbuseReportReasons.list | youtube, youtube.force-ssl |
| `youtube_video_categories_list` | read | youtube.videoCategories.list | youtube, youtube.force-ssl |
| `youtube_video_trainability_get` | read | youtube.videoTrainability.get | youtube, youtube.force-ssl |
| `youtube_videos_batch_get_stats` | read | youtube.videos.batchGetStats | youtube, youtube.force-ssl |
| `youtube_videos_delete` | destructive | youtube.videos.delete | youtube, youtube.force-ssl |
| `youtube_videos_get_rating` | read | youtube.videos.getRating | youtube, youtube.force-ssl |
| `youtube_videos_list` | read | youtube.videos.list | youtube, youtube.force-ssl |
| `youtube_videos_rate` | write | youtube.videos.rate | youtube, youtube.force-ssl |
| `youtube_videos_report_abuse` | write | youtube.videos.reportAbuse | youtube, youtube.force-ssl |
| `youtube_videos_update` | destructive | youtube.videos.update | youtube, youtube.force-ssl |
| `youtube_watermarks_unset` | write | youtube.watermarks.unset | youtube, youtube.force-ssl |
| `youtube_youtu_v3_live_messa_strea` | read | youtube.youtube.v3.liveChat.messages.stream | youtube, youtube.force-ssl |
| `youtuberep_jobs_create` | write | youtubereporting.jobs.create | yt-analytics-monetary.readonly, yt-analytics.readonly |
| `youtuberep_jobs_delete` | destructive | youtubereporting.jobs.delete | yt-analytics-monetary.readonly, yt-analytics.readonly |
| `youtuberep_jobs_get` | read | youtubereporting.jobs.get | yt-analytics-monetary.readonly, yt-analytics.readonly |
| `youtuberep_jobs_list` | read | youtubereporting.jobs.list | yt-analytics-monetary.readonly, yt-analytics.readonly |
| `youtuberep_jobs_reports_get` | read | youtubereporting.jobs.reports.get | yt-analytics-monetary.readonly, yt-analytics.readonly |
| `youtuberep_jobs_reports_list` | read | youtubereporting.jobs.reports.list | yt-analytics-monetary.readonly, yt-analytics.readonly |
| `youtuberep_media_download` | read | youtubereporting.media.download | yt-analytics-monetary.readonly, yt-analytics.readonly |
| `youtuberep_report_types_list` | read | youtubereporting.reportTypes.list | yt-analytics-monetary.readonly, yt-analytics.readonly |
| `ytanalyt_group_items_delete` | destructive | youtubeAnalytics.groupItems.delete | youtube, youtube.readonly |
| `ytanalyt_group_items_insert` | write | youtubeAnalytics.groupItems.insert | youtube, youtube.readonly |
| `ytanalyt_group_items_list` | read | youtubeAnalytics.groupItems.list | youtube, youtube.readonly |
| `ytanalyt_groups_delete` | destructive | youtubeAnalytics.groups.delete | youtube, youtube.readonly |
| `ytanalyt_groups_insert` | write | youtubeAnalytics.groups.insert | youtube, youtube.readonly |
| `ytanalyt_groups_list` | read | youtubeAnalytics.groups.list | youtube, youtube.readonly |
| `ytanalyt_groups_update` | write | youtubeAnalytics.groups.update | youtube, youtube.readonly |
| `ytanalyt_reports_query` | read | youtubeAnalytics.reports.query | youtube, youtube.readonly |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gyoutube: API methods | (none) |

## Generated APIs

Each API links to Google's documentation for it, as Google's Discovery directory names it (`documentationLink`, kept in `data/catalog.json`). The link is the API's documentation home, not a page per method: the directory gives no link per method, and Google's REST reference pages are laid out differently from product to product.

- YouTube Data API v3 (`youtube/v3`), 83 methods in the catalog. Documentation: <https://developers.google.com/youtube/>
- YouTube Analytics API (`youtubeAnalytics/v2`), 8 methods in the catalog. Documentation: <https://developers.google.com/youtube/analytics>
- YouTube Reporting API (`youtubereporting/v1`), 8 methods in the catalog. Documentation: <https://developers.google.com/youtube/reporting/v1/reports/>
- Blogger API (`blogger/v3`), 33 methods in the catalog. Documentation: <https://developers.google.com/blogger/docs/3.0/getting_started>

## Gateway APIs (reached through api_search, api_describe, api_call)

None.

