import type { ODataVersion } from "../types.js";
import { applyDraftAndActionInfo } from "./draft-extension.js";
import { parseV2Metadata } from "./parse-v2.js";
import { parseV4Metadata } from "./parse-v4.js";
import type { ParsedMetadata } from "./parse-shared.js";

export type {
  BoundAction,
  ParsedEntity,
  ParsedMetadata,
  ParsedProperty,
} from "./parse-shared.js";
export { fetchODataMetadata } from "./fetch.js";
export type { FetchMetadataOptions, FetchMetadataResult } from "./fetch.js";

/**
 * Parse a `$metadata` document into normalized form for the given OData version,
 * then augment with draft / bound-action info (v4 only).
 */
export function parseMetadata(xml: string, version: ODataVersion): ParsedMetadata {
  const parsed = version === "v2" ? parseV2Metadata(xml) : parseV4Metadata(xml);
  parsed.version = version;
  applyDraftAndActionInfo(parsed);
  return parsed;
}
