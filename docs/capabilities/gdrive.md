# Google Drive and Docs (`gdrive`)

Google Drive files, labels and activity, plus Docs, Sheets, Slides, Forms and Books.

- Plugin: `gdrive`, MCP server: `gdrive`, login: Desktop OAuth client, then `login workspace-user`
- Install: `claude plugin install gdrive@google-services-mcps`
- Tools: 198 total. Curated 19, per-method 175, gateway 3. Read 94, write 76, destructive 27, dynamic 1.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 198, google 26, curated 22 tools, each counting the 7 runtime tools this server registers (`account_remove`, `account_set_default`, `accounts_list`, `auth_login`, `auth_setup_client`, `auth_status`, `health`). "(all)" means the product has no such toolset yet, so it lists every tool.

## Not registered by this server (2)

The tool map (`plugins/<id>/tool-map.json`) also lists these, so the consent hook knows every name, but this server never registers them, and the counts above leave them out.

- Sign-in tools of other sign-in kinds: `auth_setup_admin`, `auth_setup_service_account`.

## Toolset google (19)

The tools that match Google's official MCP server for this product (https://developers.google.com/workspace/drive/api/reference/mcp/tools_list).

| Tool | Google's tool | Note |
|---|---|---|
| `drive_search` | `search_files` | Takes Drive's own query syntax (q), not the dialect of Google's search_files (title, parentId, owner); the same searches can be written in either. |
| `drive_list_recent` | `list_recent_files` |  |
| `drive_get_file` | `get_file_metadata` |  |
| `drive_permissions_list` | `get_file_permissions` |  |
| `drive_read_text` | `read_file_content` | PDF and image text is not read: Drive has no public text-extraction call. Office and OpenDocument text is taken from the downloaded file, since Drive exports only Google files. |
| `drive_download` | `download_file_content` |  |
| `drive_create_file` | `create_file` | Converts to a Google type only when google_type is given; Google's create_file converts by default. |
| `drive_files_copy` | `copy_file` |  |
| `docs_documents_get` | `read_doc` | Generated from Docs' documents.get: the full document JSON. Comments (Google's commentsIncluded) are in drive_read_text with include_comments. |
| `docs_documents_batch_update` | `update_doc` |  |
| `sheets_get_values` | `get_values` |  |
| `sheets_spreadsheets_get` | `get_spreadsheet` |  |
| `sheets_spreadsheets_batch_update` | `update_spreadsheet` |  |
| `sheets_write_values` | `update_values`, `update_formulas` | One tool for Google's update_values and update_formulas: value_input data (RAW) or formulas (USER_ENTERED), always given. |
| `sheets_insert_rows` | `insert_dimension` |  |
| `slides_presentations_get` | `read_presentation` |  |
| `slides_presentations_pages_get` | `read_slide_page` |  |
| `slides_presentatio_pages_get_thumbnai` | `read_slide_page_thumbnail` | The generated name is cut to fit the 64-character tool name budget. |
| `slides_presentations_batch_update` | `update_presentation` |  |

## Curated tools (19)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `account_remove` | write | Remove a signed-in account | (none) |
| `account_set_default` | write | Set the default account | (none) |
| `accounts_list` | read | Signed-in accounts | (none) |
| `auth_login` | write | Sign in to Google | (none) |
| `auth_setup_client` | write | Save the Google OAuth client | (none) |
| `auth_status` | read | Sign-in status | (none) |
| `drive_create_file` | write | Create or upload Drive file | drive, drive.file |
| `drive_create_folder` | write | Create Drive folder | drive, drive.file |
| `drive_create_text_file` | write | Create Drive text file | drive, drive.file |
| `drive_download` | read | Download Drive file | drive, drive.file |
| `drive_get_file` | read | Get Drive file | drive, drive.metadata |
| `drive_list_recent` | read | List recent Drive files | drive, drive.metadata |
| `drive_read_text` | read | Read Drive file as text | drive, drive.readonly |
| `drive_search` | read | Search Drive | drive, drive.metadata |
| `drive_trash_file` | destructive | Trash Drive file | drive, drive.file |
| `health` | read | Server health | (none) |
| `sheets_get_values` | read | Read spreadsheet values | drive, drive.file |
| `sheets_insert_rows` | write | Insert spreadsheet rows or columns | drive, drive.file |
| `sheets_write_values` | write | Write spreadsheet values | drive, drive.file |

