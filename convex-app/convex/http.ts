import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { Webhook } from "svix";

import { components, internal } from "./_generated/api";
import { env, httpAction } from "./_generated/server";

const http = httpRouter();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function nestedMessage(payload: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(payload.message)) return payload.message;
  if (isRecord(payload.data) && isRecord(payload.data.message)) {
    return payload.data.message;
  }
  return isRecord(payload.data) ? payload.data : payload;
}

function findPermitNumber(subject: string): string | null {
  const match = subject.toUpperCase().match(/\bBB-[0-9]{1,12}\b/);
  return match?.[0] ?? null;
}

export const agentMailWebhook = httpAction(async (ctx, request) => {
  const secret = env.AGENTMAIL_WEBHOOK_SECRET;
  if (!secret) {
    return jsonResponse(
      { status: "not_configured", message: "AgentMail webhook is not configured." },
      503,
    );
  }

  const rawBody = await request.text();
  if (rawBody.length > 1_000_000) {
    return jsonResponse({ status: "payload_too_large" }, 413);
  }

  let parsed: unknown;
  try {
    new Webhook(secret).verify(rawBody, {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    });
    parsed = JSON.parse(rawBody) as unknown;
  } catch {
    return jsonResponse({ status: "unauthorized" }, 401);
  }
  if (!isRecord(parsed)) {
    return jsonResponse({ status: "invalid_payload" }, 400);
  }

  const eventType = readString(parsed.event_type) ?? readString(parsed.eventType);
  if (eventType !== null && eventType !== "message.received") {
    return jsonResponse({ status: "ignored", reason: "event_type" });
  }

  const message = nestedMessage(parsed);
  const subject =
    readString(message.subject) ?? readString(parsed.subject) ?? "Reviewer response";
  const preview =
    readString(message.text) ??
    readString(message.preview) ??
    readString(message.html) ??
    "A reviewer response was received.";
  const permitNumber = findPermitNumber(subject);
  if (permitNumber === null) {
    return jsonResponse({ status: "ignored", reason: "no_permit_number" });
  }

  const receivedAtValue =
    message.received_at ?? message.receivedAt ?? message.timestamp;
  const receivedAt =
    typeof receivedAtValue === "number"
      ? receivedAtValue
      : typeof receivedAtValue === "string" && Number.isFinite(Date.parse(receivedAtValue))
        ? Date.parse(receivedAtValue)
        : Date.now();

  const result: { matched: boolean; recorded: boolean } = await ctx.runMutation(
    internal.agentmail.recordReceived,
    {
      permitNumber,
      subject,
      preview,
      receivedAt,
    },
  );
  return jsonResponse({ status: result.recorded ? "recorded" : "unmatched" });
});

http.route({
  path: "/agentmail/webhook",
  method: "POST",
  handler: agentMailWebhook,
});

registerStaticRoutes(http, components.staticHosting);

export default http;
