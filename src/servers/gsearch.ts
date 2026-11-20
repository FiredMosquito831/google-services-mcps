/**
 * Curated PageSpeed Insights tool of the gsearch server. No official Google MCP server covers PageSpeed, and the
 * generated `pagespeed_pagespeedapi_runpagespeed` returned the whole Lighthouse report: 150 audits before the category
 * scores, so the scores - the answer to "how fast is this page" - were cut off by the result limit (adversarial review of
 * gsearch, F1). This tool answers the question instead and keeps the report as an option.
 *
 *   psi_run  read  PageSpeed Insights API v5 pagespeedapi.runpagespeed (GET). The answer leads with the category scores,
 *                  the field data Google already collected from real visitors (CrUX), the six lab metrics and the top
 *                  opportunities; `include_raw` adds Google's whole report, shaped by the runtime.
 *
 * Auth: the API key of the apikey group (apikey.json or GSM_API_KEY), as the generated gsearch tools use it. The key
 * goes in the query, which is what this API documents, and ApiKeyClient (core/discovery/apikey-client.ts) removes it
 * from every error and answer.
 *
 * Curated CrUX reads (OD13d): `crux_record` (`records:queryRecord`) and `crux_history` (`records:queryHistoryRecord`)
 * shape CrUX field records and timeseries cleanly without inventing rating labels not sent by CrUX.
 */
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { ApiKeyClient } from '../core/discovery/apikey-client.js';
import { requestWithRetry } from '../core/http.js';
import { defineTool, type ToolDef } from '../core/tools.js';

// Discovery's own root and path for pagespeedapi.runpagespeed (rootUrl https://pagespeedonline.googleapis.com/), the
// same origin the generated per-method tool calls. Google's reference also shows www.googleapis.com/pagespeedonline/v5.
const PSI = 'https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed';

/**
 * The scope Discovery lists for the method: the bare `openid` (OpenID Connect), which `googleScopes` would turn into a
 * URL that is no scope (see src/servers/gcontacts.ts). The apikey group never sends an OAuth token anyway.
 */
const PSI_SCOPES = ['openid'];

/** The categories Google runs by default when none is named: Performance only (the method's `category` description). */
const DEFAULT_CATEGORIES = ['performance'];

/** Lighthouse's category ids, as the API spells them in lighthouseResult.categories. */
export const PSI_CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'] as const;

/** The six lab metrics of every Lighthouse run, in the order a page's speed is usually read. */
export const PSI_LAB_METRICS = [
  'first-contentful-paint',
  'largest-contentful-paint',
  'total-blocking-time',
  'cumulative-layout-shift',
  'speed-index',
  'interactive',
] as const;

interface LighthouseAudit {
  id?: string;
  title?: string;
  score?: number | null;
  displayValue?: string;
  numericValue?: number;
  description?: string;
  details?: { type?: string; overallSavingsMs?: number; overallSavingsBytes?: number };
}

interface LighthouseCategory {
  id?: string;
  score?: number | null;
  title?: string;
}

interface LoadingExperienceMetric {
  percentile?: number;
  category?: string;
}

/** Google's answer, only the parts this tool reads. */
export interface PsiResponse {
  id?: string;
  analysisUTCTimestamp?: string;
  loadingExperience?: { overall_category?: string; metrics?: Record<string, LoadingExperienceMetric> };
  originLoadingExperience?: { overall_category?: string };
  lighthouseResult?: {
    finalUrl?: string;
    finalDisplayedUrl?: string;
    requestedUrl?: string;
    fetchTime?: string;
    lighthouseVersion?: string;
    categories?: Record<string, LighthouseCategory>;
    audits?: Record<string, LighthouseAudit>;
    runtimeError?: { code?: string; message?: string };
  };
}

/** A Lighthouse score (0 to 1, or null when the category did not run) as the 0 to 100 a person reads. */
export function scorePercent(score: number | null | undefined): number | null {
  if (typeof score !== 'number' || Number.isNaN(score)) return null;
  return Math.round(score * 100);
}

/** The category scores, keyed by Lighthouse's own ids, with null for a category that was not run. */
export function categoryScores(result: PsiResponse, categories: readonly string[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const id of categories) out[id.replace(/-/g, '_')] = scorePercent(result.lighthouseResult?.categories?.[id]?.score);
  return out;
}

