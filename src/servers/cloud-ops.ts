/**
 * Curated gcloud tools for Cloud Logging, Cloud Monitoring (PromQL and dashboards), IAM roles and Cloud Billing prices.
 * Each one matches a tool of Google's hosted Cloud MCP servers and names it in its description. All of them are reads:
 * logging_entries_list (entries.list, a POST list), monitoring_query_promql (the Prometheus query endpoints, which only
 * evaluate a query), the dashboard and role reads (GET) and billing_price_lookup (GET).
 *
 * These APIs have no client library in this package, so the calls go through the auth client (cloud-http.ts).
 * buildTools in cloud.ts adds these tools after its own.
 */
import { z } from 'zod';
import { googleScopes } from '../core/auth.js';
import { defineTool, type ToolDef } from '../core/tools.js';
import type { CloudCall } from './cloud-http.js';

const LOGGING = 'https://logging.googleapis.com/v2';
const MONITORING = 'https://monitoring.googleapis.com/v1';
const IAM = 'https://iam.googleapis.com/v1';
const BILLING_V1 = 'https://cloudbilling.googleapis.com/v1';
const BILLING_V1BETA = 'https://cloudbilling.googleapis.com/v1beta';

// The scopes Discovery lists for each method, narrowest first. Any one of them grants the tool.
const LOGGING_READ_SCOPES = googleScopes('logging.read', 'cloud-platform.read-only', 'logging.admin', 'cloud-platform');
const MONITORING_READ_SCOPES = googleScopes('monitoring.read', 'monitoring', 'cloud-platform');
// IAM v1 lists only cloud-platform for the role reads, so a readonly login cannot run them.
const IAM_ROLE_SCOPES = googleScopes('cloud-platform');
const BILLING_READ_SCOPES = googleScopes('cloud-billing.readonly', 'cloud-billing', 'cloud-platform');

const projectId = z.string().min(6).max(30).describe('Project ID, for example my-project-123 (not the project number).');
const pageToken = z.string().min(1).optional().describe('next_page_token from the previous answer, for the next page.');

// ---------- Logging ----------

/** Logging severities in order (LogSeverity). */
export const SEVERITIES = ['DEFAULT', 'DEBUG', 'INFO', 'NOTICE', 'WARNING', 'ERROR', 'CRITICAL', 'ALERT', 'EMERGENCY'] as const;

/**
 * The window logging_entries_list uses when neither the filter nor the arguments limit the time: the last day, the
 * default of `gcloud logging read --freshness`. Without any time limit, entries.list searches the whole retention period.
 */
export const DEFAULT_FRESHNESS = '1d';

/** A duration such as 90s, 30m, 6h, 2d or 1w, in milliseconds. Undefined when it is not one. */
export function parseDuration(text: string): number | undefined {
  const m = /^(\d+)\s*(s|m|h|d|w)$/.exec(text.trim());
  if (!m) return undefined;
  const unit = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[m[2] as 's' | 'm' | 'h' | 'd' | 'w'];
  return Number(m[1]) * unit;
}

/** True when a Logging query restricts the timestamp field itself. */
export function filterHasTime(filter: string | undefined): boolean {
  return filter !== undefined && /(^|[^.\w])timestamp\s*(>=|<=|>|<|=)/.test(filter);
}

export interface LogFilterInput {
  filter?: string;
  severity?: (typeof SEVERITIES)[number];
  resource_type?: string;
  start_time?: string;
  end_time?: string;
  freshness?: string;
}

/**
 * The Logging query sent to entries.list: the caller's filter in brackets, then one clause per argument, joined with
 * AND. When nothing limits the time, the window starts DEFAULT_FRESHNESS before `now`; `windowDefaulted` says so.
 */
