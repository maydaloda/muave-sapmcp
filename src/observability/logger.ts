import { pino, destination, type Logger as PinoLogger } from "pino";
import { SENSITIVE_HEADERS } from "./redact.js";

export type Logger = PinoLogger;

/**
 * Root logger.
 *
 * CRITICAL: writes to **stderr** (fd 2). On the stdio MCP transport, stdout is
 * reserved for JSON-RPC framing — any stray write to stdout corrupts the
 * protocol. pino's default destination is stdout, so we explicitly target fd 2.
 *
 * pino's `redact` paths defensively mask sensitive header fields anywhere they
 * appear in a logged object, on top of the call-site `redactHeaders` helper.
 */
const redactPaths = [
  ...[...SENSITIVE_HEADERS].flatMap((h) => [`headers.${h}`, `*.headers.${h}`]),
  "password",
  "clientSecret",
  "accessToken",
  "access_token",
  "token",
];

export const logger: Logger = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    base: { name: "muave-sapmcp" },
    redact: { paths: redactPaths, censor: "<redacted>" },
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  },
  destination({ dest: 2, sync: true })
);

/** Create a child logger with bound context (e.g. correlationId, system). */
export function createLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
