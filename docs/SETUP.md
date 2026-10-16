# Setup per product

Each product plugin has one login group. Log in once per group, with the list of products you use. A login merges with the scopes already stored for its group, so logging in for one product keeps the others. Use `--replace` to drop the stored scopes and keep only what this login requests. A merge can leave write scopes from an earlier readwrite login in place: when you want a readonly token again, log in with `--replace`. See [INSTALL.md](INSTALL.md#two-command-lines).

The commands in this guide use the installer, `npx google-services-mcps`. They run from any folder, and no build is needed. Each plugin folder also has its own copy of the installer, which knows only its own product.

| Product (plugin) | Login group | Setup |
|---|---|---|
| gcloud, gai | `cloud` | Desktop OAuth client, then `login cloud` |
| gsc | `searchconsole` | Desktop OAuth client, then `login searchconsole` |
| gdrive, gmail, gcalendar, gchat, gmeet, gcontacts, gtasks, gclassroom, gapps | `workspace-user` | Desktop OAuth client, then `login workspace-user` |
| gadmin | `workspace-admin` | Service account with domain-wide delegation, then `setup-admin` |
| ganalytics, gtm, gyoutube, gbusiness, gads, gmerchant | `business` | Desktop OAuth client, then `login business`. Google Ads also needs the notes in [Google Ads (gads)](#google-ads-gads). |
| gplay, gfirebase, gmaps | `developer` | Desktop OAuth client, then `login developer` |
| gsearch | `apikey` | API key, then `setup-apikey` (no login) |

## Desktop OAuth client (most products)

1. In the Google Cloud console, create a project for this suite if you do not have one. Use the same project for the products of one group. Google Ads access is tied to this project (see [Google Ads (gads)](#google-ads-gads)).
2. Enable the APIs of the products you use. For example, the Gmail API, the Google Drive API and the Google Calendar API.
3. Configure the OAuth consent screen. Use **Internal** for a Workspace domain. If you choose **External**, publish the app. An app left in **Testing** loses its refresh token after 7 days.
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
- `logout` revokes the login at Google before it removes the token file. Use `logout <group> --local-only` to remove the file only.

Then restart the server (`/mcp` in Claude Code).

The token directory is `~/.google-services-mcps` by default. To use another folder, set the plugin option **Token directory**, or the environment variable `GSM_TOKEN_DIR`.
