# AI and ML (`gai`)

Generative and classic AI APIs: Discovery Engine, Vertex AI, Dialogflow, Vision, Speech, Translate, Document AI and agent services.

- Plugin: `gai`, MCP server: `gai`, login: Desktop OAuth client, then `login cloud`
- Install: `claude plugin install gai@google-services-mcps`
- Tools: 364 total. Curated 10, per-method 350, gateway 3. Read 170, write 132, destructive 61, dynamic 1.

Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).

Toolsets (the plugin option `toolset`, `GSM_TOOLSET`): all 364, google 13, curated 13 tools, each counting the 7 runtime tools this server registers (`account_remove`, `account_set_default`, `accounts_list`, `auth_login`, `auth_setup_client`, `auth_status`, `health`). "(all)" means the product has no such toolset yet, so it lists every tool.

## Not registered by this server (2)

The tool map (`plugins/<id>/tool-map.json`) also lists these, so the consent hook knows every name, but this server never registers them, and the counts above leave them out.

- Sign-in tools of other sign-in kinds: `auth_setup_admin`, `auth_setup_service_account`.

## Toolset google (6)

The tools that match Google's official MCP server for this product (https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/use-agent-platform-mcp, https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/mcp/tools_list/generate_content, https://docs.cloud.google.com/generative-ai-app-builder/docs/reference/mcp/tools_list/search).

| Tool | Google's tool | Note |
|---|---|---|
| `vertex_generate_content` | `generate_content` | The Vertex basics of Google's Agent Platform MCP server (its generate toolset). Google's other 53 Agent Platform tools (Colab Enterprise, notebook executions, endpoints, models, tuning, RAG, evaluation, prompts, predict and raw_predict) have no tool here and are not in this list; api_call reaches their methods in the all and curated toolsets. |
| `vertex_count_tokens` | `count_tokens` | countTokens on the model, or on an endpoint. Discovery lists only cloud-platform for it. |
| `vertex_embed_content` | `embed_content` | embedContent on a publisher embedding model, such as gemini-embedding-001. |
| `discoverye_engines_serving_configs_search` | `search` | Agent Search (Vertex AI Search) on an engine's serving config: Discovery Engine v1 servingConfigs.search. |
| `discoverye_engines_serving_configs_answer` | `conversational_search` | Discovery Engine v1 servingConfigs.answer. Google marks it read-only, and since 1.24.2 (D2) the suite counts it as a read too, so it does not ask. |
| `discoverye_collections_engines_list` | `list_engines` | The engines (search and chat apps) of a collection. |

## Curated tools (10)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `account_remove` | write | Remove a signed-in account | (none) |
| `account_set_default` | write | Set the default account | (none) |
| `accounts_list` | read | Signed-in accounts | (none) |
| `auth_login` | write | Sign in to Google | (none) |
| `auth_setup_client` | write | Save the Google OAuth client | (none) |
| `auth_status` | read | Sign-in status | (none) |
| `health` | read | Server health | (none) |
| `vertex_count_tokens` | read | Count the tokens of a Vertex AI prompt | cloud-platform |
| `vertex_embed_content` | read | Embed text with a Vertex AI model | aiplatform, cloud-platform |
| `vertex_generate_content` | read | Generate content with a Vertex AI model | aiplatform, cloud-platform |