/** The field data Google collected from real visitors (CrUX), per metric: the 75th percentile and its rating. */
export function fieldData(experience: PsiResponse['loadingExperience']): { overall: string | null; metrics: Record<string, { p75: number | null; rating: string | null }> } | undefined {
  if (!experience || !experience.metrics) return undefined;
  const metrics: Record<string, { p75: number | null; rating: string | null }> = {};
  for (const [id, metric] of Object.entries(experience.metrics)) {
    metrics[id] = { p75: typeof metric.percentile === 'number' ? metric.percentile : null, rating: metric.category ?? null };
  }
  return { overall: experience.overall_category ?? null, metrics };
}

/** The six lab metrics: Lighthouse's display text, Google's number and the score. */
export function labMetrics(audits: Record<string, LighthouseAudit> | undefined): Record<string, { display: string | null; value: number | null; score: number | null }> {
  const out: Record<string, { display: string | null; value: number | null; score: number | null }> = {};
  for (const id of PSI_LAB_METRICS) {
    const audit = audits?.[id];
    if (!audit) continue;
    out[id.replace(/-/g, '_')] = {
      display: audit.displayValue ?? null,
      value: typeof audit.numericValue === 'number' ? audit.numericValue : null,
      score: scorePercent(audit.score),
    };
  }
  return out;
}

/**
 * The audits Lighthouse marks as opportunities (its details are an opportunity table), worst score first, at most
 * `limit`: the id, the title, the time or bytes they save and how much of the score they cost.
 */
