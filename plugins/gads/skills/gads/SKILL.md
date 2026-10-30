---
name: gads
description: Google Ads API (accounts, campaigns, ad groups, ads, keywords, budgets, conversions, assets and GAQL reporting, with every other method through the gateway), plus advertising and publisher APIs: Search Ads 360, Display & Video 360, Campaign Manager, Ad Exchange, AdSense, AdMob, Real-time Bidding and more. Served by the gads MCP server with 340 tools. Use for requests about these Google APIs.
---

# Ads and Publisher

Google Ads API (accounts, campaigns, ad groups, ads, keywords, budgets, conversions, assets and GAQL reporting, with every other method through the gateway), plus advertising and publisher APIs: Search Ads 360, Display & Video 360, Campaign Manager, Ad Exchange, AdSense, AdMob, Real-time Bidding and more.

The `gads` MCP server exposes 340 tools. Per-method tools cover the Discovery APIs listed below. Gateway APIs are reached through three generic tools: api_search finds a method, api_describe shows its parameters, and api_call runs it.

## Log in

Replace `<plugin>` with this plugin's folder, the one that holds `bin/gsm.mjs`. Sign in with the OAuth desktop client, once: `node <plugin>/bin/gsm.mjs setup-client <client_secret.json>`, then `node <plugin>/bin/gsm.mjs login business`.

## Safety

Reads never ask for approval. Changes and deletions ask first, unless the user has set the confirmation option to off in the plugin settings. Deny, ask and allow rules in the policy file (policy.json in the token directory) apply on top of this.

## APIs

- Google Ads API (googleads v26)
- Search Ads 360 Reporting API (searchads360 v23)
- Display & Video 360 API (displayvideo v4)
- AdMob API (admob v1)
- DoubleClick Bid Manager API (doubleclickbidmanager v2)
- AdSense Management API (adsense v2), reached through api_search, api_describe and api_call
- Ad Exchange Buyer API II (adexchangebuyer2 v2beta1), reached through api_search, api_describe and api_call
- Campaign Manager 360 API (dfareporting v5), reached through api_search, api_describe and api_call
- Real-time Bidding API (realtimebidding v1), reached through api_search, api_describe and api_call
- Search Ads 360 API (doubleclicksearch v2), reached through api_search, api_describe and api_call
- AdSense Platform API (adsenseplatform v1), reached through api_search, api_describe and api_call
- Google Marketing Platform Admin API (marketingplatformadmin v1alpha), reached through api_search, api_describe and api_call
- Authorized Buyers Marketplace API (authorizedbuyersmarketplace v1), reached through api_search, api_describe and api_call
- Data Manager API (datamanager v1), reached through api_search, api_describe and api_call
- Agencies and Brands API (agenciesandbrands v1), reached through api_search, api_describe and api_call
- Curation Partners API (curationpartners v1), reached through api_search, api_describe and api_call
- Local Services API (localservices v1), reached through api_search, api_describe and api_call
- Reader Revenue Subscription Linking API (readerrevenuesubscriptionlinking v1), reached through api_search, api_describe and api_call
- Web Content Publisher API (webcontentpublisher v1), reached through api_search, api_describe and api_call
- Checks API (checks v1alpha), reached through api_search, api_describe and api_call
- AdMob API (admob v1beta), reached through api_search, api_describe and api_call
- AdSense Platform API (adsenseplatform v1alpha), reached through api_search, api_describe and api_call
- Authorized Buyers Marketplace API (authorizedbuyersmarketplace v1alpha), reached through api_search, api_describe and api_call
- Authorized Buyers Marketplace API (authorizedbuyersmarketplace v1beta), reached through api_search, api_describe and api_call
- Campaign Manager 360 API (dfareporting v3.5), reached through api_search, api_describe and api_call
- Display & Video 360 API (displayvideo v2), reached through api_search, api_describe and api_call
- Display & Video 360 API (displayvideo v3), reached through api_search, api_describe and api_call
- Search Ads 360 Reporting API (searchads360 v0), reached through api_search, api_describe and api_call
- Display & Video 360 API (displayvideo v4), reached through api_search, api_describe and api_call
- Google Ads API (googleads v26), reached through api_search, api_describe and api_call
- Display & Video 360 API (displayvideo v5), reached through api_search, api_describe and api_call
