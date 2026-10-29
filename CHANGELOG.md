# Changelog

All notable changes to the npm package `google-services-mcps`. Each release has a matching GitHub release (`vX.Y.Z`), whose notes are the entry below. Versions 0.1.0 to 0.1.2 are listed on the GitHub releases page.

## 1.1.3 - 2026-10-29

### Fixes: when Google refuses a login
- A login that Google refuses for reauthentication (`invalid_grant` with `invalid_rapt` or `rapt_required`) now says: "Your Google Workspace requires signing in to Google Cloud again (an admin session policy; Google's default is 16 hours). Call auth_login to sign in again." This is Workspace's Google Cloud session control, which ends logins with Cloud scopes after a set time.
- Any other refusal shows Google's `error` and `error_subtype` (short codes, never a token). The 7-day Testing limit is named as one possibility, not as the cause. The messages name `auth_login` first and the terminal command second. This applies to tool errors, `gsm status --check`, `gsm doctor` and `health` with `live: true`, for OAuth and ADC logins.

### Fixes: a new sign-in is used at once
- After a sign-in in the chat, the server forgets its OAuth clients and what it read from the OS secret store, so the new login is used without a restart. A client is also rebuilt when its token file holds another refresh token (a sign-in in a terminal). Only a hash of the refresh token is kept.
- `auth_status` reads the tokens again, and says how many tools are registered in total as well as how many it loaded now.
- With the OS secret store (`gsm protect`), a token that is not found is no longer remembered as missing, so a token stored by the sign-in process is seen.

### Fixes: token files
- With plain files (the default), a secret file is written to a temporary file and then renamed over the old one, so a reader never sees half a file. If the rename fails, the file is written directly, as before.
- A token refresh no longer creates the token file again after a sign-out, and no longer overwrites a newer sign-in's token with an older client's answer.

### Health
- `health` with `live: true` adds `accessTokenExpiresInSeconds` and a note: the value is the current access token's remaining life (at most about an hour, renewed on its own), not how long the login lasts. `expiresInSeconds` is kept. `gsm status --check` says the same next to "access token expires in".

## 1.1.2 - 2026-10-29

