/**
 * Curated Google Analytics tools of the ganalytics server. They match tools of Google's Google Analytics MCP server
 * (github.com/googleanalytics/google-analytics-mcp): run_report and run_conversions_report, run_realtime_report,
 * run_funnel_report, list_property_annotations and create_property_annotation. Google's account summaries, property
 * details, Google Ads links and custom dimensions and metrics are generated tools here already.
 *
 * The generated gadata_* tools return Google's raw report: headers in one place and values by position in each row.
 * These return each row as an object keyed by the dimension and metric names, with the row count, the next offset and,
 * on request, the property's quota. They take plain arguments: a property id, dimension and metric names, date ranges.
 *
 *   ga_run_report           read   Data API v1beta properties.runReport; with conversion_spec, v1alpha runReport (the
 *                                  conversions report, which only v1alpha has).
 *   ga_run_realtime_report  read   Data API v1beta properties.runRealtimeReport.
 *   ga_run_funnel_report    read   Data API v1alpha properties.runFunnelReport. Not in this server's API lists; called
 *                                  here directly (tests/fixtures/discovery/analyticsdata.v1alpha.json is its contract).
 *   ga_annotations_list     read   Admin API v1alpha properties.reportingDataAnnotations.list.
 *   ga_annotation_create    write  Admin API v1alpha properties.reportingDataAnnotations.create. Its prepare step checks
 *                                  the dates and builds the exact annotation, which the approval shows; nothing is sent
 *                                  before the approval.
 *
 * The reports are declared reads here, as Google's server marks them and as bq_query_read is: they change nothing.
 * The classifier's kinds of the generated and gateway methods are not changed (item D2 of the tool-profiles spec).
 *
 * Auth: OAuth user token from `gsm login business`.
 */
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { getAuthClient, googleScopes } from '../core/auth.js';
import { defineTool, type PreparedAction, type ToolDef } from '../core/tools.js';
import { makeCloudCall, type CloudCall } from './cloud-http.js';

const DATA = 'https://analyticsdata.googleapis.com';
const ADMIN_ALPHA = 'https://analyticsadmin.googleapis.com/v1alpha';

/** The scopes of the Data API report methods (Discovery: analytics, analytics.readonly). */
const DATA_SCOPES = googleScopes('analytics', 'analytics.readonly');
/** The scopes of reportingDataAnnotations.list and .create, as Discovery lists them. */
const ANNOTATIONS_READ = googleScopes('analytics.edit', 'analytics.readonly');
const ANNOTATIONS_WRITE = googleScopes('analytics.edit');

/** The colors a caller may give an annotation. ORANGE is only for annotations Google makes. */
export const ANNOTATION_COLORS = ['PURPLE', 'BROWN', 'BLUE', 'GREEN', 'RED', 'CYAN'] as const;
export const DEFAULT_ANNOTATION_COLOR = 'PURPLE';

/** properties/<digits> from a property id given as digits, a number or properties/<digits>. Throws before any request. */
export function propertyName(id: string | number): string {
  const text = String(id).trim();
  const digits = text.startsWith('properties/') ? text.slice('properties/'.length) : text;
  if (!/^\d+$/.test(digits)) throw new Error(`"${text}" is not a Google Analytics property id: use its digits, such as 123456789, or properties/123456789.`);
  return `properties/${digits}`;
}

/** A date of a report range: YYYY-MM-DD, today, yesterday or NdaysAgo (the Data API's forms). */
const REPORT_DATE = /^(\d{4}-\d{2}-\d{2}|today|yesterday|\d+daysAgo)$/;

/** A calendar date YYYY-MM-DD as Google's Date type, or an error when it is not a real date. */
export function calendarDate(text: string, what: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  const [year, month, day] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [NaN, NaN, NaN];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (!m || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || year < 1) {
    throw new Error(`${what} "${text}" is not a date in the form YYYY-MM-DD.`);
  }
  return { year, month, day };
}

