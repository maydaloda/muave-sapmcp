import type { SystemDirectory } from "../config/resolve.js";
import type { GovernancePolicy } from "../governance/policy.js";
import type { Logger } from "../observability/logger.js";
import type { ODataClient } from "../odata/client.js";
import type { CatalogStore } from "../store/catalog-store.js";

/** Everything tool handlers need, assembled by the container. */
export interface ToolContext {
  config: SystemDirectory;
  client: ODataClient;
  store: CatalogStore;
  governance: GovernancePolicy;
  logger: Logger;
}