export function buildLogFilter(input: LogFilterInput, now: Date): { filter: string; windowDefaulted: boolean } {
  const parts: string[] = [];
  if (input.filter?.trim()) parts.push(`(${input.filter.trim()})`);
  if (input.severity) parts.push(`severity>=${input.severity}`);
  if (input.resource_type) parts.push(`resource.type="${input.resource_type.replace(/["\\]/g, '\\$&')}"`);
  let start = input.start_time;
  let windowDefaulted = false;
  if (start === undefined && input.freshness !== undefined) {
    const ms = parseDuration(input.freshness);
    if (ms === undefined) throw new Error(`freshness "${input.freshness}" is not a duration such as 30m, 6h, 1d or 1w.`);
    start = new Date(now.getTime() - ms).toISOString();
  }
  if (start === undefined && input.end_time === undefined && !filterHasTime(input.filter)) {
    start = new Date(now.getTime() - (parseDuration(DEFAULT_FRESHNESS) as number)).toISOString();
    windowDefaulted = true;
  }
  for (const [name, value] of [['start_time', start], ['end_time', input.end_time]] as const) {
    if (value !== undefined && Number.isNaN(Date.parse(value))) throw new Error(`${name} "${value}" is not an RFC 3339 time, for example 2026-10-30T08:00:00Z.`);
  }
  if (start !== undefined) parts.push(`timestamp>="${start}"`);
  if (input.end_time !== undefined) parts.push(`timestamp<"${input.end_time}"`);
  return { filter: parts.join(' AND '), windowDefaulted };
}

interface LogEntry {
  timestamp?: string;
  receiveTimestamp?: string;
  severity?: string;
  logName?: string;
  insertId?: string;
  resource?: { type?: string; labels?: Record<string, string> };
  labels?: Record<string, string>;
  textPayload?: string;
  jsonPayload?: Record<string, unknown>;
  protoPayload?: Record<string, unknown>;
  httpRequest?: { requestMethod?: string; requestUrl?: string; status?: number; latency?: string };
  trace?: string;
  spanId?: string;
}

/** The text of a log entry: textPayload, the message of a JSON payload (or the payload), or an audit log's summary. */
export function entryMessage(e: LogEntry): string | undefined {
  if (typeof e.textPayload === 'string') return e.textPayload;
  if (e.jsonPayload) {
    for (const key of ['message', 'msg', 'textPayload']) {
      const v = e.jsonPayload[key];
      if (typeof v === 'string') return v;
    }
    return JSON.stringify(e.jsonPayload);
  }
  if (e.protoPayload) {
    const p = e.protoPayload as {
      methodName?: string;
      resourceName?: string;
      authenticationInfo?: { principalEmail?: string };
      status?: { code?: number; message?: string };
    };
    const text = [p.methodName, p.resourceName, p.authenticationInfo?.principalEmail ? `by ${p.authenticationInfo.principalEmail}` : undefined]
      .filter(Boolean)
      .join(' ');
    const status = p.status?.code ? ` (status ${p.status.code}${p.status.message ? `: ${p.status.message}` : ''})` : '';
    return text ? `${text}${status}` : undefined;
  }
  return undefined;
}