## Per-method tools (175)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `books_bookshelves_get` | read | books.bookshelves.get | books |
| `books_bookshelves_list` | read | books.bookshelves.list | books |
| `books_bookshelves_volumes_list` | read | books.bookshelves.volumes.list | books |
| `books_cloudloading_add_book` | write | books.cloudloading.addBook | books |
| `books_cloudloading_delete_book` | write | books.cloudloading.deleteBook | books |
| `books_cloudloading_update_book` | write | books.cloudloading.updateBook | books |
| `books_dictionary_list_offline_metadat` | read | books.dictionary.listOfflineMetadata | books |
| `books_familysharing_get_family_info` | read | books.familysharing.getFamilyInfo | books |
| `books_familysharing_share` | write | books.familysharing.share | books |
| `books_familysharing_unshare` | write | books.familysharing.unshare | books |
| `books_layers_annotation_data_get` | read | books.layers.annotationData.get | books |
| `books_layers_annotation_data_list` | read | books.layers.annotationData.list | books |
| `books_layers_get` | read | books.layers.get | books |
| `books_layers_list` | read | books.layers.list | books |
| `books_layers_volume_annotations_get` | read | books.layers.volumeAnnotations.get | books |
| `books_layers_volume_annotations_list` | read | books.layers.volumeAnnotations.list | books |
| `books_myconfig_get_user_settings` | read | books.myconfig.getUserSettings | books |
| `books_myconfig_release_download_acces` | write | books.myconfig.releaseDownloadAccess | books |
| `books_myconfig_request_access` | write | books.myconfig.requestAccess | books |
| `books_myconfig_sync_volume_licenses` | write | books.myconfig.syncVolumeLicenses | books |
| `books_myconfig_update_user_settings` | write | books.myconfig.updateUserSettings | books |
| `books_mylibrar_bookshelv_volumes_list` | read | books.mylibrary.bookshelves.volumes.list | books |
| `books_mylibrary_annotations_delete` | destructive | books.mylibrary.annotations.delete | books |
| `books_mylibrary_annotations_insert` | write | books.mylibrary.annotations.insert | books |
| `books_mylibrary_annotations_list` | read | books.mylibrary.annotations.list | books |
| `books_mylibrary_annotations_summary` | write | books.mylibrary.annotations.summary | books |
| `books_mylibrary_annotations_update` | write | books.mylibrary.annotations.update | books |
| `books_mylibrary_bookshelve_add_volume` | write | books.mylibrary.bookshelves.addVolume | books |
| `books_mylibrary_bookshelve_clear_volu` | write | books.mylibrary.bookshelves.clearVolumes | books |
| `books_mylibrary_bookshelve_move_volum` | write | books.mylibrary.bookshelves.moveVolume | books |
| `books_mylibrary_bookshelve_remove_vol` | write | books.mylibrary.bookshelves.removeVolume | books |
| `books_mylibrary_bookshelves_get` | read | books.mylibrary.bookshelves.get | books |
| `books_mylibrary_bookshelves_list` | read | books.mylibrary.bookshelves.list | books |
| `books_mylibrary_readingpos_set_positi` | write | books.mylibrary.readingpositions.setPosition | books |
| `books_mylibrary_readingpositions_get` | read | books.mylibrary.readingpositions.get | books |
| `books_notification_get` | read | books.notification.get | books |
| `books_onboarding_list_categories` | read | books.onboarding.listCategories | books |
| `books_onboarding_list_category_volume` | read | books.onboarding.listCategoryVolumes | books |
| `books_personalizedstream_get` | read | books.personalizedstream.get | books |
| `books_promooffer_accept` | write | books.promooffer.accept | books |
| `books_promooffer_dismiss` | write | books.promooffer.dismiss | books |
| `books_promooffer_get` | read | books.promooffer.get | books |
| `books_series_get` | read | books.series.get | books |
| `books_series_membership_get` | read | books.series.membership.get | books |
| `books_volumes_associated_list` | read | books.volumes.associated.list | books |
| `books_volumes_get` | read | books.volumes.get | books |
| `books_volumes_list` | read | books.volumes.list | books |
| `books_volumes_mybooks_list` | read | books.volumes.mybooks.list | books |
| `books_volumes_recommended_list` | read | books.volumes.recommended.list | books |
| `books_volumes_recommended_rate` | write | books.volumes.recommended.rate | books |
| `books_volumes_useruploaded_list` | read | books.volumes.useruploaded.list | books |
| `docs_documents_batch_update` | destructive | docs.documents.batchUpdate | documents, drive |
| `docs_documents_create` | write | docs.documents.create | documents, drive |
| `docs_documents_get` | read | docs.documents.get | documents, documents.readonly |
| `drive_about_get` | read | drive.about.get | drive, drive.appdata |
| `drive_accessproposals_get` | read | drive.accessproposals.get | drive, drive.file |
| `drive_accessproposals_list` | read | drive.accessproposals.list | drive, drive.file |
| `drive_accessproposals_resolve` | write | drive.accessproposals.resolve | drive, drive.file |
| `drive_approvals_approve` | write | drive.approvals.approve | drive, drive.file |
| `drive_approvals_cancel` | destructive | drive.approvals.cancel | drive, drive.file |
| `drive_approvals_comment` | write | drive.approvals.comment | drive, drive.file |
| `drive_approvals_decline` | write | drive.approvals.decline | drive, drive.file |
| `drive_approvals_get` | read | drive.approvals.get | drive, drive.appdata |
| `drive_approvals_list` | read | drive.approvals.list | drive, drive.appdata |
| `drive_approvals_reassign` | write | drive.approvals.reassign | drive, drive.file |
| `drive_approvals_start` | write | drive.approvals.start | drive, drive.file |
| `drive_apps_get` | read | drive.apps.get | drive, drive.appdata |
| `drive_apps_list` | read | drive.apps.list | drive.apps.readonly |
| `drive_changes_get_start_page_token` | read | drive.changes.getStartPageToken | drive, drive.appdata |
| `drive_changes_list` | read | drive.changes.list | drive, drive.appdata |
| `drive_changes_watch` | write | drive.changes.watch | drive, drive.appdata |
| `drive_channels_stop` | destructive | drive.channels.stop | drive, drive.appdata |
| `drive_comments_create` | write | drive.comments.create | drive, drive.file |
| `drive_comments_delete` | destructive | drive.comments.delete | drive, drive.file |
| `drive_comments_get` | read | drive.comments.get | drive, drive.file |
| `drive_comments_list` | read | drive.comments.list | drive, drive.file |
| `drive_comments_update` | write | drive.comments.update | drive, drive.file |
| `drive_drives_create` | write | drive.drives.create | drive |
| `drive_drives_delete` | destructive | drive.drives.delete | drive |
| `drive_drives_get` | read | drive.drives.get | drive, drive.readonly |
| `drive_drives_hide` | write | drive.drives.hide | drive |
| `drive_drives_list` | read | drive.drives.list | drive, drive.readonly |
| `drive_drives_unhide` | write | drive.drives.unhide | drive |
| `drive_drives_update` | write | drive.drives.update | drive |
| `drive_files_copy` | write | drive.files.copy | drive, drive.appdata |
| `drive_files_delete` | destructive | drive.files.delete | drive, drive.appdata |
| `drive_files_download` | read | drive.files.download | drive, drive.file |
| `drive_files_empty_trash` | destructive | drive.files.emptyTrash | drive |
| `drive_files_export` | read | drive.files.export | drive, drive.file |
| `drive_files_generate_cse_token` | write | drive.files.generateCseToken | drive |
| `drive_files_generate_ids` | read | drive.files.generateIds | drive, drive.appdata |
| `drive_files_get` | read | drive.files.get | drive, drive.appdata |
| `drive_files_list` | read | drive.files.list | drive, drive.appdata |
| `drive_files_list_labels` | read | drive.files.listLabels | drive, drive.file |
| `drive_files_modify_labels` | write | drive.files.modifyLabels | drive, drive.file |
| `drive_files_watch` | write | drive.files.watch | drive, drive.appdata |
| `drive_operations_get` | read | drive.operations.get | drive, drive.file |
| `drive_permissions_create` | destructive | drive.permissions.create | drive, drive.file |
| `drive_permissions_delete` | destructive | drive.permissions.delete | drive, drive.file |
| `drive_permissions_get` | read | drive.permissions.get | drive, drive.file |
| `drive_permissions_list` | read | drive.permissions.list | drive, drive.file |
| `drive_permissions_update` | destructive | drive.permissions.update | drive, drive.file |
| `drive_replies_create` | write | drive.replies.create | drive, drive.file |
| `drive_replies_delete` | destructive | drive.replies.delete | drive, drive.file |
| `drive_replies_get` | read | drive.replies.get | drive, drive.file |
| `drive_replies_list` | read | drive.replies.list | drive, drive.file |
| `drive_replies_update` | write | drive.replies.update | drive, drive.file |
| `drive_revisions_delete` | destructive | drive.revisions.delete | drive, drive.appdata |
| `drive_revisions_get` | read | drive.revisions.get | drive, drive.appdata |
| `drive_revisions_list` | read | drive.revisions.list | drive, drive.appdata |
| `drive_revisions_update` | write | drive.revisions.update | drive, drive.appdata |
| `drive_teamdrives_create` | write | drive.teamdrives.create | drive |
| `drive_teamdrives_delete` | destructive | drive.teamdrives.delete | drive |
| `drive_teamdrives_get` | read | drive.teamdrives.get | drive, drive.readonly |
| `drive_teamdrives_list` | read | drive.teamdrives.list | drive, drive.readonly |
| `drive_teamdrives_update` | write | drive.teamdrives.update | drive |
| `driveactiv_activity_query` | read | driveactivity.activity.query | drive.activity, drive.activity.readonly |
| `drivelabel_labe_revi_permi_batch_52b2` | destructive | drivelabels.labels.revisions.permissions.batchDelete | drive.admin.labels, drive.labels |
| `drivelabel_labe_revi_permi_batch_b7ee` | write | drivelabels.labels.revisions.permissions.batchUpdate | drive.admin.labels, drive.labels |
| `drivelabel_label_revisi_permis_create` | write | drivelabels.labels.revisions.permissions.create | drive.admin.labels, drive.labels |
| `drivelabel_label_revisi_permis_delete` | destructive | drivelabels.labels.revisions.permissions.delete | drive.admin.labels, drive.labels |
| `drivelabel_labels_create` | write | drivelabels.labels.create | drive.admin.labels, drive.labels |
| `drivelabel_labels_delete` | destructive | drivelabels.labels.delete | drive.admin.labels, drive.labels |
| `drivelabel_labels_delta` | write | drivelabels.labels.delta | drive.admin.labels, drive.labels |
| `drivelabel_labels_disable` | destructive | drivelabels.labels.disable | drive.admin.labels, drive.labels |
| `drivelabel_labels_enable` | write | drivelabels.labels.enable | drive.admin.labels, drive.labels |
| `drivelabel_labels_get` | read | drivelabels.labels.get | drive.admin.labels, drive.admin.labels.readonly |
| `drivelabel_labels_list` | read | drivelabels.labels.list | drive.admin.labels, drive.admin.labels.readonly |
| `drivelabel_labels_locks_list` | read | drivelabels.labels.locks.list | drive.admin.labels, drive.admin.labels.readonly |
| `drivelabel_labels_permissio_batch_del` | destructive | drivelabels.labels.permissions.batchDelete | drive.admin.labels, drive.labels |
| `drivelabel_labels_permissio_batch_upd` | write | drivelabels.labels.permissions.batchUpdate | drive.admin.labels, drive.labels |
| `drivelabel_labels_permissions_create` | write | drivelabels.labels.permissions.create | drive.admin.labels, drive.labels |
| `drivelabel_labels_permissions_delete` | destructive | drivelabels.labels.permissions.delete | drive.admin.labels, drive.labels |
| `drivelabel_labels_permissions_list` | read | drivelabels.labels.permissions.list | drive.admin.labels, drive.admin.labels.readonly |
| `drivelabel_labels_publish` | write | drivelabels.labels.publish | drive.admin.labels, drive.labels |
| `drivelabel_labels_revisi_permiss_list` | read | drivelabels.labels.revisions.permissions.list | drive.admin.labels, drive.admin.labels.readonly |
| `drivelabel_labels_revision_locks_list` | read | drivelabels.labels.revisions.locks.list | drive.admin.labels, drive.admin.labels.readonly |
| `drivelabel_labels_revisions_update_pe` | write | drivelabels.labels.revisions.updatePermissions | drive.admin.labels, drive.labels |
| `drivelabel_labels_update_label_copy_m` | write | drivelabels.labels.updateLabelCopyMode | drive.admin.labels, drive.labels |
| `drivelabel_labels_update_label_enable` | write | drivelabels.labels.updateLabelEnabledAppSettings | (none) |
| `drivelabel_labels_update_permissions` | write | drivelabels.labels.updatePermissions | drive.admin.labels, drive.labels |
| `drivelabel_limits_get_label` | read | drivelabels.limits.getLabel | drive.admin.labels, drive.admin.labels.readonly |
| `drivelabel_users_get_capabilities` | read | drivelabels.users.getCapabilities | drive.admin.labels, drive.admin.labels.readonly |
| `forms_forms_batch_update` | write | forms.forms.batchUpdate | drive, drive.file |
| `forms_forms_create` | write | forms.forms.create | drive, drive.file |
| `forms_forms_get` | read | forms.forms.get | drive, drive.file |
| `forms_forms_responses_get` | read | forms.forms.responses.get | drive, drive.file |
| `forms_forms_responses_list` | read | forms.forms.responses.list | drive, drive.file |
| `forms_forms_set_publish_settings` | write | forms.forms.setPublishSettings | drive, drive.file |
| `forms_forms_watches_create` | write | forms.forms.watches.create | drive, drive.file |
| `forms_forms_watches_delete` | destructive | forms.forms.watches.delete | drive, drive.file |
| `forms_forms_watches_list` | read | forms.forms.watches.list | drive, drive.file |
| `forms_forms_watches_renew` | write | forms.forms.watches.renew | drive, drive.file |
| `sheets_spreadsh_values_batch_cle_7bcc` | destructive | sheets.spreadsheets.values.batchClear | drive, drive.file |
| `sheets_spreadsh_values_batch_cle_c5d4` | destructive | sheets.spreadsheets.values.batchClearByDataFilter | drive, drive.file |
| `sheets_spreadsh_values_batch_upd_91bd` | write | sheets.spreadsheets.values.batchUpdateByDataFilter | drive, drive.file |
| `sheets_spreadsh_values_batch_upd_d329` | write | sheets.spreadsheets.values.batchUpdate | drive, drive.file |
| `sheets_spreadsheet_developer_m_search` | read | sheets.spreadsheets.developerMetadata.search | drive, drive.file |
| `sheets_spreadsheet_values_batch_get_b` | read | sheets.spreadsheets.values.batchGetByDataFilter | drive, drive.file |
| `sheets_spreadsheets_batch_update` | destructive | sheets.spreadsheets.batchUpdate | drive, drive.file |
| `sheets_spreadsheets_create` | write | sheets.spreadsheets.create | drive, drive.file |
| `sheets_spreadsheets_developer_met_get` | read | sheets.spreadsheets.developerMetadata.get | drive, drive.file |
| `sheets_spreadsheets_get` | read | sheets.spreadsheets.get | drive, drive.file |
| `sheets_spreadsheets_get_by_data_filte` | read | sheets.spreadsheets.getByDataFilter | drive, drive.file |
| `sheets_spreadsheets_sheets_copy_to` | write | sheets.spreadsheets.sheets.copyTo | drive, drive.file |
| `sheets_spreadsheets_values_append` | write | sheets.spreadsheets.values.append | drive, drive.file |
| `sheets_spreadsheets_values_batch_get` | read | sheets.spreadsheets.values.batchGet | drive, drive.file |
| `sheets_spreadsheets_values_clear` | destructive | sheets.spreadsheets.values.clear | drive, drive.file |
| `sheets_spreadsheets_values_get` | read | sheets.spreadsheets.values.get | drive, drive.file |
| `sheets_spreadsheets_values_update` | write | sheets.spreadsheets.values.update | drive, drive.file |
| `slides_presentatio_pages_get_thumbnai` | read | slides.presentations.pages.getThumbnail | drive, drive.file |
| `slides_presentations_batch_update` | destructive | slides.presentations.batchUpdate | drive, drive.file |
| `slides_presentations_create` | write | slides.presentations.create | drive, drive.file |
| `slides_presentations_get` | read | slides.presentations.get | drive, drive.file |
| `slides_presentations_pages_get` | read | slides.presentations.pages.get | drive, drive.file |

