import type { ResolvedSystem } from "../config/resolve.js";
import type { Logger } from "../observability/logger.js";
import { newCorrelationId } from "../observability/correlation.js";
import { redactHeaders, redactUrl } from "../observability/redact.js";
import { ConcurrencyLimiter } from "./concurrency.js";
import { fetchCsrf } from "./csrf.js";
import { captureETag, ifMatchHeader } from "./etag.js";
import {
  ODataError,
  categorizeStatus,
  parseSapError,
} from "./errors.js";
import { normalizeBody } from "./normalize.js";
import { buildQueryString } from "./query-builder.js";
import { RETRYABLE_STATUS, parseRetryAfter, withRetry } from "./retry.js";
import type { ODataRequest, ODataResponse } from "./types.js";
import { VERSION_BEHAVIOR, serializeRequestBody, type VersionBehavior } from "./version-behavior.js";

/** Minimal seam over ConfigStore so the client is easy to test. */
export interface SystemResolver {
  resolveSystem(key?: string): ResolvedSystem;
}

export interface ODataClientDeps {
  resolver: SystemResolver;
  logger: Logger;
  limiter: ConcurrencyLimiter;
}

function isCsrfRequired(res: Response): boolean {
  return (res.headers.get("x-csrf-token") ?? "").toLowerCase() === "required";
}

