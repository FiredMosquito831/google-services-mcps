# Choose which products to install

Install a product only when you have a use for it. This guide helps you pick products by goal. It gives the login group, the cost and the risk of each. The cost column links to [LIMITS-AND-COSTS.md](LIMITS-AND-COSTS.md). Read [GUIDE.md](GUIDE.md) first if you have not set up anything yet.

## The rules

1. **Install only what you use.** Each installed plugin adds its tools to your sessions. Claude Code can defer tool definitions (tool search is on by default), but a large tool list still costs context. Check a plugin's projected cost with `claude plugin details <id>@google-services-mcps` (**help only**).
2. **Start with readonly.** Log in with `--profile readonly`. Leave **Allow write tools** off. Turn on changes later, for one product at a time, when you need them.
3. **Start with one product.** Test one read. Then test one change on a test account. Only then add the next product.
4. **Add products one at a time.** Each one needs its own login group and its own setup.
5. **Switch a server off for one session with `/mcp`.** This does not uninstall anything. Use `/mcp` in Claude Code to turn a server off, and turn it on again later.
6. **Log in once per group, with the list of products you use.** Products in one group share one login. A login merges with the scopes already stored for its group, so logging in for one product keeps the others. Use `--replace` to drop the stored scopes and keep only what this login requests. A merge can leave write scopes from an earlier readwrite login in place: when you want a readonly token again, log in with `--replace`. See [INSTALL.md](INSTALL.md#troubleshooting-install-and-login).

## Decision table by goal

| Goal | Products | Login group | Setup | Cost (see [LIMITS-AND-COSTS.md](LIMITS-AND-COSTS.md)) | Risk |
|---|---|---|---|---|---|
| Manage a Google Cloud project: projects, APIs, keys, storage, BigQuery, IAM | `gcloud` | `cloud` | Desktop OAuth client, then `login cloud` | Free Tier needs a billing account. Pay-as-you-go prices are UNVERIFIED. | High. It can create and delete projects and API keys, and enable and disable APIs. |
| Check SEO and indexing: search analytics, sitemaps, URL inspection | `gsc`, `gsearch` | `searchconsole` and `apikey` | Desktop OAuth client, then `login searchconsole`. Then `setup-apikey` for `gsearch`. | Search Console quotas per site and project. Custom Search is reported closed to new customers. | Medium. Sitemap and verification changes are writes. |
| Work in Gmail and Calendar, as a personal assistant | `gmail`, `gcalendar`, `gcontacts` | `workspace-user` | Desktop OAuth client, then one `login workspace-user` that covers all three | Included with Workspace. Gmail has per-method quota units. | High. It can send mail, and delete mail, events and contacts. |
| Run a Workspace domain: users, groups, licences, reports | `gadmin` | `workspace-admin` | Service account with domain-wide delegation, then `setup-admin` | Admin SDK fee is UNVERIFIED. Key creation is blocked by default for new organisations. | Very high. It can change every user and group in the domain, and delete data. |
| Audit a Workspace domain (read-only review) | `gadmin`, `gdrive` | `workspace-admin`, `workspace-user` | As above. Use `--profile readonly` for both. | Drive quotas per project and per user. | Low, if you keep the read-only profile. |
| Analytics and tags: GA4 and Tag Manager | `ganalytics`, `gtm` | `business` | Desktop OAuth client, then `login business` | GA4 quotas are in tokens per property per day. Tag Manager has 10,000 requests per project per day. | High. Tag and property changes can affect a live site. |
| Advertising: Google Ads, Display & Video 360, AdSense and more | `gads` | `business` | Desktop OAuth client, then `login business`. See [SETUP.md](SETUP.md) for Google Ads. | Google Ads access level sets the daily operations limit. Test accounts come first. | Very high. Budgets, bids and campaigns spend real money. |
| Shopping: product feeds and Merchant Center | `gmerchant` | `business` | Desktop OAuth client, then `login business` | Quota is per account. Read it with `quotas.list`. | High. Product data changes reach shoppers. |
| Business listings (Google Business Profile) | `gbusiness` | `business` | Desktop OAuth client, then `login business` | 300 requests per minute. Listing edits are limited to 10 per minute per profile, and that cannot be raised. | Medium. Edits change a public listing. |
| Video: YouTube and Blogger | `gyoutube` | `business` | Desktop OAuth client, then `login business` | 10,000 units per day by default, with lower caps on some methods. | High. Uploads, edits and deletes change public content. |
| Publish an Android app: Play Console | `gplay` | `developer` | Desktop OAuth client, then `login developer` | Publishing APIs: 3,000 queries per minute per bucket. Play Console registration is US$25, once. | Very high. Releases and rollouts reach users. |
| Firebase: hosting, rules, crash reports, push messages | `gfirebase` | `developer` | Desktop OAuth client, then `login developer` | Spark is the no-cost plan. Blaze is usage-based. | High. Rules, hosting and push messages reach users. |
| Maps and location: places, addresses, geocoding | `gmaps` | `developer` | Desktop OAuth client, then `login developer` | Free calls per SKU per month, then a price per 1,000 calls. Billing is needed per project. | Low. The main cost is calls. |
| AI and ML: Gemini, Vertex AI, Vision, Speech, Translate | `gai` | `cloud` | Desktop OAuth client, then `login cloud` | Gemini Flash has a free tier. Pro models are paid only. Other prices vary. | Medium. Usage is billed. Some methods create resources. |
| Team chat and meetings | `gchat`, `gmeet` | `workspace-user` | Desktop OAuth client, then one `login workspace-user` | Chat writes are limited to 1 per second per space. | Medium. Messages are seen by other people. |
| Documents and files: Drive, Docs, Sheets, Slides | `gdrive` | `workspace-user` | As above | Drive quotas per project and per user. | High. It can move and delete files, and change sharing. |
| School: Classroom | `gclassroom` | `workspace-user` | As above | Per project and per user, per minute. | High. It can change courses and grades. |
| Tasks and notes: Tasks and Keep | `gtasks` | `workspace-user` | As above | Tasks courtesy limit of 50,000 queries per day. | Medium. |
| Automation: Apps Script projects | `gapps` | `workspace-user` | As above | Per-user daily quotas. | Medium to high. A script can change any data its account can reach. |

The **Risk** column is a summary. The counts in the next table are exact. They come from [CAPABILITIES.md](CAPABILITIES.md).

## Safety classes by product

Read counts from [CAPABILITIES.md](CAPABILITIES.md). The four classes are:

- **Read**: never asks.
- **Write**: creates or changes data. Asks first, unless the confirmation setting is `off`. Hidden unless **Allow write tools** is on.
- **Destructive**: deletes, removes, sends, disables or otherwise cannot be undone easily. Asks twice.
- **Dynamic**: the risk depends on the call. Google Ads mutate calls are read when `validateOnly` is set, destructive when an operation removes, and write otherwise.

| Product | Login group | Read | Write | Destructive | Dynamic |
|---|---|---|---|---|---|
| `gcloud` | cloud | 186 | 136 | 51 | 1 |
| `gsc` | searchconsole | 16 | 10 | 5 | 0 |
| `gsearch` | apikey | 42 | 5 | 3 | 1 |
| `gdrive` | workspace-user | 88 | 74 | 22 | 1 |
| `gmail` | workspace-user | 43 | 35 | 18 | 1 |
| `gcalendar` | workspace-user | 16 | 23 | 7 | 0 |
| `gchat` | workspace-user | 28 | 25 | 8 | 0 |
| `gmeet` | workspace-user | 18 | 6 | 1 | 0 |
| `gcontacts` | workspace-user | 32 | 21 | 9 | 1 |
| `gtasks` | workspace-user | 8 | 9 | 5 | 0 |
| `gclassroom` | workspace-user | 44 | 43 | 18 | 0 |
| `gapps` | workspace-user | 12 | 5 | 2 | 0 |
| `gadmin` | workspace-admin | 153 | 152 | 60 | 1 |
| `ganalytics` | business | 35 | 24 | 10 | 1 |
| `gtm` | business | 41 | 53 | 15 | 1 |
| `gyoutube` | business | 56 | 49 | 20 | 0 |
| `gbusiness` | business | 29 | 19 | 4 | 0 |
| `gads` | business | 96 | 190 | 20 | 24 |
| `gmerchant` | business | 73 | 64 | 20 | 1 |
| `gplay` | developer | 150 | 160 | 42 | 1 |
| `gfirebase` | developer | 135 | 121 | 44 | 1 |
| `gmaps` | developer | 20 | 13 | 3 | 0 |
| `gai` | cloud | 153 | 143 | 57 | 1 |

Each total includes the three gateway tools of its product, when it has gateway APIs: `api_search` and `api_describe` are reads, and `api_call` is dynamic. The dynamic count in each row is `api_call` plus any dynamic tools of that product.

## Combinations that make sense

Each row is a set of products to install together. Log in once per group, with the products of that group listed.

| Use | Install | Why these together | Start with |
|---|---|---|---|
| Personal assistant | `gmail`, `gcalendar`, `gcontacts` | One login (`workspace-user`) covers all three. | `readonly`. Read mail and events, then try one draft or event. |
| Admin audit | `gadmin`, `gdrive` | Check users, groups and who can see which files. | `readonly` for both. Keep **Allow write tools** off. |
| SEO | `gsc`, `gsearch` | Search Console for your site. `gsearch` for public PageSpeed and CrUX data. | `gsc` readonly. `gsearch` needs only an API key. |
| Web app on Google Cloud and Firebase | `gcloud`, `gfirebase` | Infrastructure in `cloud`, Firebase in `developer`. | `gcloud` readonly. Then `gfirebase` readonly. |
| Shop | `gmerchant`, `gbusiness`, `gads` | Product feeds, business listings and paid ads in one group (`business`). | Readonly. Use a test account before any change. |
| Video channel | `gyoutube`, `ganalytics` | Uploads and reports in `business`. | Readonly. Check the YouTube quota before a large run. |
| Team meetings | `gmeet`, `gchat`, `gcalendar` | Meetings, messages and calendar in `workspace-user`. | Readonly. Then one message in a test space. |
| Mobile app | `gplay`, `gfirebase`, `gmaps` | Publishing, crash reports and maps in `developer`. | Readonly for `gplay`. Do not publish until you have tested reads. |

## Install and log in, step by step

1. Install the first product: see [INSTALL.md](INSTALL.md).
2. Set up its login group: see [SETUP.md](SETUP.md).
3. Run one read. Check the result. See [USING.md](USING.md).
4. Turn on **Allow write tools** only when you need a change. Then test one change on a test account.
5. Add the next product, and repeat.
