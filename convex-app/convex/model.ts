import { v } from "convex/values";

export const projectStatusValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
);

export const permitStatusValidator = v.union(
  v.literal("draft"),
  v.literal("waiting"),
  v.literal("blocked"),
  v.literal("ready"),
);

export const evidenceStatusValidator = v.union(
  v.literal("cleared"),
  v.literal("waiting"),
  v.literal("blocked"),
);

export const evidenceSourceValidator = v.union(
  v.literal("drawing"),
  v.literal("scan"),
  v.literal("approval"),
  v.literal("site"),
  v.literal("system"),
);

export const inboxCategoryValidator = v.union(
  v.literal("structural"),
  v.literal("scan"),
  v.literal("mep"),
  v.literal("system"),
);

export const auditEventTypeValidator = v.union(
  v.literal("created"),
  v.literal("gate_cleared"),
  v.literal("demo_gate_simulated"),
  v.literal("status_changed"),
  v.literal("evidence_received"),
  v.literal("seeded"),
);