## Per-method tools (350)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `dis_agents_a2a_tasks_push_notif_configs_get` | read | discoveryengine.projects.locations.collections.engines.assistants.agents.a2a.v1.tasks.pushNotificationConfigs.get | cloud-platform, discoveryengine.readwrite |
| `dis_engine_fetch_domain_verification_status` | read | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.fetchDomainVerificationStatus | cloud-platform, discoveryengine.readwrite |
| `dis_engines_assistants_agents_a2a_tasks_get` | read | discoveryengine.projects.locations.collections.engines.assistants.agents.a2a.v1.tasks.get | cloud-platform, discoveryengine.readwrite |
| `dis_stores_completion_config_complete_query` | write | discoveryengine.projects.locations.collections.dataStores.completionConfig.completeQuery | cloud-platform, cloud_search.query |
| `dis_stores_engine_batch_verify_target_sites` | write | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.batchVerifyTargetSites | cloud-platform, discoveryengine.readwrite |
| `disc_colls_stores_engine_sites_batch_create` | write | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.targetSites.batchCreate | cloud-platform, discoveryengine.readwrite |
| `disc_colls_stores_serving_configs_recommend` | write | discoveryengine.projects.locations.collections.dataStores.servingConfigs.recommend | cloud-platform, discoveryengine.readwrite |
| `disc_engines_assistants_agents_a2a_get_card` | read | discoveryengine.projects.locations.collections.engines.assistants.agents.a2a.v1.getCard | cloud-platform, discoveryengine.readwrite |
| `disco_assistants_agents_a2a_tasks_subscribe` | read | discoveryengine.projects.locations.collections.engines.assistants.agents.a2a.v1.tasks.subscribe | cloud-platform, discoveryengine.readwrite |
| `disco_collections_data_stores_search_engine` | read | discoveryengine.projects.locations.collections.dataStores.getSiteSearchEngine | cloud-platform, discoveryengine.readwrite |
| `disco_colls_data_stores_engine_site_search` | write | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.enableAdvancedSiteSearch | cloud-platform, discoveryengine.readwrite |
| `disco_engines_serving_configs_stream_answer` | write | discoveryengine.projects.locations.collections.engines.servingConfigs.streamAnswer | cloud-platform, discoveryengine.readwrite |
| `discov_a2a_tasks_push_notif_configs_create` | write | discoveryengine.projects.locations.collections.engines.assistants.agents.a2a.v1.tasks.pushNotificationConfigs.create | cloud-platform, discoveryengine.readwrite |
| `discov_a2a_tasks_push_notif_configs_delete` | destructive | discoveryengine.projects.locations.collections.engines.assistants.agents.a2a.v1.tasks.pushNotificationConfigs.delete | cloud-platform, discoveryengine.readwrite |
| `discov_assistants_agents_a2a_message_stream` | write | discoveryengine.projects.locations.collections.engines.assistants.agents.a2a.v1.message.stream | cloud-platform, discoveryengine.readwrite |
| `discov_colls_data_stores_engine_site_search` | write | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.disableAdvancedSiteSearch | cloud-platform, discoveryengine.readwrite |
| `discov_colls_stores_conversations_converse` | write | discoveryengine.projects.locations.collections.dataStores.conversations.converse | cloud-platform, discoveryengine.readwrite |
| `discov_colls_stores_engine_sitemaps_create` | write | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.sitemaps.create | cloud-platform, discoveryengine.readwrite |
| `discov_colls_stores_engine_sitemaps_delete` | destructive | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.sitemaps.delete | cloud-platform, discoveryengine.readwrite |
| `discov_colls_stores_serving_configs_answer` | read | discoveryengine.projects.locations.collections.dataStores.servingConfigs.answer | cloud-platform, discoveryengine.readwrite |
| `discov_colls_stores_serving_configs_create` | write | discoveryengine.projects.locations.collections.dataStores.servingConfigs.create | cloud-platform, discoveryengine.readwrite |
| `discov_colls_stores_serving_configs_delete` | destructive | discoveryengine.projects.locations.collections.dataStores.servingConfigs.delete | cloud-platform, discoveryengine.readwrite |
| `discov_colls_stores_serving_configs_search` | read | discoveryengine.projects.locations.collections.dataStores.servingConfigs.search | cloud-platform, discoveryengine.assist.readwrite |
| `discov_engine_disable_advanced_site_search` | write | discoveryengine.projects.locations.dataStores.siteSearchEngine.disableAdvancedSiteSearch | cloud-platform, discoveryengine.readwrite |
| `discov_engines_serving_configs_search_lite` | read | discoveryengine.projects.locations.collections.engines.servingConfigs.searchLite | cloud-platform, discoveryengine.assist.readwrite |
| `discov_stores_branches_batch_get_docs_meta` | read | discoveryengine.projects.locations.collections.dataStores.branches.batchGetDocumentsMetadata | cloud-platform, discoveryengine.readwrite |
| `discov_stores_serving_configs_stream_answer` | write | discoveryengine.projects.locations.collections.dataStores.servingConfigs.streamAnswer | cloud-platform, discoveryengine.readwrite |
| `discov_suggestion_deny_list_entries_import` | write | discoveryengine.projects.locations.dataStores.suggestionDenyListEntries.import | cloud-platform, discoveryengine.assist.readwrite |
| `discover_assistants_agents_a2a_message_send` | destructive | discoveryengine.projects.locations.collections.engines.assistants.agents.a2a.v1.message.send | cloud-platform, discoveryengine.readwrite |
| `discover_assistants_agents_a2a_tasks_cancel` | destructive | discoveryengine.projects.locations.collections.engines.assistants.agents.a2a.v1.tasks.cancel | cloud-platform, discoveryengine.readwrite |
| `discover_engine_enable_advanced_site_search` | write | discoveryengine.projects.locations.dataStores.siteSearchEngine.enableAdvancedSiteSearch | cloud-platform, discoveryengine.readwrite |
| `discover_stores_serving_configs_search_lite` | read | discoveryengine.projects.locations.collections.dataStores.servingConfigs.searchLite | cloud-platform, discoveryengine.assist.readwrite |
| `discover_suggestion_deny_list_entries_purge` | destructive | discoveryengine.projects.locations.dataStores.suggestionDenyListEntries.purge | cloud-platform, discoveryengine.assist.readwrite |
| `discovery_a2a_tasks_push_notif_configs_list` | read | discoveryengine.projects.locations.collections.engines.assistants.agents.a2a.v1.tasks.pushNotificationConfigs.list | cloud-platform, discoveryengine.readwrite |
| `discovery_collections_engines_controls_list` | read | discoveryengine.projects.locations.collections.engines.controls.list | cloud-platform, discoveryengine.readwrite |
| `discovery_collections_engines_sessions_list` | read | discoveryengine.projects.locations.collections.engines.sessions.list | cloud-platform, discoveryengine.assist.readwrite |
| `discovery_collections_update_data_connector` | write | discoveryengine.projects.locations.collections.updateDataConnector | cloud-platform, discoveryengine.assist.readwrite |
| `discovery_colls_data_stores_controls_create` | write | discoveryengine.projects.locations.collections.dataStores.controls.create | cloud-platform, discoveryengine.readwrite |
| `discovery_colls_data_stores_controls_delete` | destructive | discoveryengine.projects.locations.collections.dataStores.controls.delete | cloud-platform, discoveryengine.readwrite |
| `discovery_colls_data_stores_engine_ops_list` | read | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.operations.list | cloud-platform, discoveryengine.readwrite |
| `discovery_colls_data_stores_models_ops_list` | read | discoveryengine.projects.locations.collections.dataStores.models.operations.list | cloud-platform, discoveryengine.readwrite |
| `discovery_colls_data_stores_schemas_ops_get` | read | discoveryengine.projects.locations.collections.dataStores.schemas.operations.get | cloud-platform, discoveryengine.readwrite |
| `discovery_colls_data_stores_sessions_create` | write | discoveryengine.projects.locations.collections.dataStores.sessions.create | cloud-platform, discoveryengine.assist.readwrite |
| `discovery_colls_data_stores_sessions_delete` | destructive | discoveryengine.projects.locations.collections.dataStores.sessions.delete | cloud-platform, discoveryengine.assist.readwrite |
| `discovery_colls_engines_conversations_patch` | write | discoveryengine.projects.locations.collections.engines.conversations.patch | cloud-platform, discoveryengine.readwrite |
| `discovery_colls_engines_serving_configs_get` | read | discoveryengine.projects.locations.collections.engines.servingConfigs.get | cloud-platform, discoveryengine.readwrite |
| `discovery_colls_stores_branches_docs_create` | write | discoveryengine.projects.locations.collections.dataStores.branches.documents.create | cloud-platform, discoveryengine.readwrite |
| `discovery_colls_stores_branches_docs_delete` | destructive | discoveryengine.projects.locations.collections.dataStores.branches.documents.delete | cloud-platform, discoveryengine.readwrite |
| `discovery_colls_stores_branches_docs_import` | write | discoveryengine.projects.locations.collections.dataStores.branches.documents.import | cloud-platform, discoveryengine.readwrite |
| `discovery_colls_stores_conversations_create` | write | discoveryengine.projects.locations.collections.dataStores.conversations.create | cloud-platform, discoveryengine.readwrite |
| `discovery_colls_stores_conversations_delete` | destructive | discoveryengine.projects.locations.collections.dataStores.conversations.delete | cloud-platform, discoveryengine.readwrite |
| `discovery_colls_stores_engine_sites_ops_get` | read | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.targetSites.operations.get | cloud-platform, discoveryengine.readwrite |
| `discovery_colls_stores_serving_configs_list` | read | discoveryengine.projects.locations.collections.dataStores.servingConfigs.list | cloud-platform, discoveryengine.readwrite |
| `discovery_colls_stores_sessions_answers_get` | read | discoveryengine.projects.locations.collections.dataStores.sessions.answers.get | cloud-platform, discoveryengine.readwrite |
| `discovery_colls_stores_widget_configs_patch` | write | discoveryengine.projects.locations.collections.dataStores.widgetConfigs.patch | cloud-platform, discoveryengine.assist.readwrite |
| `discovery_data_stores_engine_sitemaps_fetch` | read | discoveryengine.projects.locations.dataStores.siteSearchEngine.sitemaps.fetch | cloud-platform, discoveryengine.readwrite |
| `discovery_data_stores_models_operations_get` | read | discoveryengine.projects.locations.dataStores.models.operations.get | cloud-platform, discoveryengine.readwrite |
| `discovery_data_stores_serving_configs_patch` | write | discoveryengine.projects.locations.dataStores.servingConfigs.patch | cloud-platform, discoveryengine.readwrite |
| `discovery_engines_assistants_agents_ops_get` | read | discoveryengine.projects.locations.collections.engines.assistants.agents.operations.get | cloud-platform, discoveryengine.readwrite |
| `discovery_engines_serving_configs_recommend` | write | discoveryengine.projects.locations.collections.engines.servingConfigs.recommend | cloud-platform, discoveryengine.readwrite |
| `discovery_projects_locations_get_acl_config` | read | discoveryengine.projects.locations.getAclConfig | cloud-platform, discoveryengine.readwrite |
| `discovery_projects_locations_operations_get` | read | discoveryengine.projects.locations.operations.get | cloud-platform, discoveryengine.readwrite |
| `discovery_stores_batch_update_user_licenses` | write | discoveryengine.projects.locations.userStores.batchUpdateUserLicenses | cloud-platform, discoveryengine.readwrite |
| `discoverye_branches_batch_get_docs_meta` | read | discoveryengine.projects.locations.dataStores.branches.batchGetDocumentsMetadata | cloud-platform, discoveryengine.readwrite |
| `discoverye_cmek_configs_delete` | destructive | discoveryengine.projects.locations.cmekConfigs.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_cmek_configs_get` | read | discoveryengine.projects.locations.cmekConfigs.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_cmek_configs_list` | read | discoveryengine.projects.locations.cmekConfigs.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_cmek_configs_patch` | write | discoveryengine.projects.locations.cmekConfigs.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_col_dat_sto_sug_den_lis_ent_impo` | write | discoveryengine.projects.locations.collections.dataStores.suggestionDenyListEntries.import | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_col_dat_sto_sug_den_lis_ent_purg` | destructive | discoveryengine.projects.locations.collections.dataStores.suggestionDenyListEntries.purge | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_collections_data_connector_mcp` | destructive | discoveryengine.projects.locations.collections.dataConnector.mcp | cloud-platform, discoveryengine.readwrite |
| `discoverye_collections_data_stores_create` | write | discoveryengine.projects.locations.collections.dataStores.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_collections_data_stores_delete` | destructive | discoveryengine.projects.locations.collections.dataStores.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_collections_data_stores_get` | read | discoveryengine.projects.locations.collections.dataStores.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_collections_data_stores_list` | read | discoveryengine.projects.locations.collections.dataStores.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_collections_data_stores_patch` | write | discoveryengine.projects.locations.collections.dataStores.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_collections_delete` | destructive | discoveryengine.projects.locations.collections.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_collections_engines_controls_get` | read | discoveryengine.projects.locations.collections.engines.controls.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_collections_engines_create` | write | discoveryengine.projects.locations.collections.engines.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_collections_engines_delete` | destructive | discoveryengine.projects.locations.collections.engines.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_collections_engines_get` | read | discoveryengine.projects.locations.collections.engines.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_collections_engines_list` | read | discoveryengine.projects.locations.collections.engines.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_collections_engines_patch` | write | discoveryengine.projects.locations.collections.engines.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_collections_engines_sessions_get` | read | discoveryengine.projects.locations.collections.engines.sessions.get | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_collections_get_data_connector` | read | discoveryengine.projects.locations.collections.getDataConnector | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_collections_get_iam_policy` | read | discoveryengine.projects.locations.collections.getIamPolicy | cloud-platform, discoveryengine.readwrite |
| `discoverye_collections_operations_get` | read | discoveryengine.projects.locations.collections.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_collections_operations_list` | read | discoveryengine.projects.locations.collections.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_collections_set_iam_policy` | destructive | discoveryengine.projects.locations.collections.setIamPolicy | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_data_connector_ops_get` | read | discoveryengine.projects.locations.collections.dataConnector.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_data_connector_ops_list` | read | discoveryengine.projects.locations.collections.dataConnector.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_data_stores_complete_query` | read | discoveryengine.projects.locations.collections.dataStores.completeQuery | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_colls_data_stores_controls_get` | read | discoveryengine.projects.locations.collections.dataStores.controls.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_data_stores_controls_list` | read | discoveryengine.projects.locations.collections.dataStores.controls.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_data_stores_controls_patch` | write | discoveryengine.projects.locations.collections.dataStores.controls.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_data_stores_engine_ops_get` | read | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_data_stores_get_iam_policy` | read | discoveryengine.projects.locations.collections.dataStores.getIamPolicy | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_data_stores_models_list` | read | discoveryengine.projects.locations.collections.dataStores.customModels.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_data_stores_models_ops_get` | read | discoveryengine.projects.locations.collections.dataStores.models.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_data_stores_ops_get` | read | discoveryengine.projects.locations.collections.dataStores.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_data_stores_ops_list` | read | discoveryengine.projects.locations.collections.dataStores.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_data_stores_schemas_create` | write | discoveryengine.projects.locations.collections.dataStores.schemas.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_data_stores_schemas_delete` | destructive | discoveryengine.projects.locations.collections.dataStores.schemas.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_data_stores_schemas_get` | read | discoveryengine.projects.locations.collections.dataStores.schemas.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_data_stores_schemas_list` | read | discoveryengine.projects.locations.collections.dataStores.schemas.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_data_stores_schemas_patch` | write | discoveryengine.projects.locations.collections.dataStores.schemas.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_data_stores_sessions_get` | read | discoveryengine.projects.locations.collections.dataStores.sessions.get | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_colls_data_stores_sessions_list` | read | discoveryengine.projects.locations.collections.dataStores.sessions.list | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_colls_data_stores_sessions_patch` | write | discoveryengine.projects.locations.collections.dataStores.sessions.patch | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_colls_data_stores_set_iam_policy` | destructive | discoveryengine.projects.locations.collections.dataStores.setIamPolicy | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_engines_assistants_create` | write | discoveryengine.projects.locations.collections.engines.assistants.create | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_colls_engines_assistants_delete` | destructive | discoveryengine.projects.locations.collections.engines.assistants.delete | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_colls_engines_assistants_get` | read | discoveryengine.projects.locations.collections.engines.assistants.get | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_colls_engines_assistants_list` | read | discoveryengine.projects.locations.collections.engines.assistants.list | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_colls_engines_assistants_patch` | write | discoveryengine.projects.locations.collections.engines.assistants.patch | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_colls_engines_controls_create` | write | discoveryengine.projects.locations.collections.engines.controls.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_engines_controls_delete` | destructive | discoveryengine.projects.locations.collections.engines.controls.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_engines_controls_patch` | write | discoveryengine.projects.locations.collections.engines.controls.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_engines_conversations_get` | read | discoveryengine.projects.locations.collections.engines.conversations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_engines_conversations_list` | read | discoveryengine.projects.locations.collections.engines.conversations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_engines_get_iam_policy` | read | discoveryengine.projects.locations.collections.engines.getIamPolicy | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_engines_ops_cancel` | destructive | discoveryengine.projects.locations.collections.engines.operations.cancel | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_engines_ops_get` | read | discoveryengine.projects.locations.collections.engines.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_engines_ops_list` | read | discoveryengine.projects.locations.collections.engines.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_engines_sessions_create` | write | discoveryengine.projects.locations.collections.engines.sessions.create | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_colls_engines_sessions_delete` | destructive | discoveryengine.projects.locations.collections.engines.sessions.delete | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_colls_engines_sessions_patch` | write | discoveryengine.projects.locations.collections.engines.sessions.patch | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_colls_engines_set_iam_policy` | destructive | discoveryengine.projects.locations.collections.engines.setIamPolicy | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_engines_widget_configs_get` | read | discoveryengine.projects.locations.collections.engines.widgetConfigs.get | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_colls_stores_branches_docs_get` | read | discoveryengine.projects.locations.collections.dataStores.branches.documents.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_stores_branches_docs_list` | read | discoveryengine.projects.locations.collections.dataStores.branches.documents.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_stores_branches_docs_patch` | write | discoveryengine.projects.locations.collections.dataStores.branches.documents.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_stores_branches_docs_purge` | destructive | discoveryengine.projects.locations.collections.dataStores.branches.documents.purge | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_stores_branches_ops_cancel` | destructive | discoveryengine.projects.locations.collections.dataStores.branches.operations.cancel | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_stores_branches_ops_get` | read | discoveryengine.projects.locations.collections.dataStores.branches.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_stores_branches_ops_list` | read | discoveryengine.projects.locations.collections.dataStores.branches.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_stores_conversations_get` | read | discoveryengine.projects.locations.collections.dataStores.conversations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_stores_conversations_list` | read | discoveryengine.projects.locations.collections.dataStores.conversations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_stores_conversations_patch` | write | discoveryengine.projects.locations.collections.dataStores.conversations.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_stores_engine_recrawl_uris` | write | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.recrawlUris | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_stores_engine_sites_create` | write | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.targetSites.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_stores_engine_sites_delete` | destructive | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.targetSites.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_stores_engine_sites_get` | read | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.targetSites.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_stores_engine_sites_list` | read | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.targetSites.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_stores_engine_sites_patch` | write | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.targetSites.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_stores_schemas_ops_list` | read | discoveryengine.projects.locations.collections.dataStores.schemas.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_stores_serving_configs_get` | read | discoveryengine.projects.locations.collections.dataStores.servingConfigs.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_stores_suggestions_import` | write | discoveryengine.projects.locations.collections.dataStores.completionSuggestions.import | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_colls_stores_suggestions_purge` | destructive | discoveryengine.projects.locations.collections.dataStores.completionSuggestions.purge | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_colls_stores_train_custom_model` | write | discoveryengine.projects.locations.collections.dataStores.trainCustomModel | cloud-platform, discoveryengine.readwrite |
| `discoverye_colls_stores_user_events_collect` | write | discoveryengine.projects.locations.collections.dataStores.userEvents.collect | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_colls_stores_user_events_import` | write | discoveryengine.projects.locations.collections.dataStores.userEvents.import | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_colls_stores_user_events_purge` | destructive | discoveryengine.projects.locations.collections.dataStores.userEvents.purge | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_colls_stores_user_events_write` | write | discoveryengine.projects.locations.collections.dataStores.userEvents.write | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_colls_stores_widget_configs_get` | read | discoveryengine.projects.locations.collections.dataStores.widgetConfigs.get | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_completion_config_complete_query` | write | discoveryengine.projects.locations.dataStores.completionConfig.completeQuery | cloud-platform, cloud_search.query |
| `discoverye_data_stores_branches_docs_create` | write | discoveryengine.projects.locations.dataStores.branches.documents.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_branches_docs_delete` | destructive | discoveryengine.projects.locations.dataStores.branches.documents.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_branches_docs_get` | read | discoveryengine.projects.locations.dataStores.branches.documents.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_branches_docs_import` | write | discoveryengine.projects.locations.dataStores.branches.documents.import | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_branches_docs_list` | read | discoveryengine.projects.locations.dataStores.branches.documents.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_branches_docs_patch` | write | discoveryengine.projects.locations.dataStores.branches.documents.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_branches_docs_purge` | destructive | discoveryengine.projects.locations.dataStores.branches.documents.purge | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_branches_ops_cancel` | destructive | discoveryengine.projects.locations.dataStores.branches.operations.cancel | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_branches_ops_get` | read | discoveryengine.projects.locations.dataStores.branches.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_branches_ops_list` | read | discoveryengine.projects.locations.dataStores.branches.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_complete_query` | read | discoveryengine.projects.locations.dataStores.completeQuery | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_data_stores_controls_create` | write | discoveryengine.projects.locations.dataStores.controls.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_controls_delete` | destructive | discoveryengine.projects.locations.dataStores.controls.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_controls_get` | read | discoveryengine.projects.locations.dataStores.controls.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_controls_list` | read | discoveryengine.projects.locations.dataStores.controls.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_controls_patch` | write | discoveryengine.projects.locations.dataStores.controls.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_conversations_create` | write | discoveryengine.projects.locations.dataStores.conversations.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_conversations_delete` | destructive | discoveryengine.projects.locations.dataStores.conversations.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_conversations_get` | read | discoveryengine.projects.locations.dataStores.conversations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_conversations_list` | read | discoveryengine.projects.locations.dataStores.conversations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_conversations_patch` | write | discoveryengine.projects.locations.dataStores.conversations.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_create` | write | discoveryengine.projects.locations.dataStores.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_delete` | destructive | discoveryengine.projects.locations.dataStores.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_engine_recrawl_uris` | write | discoveryengine.projects.locations.dataStores.siteSearchEngine.recrawlUris | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_engine_sites_create` | write | discoveryengine.projects.locations.dataStores.siteSearchEngine.targetSites.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_engine_sites_delete` | destructive | discoveryengine.projects.locations.dataStores.siteSearchEngine.targetSites.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_engine_sites_get` | read | discoveryengine.projects.locations.dataStores.siteSearchEngine.targetSites.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_engine_sites_list` | read | discoveryengine.projects.locations.dataStores.siteSearchEngine.targetSites.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_engine_sites_patch` | write | discoveryengine.projects.locations.dataStores.siteSearchEngine.targetSites.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_get` | read | discoveryengine.projects.locations.dataStores.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_get_iam_policy` | read | discoveryengine.projects.locations.dataStores.getIamPolicy | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_list` | read | discoveryengine.projects.locations.dataStores.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_models_ops_list` | read | discoveryengine.projects.locations.dataStores.models.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_operations_get` | read | discoveryengine.projects.locations.dataStores.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_operations_list` | read | discoveryengine.projects.locations.dataStores.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_patch` | write | discoveryengine.projects.locations.dataStores.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_schemas_create` | write | discoveryengine.projects.locations.dataStores.schemas.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_schemas_delete` | destructive | discoveryengine.projects.locations.dataStores.schemas.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_schemas_get` | read | discoveryengine.projects.locations.dataStores.schemas.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_schemas_list` | read | discoveryengine.projects.locations.dataStores.schemas.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_schemas_patch` | write | discoveryengine.projects.locations.dataStores.schemas.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_serving_configs_get` | read | discoveryengine.projects.locations.dataStores.servingConfigs.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_serving_configs_list` | read | discoveryengine.projects.locations.dataStores.servingConfigs.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_sessions_answers_get` | read | discoveryengine.projects.locations.dataStores.sessions.answers.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_sessions_create` | write | discoveryengine.projects.locations.dataStores.sessions.create | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_data_stores_sessions_delete` | destructive | discoveryengine.projects.locations.dataStores.sessions.delete | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_data_stores_sessions_get` | read | discoveryengine.projects.locations.dataStores.sessions.get | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_data_stores_sessions_list` | read | discoveryengine.projects.locations.dataStores.sessions.list | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_data_stores_sessions_patch` | write | discoveryengine.projects.locations.dataStores.sessions.patch | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_data_stores_set_iam_policy` | destructive | discoveryengine.projects.locations.dataStores.setIamPolicy | cloud-platform, discoveryengine.readwrite |
| `discoverye_data_stores_suggestions_import` | write | discoveryengine.projects.locations.dataStores.completionSuggestions.import | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_data_stores_suggestions_purge` | destructive | discoveryengine.projects.locations.dataStores.completionSuggestions.purge | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_data_stores_user_events_collect` | write | discoveryengine.projects.locations.dataStores.userEvents.collect | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_data_stores_user_events_import` | write | discoveryengine.projects.locations.dataStores.userEvents.import | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_data_stores_user_events_purge` | destructive | discoveryengine.projects.locations.dataStores.userEvents.purge | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_data_stores_user_events_write` | write | discoveryengine.projects.locations.dataStores.userEvents.write | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_data_stores_widget_configs_get` | read | discoveryengine.projects.locations.dataStores.widgetConfigs.get | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_data_stores_widget_configs_patch` | write | discoveryengine.projects.locations.dataStores.widgetConfigs.patch | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_distribute_license_config` | write | discoveryengine.billingAccounts.billingAccountLicenseConfigs.distributeLicenseConfig | cloud-platform, discoveryengine.readwrite |
| `discoverye_engines_assistants_stream_assist` | write | discoveryengine.projects.locations.collections.engines.assistants.streamAssist | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_engines_conversations_converse` | write | discoveryengine.projects.locations.collections.engines.conversations.converse | cloud-platform, discoveryengine.readwrite |
| `discoverye_engines_conversations_create` | write | discoveryengine.projects.locations.collections.engines.conversations.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_engines_conversations_delete` | destructive | discoveryengine.projects.locations.collections.engines.conversations.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_engines_serving_configs_answer` | read | discoveryengine.projects.locations.collections.engines.servingConfigs.answer | cloud-platform, discoveryengine.readwrite |
| `discoverye_engines_serving_configs_create` | write | discoveryengine.projects.locations.collections.engines.servingConfigs.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_engines_serving_configs_delete` | destructive | discoveryengine.projects.locations.collections.engines.servingConfigs.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_engines_serving_configs_list` | read | discoveryengine.projects.locations.collections.engines.servingConfigs.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_engines_serving_configs_patch` | write | discoveryengine.projects.locations.collections.engines.servingConfigs.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_engines_serving_configs_search` | read | discoveryengine.projects.locations.collections.engines.servingConfigs.search | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_engines_sessions_answers_get` | read | discoveryengine.projects.locations.collections.engines.sessions.answers.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_engines_widget_configs_patch` | write | discoveryengine.projects.locations.collections.engines.widgetConfigs.patch | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_get_cmek_config` | read | discoveryengine.projects.locations.getCmekConfig | cloud-platform, discoveryengine.readwrite |
| `discoverye_grounding_configs_check` | read | discoveryengine.projects.locations.groundingConfigs.check | cloud-platform, discoveryengine.readwrite |
| `discoverye_identity_mapping_stores_create` | write | discoveryengine.projects.locations.identityMappingStores.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_identity_mapping_stores_delete` | destructive | discoveryengine.projects.locations.identityMappingStores.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_identity_mapping_stores_get` | read | discoveryengine.projects.locations.identityMappingStores.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_identity_mapping_stores_list` | read | discoveryengine.projects.locations.identityMappingStores.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_identity_mapping_stores_ops_get` | read | discoveryengine.projects.locations.identityMappingStores.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_identity_mapping_stores_ops_list` | read | discoveryengine.projects.locations.identityMappingStores.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_license_configs_create` | write | discoveryengine.projects.locations.licenseConfigs.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_license_configs_get` | read | discoveryengine.projects.locations.licenseConfigs.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_license_configs_list` | read | discoveryengine.projects.locations.licenseConfigs.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_license_configs_patch` | write | discoveryengine.projects.locations.licenseConfigs.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_operations_list` | read | discoveryengine.projects.locations.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_podcasts_operations_get` | read | discoveryengine.projects.locations.podcasts.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_col_eng_com_con_com_quer` | write | discoveryengine.projects.locations.collections.engines.completionConfig.completeQuery | cloud-platform, cloud_search.query |
| `discoverye_projects_locations_provision` | write | discoveryengine.projects.locations.provision | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_operations_cancel` | destructive | discoveryengine.projects.operations.cancel | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_operations_get` | read | discoveryengine.projects.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_operations_list` | read | discoveryengine.projects.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_provision` | write | discoveryengine.projects.provision | cloud-platform, discoveryengine.readwrite |
| `discoverye_ranking_configs_rank` | write | discoveryengine.projects.locations.rankingConfigs.rank | cloud-platform, discoveryengine.readwrite |
| `discoverye_retract_license_config` | write | discoveryengine.billingAccounts.billingAccountLicenseConfigs.retractLicenseConfig | cloud-platform, discoveryengine.readwrite |
| `discoverye_serving_configs_search_lite` | read | discoveryengine.projects.locations.dataStores.servingConfigs.searchLite | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_serving_configs_stream_answer` | write | discoveryengine.projects.locations.dataStores.servingConfigs.streamAnswer | cloud-platform, discoveryengine.readwrite |
| `discoverye_set_up_data_connector` | write | discoveryengine.projects.locations.setUpDataConnector | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_set_up_data_connector_v2` | write | discoveryengine.projects.locations.setUpDataConnectorV2 | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_stores_conversations_converse` | write | discoveryengine.projects.locations.dataStores.conversations.converse | cloud-platform, discoveryengine.readwrite |
| `discoverye_stores_engine_sitemaps_create` | write | discoveryengine.projects.locations.dataStores.siteSearchEngine.sitemaps.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_stores_engine_sitemaps_delete` | destructive | discoveryengine.projects.locations.dataStores.siteSearchEngine.sitemaps.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_stores_engine_sitemaps_fetch` | read | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.sitemaps.fetch | cloud-platform, discoveryengine.readwrite |
| `discoverye_stores_engine_sites_batch_create` | write | discoveryengine.projects.locations.dataStores.siteSearchEngine.targetSites.batchCreate | cloud-platform, discoveryengine.readwrite |
| `discoverye_stores_engine_sites_ops_list` | read | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.targetSites.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_stores_get_site_search_engine` | read | discoveryengine.projects.locations.dataStores.getSiteSearchEngine | cloud-platform, discoveryengine.readwrite |
| `discoverye_stores_import_identity_mappings` | write | discoveryengine.projects.locations.identityMappingStores.importIdentityMappings | cloud-platform, discoveryengine.readwrite |
| `discoverye_stores_list_identity_mappings` | read | discoveryengine.projects.locations.identityMappingStores.listIdentityMappings | cloud-platform, discoveryengine.readwrite |
| `discoverye_stores_purge_identity_mappings` | write | discoveryengine.projects.locations.identityMappingStores.purgeIdentityMappings | cloud-platform, discoveryengine.readwrite |
| `discoverye_stores_serving_configs_answer` | read | discoveryengine.projects.locations.dataStores.servingConfigs.answer | cloud-platform, discoveryengine.readwrite |
| `discoverye_stores_serving_configs_create` | write | discoveryengine.projects.locations.dataStores.servingConfigs.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_stores_serving_configs_delete` | destructive | discoveryengine.projects.locations.dataStores.servingConfigs.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_stores_serving_configs_patch` | write | discoveryengine.projects.locations.collections.dataStores.servingConfigs.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_stores_serving_configs_recommend` | write | discoveryengine.projects.locations.dataStores.servingConfigs.recommend | cloud-platform, discoveryengine.readwrite |
| `discoverye_stores_serving_configs_search` | read | discoveryengine.projects.locations.dataStores.servingConfigs.search | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_update_acl_config` | write | discoveryengine.projects.locations.updateAclConfig | cloud-platform, discoveryengine.readwrite |
| `discoverye_update_cmek_config` | write | discoveryengine.projects.locations.updateCmekConfig | cloud-platform, discoveryengine.readwrite |
| `discoverye_user_events_collect` | write | discoveryengine.projects.locations.userEvents.collect | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_user_events_import` | write | discoveryengine.projects.locations.userEvents.import | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_user_events_write` | write | discoveryengine.projects.locations.userEvents.write | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_user_stores_get` | read | discoveryengine.projects.locations.userStores.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_user_stores_patch` | write | discoveryengine.projects.locations.userStores.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_user_stores_stats_list` | read | discoveryengine.projects.locations.userStores.licenseConfigsUsageStats.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_user_stores_user_licenses_list` | read | discoveryengine.projects.locations.userStores.userLicenses.list | cloud-platform, discoveryengine.readwrite |
| `language_documents_analyze_entities` | read | language.documents.analyzeEntities | cloud-language, cloud-platform |
| `language_documents_analyze_sentiment` | read | language.documents.analyzeSentiment | cloud-language, cloud-platform |
| `language_documents_annotate_text` | read | language.documents.annotateText | cloud-language, cloud-platform |
| `language_documents_classify_text` | read | language.documents.classifyText | cloud-language, cloud-platform |
| `language_documents_moderate_text` | read | language.documents.moderateText | cloud-language, cloud-platform |
| `speech_custom_classes_create` | write | speech.projects.locations.customClasses.create | cloud-platform |
| `speech_custom_classes_delete` | destructive | speech.projects.locations.customClasses.delete | cloud-platform |
| `speech_custom_classes_get` | read | speech.projects.locations.customClasses.get | cloud-platform |
| `speech_custom_classes_list` | read | speech.projects.locations.customClasses.list | cloud-platform |
| `speech_custom_classes_patch` | write | speech.projects.locations.customClasses.patch | cloud-platform |
| `speech_operations_get` | read | speech.operations.get | cloud-platform |
| `speech_operations_list` | read | speech.operations.list | cloud-platform |
| `speech_phrase_sets_create` | write | speech.projects.locations.phraseSets.create | cloud-platform |
| `speech_phrase_sets_delete` | destructive | speech.projects.locations.phraseSets.delete | cloud-platform |
| `speech_projects_locations_phrase_sets_get` | read | speech.projects.locations.phraseSets.get | cloud-platform |
| `speech_projects_locations_phrase_sets_list` | read | speech.projects.locations.phraseSets.list | cloud-platform |
| `speech_projects_locations_phrase_sets_patch` | write | speech.projects.locations.phraseSets.patch | cloud-platform |
| `speech_speech_longrunningrecognize` | write | speech.speech.longrunningrecognize | cloud-platform |
| `speech_speech_recognize` | read | speech.speech.recognize | cloud-platform |
| `texttospe_projects_locations_operations_get` | read | texttospeech.projects.locations.operations.get | cloud-platform |
| `texttospee_operations_cancel` | destructive | texttospeech.operations.cancel | cloud-platform |
| `texttospee_operations_delete` | destructive | texttospeech.operations.delete | cloud-platform |
| `texttospee_operations_list` | read | texttospeech.projects.locations.operations.list | cloud-platform |
| `texttospee_synthesize_long_audio` | write | texttospeech.projects.locations.synthesizeLongAudio | cloud-platform |
| `texttospee_text_synthesize` | read | texttospeech.text.synthesize | cloud-platform |
| `texttospee_voices_list` | read | texttospeech.voices.list | cloud-platform |
| `videointe_projects_locations_operations_get` | read | videointelligence.projects.locations.operations.get | cloud-platform |
| `videointel_operations_cancel` | destructive | videointelligence.projects.locations.operations.cancel | cloud-platform |
| `videointel_operations_delete` | destructive | videointelligence.projects.locations.operations.delete | cloud-platform |
| `videointel_operations_list` | read | videointelligence.projects.locations.operations.list | cloud-platform |
| `videointel_operations_operations_cancel` | destructive | videointelligence.operations.projects.locations.operations.cancel | cloud-platform |
| `videointel_operations_operations_delete` | destructive | videointelligence.operations.projects.locations.operations.delete | cloud-platform |
| `videointel_operations_operations_get` | read | videointelligence.operations.projects.locations.operations.get | cloud-platform |
| `videointel_videos_annotate` | write | videointelligence.videos.annotate | cloud-platform |
| `vis_projects_locations_files_batch_annotate` | write | vision.projects.locations.files.asyncBatchAnnotate | cloud-platform, cloud-vision |
| `vision_files_annotate` | read | vision.files.annotate | cloud-platform, cloud-vision |
| `vision_files_async_batch_annotate` | write | vision.files.asyncBatchAnnotate | cloud-platform, cloud-vision |
| `vision_images_annotate` | read | vision.images.annotate | cloud-platform, cloud-vision |
| `vision_images_async_batch_annotate` | write | vision.images.asyncBatchAnnotate | cloud-platform, cloud-vision |
| `vision_locations_operations_get` | read | vision.locations.operations.get | cloud-platform, cloud-vision |
| `vision_operations_cancel` | destructive | vision.operations.cancel | cloud-platform, cloud-vision |
| `vision_operations_delete` | destructive | vision.operations.delete | cloud-platform, cloud-vision |
| `vision_operations_get` | read | vision.operations.get | cloud-platform, cloud-vision |
| `vision_operations_list` | read | vision.operations.list | cloud-platform, cloud-vision |
| `vision_product_sets_add_product` | write | vision.projects.locations.productSets.addProduct | cloud-platform, cloud-vision |
| `vision_product_sets_create` | write | vision.projects.locations.productSets.create | cloud-platform, cloud-vision |
| `vision_product_sets_delete` | destructive | vision.projects.locations.productSets.delete | cloud-platform, cloud-vision |
| `vision_product_sets_import` | write | vision.projects.locations.productSets.import | cloud-platform, cloud-vision |
| `vision_product_sets_patch` | write | vision.projects.locations.productSets.patch | cloud-platform, cloud-vision |
| `vision_product_sets_products_list` | read | vision.projects.locations.productSets.products.list | cloud-platform, cloud-vision |
| `vision_product_sets_remove_product` | write | vision.projects.locations.productSets.removeProduct | cloud-platform, cloud-vision |
| `vision_products_reference_images_create` | write | vision.projects.locations.products.referenceImages.create | cloud-platform, cloud-vision |
| `vision_products_reference_images_delete` | destructive | vision.projects.locations.products.referenceImages.delete | cloud-platform, cloud-vision |
| `vision_products_reference_images_get` | read | vision.projects.locations.products.referenceImages.get | cloud-platform, cloud-vision |
| `vision_products_reference_images_list` | read | vision.projects.locations.products.referenceImages.list | cloud-platform, cloud-vision |
| `vision_proje_locat_image_async_batch_annota` | write | vision.projects.locations.images.asyncBatchAnnotate | cloud-platform, cloud-vision |
| `vision_projects_files_annotate` | read | vision.projects.files.annotate | cloud-platform, cloud-vision |
| `vision_projects_files_async_batch_annotate` | write | vision.projects.files.asyncBatchAnnotate | cloud-platform, cloud-vision |
| `vision_projects_images_annotate` | read | vision.projects.images.annotate | cloud-platform, cloud-vision |
| `vision_projects_images_async_batch_annotate` | write | vision.projects.images.asyncBatchAnnotate | cloud-platform, cloud-vision |
| `vision_projects_locations_files_annotate` | read | vision.projects.locations.files.annotate | cloud-platform, cloud-vision |
| `vision_projects_locations_images_annotate` | read | vision.projects.locations.images.annotate | cloud-platform, cloud-vision |
| `vision_projects_locations_operations_get` | read | vision.projects.locations.operations.get | cloud-platform, cloud-vision |
| `vision_projects_locations_product_sets_get` | read | vision.projects.locations.productSets.get | cloud-platform, cloud-vision |
| `vision_projects_locations_product_sets_list` | read | vision.projects.locations.productSets.list | cloud-platform, cloud-vision |
| `vision_projects_locations_products_create` | write | vision.projects.locations.products.create | cloud-platform, cloud-vision |
| `vision_projects_locations_products_delete` | destructive | vision.projects.locations.products.delete | cloud-platform, cloud-vision |
| `vision_projects_locations_products_get` | read | vision.projects.locations.products.get | cloud-platform, cloud-vision |
| `vision_projects_locations_products_list` | read | vision.projects.locations.products.list | cloud-platform, cloud-vision |
| `vision_projects_locations_products_patch` | write | vision.projects.locations.products.patch | cloud-platform, cloud-vision |
| `vision_projects_locations_products_purge` | destructive | vision.projects.locations.products.purge | cloud-platform, cloud-vision |
| `vision_projects_operations_get` | read | vision.projects.operations.get | cloud-platform, cloud-vision |

## Gateway tools (3)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_call` | dynamic | Call an API method | (none) |
| `api_describe` | read | Describe an API method | (none) |
| `api_search` | read | Search API methods | (none) |