/** One log entry as a short row: time, severity, log, resource, message, HTTP request and trace. */
export function compactEntry(e: LogEntry): Record<string, unknown> {
  const logId = e.logName ? decodeURIComponent(e.logName.replace(/^.*\/logs\//, '')) : undefined;
  const http = e.httpRequest
    ? [e.httpRequest.requestMethod, e.httpRequest.status, e.httpRequest.requestUrl, e.httpRequest.latency].filter((v) => v !== undefined && v !== '').join(' ')
    : undefined;
  return {
    timestamp: e.timestamp,
    severity: e.severity ?? 'DEFAULT',
    log: logId,
    resource: e.resource?.type,
    ...(e.resource?.labels && Object.keys(e.resource.labels).length > 0 ? { resource_labels: e.resource.labels } : {}),
    message: entryMessage(e),
    ...(http ? { http } : {}),
    ...(e.trace ? { trace: e.trace } : {}),
    insert_id: e.insertId,
  };
}

// ---------- Monitoring (PromQL) ----------

/** The Prometheus answer of the query endpoints: raw JSON, or an HttpBody with base64 data. */
export function promAnswer(raw: unknown): { status?: string; data?: { resultType?: string; result?: unknown[] }; error?: string; errorType?: string; warnings?: string[] } {
  let value = raw;
  if (typeof value === 'string') value = JSON.parse(value);
  const body = value as { contentType?: string; data?: unknown };
  if (body && typeof body.data === 'string' && typeof body.contentType === 'string') {
    value = JSON.parse(Buffer.from(body.data, 'base64').toString('utf8'));
  }
  return (value ?? {}) as ReturnType<typeof promAnswer>;
}

// ---------- Billing ----------

/** A google.type.Money as a decimal string, for example { units: "0", nanos: 31611000 } is "0.031611". */
export function moneyText(m: { units?: string | number; nanos?: number } | undefined): string | undefined {
  if (!m) return undefined;
  const units = BigInt(String(m.units ?? '0'));
  const nanos = Number(m.nanos ?? 0);
  const negative = units < 0n || nanos < 0;
  const whole = (units < 0n ? -units : units).toString();
  const frac = String(Math.abs(nanos)).padStart(9, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

const SERVICE_ID_RE = /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/i;
const SKU_ID_RE = /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/i;
const BILLING_ACCOUNT_RE = /^(billingAccounts\/)?([0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6})$/i;
/** Loop guard for the paged Billing lists: at most this many pages of 5000 are read. */
const BILLING_PAGES = 50;

interface BillingSku {
  skuId?: string;
  description?: string;
  category?: { serviceDisplayName?: string; resourceFamily?: string; resourceGroup?: string; usageType?: string };
  serviceRegions?: string[];
  pricingInfo?: Array<{
    effectiveTime?: string;
    summary?: string;
    pricingExpression?: {
      usageUnit?: string;
      usageUnitDescription?: string;
      displayQuantity?: number;
      tieredRates?: Array<{ startUsageAmount?: number; unitPrice?: { units?: string; nanos?: number; currencyCode?: string } }>;
    };
  }>;
}

interface BetaPrice {
  name?: string;
  currencyCode?: string;
  valueType?: string;
  rate?: {
    unitInfo?: { unit?: string; unitDescription?: string; unitQuantity?: { value?: string } };
    tiers?: Array<{ startAmount?: { value?: string }; listPrice?: { units?: string; nanos?: number } }>;
  };
  priceReason?: { type?: string };
}

/** The latest list price of a v1 SKU (the last entry of its pricing timeline). */
export function skuPrice(sku: BillingSku): Record<string, unknown> | undefined {
  const info = sku.pricingInfo?.[sku.pricingInfo.length - 1];
  const expr = info?.pricingExpression;
  if (!expr) return undefined;
  const rates = expr.tieredRates ?? [];
  return {
    currency: rates.find((r) => r.unitPrice?.currencyCode)?.unitPrice?.currencyCode,
    unit: expr.usageUnit,
    unit_description: expr.usageUnitDescription,
    ...(expr.displayQuantity !== undefined && expr.displayQuantity !== 1 ? { display_quantity: expr.displayQuantity } : {}),
    tiers: rates.map((r) => ({ start_amount: r.startUsageAmount ?? 0, unit_price: moneyText(r.unitPrice) })),
    effective_time: info?.effectiveTime,
    ...(info?.summary ? { summary: info.summary } : {}),
  };
}

/** A v1beta price (a SKU's price, or a billing account's price) as a short object. */
export function betaPrice(p: BetaPrice): Record<string, unknown> {
  return {
    currency: p.currencyCode,
    value_type: p.valueType,
    unit: p.rate?.unitInfo?.unit,
    unit_description: p.rate?.unitInfo?.unitDescription,
    ...(p.rate?.unitInfo?.unitQuantity?.value !== undefined ? { unit_quantity: p.rate.unitInfo.unitQuantity.value } : {}),
    tiers: (p.rate?.tiers ?? []).map((t) => ({ start_amount: t.startAmount?.value ?? '0', list_price: moneyText(t.listPrice) })),
    ...(p.priceReason?.type ? { price_reason: p.priceReason.type } : {}),
  };
}

/** True when every word of the query is in the SKU's description or id (case is ignored). */
export function skuMatches(sku: BillingSku, query: string | undefined, region: string | undefined): boolean {
  if (region !== undefined && !(sku.serviceRegions ?? []).some((r) => r.toLowerCase() === region.toLowerCase())) return false;
  if (!query?.trim()) return true;
  const text = `${sku.description ?? ''} ${sku.skuId ?? ''}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => text.includes(word));
}

// ---------- the tools ----------

export function opsTools(call: CloudCall): ToolDef[] {
  const enc = encodeURIComponent;

  return [
    defineTool({
      name: 'logging_entries_list',
      title: 'List log entries',
      description: `Search Cloud Logging entries (matches list_log_entries in Google's Logging MCP server). Give project_id (or resource_names for folders, organizations, billing accounts or log views) and narrow with filter (the Logging query language), severity (that level and above), resource_type (for example cloud_run_revision, cloud_run_job, cloud_function, gce_instance, k8s_container) and a time window: start_time and end_time, or freshness (30m, 6h, 1d). Without any time limit the last ${DEFAULT_FRESHNESS} is searched, as gcloud logging read does. Newest first by default. view compact (the default) returns one short row per entry (time, severity, log, resource, message, HTTP request, trace); full returns Google's entries. Page with next_page_token.`,
      kind: 'read',
      scopes: LOGGING_READ_SCOPES,
      inputSchema: {
        project_id: projectId.optional().describe('The project whose logs to search. Give this or resource_names.'),
        resource_names: z
          .array(z.string().min(1))
          .min(1)
          .max(100)
          .optional()
          .describe('Parents to search instead of one project: projects/P, folders/F, organizations/O, billingAccounts/B, or a log view (.../locations/L/buckets/B/views/V).'),
        filter: z.string().max(20000).optional().describe('A Logging query, for example resource.labels.service_name="api" AND textPayload:"timeout".'),
        severity: z.enum(SEVERITIES).optional().describe('Entries at this severity and above.'),
        resource_type: z.string().min(1).max(200).optional().describe('The monitored resource type, for example cloud_run_revision or cloud_function.'),
        start_time: z.string().optional().describe('RFC 3339 start of the window (inclusive), for example 2026-10-30T08:00:00Z.'),
        end_time: z.string().optional().describe('RFC 3339 end of the window (exclusive).'),
        freshness: z.string().optional().describe(`How far back to search when start_time is not given: 30m, 6h, 1d, 1w. Default ${DEFAULT_FRESHNESS} when nothing else limits the time.`),
        order: z.enum(['newest', 'oldest']).optional().describe('newest (the default) or oldest first.'),
        page_size: z.number().int().min(1).optional().describe('Entries per page. Default 50, as Google.'),
        page_token: pageToken,
        view: z.enum(['compact', 'full']).optional().describe('compact (the default) or full.'),
      },
      async handler(args) {
        if (!args.project_id && !args.resource_names?.length) throw new Error('logging_entries_list needs project_id or resource_names.');
        if (args.project_id && args.resource_names?.length) throw new Error('Give project_id or resource_names, not both.');
        const resourceNames = args.resource_names ?? [`projects/${args.project_id}`];
        const { filter, windowDefaulted } = buildLogFilter(args, new Date());
        const res = await call<{ entries?: LogEntry[]; nextPageToken?: string }>({
          url: `${LOGGING}/entries:list`,
          method: 'POST',
          body: {
            resourceNames,
            ...(filter ? { filter } : {}),
            orderBy: args.order === 'oldest' ? 'timestamp asc' : 'timestamp desc',
            ...(args.page_size !== undefined ? { pageSize: args.page_size } : {}),
            ...(args.page_token ? { pageToken: args.page_token } : {}),
          },
        });
        const entries = res.data.entries ?? [];
        return {
          resource_names: resourceNames,
          filter,
          ...(windowDefaulted ? { window_note: `No time limit was given, so only the last ${DEFAULT_FRESHNESS} was searched. Give start_time or freshness for another window.` } : {}),
          count: entries.length,
          entries: args.view === 'full' ? entries : entries.map(compactEntry),
          ...(res.data.nextPageToken ? { next_page_token: res.data.nextPageToken } : {}),
        };
      },
    }),
    defineTool({
      name: 'monitoring_query_promql',
      title: 'Query Cloud Monitoring with PromQL',
      description:
        "Evaluate a PromQL query on Cloud Monitoring metrics (matches query_range in Google's Monitoring MCP server; the Managed Service for Prometheus query API). With start_time, end_time and step it is a range query (a series of points per time series); without them an instant query at time (default now). Times are RFC 3339 or UNIX seconds; step and timeout are Prometheus durations such as 60s or 5m. Cloud metrics use names such as run_googleapis_com:request_count. It only reads.",
      kind: 'read',
      scopes: MONITORING_READ_SCOPES,
      inputSchema: {
        project_id: projectId,
        query: z.string().min(1).max(100000).describe('A PromQL query, for example sum(rate(run_googleapis_com:request_count[5m])) by (service_name).'),
        start_time: z.string().optional().describe('Range query: the start time.'),
        end_time: z.string().optional().describe('Range query: the end time. Default now.'),
        step: z.string().optional().describe('Range query: the resolution, for example 60s. Required with start_time.'),
        time: z.string().optional().describe('Instant query: the time to evaluate at. Default now.'),
        timeout: z.string().optional().describe('An upper bound for the evaluation, for example 30s.'),
      },
      async handler({ project_id, query, start_time, end_time, step, time, timeout }) {
        const range = start_time !== undefined || end_time !== undefined || step !== undefined;
        if (range && time !== undefined) throw new Error('Give time for an instant query, or start_time, end_time and step for a range query, not both.');
        if (range && start_time === undefined) throw new Error('A range query needs start_time (and step).');
        if (range && step === undefined) throw new Error('A range query needs step, for example 60s.');
        const base = `${MONITORING}/projects/${enc(project_id)}/location/global/prometheus/api/v1`;
        const res = await call<unknown>({
          url: `${base}/${range ? 'query_range' : 'query'}`,
          method: 'POST',
          body: range
            ? { query, start: start_time, end: end_time ?? new Date().toISOString(), step, ...(timeout ? { timeout } : {}) }
            : { query, ...(time ? { time } : {}), ...(timeout ? { timeout } : {}) },
        });
        const answer = promAnswer(res.data);
        if (answer.status === 'error') throw new Error(`PromQL ${answer.errorType ?? 'error'}: ${answer.error ?? 'the query failed'}`);
        const result = answer.data?.result ?? [];
        return {
          query,
          kind: range ? 'range' : 'instant',
          result_type: answer.data?.resultType,
          series: Array.isArray(result) ? result.length : 0,
          result,
          ...(answer.warnings?.length ? { warnings: answer.warnings } : {}),
        };
      },
    }),
    defineTool({
      name: 'monitoring_dashboards_list',
      title: 'List monitoring dashboards',
      description:
        "List the custom Cloud Monitoring dashboards of a project (matches list_dashboards in Google's Monitoring MCP server): name, display name, layout and number of widgets. Read one with monitoring_dashboard_get.",
      kind: 'read',
      scopes: MONITORING_READ_SCOPES,
      inputSchema: {
        project_id: projectId,
        page_size: z.number().int().min(1).optional().describe('Dashboards per page. Google returns up to 1000 by default.'),
        page_token: pageToken,
      },
      async handler({ project_id, page_size, page_token }) {
        const res = await call<{ dashboards?: Array<Record<string, unknown>>; nextPageToken?: string }>({
          url: `${MONITORING}/projects/${enc(project_id)}/dashboards`,
          query: { pageSize: page_size, pageToken: page_token },
        });
        const layouts = ['gridLayout', 'mosaicLayout', 'rowLayout', 'columnLayout'];
        return {
          dashboards: (res.data.dashboards ?? []).map((d) => {
            const layout = layouts.find((l) => d[l] !== undefined);
            const body = (layout ? d[layout] : undefined) as { widgets?: unknown[]; tiles?: unknown[]; rows?: Array<{ widgets?: unknown[] }>; columns?: Array<{ widgets?: unknown[] }> } | undefined;
            const widgets =
              (body?.widgets?.length ?? 0) +
              (body?.tiles?.length ?? 0) +
              (body?.rows ?? []).reduce((n, r) => n + (r.widgets?.length ?? 0), 0) +
              (body?.columns ?? []).reduce((n, c) => n + (c.widgets?.length ?? 0), 0);
            return {
              name: d.name,
              display_name: d.displayName,
              layout: layout?.replace(/Layout$/, ''),
              widgets,
              ...(d.labels ? { labels: d.labels } : {}),
            };
          }),
          ...(res.data.nextPageToken ? { next_page_token: res.data.nextPageToken } : {}),
        };
      },
    }),
    defineTool({
      name: 'monitoring_dashboard_get',
      title: 'Get a monitoring dashboard',
      description:
        "Read one Cloud Monitoring dashboard with its widgets and queries (matches get_dashboard in Google's Monitoring MCP server). Give name (projects/P/dashboards/D, from monitoring_dashboards_list) or project_id and dashboard_id.",
      kind: 'read',
      scopes: MONITORING_READ_SCOPES,
      inputSchema: {
        name: z.string().optional().describe('The dashboard resource name: projects/P/dashboards/D, or dashboards/D for a system dashboard.'),
        project_id: projectId.optional(),
        dashboard_id: z.string().min(1).optional(),
      },
      async handler({ name, project_id, dashboard_id }) {
        let resource = name;
        if (!resource) {
          if (!project_id || !dashboard_id) throw new Error('monitoring_dashboard_get needs name, or project_id and dashboard_id.');
          resource = `projects/${project_id}/dashboards/${dashboard_id}`;
        }
        if (!/^(projects\/[^/]+\/)?dashboards\/[^/]+$/.test(resource)) throw new Error(`"${resource}" is not a dashboard name (projects/P/dashboards/D).`);
        const res = await call<unknown>({ url: `${MONITORING}/${resource.split('/').map(enc).join('/')}` });
        return res.data;
      },
    }),
    defineTool({
      name: 'iam_roles_list',
      title: 'List IAM roles',
      description:
        "List IAM roles (matches list_roles in Google's IAM MCP server): the custom roles of a project (project_id) or an organization (organization_id), or without either every predefined role. view full adds the permissions of each role. A readonly login cannot run it: IAM lists only the cloud-platform scope for role reads. Google's create, update, delete and undelete role tools are not here (they are reached with the gateway in the all toolset).",
      kind: 'read',
      scopes: IAM_ROLE_SCOPES,
      inputSchema: {
        project_id: projectId.optional().describe("The project whose custom roles to list."),
        organization_id: z.string().regex(/^\d+$/, 'organization_id is the numeric organization ID.').optional().describe('The organization whose custom roles to list.'),
        view: z.enum(['basic', 'full']).optional().describe('basic (the default) or full (with the permissions).'),
        show_deleted: z.boolean().optional().describe('Include deleted custom roles.'),
        page_size: z.number().int().min(1).max(1000).optional().describe('Roles per page: 1 to 1000. Google returns 300 by default.'),
        page_token: pageToken,
      },
      async handler({ project_id, organization_id, view, show_deleted, page_size, page_token }) {
        if (project_id && organization_id) throw new Error('Give project_id or organization_id, not both.');
        const parent = project_id ? `projects/${enc(project_id)}/` : organization_id ? `organizations/${enc(organization_id)}/` : '';
        const res = await call<{ roles?: Array<{ name?: string; title?: string; description?: string; stage?: string; deleted?: boolean; includedPermissions?: string[] }>; nextPageToken?: string }>({
          url: `${IAM}/${parent}roles`,
          query: { view: view === 'full' ? 'FULL' : undefined, showDeleted: show_deleted, pageSize: page_size, pageToken: page_token },
        });
        return {
          scope: project_id ? `projects/${project_id}` : organization_id ? `organizations/${organization_id}` : 'predefined',
          roles: (res.data.roles ?? []).map((r) => ({
            name: r.name,
            title: r.title,
            description: r.description,
            stage: r.stage,
            ...(r.deleted ? { deleted: true } : {}),
            ...(r.includedPermissions ? { permissions: r.includedPermissions } : {}),
          })),
          ...(res.data.nextPageToken ? { next_page_token: res.data.nextPageToken } : {}),
        };
      },
    }),
    defineTool({
      name: 'iam_role_get',
      title: 'Get an IAM role',
      description:
        "Read one IAM role with its permissions (matches get_role in Google's IAM MCP server): a predefined role (roles/viewer), a project's custom role (projects/P/roles/R) or an organization's (organizations/O/roles/R). A readonly login cannot run it (IAM lists only cloud-platform).",
      kind: 'read',
      scopes: IAM_ROLE_SCOPES,
      inputSchema: { name: z.string().describe('roles/NAME, projects/P/roles/R or organizations/O/roles/R.') },
      async handler({ name }) {
        if (!/^(roles\/[^/]+|projects\/[^/]+\/roles\/[^/]+|organizations\/\d+\/roles\/[^/]+)$/.test(name)) {
          throw new Error(`"${name}" is not a role name: roles/NAME, projects/P/roles/R or organizations/O/roles/R.`);
        }
        const res = await call<{ name?: string; title?: string; description?: string; stage?: string; deleted?: boolean; etag?: string; includedPermissions?: string[] }>({
          url: `${IAM}/${name.split('/').map(enc).join('/')}`,
        });
        const r = res.data;
        return { name: r.name, title: r.title, description: r.description, stage: r.stage, ...(r.deleted ? { deleted: true } : {}), permissions: r.includedPermissions ?? [] };
      },
    }),
    defineTool({
      name: 'billing_price_lookup',
      title: 'Look up Google Cloud prices',
      description:
        "Look up Google Cloud SKU prices (matches list_prices, get_price, list_billing_account_prices and get_billing_account_price in Google's Cloud Billing MCP server, and list_services and list_skus). Give sku_id for one SKU's latest price, or service (a display name such as Compute Engine, or a service ID such as 6F81-5844-456A) with query (words that must all be in the SKU description, for example N2 core) and region (for example us-central1) to find SKUs and their list prices. billing_account adds the account's own price for each SKU found (its contract or discounted price). currency_code sets the currency (ISO 4217; default USD, or the account's currency).",
      kind: 'read',
      scopes: BILLING_READ_SCOPES,
      inputSchema: {
        sku_id: z.string().regex(SKU_ID_RE, 'sku_id looks like D041-B8A1-6E0B.').optional().describe('One SKU: its latest price.'),
        service: z.string().min(1).max(200).optional().describe('The service to search: a display name (Compute Engine, Cloud Storage, BigQuery) or a service ID.'),
        query: z.string().max(500).optional().describe('Words that must all be in the SKU description.'),
        region: z.string().max(64).optional().describe('Only SKUs offered in this region, for example us-central1 or global.'),
        currency_code: z.string().regex(/^[A-Za-z]{3}$/, 'currency_code is three letters, for example EUR.').optional(),
        billing_account: z.string().regex(BILLING_ACCOUNT_RE, 'billing_account looks like 012345-6789AB-CDEF01.').optional().describe("Also return this billing account's price for each SKU."),
        max_skus: z.number().int().min(1).max(100).optional().describe('At most this many SKUs are returned (1 to 100). Default 20.'),
      },
      async handler(args) {
        const currency = args.currency_code?.toUpperCase();
        const account = args.billing_account ? (BILLING_ACCOUNT_RE.exec(args.billing_account) as RegExpExecArray)[2] : undefined;
        const accountPrice = async (skuId: string): Promise<Record<string, unknown>> => {
          try {
            const res = await call<BetaPrice>({ url: `${BILLING_V1BETA}/billingAccounts/${enc(account as string)}/skus/${enc(skuId)}/price`, query: { currencyCode: currency } });
            return { account_price: betaPrice(res.data) };
          } catch (err) {
            return { account_price_error: (err as Error).message };
          }
        };

        if (args.sku_id) {
          if (args.service || args.query || args.region) throw new Error('Give sku_id alone, or service with query and region to search.');
          const res = await call<BetaPrice>({ url: `${BILLING_V1BETA}/skus/${enc(args.sku_id)}/price`, query: { currencyCode: currency } });
          return { sku_id: args.sku_id, price: betaPrice(res.data), ...(account ? await accountPrice(args.sku_id) : {}) };
        }
        if (!args.service) throw new Error('billing_price_lookup needs sku_id, or service (with query and region to narrow it).');

        // The service: its ID as given, or the one whose display name is the given name.
        let serviceId = SERVICE_ID_RE.test(args.service) ? args.service.toUpperCase() : undefined;
        let serviceName = serviceId;
        if (!serviceId) {
          const wanted = args.service.trim().toLowerCase();
          const all: Array<{ serviceId?: string; displayName?: string }> = [];
          let token: string | undefined;
          for (let page = 0; page < BILLING_PAGES; page++) {
            const res = await call<{ services?: Array<{ serviceId?: string; displayName?: string }>; nextPageToken?: string }>({
              url: `${BILLING_V1}/services`,
              query: { pageSize: 5000, pageToken: token },
            });
            all.push(...(res.data.services ?? []));
            token = res.data.nextPageToken || undefined;
            if (!token) break;
          }
          const exact = all.filter((s) => s.displayName?.toLowerCase() === wanted);
          const close = exact.length ? exact : all.filter((s) => s.displayName?.toLowerCase().includes(wanted));
          if (close.length !== 1) {
            const names = close.slice(0, 10).map((s) => `${s.displayName} (${s.serviceId})`);
            throw new Error(
              close.length === 0
                ? `No Google Cloud service is called "${args.service}". Give its display name as the Cloud Billing catalog lists it, or its service ID.`
                : `"${args.service}" matches ${close.length} services: ${names.join('; ')}${close.length > 10 ? '; ...' : ''}. Give the exact name or the service ID.`,
            );
          }
          serviceId = close[0]?.serviceId;
          serviceName = close[0]?.displayName;
        }
        const max = args.max_skus ?? 20;
        const found: BillingSku[] = [];
        let matched = 0;
        let token: string | undefined;
        let pages = 0;
        for (; pages < BILLING_PAGES; pages++) {
          const res = await call<{ skus?: BillingSku[]; nextPageToken?: string }>({
            url: `${BILLING_V1}/services/${enc(serviceId as string)}/skus`,
            query: { currencyCode: currency, pageSize: 5000, pageToken: token },
          });
          for (const sku of res.data.skus ?? []) {
            if (!skuMatches(sku, args.query, args.region)) continue;
            matched += 1;
            if (found.length < max) found.push(sku);
          }
          token = res.data.nextPageToken || undefined;
          if (!token) break;
        }
        const skus: Array<Record<string, unknown>> = [];
        for (const sku of found) {
          skus.push({
            sku_id: sku.skuId,
            description: sku.description,
            category: { resource_family: sku.category?.resourceFamily, resource_group: sku.category?.resourceGroup, usage_type: sku.category?.usageType },
            regions: sku.serviceRegions ?? [],
            price: skuPrice(sku),
            ...(account && sku.skuId ? await accountPrice(sku.skuId) : {}),
          });
        }
        return {
          service: { id: serviceId, name: found[0]?.category?.serviceDisplayName ?? serviceName },
          matched,
          shown: skus.length,
          ...(matched > skus.length ? { note: `${matched} SKUs match; the first ${skus.length} are shown. Narrow with query or region, or raise max_skus (at most 100).` } : {}),
          ...(token ? { incomplete: `Only the first ${BILLING_PAGES} pages of SKUs were read.` } : {}),
          skus,
        };
      },
    }),
  ];
}
