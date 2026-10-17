# Changelog

All notable changes to the npm package `google-services-mcps`. Each release has a matching GitHub release (`vX.Y.Z`), whose notes are the entry below. Versions 0.1.0 to 0.1.2 are listed on the GitHub releases page.

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