## Listing tool (1)

| Tool | Safety | Method or purpose | Scopes |
|---|---|---|---|
| `api_methods` | read | gai: API methods | (none) |

## Generated APIs

Each API links to Google's documentation for it, as Google's Discovery directory names it (`documentationLink`, kept in `data/catalog.json`). The link is the API's documentation home, not a page per method: the directory gives no link per method, and Google's REST reference pages are laid out differently from product to product.

- Discovery Engine API (`discoveryengine/v1`), 278 methods in the catalog. Documentation: <https://cloud.google.com/generative-ai-app-builder/docs/>
- Cloud Vision API (`vision/v1`), 38 methods in the catalog. Documentation: <https://cloud.google.com/vision/>
- Cloud Speech-to-Text API (`speech/v1`), 14 methods in the catalog. Documentation: <https://cloud.google.com/speech-to-text/docs/quickstart-protocol>
- Cloud Text-to-Speech API (`texttospeech/v1`), 7 methods in the catalog. Documentation: <https://cloud.google.com/text-to-speech/>
- Cloud Natural Language API (`language/v2`), 5 methods in the catalog. Documentation: <https://cloud.google.com/natural-language/>
- Cloud Video Intelligence API (`videointelligence/v1`), 8 methods in the catalog. Documentation: <https://cloud.google.com/video-intelligence/docs/>

