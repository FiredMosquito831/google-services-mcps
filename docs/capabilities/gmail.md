# Gmail (`gmail`)

Gmail mailboxes, messages, labels and settings, plus Gmail Postmaster Tools.

- Plugin: `gmail`, MCP server: `gmail`, login: Desktop OAuth client, then `login workspace-user`
- Install: `claude plugin install gmail@google-services-mcps`
- Tools: 102 total. Curated 11, per-method 87, gateway 3. Read 45, write 38, destructive 18, dynamic 1.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

## Curated tools (11)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `auth_login` | write | Sign in to Google | (none) |
| `auth_setup_admin` | write | Set up the workspace admin account | (none) |
| `auth_setup_client` | write | Save the Google OAuth client | (none) |
| `auth_status` | read | Sign-in status | (none) |
| `gmail_create_draft` | write | Create Gmail draft | https://mail.google.com/, gmail.compose |
| `gmail_get_message` | read | Get Gmail message | https://mail.google.com/, gmail.metadata |
| `gmail_list_drafts` | read | List Gmail drafts | https://mail.google.com/, gmail.compose |
| `gmail_list_labels` | read | List Gmail labels | https://mail.google.com/, gmail.labels |
| `gmail_search` | read | Search Gmail | https://mail.google.com/, gmail.metadata |
| `gmail_send_draft` | destructive | Send Gmail draft | https://mail.google.com/, gmail.compose |
| `health` | read | Server health | (none) |

