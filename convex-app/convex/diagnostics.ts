import { v } from "convex/values";

import { env, internalAction } from "./_generated/server";
import { sendCoordinationEmail } from "./coordination";
import { modelIdFor, selectModelProvider } from "./prescreen";

// Operator-only connectivity check for the external providers this app calls.
// It proves that a deployment's credentials actually reach Firecrawl, the
// configured model provider, and AgentMail before a demo, and it never returns
// a secret value.

const checkValidator = v.object({
  checkedAt: v.string(),
  providers: v.array(
    v.object({
      provider: v.string(),
      configured: v.boolean(),
      ok: v.boolean(),
      detail: v.string(),
    }),
  ),
});

type ProviderCheck = {
  provider: string;
  configured: boolean;
  ok: boolean;
  detail: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function bounded(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
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

async function describeFailure(
  provider: string,
  response: Response,
): Promise<ProviderCheck> {
  let body = "";
  try {
    body = bounded(await response.text(), 200);
  } catch {
    body = "";
  }
  return {
    provider,
    configured: true,
    ok: false,
    detail: `HTTP ${response.status}${body ? ` — ${body}` : ""}`,
  };
}

async function checkFirecrawl(): Promise<ProviderCheck> {
  const apiKey = env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return {
      provider: "firecrawl",
      configured: false,
      ok: false,
      detail: "FIRECRAWL_API_KEY is not set on this deployment.",
    };
  }
  try {
    const response = await fetchWithTimeout(
      "https://api.firecrawl.dev/v2/scrape",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: "https://example.com",
          formats: ["markdown"],
          onlyMainContent: true,
        }),
      },
      20_000,
    );
    if (!response.ok) return await describeFailure("firecrawl", response);
    const payload: unknown = await response.json();
    const data = isRecord(payload) && isRecord(payload.data) ? payload.data : null;
    const markdown = data !== null && typeof data.markdown === "string" ? data.markdown : "";
    return {
      provider: "firecrawl",
      configured: true,
      ok: markdown.length > 0,
      detail:
        markdown.length > 0
          ? `Scraped example.com — ${markdown.length} markdown characters.`
          : "Firecrawl responded but returned no markdown.",
    };
  } catch (error) {
    return {
      provider: "firecrawl",
      configured: true,
      ok: false,
      detail: bounded(error instanceof Error ? error.message : "Unknown error", 200),
    };
  }
}

