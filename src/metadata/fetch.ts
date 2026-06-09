/**
 * Fetches the raw `$metadata` XML for an OData service.
 *
 * Ported from the reference implementation; auth is injected by the caller
 * (resolved from the system's AuthProvider) rather than branched internally, so
 * this stays protocol-/auth-agnostic.
 */
export interface FetchMetadataOptions {
  baseUrl: string;
  servicePath: string;
  /** Pre-resolved auth headers (e.g. { authorization: "Bearer ..." }). */
  authHeaders?: Record<string, string>;
  signal?: AbortSignal;
}

export interface FetchMetadataResult {
  url: string;
  xml: string;
  status: number;
}

export async function fetchODataMetadata(opts: FetchMetadataOptions): Promise<FetchMetadataResult> {
  // Strip trailing slashes from baseUrl and leading from servicePath, then
  // append /$metadata. Tolerate $metadata already in path.
  const base = opts.baseUrl.replace(/\/+$/, "");
  const path = opts.servicePath.startsWith("/") ? opts.servicePath : "/" + opts.servicePath;
  const cleanedPath = path.replace(/\/?\$metadata\/?$/i, "");
  const url = `${base}${cleanedPath}/$metadata`;

  const headers: Record<string, string> = {
    accept: "application/xml,text/xml",
    ...opts.authHeaders,
  };

  let res: Response;
  try {
    const init: RequestInit = { headers };
    if (opts.signal) init.signal = opts.signal;
    res = await fetch(url, init);
  } catch (err) {
    throw new Error(
      `Network error fetching $metadata from ${url}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Metadata fetch failed with HTTP ${res.status}` + (text ? `: ${text.slice(0, 300)}` : "")
    );
  }

  const xml = await res.text();
  if (!xml || !xml.includes("<")) {
    throw new Error("Metadata response was empty or not XML");
  }
  return { url, xml, status: res.status };
}
