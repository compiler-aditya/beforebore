import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  auditEventTypeValidator,
  evidenceSourceValidator,
  evidenceStatusValidator,
  inboxCategoryValidator,
  permitStatusValidator,
  projectStatusValidator,
} from "./model";

export default defineSchema({
  users: defineTable({
    username: v.string(),
    createdAt: v.number(),
  }),

  projects: defineTable({
    code: v.string(),
    name: v.string(),
    siteLabel: v.string(),
    status: projectStatusValidator,
    activeUserCount: v.number(),
    permitSequence: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_code", ["code"]),

  permits: defineTable({
    projectId: v.id("projects"),
    clientRequestId: v.string(),
    permitNumber: v.string(),
    level: v.string(),
    location: v.string(),
    diameterMm: v.number(),
    depth: v.string(),
    purpose: v.string(),
    trade: v.string(),
    requestedByName: v.string(),
    requestedByInitials: v.string(),
    requestedByUserId: v.optional(v.id("users")),
    status: permitStatusValidator,
    statusReason: v.string(),
    scheduledAt: v.number(),
    scheduledLabel: v.string(),
    drawingReference: v.string(),
    drawingRevision: v.string(),
    clearedGateCount: v.number(),
    totalGateCount: v.number(),
    pinX: v.number(),
    pinY: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId_and_updatedAt", ["projectId", "updatedAt"])
    .index("by_projectId_and_clientRequestId", [
      "projectId",
      "clientRequestId",
    ])
    .index("by_projectId_and_permitNumber", ["projectId", "permitNumber"]),

  evidenceGates: defineTable({
    permitId: v.id("permits"),
    key: v.string(),
    label: v.string(),
    detail: v.string(),
    status: evidenceStatusValidator,
    source: evidenceSourceValidator,
    sortOrder: v.number(),
    reviewerName: v.optional(v.string()),
    clearedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_permitId_and_sortOrder", ["permitId", "sortOrder"]),

  inboxMessages: defineTable({
    projectId: v.id("projects"),
    permitId: v.optional(v.id("permits")),
    permitNumber: v.optional(v.string()),
    senderName: v.string(),
    senderRole: v.string(),
    category: inboxCategoryValidator,
    subject: v.string(),
    preview: v.string(),
    receivedAt: v.number(),
    unread: v.boolean(),
  }).index("by_projectId_and_receivedAt", ["projectId", "receivedAt"]),

  auditEvents: defineTable({
    projectId: v.id("projects"),
    permitId: v.id("permits"),
    eventType: auditEventTypeValidator,
    actorName: v.string(),
    actorUserId: v.optional(v.id("users")),
    summary: v.string(),
    createdAt: v.number(),
  }).index("by_permitId_and_createdAt", ["permitId", "createdAt"]),
});
