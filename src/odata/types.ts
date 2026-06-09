import type { HttpMethod, ODataVersion } from "../types.js";

/** OData system query options (the `$`-prefixed params). */
export interface QueryParams {
  filter?: string;
  select?: string[];
  expand?: string[];
  orderby?: string[];
  top?: number;
  skip?: number;
  count?: boolean;
  /** Extra raw query params (e.g. a `$skiptoken` passthrough), already decoded. */
  raw?: Record<string, string>;
}

export interface ODataRequest {
  systemKey?: string;
  version: ODataVersion;
  method: HttpMethod;
  /** Service root path, e.g. `/sap/opu/odata/sap/API_BUSINESS_PARTNER`. */
  servicePath: string;
  /** Resource after the service root, e.g. `A_BusinessPartner('1')` or `A_BusinessPartner`. */
  resourcePath: string;
  query?: QueryParams;
  body?: unknown;
  /** ETag for `If-Match` on PATCH/PUT/DELETE. */
  etag?: string;
  /** Force `If-Match: *` (intentional overwrite — forfeits lost-update protection). */
  forceOverwrite?: boolean;
  /** Extra non-secret request headers. */
  headers?: Record<string, string>;
  /**
   * Absolute URL for server-driven paging continuation. When set, it is used
   * verbatim and servicePath/resourcePath/query are ignored.
   */
  absoluteUrl?: string;
  signal?: AbortSignal;
}

export interface ODataResponse<T = unknown> {
  status: number;
  /** Normalized payload: an array for a collection, an object for a single entity, or null. */
  data: T;
  /** Total count, when `$count`/`$inlinecount` was requested. */
  count?: number;
  /** Server-driven paging continuation URL, when present. */
  nextLink?: string;
  /** ETag captured from the response (for follow-up writes). */
  etag?: string;
  correlationId: string;
}

export type { HttpMethod, ODataVersion };