export function opportunities(audits: Record<string, LighthouseAudit> | undefined, limit: number): Array<Record<string, unknown>> {
  const rows = Object.values(audits ?? {})
    .filter((a) => a?.details?.type === 'opportunity' && typeof a.score === 'number' && a.score < 1)
    .map((a) => ({
      id: a.id,
      title: a.title,
      score: scorePercent(a.score),
      ...(a.displayValue ? { display: a.displayValue } : {}),
      ...(typeof a.details?.overallSavingsMs === 'number' && a.details.overallSavingsMs > 0 ? { savings_ms: Math.round(a.details.overallSavingsMs) } : {}),
      ...(typeof a.details?.overallSavingsBytes === 'number' && a.details.overallSavingsBytes > 0 ? { savings_bytes: a.details.overallSavingsBytes } : {}),
    }))
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  return rows.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Chrome UX Report (CrUX): curated record and history reads over the Discovery POST endpoints.

const CRUX_RECORD = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord';
const CRUX_HISTORY = 'https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord';

export const CRUX_METRICS = [
  'first_contentful_paint',
  'first_input_delay',
  'largest_contentful_paint',
  'cumulative_layout_shift',
  'experimental_time_to_first_byte',
  'experimental_interaction_to_next_paint',
] as const;

export const CRUX_FORM_FACTORS = ['ALL_FORM_FACTORS', 'PHONE', 'DESKTOP', 'TABLET'] as const;

/** A display cap on histogram bins, not a Google limit. */
export const CRUX_HISTOGRAM_BINS = 10;

interface CruxDate {
  year?: number;
  month?: number;
  day?: number;
}

interface CruxKey {
  url?: string;
  origin?: string;
  formFactor?: string;
  effectiveConnectionType?: string;
}

export interface CruxRecordResponse {
  record?: {
    key?: CruxKey;
    collectionPeriod?: { firstDate?: CruxDate; lastDate?: CruxDate };
    metrics?: Record<
      string,
      {
        percentiles?: { p75?: unknown };
        fractions?: Record<string, number>;
        histogram?: Array<{ start?: unknown; end?: unknown; density?: unknown }>;
      }
    >;
  };
  urlNormalizationDetails?: { normalizedUrl?: string; originalUrl?: string };
}

export interface CruxHistoryResponse {
  record?: {
    key?: CruxKey;
    collectionPeriods?: Array<{ firstDate?: CruxDate; lastDate?: CruxDate }>;
    metrics?: Record<
      string,
      {
        percentilesTimeseries?: { p75s?: unknown[] };
        fractionTimeseries?: Record<string, { fractions?: unknown[] }>;
        histogramTimeseries?: Array<{ start?: unknown; end?: unknown; densities?: unknown[] }>;
      }
    >;
  };
  urlNormalizationDetails?: { normalizedUrl?: string; originalUrl?: string };
}

function cruxDate(date: CruxDate | undefined): string | null {
  if (!date || !Number.isInteger(date.year) || !Number.isInteger(date.month) || !Number.isInteger(date.day)) return null;
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

function identifierOf(key: CruxKey | undefined) {
  return {
    url: key?.url ?? null,
    origin: key?.origin ?? null,
    form_factor: key?.formFactor ?? null,
    effective_connection_type: key?.effectiveConnectionType ?? null,
  };
}

export function cruxRequest(input: {
  url?: string;
  origin?: string;
  metrics?: readonly (typeof CRUX_METRICS)[number][];
  formFactor?: (typeof CRUX_FORM_FACTORS)[number];
  collectionPeriodCount?: number;
}, history = false) {
  return {
    url: history ? CRUX_HISTORY : CRUX_RECORD,
    data: {
      ...(input.url ? { url: input.url } : {}),
      ...(input.origin ? { origin: input.origin } : {}),
      ...(input.metrics?.length ? { metrics: [...input.metrics] } : {}),
      ...(input.formFactor ? { formFactor: input.formFactor } : {}),
      ...(history && input.collectionPeriodCount !== undefined ? { collectionPeriodCount: input.collectionPeriodCount } : {}),
    },
  };
}

export function shapeCruxRecord(data: CruxRecordResponse) {
  const normalization = data.urlNormalizationDetails ? { url_normalization_details: data.urlNormalizationDetails } : {};
  if (!data.record) {
    return { found: false, note: 'No CrUX record was found for this identifier and dimensions.', ...normalization };
  }
  const metrics: Record<string, Record<string, unknown>> = {};
  const notes: string[] = [];
  for (const [name, metric] of Object.entries(data.record.metrics ?? {})) {
    const bins = Array.isArray(metric.histogram) ? metric.histogram : [];
    metrics[name] = {
      p75: metric.percentiles?.p75 ?? null,
      ...(metric.fractions && Object.keys(metric.fractions).length ? { fractions: metric.fractions } : {}),
      ...(bins.length ? { histogram: bins.slice(0, CRUX_HISTOGRAM_BINS) } : {}),
      ...(bins.length > CRUX_HISTOGRAM_BINS ? { histogram_shown: CRUX_HISTOGRAM_BINS, histogram_total: bins.length } : {}),
    };
    if (bins.length > CRUX_HISTOGRAM_BINS) {
      notes.push(`The histogram for ${name} shows ${CRUX_HISTOGRAM_BINS} of ${bins.length} bins (a display cap, not a Google limit).`);
    }
  }
  return {
    found: true,
    identifier: identifierOf(data.record.key),
    collection_period: {
      first_date: cruxDate(data.record.collectionPeriod?.firstDate),
      last_date: cruxDate(data.record.collectionPeriod?.lastDate),
    },
    metrics,
    ...normalization,
    ...(notes.length ? { note: notes.join(' ') } : {}),
  };
}

export function shapeCruxHistory(data: CruxHistoryResponse) {
  const normalization = data.urlNormalizationDetails ? { url_normalization_details: data.urlNormalizationDetails } : {};
  if (!data.record) {
    return { found: false, note: 'No CrUX history record was found for this identifier and dimensions.', ...normalization };
  }
  const metrics: Record<string, Record<string, unknown>> = {};
  const notes: string[] = [];
  for (const [name, metric] of Object.entries(data.record.metrics ?? {})) {
    const bins = Array.isArray(metric.histogramTimeseries) ? metric.histogramTimeseries : [];
    metrics[name] = {
      p75s: metric.percentilesTimeseries?.p75s ?? [],
      ...(metric.fractionTimeseries && Object.keys(metric.fractionTimeseries).length ? { fraction_timeseries: metric.fractionTimeseries } : {}),
      ...(bins.length ? { histogram_timeseries: bins.slice(0, CRUX_HISTOGRAM_BINS) } : {}),
      ...(bins.length > CRUX_HISTOGRAM_BINS ? { histogram_shown: CRUX_HISTOGRAM_BINS, histogram_total: bins.length } : {}),
    };
    if (bins.length > CRUX_HISTOGRAM_BINS) {
      notes.push(`The histogram timeseries for ${name} shows ${CRUX_HISTOGRAM_BINS} of ${bins.length} bins (a display cap, not a Google limit).`);
    }
  }
  return {
    found: true,
    identifier: identifierOf(data.record.key),
    collection_periods: (data.record.collectionPeriods ?? []).map((p) => ({
      first_date: cruxDate(p.firstDate),
      last_date: cruxDate(p.lastDate),
    })),
    metrics,
    ...normalization,
    ...(notes.length ? { note: notes.join(' ') } : {}),
  };
}

const cruxBaseShape = {
  url: z.string().trim().min(1).optional().describe('A full page URL, such as https://example.com/. Give this or origin, never both.'),
  origin: z.string().trim().min(1).optional().describe('A site origin, such as https://example.com. Give this or url, never both.'),
  metrics: z.array(z.enum(CRUX_METRICS)).optional().describe(`Only these CrUX metrics: ${CRUX_METRICS.join(', ')}. Google returns any metrics it has when none are named.`),
  formFactor: z.enum(CRUX_FORM_FACTORS).optional().describe(`The device class: ${CRUX_FORM_FACTORS.join(', ')}. Google's default aggregates all form factors.`),
};

const cruxHistoryShape = {
  ...cruxBaseShape,
  collectionPeriodCount: z
    .number()
    .int()
    .min(1)
    .max(40)
    .optional()
    .describe('Number of collection periods to return (1-40; Google defaults to 25).'),
};

function withOneIdentifier<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).superRefine((input, ctx) => {
    const a = input as { url?: string; origin?: string };
    if (a.url && a.origin) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Give exactly one of url or origin, not both.' });
    } else if (!a.url && !a.origin) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Give exactly one of url or origin.' });
    }
  });
}

