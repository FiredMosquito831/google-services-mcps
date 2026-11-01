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
  ];
}
