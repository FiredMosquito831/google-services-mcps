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
| `discoverye_pro_loc_coll_engi_serv_sear_a054` | `search` | Agent Search (Vertex AI Search) on an engine's serving config: Discovery Engine v1 servingConfigs.search. |
| `discoverye_proj_loca_coll_engin_servi_answe` | `conversational_search` | Discovery Engine v1 servingConfigs.answer. Google marks it read-only, and since 1.24.2 (D2) the suite counts it as a read too, so it does not ask. |
| `discoverye_projec_locati_collec_engine_list` | `list_engines` | The engines (search and chat apps) of a collection. |

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
| `discoverye_billing_ac_billing_ac_distribute` | write | discoveryengine.billingAccounts.billingAccountLicenseConfigs.distributeLicenseConfig | cloud-platform, discoveryengine.readwrite |
| `discoverye_billing_ac_billing_ac_retract_li` | write | discoveryengine.billingAccounts.billingAccountLicenseConfigs.retractLicenseConfig | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_col_dat_sit_tar_ope_list` | read | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.targetSites.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_col_dat_sit_tar_oper_get` | read | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.targetSites.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_col_eng_ass_age_a2a_0566` | read | discoveryengine.projects.locations.collections.engines.assistants.agents.a2a.v1.tasks.subscribe | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_col_eng_ass_age_a2a_22cd` | write | discoveryengine.projects.locations.collections.engines.assistants.agents.a2a.v1.tasks.pushNotificationConfigs.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_col_eng_ass_age_a2a_41f3` | destructive | discoveryengine.projects.locations.collections.engines.assistants.agents.a2a.v1.message.send | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_col_eng_ass_age_a2a_70ac` | read | discoveryengine.projects.locations.collections.engines.assistants.agents.a2a.v1.tasks.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_col_eng_ass_age_a2a_766a` | read | discoveryengine.projects.locations.collections.engines.assistants.agents.a2a.v1.tasks.pushNotificationConfigs.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_col_eng_ass_age_a2a_9029` | read | discoveryengine.projects.locations.collections.engines.assistants.agents.a2a.v1.tasks.pushNotificationConfigs.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_col_eng_ass_age_a2a_c691` | destructive | discoveryengine.projects.locations.collections.engines.assistants.agents.a2a.v1.tasks.pushNotificationConfigs.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_col_eng_ass_age_a2a_e1de` | write | discoveryengine.projects.locations.collections.engines.assistants.agents.a2a.v1.message.stream | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_col_eng_ass_age_a2a_e99b` | read | discoveryengine.projects.locations.collections.engines.assistants.agents.a2a.v1.getCard | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_col_eng_ass_age_a2a_eae2` | destructive | discoveryengine.projects.locations.collections.engines.assistants.agents.a2a.v1.tasks.cancel | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_col_eng_ass_age_oper_get` | read | discoveryengine.projects.locations.collections.engines.assistants.agents.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_coll_data_bran_docu_crea` | write | discoveryengine.projects.locations.collections.dataStores.branches.documents.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_coll_data_bran_docu_dele` | destructive | discoveryengine.projects.locations.collections.dataStores.branches.documents.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_coll_data_bran_docu_impo` | write | discoveryengine.projects.locations.collections.dataStores.branches.documents.import | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_coll_data_bran_docu_list` | read | discoveryengine.projects.locations.collections.dataStores.branches.documents.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_coll_data_bran_docu_patc` | write | discoveryengine.projects.locations.collections.dataStores.branches.documents.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_coll_data_bran_docu_purg` | destructive | discoveryengine.projects.locations.collections.dataStores.branches.documents.purge | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_coll_data_bran_oper_canc` | destructive | discoveryengine.projects.locations.collections.dataStores.branches.operations.cancel | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_coll_data_bran_oper_list` | read | discoveryengine.projects.locations.collections.dataStores.branches.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_coll_data_mode_oper_list` | read | discoveryengine.projects.locations.collections.dataStores.models.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_coll_data_oper_list_2253` | read | discoveryengine.projects.locations.collections.dataStores.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_coll_data_oper_list_b0c8` | read | discoveryengine.projects.locations.collections.dataConnector.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_coll_data_sche_oper_list` | read | discoveryengine.projects.locations.collections.dataStores.schemas.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_coll_data_serv_sear_56e4` | read | discoveryengine.projects.locations.collections.dataStores.servingConfigs.search | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_pro_loc_coll_data_serv_sear_8723` | read | discoveryengine.projects.locations.collections.dataStores.servingConfigs.searchLite | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_pro_loc_coll_data_site_oper_list` | read | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_coll_data_site_site_crea` | write | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.sitemaps.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_coll_data_site_site_dele` | destructive | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.sitemaps.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_coll_data_site_site_fetc` | read | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.sitemaps.fetch | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_coll_data_site_targ_batc` | write | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.targetSites.batchCreate | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_coll_data_site_targ_crea` | write | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.targetSites.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_coll_data_site_targ_dele` | destructive | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.targetSites.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_coll_data_site_targ_list` | read | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.targetSites.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_coll_data_site_targ_patc` | write | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.targetSites.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loc_coll_engi_serv_sear_3cf0` | read | discoveryengine.projects.locations.collections.engines.servingConfigs.searchLite | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_pro_loc_coll_engi_serv_sear_a054` | read | discoveryengine.projects.locations.collections.engines.servingConfigs.search | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_pro_loca_coll_data_bran_docu_get` | read | discoveryengine.projects.locations.collections.dataStores.branches.documents.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loca_coll_data_bran_oper_get` | read | discoveryengine.projects.locations.collections.dataStores.branches.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loca_coll_data_mode_oper_get` | read | discoveryengine.projects.locations.collections.dataStores.models.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loca_coll_data_oper_get_52ea` | read | discoveryengine.projects.locations.collections.dataConnector.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loca_coll_data_oper_get_f560` | read | discoveryengine.projects.locations.collections.dataStores.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loca_coll_data_sche_oper_get` | read | discoveryengine.projects.locations.collections.dataStores.schemas.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loca_coll_data_sess_answ_get` | read | discoveryengine.projects.locations.collections.dataStores.sessions.answers.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loca_coll_data_site_oper_get` | read | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loca_coll_data_site_targ_get` | read | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.targetSites.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_pro_loca_coll_engi_sess_answ_get` | read | discoveryengine.projects.locations.collections.engines.sessions.answers.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_coll_engin_assis_creat` | write | discoveryengine.projects.locations.collections.engines.assistants.create | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_loca_coll_engin_assis_delet` | destructive | discoveryengine.projects.locations.collections.engines.assistants.delete | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_loca_coll_engin_assis_patch` | write | discoveryengine.projects.locations.collections.engines.assistants.patch | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_loca_coll_engin_assis_strea` | write | discoveryengine.projects.locations.collections.engines.assistants.streamAssist | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_loca_coll_engin_compl_compl` | write | discoveryengine.projects.locations.collections.engines.completionConfig.completeQuery | cloud-platform, cloud_search.query |
| `discoverye_proj_loca_coll_engin_contr_creat` | write | discoveryengine.projects.locations.collections.engines.controls.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_coll_engin_contr_delet` | destructive | discoveryengine.projects.locations.collections.engines.controls.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_coll_engin_contr_patch` | write | discoveryengine.projects.locations.collections.engines.controls.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_coll_engin_conve_conve` | write | discoveryengine.projects.locations.collections.engines.conversations.converse | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_coll_engin_conve_creat` | write | discoveryengine.projects.locations.collections.engines.conversations.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_coll_engin_conve_delet` | destructive | discoveryengine.projects.locations.collections.engines.conversations.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_coll_engin_conve_patch` | write | discoveryengine.projects.locations.collections.engines.conversations.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_coll_engin_opera_cance` | destructive | discoveryengine.projects.locations.collections.engines.operations.cancel | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_coll_engin_servi_answe` | read | discoveryengine.projects.locations.collections.engines.servingConfigs.answer | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_coll_engin_servi_creat` | write | discoveryengine.projects.locations.collections.engines.servingConfigs.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_coll_engin_servi_delet` | destructive | discoveryengine.projects.locations.collections.engines.servingConfigs.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_coll_engin_servi_patch` | write | discoveryengine.projects.locations.collections.engines.servingConfigs.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_coll_engin_servi_recom` | write | discoveryengine.projects.locations.collections.engines.servingConfigs.recommend | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_coll_engin_servi_strea` | write | discoveryengine.projects.locations.collections.engines.servingConfigs.streamAnswer | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_coll_engin_sessi_creat` | write | discoveryengine.projects.locations.collections.engines.sessions.create | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_loca_coll_engin_sessi_delet` | destructive | discoveryengine.projects.locations.collections.engines.sessions.delete | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_loca_coll_engin_sessi_patch` | write | discoveryengine.projects.locations.collections.engines.sessions.patch | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_loca_coll_engin_widge_patch` | write | discoveryengine.projects.locations.collections.engines.widgetConfigs.patch | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_loca_colle_data_branc_batch` | read | discoveryengine.projects.locations.collections.dataStores.branches.batchGetDocumentsMetadata | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_colle_data_compl_compl` | write | discoveryengine.projects.locations.collections.dataStores.completionConfig.completeQuery | cloud-platform, cloud_search.query |
| `discoverye_proj_loca_colle_data_compl_impor` | write | discoveryengine.projects.locations.collections.dataStores.completionSuggestions.import | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_loca_colle_data_compl_purge` | destructive | discoveryengine.projects.locations.collections.dataStores.completionSuggestions.purge | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_loca_colle_data_contr_creat` | write | discoveryengine.projects.locations.collections.dataStores.controls.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_colle_data_contr_delet` | destructive | discoveryengine.projects.locations.collections.dataStores.controls.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_colle_data_contr_patch` | write | discoveryengine.projects.locations.collections.dataStores.controls.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_colle_data_conve_conve` | write | discoveryengine.projects.locations.collections.dataStores.conversations.converse | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_colle_data_conve_creat` | write | discoveryengine.projects.locations.collections.dataStores.conversations.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_colle_data_conve_delet` | destructive | discoveryengine.projects.locations.collections.dataStores.conversations.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_colle_data_conve_patch` | write | discoveryengine.projects.locations.collections.dataStores.conversations.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_colle_data_schem_creat` | write | discoveryengine.projects.locations.collections.dataStores.schemas.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_colle_data_schem_delet` | destructive | discoveryengine.projects.locations.collections.dataStores.schemas.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_colle_data_schem_patch` | write | discoveryengine.projects.locations.collections.dataStores.schemas.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_colle_data_servi_answe` | read | discoveryengine.projects.locations.collections.dataStores.servingConfigs.answer | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_colle_data_servi_creat` | write | discoveryengine.projects.locations.collections.dataStores.servingConfigs.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_colle_data_servi_delet` | destructive | discoveryengine.projects.locations.collections.dataStores.servingConfigs.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_colle_data_servi_patch` | write | discoveryengine.projects.locations.collections.dataStores.servingConfigs.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_colle_data_servi_recom` | write | discoveryengine.projects.locations.collections.dataStores.servingConfigs.recommend | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_colle_data_servi_strea` | write | discoveryengine.projects.locations.collections.dataStores.servingConfigs.streamAnswer | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_colle_data_sessi_creat` | write | discoveryengine.projects.locations.collections.dataStores.sessions.create | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_loca_colle_data_sessi_delet` | destructive | discoveryengine.projects.locations.collections.dataStores.sessions.delete | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_loca_colle_data_sessi_patch` | write | discoveryengine.projects.locations.collections.dataStores.sessions.patch | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_loca_colle_data_sugge_impor` | write | discoveryengine.projects.locations.collections.dataStores.suggestionDenyListEntries.import | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_loca_colle_data_sugge_purge` | destructive | discoveryengine.projects.locations.collections.dataStores.suggestionDenyListEntries.purge | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_loca_colle_data_widge_patch` | write | discoveryengine.projects.locations.collections.dataStores.widgetConfigs.patch | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_loca_colle_engin_assis_list` | read | discoveryengine.projects.locations.collections.engines.assistants.list | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_loca_colle_engin_contr_list` | read | discoveryengine.projects.locations.collections.engines.controls.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_colle_engin_conve_list` | read | discoveryengine.projects.locations.collections.engines.conversations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_colle_engin_opera_list` | read | discoveryengine.projects.locations.collections.engines.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_colle_engin_servi_list` | read | discoveryengine.projects.locations.collections.engines.servingConfigs.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_colle_engin_sessi_list` | read | discoveryengine.projects.locations.collections.engines.sessions.list | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_loca_data_branc_docum_creat` | write | discoveryengine.projects.locations.dataStores.branches.documents.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_data_branc_docum_delet` | destructive | discoveryengine.projects.locations.dataStores.branches.documents.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_data_branc_docum_impor` | write | discoveryengine.projects.locations.dataStores.branches.documents.import | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_data_branc_docum_patch` | write | discoveryengine.projects.locations.dataStores.branches.documents.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_data_branc_docum_purge` | destructive | discoveryengine.projects.locations.dataStores.branches.documents.purge | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_loca_data_branc_opera_cance` | destructive | discoveryengine.projects.locations.dataStores.branches.operations.cancel | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_colle_data_contr_list` | read | discoveryengine.projects.locations.collections.dataStores.controls.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_colle_data_conve_list` | read | discoveryengine.projects.locations.collections.dataStores.conversations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_colle_data_custo_list` | read | discoveryengine.projects.locations.collections.dataStores.customModels.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_colle_data_schem_list` | read | discoveryengine.projects.locations.collections.dataStores.schemas.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_colle_data_servi_list` | read | discoveryengine.projects.locations.collections.dataStores.servingConfigs.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_colle_data_sessi_list` | read | discoveryengine.projects.locations.collections.dataStores.sessions.list | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_locat_colle_data_site_batch` | write | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.batchVerifyTargetSites | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_colle_data_site_disab` | write | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.disableAdvancedSiteSearch | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_colle_data_site_enabl` | write | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.enableAdvancedSiteSearch | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_colle_data_site_fetch` | read | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.fetchDomainVerificationStatus | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_colle_data_site_recra` | write | discoveryengine.projects.locations.collections.dataStores.siteSearchEngine.recrawlUris | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_colle_data_user_colle` | write | discoveryengine.projects.locations.collections.dataStores.userEvents.collect | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_locat_colle_data_user_impor` | write | discoveryengine.projects.locations.collections.dataStores.userEvents.import | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_locat_colle_data_user_purge` | destructive | discoveryengine.projects.locations.collections.dataStores.userEvents.purge | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_locat_colle_data_user_write` | write | discoveryengine.projects.locations.collections.dataStores.userEvents.write | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_locat_colle_engin_assis_get` | read | discoveryengine.projects.locations.collections.engines.assistants.get | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_locat_colle_engin_contr_get` | read | discoveryengine.projects.locations.collections.engines.controls.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_colle_engin_conve_get` | read | discoveryengine.projects.locations.collections.engines.conversations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_colle_engin_opera_get` | read | discoveryengine.projects.locations.collections.engines.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_colle_engin_servi_get` | read | discoveryengine.projects.locations.collections.engines.servingConfigs.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_colle_engin_sessi_get` | read | discoveryengine.projects.locations.collections.engines.sessions.get | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_locat_colle_engin_widge_get` | read | discoveryengine.projects.locations.collections.engines.widgetConfigs.get | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_locat_data_branc_docum_list` | read | discoveryengine.projects.locations.dataStores.branches.documents.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_data_branc_opera_list` | read | discoveryengine.projects.locations.dataStores.branches.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_data_model_opera_list` | read | discoveryengine.projects.locations.dataStores.models.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_data_servi_searc_6c7a` | read | discoveryengine.projects.locations.dataStores.servingConfigs.searchLite | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_locat_data_servi_searc_b50f` | read | discoveryengine.projects.locations.dataStores.servingConfigs.search | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proj_locat_data_site_sitem_creat` | write | discoveryengine.projects.locations.dataStores.siteSearchEngine.sitemaps.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_data_site_sitem_delet` | destructive | discoveryengine.projects.locations.dataStores.siteSearchEngine.sitemaps.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_data_site_sitem_fetch` | read | discoveryengine.projects.locations.dataStores.siteSearchEngine.sitemaps.fetch | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_data_site_targe_batch` | write | discoveryengine.projects.locations.dataStores.siteSearchEngine.targetSites.batchCreate | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_data_site_targe_creat` | write | discoveryengine.projects.locations.dataStores.siteSearchEngine.targetSites.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_data_site_targe_delet` | destructive | discoveryengine.projects.locations.dataStores.siteSearchEngine.targetSites.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_proj_locat_data_site_targe_patch` | write | discoveryengine.projects.locations.dataStores.siteSearchEngine.targetSites.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_colle_data_contr_get` | read | discoveryengine.projects.locations.collections.dataStores.controls.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_colle_data_conve_get` | read | discoveryengine.projects.locations.collections.dataStores.conversations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_colle_data_schem_get` | read | discoveryengine.projects.locations.collections.dataStores.schemas.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_colle_data_servi_get` | read | discoveryengine.projects.locations.collections.dataStores.servingConfigs.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_colle_data_sessi_get` | read | discoveryengine.projects.locations.collections.dataStores.sessions.get | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proje_locat_colle_data_widge_get` | read | discoveryengine.projects.locations.collections.dataStores.widgetConfigs.get | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proje_locat_collec_data_s_comple` | read | discoveryengine.projects.locations.collections.dataStores.completeQuery | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proje_locat_collec_data_s_create` | write | discoveryengine.projects.locations.collections.dataStores.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_collec_data_s_delete` | destructive | discoveryengine.projects.locations.collections.dataStores.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_collec_data_s_get_ia` | read | discoveryengine.projects.locations.collections.dataStores.getIamPolicy | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_collec_data_s_get_si` | read | discoveryengine.projects.locations.collections.dataStores.getSiteSearchEngine | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_collec_data_s_set_ia` | destructive | discoveryengine.projects.locations.collections.dataStores.setIamPolicy | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_collec_engine_create` | write | discoveryengine.projects.locations.collections.engines.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_collec_engine_delete` | destructive | discoveryengine.projects.locations.collections.engines.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_collec_engine_get_ia` | read | discoveryengine.projects.locations.collections.engines.getIamPolicy | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_collec_engine_set_ia` | destructive | discoveryengine.projects.locations.collections.engines.setIamPolicy | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_data_branc_docum_get` | read | discoveryengine.projects.locations.dataStores.branches.documents.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_data_branc_opera_get` | read | discoveryengine.projects.locations.dataStores.branches.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_data_model_opera_get` | read | discoveryengine.projects.locations.dataStores.models.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_data_s_comple_comple` | write | discoveryengine.projects.locations.dataStores.completionConfig.completeQuery | cloud-platform, cloud_search.query |
| `discoverye_proje_locat_data_s_comple_import` | write | discoveryengine.projects.locations.dataStores.completionSuggestions.import | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proje_locat_data_s_contro_create` | write | discoveryengine.projects.locations.dataStores.controls.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_data_s_contro_delete` | destructive | discoveryengine.projects.locations.dataStores.controls.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_data_s_conver_conver` | write | discoveryengine.projects.locations.dataStores.conversations.converse | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_data_s_conver_create` | write | discoveryengine.projects.locations.dataStores.conversations.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_data_s_conver_delete` | destructive | discoveryengine.projects.locations.dataStores.conversations.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_data_s_schema_create` | write | discoveryengine.projects.locations.dataStores.schemas.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_data_s_schema_delete` | destructive | discoveryengine.projects.locations.dataStores.schemas.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_data_s_servin_answer` | read | discoveryengine.projects.locations.dataStores.servingConfigs.answer | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_data_s_servin_create` | write | discoveryengine.projects.locations.dataStores.servingConfigs.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_data_s_servin_delete` | destructive | discoveryengine.projects.locations.dataStores.servingConfigs.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_data_s_servin_recomm` | write | discoveryengine.projects.locations.dataStores.servingConfigs.recommend | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_data_s_servin_stream` | write | discoveryengine.projects.locations.dataStores.servingConfigs.streamAnswer | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_data_s_sessio_create` | write | discoveryengine.projects.locations.dataStores.sessions.create | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proje_locat_data_s_sessio_delete` | destructive | discoveryengine.projects.locations.dataStores.sessions.delete | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proje_locat_data_s_site_s_disabl` | write | discoveryengine.projects.locations.dataStores.siteSearchEngine.disableAdvancedSiteSearch | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_data_s_site_s_enable` | write | discoveryengine.projects.locations.dataStores.siteSearchEngine.enableAdvancedSiteSearch | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_data_s_site_s_recraw` | write | discoveryengine.projects.locations.dataStores.siteSearchEngine.recrawlUris | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_data_s_sugges_import` | write | discoveryengine.projects.locations.dataStores.suggestionDenyListEntries.import | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proje_locat_data_s_user_e_collec` | write | discoveryengine.projects.locations.dataStores.userEvents.collect | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proje_locat_data_s_user_e_import` | write | discoveryengine.projects.locations.dataStores.userEvents.import | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proje_locat_data_sessi_answe_get` | read | discoveryengine.projects.locations.dataStores.sessions.answers.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_data_site_targe_list` | read | discoveryengine.projects.locations.dataStores.siteSearchEngine.targetSites.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locat_data_site_target_get` | read | discoveryengine.projects.locations.dataStores.siteSearchEngine.targetSites.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locati_collec_data_s_patch` | write | discoveryengine.projects.locations.collections.dataStores.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locati_collec_data_s_train` | write | discoveryengine.projects.locations.collections.dataStores.trainCustomModel | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locati_collec_engine_patch` | write | discoveryengine.projects.locations.collections.engines.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locati_data_s_branch_batch` | read | discoveryengine.projects.locations.dataStores.branches.batchGetDocumentsMetadata | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locati_data_s_comple_purge` | destructive | discoveryengine.projects.locations.dataStores.completionSuggestions.purge | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proje_locati_data_s_contro_patch` | write | discoveryengine.projects.locations.dataStores.controls.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locati_data_s_conver_patch` | write | discoveryengine.projects.locations.dataStores.conversations.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locati_data_s_schema_patch` | write | discoveryengine.projects.locations.dataStores.schemas.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locati_data_s_servin_patch` | write | discoveryengine.projects.locations.dataStores.servingConfigs.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_proje_locati_data_s_sessio_patch` | write | discoveryengine.projects.locations.dataStores.sessions.patch | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proje_locati_data_s_sugges_purge` | destructive | discoveryengine.projects.locations.dataStores.suggestionDenyListEntries.purge | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proje_locati_data_s_user_e_purge` | destructive | discoveryengine.projects.locations.dataStores.userEvents.purge | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proje_locati_data_s_user_e_write` | write | discoveryengine.projects.locations.dataStores.userEvents.write | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_proje_locati_data_s_widget_patch` | write | discoveryengine.projects.locations.dataStores.widgetConfigs.patch | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_projec_locati_collec_data_co_mcp` | destructive | discoveryengine.projects.locations.collections.dataConnector.mcp | cloud-platform, discoveryengine.readwrite |
| `discoverye_projec_locati_collec_data_s_list` | read | discoveryengine.projects.locations.collections.dataStores.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_projec_locati_collec_data_st_get` | read | discoveryengine.projects.locations.collections.dataStores.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_projec_locati_collec_engine_list` | read | discoveryengine.projects.locations.collections.engines.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_projec_locati_collec_engines_get` | read | discoveryengine.projects.locations.collections.engines.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_projec_locati_collec_operat_list` | read | discoveryengine.projects.locations.collections.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_projec_locati_collec_operati_get` | read | discoveryengine.projects.locations.collections.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_projec_locati_data_s_contro_list` | read | discoveryengine.projects.locations.dataStores.controls.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_projec_locati_data_s_control_get` | read | discoveryengine.projects.locations.dataStores.controls.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_projec_locati_data_s_conver_list` | read | discoveryengine.projects.locations.dataStores.conversations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_projec_locati_data_s_convers_get` | read | discoveryengine.projects.locations.dataStores.conversations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_projec_locati_data_s_operat_list` | read | discoveryengine.projects.locations.dataStores.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_projec_locati_data_s_operati_get` | read | discoveryengine.projects.locations.dataStores.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_projec_locati_data_s_schema_list` | read | discoveryengine.projects.locations.dataStores.schemas.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_projec_locati_data_s_schemas_get` | read | discoveryengine.projects.locations.dataStores.schemas.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_projec_locati_data_s_servin_list` | read | discoveryengine.projects.locations.dataStores.servingConfigs.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_projec_locati_data_s_serving_get` | read | discoveryengine.projects.locations.dataStores.servingConfigs.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_projec_locati_data_s_sessio_list` | read | discoveryengine.projects.locations.dataStores.sessions.list | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_projec_locati_data_s_session_get` | read | discoveryengine.projects.locations.dataStores.sessions.get | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_projec_locati_data_st_widget_get` | read | discoveryengine.projects.locations.dataStores.widgetConfigs.get | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_projec_locati_identi_operat_list` | read | discoveryengine.projects.locations.identityMappingStores.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_projec_locati_identi_operati_get` | read | discoveryengine.projects.locations.identityMappingStores.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_projec_locati_podcas_operati_get` | read | discoveryengine.projects.locations.podcasts.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_projec_locati_user_s_licens_list` | read | discoveryengine.projects.locations.userStores.licenseConfigsUsageStats.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_projec_locati_user_s_user_l_list` | read | discoveryengine.projects.locations.userStores.userLicenses.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_project_locatio_collect_get_data` | read | discoveryengine.projects.locations.collections.getDataConnector | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_project_locatio_collect_update_d` | write | discoveryengine.projects.locations.collections.updateDataConnector | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_project_locatio_collecti_get_iam` | read | discoveryengine.projects.locations.collections.getIamPolicy | cloud-platform, discoveryengine.readwrite |
| `discoverye_project_locatio_collecti_set_iam` | destructive | discoveryengine.projects.locations.collections.setIamPolicy | cloud-platform, discoveryengine.readwrite |
| `discoverye_project_locatio_data_st_complete` | read | discoveryengine.projects.locations.dataStores.completeQuery | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_project_locatio_data_st_get_site` | read | discoveryengine.projects.locations.dataStores.getSiteSearchEngine | cloud-platform, discoveryengine.readwrite |
| `discoverye_project_locatio_data_sto_get_iam` | read | discoveryengine.projects.locations.dataStores.getIamPolicy | cloud-platform, discoveryengine.readwrite |
| `discoverye_project_locatio_data_sto_set_iam` | destructive | discoveryengine.projects.locations.dataStores.setIamPolicy | cloud-platform, discoveryengine.readwrite |
| `discoverye_project_locatio_identit_import_i` | write | discoveryengine.projects.locations.identityMappingStores.importIdentityMappings | cloud-platform, discoveryengine.readwrite |
| `discoverye_project_locatio_identit_list_ide` | read | discoveryengine.projects.locations.identityMappingStores.listIdentityMappings | cloud-platform, discoveryengine.readwrite |
| `discoverye_project_locatio_identit_purge_id` | write | discoveryengine.projects.locations.identityMappingStores.purgeIdentityMappings | cloud-platform, discoveryengine.readwrite |
| `discoverye_project_locatio_user_eve_collect` | write | discoveryengine.projects.locations.userEvents.collect | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_project_locatio_user_st_batch_up` | write | discoveryengine.projects.locations.userStores.batchUpdateUserLicenses | cloud-platform, discoveryengine.readwrite |
| `discoverye_project_location_cmek_con_delete` | destructive | discoveryengine.projects.locations.cmekConfigs.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_project_location_collecti_delete` | destructive | discoveryengine.projects.locations.collections.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_project_location_data_sto_create` | write | discoveryengine.projects.locations.dataStores.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_project_location_data_sto_delete` | destructive | discoveryengine.projects.locations.dataStores.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_project_location_identity_create` | write | discoveryengine.projects.locations.identityMappingStores.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_project_location_identity_delete` | destructive | discoveryengine.projects.locations.identityMappingStores.delete | cloud-platform, discoveryengine.readwrite |
| `discoverye_project_location_user_eve_import` | write | discoveryengine.projects.locations.userEvents.import | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_projects_location_cmek_con_patch` | write | discoveryengine.projects.locations.cmekConfigs.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_location_cmek_conf_list` | read | discoveryengine.projects.locations.cmekConfigs.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_location_data_sto_patch` | write | discoveryengine.projects.locations.dataStores.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_location_data_stor_list` | read | discoveryengine.projects.locations.dataStores.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_location_groundin_check` | read | discoveryengine.projects.locations.groundingConfigs.check | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_location_license_c_list` | read | discoveryengine.projects.locations.licenseConfigs.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_location_license_create` | write | discoveryengine.projects.locations.licenseConfigs.create | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_location_license_patch` | write | discoveryengine.projects.locations.licenseConfigs.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_location_operation_list` | read | discoveryengine.projects.locations.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_location_ranking_c_rank` | write | discoveryengine.projects.locations.rankingConfigs.rank | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_location_set_up_da_57e6` | write | discoveryengine.projects.locations.setUpDataConnectorV2 | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_projects_location_set_up_da_ad17` | write | discoveryengine.projects.locations.setUpDataConnector | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_projects_location_user_eve_write` | write | discoveryengine.projects.locations.userEvents.write | cloud-platform, discoveryengine.assist.readwrite |
| `discoverye_projects_location_user_sto_patch` | write | discoveryengine.projects.locations.userStores.patch | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_locations_cmek_conf_get` | read | discoveryengine.projects.locations.cmekConfigs.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_locations_data_stor_get` | read | discoveryengine.projects.locations.dataStores.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_locations_get_acl_confi` | read | discoveryengine.projects.locations.getAclConfig | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_locations_get_cmek_conf` | read | discoveryengine.projects.locations.getCmekConfig | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_locations_identity_get` | read | discoveryengine.projects.locations.identityMappingStores.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_locations_identity_list` | read | discoveryengine.projects.locations.identityMappingStores.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_locations_license_c_get` | read | discoveryengine.projects.locations.licenseConfigs.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_locations_operation_get` | read | discoveryengine.projects.locations.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_locations_provision` | write | discoveryengine.projects.locations.provision | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_locations_update_acl_co` | write | discoveryengine.projects.locations.updateAclConfig | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_locations_update_cmek_c` | write | discoveryengine.projects.locations.updateCmekConfig | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_locations_user_stor_get` | read | discoveryengine.projects.locations.userStores.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_operations_cancel` | destructive | discoveryengine.projects.operations.cancel | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_operations_get` | read | discoveryengine.projects.operations.get | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_operations_list` | read | discoveryengine.projects.operations.list | cloud-platform, discoveryengine.readwrite |
| `discoverye_projects_provision` | write | discoveryengine.projects.provision | cloud-platform, discoveryengine.readwrite |
| `language_documents_analyze_entities` | read | language.documents.analyzeEntities | cloud-language, cloud-platform |
| `language_documents_analyze_sentiment` | read | language.documents.analyzeSentiment | cloud-language, cloud-platform |
| `language_documents_annotate_text` | read | language.documents.annotateText | cloud-language, cloud-platform |
| `language_documents_classify_text` | read | language.documents.classifyText | cloud-language, cloud-platform |
| `language_documents_moderate_text` | read | language.documents.moderateText | cloud-language, cloud-platform |
| `speech_operations_get` | read | speech.operations.get | cloud-platform |
| `speech_operations_list` | read | speech.operations.list | cloud-platform |
| `speech_projects_locations_custom_cla_create` | write | speech.projects.locations.customClasses.create | cloud-platform |
| `speech_projects_locations_custom_cla_delete` | destructive | speech.projects.locations.customClasses.delete | cloud-platform |
| `speech_projects_locations_custom_clas_patch` | write | speech.projects.locations.customClasses.patch | cloud-platform |
| `speech_projects_locations_custom_class_list` | read | speech.projects.locations.customClasses.list | cloud-platform |
| `speech_projects_locations_custom_classe_get` | read | speech.projects.locations.customClasses.get | cloud-platform |
| `speech_projects_locations_phrase_set_create` | write | speech.projects.locations.phraseSets.create | cloud-platform |
| `speech_projects_locations_phrase_set_delete` | destructive | speech.projects.locations.phraseSets.delete | cloud-platform |
| `speech_projects_locations_phrase_sets_get` | read | speech.projects.locations.phraseSets.get | cloud-platform |
| `speech_projects_locations_phrase_sets_list` | read | speech.projects.locations.phraseSets.list | cloud-platform |
| `speech_projects_locations_phrase_sets_patch` | write | speech.projects.locations.phraseSets.patch | cloud-platform |
| `speech_speech_longrunningrecognize` | write | speech.speech.longrunningrecognize | cloud-platform |
| `speech_speech_recognize` | read | speech.speech.recognize | cloud-platform |
| `texttospee_operations_cancel` | destructive | texttospeech.operations.cancel | cloud-platform |
| `texttospee_operations_delete` | destructive | texttospeech.operations.delete | cloud-platform |
| `texttospee_projects_location_operation_list` | read | texttospeech.projects.locations.operations.list | cloud-platform |
| `texttospee_projects_locations_operation_get` | read | texttospeech.projects.locations.operations.get | cloud-platform |
| `texttospee_projects_locations_synthesize_lo` | write | texttospeech.projects.locations.synthesizeLongAudio | cloud-platform |
| `texttospee_text_synthesize` | read | texttospeech.text.synthesize | cloud-platform |
| `texttospee_voices_list` | read | texttospeech.voices.list | cloud-platform |
| `videointel_opera_proje_locati_operat_cancel` | destructive | videointelligence.operations.projects.locations.operations.cancel | cloud-platform |
| `videointel_opera_proje_locati_operat_delete` | destructive | videointelligence.operations.projects.locations.operations.delete | cloud-platform |
| `videointel_operat_projec_locati_operati_get` | read | videointelligence.operations.projects.locations.operations.get | cloud-platform |
| `videointel_project_location_operatio_cancel` | destructive | videointelligence.projects.locations.operations.cancel | cloud-platform |
| `videointel_project_location_operatio_delete` | destructive | videointelligence.projects.locations.operations.delete | cloud-platform |
| `videointel_projects_location_operation_list` | read | videointelligence.projects.locations.operations.list | cloud-platform |
| `videointel_projects_locations_operation_get` | read | videointelligence.projects.locations.operations.get | cloud-platform |
| `videointel_videos_annotate` | write | videointelligence.videos.annotate | cloud-platform |
| `vision_files_annotate` | read | vision.files.annotate | cloud-platform, cloud-vision |
| `vision_files_async_batch_annotate` | write | vision.files.asyncBatchAnnotate | cloud-platform, cloud-vision |
| `vision_images_annotate` | read | vision.images.annotate | cloud-platform, cloud-vision |
| `vision_images_async_batch_annotate` | write | vision.images.asyncBatchAnnotate | cloud-platform, cloud-vision |
| `vision_locations_operations_get` | read | vision.locations.operations.get | cloud-platform, cloud-vision |
| `vision_operations_cancel` | destructive | vision.operations.cancel | cloud-platform, cloud-vision |
| `vision_operations_delete` | destructive | vision.operations.delete | cloud-platform, cloud-vision |
| `vision_operations_get` | read | vision.operations.get | cloud-platform, cloud-vision |
| `vision_operations_list` | read | vision.operations.list | cloud-platform, cloud-vision |
| `vision_projec_locati_product_referen_create` | write | vision.projects.locations.products.referenceImages.create | cloud-platform, cloud-vision |
| `vision_projec_locati_product_referen_delete` | destructive | vision.projects.locations.products.referenceImages.delete | cloud-platform, cloud-vision |
| `vision_project_locatio_product_product_list` | read | vision.projects.locations.productSets.products.list | cloud-platform, cloud-vision |
| `vision_project_locatio_product_referen_list` | read | vision.projects.locations.products.referenceImages.list | cloud-platform, cloud-vision |
| `vision_project_locatio_product_referenc_get` | read | vision.projects.locations.products.referenceImages.get | cloud-platform, cloud-vision |
| `vision_projects_files_annotate` | read | vision.projects.files.annotate | cloud-platform, cloud-vision |
| `vision_projects_files_async_batch_annotate` | write | vision.projects.files.asyncBatchAnnotate | cloud-platform, cloud-vision |
| `vision_projects_images_annotate` | read | vision.projects.images.annotate | cloud-platform, cloud-vision |
| `vision_projects_images_async_batch_annotate` | write | vision.projects.images.asyncBatchAnnotate | cloud-platform, cloud-vision |
| `vision_projects_location_product_add_produ` | write | vision.projects.locations.productSets.addProduct | cloud-platform, cloud-vision |
| `vision_projects_location_product_remove_pr` | write | vision.projects.locations.productSets.removeProduct | cloud-platform, cloud-vision |
| `vision_projects_locations_files_annotate` | read | vision.projects.locations.files.annotate | cloud-platform, cloud-vision |
| `vision_projects_locations_files_async_batch` | write | vision.projects.locations.files.asyncBatchAnnotate | cloud-platform, cloud-vision |
| `vision_projects_locations_images_annotate` | read | vision.projects.locations.images.annotate | cloud-platform, cloud-vision |
| `vision_projects_locations_images_async_batc` | write | vision.projects.locations.images.asyncBatchAnnotate | cloud-platform, cloud-vision |
| `vision_projects_locations_operations_get` | read | vision.projects.locations.operations.get | cloud-platform, cloud-vision |
| `vision_projects_locations_product_se_create` | write | vision.projects.locations.productSets.create | cloud-platform, cloud-vision |
| `vision_projects_locations_product_se_delete` | destructive | vision.projects.locations.productSets.delete | cloud-platform, cloud-vision |
| `vision_projects_locations_product_se_import` | write | vision.projects.locations.productSets.import | cloud-platform, cloud-vision |
| `vision_projects_locations_product_set_patch` | write | vision.projects.locations.productSets.patch | cloud-platform, cloud-vision |
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

