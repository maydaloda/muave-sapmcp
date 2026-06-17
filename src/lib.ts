/**
 * Programmatic API of muave-sapmcp.
 *
 * The package's `bin` (dist/index.js) runs the stdio MCP server; this module is
 * the importable surface for embedding the connector in other hosts (e.g. a
 * remote Streamable-HTTP deployment): register the tools on any McpServer and
 * supply your own CatalogStore / credential / transport wiring.
 */

// MCP tool surface
export { registerAllTools } from "./tools/index.js";
export type { ToolContext } from "./tools/context.js";

// Configuration
export { loadSystemsFile, ConfigError } from "./config/load.js";
export { ConfigStore } from "./config/resolve.js";
export type { ResolvedSystem, SystemDirectory } from "./config/resolve.js";
export { SystemConfigSchema, SystemsFileSchema } from "./config/schema.js";
export type { AuthType, SystemConfig, SystemsFile } from "./config/schema.js";
export { catalogFilePath, findSystemsFile, muaveHome } from "./config/paths.js";
export type { CatalogPathOptions } from "./config/paths.js";

// Credentials
export { createCredentialResolver, CredentialMissingError, EnvCredentialResolver } from "./credentials/index.js";
export type { CredentialResolver } from "./credentials/index.js";

// SAP auth providers
export { TokenCache } from "./auth/token-cache.js";
export type { CachedToken } from "./auth/token-cache.js";
export type { AuthDeps, AuthProvider } from "./auth/provider.js";
export { createAuthProvider } from "./auth/registry.js";
export { AuthError, TokenFetchError } from "./auth/errors.js";

// OData client
export { ODataClient } from "./odata/client.js";
export type { ODataClientDeps, SystemResolver } from "./odata/client.js";
export { createDispatcherFactory } from "./odata/dispatcher.js";
export type { DispatcherFactory } from "./odata/dispatcher.js";
export { ConcurrencyLimiter } from "./odata/concurrency.js";
export { ODataError } from "./odata/errors.js";
export type { ErrorCategory } from "./odata/errors.js";
export type { ODataRequest, ODataResponse, QueryParams } from "./odata/types.js";

// Governance
export { GovernanceError, GovernancePolicy } from "./governance/policy.js";

// Catalog store
export { CATALOG_SCHEMA_VERSION, serviceCacheKey } from "./store/catalog-store.js";
export type { CatalogFile, CatalogStore, RegisteredService } from "./store/catalog-store.js";
export { JsonFileCatalogStore } from "./store/json-file-store.js";

// Metadata types
export type { BoundAction, ParsedEntity, ParsedMetadata, ParsedProperty } from "./metadata/parse-shared.js";
export { fetchODataMetadata, parseMetadata } from "./metadata/index.js";

// Observability
export { createLogger, logger } from "./observability/logger.js";
export type { Logger } from "./observability/logger.js";

// Shared
export type { HttpMethod, ODataVersion } from "./types.js";
