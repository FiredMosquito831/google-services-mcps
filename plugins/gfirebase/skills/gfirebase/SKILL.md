---
name: gfirebase
description: Firebase management, App Check, App Distribution, Crashlytics, Hosting, Data Connect, Rules, Test Lab, FCM and Identity Toolkit. Served by the gfirebase MCP server with 310 tools. Use for requests about these Google APIs.
---

# Firebase

Firebase management, App Check, App Distribution, Crashlytics, Hosting, Data Connect, Rules, Test Lab, FCM and Identity Toolkit.

The `gfirebase` MCP server exposes 310 tools. Per-method tools cover the Discovery APIs listed below. Gateway APIs are reached through three generic tools: api_search finds a method, api_describe shows its parameters, and api_call runs it.

## Log in

Replace `<plugin>` with this plugin's folder, the one that holds `bin/gsm.mjs`. Sign in with the OAuth desktop client, once: `node <plugin>/bin/gsm.mjs setup-client <client_secret.json>`, then `node <plugin>/bin/gsm.mjs login developer`.

## Safety

Reads never ask for approval. Changes and deletions ask first, unless the user has set the confirmation option to off in the plugin settings. Deny, ask and allow rules in the policy file (policy.json in the token directory) apply on top of this.

## APIs

- Firebase Management API (firebase v1beta1)
- Firebase App Check API (firebaseappcheck v1)
- Firebase App Distribution API (firebaseappdistribution v1)
- Firebase App Hosting API (firebaseapphosting v1)
- Firebase Crashlytics API (firebasecrashlytics v1alpha)
- Firebase Realtime Database Management API (firebasedatabase v1beta)
- Firebase SQL Connect API (firebasedataconnect v1)
- Firebase Hosting API (firebasehosting v1)
- Firebase ML API (firebaseml v1)
- Firebase Rules API (firebaserules v1)
- Cloud Storage for Firebase API (firebasestorage v1beta)
- Google Identity Toolkit API (identitytoolkit v3)
- Firebase Cloud Messaging API (fcm v1)
- Firebase Cloud Messaging Data API (fcmdata v1beta1)
- Cloud Testing API (testing v1)
- Cloud Tool Results API (toolresults v1beta3)
- Device Run API (devicerun v1alpha)
- Firebase App Check API (firebaseappcheck v1beta), reached through api_search, api_describe and api_call
- Firebase App Distribution API (firebaseappdistribution v1alpha), reached through api_search, api_describe and api_call
- Firebase App Hosting API (firebaseapphosting v1beta), reached through api_search, api_describe and api_call
- Firebase SQL Connect API (firebasedataconnect v1beta), reached through api_search, api_describe and api_call
- Firebase Hosting API (firebasehosting v1beta1), reached through api_search, api_describe and api_call
- Firebase ML API (firebaseml v1beta2), reached through api_search, api_describe and api_call
- Firebase ML API (firebaseml v2beta), reached through api_search, api_describe and api_call
- Identity Toolkit API (identitytoolkit v1), reached through api_search, api_describe and api_call
- Identity Toolkit API (identitytoolkit v2), reached through api_search, api_describe and api_call
