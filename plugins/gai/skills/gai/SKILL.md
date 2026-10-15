---
name: gai
description: Generative and classic AI APIs: Discovery Engine, Vertex AI, Dialogflow, Vision, Speech, Translate, Document AI and agent services. Served by the gai MCP server with 354 tools. Use for requests about these Google APIs.
---

# AI and ML

Generative and classic AI APIs: Discovery Engine, Vertex AI, Dialogflow, Vision, Speech, Translate, Document AI and agent services.

The `gai` MCP server exposes 354 tools. Per-method tools cover the Discovery APIs listed below. Gateway APIs are reached through three generic tools: api_search finds a method, api_describe shows its parameters, and api_call runs it.

## Log in

Replace `<plugin>` with this plugin's folder, the one that holds `bin/gsm.mjs`. Sign in with the OAuth desktop client, once: `node <plugin>/bin/gsm.mjs setup-client <client_secret.json>`, then `node <plugin>/bin/gsm.mjs login cloud`. Application Default Credentials also work for this group.

## Safety

Reads never ask for approval. Changes and deletions ask first, unless the user has set the confirmation option to off in the plugin settings. Deny, ask and allow rules in the policy file (policy.json in the token directory) apply on top of this.

## APIs

- Discovery Engine API (discoveryengine v1)
- Cloud Vision API (vision v1)
- Cloud Speech-to-Text API (speech v1)
- Cloud Text-to-Speech API (texttospeech v1)
- Cloud Natural Language API (language v2)
- Cloud Video Intelligence API (videointelligence v1)
- Cloud Translation API (translate v3), reached through api_search, api_describe and api_call
- Cloud Document AI API (documentai v1), reached through api_search, api_describe and api_call
- Dialogflow API (dialogflow v3), reached through api_search, api_describe and api_call
- Gemini Enterprise for Customer Experience API (ces v1), reached through api_search, api_describe and api_call
- Agent Registry API (agentregistry v1), reached through api_search, api_describe and api_call
- Agent Identity API (agentidentity v1), reached through api_search, api_describe and api_call
- Agent Identity Credentials API (agentidentitycredentials v1), reached through api_search, api_describe and api_call
- AI Platform Training & Prediction API (ml v1), reached through api_search, api_describe and api_call
- Notebooks API (notebooks v2), reached through api_search, api_describe and api_call
- AI Commerce Search API (retail v2), reached through api_search, api_describe and api_call
- Contact Center AI Insights API (contactcenterinsights v1), reached through api_search, api_describe and api_call
- Contact Center AI Platform API (contactcenteraiplatform v1alpha1), reached through api_search, api_describe and api_call
- Cloud Talent Solution API (jobs v4), reached through api_search, api_describe and api_call
- Recommendations AI (Beta) (recommendationengine v1beta1), reached through api_search, api_describe and api_call
- Agent Platform API (aiplatform v1), reached through api_search, api_describe and api_call
- Agent Identity API (agentidentity v1alpha), reached through api_search, api_describe and api_call
- Agent Identity API (agentidentity v1beta), reached through api_search, api_describe and api_call
- Agent Identity Credentials API (agentidentitycredentials v1alpha), reached through api_search, api_describe and api_call
- Agent Identity Credentials API (agentidentitycredentials v1beta), reached through api_search, api_describe and api_call
- Agent Registry API (agentregistry v1alpha), reached through api_search, api_describe and api_call
- Agent Platform API (aiplatform v1beta1), reached through api_search, api_describe and api_call
- Gemini Enterprise for Customer Experience API (ces v1beta), reached through api_search, api_describe and api_call
- Dialogflow API (dialogflow v2), reached through api_search, api_describe and api_call
- Dialogflow API (dialogflow v2beta1), reached through api_search, api_describe and api_call
- Dialogflow API (dialogflow v3beta1), reached through api_search, api_describe and api_call
- Discovery Engine API (discoveryengine v1alpha), reached through api_search, api_describe and api_call
- Discovery Engine API (discoveryengine v1beta), reached through api_search, api_describe and api_call
- Cloud Document AI API (documentai v1beta3), reached through api_search, api_describe and api_call
- Cloud Talent Solution API (jobs v3), reached through api_search, api_describe and api_call
- Cloud Talent Solution API (jobs v3p1beta1), reached through api_search, api_describe and api_call
- Cloud Natural Language API (language v1), reached through api_search, api_describe and api_call
- Cloud Natural Language API (language v1beta2), reached through api_search, api_describe and api_call
- Notebooks API (notebooks v1), reached through api_search, api_describe and api_call
- AI Commerce Search API (retail v2alpha), reached through api_search, api_describe and api_call
- AI Commerce Search API (retail v2beta), reached through api_search, api_describe and api_call
- Cloud Speech-to-Text API (speech v1p1beta1), reached through api_search, api_describe and api_call
- Cloud Text-to-Speech API (texttospeech v1beta1), reached through api_search, api_describe and api_call
- Cloud Translation API (translate v2), reached through api_search, api_describe and api_call
- Cloud Translation API (translate v3beta1), reached through api_search, api_describe and api_call
- Cloud Video Intelligence API (videointelligence v1beta2), reached through api_search, api_describe and api_call
- Cloud Video Intelligence API (videointelligence v1p1beta1), reached through api_search, api_describe and api_call
- Cloud Video Intelligence API (videointelligence v1p2beta1), reached through api_search, api_describe and api_call
- Cloud Video Intelligence API (videointelligence v1p3beta1), reached through api_search, api_describe and api_call
- Cloud Vision API (vision v1p1beta1), reached through api_search, api_describe and api_call
- Cloud Vision API (vision v1p2beta1), reached through api_search, api_describe and api_call
