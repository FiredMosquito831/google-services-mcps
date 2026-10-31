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
import { fitItems } from '../core/result-shape.js';

type Auth = OAuth2Client | JWT;

/**
 * Cached once a login works. A failed attempt is not cached, so running
 * `gsm login searchconsole` takes effect without restarting the server.
 */
function authClient(cfg: RuntimeConfig): Promise<Auth> {
  return getAuthClient('searchconsole', cfg);
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
    // Under the URL prefix, with the host compared without case (hosts are not case-sensitive), so
    // https://Example.com/x is part of https://example.com/ (1.41.0). The page is still sent as given.
    const p = new URL(page);
    let prefix: URL | undefined;
    try {
      prefix = new URL(property);
    } catch {
      prefix = undefined;
    }
    inside = prefix
      ? p.protocol === prefix.protocol && p.host === prefix.host && `${p.pathname}${p.search}`.startsWith(`${prefix.pathname}${prefix.search}`)
      : page.startsWith(property);
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
/** Group-by dimensions. hour (1.41.0) goes with data_state hourly_all (Google's searchAnalytics.query reference). */
const DIMENSIONS = ['date', 'hour', 'query', 'page', 'country', 'device', 'searchAppearance'] as const;
const SEARCH_TYPES = ['web', 'image', 'video', 'news', 'discover', 'googleNews'] as const;
/**
 * Typed filters (1.41.0), as Google's reference names them
 * (https://developers.google.com/webmaster-tools/v1/searchanalytics/query): the dimensions a filter tests, and the
 * operators (equals is Google's default). Values are sent as written; Google compares them without case where it says so.
 */
const FILTER_DIMENSIONS = ['query', 'page', 'country', 'device', 'searchAppearance'] as const;
const FILTER_OPERATORS = ['equals', 'notEquals', 'contains', 'notContains', 'includingRegex', 'excludingRegex'] as const;
const DATA_STATES = ['final', 'all', 'hourly_all'] as const;
const AGGREGATION_TYPES = ['auto', 'byPage', 'byProperty', 'byNewsShowcasePanel'] as const;

type TypedFilter = { dimension: (typeof FILTER_DIMENSIONS)[number]; operator?: (typeof FILTER_OPERATORS)[number]; expression: string };

/**
 * The dimensionFilterGroups of a query: the groups given as before (passed on as given), then the typed filters as one
 * group whose filters must all match (Google: "All filter groups must match", and "and" is the one group type it
 * supports). Undefined when neither is given, as before.
 */
export function filterGroups(groups: Array<Record<string, unknown>> | undefined, filters: TypedFilter[] | undefined): Array<Record<string, unknown>> | undefined {
  if (!filters?.length) return groups;
  const typed = {
    groupType: 'and',
    filters: filters.map((f) => ({ dimension: f.dimension, ...(f.operator !== undefined ? { operator: f.operator } : {}), expression: f.expression })),
  };
  return [...(groups ?? []), typed];
}

/**
 * Rows of sc_search_analytics_query when no row_limit is given (before 1.29.0: 1000, Google's own default). A row with
 * the query and page dimensions is about 170 characters of compact JSON, so 100 rows fit the 25,000-character result
 * limit, and a page is fetched once: Google's usage guide asks clients not to query the same data again.
 */
export const SC_ROWS_DEFAULT = 100;

/**
 * The answer of sc_search_analytics_query: row_count (the rows Google returned) and next_start_row first, then Google's
 * answer. Rows that do not fit the result limit are left out at the end, and next_start_row counts only the rows shown.
 * Without a cut, next_start_row is given when the page was full (Google may have more rows).
 */
export function analyticsAnswer(data: { rows?: unknown[] | null; responseAggregationType?: string | null }, start: number, limit: number, budget: number) {
  const rows = data.rows ?? [];
  const { rows: _rows, ...rest } = data;
  const answer = {
    row_count: rows.length,
    ...(rows.length >= limit ? { next_start_row: start + rows.length } : {}),
    rows,
    ...rest,
  };
  return fitItems(answer, 'rows', budget, (shown) => ({
    fields: { next_start_row: start + shown },
    how_to_continue: `Google returned ${rows.length} rows; the first ${shown} fit the result limit (${budget} characters). Call again with start_row=${start + shown} and the same other arguments for the next rows.`,
  }));
}

/**
 * Google's answer when the account cannot use a property, or the string is not the property's exact form ("User does not
 * have sufficient permission for site ..."): the error then also says how to find the exact string (1.41.0). Any other
 * error is returned as it is.
 */
export const PROPERTY_HINT =
  'Check the exact property string with sc_sites_list: a URL-prefix property ends with a slash (https://example.com/), a domain property is sc-domain:example.com, and the account needs access to it.';

export function withPropertyHint(err: unknown): unknown {
  const e = err as { code?: unknown; status?: unknown; message?: unknown } | null;
  if (!e || typeof e.message !== 'string' || e.message.includes('sc_sites_list')) return err;
  if (String(e.code ?? e.status) === '403' && /sufficient permission for site/i.test(e.message)) {
    try {
      (e as { message: string }).message = `${e.message} ${PROPERTY_HINT}`;
    } catch {
      // A read-only message stays as it is.
    }
  }
  return err;
}

export async function buildTools(cfg: RuntimeConfig): Promise<ToolDef[]> {
  const wm = async () => webmasters({ version: 'v3', auth: await authClient(cfg) });
  const sc = async () => searchconsole({ version: 'v1', auth: await authClient(cfg) });

  const tools: ToolDef[] = [
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
      description:
        'Get one submitted sitemap with its status, error and warning counts, and the number of URLs submitted per content type. Its indexed count is deprecated by Google ("Deprecated; do not use.") and is not a measure of indexing; for whether a page is indexed, use sc_url_inspect.',
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
        `Query search performance (clicks, impressions, CTR, position) for a property, grouped by the chosen dimensions. Dates are Pacific time per Google. By default only final data is returned, so the most recent days are missing; data_state all adds the fresh data still being processed (metadata.first_incomplete_date says where it starts), and hourly_all with the hour dimension gives hours. filters narrows the rows (all must match). The response rows are in the order of the dimensions. row_count is the number of rows Google returned; next_start_row, when there may be more, is the start_row of the next page. Rows that do not fit the result limit are left out at the end, and next_start_row then starts at the first row not shown.`,
      kind: 'read',
      scopes: googleScopes('webmasters', 'webmasters.readonly'),
      inputSchema: {
        site_url: siteUrlArg,
        start_date: z.string().describe('Start date, YYYY-MM-DD, inclusive.'),
        end_date: z.string().describe('End date, YYYY-MM-DD, inclusive. Must not be before start_date.'),
        dimensions: z
          .array(z.enum(DIMENSIONS))
          .optional()
          .describe('Group-by dimensions, in order. Omit or [] for one total row. hour goes with data_state hourly_all.'),
        type: z.enum(SEARCH_TYPES).optional().describe('Search type. Default web.'),
        row_limit: z
          .number()
          .int()
          .min(1)
          .max(25000)
          .optional()
          .describe(`Rows to return, 1 to 25000. Default ${SC_ROWS_DEFAULT}, about what fits the result limit (Google's own default is 1000); a larger page is shown as far as it fits, and next_start_row continues.`),
        start_row: z.number().int().min(0).optional().describe('Zero-based index of the first row, for paging. Default 0.'),
        dimension_filter_groups: z
          .array(z.record(z.unknown()))
          .optional()
          .describe(
            'Optional filters, passed to Google as is. Example: [{"filters":[{"dimension":"query","operator":"contains","expression":"buy"}]}]. The typed filters argument is simpler.',
          ),
        filters: z
          .array(
            z.object({
              dimension: z.enum(FILTER_DIMENSIONS).describe('The dimension to test; it need not be one of dimensions.'),
              operator: z
                .enum(FILTER_OPERATORS)
                .optional()
                .describe("equals (Google's default; case-sensitive for page and query), notEquals, contains and notContains (not case-sensitive), includingRegex and excludingRegex (RE2)."),
              expression: z.string().min(1).max(4096).describe('The value to compare with, for example "buy", "FRA" (a 3-letter country code) or "MOBILE".'),
            }),
          )
          .optional()
          .describe(
            'Filters a row must all pass (AND, the one way Google combines them), for example [{"dimension":"query","operator":"contains","expression":"buy"},{"dimension":"country","expression":"FRA"}]. With dimension_filter_groups, every group must pass too.',
          ),
        data_state: z
          .enum(DATA_STATES)
          .optional()
          .describe(
            "final (Google's default): finalized data only, so the latest days are missing. all: also fresh data still being processed (metadata.first_incomplete_date says where it starts). hourly_all: fresh data with an hourly breakdown, for the hour dimension (metadata.first_incomplete_hour).",
          ),
        aggregation_type: z
          .enum(AGGREGATION_TYPES)
          .optional()
          .describe(
            "How rows are aggregated: auto (Google's default), byProperty or byPage (by canonical URL). With a page dimension or page filter only auto or byPage; byProperty not with type discover or googleNews; byNewsShowcasePanel needs the NEWS_SHOWCASE search appearance filter and type discover or googleNews.",
          ),
      },
      async handler({ site_url, start_date, end_date, dimensions, type, row_limit, start_row, dimension_filter_groups, filters, data_state, aggregation_type }) {
        const startDate = isoDate(start_date, 'start_date');
        const endDate = isoDate(end_date, 'end_date');
        if (endDate < startDate) throw new Error(`end_date (${endDate}) is before start_date (${startDate}).`);

        const limit = row_limit ?? SC_ROWS_DEFAULT;
        const start = start_row ?? 0;
        // Google's reference marks searchType "Deprecated, use type instead"
        // (https://developers.google.com/webmaster-tools/v1/searchanalytics/query), so the search type goes in type. The
        // @googleapis/webmasters types predate the field; the client sends the body as JSON, so the field reaches Google.
        // dataState and aggregationType go only when given (1.41.0), after the fields of before, so an earlier call sends
        // the same body. Google's reference names their values as here ("final", "all", "hourly_all"; "auto", "byPage" ...).
        const requestBody: webmasters_v3.Schema$SearchAnalyticsQueryRequest & { type?: string } = {
          startDate,
          endDate,
          dimensions: dimensions ?? [],
          type: type ?? 'web',
          rowLimit: limit,
          startRow: start,
          dimensionFilterGroups: filterGroups(dimension_filter_groups, filters) as webmasters_v3.Schema$ApiDimensionFilterGroup[] | undefined,
          ...(data_state !== undefined ? { dataState: data_state } : {}),
          ...(aggregation_type !== undefined ? { aggregationType: aggregation_type } : {}),
        };
        const res = await (await wm()).searchanalytics.query({ siteUrl: propertyUrl(site_url), requestBody });
        return analyticsAnswer(res.data, start, limit, cfg.maxResultChars);
      },
    }),
    defineTool({
      name: 'sc_url_inspect',
      title: 'Inspect URL',
      description:
        "Inspect one page as Google sees it in its index: index status, coverage state, last crawl, robots and canonical details. The page must belong to the property. Google reads only the indexed version (\"you cannot test the indexability of a live URL\"). Google's quota: 2,000 inspections a day and 600 a minute per property.",
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
      // One PUT (sites.add), idempotent as the generated tools' PUT methods are.
      idempotent: true,
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
      // One PUT (sitemaps.submit), idempotent as the generated tools' PUT methods are.
      idempotent: true,
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
      // One DELETE (sites.delete), idempotent as the generated tools' DELETE methods are.
      idempotent: true,
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
      // One DELETE (sitemaps.delete), idempotent as the generated tools' DELETE methods are.
      idempotent: true,
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
  // Every handler's error about a property this account cannot use says how to find the exact property string.
  return tools.map((tool) => ({
    ...tool,
    async handler(args, ctx, prepared) {
      try {
        return await tool.handler(args, ctx, prepared);
      } catch (err) {
        throw withPropertyHint(err);
      }
    },
  }));
}
