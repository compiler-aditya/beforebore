import { v } from "convex/values";

import { query } from "./_generated/server";
import { requireUser } from "./authz";
import schema from "./schema";

const dashboardResultValidator = v.union(
  v.null(),
  v.object({
    project: schema.doc("projects"),
    stats: v.object({
      ready: v.number(),
      blocked: v.number(),
      waiting: v.number(),
      draft: v.number(),
      total: v.number(),
      unreadInbox: v.number(),
    }),
    permits: v.array(schema.doc("permits")),
    inboxMessages: v.array(schema.doc("inboxMessages")),
  }),
);

export const get = query({
  args: { projectCode: v.string() },
  returns: dashboardResultValidator,
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const projectCode = args.projectCode.trim().toUpperCase();
    if (projectCode.length === 0 || projectCode.length > 32) {
      return null;
    }

    const project = await ctx.db
      .query("projects")
      .withIndex("by_code", (q) => q.eq("code", projectCode))
      .unique();

    if (project === null) {
      return null;
    }

    const [permits, inboxMessages] = await Promise.all([
      ctx.db
        .query("permits")
        .withIndex("by_projectId_and_updatedAt", (q) =>
          q.eq("projectId", project._id),
        )
        .order("desc")
        .take(50),
      ctx.db
        .query("inboxMessages")
        .withIndex("by_projectId_and_receivedAt", (q) =>
          q.eq("projectId", project._id),
        )
        .order("desc")
        .take(8),
    ]);

    const stats = {
      ready: 0,
      blocked: 0,
      waiting: 0,
      draft: 0,
      total: permits.length,
      unreadInbox: 0,
    };

    for (const permit of permits) {
      stats[permit.status] += 1;
    }
    for (const message of inboxMessages) {
      if (message.unread) stats.unreadInbox += 1;
    }

    return { project, stats, permits, inboxMessages };
  },
});
