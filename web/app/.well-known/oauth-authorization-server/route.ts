import { oAuthDiscoveryMetadata } from "better-auth/plugins";
import { auth } from "@/lib/auth";

/** OAuth 2.1 authorization-server metadata (RFC 8414) served by better-auth. */
export const GET = oAuthDiscoveryMetadata(auth);