async function checkModelProvider(): Promise<ProviderCheck> {
  const provider = selectModelProvider();
  if (provider === null) {
    return {
      provider: "model",
      configured: false,
      ok: false,
      detail: "Neither OPENAI_API_KEY nor GEMINI_API_KEY is set on this deployment.",
    };
  }
  const model = modelIdFor(provider);
  const isOpenAi = provider === "openai";
  const url = isOpenAi
    ? "https://api.openai.com/v1/responses"
    : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const headers: Record<string, string> = isOpenAi
    ? {
        Authorization: `Bearer ${env.OPENAI_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      }
    : {
        "x-goog-api-key": env.GEMINI_API_KEY ?? "",
        "Content-Type": "application/json",
      };
  const body = isOpenAi
    ? { model, input: "Reply with the single word: ready", max_output_tokens: 16 }
    : {
        contents: [{ role: "user", parts: [{ text: "Reply with the single word: ready" }] }],
        generationConfig: { maxOutputTokens: 16 },
      };

  try {
    const response = await fetchWithTimeout(
      url,
      { method: "POST", headers, body: JSON.stringify(body) },
      20_000,
    );
    if (!response.ok) return await describeFailure(provider, response);
    await response.json();
    return {
      provider,
      configured: true,
      ok: true,
      detail: `Model ${model} responded.`,
    };
  } catch (error) {
    return {
      provider,
      configured: true,
      ok: false,
      detail: bounded(error instanceof Error ? error.message : "Unknown error", 200),
    };
  }
}

async function checkAgentMail(): Promise<ProviderCheck> {
  const apiKey = env.AGENTMAIL_API_KEY;
  if (!apiKey) {
    return {
      provider: "agentmail",
      configured: false,
      ok: false,
      detail: "AGENTMAIL_API_KEY is not set on this deployment.",
    };
  }
  try {
    const response = await fetchWithTimeout(
      "https://api.agentmail.to/v0/inboxes",
      { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } },
      20_000,
    );
    if (!response.ok) return await describeFailure("agentmail", response);
    const payload: unknown = await response.json();
    const inboxes = isRecord(payload) && Array.isArray(payload.inboxes) ? payload.inboxes : [];
    const ids = inboxes
      .map((inbox) =>
        isRecord(inbox) && typeof inbox.inbox_id === "string" ? inbox.inbox_id : null,
      )
      .filter((id): id is string => id !== null);
    const configuredInbox = env.AGENTMAIL_INBOX_ID ?? null;
    return {
      provider: "agentmail",
      configured: true,
      ok: ids.length > 0,
      detail: `${ids.length} inbox(es): ${ids.slice(0, 5).join(", ") || "none"}. AGENTMAIL_INBOX_ID=${configuredInbox ?? "unset"}.`,
    };
  } catch (error) {
    return {
      provider: "agentmail",
      configured: true,
      ok: false,
      detail: bounded(error instanceof Error ? error.message : "Unknown error", 200),
    };
  }
}

export const sponsorCheck = internalAction({
  args: {},
  returns: checkValidator,
  handler: async () => {
    const providers = await Promise.all([
      checkFirecrawl(),
      checkModelProvider(),
      checkAgentMail(),
    ]);
    return { checkedAt: new Date().toISOString(), providers };
  },
});

// Registers (or reuses) the AgentMail webhook that delivers reviewer replies
// to this deployment's /agentmail/webhook route. It is scoped to the single
// coordination inbox so other inboxes on the same AgentMail account are not
// affected. The returned signing secret must be stored as
// AGENTMAIL_WEBHOOK_SECRET; scripts/agentmail-webhook.sh does that without
// printing it.
export const ensureAgentMailWebhook = internalAction({
  args: { siteUrl: v.string() },
  returns: v.object({
    status: v.string(),
    webhookId: v.union(v.string(), v.null()),
    secret: v.union(v.string(), v.null()),
    detail: v.string(),
  }),
  handler: async (_ctx, args) => {
    const apiKey = env.AGENTMAIL_API_KEY;
    const inboxId = env.AGENTMAIL_INBOX_ID;
    if (!apiKey || !inboxId) {
      return {
        status: "not_configured",
        webhookId: null,
        secret: null,
        detail: "AGENTMAIL_API_KEY and AGENTMAIL_INBOX_ID must both be set.",
      };
    }
    const targetUrl = `${args.siteUrl.replace(/\/+$/, "")}/agentmail/webhook`;

    const existing = await fetchWithTimeout(
      "https://api.agentmail.to/v0/webhooks",
      { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } },
      20_000,
    );
    if (existing.ok) {
      const payload: unknown = await existing.json();
      const list = isRecord(payload) && Array.isArray(payload.webhooks) ? payload.webhooks : [];
      const match = list.find(
        (hook) => isRecord(hook) && hook.url === targetUrl,
      );
      if (isRecord(match)) {
        return {
          status: "exists",
          webhookId: typeof match.webhook_id === "string" ? match.webhook_id : null,
          secret: typeof match.secret === "string" ? match.secret : null,
          detail: `A webhook for ${targetUrl} already exists.`,
        };
      }
    }

    const created = await fetchWithTimeout(
      "https://api.agentmail.to/v0/webhooks",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: targetUrl,
          event_types: ["message.received"],
          inbox_ids: [inboxId],
        }),
      },
      20_000,
    );
    if (!created.ok) {
      const failure = await describeFailure("agentmail", created);
      return {
        status: "failed",
        webhookId: null,
        secret: null,
        detail: failure.detail,
      };
    }
    const payload: unknown = await created.json();
    if (!isRecord(payload)) {
      return {
        status: "failed",
        webhookId: null,
        secret: null,
        detail: "AgentMail returned an unexpected webhook payload.",
      };
    }
    return {
      status: "created",
      webhookId: typeof payload.webhook_id === "string" ? payload.webhook_id : null,
      secret: typeof payload.secret === "string" ? payload.secret : null,
      detail: `Webhook registered for ${targetUrl}, scoped to ${inboxId}.`,
    };
  },
});

// Sends one real reviewer request through the same helper the dashboard uses,
// so an operator can prove the outbound AgentMail leg before a demo without
// signing in. The permit number is only used to build the subject line.
export const sendCoordinationProbe = internalAction({
  args: {
    permitNumber: v.optional(v.string()),
  },
  returns: v.object({
    status: v.string(),
    messageId: v.union(v.string(), v.null()),
    summary: v.string(),
  }),
  handler: async (_ctx, args) => {
    const result = await sendCoordinationEmail({
      permitNumber: args.permitNumber ?? "BB-2049",
      location: "Alder & 5th — Level 6 east core",
      reviewerRole: "Connectivity probe",
      subject: "Connectivity probe — please ignore",
      body: "Automated BeforeBore connectivity probe. No action is required and this message does not request or grant clearance to cut concrete.",
    });
    return result;
  },
});
