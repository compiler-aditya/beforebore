import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./authz";
import { permitStatusValidator } from "./model";
import schema from "./schema";

const TOTAL_GATES = 6;

const gateTemplates = [
  {
    key: "current-drawing",
    label: "Current drawing revision",
    detail: "Drawing set linked · revision verification pending",
    status: "waiting" as const,
    source: "drawing" as const,
  },
  {
    key: "gpr-scan",
    label: "GPR scan",
    detail: "Scan report required before drilling",
    status: "waiting" as const,
    source: "scan" as const,
  },
  {
    key: "structural-approval",
    label: "Structural approval",
    detail: "Awaiting a qualified structural reviewer",
    status: "waiting" as const,
    source: "approval" as const,
  },
  {
    key: "mep-clearance",
    label: "MEP services clearance",
    detail: "Electrical, plumbing, and mechanical review required",
    status: "waiting" as const,
    source: "approval" as const,
  },
  {
    key: "exclusion-zone",
    label: "Area below exclusion zone",
    detail: "Site photo and barricade confirmation required",
    status: "waiting" as const,
    source: "site" as const,
  },
  {
    key: "firestop-system",
    label: "Firestop system",
    detail: "No approved firestop system selected",
    status: "blocked" as const,
    source: "system" as const,
  },
] as const;

const advanceResultValidator = v.object({
  permitId: v.id("permits"),
  advancedGateId: v.union(v.id("evidenceGates"), v.null()),
  status: permitStatusValidator,
  clearedGateCount: v.number(),
  totalGateCount: v.number(),
});

function invalid(field: string, message: string): never {
  throw new ConvexError({ code: "VALIDATION_ERROR", field, message });
}

function cleanRequired(
  value: string,
  field: string,
  maxLength: number,
): string {
  const cleaned = value.trim();
  if (cleaned.length === 0) invalid(field, `${field} is required.`);
  if (cleaned.length > maxLength) {
    invalid(field, `${field} must be ${maxLength} characters or fewer.`);
  }
  return cleaned;
}

function initialsFor(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.replace(/[^A-Za-z0-9]/g, "").charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2) || "NA"
  );
}

export const getDetails = query({
  args: { permitId: v.id("permits") },
  returns: v.object({
    permit: schema.doc("permits"),
    project: schema.doc("projects"),
    evidenceGates: v.array(schema.doc("evidenceGates")),
    auditEvents: v.array(schema.doc("auditEvents")),
  }),
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const permit = await ctx.db.get("permits", args.permitId);
    if (permit === null) {
      throw new ConvexError({
        code: "PERMIT_NOT_FOUND",
        message: "The requested penetration permit does not exist.",
      });
    }

    const [project, evidenceGates, auditEvents] = await Promise.all([
      ctx.db.get("projects", permit.projectId),
      ctx.db
        .query("evidenceGates")
        .withIndex("by_permitId_and_sortOrder", (q) =>
          q.eq("permitId", permit._id),
        )
        .order("asc")
        .take(8),
      ctx.db
        .query("auditEvents")
        .withIndex("by_permitId_and_createdAt", (q) =>
          q.eq("permitId", permit._id),
        )
        .order("desc")
        .take(20),
    ]);

    if (project === null) {
      throw new ConvexError({
        code: "PROJECT_NOT_FOUND",
        message: "The project attached to this permit no longer exists.",
      });
    }

    return { permit, project, evidenceGates, auditEvents };
  },
});

export const create = mutation({
  args: {
    clientRequestId: v.string(),
    projectCode: v.string(),
    level: v.string(),
    location: v.string(),
    diameterMm: v.number(),
    depth: v.string(),
    purpose: v.string(),
    trade: v.string(),
  },
  returns: v.id("permits"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const clientRequestId = cleanRequired(
      args.clientRequestId,
      "clientRequestId",
      128,
    );
    if (
      clientRequestId.length < 8 ||
      !/^[A-Za-z0-9:_-]+$/.test(clientRequestId)
    ) {
      invalid(
        "clientRequestId",
        "clientRequestId must be 8–128 URL-safe characters.",
      );
    }

    const projectCode = cleanRequired(
      args.projectCode,
      "projectCode",
      32,
    ).toUpperCase();
    const level = cleanRequired(args.level, "level", 80);
    const location = cleanRequired(args.location, "location", 160);
    const depth = cleanRequired(args.depth, "depth", 80);
    const purpose = cleanRequired(args.purpose, "purpose", 800);
    const trade = cleanRequired(args.trade, "trade", 80);
    const requestedByName = user.username;
    if (
      !Number.isFinite(args.diameterMm) ||
      !Number.isInteger(args.diameterMm) ||
      args.diameterMm < 10 ||
      args.diameterMm > 1200
    ) {
      invalid(
        "diameterMm",
        "diameterMm must be a whole number between 10 and 1200.",
      );
    }

    const project = await ctx.db
      .query("projects")
      .withIndex("by_code", (q) => q.eq("code", projectCode))
      .unique();
    if (project === null) {
      throw new ConvexError({
        code: "PROJECT_NOT_FOUND",
        message: `Project ${projectCode} does not exist.`,
      });
    }

    const existing = await ctx.db
      .query("permits")
      .withIndex("by_projectId_and_clientRequestId", (q) =>
        q
          .eq("projectId", project._id)
          .eq("clientRequestId", clientRequestId),
      )
      .unique();
    if (existing !== null) return existing._id;

    const now = Date.now();
    const permitSequence = project.permitSequence + 1;
    const permitNumber = `BB-${permitSequence}`;
    const permitId = await ctx.db.insert("permits", {
      projectId: project._id,
      clientRequestId,
      permitNumber,
      level,
      location,
      diameterMm: args.diameterMm,
      depth,
      purpose,
      trade,
      requestedByName,
      requestedByInitials: initialsFor(requestedByName),
      requestedByUserId: user._id,
      status: "blocked",
      statusReason: "Firestop system selection required",
      scheduledAt: now + 4 * 60 * 60 * 1000,
      scheduledLabel: "Next available work window",
      drawingReference: "S-402",
      drawingRevision: "Rev 08",
      clearedGateCount: 0,
      totalGateCount: TOTAL_GATES,
      pinX: 54,
      pinY: 38,
      createdAt: now,
      updatedAt: now,
    });

    for (let index = 0; index < gateTemplates.length; index += 1) {
      const gate = gateTemplates[index];
      await ctx.db.insert("evidenceGates", {
        permitId,
        key: gate.key,
        label: gate.label,
        detail: gate.detail,
        status: gate.status,
        source: gate.source,
        sortOrder: index + 1,
        updatedAt: now,
      });
    }

    await ctx.db.insert("auditEvents", {
      projectId: project._id,
      permitId,
      eventType: "created",
      actorName: requestedByName,
      actorUserId: user._id,
      summary: `${permitNumber} submitted for evidence pre-screening.`,
      createdAt: now,
    });
    await ctx.db.patch("projects", project._id, {
      permitSequence,
      updatedAt: now,
    });

    return permitId;
  },
});