### Fixes: what a sign-in asks Google for
- The sign-in no longer sends `include_granted_scopes`. With it, Google returned every scope the account had granted the project, and the token was saved with all of them, so a Gmail token could carry Cloud and Search Console scopes. Google says incremental authorization is not supported for installed apps.
- The merge no longer takes the default account's stored scopes for whichever account signs in. It reads the stored scopes of the account you name, and keeps only the scopes a server of the group uses. A scope that came from another group's sign-in is listed as "Not requested again".
- New `--account <email>` for `gsm login`, and `account` for the chat tool `auth_login`. Google preselects that account (login hint), and its stored scopes are merged. Without an account, nothing is merged, and the output says so.
- A save never takes scopes away from an account that is already signed in, unless that account was named (and you unticked scopes on Google's consent screen) or you pass `--replace`. When you name one account and pick another in the browser, or name none and pick one that holds more scopes, the login saves nothing, leaves the token as it was, and prints the command (and the chat call) to try again. `auth_status` repeats that message.
- The "This token runs ..." line counts the scopes Google granted. Before the browser step, the login says what the token would run if every scope asked for is granted.

### Notes
- Each plugin's `servers.json` now lists every scope its login group uses (`groupScopes`), because a plugin knows only its own server.
- Existing tokens keep their scopes until the next sign-in. To clean a token that holds scopes from another group, sign in again naming the account; `cloud-platform` is also a workspace-user scope (the gcontacts plugin's `health_*` tools use it), so drop it with `--replace`.

## 1.1.1 - 2026-10-29

### Fixes
- `ads_search` (gads) no longer sends `pageSize`. Google's v26 reference says the API answers `PAGE_SIZE_NOT_SUPPORTED` when the field is set, and the tool always set it, so its calls would fail (found in the reference, not reproduced against a live account). Google sets the page size itself. The `page_size` input is removed; a caller that still passes it gets the same request, because unknown inputs are dropped. The tool still returns one page, at most 500 rows.

## 1.1.0 - 2026-10-18

### Project readiness (gcloud server)
- `project_readiness` (read): checks a Google Cloud project against what each login group needs. It lists the APIs that are enabled and the ones that are missing, shows whether each group is signed in here, and lists the console steps that have no API: the consent screen, publishing, the Desktop client, test users, and Basic API Access. Pass `groups` to check some groups only.
- `project_enable_missing` (write, asks for approval): enables the missing APIs for the chosen groups, in batches of at most 20 services. It runs in the background, so run `project_readiness` again to confirm.
- The service lists are checked by tests against `config/products.json`, so they follow the product map.

### Notes
- Google offers no API we can use for the consent screen, publishing, test users or the Desktop OAuth client. The checklist links to the console pages for them.
- The old IAP OAuth brand and client API is shut down, so it is not used.

## 1.0.1 - 2026-10-17

### Fixes
- The live checks read the granted scopes and the time left from Google's token info in the shape google-auth-library returns (`scopes` as a list, `expiry_date` in milliseconds). Before, the granted scopes were read as empty, so a valid login could show its stored scopes as no longer granted. This affected every OAuth login and the ADC login, in `status --check`, `doctor`, and the health tool with `live: true`.

## 1.0.0 - 2026-10-17

This is a major version: two products change how they sign in, so people must act once.

### Action needed
- **gplay and gmerchant use a service account key now.** Their OAuth logins are not used any more. To set up: add the service account's email in Play Console (Users and permissions) and as an Admin user of Merchant Center, then run `node gsm.mjs setup-service-account --key-file <service account JSON>`, or call `auth_setup_service_account` in the chat. `gsm login gplay` or `gsm login gmerchant` explains the steps.
- **gmaps uses an API key now.** Save a key restricted to the Maps APIs with `node gsm.mjs setup-apikey` (or GSM_API_KEY). The OAuth login for gmaps is not used any more. The key is shared with gsearch.

### Secret storage (opt-in)
- `node gsm.mjs protect` moves the saved secrets (OAuth tokens, the client secret and its backups, the API key, the Ads developer token) into the operating system's store. Windows uses DPAPI, which encrypts for your user on this machine. `node gsm.mjs protect --off` moves them back to plain files.
- Every value is read back from the store before its plain copy is removed. If one value fails, nothing is changed.
- The store choice is kept in `store.json`. The names of the stored secrets are kept in `secrets.json`, with no content. `GSM_TOKEN_STORE` overrides the choice.
- macOS (Keychain) and Linux (libsecret) are implemented. They are not run in this release: only Windows (DPAPI) was tested.
- The default is still plain files with mode 0600, so nothing changes until you run `protect`.

### Service accounts
- New login group `service-account` for gplay and gmerchant (scope https://www.googleapis.com/auth/androidpublisher and https://www.googleapis.com/auth/content). The key is referenced by path, never copied, and never printed.
- `status --check` and `health --check` ask Google whether the key is accepted. They do not check Play or Merchant access, which Play Console and Merchant Center decide.
- `setup-service-account --remove` forgets the setup. The key file is not deleted.
- If GOOGLE_APPLICATION_CREDENTIALS points to a service account key, the group uses it, without a setup step.

### Changes
- `doctor` checks the service account, the secret store and that every stored name is present in the store.
- `status` reports the secret store and the service account.
- Setup prompts and install steps only ask for the admin setup when it is missing.

## 0.6.0 - 2026-10-17

### Application Default Credentials as a sign-in option
- Every Google server offers ADC next to the saved OAuth client. `auth_login` lists both ways first, with their pros and cons, and runs the one you choose (`method: "oauth"` or `"adc"`).
- ADC uses the gcloud CLI. For the cloud servers it uses gcloud's built-in client, so no client file is needed. For other APIs it uses your saved OAuth client through gcloud, with the group's scopes.
- A group with no account of its own uses the ADC login. A group with accounts uses those accounts. ADC holds one login per machine. The suite records which group and scopes that login holds, as a hash of its token, never the token.
- `health`, `auth_status`, `status` and the live check count an ADC login as a login. When the login has no quota project, `health` says so and gives the command that sets one.
- `logout` says when a group is on ADC. It does not remove that login. The message names `gcloud auth application-default revoke`.
- Cloud tools and generated tools share one login path. A new login is used without a restart.

### Fixes
- `health` reported "not logged in" for cloud while its calls worked through ADC.

### Notes
- ADC for the Workspace groups needs your own OAuth client. gcloud's built-in client cannot grant those scopes.
- The gcloud CLI must be installed for the ADC route. The suite does not install it.

## 0.5.0 - 2026-10-17

### Several accounts per Google group
- Each Google group can have several accounts, for example two Gmail accounts or two Drive accounts. Signing in again adds the account it signs in with. Google's account chooser opens, so you pick the one to add.
- New agent tools: `accounts_list` (the signed-in accounts and the default), `account_set_default` (makes one account the default), and `account_remove` (revokes one account and removes its token from this machine).
- Every Google tool takes an optional `account` argument, the account's email address. Without it, the default account is used. The argument never reaches Google.
- A token file from before this release is the default account of its group. Nothing has to be signed in again.
- New commands: `gsm accounts` lists the accounts of each group, `gsm accounts default <group> <email>` sets the default, and `gsm logout <group> --account <email>` removes one account. `status` and `status --check` list every account.

### Notes
- The scopes of an account are checked when the tools load, for the default account. A call for another account that lacks a scope gets Google's scope error.

## 0.4.0 - 2026-10-16

### Sign-in from the chat
- Google servers sign in from Claude Code. `auth_setup_client` saves the Desktop OAuth client from a file path, `auth_login` returns the Google address to approve, and `auth_status` loads the tools once the sign-in finishes. No terminal is needed.
- The sign-in runs the same `gsm login` as the terminal, so the scopes, PKCE, the recorded account and the token file are the same.
- `auth_setup_admin` sets up the admin server's service account from a key file path.
- The health report names the next tool to call for a server that is not signed in (`auth_setup_client`, then `auth_login`).
- The sign-in and setup tools are writes in the plugin map, so the hook asks before each call. API keys are never sent through the chat.

## 0.3.0 - 2026-10-16

### Health and identity
- Every server has a read-only `health` tool. It reports the server version, the login kind and whether it is logged in, the account the login belongs to, how many tools are registered and hidden, and whether writes are allowed. It works before a login. `live: true` also asks Google whether the login still works.
- New command `gsm health`: one row per server, with its login, account and tool count. `--check` asks Google once per group, `--plugin <id>` narrows it to one server, and `--json` prints the rows. It exits 1 when a plugin folder is missing or a check fails.
- Logins request the email scope (`userinfo.email`), which grants no tool access, and record the account they belong to. `status` shows it offline, and `status --check` shows it live.

### Credentials
- `status --check` asks Google whether each login is valid, expired or revoked, which scopes it grants, and whether the API key is restricted. It exits 1 when a check needs attention. Plain `status` still makes no network call.
- `logout` revokes the login at Google before it removes the token file. `logout --local-only` removes the file only.
- Logins use PKCE (S256).
- An expired or revoked login gives one message, with the command that logs in again.
- The saved API key records when it was saved. `status` shows its age and warns after 90 days.
- On Windows the token folder's access list is limited to your user, SYSTEM and Administrators. `doctor` checks it.

### Tools
- Before a login, the OAuth servers list only the tools that need no scope, plus `auth_status`. After a login, `auth_status` loads the rest, without a restart.
- `cloud_apikey_reveal` (gcloud) returns a secret, so it is a write now. The billing account move (`cloudbilling.organizations.billingAccounts.move`) changes state, so it is a write too. Both stay hidden unless writes are allowed.
- Login hints print the command you ran, not a generic `gsm login`.

### Consent change
- A login now asks for one more permission: the email scope. Logins made before this release do not have it, and their account shows as not recorded until you log in again.

### Note
- 0.2.0 was never released. Its changes are part of this release.

## 0.1.4 - 2026-10-16

- The package is `google-services-mcps`. The installer is the package itself, and the wrapper package is gone.
- The scoped name `@firedmosquito831/google-services-mcps` is deprecated. Its versions still install.
- The docs and the printed commands use `npx google-services-mcps`.
- One npm workflow publishes the package, from a GitHub release. `scripts/bump.mjs` moves the version in one step.

## 0.1.3 - 2026-10-16

- Interactive menu: run `npx google-services-mcps` with no arguments in a terminal.
- `--install-missing` installs what gsm can install: Claude Code, Codex and OpenCode through npm, and git through winget or Homebrew.
- Claude Code: the marketplace is declared in the same scope as the plugin, and `--allow-writes` and `--confirmation` are passed to the plugin as its options.
- Install guide and one-line installers.
