import { ConvexError, v } from "convex/values";

import { internalMutation, query } from "./_generated/server";
import { requireUser } from "./authz";

export const createUserPasskey = internalMutation({
  args: {
    provider: v.object({
      name: v.literal("passkey"),
      accountId: v.string(),
      profile: v.object({ username: v.union(v.string(), v.null()) }),
    }),
  },
  returns: v.id("users"),
  handler: async (ctx, { provider }) => {
    if (!provider.profile.username) {
      throw new ConvexError({ code: "USERNAME_REQUIRED", message: "A username is required." });
    }
    return await ctx.db.insert("users", {
      username: provider.profile.username,
      createdAt: Date.now(),
    });
  },
});

export const current = query({
  args: {},
  returns: v.object({ username: v.string() }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return { username: user.username };
  },
});