function appendParam(queryString: string, key: string, value: string): string {
  const pair = `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  return queryString ? `${queryString}&${pair}` : `?${pair}`;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

interface ExecuteFlags {
  forceCsrfRefetch: boolean;
}

/**
 * The single entry point for all OData calls. Resolves the system, enforces the
 * read-only governance gate, applies auth + (for writes) CSRF + ETag, retries
 * transient failures with backoff/jitter/Retry-After, performs one-shot recovery
 * on 401 and CSRF-403, and normalizes the V2/V4 response and errors.
 */
export class ODataClient {
  constructor(private readonly deps: ODataClientDeps) {}

  async request<T = unknown>(req: ODataRequest): Promise<ODataResponse<T>> {
    const correlationId = newCorrelationId();
    const system = this.deps.resolver.resolveSystem(req.systemKey);
    const log = this.deps.logger.child({
      correlationId,
      system: system.key,
      version: req.version,
    });
    const behavior = VERSION_BEHAVIOR[req.version];
    const isWrite = req.method !== "GET" && req.method !== "HEAD";

    if (isWrite && system.readOnly) {
      throw new ODataError({
        status: 0,
        category: "governance",
        message: `System "${system.key}" is read-only; set readOnly:false in systems.json to allow ${req.method}.`,
        correlationId,
      });
    }

    const url = req.absoluteUrl ?? this.buildUrl(system, req);
    const release = await this.deps.limiter.acquire(system.key, system.maxConcurrency);
    try {
      let response = await this.execute(system, req, url, behavior, correlationId, log, {
        forceCsrfRefetch: false,
      });

      if (response.status === 401) {
        system.authProvider.invalidate();
        log.warn("401 received — invalidating auth and retrying once");
        response = await this.execute(system, req, url, behavior, correlationId, log, {
          forceCsrfRefetch: false,
        });
      } else if (response.status === 403 && isWrite && isCsrfRequired(response)) {
        log.warn("403 CSRF Required — re-fetching token and retrying once");
        response = await this.execute(system, req, url, behavior, correlationId, log, {
          forceCsrfRefetch: true,
        });
      }

      return await this.finish<T>(response, req.version, correlationId);
    } finally {
      release();
    }
  }

  private buildUrl(system: ResolvedSystem, req: ODataRequest): string {
    const svc = req.servicePath.startsWith("/") ? req.servicePath : `/${req.servicePath}`;
    const cleanedSvc = svc.replace(/\/+$/, "");
    const resource = req.resourcePath ? `/${req.resourcePath.replace(/^\/+/, "")}` : "";
    const isRead = req.method === "GET" || req.method === "HEAD";
    let qs = buildQueryString(req.query, req.version, isRead);
    if (system.sapClient) qs = appendParam(qs, "sap-client", system.sapClient);
    return `${system.baseUrl}${cleanedSvc}${resource}${qs}`;
  }

  private csrfUrl(system: ResolvedSystem, req: ODataRequest): string {
    const svc = req.servicePath.startsWith("/") ? req.servicePath : `/${req.servicePath}`;
    const cleanedSvc = svc.replace(/\/+$/, "");
    let qs = "";
    if (req.version === "v2") qs = "?$format=json";
    if (system.sapClient) qs = appendParam(qs, "sap-client", system.sapClient);
    return `${system.baseUrl}${cleanedSvc}/${qs}`;
  }

  private async execute(
    system: ResolvedSystem,
    req: ODataRequest,
    url: string,
    behavior: VersionBehavior,
    correlationId: string,
    log: Logger,
    _flags: ExecuteFlags
  ): Promise<Response> {
    const authHeaders = await system.authProvider.getAuthHeaders();
    const headers: Record<string, string> = {
      accept: behavior.accept,
      "x-correlation-id": correlationId,
      ...req.headers,
      ...authHeaders,
    };

    const isWrite = req.method !== "GET" && req.method !== "HEAD";
    let body: string | undefined;
    if (isWrite && req.body !== undefined && req.body !== null) {
      headers["content-type"] = "application/json";
      body = serializeRequestBody(req.body, req.version);
    }

    if (isWrite) {
      const csrf = await fetchCsrf(
        this.csrfUrl(system, req),
        { ...headers },
        behavior.csrfMethod,
        req.signal
      );
      if (csrf.token) headers["x-csrf-token"] = csrf.token;
      if (csrf.cookie) headers["cookie"] = csrf.cookie;

      if (req.method === "PATCH" || req.method === "PUT" || req.method === "DELETE") {
        const im = ifMatchHeader({ etag: req.etag, forceOverwrite: req.forceOverwrite });
        if (im) headers["if-match"] = im;
      }
    }

    log.info(
      { method: req.method, url: redactUrl(url), headers: redactHeaders(headers) },
      "odata request"
    );

    const res = await withRetry(
      (signal) => {
        const init: RequestInit = { method: req.method, headers, signal };
        if (body !== undefined) init.body = body;
        return fetch(url, init);
      },
      { timeoutMs: system.timeoutMs, log, ...(req.signal ? { signal: req.signal } : {}) }
    );

    log.info({ status: res.status }, "odata response");
    return res;
  }

  private async finish<T>(
    res: Response,
    version: ODataRequest["version"],
    correlationId: string
  ): Promise<ODataResponse<T>> {
    const status = res.status;

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const csrf = isCsrfRequired(res) || /csrf/i.test(text);
      const sap = parseSapError(version, text);
      const retryAfterMs = status === 429 ? parseRetryAfter(res.headers.get("retry-after")) : undefined;
      throw new ODataError({
        status,
        category: categorizeStatus(status, csrf),
        message: sap.message,
        correlationId,
        sapCode: sap.code,
        retryable: RETRYABLE_STATUS.includes(status),
        ...(retryAfterMs !== undefined ? { retryAfterSeconds: Math.round(retryAfterMs / 1000) } : {}),
      });
    }

    const etag = captureETag(res);
    const out: ODataResponse<T> = { status, data: null as T, correlationId };
    if (etag) out.etag = etag;

    if (status === 204 || res.headers.get("content-length") === "0") {
      return out;
    }

    const ct = res.headers.get("content-type") ?? "";
    let parsed: unknown = null;
    if (ct.includes("json")) {
      parsed = await res.json().catch(() => null);
    } else {
      const text = await res.text().catch(() => "");
      parsed = text ? safeJson(text) : null;
    }

    const norm = normalizeBody(parsed, version);
    out.data = norm.data as T;
    if (norm.count !== undefined) out.count = norm.count;
    if (norm.nextLink !== undefined) out.nextLink = norm.nextLink;
    return out;
  }
}