interface Header {
  name?: string;
  type?: string;
}
interface Row {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
}
interface GaReport {
  dimensionHeaders?: Header[];
  metricHeaders?: Header[];
  rows?: Row[];
  rowCount?: number;
  metadata?: Record<string, unknown>;
  propertyQuota?: Record<string, unknown>;
}

/**
 * One report as names and keyed rows: dimension_headers (names), metric_headers (name and type), and rows, each an
 * object of header name to value as Google returns it (a string). Values are not converted, so large integers stay exact.
 */
export function shapeReport(report: GaReport) {
  const dims = (report.dimensionHeaders ?? []).map((h) => h.name ?? '');
  const metrics = (report.metricHeaders ?? []).map((h) => ({ name: h.name ?? '', ...(h.type ? { type: h.type } : {}) }));
  const rows = (report.rows ?? []).map((row) => {
    const out: Record<string, string | undefined> = {};
    dims.forEach((name, i) => {
      out[name] = row.dimensionValues?.[i]?.value;
    });
    metrics.forEach((m, i) => {
      out[m.name] = row.metricValues?.[i]?.value;
    });
    return out;
  });
  return {
    dimension_headers: dims,
    metric_headers: metrics,
    rows,
    ...(report.metadata && Object.keys(report.metadata).length ? { metadata: report.metadata } : {}),
  };
}

/** The answer of a report: the shaped report, the row count, the next offset when Google has more rows, the quota. */
export function reportAnswer(report: GaReport, offset = 0) {
  const shaped = shapeReport(report);
  const total = report.rowCount ?? shaped.rows.length;
  const next = offset + shaped.rows.length;
  return {
    ...shaped,
    row_count: total,
    ...(next < total && shaped.rows.length > 0 ? { next_offset: next } : {}),
    ...(report.propertyQuota ? { property_quota: report.propertyQuota } : {}),
  };
}

const propertyId = z
  .union([z.string(), z.number().int()])
  .describe('The Google Analytics property id, digits such as 123456789 (or properties/123456789). gaadmin_account_summarie_list lists them.');
const dateRange = z.object({
  start_date: z.string().regex(REPORT_DATE, 'Use YYYY-MM-DD, today, yesterday or NdaysAgo.').describe('YYYY-MM-DD, today, yesterday or NdaysAgo, such as 30daysAgo.'),
  end_date: z.string().regex(REPORT_DATE, 'Use YYYY-MM-DD, today, yesterday or NdaysAgo.').describe('YYYY-MM-DD, today, yesterday or NdaysAgo.'),
  name: z.string().optional().describe('A name for the range, shown in the dateRange dimension when there are several ranges.'),
});
const names = (what: string, example: string) => z.array(z.string().trim().min(1)).describe(`${what} by API name, such as ${example}. gadata_properties_get_metadat lists them for a property.`);
const filter = (what: string) =>
  z
    .record(z.string(), z.unknown())
    .optional()
    .describe(`${what}: a Data API FilterExpression as JSON, such as {"filter": {"fieldName": "country", "stringFilter": {"value": "France"}}}, or andGroup, orGroup and notExpression of those.`);
const orderBys = z
  .array(z.record(z.string(), z.unknown()))
  .optional()
  .describe('Data API OrderBy objects, such as [{"metric": {"metricName": "activeUsers"}, "desc": true}] or [{"dimension": {"dimensionName": "date"}}].');
const limit = z.number().int().min(1).optional().describe('Rows to return. Google returns 10,000 by default and at most 250,000 a request.');
const returnQuota = z.boolean().optional().describe("true adds the property's quota state after this request (property_quota).");

const dateRangesOf = (ranges: Array<z.infer<typeof dateRange>> | undefined) =>
  ranges?.map((r) => ({ startDate: r.start_date, endDate: r.end_date, ...(r.name ? { name: r.name } : {}) }));
const dimensionsOf = (list: string[] | undefined) => list?.map((name) => ({ name }));