## Per-method tools (87)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `gmail_users_drafts_delete` | destructive | gmail.users.drafts.delete | https://mail.google.com/, gmail.addons.current.action.compose |
| `gmail_users_drafts_get` | read | gmail.users.drafts.get | https://mail.google.com/, gmail.compose |
| `gmail_users_drafts_list` | read | gmail.users.drafts.list | https://mail.google.com/, gmail.compose |
| `gmail_users_get_profile` | read | gmail.users.getProfile | https://mail.google.com/, gmail.compose |
| `gmail_users_history_list` | read | gmail.users.history.list | https://mail.google.com/, gmail.metadata |
| `gmail_users_labels_create` | write | gmail.users.labels.create | https://mail.google.com/, gmail.labels |
| `gmail_users_labels_delete` | destructive | gmail.users.labels.delete | https://mail.google.com/, gmail.labels |
| `gmail_users_labels_get` | read | gmail.users.labels.get | https://mail.google.com/, gmail.labels |
| `gmail_users_labels_list` | read | gmail.users.labels.list | https://mail.google.com/, gmail.labels |
| `gmail_users_labels_patch` | write | gmail.users.labels.patch | https://mail.google.com/, gmail.labels |
| `gmail_users_labels_update` | write | gmail.users.labels.update | https://mail.google.com/, gmail.labels |
| `gmail_users_messages_attachments_get` | read | gmail.users.messages.attachments.get | https://mail.google.com/, gmail.addons.current.message.action |
| `gmail_users_messages_batch_delete` | destructive | gmail.users.messages.batchDelete | https://mail.google.com/ |
| `gmail_users_messages_batch_modify` | write | gmail.users.messages.batchModify | https://mail.google.com/, gmail.modify |
| `gmail_users_messages_delete` | destructive | gmail.users.messages.delete | https://mail.google.com/ |
| `gmail_users_messages_get` | read | gmail.users.messages.get | https://mail.google.com/, gmail.addons.current.message.action |
| `gmail_users_messages_list` | read | gmail.users.messages.list | https://mail.google.com/, gmail.metadata |
| `gmail_users_messages_modify` | write | gmail.users.messages.modify | https://mail.google.com/, gmail.modify |
| `gmail_users_messages_trash` | destructive | gmail.users.messages.trash | https://mail.google.com/, gmail.modify |
| `gmail_users_messages_untrash` | write | gmail.users.messages.untrash | https://mail.google.com/, gmail.modify |
| `gmail_users_settin_send_a_smime_delete` | destructive | gmail.users.settings.sendAs.smimeInfo.delete | gmail.settings.basic, gmail.settings.sharing |
| `gmail_users_settin_send_a_smime_insert` | write | gmail.users.settings.sendAs.smimeInfo.insert | gmail.settings.basic, gmail.settings.sharing |
| `gmail_users_settin_send_a_smime_set_def` | write | gmail.users.settings.sendAs.smimeInfo.setDefault | gmail.settings.basic, gmail.settings.sharing |
| `gmail_users_settin_send_as_smime_i_list` | read | gmail.users.settings.sendAs.smimeInfo.list | https://mail.google.com/, gmail.modify |
| `gmail_users_setting_cse_identiti_create` | write | gmail.users.settings.cse.identities.create | gmail.settings.basic, gmail.settings.sharing |
| `gmail_users_setting_cse_identiti_delete` | destructive | gmail.users.settings.cse.identities.delete | gmail.settings.basic, gmail.settings.sharing |
| `gmail_users_setting_cse_keypair_disable` | destructive | gmail.users.settings.cse.keypairs.disable | gmail.settings.basic, gmail.settings.sharing |
| `gmail_users_setting_cse_keypair_obliter` | write | gmail.users.settings.cse.keypairs.obliterate | gmail.settings.basic, gmail.settings.sharing |
| `gmail_users_setting_cse_keypairs_create` | write | gmail.users.settings.cse.keypairs.create | gmail.settings.basic, gmail.settings.sharing |
| `gmail_users_setting_cse_keypairs_enable` | write | gmail.users.settings.cse.keypairs.enable | gmail.settings.basic, gmail.settings.sharing |
| `gmail_users_setting_send_as_smime_i_get` | read | gmail.users.settings.sendAs.smimeInfo.get | https://mail.google.com/, gmail.modify |
| `gmail_users_settings_cse_identiti_patch` | write | gmail.users.settings.cse.identities.patch | gmail.settings.basic, gmail.settings.sharing |
| `gmail_users_settings_cse_identitie_list` | read | gmail.users.settings.cse.identities.list | https://mail.google.com/, gmail.modify |
| `gmail_users_settings_cse_identities_get` | read | gmail.users.settings.cse.identities.get | https://mail.google.com/, gmail.modify |
| `gmail_users_settings_cse_keypairs_get` | read | gmail.users.settings.cse.keypairs.get | https://mail.google.com/, gmail.modify |
| `gmail_users_settings_cse_keypairs_list` | read | gmail.users.settings.cse.keypairs.list | https://mail.google.com/, gmail.modify |
| `gmail_users_settings_delegates_create` | write | gmail.users.settings.delegates.create | gmail.settings.sharing |
| `gmail_users_settings_delegates_delete` | destructive | gmail.users.settings.delegates.delete | gmail.settings.sharing |
| `gmail_users_settings_delegates_get` | read | gmail.users.settings.delegates.get | https://mail.google.com/, gmail.modify |
| `gmail_users_settings_delegates_list` | read | gmail.users.settings.delegates.list | https://mail.google.com/, gmail.modify |
| `gmail_users_settings_filters_create` | write | gmail.users.settings.filters.create | gmail.settings.basic |
| `gmail_users_settings_filters_delete` | destructive | gmail.users.settings.filters.delete | gmail.settings.basic |
| `gmail_users_settings_filters_get` | read | gmail.users.settings.filters.get | https://mail.google.com/, gmail.modify |
| `gmail_users_settings_filters_list` | read | gmail.users.settings.filters.list | https://mail.google.com/, gmail.modify |
| `gmail_users_settings_forwarding_ad_list` | read | gmail.users.settings.forwardingAddresses.list | https://mail.google.com/, gmail.modify |
| `gmail_users_settings_forwarding_add_get` | read | gmail.users.settings.forwardingAddresses.get | https://mail.google.com/, gmail.modify |
| `gmail_users_settings_forwarding_create` | write | gmail.users.settings.forwardingAddresses.create | gmail.settings.sharing |
| `gmail_users_settings_forwarding_delete` | destructive | gmail.users.settings.forwardingAddresses.delete | gmail.settings.sharing |
| `gmail_users_settings_get_auto_forwardin` | read | gmail.users.settings.getAutoForwarding | https://mail.google.com/, gmail.modify |
| `gmail_users_settings_get_imap` | read | gmail.users.settings.getImap | https://mail.google.com/, gmail.modify |
| `gmail_users_settings_get_language` | read | gmail.users.settings.getLanguage | https://mail.google.com/, gmail.modify |
| `gmail_users_settings_get_pop` | read | gmail.users.settings.getPop | https://mail.google.com/, gmail.modify |
| `gmail_users_settings_get_vacation` | read | gmail.users.settings.getVacation | https://mail.google.com/, gmail.modify |
| `gmail_users_settings_send_as_create` | write | gmail.users.settings.sendAs.create | gmail.settings.sharing |
| `gmail_users_settings_send_as_delete` | destructive | gmail.users.settings.sendAs.delete | gmail.settings.sharing |
| `gmail_users_settings_send_as_get` | read | gmail.users.settings.sendAs.get | https://mail.google.com/, gmail.modify |
| `gmail_users_settings_send_as_list` | read | gmail.users.settings.sendAs.list | https://mail.google.com/, gmail.modify |
| `gmail_users_settings_send_as_patch` | write | gmail.users.settings.sendAs.patch | gmail.settings.basic, gmail.settings.sharing |
| `gmail_users_settings_send_as_update` | write | gmail.users.settings.sendAs.update | gmail.settings.basic, gmail.settings.sharing |
| `gmail_users_settings_send_as_verify` | write | gmail.users.settings.sendAs.verify | gmail.settings.sharing |
| `gmail_users_settings_update_auto_forwar` | write | gmail.users.settings.updateAutoForwarding | gmail.settings.sharing |
| `gmail_users_settings_update_imap` | write | gmail.users.settings.updateImap | gmail.settings.basic |
| `gmail_users_settings_update_language` | write | gmail.users.settings.updateLanguage | gmail.settings.basic |
| `gmail_users_settings_update_pop` | write | gmail.users.settings.updatePop | gmail.settings.basic |
| `gmail_users_settings_update_vacation` | write | gmail.users.settings.updateVacation | gmail.settings.basic |
| `gmail_users_stop` | destructive | gmail.users.stop | https://mail.google.com/, gmail.metadata |
| `gmail_users_threads_delete` | destructive | gmail.users.threads.delete | https://mail.google.com/ |
| `gmail_users_threads_get` | read | gmail.users.threads.get | https://mail.google.com/, gmail.addons.current.message.action |
| `gmail_users_threads_list` | read | gmail.users.threads.list | https://mail.google.com/, gmail.metadata |
| `gmail_users_threads_modify` | write | gmail.users.threads.modify | https://mail.google.com/, gmail.modify |
| `gmail_users_threads_trash` | destructive | gmail.users.threads.trash | https://mail.google.com/, gmail.modify |
| `gmail_users_threads_untrash` | write | gmail.users.threads.untrash | https://mail.google.com/, gmail.modify |
| `gmail_users_watch` | write | gmail.users.watch | https://mail.google.com/, gmail.metadata |
| `gmailpostm_domain_stats_batch_query` | write | gmailpostmastertools.domainStats.batchQuery | postmaster, postmaster.traffic.readonly |
| `gmailpostm_domains_create` | write | gmailpostmastertools.domains.create | postmaster, postmaster.domain |
| `gmailpostm_domains_delete` | destructive | gmailpostmastertools.domains.delete | postmaster, postmaster.domain |
| `gmailpostm_domains_domain_stats_query` | write | gmailpostmastertools.domains.domainStats.query | postmaster, postmaster.traffic.readonly |
| `gmailpostm_domains_get` | read | gmailpostmastertools.domains.get | postmaster, postmaster.domain |
| `gmailpostm_domains_get_compliance_statu` | read | gmailpostmastertools.domains.getComplianceStatus | postmaster, postmaster.traffic.readonly |
| `gmailpostm_domains_get_verification_tok` | read | gmailpostmastertools.domains.getVerificationToken | postmaster, postmaster.domain |
| `gmailpostm_domains_list` | read | gmailpostmastertools.domains.list | postmaster, postmaster.domain |
| `gmailpostm_domains_users_create` | write | gmailpostmastertools.domains.users.create | postmaster, postmaster.user |
| `gmailpostm_domains_users_delete` | destructive | gmailpostmastertools.domains.users.delete | postmaster, postmaster.user |
| `gmailpostm_domains_users_get` | read | gmailpostmastertools.domains.users.get | postmaster, postmaster.user |
| `gmailpostm_domains_users_list` | read | gmailpostmastertools.domains.users.list | postmaster, postmaster.user |
| `gmailpostm_domains_users_patch` | write | gmailpostmastertools.domains.users.patch | postmaster, postmaster.user |
| `gmailpostm_domains_verify` | write | gmailpostmastertools.domains.verify | postmaster, postmaster.domain |

## Gateway tools (3)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_call` | dynamic | Call an API method | (none) |
| `api_describe` | read | Describe an API method | (none) |
| `api_search` | read | Search API methods | (none) |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gmail: API methods | (none) |

## Generated APIs

- Gmail API (`gmail/v1`), 79 methods in the catalog
- Gmail Postmaster Tools API (`gmailpostmastertools/v2`), 14 methods in the catalog

## Gateway APIs (reached through api_search, api_describe, api_call)

- Gmail Postmaster Tools API (`gmailpostmastertools/v1`), 4 methods
- Gmail Postmaster Tools API (`gmailpostmastertools/v1beta1`), 4 methods

