import type { ResolvedSystem } from "../config/resolve.js";
import { ToolNotFoundError } from "../lib/errors.js";
import type { BoundAction, ParsedEntity, ParsedProperty } from "../metadata/parse-shared.js";
import type { RegisteredService } from "../store/catalog-store.js";
import type { ToolContext } from "./context.js";

/** Derive a service id from a path: the last non-empty segment, sans `/$metadata`. */
export function resolveServiceId(servicePath: string): string {
  const cleaned = servicePath.replace(/\/?\$metadata\/?$/i, "").replace(/\/+$/, "");
  const segments = cleaned.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last) throw new ToolNotFoundError(`Cannot derive a service id from path "${servicePath}".`);
  return last;
}

/** Resolve a system (throws ConfigError for unknown/missing). */
export function resolveSystem(ctx: ToolContext, system: string | undefined): ResolvedSystem {
  return ctx.config.resolveSystem(system);
}

/** Look up a registered service or throw a ToolNotFoundError. */
export function requireService(
  ctx: ToolContext,
  system: string | undefined,
  serviceId: string
): { systemKey: string; service: RegisteredService } {
  const systemKey = ctx.config.resolveSystem(system).key;
  const service = ctx.store.getService(systemKey, serviceId);
  if (!service) {
    throw new ToolNotFoundError(
      `Service "${serviceId}" is not registered for system "${systemKey}". Call register_service first.`
    );
  }
  return { systemKey, service };
}

/** Find an entity within a registered service or throw a ToolNotFoundError. */
export function requireEntity(service: RegisteredService, entitySet: string): ParsedEntity {
  const entity = service.entities.find((e) => e.entitySetName === entitySet);
  if (!entity) {
    const names = service.entities.map((e) => e.entitySetName).join(", ");
    throw new ToolNotFoundError(
      `Entity set "${entitySet}" not found in service "${service.serviceId}". Available: ${names || "(none)"}.`
    );
  }
  return entity;
}

export function propsByName(entity: ParsedEntity): Map<string, ParsedProperty> {
  return new Map(entity.properties.map((p) => [p.name, p]));
}

/** Find a bound-action FQN by leaf name (case-insensitive, exact or suffix match). */
export function findActionFqn(entity: ParsedEntity, leaf: string): string | undefined {
  const target = leaf.toLowerCase();
  const match = (a: BoundAction): boolean => {
    const name = a.name.toLowerCase();
    return name === target || name.endsWith(target);
  };
  return entity.boundActions?.find(match)?.fqn;
}

/** Map bound actions into the named draft lifecycle slots. */
export function draftActionMap(entity: ParsedEntity): {
  edit: string | null;
  prepare: string | null;
  activate: string | null;
  discard: string | null;
} {
  return {
    edit: findActionFqn(entity, "edit") ?? null,
    prepare: findActionFqn(entity, "prepare") ?? null,
    activate: findActionFqn(entity, "activate") ?? null,
    discard: findActionFqn(entity, "discard") ?? null,
  };
}
