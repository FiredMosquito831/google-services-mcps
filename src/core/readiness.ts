/**
 * Project readiness: which Google APIs each login group needs on the project, and what the project is missing.
 * The lists are checked by tests against config/products.json (the product map), so they cannot drift silently.
 * Only the APIs a group's products call directly are listed. The gateway reaches more, and enables them on demand.
 */

/** The most services one batch-enable request takes (the serviceusage limit). */
export const BATCH_ENABLE_LIMIT = 20;

export interface ReadinessGroup {
  /** The login group, as in config/products.json. */
  group: string;
  /** A short description for people. */
  label: string;
  /** The products of the group, as in config/products.json. */
  products: string[];
  /** The Google service IDs the group's products need on the project. */
  services: string[];
}

export const READINESS_GROUPS: ReadinessGroup[] = [
  {
    group: 'workspace-user',
    label: 'Gmail, Drive, Calendar, Chat, Meet, Contacts, Tasks, Classroom, Apps Script',
    products: ['gmail', 'gdrive', 'gcalendar', 'gchat', 'gmeet', 'gcontacts', 'gtasks', 'gclassroom', 'gapps'],
    services: [
      'gmail.googleapis.com',
      'gmailpostmastertools.googleapis.com',
      'drive.googleapis.com',
      'driveactivity.googleapis.com',
      'drivelabels.googleapis.com',
      'docs.googleapis.com',
      'sheets.googleapis.com',
      'slides.googleapis.com',
      'forms.googleapis.com',
      'books.googleapis.com',
      'calendar-json.googleapis.com',
      'chat.googleapis.com',
      'workspaceevents.googleapis.com',
      'meet.googleapis.com',
      'people.googleapis.com',
      'tasks.googleapis.com',
      'keep.googleapis.com',
      'classroom.googleapis.com',
      'script.googleapis.com',
    ],
  },
  {
    group: 'searchconsole',
    label: 'Google Search Console',
    products: ['gsc'],
    services: ['searchconsole.googleapis.com', 'siteverification.googleapis.com', 'indexing.googleapis.com'],
  },
  {
    group: 'business',
    label: 'Analytics, Tag Manager, YouTube, Business Profile, Google Ads',
    products: ['ganalytics', 'gtm', 'gyoutube', 'gbusiness', 'gads'],
    services: [
      'analyticsadmin.googleapis.com',
      'analyticsdata.googleapis.com',
      'tagmanager.googleapis.com',
      'youtube.googleapis.com',
      'youtubeanalytics.googleapis.com',
      'youtubereporting.googleapis.com',
      'blogger.googleapis.com',
      'mybusinessaccountmanagement.googleapis.com',
      'mybusinessbusinessinformation.googleapis.com',
      'mybusinessverifications.googleapis.com',
      'mybusinessnotifications.googleapis.com',
      'mybusinessplaceactions.googleapis.com',
      'mybusinesslodging.googleapis.com',
      'businessprofileperformance.googleapis.com',
      'googleads.googleapis.com',
      'searchads360.googleapis.com',
      'displayvideo.googleapis.com',
      'admob.googleapis.com',
      'doubleclickbidmanager.googleapis.com',
    ],
  },
  {
    group: 'developer',
    label: 'Firebase',
    products: ['gfirebase'],
    services: ['firebase.googleapis.com'],
  },
  {
    group: 'cloud',
    label: 'Google Cloud (gcloud, gai)',
    products: ['gcloud', 'gai'],
    services: [
      'serviceusage.googleapis.com',
      'cloudresourcemanager.googleapis.com',
      'apikeys.googleapis.com',
      'cloudbilling.googleapis.com',
      'monitoring.googleapis.com',
      'bigquery.googleapis.com',
      'iam.googleapis.com',
      'cloudtrace.googleapis.com',
    ],
  },
  {
    group: 'apikey',
    label: 'Maps and public search (API key, no login)',
    products: ['gsearch', 'gmaps'],
    services: [
      'places.googleapis.com',
      'pagespeedonline.googleapis.com',
      'chromeuxreport.googleapis.com',
      'kgsearch.googleapis.com',
      'safebrowsing.googleapis.com',
      'webrisk.googleapis.com',
    ],
  },
  {
    group: 'service-account',
    label: 'Google Play and Merchant Center (service account)',
    products: ['gplay', 'gmerchant'],
    services: ['androidpublisher.googleapis.com', 'merchantapi.googleapis.com'],
  },
  {
    group: 'workspace-admin',
    label: 'Google Workspace admin (service account, domain-wide delegation)',
    products: ['gadmin'],
    services: ['admin.googleapis.com'],
  },
];