// This public interaction is for the synthetic seeded scenario only. It must
// never be used as a reviewer approval or a real-world work authorization.
export const simulateNextDemoGate = mutation({
  args: { permitId: v.id("permits") },
  returns: advanceResultValidator,
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const permit = await ctx.db.get("permits", args.permitId);
    if (permit === null) {
      throw new ConvexError({
        code: "PERMIT_NOT_FOUND",
        message: "The requested penetration permit does not exist.",
      });
    }

    const project = await ctx.db.get("projects", permit.projectId);
    if (
      project?.code !== "ALDER-5" ||
      !permit.clientRequestId.startsWith("seed:")
    ) {
      throw new ConvexError({
        code: "DEMO_ONLY",
        message: "Only seeded synthetic permits can advance in the demo. Real approvals require authenticated, qualified reviewers.",
      });
    }

    const gates = await ctx.db
      .query("evidenceGates")
      .withIndex("by_permitId_and_sortOrder", (q) =>
        q.eq("permitId", permit._id),
      )
      .order("asc")
      .take(8);

    const nextGate = gates.find((gate) => gate.status !== "cleared");
    if (nextGate === undefined) {
      if (permit.status !== "ready") {
        await ctx.db.patch("permits", permit._id, {
          status: "ready",
          statusReason: "Simulated demo readiness; not a work authorization",
          clearedGateCount: TOTAL_GATES,
          updatedAt: Date.now(),
        });
      }
      return {
        permitId: permit._id,
        advancedGateId: null,
        status: "ready" as const,
        clearedGateCount: TOTAL_GATES,
        totalGateCount: TOTAL_GATES,
      };
    }

    const now = Date.now();
    await ctx.db.patch("evidenceGates", nextGate._id, {
      status: "cleared",
      detail: "Simulated clearance for demo only; no human review occurred",
      reviewerName: "BeforeBore demo simulation",
      clearedAt: now,
      updatedAt: now,
    });

    const remainingGates = gates.filter(
      (gate) => gate._id !== nextGate._id && gate.status !== "cleared",
    );
    const clearedGateCount = gates.length - remainingGates.length;
    const status: Doc<"permits">["status"] =
      remainingGates.length === 0
        ? "ready"
        : remainingGates.some((gate) => gate.status === "blocked")
          ? "blocked"
          : "waiting";
    const statusReason =
      status === "ready"
        ? "Simulated demo readiness; not a work authorization"
        : status === "blocked"
          ? "A required safety gate is blocked"
          : "Awaiting reviewer evidence (demo simulation)";

    await ctx.db.patch("permits", permit._id, {
      status,
      statusReason,
      clearedGateCount,
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: permit.projectId,
      permitId: permit._id,
      eventType: "demo_gate_simulated",
      actorName: "BeforeBore demo simulation",
      summary: `${nextGate.label} simulated as cleared. No qualified reviewer approved this gate.`,
      createdAt: now,
    });
    if (status === "ready") {
      await ctx.db.insert("auditEvents", {
        projectId: permit.projectId,
        permitId: permit._id,
        eventType: "status_changed",
        actorName: "BeforeBore",
        summary: `${permit.permitNumber} reached simulated demo readiness. This is not a work authorization.`,
        createdAt: now + 1,
      });
    }
    await ctx.db.insert("inboxMessages", {
      projectId: permit.projectId,
      permitId: permit._id,
      permitNumber: permit.permitNumber,
      senderName: "BeforeBore demo",
      senderRole: "Simulation event",
      category:
        nextGate.source === "scan"
          ? "scan"
          : nextGate.source === "system"
            ? "system"
            : nextGate.source === "approval"
              ? nextGate.key === "structural-approval"
                ? "structural"
                : "mep"
              : "system",
      subject: `${permit.permitNumber} · ${nextGate.label}`,
      preview: `Simulated gate transition only. No evidence was accepted or approved.`,
      receivedAt: now,
      unread: true,
    });

    return {
      permitId: permit._id,
      advancedGateId: nextGate._id,
      status,
      clearedGateCount,
      totalGateCount: TOTAL_GATES,
    };
  },
});