const runReportShape = {
  property_id: propertyId,
  date_ranges: z.array(dateRange).min(1).describe('One or more date ranges, such as [{"start_date": "30daysAgo", "end_date": "yesterday"}].'),
  dimensions: names('Dimensions', 'country, date or sessionDefaultChannelGroup').optional(),
  metrics: names('Metrics', 'activeUsers, sessions or conversions').min(1),
  dimension_filter: filter('Filter on dimensions'),
  metric_filter: filter('Filter on metrics, applied after aggregation'),
  order_bys: orderBys,
  limit,
  offset: z.number().int().min(0).optional().describe('The first row to return, from 0; next_offset of the previous answer pages on.'),
  currency_code: z.string().regex(/^[A-Z]{3}$/, 'Use an ISO 4217 code such as EUR.').optional().describe("An ISO 4217 currency code such as EUR; default the property's currency."),
  return_property_quota: returnQuota,
  conversion_spec: z
    .object({
      conversion_actions: z.array(z.string()).optional().describe('Conversion action ids, such as conversionActions/1234; empty means all.'),
      attribution_model: z.enum(['DATA_DRIVEN', 'LAST_CLICK']).optional().describe('DATA_DRIVEN (Google\'s default) or LAST_CLICK.'),
    })
    .optional()
    .describe('A conversions report (Data API v1alpha, which only some properties have): the conversion actions and the attribution model.'),
};

const realtimeShape = {
  property_id: propertyId,
  dimensions: names('Realtime dimensions', 'country, unifiedScreenName or minutesAgo').optional(),
  metrics: names('Realtime metrics', 'activeUsers or eventCount').min(1),
  dimension_filter: filter('Filter on dimensions'),
  metric_filter: filter('Filter on metrics'),
  order_bys: orderBys,
  limit,
  return_property_quota: returnQuota,
};

const funnelStep = z.object({
  name: z.string().optional().describe('The step name, shown as "<n>. <name>" in the funnelStepName dimension.'),
  event_name: z.string().trim().min(1).optional().describe('The event that completes this step, such as page_view or purchase. Give this or filter_expression.'),
  filter_expression: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('A Data API FunnelFilterExpression as JSON, for steps an event name cannot express (funnelFieldFilter, andGroup, orGroup, notExpression).'),
  is_directly_followed_by: z.boolean().optional().describe('true: this step must come right after the previous one.'),
  within_duration_from_prior_step: z
    .string()
    .regex(/^\d+(\.\d+)?s$/, 'Use seconds with an s, such as 300s.')
    .optional()
    .describe('The most time after the previous step, in seconds with an s, such as 300s.'),
});

const funnelShape = {
  property_id: propertyId,
  steps: z.array(funnelStep).min(1).describe('The steps of the funnel, in order. Each needs event_name or filter_expression.'),
  date_ranges: z.array(dateRange).optional().describe('Date ranges; Google uses the last 30 days when none is given.'),
  open_funnel: z.boolean().optional().describe('true: users may enter at any step (an open funnel). Default: closed, users enter at the first step.'),
  breakdown_dimension: z.string().optional().describe('A dimension that splits each step in the funnel table, such as deviceCategory.'),
  breakdown_limit: z.number().int().min(1).optional().describe('Values of the breakdown dimension to show; Google uses 5 and allows at most 15.'),
  next_action_dimension: z.string().optional().describe('The dimension shown as the next action after each step: eventName, or a page or screen dimension such as pagePath.'),
  next_action_limit: z.number().int().min(1).optional().describe('Values of the next action to show; Google uses 5 and allows at most 5.'),
  trended: z.boolean().optional().describe('true: a trended funnel, whose visualization has the date dimension. Default: a standard funnel.'),
  segments: z.array(z.record(z.string(), z.unknown())).optional().describe('Data API Segment objects as JSON; each gives its own rows. Google takes at most 4.'),
  limit,
  return_property_quota: returnQuota,
};

/** The FunnelStep of one step: the event name as a funnelEventFilter, or the filter expression as given. */
export function funnelStepOf(step: z.infer<typeof funnelStep>, index: number) {
  if ((step.event_name === undefined) === (step.filter_expression === undefined)) {
    throw new Error(`Step ${index + 1} needs exactly one of event_name and filter_expression.`);
  }
  return {
    ...(step.name ? { name: step.name } : {}),
    filterExpression: step.event_name !== undefined ? { funnelEventFilter: { eventName: step.event_name } } : step.filter_expression,
    ...(step.is_directly_followed_by !== undefined ? { isDirectlyFollowedBy: step.is_directly_followed_by } : {}),
    ...(step.within_duration_from_prior_step ? { withinDurationFromPriorStep: step.within_duration_from_prior_step } : {}),
  };
}

