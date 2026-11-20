/**
 * Curated read tools of the gbusiness server: Google Business Profile reviews and local posts.
 *
 * Google documents these operations under My Business API v4, but both public Discovery forms
 * (https://www.googleapis.com/discovery/v1/apis/mybusiness/v4/rest and
 * https://mybusiness.googleapis.com/$discovery/rest?version=v4) returned 404 on 2026-11-19. There is therefore no
 * snapshot, no generated per-method tool and no catalog entry for them. These four tools are hand-written from the
 * dated REST reference pages quoted in tests/fixtures/discovery/mybusiness.v4.json; they are the read half of the gap.
 * Replies, post writes and deletes, media and reportInsights are deliberately absent: they need a separate owner
 * decision and dated vendor evidence for every method.
 *
 *   mbreviews_list      read  accounts.locations.reviews.list (GET), pageSize 1-50, documented orderBy values
 *   mbreviews_get       read  accounts.locations.reviews.get (GET), the review's resource name only
 *   mblocalposts_list   read  accounts.locations.localPosts.list (GET), pageSize 1-100 (Google's default is 20)
 *   mblocalposts_get    read  accounts.locations.localPosts.get (GET), the local post's resource name only
 *
 * Auth: the business group's OAuth user token, as the seven generated gbusiness APIs use. Every v4 method lists
 * business.manage; Google publishes no read-only variant, so even these reads need a readwrite login. The handler
 * sends no model-controlled confirmation: only reads are implemented here, and runServer gates writes.
 */
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { getAuthClient, googleScopes } from '../core/auth.js';
import { makeCloudCall, type CloudCall } from './cloud-http.js';
import { defineTool, type ToolDef } from '../core/tools.js';

const V4 = 'https://mybusiness.googleapis.com/v4';
/** Every in-scope v4 method lists this scope (Google's reference, checked 2026-11-19). */
const SCOPES = googleScopes('business.manage');

/** accounts/<id>/locations/<id>, the parent both list methods take. */
const PARENT = /^accounts\/[^/]+\/locations\/[^/]+$/;
/** The parent followed by one review or local post id, the name both get methods take. */
const childName = (collection: string) => new RegExp(`^accounts/[^/]+/locations/[^/]+/${collection}/[^/]+$`);
const REVIEW_NAME = childName('reviews');
const POST_NAME = childName('localPosts');

const REVIEW_ORDER = ['rating', 'rating desc', 'updateTime desc'] as const;
const parent = z.string().trim().regex(PARENT, 'Use accounts/<account>/locations/<location>; mbaccount_accounts_list and mbinfo_accounts_locations_list give the ids.');
const name = (pattern: RegExp, what: string) =>
  z.string().trim().regex(pattern, `Use the full ${what} name accounts/<account>/locations/<location>/*; the list tool gives it.`);

const reviewsListShape = {
  parent,
  page_size: z.number().int().min(1).max(50).optional().describe('Reviews per page, 1 to 50 (Google\'s maximum; its default is decided by Google).'),
  page_token: z.string().optional().describe('nextPageToken from the previous call, with the same other arguments.'),
  order_by: z
    .enum(REVIEW_ORDER)
    .optional()
    .describe("Sort order: rating (ascending), 'rating desc' or 'updateTime desc' (Google's documented values)."),
};
const reviewsGetShape = { name: name(REVIEW_NAME, 'review') };
const postsListShape = {
  parent,
  page_size: z.number().int().min(1).max(100).optional().describe("Local posts per page, 1 to 100 (Google's default is 20)."),
  page_token: z.string().optional().describe('nextPageToken from the previous call, with the same other arguments.'),
};
const postsGetShape = { name: name(POST_NAME, 'local post') };

export function buildTools(cfg: RuntimeConfig): ToolDef[] {
  const call: CloudCall = makeCloudCall(() => getAuthClient('business', cfg));
  const get = async (path: string, query?: Record<string, string | number | undefined>) => (await call<Record<string, unknown>>({ url: `${V4}/${path}`, query })).data ?? {};

  return [
    defineTool({
      name: 'mbreviews_list',
      title: 'List reviews of a business location',
      description:
        "The reviews of a Business Profile location, a page at a time, optionally sorted by rating or update time (My Business API v4 accounts.locations.reviews.list). Give the parent accounts/<account>/locations/<location>. business.manage covers it; there is no read-only scope. A read.",
      kind: 'read',
      scopes: SCOPES,
      inputSchema: reviewsListShape,
      async handler(args) {
        const input = z.object(reviewsListShape).parse(args);
        return get(`${input.parent}/reviews`, { pageSize: input.page_size, pageToken: input.page_token, orderBy: input.order_by });
      },
    }),
    defineTool({
      name: 'mbreviews_get',
      title: 'Get one review of a business location',
      description:
        'One Google review by its full resource name, with its rating, comment and reply (My Business API v4 accounts.locations.reviews.get). mbreviews_list gives the name. business.manage covers it; there is no read-only scope. A read.',
      kind: 'read',
      scopes: SCOPES,
      inputSchema: reviewsGetShape,
      async handler(args) {
        const input = z.object(reviewsGetShape).parse(args);
        return get(input.name);
      },
    }),
    defineTool({
      name: 'mblocalposts_list',
      title: 'List local posts of a business location',
      description:
        'The local posts of a Business Profile location, a page at a time (My Business API v4 accounts.locations.localPosts.list, default 20 and at most 100 per page). Give the parent accounts/<account>/locations/<location>. business.manage covers it; there is no read-only scope. A read.',
      kind: 'read',
      scopes: SCOPES,
      inputSchema: postsListShape,
      async handler(args) {
        const input = z.object(postsListShape).parse(args);
        return get(`${input.parent}/localPosts`, { pageSize: input.page_size, pageToken: input.page_token });
      },
    }),
    defineTool({
      name: 'mblocalposts_get',
      title: 'Get one local post of a business location',
      description:
        'One local post by its full resource name, with its content and state (My Business API v4 accounts.locations.localPosts.get). mblocalposts_list gives the name. business.manage covers it; there is no read-only scope. A read.',
      kind: 'read',
      scopes: SCOPES,
      inputSchema: postsGetShape,
      async handler(args) {
        const input = z.object(postsGetShape).parse(args);
        return get(input.name);
      },
    }),
  ];
}