## Gateway APIs (reached through api_search, api_describe, api_call)

- Cloud Translation API (`translate/v3`), 51 methods. Documentation: <https://cloud.google.com/translate/docs/quickstarts>
- Cloud Document AI API (`documentai/v1`), 42 methods. Documentation: <https://cloud.google.com/document-ai/docs/>
- Dialogflow API (`dialogflow/v3`), 158 methods. Documentation: <https://cloud.google.com/dialogflow/>
- Gemini Enterprise for Customer Experience API (`ces/v1`), 73 methods. Documentation: <https://docs.cloud.google.com/customer-engagement-ai/conversational-agents/ps>
- Agent Registry API (`agentregistry/v1`), 53 methods. Documentation: <https://docs.cloud.google.com/agent-registry/overview>
- Agent Identity API (`agentidentity/v1`), 25 methods. Documentation: <https://cloud.google.com/iam/docs/>
- Agent Identity Credentials API (`agentidentitycredentials/v1`), 2 methods. Documentation: <https://cloud.google.com/iam/docs/>
- AI Platform Training & Prediction API (`ml/v1`), 46 methods. Documentation: <https://cloud.google.com/ml/>
- Notebooks API (`notebooks/v2`), 28 methods. Documentation: <https://cloud.google.com/notebooks/docs/>
- AI Commerce Search API (`retail/v2`), 71 methods. Documentation: <https://cloud.google.com/recommendations>
- Contact Center AI Insights API (`contactcenterinsights/v1`), 188 methods. Documentation: <https://cloud.google.com/contact-center/insights/docs>
- Contact Center AI Platform API (`contactcenteraiplatform/v1alpha1`), 13 methods. Documentation: <https://cloud.google.com/solutions/contact-center-ai-platform>
- Cloud Talent Solution API (`jobs/v4`), 23 methods. Documentation: <https://cloud.google.com/talent-solution/job-search/docs/>
- Recommendations AI (Beta) (`recommendationengine/v1beta1`), 22 methods. Documentation: <https://cloud.google.com/recommendations-ai/docs>
- Agent Platform API (`aiplatform/v1`), 1143 methods. Documentation: <https://cloud.google.com/vertex-ai/>
- Agent Identity API (`agentidentity/v1alpha`), 25 methods. Documentation: <https://cloud.google.com/iam/docs/>
- Agent Identity API (`agentidentity/v1beta`), 25 methods. Documentation: <https://cloud.google.com/iam/docs/>
- Agent Identity Credentials API (`agentidentitycredentials/v1alpha`), 3 methods. Documentation: <https://cloud.google.com/iam/docs/>
- Agent Identity Credentials API (`agentidentitycredentials/v1beta`), 2 methods. Documentation: <https://cloud.google.com/iam/docs/>
- Agent Registry API (`agentregistry/v1alpha`), 53 methods. Documentation: <https://docs.cloud.google.com/agent-registry/overview>
- Agent Platform API (`aiplatform/v1beta1`), 1559 methods. Documentation: <https://cloud.google.com/vertex-ai/>
- Gemini Enterprise for Customer Experience API (`ces/v1beta`), 117 methods. Documentation: <https://docs.cloud.google.com/customer-engagement-ai/conversational-agents/ps>
- Dialogflow API (`dialogflow/v2`), 284 methods. Documentation: <https://cloud.google.com/dialogflow/>
- Dialogflow API (`dialogflow/v2beta1`), 271 methods. Documentation: <https://cloud.google.com/dialogflow/>
- Dialogflow API (`dialogflow/v3beta1`), 162 methods. Documentation: <https://cloud.google.com/dialogflow/>
- Discovery Engine API (`discoveryengine/v1alpha`), 386 methods. Documentation: <https://cloud.google.com/generative-ai-app-builder/docs/>
- Discovery Engine API (`discoveryengine/v1beta`), 276 methods. Documentation: <https://cloud.google.com/generative-ai-app-builder/docs/>
- Cloud Document AI API (`documentai/v1beta3`), 48 methods. Documentation: <https://cloud.google.com/document-ai/docs/>
- Cloud Talent Solution API (`jobs/v3`), 15 methods. Documentation: <https://cloud.google.com/talent-solution/job-search/docs/>
- Cloud Talent Solution API (`jobs/v3p1beta1`), 16 methods. Documentation: <https://cloud.google.com/talent-solution/job-search/docs/>
- Cloud Natural Language API (`language/v1`), 7 methods. Documentation: <https://cloud.google.com/natural-language/>
- Cloud Natural Language API (`language/v1beta2`), 7 methods. Documentation: <https://cloud.google.com/natural-language/>
- Notebooks API (`notebooks/v1`), 62 methods. Documentation: <https://cloud.google.com/notebooks/docs/>
- AI Commerce Search API (`retail/v2alpha`), 88 methods. Documentation: <https://cloud.google.com/recommendations>
- AI Commerce Search API (`retail/v2beta`), 76 methods. Documentation: <https://cloud.google.com/recommendations>
- Cloud Speech-to-Text API (`speech/v1p1beta1`), 14 methods. Documentation: <https://cloud.google.com/speech-to-text/docs/quickstart-protocol>
- Cloud Text-to-Speech API (`texttospeech/v1beta1`), 5 methods. Documentation: <https://cloud.google.com/text-to-speech/>
- Cloud Translation API (`translate/v2`), 5 methods. Documentation: <https://cloud.google.com/translate/docs/quickstarts>
- Cloud Translation API (`translate/v3beta1`), 21 methods. Documentation: <https://cloud.google.com/translate/docs/quickstarts>
- Cloud Video Intelligence API (`videointelligence/v1beta2`), 1 methods. Documentation: <https://cloud.google.com/video-intelligence/docs/>
- Cloud Video Intelligence API (`videointelligence/v1p1beta1`), 1 methods. Documentation: <https://cloud.google.com/video-intelligence/docs/>
- Cloud Video Intelligence API (`videointelligence/v1p2beta1`), 1 methods. Documentation: <https://cloud.google.com/video-intelligence/docs/>
- Cloud Video Intelligence API (`videointelligence/v1p3beta1`), 1 methods. Documentation: <https://cloud.google.com/video-intelligence/docs/>
- Cloud Vision API (`vision/v1p1beta1`), 12 methods. Documentation: <https://cloud.google.com/vision/>
- Cloud Vision API (`vision/v1p2beta1`), 12 methods. Documentation: <https://cloud.google.com/vision/>
- Gemini API (`generativelanguage/v1beta`), 86 methods. Documentation: <https://developers.generativeai.google/api>
- Gemini API (`generativelanguage/v1`), 47 methods. Documentation: <https://developers.generativeai.google/api>

