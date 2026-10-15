# Setup per product

Each product plugin has one login group. Log in once per group, then install the products that use it.

| Product (plugin) | Login group | Setup |
|---|---|---|
| gcloud, gai | `cloud` | Desktop OAuth client, then `login cloud` |
| gsc | `searchconsole` | Desktop OAuth client, then `login searchconsole` |
| gdrive, gmail, gcalendar, gchat, gmeet, gcontacts, gtasks, gclassroom, gapps | `workspace-user` | Desktop OAuth client, then `login workspace-user` |
| gadmin | `workspace-admin` | Service account with domain-wide delegation, then `setup-admin` |
| ganalytics, gtm, gyoutube, gbusiness, gads, gmerchant | `business` | Desktop OAuth client, then `login business` |
| gplay, gfirebase, gmaps | `developer` | Desktop OAuth client, then `login developer` |
| gsearch | `apikey` | API key, then `setup-apikey` (no login) |

## Desktop OAuth client (most products)

1. In Google Cloud console, create a project for this suite if you do not have one.
2. Enable the APIs of the products you use (for example Gmail API, Google Drive API, Google Calendar API).
3. Configure the OAuth consent screen. Use **Internal** for a Workspace domain. If you choose **External**, publish the app: an app left in **Testing** loses its refresh token after 7 days.
4. Create credentials, OAuth client ID, type **Desktop app**. Download the JSON.
5. Save it into the token directory:

   ```
   node <plugin>/bin/gsm.mjs setup-client <client_secret.json>
   node <plugin>/bin/gsm.mjs login <group> --profile readonly
   node <plugin>/bin/gsm.mjs status
   ```

   `readonly` is the default. Widen it only when you need changes: `--profile readwrite`.

## Workspace admin (gadmin)

Domain-wide delegation needs a super admin and a Google Cloud service account.

1. Create a service account and a JSON key. If your organisation blocks key creation (the default for organisations created since May 2024), ask your administrator for an exception or use a different setup.
2. In the Google Admin console, under Security, API controls, Domain-wide delegation, add the client ID with the scopes the profile lists (`gsm scopes workspace-admin` prints them).
3. Run:

   ```
   node <plugin>/bin/gsm.mjs setup-admin --subject <super-admin-email> --key-file <key.json> --profile readonly
   ```

The key file is not copied; the suite reads it from where you put it.

## API key (gsearch)

Public search and web-quality APIs take a key, not OAuth:

```
node <plugin>/bin/gsm.mjs setup-apikey
```

Paste the key when asked, or pipe it in. It is never printed or passed on the command line.

## Turning confirmations off

Confirmations are on by default. To change them, set the plugin option `confirmation` with `claude plugin configure <plugin>`, or pass `--confirmation destructive-only|off` when installing for another agent. See `docs/SECURITY.md` before you turn them off.

## Checking a setup

```
node <plugin>/bin/gsm.mjs status          # tokens, granted scopes, confirmation and write settings
node <plugin>/bin/gsm.mjs scopes <group>  # what each profile would enable
```

Restart the MCP server after login (`/mcp` in Claude Code) so it picks up the new token.
