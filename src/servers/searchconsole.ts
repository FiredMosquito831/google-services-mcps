/**
 * Curated tool definitions for the Google Search Console server (MCP name "gsc").
 * The Discovery-generated tools are added by the generated entry (scripts/bundle.mjs).
 *
 * Covers: properties (list, get, add, remove), sitemaps (list, get, submit,
 * delete), search analytics queries, and URL inspection (index status of one page).
 * Not wrapped on purpose: Indexing API urlNotifications.publish, which Google limits to JobPosting and BroadcastEvent pages.
 *
 * Auth: OAuth user token from `gsm login searchconsole` (scope: webmasters).
 * That one scope covers every tool here, including the read-only analytics and
 * URL inspection calls.
 */
import { webmasters, type webmasters_v3 } from '@googleapis/webmasters';
import { searchconsole } from '@googleapis/searchconsole';
import type { JWT, OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { getAuthClient, googleScopes } from '../core/auth.js';
import { defineTool, type ToolDef } from '../core/tools.js';

type Auth = OAuth2Client | JWT;

/**
 * Cached once a login works. A failed attempt is not cached, so running
 * `gsm login searchconsole` takes effect without restarting the server.
 */
let authPromise: Promise<Auth> | undefined;
function authClient(cfg: RuntimeConfig): Promise<Auth> {
  authPromise ??= getAuthClient('searchconsole', cfg).catch((err: unknown) => {
    authPromise = undefined;
    throw err;
  });
  return authPromise;
}

// ---- input checks: values are validated, never rewritten ----

/** Required text, passed on exactly as given. Stray spaces are rejected, not trimmed. */
function exactText(value: string | undefined, field: string, example: string): string {
  if (value === undefined || value.trim() === '') throw new Error(`${field} is required, for example ${example}.`);
  if (value !== value.trim()) throw new Error(`${field} has leading or trailing spaces. Send it exactly as Search Console lists it.`);
  return value;
}

const PROPERTY_FORM = /^(https?:\/\/|sc-domain:|sc-set:|android-app:\/\/)/;

/** A property string as Search Console has it: URL-prefix, sc-domain: domain property, or another property type. */
function propertyUrl(value: string | undefined, field = 'site_url'): string {
  const v = exactText(value, field, 'https://example.com/ or sc-domain:example.com');
  if (!PROPERTY_FORM.test(v)) {
    throw new Error(
      `${field} "${v}" is not a Search Console property. Use a URL-prefix such as https://example.com/ or a domain property such as sc-domain:example.com.`,
    );
  }
  return v;
}

/** An absolute http or https URL, passed on as given. */
function httpUrl(value: string | undefined, field: string, example: string): string {
  const v = exactText(value, field, example);
  let protocol = '';
  try {
    protocol = new URL(v).protocol;
  } catch {
    // Reported below.
  }
  if (protocol !== 'https:' && protocol !== 'http:') {
    throw new Error(`${field} "${v}" must be an absolute http or https URL, for example ${example}.`);
  }
  return v;
}

/** The page must belong to the property: under its URL prefix, or on its domain or a subdomain for sc-domain: properties. */
function inspectionPage(value: string | undefined, property: string): string {
  const page = httpUrl(value, 'inspection_url', 'https://example.com/blog/post');
  let inside: boolean;
  if (property.startsWith('sc-domain:')) {
    const domain = property.slice('sc-domain:'.length).toLowerCase();
    const host = new URL(page).hostname.toLowerCase();
    inside = host === domain || host.endsWith(`.${domain}`);
  } else {
    inside = page.startsWith(property);
  }
  if (!inside) {
    throw new Error(`inspection_url "${page}" is not part of property ${property}. Inspect a page that this property covers.`);
  }
  return page;
}

/** A real calendar date in YYYY-MM-DD form. Rejects things like 2026-02-30. */
function isoDate(value: string, field: string): string {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : undefined;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${field} must be a real date in YYYY-MM-DD form, got "${value}".`);
  }
  return value;
}

const EX_SITEMAP = 'https://example.com/sitemap.xml';
const siteUrlArg = z
  .string()
  .describe('Property exactly as Search Console lists it: a URL-prefix such as https://example.com/ or a domain property such as sc-domain:example.com.');
const feedpathArg = z.string().describe(`Sitemap URL, for example ${EX_SITEMAP}`);
const DIMENSIONS = ['date', 'query', 'page', 'country', 'device', 'searchAppearance'] as const;
const SEARCH_TYPES = ['web', 'image', 'video', 'news', 'discover', 'googleNews'] as const;

export async function buildTools(cfg: RuntimeConfig): Promise<ToolDef[]> {
  const wm = async () => webmasters({ version: 'v3', auth: await authClient(cfg) });
  const sc = async () => searchconsole({ version: 'v1', auth: await authClient(cfg) });

  return [
    // ---- read ----
    defineTool({
      name: 'sc_sites_list',
      title: 'List Search Console properties',
      description: 'List the Search Console properties this account can access, with the permission level on each.',
      kind: 'read',
      scopes: googleScopes('webmasters', 'webmasters.readonly'),
      inputSchema: {},
      async handler() {
        const res = await (await wm()).sites.list();
        return res.data.siteEntry ?? [];
      },
    }),
    defineTool({
      name: 'sc_site_get',
      title: 'Get Search Console property',
      description: 'Get one property with its permission level.',
      kind: 'read',
      scopes: googleScopes('webmasters', 'webmasters.readonly'),
      inputSchema: { site_url: siteUrlArg },
      async handler({ site_url }) {
        const res = await (await wm()).sites.get({ siteUrl: propertyUrl(site_url) });
        return res.data;
      },
    }),
    defineTool({
      name: 'sc_sitemaps_list',
      title: 'List sitemaps',
      description: 'List the sitemaps submitted for a property, or the sitemaps listed in a sitemap index.',
      kind: 'read',
      scopes: googleScopes('webmasters', 'webmasters.readonly'),
      inputSchema: {
        site_url: siteUrlArg,
        sitemap_index: z
          .string()
          .optional()
          .describe('Sitemap index URL, for example https://example.com/sitemapindex.xml. Omit to list all submitted sitemaps.'),
      },
      async handler({ site_url, sitemap_index }) {
        const res = await (await wm()).sitemaps.list({
          siteUrl: propertyUrl(site_url),
          sitemapIndex:
            sitemap_index === undefined ? undefined : httpUrl(sitemap_index, 'sitemap_index', 'https://example.com/sitemapindex.xml'),
        });
        return res.data.sitemap ?? [];
      },
    }),
    defineTool({
      name: 'sc_sitemap_get',
      title: 'Get sitemap',
      description: 'Get one submitted sitemap with its status, error and warning counts, and indexed URL counts.',
      kind: 'read',
      scopes: googleScopes('webmasters', 'webmasters.readonly'),
      inputSchema: { site_url: siteUrlArg, feedpath: feedpathArg },
      async handler({ site_url, feedpath }) {
        const res = await (await wm()).sitemaps.get({
          siteUrl: propertyUrl(site_url),
          feedpath: httpUrl(feedpath, 'feedpath', EX_SITEMAP),
        });
        return res.data;
      },
    }),
    defineTool({
      name: 'sc_search_analytics_query',
      title: 'Query search analytics',
      description:
        'Query search performance (clicks, impressions, CTR, position) for a property, grouped by the chosen dimensions. Dates are Pacific time per Google. The response rows are in the order of the dimensions.',
      kind: 'read',
      scopes: googleScopes('webmasters', 'webmasters.readonly'),
      inputSchema: {
        site_url: siteUrlArg,
        start_date: z.string().describe('Start date, YYYY-MM-DD, inclusive.'),
        end_date: z.string().describe('End date, YYYY-MM-DD, inclusive. Must not be before start_date.'),
        dimensions: z
          .array(z.enum(DIMENSIONS))
          .optional()
          .describe('Group-by dimensions, in order. Omit or [] for one total row.'),
        type: z.enum(SEARCH_TYPES).optional().describe('Search type. Default web.'),
        row_limit: z.number().int().min(1).max(25000).optional().describe('Rows to return, 1 to 25000. Default 1000.'),
        start_row: z.number().int().min(0).optional().describe('Zero-based index of the first row, for paging. Default 0.'),
        dimension_filter_groups: z
          .array(z.record(z.unknown()))
          .optional()
          .describe(
            'Optional filters, passed to Google as is. Example: [{"filters":[{"dimension":"query","operator":"contains","expression":"buy"}]}]',
          ),
      },
      async handler({ site_url, start_date, end_date, dimensions, type, row_limit, start_row, dimension_filter_groups }) {
        const startDate = isoDate(start_date, 'start_date');
        const endDate = isoDate(end_date, 'end_date');
        if (endDate < startDate) throw new Error(`end_date (${endDate}) is before start_date (${startDate}).`);

        const res = await (await wm()).searchanalytics.query({
          siteUrl: propertyUrl(site_url),
          requestBody: {
            startDate,
            endDate,
            dimensions: dimensions ?? [],
            searchType: type ?? 'web',
            rowLimit: row_limit ?? 1000,
            startRow: start_row ?? 0,
            dimensionFilterGroups: dimension_filter_groups as webmasters_v3.Schema$ApiDimensionFilterGroup[] | undefined,
          },
        });
        return { rows: [], ...res.data };
      },
    }),
    defineTool({
      name: 'sc_url_inspect',
      title: 'Inspect URL',
      description:
        'Inspect one page as Google sees it in its index: index status, coverage state, last crawl, robots and canonical details. The page must belong to the property.',
      kind: 'read',
      scopes: googleScopes('webmasters', 'webmasters.readonly'),
      inputSchema: {
        site_url: siteUrlArg,
        inspection_url: z.string().describe('Full URL of the page to inspect, for example https://example.com/blog/post'),
        language_code: z.string().optional().describe('Language for issue messages, BCP-47. Default en-US.'),
      },
      async handler({ site_url, inspection_url, language_code }) {
        const property = propertyUrl(site_url);
        const res = await (await sc()).urlInspection.index.inspect({
          requestBody: {
            siteUrl: property,
            inspectionUrl: inspectionPage(inspection_url, property),
            languageCode: language_code ?? 'en-US',
          },
        });
        return res.data;
      },
    }),

    // ---- write (registered only when GSM_ALLOW_WRITES=true) ----
    defineTool({
      name: 'sc_site_add',
      title: 'Add Search Console property',
      description: 'Add a property to this account. Adding does not verify ownership; verification still applies.',
      kind: 'write',
      scopes: googleScopes('webmasters'),
      inputSchema: { site_url: siteUrlArg },
      async handler({ site_url }) {
        const property = propertyUrl(site_url);
        await (await wm()).sites.add({ siteUrl: property });
        return { status: 'added', siteUrl: property };
      },
    }),
    defineTool({
      name: 'sc_sitemap_submit',
      title: 'Submit sitemap',
      description: 'Submit or resubmit a sitemap for a property.',
      kind: 'write',
      scopes: googleScopes('webmasters'),
      inputSchema: { site_url: siteUrlArg, feedpath: feedpathArg },
      async handler({ site_url, feedpath }) {
        const target = { siteUrl: propertyUrl(site_url), feedpath: httpUrl(feedpath, 'feedpath', EX_SITEMAP) };
        await (await wm()).sitemaps.submit(target);
        return { status: 'submitted', ...target };
      },
    }),

    // ---- destructive (asks for approval before each call) ----
    defineTool({
      name: 'sc_site_delete',
      title: 'Remove Search Console property',
      description:
        'Remove a property from this account. Its Search Console data and history can no longer be accessed through this account.',
      kind: 'destructive',
      scopes: googleScopes('webmasters'),
      inputSchema: { site_url: siteUrlArg },
      preview: ({ site_url }) => ({
        property: propertyUrl(site_url),
        effect:
          'Property is removed from this account. Its performance, indexing and sitemap history are no longer accessible through this account. The website itself is not changed.',
      }),
      async handler({ site_url }) {
        const property = propertyUrl(site_url);
        await (await wm()).sites.delete({ siteUrl: property });
        return { status: 'removed', siteUrl: property };
      },
    }),
    defineTool({
      name: 'sc_sitemap_delete',
      title: 'Delete sitemap',
      description: 'Remove a sitemap from Search Console. The sitemap file on the site is not touched.',
      kind: 'destructive',
      scopes: googleScopes('webmasters'),
      inputSchema: { site_url: siteUrlArg, feedpath: feedpathArg },
      preview: ({ site_url, feedpath }) => ({
        property: propertyUrl(site_url),
        feedpath: httpUrl(feedpath, 'feedpath', EX_SITEMAP),
        effect:
          'Sitemap is removed from Search Console, not from the site. The sitemap file stays on the server, and the pages it lists are not de-indexed by this call.',
      }),
      async handler({ site_url, feedpath }) {
        const target = { siteUrl: propertyUrl(site_url), feedpath: httpUrl(feedpath, 'feedpath', EX_SITEMAP) };
        await (await wm()).sitemaps.delete(target);
        return { status: 'deleted', ...target };
      },
    }),
  ];
}