## Gateway tools (3)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_call` | dynamic | Call an API method | (none) |
| `api_describe` | read | Describe an API method | (none) |
| `api_search` | read | Search API methods | (none) |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gdrive: API methods | (none) |

## Generated APIs

Each API links to Google's documentation for it, as Google's Discovery directory names it (`documentationLink`, kept in `data/catalog.json`). The link is the API's documentation home, not a page per method: the directory gives no link per method, and Google's REST reference pages are laid out differently from product to product.

- Drive API (`drive/v3`), 64 methods in the catalog. Documentation: <https://developers.google.com/drive/>
- Drive Activity API (`driveactivity/v2`), 1 methods in the catalog. Documentation: <https://developers.google.com/workspace/drive/activity/>
- Drive Labels API (`drivelabels/v2`), 26 methods in the catalog. Documentation: <https://developers.google.com/workspace/drive/labels>
- Google Docs API (`docs/v1`), 3 methods in the catalog. Documentation: <https://developers.google.com/workspace/docs/>
- Google Sheets API (`sheets/v4`), 17 methods in the catalog. Documentation: <https://developers.google.com/workspace/sheets/>
- Google Slides API (`slides/v1`), 5 methods in the catalog. Documentation: <https://developers.google.com/workspace/slides/>
- Google Forms API (`forms/v1`), 10 methods in the catalog. Documentation: <https://developers.google.com/workspace/forms/api>
- Books API (`books/v1`), 51 methods in the catalog. Documentation: <https://code.google.com/apis/books/docs/v1/getting_started.html>

## Gateway APIs (reached through api_search, api_describe, api_call)

- Drive API (`drive/v2`), 75 methods. Documentation: <https://developers.google.com/drive/>
- Drive Labels API (`drivelabels/v2beta`), 26 methods. Documentation: <https://developers.google.com/workspace/drive/labels>

