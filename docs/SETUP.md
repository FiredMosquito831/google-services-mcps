# Setup per product

Each product plugin has one login group. Log in once per group, with the list of products you use. A login merges with the scopes the same account already holds for its group, so logging in for one product keeps the others. Name the account with `--account <email>` (in the chat: `auth_login` with `account`): only that account's stored scopes are merged, and only the ones a server of the group uses. Without `--account`, nothing is merged, and a login that would take scopes away from an account already signed in saves nothing and says how to retry. Use `--replace` to drop the stored scopes and keep only what this login requests. A merge can leave write scopes from an earlier readwrite login in place: when you want a readonly token again, log in with `--replace`. See [INSTALL.md](INSTALL.md#two-command-lines).

The commands in this guide use the installer, `npx google-services-mcps`. They run from any folder, and no build is needed. Each plugin folder also has its own copy of the installer, which knows only its own product.

| Product (plugin) | Login group | Setup |
|---|---|---|
| gcloud, gai | `cloud` | Desktop OAuth client, then `login cloud` |
| gsc | `searchconsole` | Desktop OAuth client, then `login searchconsole` |
| gdrive, gmail, gcalendar, gchat, gmeet, gcontacts, gtasks, gclassroom, gapps | `workspace-user` | Desktop OAuth client, then `login workspace-user` |
| gadmin | `workspace-admin` | Service account with domain-wide delegation, then `setup-admin` |
| ganalytics, gtm, gyoutube, gbusiness, gads | `business` | Desktop OAuth client, then `login business`. Google Ads also needs the notes in [Google Ads (gads)](#google-ads-gads). |
| gfirebase | `developer` | Desktop OAuth client, then `login developer` |
| gplay, gmerchant | `service-account` | Service account key, then `setup-service-account` (no login). See [Google Play and Merchant Center](#google-play-and-merchant-center-gplay-gmerchant). |
| gsearch, gmaps | `apikey` | API key, then `setup-apikey` (no login) |

## Desktop OAuth client (most products)

1. In the Google Cloud console, create a project for this suite if you do not have one. Use the same project for the products of one group. Google Ads access is tied to this project (see [Google Ads (gads)](#google-ads-gads)).
2. Enable the APIs of the products you use. For example, the Gmail API, the Google Drive API and the Google Calendar API.
3. Configure the OAuth consent screen. Use **Internal** for a Workspace domain. If you choose **External**, publish the app. An app left in **Testing** loses its refresh token after 7 days. Before you can publish, Google asks for an app name, a support email, a homepage URL and a privacy policy URL. The suite's privacy policy, which says what the software does with your data, is at https://firedmosquito831.github.io/google-services-mcps/privacy.html.
4. Create credentials: an OAuth client ID of type **Desktop app**. Download the JSON file.
5. Save the file into the token directory, then log in:

   ```
   npx google-services-mcps setup-client C:\path\to\client_secret.json
   npx google-services-mcps login workspace-user --profile readonly --servers gmail,gcalendar
   npx google-services-mcps status
   ```

   `setup-client` copies the file into the token directory as `client_secret.json`, with mode 0600. If that file already exists, the command stops. Run it again with `--force` to replace it. The old file is backed up first.

   `readonly` is the default profile. Use `--profile readwrite` only when you need changes. The `--servers` list names the products this login requests scopes for. The scopes stored for the other products are kept. Leave it out only if you want every product of the group. The default covers all of them.

### Login options

These options are checked against `npx google-services-mcps --help`:

| Option | Meaning |
|---|---|
| `--profile readonly\|readwrite\|full` | The scope profile. `readonly` is the default. See [USING.md](USING.md#6-read-only-and-write-profiles). |
| `--scopes <url,url>` | An exact list of scopes. Nothing else is added. |
| `--servers <a,b>` | The products this login covers. Each name is a product id. |
| `--client-secret <file>` | Use this client file for this login only. The stored copy is not changed. |
| `--no-browser` | Print the login URL and do not open the browser. Open the URL in a browser on the same machine. The redirect goes to `127.0.0.1`. |
| `--with <part,...>` | Add an optional part of a product, which every profile leaves out otherwise. Gmail has `postmaster` (Gmail Postmaster Tools). See [USING.md](USING.md#6-read-only-and-write-profiles). |

After a login, restart the server so the new scopes apply: run `/mcp` in Claude Code and reconnect, or restart the agent.

### Groups that fall back

- **cloud** (`gcloud`, `gai`). If no token is stored, the cloud servers fall back to Application Default Credentials (`src/core/auth.ts`). This guide does not explain how to set up Application Default Credentials. **UNVERIFIED** here.

## Workspace admin (gadmin)

Domain-wide delegation needs a super admin and a Google Cloud service account.

1. Create a service account and a JSON key. If your organisation blocks key creation (the default for organisations created on or after 2024-05-03), ask your administrator for an exception, or use another setup. See [LIMITS-AND-COSTS.md](LIMITS-AND-COSTS.md#8-other-rules-from-the-limits-files).
2. In the Google Admin console, under **Security**, **API controls**, **Domain-wide delegation**, add the service account's client ID with the scopes the profile lists. To print the scopes, run:

   ```
   npx google-services-mcps scopes workspace-admin --profile readonly
   ```

3. Record the super admin and the key file:

   ```
   npx google-services-mcps setup-admin --subject admin@example.com --key-file C:\path\to\key.json --profile readonly
   ```

The command checks that the file is a service account key (JSON with a `client_email`). It never prints the file. The key file is not copied. The suite reads it from where you put it, so do not move it. The admin's email and the key file can also be set as plugin options (`admin_subject` and `service_account_key_file`).

## Checking the Google Cloud project

The gcloud server can check a project for the MCPs:

- `project_readiness` lists, for each login group, which APIs are enabled, which are missing, whether the group is signed in here, and the console steps that have no API. It only reads.
- `project_enable_missing` enables the missing APIs for the groups you choose, after you approve it. It needs writes allowed for the gcloud plugin, and it runs in the background, so check again with `project_readiness` afterwards.

Google has no API for the consent screen, publishing, test users or the Desktop OAuth client. Those are the console steps in the readiness output.

## Google Play and Merchant Center (gplay, gmerchant)

These two use a service account key, not a login. Google recommends a service account for this kind of server-side use.

1. In the Google Cloud console, open IAM & Admin > Service accounts, and create a service account. Under Keys, add a JSON key. Keep the file.
2. Give the service account's email address (it ends in `.iam.gserviceaccount.com`) access:
   - Google Play: Play Console > Users and permissions, and add the email with the rights you need.
   - Merchant Center: add the email as a user with Admin access, as the [Merchant API quickstart](https://developers.google.com/merchant/api/guides/quickstart/authentication) describes.
3. Record the key:

   ```
   node gsm.mjs setup-service-account --key-file C:\path\to\key.json
   ```

   Or call `auth_setup_service_account` in the chat. gsm stores only the path to the key, the account's email and the time. It never copies or prints the key. `node gsm.mjs setup-service-account --remove` forgets the setup, and the key file stays where it is.
4. Restart the gplay and gmerchant servers.

Google accepts calls only for accounts that Play Console or Merchant Center lists. `status --check` checks the key with Google, and it does not check that access.

If `GOOGLE_APPLICATION_CREDENTIALS` points to a service account key, these servers use that key, with no setup step.

## Google Maps (gmaps)

gmaps uses an API key, like gsearch. Create the key in Google Cloud console, restrict it to the Maps APIs you use, and save it with `node gsm.mjs setup-apikey`. gsearch and gmaps share the one saved key.

## Keeping the secrets in the OS store (optional)

By default the saved secrets are plain files in the token folder, with mode 0600 on Linux and macOS. To keep them in the operating system's store:

```
node gsm.mjs protect
```

- Windows uses DPAPI. The data is encrypted for your Windows user on this machine. A copy of the token folder on another machine, or for another user, cannot be read.
- macOS (Keychain) and Linux (libsecret) are implemented, but they were not run in this release.
- Each value is read back from the store before its plain file is removed. If one value fails, nothing is changed.
- To return to plain files: `node gsm.mjs protect --off`.
- `node gsm.mjs status` shows which store is in use. The names of the stored secrets are listed in `secrets.json`, and the choice is in `store.json`. Neither holds a secret.

## Google Ads (gads)

Google Ads is part of the `business` group. Log in with `login business`, as above.

- **Access comes from the Cloud project.** Google's developer-token page says that access now belongs to the Google Cloud project of your OAuth client. New access is requested on the Google Ads API Overview page in the Cloud console, not the API Center. (Source: limits file, section 2.1.)
- **The developer token is optional.** Google sunset developer tokens on 2026-09-09. The suite sends the developer-token header only when a token is set. It does not stop without one. **UNVERIFIED:** whether Google still issues developer tokens to new users.
- **Where a token can be set,** if you have one:
  - the plugin option **Google Ads developer token** (`ads_developer_token`). It is marked sensitive;
  - or `GSM_ADS_DEVELOPER_TOKEN`;
  - or a file `ads.json` in the token directory, with the content `{"developerToken": "..."}`.
- **Manager accounts.** If you reach client accounts through a manager (MCC) account, set the plugin option **Manager (login) customer ID** (`ads_login_customer_id`). It is the 10-digit ID without dashes. The environment variable is `GSM_ADS_LOGIN_CUSTOMER_ID`.
- **Access levels** decide what you can do. Test access works only on test accounts, with 15,000 operations per day. Start there. The levels and their limits are in [LIMITS-AND-COSTS.md](LIMITS-AND-COSTS.md).

## API key (gsearch)

Public search and web-quality APIs take a key, not OAuth. There is no login.

```
npx google-services-mcps setup-apikey
```

The command does **not** ask for the key. It reads the key from one of two places:

- the environment variable `GSM_API_KEY_INPUT`, or
- stdin, when you pipe the key in. For example, in Git Bash or another POSIX shell: `printf '%s' "$KEY" | npx google-services-mcps setup-apikey`. In PowerShell, pipe the text directly, for example `'your-key' | npx google-services-mcps setup-apikey`.

If neither is given, the command stops with an error and writes nothing. The key is never a command-line argument, and it is never printed. It is saved as `apikey.json` in the token directory, with mode 0600. An existing file is replaced only with `--force`, and no backup is kept.

The environment variable `GSM_API_KEY` is also read by the server, and it takes priority over the saved file.

Restrict the key to the APIs you use. [LIMITS-AND-COSTS.md](LIMITS-AND-COSTS.md) lists the limits.

**Reported:** the Custom Search JSON API is closed to new customers and is reported to be discontinued on 2027-01-01. Check this in the Google Cloud console before you rely on it.

## Turning confirmations off

Confirmations are on by default (`every-change`). To change them:

- **Claude Code.** Change the option **Confirm before changes** in `/plugin`, then **Configure options**. Or use `claude plugin configure <id>@google-services-mcps --values-stdin` (see [INSTALL.md](INSTALL.md#3-set-the-plugin-options)).
- **Codex, OpenCode and Antigravity.** Pass `--confirmation destructive-only` or `--confirmation off` when you install:

  ```
  npx google-services-mcps install --agent codex --plugin gmail --scope global --confirmation destructive-only --dry-run
  ```

  For Claude Code, `--confirmation` does not write the option. The install prints how to set it.

Every approval prompt ends with this footer. It always names the setting:

> You can turn these confirmations off or limit them in the plugin settings: set 'confirmation' to 'destructive-only' (ask only before deleting or sending) or 'off' (no prompts; policy rules still apply).

`off` means nothing asks. Deny rules in the policy file still apply. Read [SECURITY.md](SECURITY.md) before you turn confirmations off.

## Retries and quota errors

The suite retries throttled requests (HTTP 429 and 503, and some rate-limit 403s on reads). It makes three attempts in all. After that, the error is returned. The details and the waits are in [LIMITS-AND-COSTS.md](LIMITS-AND-COSTS.md#4-quota-errors-and-what-the-suite-does).

## Two ways to sign in: OAuth or ADC

Every Google server asks which way to sign in: the saved OAuth client (`oauth`) or Application Default Credentials (`adc`). The chat shows both with their pros and cons, and the person chooses.

| | `oauth`: the saved client | `adc`: Application Default Credentials |
|---|---|---|
| Accounts | Several at once, each with its own token | One login per machine |
| Where the token is kept | The token folder. Logout revokes it | gcloud's folder. Logout here does not remove it |
| What you need | A Desktop OAuth client from your own Google Cloud project | The gcloud CLI installed. For the Workspace groups, the same client file as `oauth` |
| Cloud APIs | Yes | Yes, with gcloud's built-in client: no client file |
| Other APIs | Yes | Yes, through gcloud with your client. gcloud's built-in client is for cloud scopes; gcloud's docs say other scopes need your own client |
| Quota project | Not needed | Some cloud calls need one: `gcloud auth application-default set-quota-project <project-id>` |

To sign in with ADC from the chat, call `auth_login` with `method: "adc"`. The suite runs `gcloud auth application-default login` for you, and the browser opens on this machine. You can also run it yourself in a terminal, for cloud APIs:

```
gcloud auth application-default login
```

To remove an ADC login: `gcloud auth application-default revoke`. `logout` in the suite does not remove it.

## Several accounts

A Google group can have several accounts, for example a work Gmail and a personal Gmail.

- To add an account, sign in again (`auth_login` in the chat, or `login <group>` in a terminal). Google shows the account chooser, so pick the account to add. The new account is kept next to the others.
- The first account signed in for a group is its default. Tools use the default when a call names no account.
- In the chat, ask for `accounts_list` to see the accounts and the default. Ask for `account_set_default` to change the default, or `account_remove` to remove one account.
- Any Google tool takes an `account` argument with the account's email address. For example, a Gmail search for the second account names that account, and the others are unchanged.
- In a terminal: `gsm accounts` lists them, `gsm accounts default <group> <email>` sets the default, and `gsm logout <group> --account <email>` removes one account.

Each account has its own token file in the token folder, and `accounts.json` lists them.

## Checking a setup

```
npx google-services-mcps status
npx google-services-mcps scopes workspace-user --servers gmail
npx google-services-mcps doctor --plugin gmail
```

- `status` shows the token directory, each group's login, the API key and the admin setup. It prints no secret. It makes no call to Google.
- `status --check` asks Google whether each login still works (valid, expired or revoked), which scopes Google grants, and whether the API key is restricted. It exits with code 1 when a check needs attention. Run it after a login, and when a tool says the login expired.
- `health` lists every server on one row each: its login, the account it belongs to, and its tool count. It makes no call to Google. `health --check` asks Google about each login, once per group. It exits with code 1 when a plugin folder is missing or a check fails. `health --json` prints the rows as data.
- `scopes` shows what each profile would enable. Read it before you widen a login.
- `doctor` checks the plugin files, the hook and the tool names. On Windows it also checks that the token folder is limited to you, SYSTEM and Administrators. It exits with code 1 if any check fails.
- Before a login, a server lists only the tools that need no scope, plus `auth_status`. After `login`, ask the server to call `auth_status`: its tools then load, with no restart.
- `logout` revokes the login at Google before it removes the token file. Use `logout <group> --local-only` to remove the file only. When the same account is signed in here for another group, `logout` and `account_remove` remove only the local token, because Google's revocation would end that other login too; `logout ... --revoke-all` revokes anyway.

Then restart the server (`/mcp` in Claude Code).

The token directory is `~/.google-services-mcps` by default. To use another folder, set the plugin option **Token directory**, or the environment variable `GSM_TOKEN_DIR`.
