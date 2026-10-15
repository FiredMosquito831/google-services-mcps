# Google services MCP suite: start here

This guide explains what the suite is, how its parts fit together, and gets you to one working read in about five minutes. Read it before you install anything.

**Status.** The code is built and unit-tested. It has not been run against live Google accounts yet. Test each product with one read tool first, on an account where a mistake does no harm.

## What the suite is

The suite gives an AI agent tools for Google products. Each Google product has its own MCP server. There are 23 servers, for example Gmail, Google Calendar, Google Drive, Google Cloud, Search Console and Google Ads. The full list is in [SURFACES.md](SURFACES.md).

- Each server is packaged as a Claude Code plugin. There is one plugin per product, all in one marketplace named `google-services-mcps`.
- The same servers can be installed for Codex, OpenCode and Antigravity (`agy`) with the `node gsm.mjs` installer.
- The servers run on your machine, as you. They call Google's APIs with your own OAuth desktop client, API key or service account. The suite has no server of its own.
- The suite does not charge for anything. Google's quotas, approval rules and prices apply to every call. See [LIMITS-AND-COSTS.md](LIMITS-AND-COSTS.md).

## How the pieces fit together

```
marketplace   google-services-mcps        this repository, added once to Claude Code
  plugin      gmail                       one per product, installed per user, project or folder
    MCP server  gmail                     starts with Claude Code and offers the tools
    hook        gsm-hook                  runs before each tool call and asks before changes
    tool map    97 tools for gmail        the tool names the server offers

token directory   ~/.google-services-mcps  on Windows: C:\Users\<you>\.google-services-mcps
  client_secret.json    your OAuth desktop client (from setup-client)
  <group>.token.json    the login for one group, for example workspace-user.token.json
  apikey.json           the API key for gsearch (from setup-apikey)
  policy.json           your allow, ask and deny rules (optional, you write it)
  audit.log             one line for each gated action (written by the suite)
```

Some terms used in these guides:

| Term | Meaning |
|---|---|
| Marketplace | A catalog of plugins. You add it once. |
| Plugin | One product, for example `gmail`. You install the products you use. |
| MCP server | The process that gives the agent its tools. Each plugin has one server with the same name as the plugin. |
| Hook | A check that runs before each tool call of a plugin. It asks you before a change or a delete. |
| Login group | A set of products that share one login. For example `workspace-user` covers Gmail, Calendar and Drive. |
| Token directory | The folder where logins, the client file and the policy file are kept. |
| Gateway tools | Three tools in each product that has gateway APIs (`api_search`, `api_describe`, `api_call`). They reach those APIs. |

Tool names in Claude Code look like this: `mcp__plugin_gmail_gmail__gmail_users_messages_list`. The part after the last `__` is the tool. See [USING.md](USING.md).

## Quick start (about five minutes)

This example sets up Gmail for Claude Code. You need Node.js 20 or newer, Claude Code, a Google account (a Google Workspace account is best) and a copy of this repository. There is no build step. The full walkthrough, with every option, is in [TUTORIAL.md](TUTORIAL.md).

In the examples, the repository folder is `D:\Projects2\Google-services-mcps`. Use your own path. Run the commands from that folder.

**1. Install the Gmail plugin for your user account.** The first install also adds the marketplace, so there is no separate step.

```
node gsm.mjs install --agent claude --plugin gmail
```

Claude Code may ask for the plugin's options. Leave **Allow write tools** off for now. Keep **Confirm before changes** at `every-change`. Leave the token directory empty. Section 6.1 of the tutorial explains each option.

**2. Create a Desktop OAuth client and save its file.**

Follow the steps in [SETUP.md](SETUP.md). They cover the Google Cloud project, the consent screen and the client file. Then save the file into the token directory:

```
node gsm.mjs setup-client "C:\path\to\client_secret.json"
```

**3. Log in with the read-only profile.**

```
node gsm.mjs login workspace-user --profile readonly --servers gmail
node gsm.mjs status
```

The login opens a browser. Approve the Google consent screen. Then `status` shows the group as logged in. **UNVERIFIED:** the sign-in itself was not run for this guide.

**4. Restart Claude Code and check the server.**

Start Claude Code in your working folder. Run `/mcp` and check that `gmail` shows as connected. If the server was already running before the login, reconnect it there, or restart Claude Code. **UNVERIFIED** in a live session. You can check the install from a terminal with `claude plugin list` and `node gsm.mjs list`.

**5. Run one read.**

Ask Claude:

> Show the subjects of my five most recent Gmail messages.

Claude calls read tools, such as `mcp__plugin_gmail_gmail__gmail_users_messages_list`. Reads never ask for approval. If you see an error, see [TUTORIAL.md section 11.2](TUTORIAL.md#112-common-problems) and the troubleshooting section in [INSTALL.md](INSTALL.md).

When this works, you have proved the chain: marketplace, plugin, server, login and API call.

## Rules to follow from the start

- Start with the read-only profile and with **Allow write tools** off.
- Install one product first. Add the others one at a time. See [CHOOSING.md](CHOOSING.md).
- Test changes on a test account or a test project first. A change or a delete runs on the real account.
- Read the approval text before you approve. It shows the exact action and its arguments.

## Where to read next

| Document | Read it when |
|---|---|
| [INSTALL.md](INSTALL.md) | You install, update, check or remove the suite, for Claude Code, Codex, OpenCode or Antigravity. |
| [CHOOSING.md](CHOOSING.md) | You decide which products to install. |
| [USING.md](USING.md) | You use the suite each day: approvals, the policy file, profiles, gateway tools, the audit log and common errors. |
| [SETUP.md](SETUP.md) | You set up an OAuth client, the workspace admin, the API key or Google Ads. |
| [SECURITY.md](SECURITY.md) | You want to know what protects you, and what does not. |
| [LIMITS-AND-COSTS.md](LIMITS-AND-COSTS.md) | You want to know quotas, costs and approvals before you run large jobs. |
| [SURFACES.md](SURFACES.md) | You want the list of products, login groups and install commands. |
| [CAPABILITIES.md](CAPABILITIES.md) | You want to know what each product can do. |
| [products/](products/) | You want one page for one product. |