const annotationsListShape = {
  property_id: propertyId,
  filter: z
    .string()
    .optional()
    .describe('A filter on title, description, annotation_date, annotation_date_range or color, such as title="Holiday Sale" or is_annotation_in_range("2026-10-01", "2026-10-31") = true.'),
  page_size: z.number().int().min(1).max(200).optional().describe('Annotations per page, 1 to 200. Google returns 50 by default.'),
  page_token: z.string().optional().describe('next_page_token from the previous call, with the same other arguments.'),
};

const annotationCreateShape = {
  property_id: propertyId,
  title: z.string().trim().min(1).describe('The annotation title, such as "Spring sale".'),
  start_date: z.string().describe('The date the annotation marks, YYYY-MM-DD; with end_date, the first day of its range.'),
  end_date: z.string().optional().describe('The last day of a range, YYYY-MM-DD, on or after start_date. Omit it for one day.'),
  description: z.string().optional().describe('A longer description.'),
  color: z.enum(ANNOTATION_COLORS).optional().describe(`The color shown in reports. Default ${DEFAULT_ANNOTATION_COLOR}.`),
};

/** The request of ga_annotation_create: the property and the exact annotation. Checks the dates; sends nothing. */
export function annotationRequest(input: { property_id: string | number; title: string; start_date: string; end_date?: string; description?: string; color?: string }) {
  const parent = propertyName(input.property_id);
  const start = calendarDate(input.start_date, 'start_date');
  const end = input.end_date !== undefined && input.end_date !== input.start_date ? calendarDate(input.end_date, 'end_date') : undefined;
  if (end && Date.UTC(end.year, end.month - 1, end.day) < Date.UTC(start.year, start.month - 1, start.day)) {
    throw new Error(`end_date ${input.end_date} is before start_date ${input.start_date}.`);
  }
  const annotation = {
    title: input.title.trim(),
    ...(input.description ? { description: input.description } : {}),
    color: input.color ?? DEFAULT_ANNOTATION_COLOR,
    ...(end ? { annotationDateRange: { startDate: start, endDate: end } } : { annotationDate: start }),
  };
  return { parent, annotation };
}

interface Annotation {
  name?: string;
  title?: string;
  description?: string;
  color?: string;
  annotationDate?: { year?: number; month?: number; day?: number };
  annotationDateRange?: { startDate?: { year?: number; month?: number; day?: number }; endDate?: { year?: number; month?: number; day?: number } };
  systemGenerated?: boolean;
}

const isoDate = (d: { year?: number; month?: number; day?: number } | undefined): string | undefined =>
  d?.year ? `${String(d.year).padStart(4, '0')}-${String(d.month ?? 0).padStart(2, '0')}-${String(d.day ?? 0).padStart(2, '0')}` : undefined;

/** One annotation, short: its name, title, dates as YYYY-MM-DD, color, and whether Google made it. */
export function annotationSummary(a: Annotation) {
  return {
    name: a.name,
    title: a.title,
    ...(a.description ? { description: a.description } : {}),
    ...(a.annotationDate ? { date: isoDate(a.annotationDate) } : {}),
    ...(a.annotationDateRange ? { start_date: isoDate(a.annotationDateRange.startDate), end_date: isoDate(a.annotationDateRange.endDate) } : {}),
    ...(a.color ? { color: a.color } : {}),
    ...(a.systemGenerated ? { system_generated: true } : {}),
  };
}