const cruxRecordInput = withOneIdentifier(cruxBaseShape);
const cruxHistoryInput = withOneIdentifier(cruxHistoryShape);

const psiShape = {
  url: z.string().trim().min(1).describe('The URL to analyse, including its scheme, such as https://example.com/.'),
  strategy: z.enum(['mobile', 'desktop']).optional().describe("mobile or desktop. Google's default is desktop. Mobile is the form Google's own tools report."),
  categories: z
    .array(z.enum(PSI_CATEGORIES))
    .optional()
    .describe(`The Lighthouse categories to run: ${PSI_CATEGORIES.join(', ')}. Google's default is performance only; each category costs more of the API's quota.`),
  locale: z.string().optional().describe('The locale of the formatted results, such as en or fr.'),
  top_opportunities: z.number().int().min(0).max(25).optional().describe('How many of the worst opportunities to show (default 5, 0 for none).'),
  include_raw: z.boolean().optional().describe("Return Google's whole Lighthouse report as well, as `raw`. It is large and the runtime cuts it, so ask for it only when the summary is not enough."),
};

/** The query of one runpagespeed request: the parameters Discovery lists, and nothing else. */
export function psiRequest(input: z.infer<z.ZodObject<typeof psiShape>>) {
  const categories = input.categories?.length ? input.categories : DEFAULT_CATEGORIES;
  return {
    url: PSI,
    params: {
      url: input.url,
      ...(input.strategy ? { strategy: input.strategy } : {}),
      // Discovery's `category` is repeatable: one query parameter per category (the client appends each array item).
      category: categories,
      ...(input.locale ? { locale: input.locale } : {}),
    },
    categories,
  };
}

