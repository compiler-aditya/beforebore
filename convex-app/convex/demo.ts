import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { requireUser } from "./authz";

type GateSeed = {
  key: string;
  label: string;
  detail: string;
  status: Doc<"evidenceGates">["status"];
  source: Doc<"evidenceGates">["source"];
  reviewerName?: string;
};

type PermitSeed = {
  permitNumber: string;
  level: string;
  location: string;
  diameterMm: number;
  depth: string;
  purpose: string;
  trade: string;
  requestedByName: string;
  requestedByInitials: string;
  status: Doc<"permits">["status"];
  statusReason: string;
  scheduledAt: number;
  scheduledLabel: string;
  clearedGateCount: number;
  pinX: number;
  pinY: number;
  updatedAt: number;
  gates: GateSeed[];
};

const gateLabels = [
  { key: "current-drawing", label: "Current drawing revision", source: "drawing" },
  { key: "gpr-scan", label: "GPR scan", source: "scan" },
  { key: "structural-approval", label: "Structural approval", source: "approval" },
  { key: "mep-clearance", label: "MEP services clearance", source: "approval" },
  { key: "exclusion-zone", label: "Area below exclusion zone", source: "site" },
  { key: "firestop-system", label: "Firestop system", source: "system" },
] as const;

async function insertPermit(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  seed: PermitSeed,
  createdAt: number,
) {
  const permitId = await ctx.db.insert("permits", {
    projectId,
    clientRequestId: `seed:${seed.permitNumber}`,
    permitNumber: seed.permitNumber,
    level: seed.level,
    location: seed.location,
    diameterMm: seed.diameterMm,
    depth: seed.depth,
    purpose: seed.purpose,
    trade: seed.trade,
    requestedByName: seed.requestedByName,
    requestedByInitials: seed.requestedByInitials,
    status: seed.status,
    statusReason: seed.statusReason,
    scheduledAt: seed.scheduledAt,
    scheduledLabel: seed.scheduledLabel,
    drawingReference: "S-402",
    drawingRevision: "Rev 08",
    clearedGateCount: seed.clearedGateCount,
    totalGateCount: 6,
    pinX: seed.pinX,
    pinY: seed.pinY,
    createdAt,
    updatedAt: seed.updatedAt,
  });

  for (let index = 0; index < seed.gates.length; index += 1) {
    const gate = seed.gates[index];
    await ctx.db.insert("evidenceGates", {
      permitId,
      key: gate.key,
      label: gate.label,
      detail: gate.detail,
      status: gate.status,
      source: gate.source,
      sortOrder: index + 1,
      ...(gate.reviewerName === undefined
        ? {}
        : { reviewerName: gate.reviewerName }),
      ...(gate.status === "cleared"
        ? { clearedAt: seed.updatedAt - (6 - index) * 60_000 }
        : {}),
      updatedAt: seed.updatedAt,
    });
  }

  await ctx.db.insert("auditEvents", {
    projectId,
    permitId,
    eventType: "seeded",
    actorName: "BeforeBore demo",
    summary: `${seed.permitNumber} loaded into the live coordination queue.`,
    createdAt,
  });

  return permitId;
}