export async function buildTools(cfg: RuntimeConfig): Promise<ToolDef[]> {
  // The account is chosen per call (see account-context.ts), so the client is not cached here.
  const call: CloudCall = makeCloudCall(() => getAuthClient('business', cfg));

  return [
    defineTool({
      name: 'ga_run_report',
      title: 'Run a Google Analytics report',
      description:
        "Run a Google Analytics report for a property: metrics by dimensions over date ranges, with filters, order and paging (matches run_report in Google's Google Analytics MCP server, and run_conversions_report with conversion_spec). Rows come back as objects keyed by the dimension and metric names, with row_count and next_offset when Google has more rows. gadata_properties_get_metadat lists the dimensions and metrics a property has. A read.",
      kind: 'read',
      scopes: DATA_SCOPES,
      inputSchema: runReportShape,
      async handler(args) {
        const input = z.object(runReportShape).parse(args);
        const property = propertyName(input.property_id);
        const version = input.conversion_spec ? 'v1alpha' : 'v1beta';
        const body = {
          dateRanges: dateRangesOf(input.date_ranges),
          ...(input.dimensions?.length ? { dimensions: dimensionsOf(input.dimensions) } : {}),
          metrics: input.metrics.map((name) => ({ name })),
          ...(input.dimension_filter ? { dimensionFilter: input.dimension_filter } : {}),
          ...(input.metric_filter ? { metricFilter: input.metric_filter } : {}),
          ...(input.order_bys ? { orderBys: input.order_bys } : {}),
          ...(input.limit !== undefined ? { limit: String(input.limit) } : {}),
          ...(input.offset !== undefined ? { offset: String(input.offset) } : {}),
          ...(input.currency_code ? { currencyCode: input.currency_code } : {}),
          ...(input.return_property_quota ? { returnPropertyQuota: true } : {}),
          ...(input.conversion_spec
            ? {
                conversionSpec: {
                  ...(input.conversion_spec.conversion_actions?.length ? { conversionActions: input.conversion_spec.conversion_actions } : {}),
                  ...(input.conversion_spec.attribution_model ? { attributionModel: input.conversion_spec.attribution_model } : {}),
                },
              }
            : {}),
        };
        const res = await call<GaReport>({ url: `${DATA}/${version}/${property}:runReport`, method: 'POST', body });
        return reportAnswer(res.data, input.offset ?? 0);
      },
    }),
    defineTool({
      name: 'ga_run_realtime_report',
      title: 'Run a Google Analytics realtime report',
      description:
        "Run a realtime report for a property: activity of the last 30 minutes, by realtime dimensions such as country or unifiedScreenName (matches run_realtime_report in Google's Google Analytics MCP server). Rows come back keyed by name. The Data API has no offset for realtime reports. A read.",
      kind: 'read',
      scopes: DATA_SCOPES,
      inputSchema: realtimeShape,
      async handler(args) {
        const input = z.object(realtimeShape).parse(args);
        const property = propertyName(input.property_id);
        const body = {
          ...(input.dimensions?.length ? { dimensions: dimensionsOf(input.dimensions) } : {}),
          metrics: input.metrics.map((name) => ({ name })),
          ...(input.dimension_filter ? { dimensionFilter: input.dimension_filter } : {}),
          ...(input.metric_filter ? { metricFilter: input.metric_filter } : {}),
          ...(input.order_bys ? { orderBys: input.order_bys } : {}),
          ...(input.limit !== undefined ? { limit: String(input.limit) } : {}),
          ...(input.return_property_quota ? { returnPropertyQuota: true } : {}),
        };
        const res = await call<GaReport>({ url: `${DATA}/v1beta/${property}:runRealtimeReport`, method: 'POST', body });
        return reportAnswer(res.data);
      },
    }),
    defineTool({
      name: 'ga_run_funnel_report',
      title: 'Run a Google Analytics funnel report',
      description:
        "Run a funnel report for a property: how many users complete each step, with completion and abandonment rates (matches run_funnel_report in Google's Google Analytics MCP server). Give the steps as event names (page_view, add_to_cart, purchase) or filter expressions. Returns the funnel table and the funnel visualization, rows keyed by name. Data API v1alpha. A read.",
      kind: 'read',
      scopes: DATA_SCOPES,
      inputSchema: funnelShape,
      async handler(args) {
        const input = z.object(funnelShape).parse(args);
        const property = propertyName(input.property_id);
        const steps = input.steps.map((s, i) => funnelStepOf(s, i));
        const body = {
          funnel: { steps, ...(input.open_funnel !== undefined ? { isOpenFunnel: input.open_funnel } : {}) },
          ...(input.date_ranges?.length ? { dateRanges: dateRangesOf(input.date_ranges) } : {}),
          ...(input.breakdown_dimension
            ? { funnelBreakdown: { breakdownDimension: { name: input.breakdown_dimension }, ...(input.breakdown_limit !== undefined ? { limit: String(input.breakdown_limit) } : {}) } }
            : {}),
          ...(input.next_action_dimension
            ? { funnelNextAction: { nextActionDimension: { name: input.next_action_dimension }, ...(input.next_action_limit !== undefined ? { limit: String(input.next_action_limit) } : {}) } }
            : {}),
          ...(input.trended !== undefined ? { funnelVisualizationType: input.trended ? 'TRENDED_FUNNEL' : 'STANDARD_FUNNEL' } : {}),
          ...(input.segments?.length ? { segments: input.segments } : {}),
          ...(input.limit !== undefined ? { limit: String(input.limit) } : {}),
          ...(input.return_property_quota ? { returnPropertyQuota: true } : {}),
        };
        const res = await call<{ funnelTable?: GaReport; funnelVisualization?: GaReport; propertyQuota?: Record<string, unknown> }>({
          url: `${DATA}/v1alpha/${property}:runFunnelReport`,
          method: 'POST',
          body,
        });
        return {
          funnel_table: shapeReport(res.data.funnelTable ?? {}),
          funnel_visualization: shapeReport(res.data.funnelVisualization ?? {}),
          ...(res.data.propertyQuota ? { property_quota: res.data.propertyQuota } : {}),
        };
      },
    }),
    defineTool({
      name: 'ga_annotations_list',
      title: 'List Google Analytics annotations',
      description:
        "List the annotations of a property: notes on dates or date ranges, such as a campaign launch or an outage, shown on reports (matches list_property_annotations in Google's Google Analytics MCP server). Admin API v1alpha. A read.",
      kind: 'read',
      scopes: ANNOTATIONS_READ,
      inputSchema: annotationsListShape,
      async handler(args) {
        const input = z.object(annotationsListShape).parse(args);
        const res = await call<{ reportingDataAnnotations?: Annotation[]; nextPageToken?: string }>({
          url: `${ADMIN_ALPHA}/${propertyName(input.property_id)}/reportingDataAnnotations`,
          query: { filter: input.filter, pageSize: input.page_size, pageToken: input.page_token },
        });
        return { annotations: (res.data.reportingDataAnnotations ?? []).map(annotationSummary), next_page_token: res.data.nextPageToken || undefined };
      },
    }),
    defineTool({
      name: 'ga_annotation_create',
      title: 'Create a Google Analytics annotation',
      description: `Add an annotation to a property, for one date or a date range, with a title, a description and a color (matches create_property_annotation in Google's Google Analytics MCP server). It asks first; the approval shows the exact annotation. Needs the analytics.edit scope and at least the Marketer or Editor role on the property. Admin API v1alpha.`,
      kind: 'write',
      scopes: ANNOTATIONS_WRITE,
      inputSchema: annotationCreateShape,
      async prepare(args): Promise<PreparedAction> {
        const req = annotationRequest(z.object(annotationCreateShape).parse(args));
        return { preview: { property: req.parent, annotation: req.annotation } };
      },
      async handler(args, _ctx, prepared) {
        const req = prepared ? (prepared.preview as { property: string; annotation: ReturnType<typeof annotationRequest>['annotation'] }) : (() => {
          const r = annotationRequest(z.object(annotationCreateShape).parse(args));
          return { property: r.parent, annotation: r.annotation };
        })();
        const res = await call<Annotation>({ url: `${ADMIN_ALPHA}/${req.property}/reportingDataAnnotations`, method: 'POST', body: req.annotation });
        return { created: annotationSummary(res.data) };
      },
    }),
  ];
}