export function buildTools(cfg: RuntimeConfig): ToolDef[] {
  return [
    defineTool({
      name: 'psi_run',
      title: 'Run PageSpeed Insights',
      description:
        'How fast a page is: the Lighthouse category scores (performance, accessibility, best practices and SEO), the field data Google has from real visitors (Core Web Vitals at the 75th percentile), the six lab metrics and the worst opportunities with the time or bytes each would save. Runs one PageSpeed Insights analysis of a URL, on mobile or desktop (PageSpeed Insights API v5 pagespeedapi.runpagespeed, which Google\'s own tool does not have a server for). Ask for `include_raw` to get Google\'s whole Lighthouse report instead of the summary. A read; each call uses one of the API\'s 25,000 daily queries.',
      kind: 'read',
      scopes: PSI_SCOPES,
      inputSchema: psiShape,
      async handler(args) {
        const input = z.object(psiShape).parse(args);
        const req = psiRequest(input);
        const res = await requestWithRetry(() => new ApiKeyClient(cfg).request({ url: req.url, method: 'GET', params: req.params }), { idempotent: true });
        const data = (res.data ?? {}) as PsiResponse;
        if (data.lighthouseResult?.runtimeError) {
          // Lighthouse ran but could not analyse the page: say so plainly instead of answering with empty scores.
          throw new Error(`PageSpeed could not analyse the page: ${data.lighthouseResult.runtimeError.message ?? data.lighthouseResult.runtimeError.code ?? 'Lighthouse reported a runtime error'}`);
        }
        const audits = data.lighthouseResult?.audits;
        const limit = input.top_opportunities ?? 5;
        const field = fieldData(data.loadingExperience);
        const note = [
          field ? undefined : 'No field data: Google has no Core Web Vitals from real visitors for this URL (it has too little traffic). The lab numbers come from one synthetic run.',
          input.categories === undefined ? 'Only the performance category ran, which is Google\'s default; name categories to run more (each costs more quota).' : undefined,
        ].filter(Boolean) as string[];
        return {
          url: data.lighthouseResult?.finalDisplayedUrl ?? data.lighthouseResult?.finalUrl ?? data.id ?? input.url,
          strategy: input.strategy ?? 'desktop',
          analysis_utc: data.analysisUTCTimestamp,
          lighthouse_version: data.lighthouseResult?.lighthouseVersion,
          categories_run: req.categories,
          scores: categoryScores(data, req.categories),
          ...(field ? { field_data: field } : {}),
          ...(data.originLoadingExperience?.overall_category ? { origin_field_rating: data.originLoadingExperience.overall_category } : {}),
          lab_metrics: labMetrics(audits),
          opportunities: opportunities(audits, limit),
          ...(note.length ? { note: note.join(' ') } : {}),
          ...(input.include_raw ? { raw: data } : {}),
        };
      },
    }),
    defineTool({
      name: 'crux_record',
      title: 'Read a Chrome UX Report record',
      description:
        'One Chrome UX Report (CrUX) record for a page URL or a site origin: the collection period and, per metric, the 75th percentile with the fractions and up to 10 histogram bins Google returned (a display cap, not a Google limit). Give exactly one of `url` (a full page URL) or `origin` (a scheme and host); both or neither are refused before any request is sent. The published tool schema cannot express that one-of rule, so the handler enforces it. No rating is invented: CrUX does not return a GOOD/NEEDS-IMPROVEMENT/POOR field. A curated read over the CrUX API v1 records:queryRecord POST; `psi_run` gives PageSpeed scores and a field-data summary. A read; no approval prompt.',
      kind: 'read',
      scopes: [],
      inputSchema: cruxBaseShape,
      async handler(args) {
        const input = cruxRecordInput.parse(args);
        const req = cruxRequest(input, false);
        const res = await requestWithRetry(() => new ApiKeyClient(cfg).request({ url: req.url, method: 'POST', data: req.data }), { idempotent: true });
        return shapeCruxRecord((res.data ?? {}) as CruxRecordResponse);
      },
    }),
    defineTool({
      name: 'crux_history',
      title: 'Read a Chrome UX Report history timeseries',
      description:
        'Weekly Chrome UX Report (CrUX) timeseries history for a page URL or a site origin: collection periods (1-40, default 25) and per-metric p75s timeseries, fractions and bounded histogram bins. Give exactly one of `url` or `origin`; both or neither are refused before any request. No rating is invented. A curated read over the CrUX API v1 records:queryHistoryRecord POST. A read; no approval prompt.',
      kind: 'read',
      scopes: [],
      inputSchema: cruxHistoryShape,
      async handler(args) {
        const input = cruxHistoryInput.parse(args);
        const req = cruxRequest(input, true);
        const res = await requestWithRetry(() => new ApiKeyClient(cfg).request({ url: req.url, method: 'POST', data: req.data }), { idempotent: true });
        return shapeCruxHistory((res.data ?? {}) as CruxHistoryResponse);
      },
    }),
  ];
}