export const seedDemo = mutation({
  args: {},
  returns: v.object({
    projectId: v.id("projects"),
    seeded: v.boolean(),
    permitCount: v.number(),
  }),
  handler: async (ctx) => {
    await requireUser(ctx);
    const existingProject = await ctx.db
      .query("projects")
      .withIndex("by_code", (q) => q.eq("code", "ALDER-5"))
      .unique();
    if (existingProject !== null) {
      return {
        projectId: existingProject._id,
        seeded: false,
        permitCount: 4,
      };
    }

    const baseTime = Date.UTC(2026, 8, 20, 8, 0, 0);
    const projectId = await ctx.db.insert("projects", {
      code: "ALDER-5",
      name: "Alder & 5th",
      siteLabel: "Building A · Active",
      status: "active",
      activeUserCount: 11,
      permitSequence: 2049,
      createdAt: baseTime - 14 * 24 * 60 * 60 * 1000,
      updatedAt: baseTime + 4 * 60 * 60 * 1000,
    });

    const permitSeeds: PermitSeed[] = [
      {
        permitNumber: "BB-2049",
        level: "Level 04",
        location: "Grid C4 · Electrical room",
        diameterMm: 150,
        depth: "Full depth",
        purpose: "New sanitary riser connection serving Level 04 washrooms.",
        trade: "Plumbing",
        requestedByName: "M. Torres",
        requestedByInitials: "MT",
        status: "blocked",
        statusReason: "Firestop system selection required",
        scheduledAt: baseTime + 6 * 60 * 60 * 1000,
        scheduledLabel: "Today · 14:00",
        clearedGateCount: 4,
        pinX: 43,
        pinY: 35,
        updatedAt: baseTime + 3 * 60 * 60 * 1000 + 42 * 60 * 1000,
        gates: [
          { ...gateLabels[0], status: "cleared", detail: "S-402 · Rev 08 confirmed", reviewerName: "Document control" },
          { ...gateLabels[1], status: "cleared", detail: "Scan report · Clear zone marked", reviewerName: "Axis GPR" },
          { ...gateLabels[2], status: "cleared", detail: "Approved by Elena Park · 09:42", reviewerName: "Elena Park" },
          { ...gateLabels[3], status: "waiting", detail: "Electrical cleared · Plumbing pending" },
          { ...gateLabels[4], status: "cleared", detail: "Photo evidence attached", reviewerName: "Site supervision" },
          { ...gateLabels[5], status: "blocked", detail: "No approved system selected" },
        ],
      },
      {
        permitNumber: "BB-2048",
        level: "Level 03",
        location: "Grid F7 · East corridor",
        diameterMm: 50,
        depth: "180 mm · four openings",
        purpose: "Electrical containment route through corridor slab.",
        trade: "Electrical",
        requestedByName: "J. Bell",
        requestedByInitials: "JB",
        status: "waiting",
        statusReason: "Awaiting firestop review",
        scheduledAt: baseTime + 7.5 * 60 * 60 * 1000,
        scheduledLabel: "Today · 15:30",
        clearedGateCount: 5,
        pinX: 20,
        pinY: 70,
        updatedAt: baseTime + 3 * 60 * 60 * 1000 + 20 * 60 * 1000,
        gates: gateLabels.map((gate, index) => ({
          ...gate,
          status: index < 5 ? "cleared" : "waiting",
          detail: index < 5 ? "Evidence accepted" : "Firestop reviewer response pending",
          reviewerName: index < 5 ? "Coordination team" : undefined,
        })),
      },
      {
        permitNumber: "BB-2047",
        level: "Level 06",
        location: "Grid A2 · Riser 02",
        diameterMm: 225,
        depth: "Full depth",
        purpose: "Mechanical riser extension.",
        trade: "Mechanical",
        requestedByName: "S. Clarke",
        requestedByInitials: "SC",
        status: "ready",
        statusReason: "All evidence gates cleared",
        scheduledAt: baseTime + 3 * 60 * 60 * 1000,
        scheduledLabel: "Today · 11:00",
        clearedGateCount: 6,
        pinX: 66,
        pinY: 67,
        updatedAt: baseTime + 2 * 60 * 60 * 1000 + 55 * 60 * 1000,
        gates: gateLabels.map((gate) => ({
          ...gate,
          status: "cleared",
          detail: "Evidence accepted",
          reviewerName: "Coordination team",
        })),
      },
      {
        permitNumber: "BB-2046",
        level: "Level 02",
        location: "Grid D9 · Washroom core",
        diameterMm: 100,
        depth: "Full depth · two openings",
        purpose: "Washroom drainage reroute.",
        trade: "Plumbing",
        requestedByName: "A. King",
        requestedByInitials: "AK",
        status: "draft",
        statusReason: "Draft has not been submitted for review",
        scheduledAt: baseTime + 24 * 60 * 60 * 1000,
        scheduledLabel: "Tomorrow · 08:00",
        clearedGateCount: 2,
        pinX: 76,
        pinY: 35,
        updatedAt: baseTime + 2 * 60 * 60 * 1000 + 20 * 60 * 1000,
        gates: gateLabels.map((gate, index) => ({
          ...gate,
          status: index < 2 ? "cleared" : "waiting",
          detail: index < 2 ? "Evidence attached to draft" : "Required when draft is submitted",
          reviewerName: index < 2 ? "A. King" : undefined,
        })),
      },
    ];

    const permitIds: Id<"permits">[] = [];
    for (let index = 0; index < permitSeeds.length; index += 1) {
      permitIds.push(
        await insertPermit(
          ctx,
          projectId,
          permitSeeds[index],
          baseTime + index * 60_000,
        ),
      );
    }

    const [permit2049, permit2048] = permitIds;
    const inboxSeeds = [
      {
        permitId: permit2049,
        permitNumber: "BB-2049",
        senderName: "Elena Park",
        senderRole: "Structural",
        category: "structural" as const,
        subject: "RE: BB-2049 structural review",
        preview: "Approved at the revised location shown on S-402 Rev 08.",
        receivedAt: baseTime + 102 * 60_000,
        unread: true,
      },
      {
        permitId: permit2049,
        permitNumber: "BB-2049",
        senderName: "Axis GPR",
        senderRole: "Scanning contractor",
        category: "scan" as const,
        subject: "Scan report · Level 04 / C4",
        preview: "Clear area marked in green. Two conduits identified outside the bore zone.",
        receivedAt: baseTime + 78 * 60_000,
        unread: true,
      },
      {
        permitId: permit2048,
        permitNumber: "BB-2048",
        senderName: "Derek Mills",
        senderRole: "Electrical",
        category: "mep" as const,
        subject: "RE: Services clearance BB-2048",
        preview: "No electrical services within the marked penetration zone.",
        receivedAt: baseTime + 55 * 60_000,
        unread: true,
      },
      {
        permitNumber: "BB-2042",
        senderName: "BeforeBore",
        senderRole: "Permit monitor",
        category: "system" as const,
        subject: "Permit BB-2042 expires today",
        preview: "The approved work window ends at 17:00.",
        receivedAt: baseTime + 30 * 60_000,
        unread: false,
      },
    ];

    for (const message of inboxSeeds) {
      await ctx.db.insert("inboxMessages", {
        projectId,
        ...message,
      });
    }

    await ctx.db.insert("auditEvents", {
      projectId,
      permitId: permit2049,
      eventType: "evidence_received",
      actorName: "Axis GPR",
      summary: "GPR scan uploaded and clear bore zone marked.",
      createdAt: baseTime + 78 * 60_000,
    });
    await ctx.db.insert("auditEvents", {
      projectId,
      permitId: permit2049,
      eventType: "gate_cleared",
      actorName: "Elena Park",
      summary: "Structural approval gate cleared at the revised location.",
      createdAt: baseTime + 102 * 60_000,
    });

    return { projectId, seeded: true, permitCount: permitIds.length };
  },
});
