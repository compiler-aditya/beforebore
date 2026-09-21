import { ConvexError } from "convex/values";

import type { QueryCtx, MutationCtx } from "./_generated/server";

export async function requireIdentity(ctx: { auth: QueryCtx["auth"] }) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in to continue." });
  }
  return identity;
}

export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const identity = await requireIdentity(ctx);
  const id = ctx.db.normalizeId("users", identity.subject);
  const user = id === null ? null : await ctx.db.get("users", id);
  if (user === null) {
    throw new ConvexError({ code: "USER_NOT_FOUND", message: "The signed-in account no longer exists." });
  }
  return user;
}
