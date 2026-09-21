import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, env, internalQuery } from "./_generated/server";
import { requireIdentity } from "./authz";

const coordinationResultValidator = v.object({
  status: v.union(
    v.literal("not_configured"),
    v.literal("sent"),
    v.literal("failed"),
  ),
  messageId: v.union(v.string(), v.null()),
  summary: v.string(),
});

const permitContextValidator = v.union(
  v.null(),
  v.object({
    permitNumber: v.string(),
    location: v.string(),
  }),
);

function clean(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function extractMessageId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = payload as Record<string, unknown>;
  return typeof value.message_id === "string"
    ? value.message_id
    : typeof value.messageId === "string"
      ? value.messageId
      : null;
}

export const getPermitContext = internalQuery({
  args: { permitId: v.id("permits") },
  returns: permitContextValidator,
  handler: async (ctx, args) => {
    const permit = await ctx.db.get("permits", args.permitId);
    return permit === null
      ? null
      : { permitNumber: permit.permitNumber, location: permit.location };
  },
});

export const sendRequest = action({
  args: {
    permitId: v.id("permits"),
    reviewerRole: v.string(),
    subject: v.string(),
    body: v.string(),
  },
  returns: coordinationResultValidator,
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    const permit = await ctx.runQuery(internal.coordination.getPermitContext, {
      permitId: args.permitId,
    });
    if (permit === null) {
      return {
        status: "failed" as const,
        messageId: null,
        summary: "The selected permit no longer exists.",
      };
    }

    const apiKey = env.AGENTMAIL_API_KEY;
    const inboxId = env.AGENTMAIL_INBOX_ID;
    if (!apiKey || !inboxId) {
      return {
        status: "not_configured" as const,
        messageId: null,
        summary:
          "AgentMail is not configured. Add AGENTMAIL_API_KEY and AGENTMAIL_INBOX_ID to enable live reviewer requests.",
      };
    }

    const reviewerRole = clean(args.reviewerRole, 120);
    const subject = clean(args.subject, 180);
    const body = clean(args.body, 4_000);
    if (!reviewerRole || !subject || !body) {
      return {
        status: "failed" as const,
        messageId: null,
        summary: "Reviewer role, subject, and body are required.",
      };
    }

    try {
      // AgentMail gives this app one controlled sender inbox. The inbox id is
      // also used as the recipient fallback until role-to-address routing is
      // configured, keeping reviewer requests inside the project inbox.
      const response = await fetchWithTimeout(
        `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: inboxId,
            subject: `[${permit.permitNumber}] ${subject}`,
            text: `Reviewer role: ${reviewerRole}\nLocation: ${permit.location}\n\n${body}`,
          }),
        },
        8_000,
      );
      if (!response.ok) {
        return {
          status: "failed" as const,
          messageId: null,
          summary: `AgentMail rejected the request (HTTP ${response.status}).`,
        };
      }
      const payload: unknown = await response.json();
      const messageId = extractMessageId(payload);
      return {
        status: "sent" as const,
        messageId,
        summary: messageId
          ? `Request sent to the AgentMail coordination inbox for ${reviewerRole}.`
          : "AgentMail accepted the request, but did not return a message id.",
      };
    } catch (error) {
      return {
        status: "failed" as const,
        messageId: null,
        summary:
          error instanceof Error
            ? `AgentMail request failed: ${clean(error.message, 180)}.`
            : "AgentMail request failed.",
      };
    }
  },
});
