import { v } from "convex/values";

import { internalMutation } from "./_generated/server";

const recordResultValidator = v.object({
  matched: v.boolean(),
  recorded: v.boolean(),
});

function redactAndBound(value: string, maxLength: number): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]")
    .replace(/https?:\/\/\S+/gi, "[redacted link]")
    .trim()
    .slice(0, maxLength);
}

export const recordReceived = internalMutation({
  args: {
    permitNumber: v.string(),
    subject: v.string(),
    preview: v.string(),
    receivedAt: v.number(),
  },
  returns: recordResultValidator,
  handler: async (ctx, args) => {
    const permitNumber = args.permitNumber.trim().toUpperCase();
    if (!/^BB-[0-9]{1,12}$/.test(permitNumber)) {
      return { matched: false, recorded: false };
    }

    // The existing schema scopes permit numbers by project. Resolve against a
    // bounded set of active projects, then use the indexed lookup for the
    // permit itself (no full-table filter in the webhook path).
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_code")
      .order("asc")
      .take(100);
    let permit = null;
    for (const project of projects) {
      const candidate = await ctx.db
        .query("permits")
        .withIndex("by_projectId_and_permitNumber", (q) =>
          q.eq("projectId", project._id).eq("permitNumber", permitNumber),
        )
        .unique();
      if (candidate !== null) {
        permit = candidate;
        break;
      }
    }
    if (permit === null) return { matched: false, recorded: false };

    const safeSubject = redactAndBound(args.subject, 180) || "Reviewer response";
    const safePreview =
      redactAndBound(args.preview, 480) || "A reviewer response was received.";

    await ctx.db.insert("inboxMessages", {
      projectId: permit.projectId,
      permitId: permit._id,
      permitNumber: permit.permitNumber,
      senderName: "AgentMail relay",
      senderRole: "External reviewer",
      category: "system",
      subject: safeSubject,
      preview: safePreview,
      receivedAt: Number.isFinite(args.receivedAt)
        ? Math.min(Math.max(args.receivedAt, 0), Date.now() + 86_400_000)
        : Date.now(),
      unread: true,
    });
    await ctx.db.insert("auditEvents", {
      projectId: permit.projectId,
      permitId: permit._id,
      eventType: "evidence_received",
      actorName: "AgentMail relay",
      summary: redactAndBound(
        `Reviewer response received for ${permit.permitNumber}: ${safeSubject}`,
        260,
      ),
      createdAt: Date.now(),
    });
    return { matched: true, recorded: true };
  },
});