/** The group keys, for the tools' inputs. */
export const READINESS_GROUP_KEYS = READINESS_GROUPS.map((g) => g.group);

/** The service ID at the end of a serviceusage resource name, for example projects/1/services/gmail.googleapis.com. */
export function serviceIdFromName(name: string | null | undefined): string | undefined {
  const at = (name ?? '').indexOf('/services/');
  if (at < 0) return undefined;
  const id = name!.slice(at + '/services/'.length).trim();
  return id === '' ? undefined : id;
}

/** The services of a group that are not enabled. Order follows the group's list. */
export function missingServices(group: ReadinessGroup, enabled: ReadonlySet<string>): string[] {
  return group.services.filter((service) => !enabled.has(service));
}

/** Splits a list into batches of at most `size`. Each service appears in exactly one batch. */
export function chunkServices(services: readonly string[], size: number = BATCH_ENABLE_LIMIT): string[][] {
  if (size < 1) throw new Error('the batch size must be at least 1');
  const out: string[][] = [];
  for (let i = 0; i < services.length; i += size) out.push(services.slice(i, i + size));
  return out;
}

/** The groups named in a request, in the order of READINESS_GROUPS. An unknown name is returned in `unknown`. */
export function selectReadinessGroups(requested: readonly string[] | undefined): { groups: ReadinessGroup[]; unknown: string[] } {
  if (requested === undefined || requested.length === 0) return { groups: [...READINESS_GROUPS], unknown: [] };
  const wanted = new Set(requested);
  const unknown = requested.filter((g) => !READINESS_GROUP_KEYS.includes(g));
  return { groups: READINESS_GROUPS.filter((g) => wanted.has(g.group)), unknown: [...new Set(unknown)] };
}

/** The services a set of groups needs that are missing, once each, in first-seen order. */
export function missingForGroups(groups: readonly ReadinessGroup[], enabled: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const group of groups) for (const service of missingServices(group, enabled)) if (!out.includes(service)) out.push(service);
  return out;
}

/** The steps only the Google Cloud console and the partner consoles can do. None of these has an API we can call. */
export function consoleSteps(projectId: string): string[] {
  const p = encodeURIComponent(projectId);
  return [
    `Consent screen and publishing (the 7-day token limit): https://console.cloud.google.com/auth/audience?project=${p}`,
    `Desktop OAuth client for the MCPs (Credentials > Create credentials > OAuth client ID > Desktop app): https://console.cloud.google.com/apis/credentials?project=${p}`,
    'Test users, while the app is in Testing: the Audience page, under Test users.',
    'Business Profile: request Basic API Access (the quota stays 0 until Google grants it): https://developers.google.com/my-business/content/prereqs#request-access',
    'Search Console: the account must be an owner or user of each property (Settings > Users and permissions): https://search.google.com/search-console',
    'Analytics: Viewer or Analyst on the GA4 property (Admin > Property access management): https://analytics.google.com',
    'Play Console: add the service account email under Users and permissions: https://play.google.com/console',
    'Merchant Center: add the service account email as an Admin user: https://merchants.google.com',
    'Workspace admin: authorise the admin server scopes under Security > API controls > Domain-wide delegation: https://admin.google.com/ac/owl/domainwidedelegation',
  ];
}
