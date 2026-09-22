import { v } from "convex/values";

import type { GenericActionCtx } from "convex/server";

import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { action, env, internalMutation, internalQuery } from "./_generated/server";
import { requireIdentity } from "./authz";

const severityValidator = v.union(
  v.literal("info"),
  v.literal("warning"),
  v.literal("blocked"),
);

const providerValidator = v.union(
  v.literal("openai"),
  v.literal("gemini"),
  v.literal("firecrawl"),
  v.literal("demo"),
);

const findingValidator = v.object({
  gateKey: v.string(),
  severity: severityValidator,
  summary: v.string(),
  sourceUrl: v.string(),
  provider: providerValidator,
  humanReviewRequired: v.boolean(),
});

const resultValidator = v.object({
  status: v.union(
    v.literal("not_configured"),
    v.literal("completed"),
    v.literal("failed"),
  ),
  findings: v.array(findingValidator),
});

const permitContextValidator = v.union(
  v.null(),
  v.object({
    permitNumber: v.string(),
    level: v.string(),
    location: v.string(),
    purpose: v.string(),
    drawingReference: v.string(),
    drawingRevision: v.string(),
  }),
);

const DEMO_SUMMARY =
  "AI pre-screening is advisory only. A qualified human must verify the current drawing, scan, services clearances, and firestop system before work.";

type Finding = {
  gateKey: string;
  severity: "info" | "warning" | "blocked";
  summary: string;
  sourceUrl: string;
  provider: ModelProvider | "firecrawl" | "demo";
  humanReviewRequired: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function boundedText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function demoFindings(sourceUrl: string): Finding[] {
  return [
    {
      gateKey: "current-drawing",
      severity: "warning",
      summary: DEMO_SUMMARY,
      sourceUrl,
      provider: "demo",
      humanReviewRequired: true,
    },
  ];
}

function failedFindings(sourceUrl: string, summary: string): Finding[] {
  return [
    {
      gateKey: "current-drawing",
      severity: "warning",
      summary: boundedText(`${summary} ${DEMO_SUMMARY}`, 480),
      sourceUrl,
      provider: "demo",
      humanReviewRequired: true,
    },
  ];
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

export type ModelProvider = "openai" | "gemini";

const SYSTEM_PROMPT =
  "You are a construction coordination assistant. You identify evidence gaps for human review; you do not approve drilling.";

const GATE_KEYS = [
  "current-drawing",
  "gpr-scan",
  "structural-approval",
  "mep-clearance",
  "exclusion-zone",
  "firestop-system",
];

/**
 * Picks the structured-output model provider from whatever this deployment has
 * configured. OpenAI wins when both keys are present, so adding an OpenAI key
 * is enough to switch back without a code change.
 */
export function selectModelProvider(): ModelProvider | null {
  if (env.OPENAI_API_KEY) return "openai";
  if (env.GEMINI_API_KEY) return "gemini";
  return null;
}

export function modelIdFor(provider: ModelProvider): string {
  return provider === "openai"
    ? "gpt-4o-mini"
    : (env.GEMINI_MODEL ?? "gemini-2.5-flash");
}

function extractGeminiText(payload: unknown): {
  text: string | null;
  finishReason: string | null;
} {
  if (!isRecord(payload) || !Array.isArray(payload.candidates)) {
    return { text: null, finishReason: null };
  }
  let finishReason: string | null = null;
  for (const candidate of payload.candidates) {
    if (!isRecord(candidate)) continue;
    finishReason = finishReason ?? textValue(candidate.finishReason);
    if (!isRecord(candidate.content)) continue;
    const parts = Array.isArray(candidate.content.parts)
      ? candidate.content.parts
      : [];
    for (const part of parts) {
      if (!isRecord(part)) continue;
      const text = textValue(part.text);
      if (text !== null) return { text, finishReason };
    }
  }
  return { text: null, finishReason };
}

type ModelOutcome =
  | { ok: true; text: string }
  | { ok: false; detail: string };

/**
 * Asks the configured model for findings in one fixed JSON shape. Both
 * providers are pinned to structured output, so `parseModelFindings` receives
 * the same contract whichever one answered.
 */
async function requestFindings(
  provider: ModelProvider,
  prompt: string,
): Promise<ModelOutcome> {
  const model = modelIdFor(provider);

  if (provider === "openai") {
    const response = await fetchWithTimeout(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "beforebore_prescreen",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  findings: {
                    type: "array",
                    maxItems: 8,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        gateKey: { type: "string", enum: GATE_KEYS },
                        severity: {
                          type: "string",
                          enum: ["info", "warning", "blocked"],
                        },
                        summary: { type: "string" },
                      },
                      required: ["gateKey", "severity", "summary"],
                    },
                  },
                },
                required: ["findings"],
              },
            },
          },
          max_output_tokens: 1_000,
        }),
      },
      10_000,
    );
    if (!response.ok) {
      return {
        ok: false,
        detail: `OpenAI could not analyze the source (HTTP ${response.status}).`,
      };
    }
    const text = extractOutputText(await response.json());
    return text === null
      ? { ok: false, detail: "OpenAI returned no structured output." }
      : { ok: true, text };
  }

  // Gemini authenticates with a header key and uses its own OpenAPI-subset
  // schema dialect, but the requested JSON shape matches the OpenAI branch.
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": env.GEMINI_API_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          // Gemini 2.5 spends maxOutputTokens on thinking before it emits any
          // JSON. A long scraped document pushes a small budget past the limit
          // and the candidate comes back empty, so cap the thinking and leave
          // ample room for the answer itself.
          thinkingConfig: { thinkingBudget: 512 },
          responseSchema: {
            type: "OBJECT",
            properties: {
              findings: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    gateKey: { type: "STRING", enum: GATE_KEYS },
                    severity: {
                      type: "STRING",
                      enum: ["info", "warning", "blocked"],
                    },
                    summary: { type: "STRING" },
                  },
                  required: ["gateKey", "severity", "summary"],
                },
              },
            },
            required: ["findings"],
          },
          maxOutputTokens: 4_096,
        },
      }),
    },
    15_000,
  );
  if (!response.ok) {
    return {
      ok: false,
      detail: `Gemini could not analyze the source (HTTP ${response.status}).`,
    };
  }
  const { text, finishReason } = extractGeminiText(await response.json());
  if (text === null) {
    return {
      ok: false,
      detail:
        finishReason === "MAX_TOKENS"
          ? "Gemini hit its output limit before returning findings."
          : `Gemini returned no structured output${finishReason ? ` (${finishReason})` : ""}.`,
    };
  }
  return { ok: true, text };
}

function validateSourceUrl(sourceUrl: string): string | null {
  if (sourceUrl.length > 2_000) return null;
  try {
    const parsed = new URL(sourceUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function extractScrapedText(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const data = isRecord(payload.data) ? payload.data : payload;
  return (
    textValue(data.markdown) ??
    textValue(data.html) ??
    textValue(data.rawHtml) ??
    textValue(data.content)
  );
}

function extractOutputText(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const direct = textValue(payload.output_text);
  if (direct !== null) return direct;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (!isRecord(content)) continue;
      const text = textValue(content.text);
      if (text !== null) return text;
    }
  }
  return null;
}

function parseModelFindings(
  payload: unknown,
  sourceUrl: string,
  provider: ModelProvider,
): Finding[] | null {
  let parsed: unknown = payload;
  if (typeof payload === "string") {
    try {
      parsed = JSON.parse(payload) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.findings)) return null;

  const findings: Finding[] = [];
  for (const raw of parsed.findings.slice(0, 8)) {
    if (!isRecord(raw)) continue;
    const gateKey = textValue(raw.gateKey);
    const summary = textValue(raw.summary);
    const severity = raw.severity;
    if (
      gateKey === null ||
      summary === null ||
      (severity !== "info" && severity !== "warning" && severity !== "blocked")
    ) {
      continue;
    }
    findings.push({
      gateKey: boundedText(gateKey, 80),
      severity,
      summary: boundedText(summary, 480),
      sourceUrl,
      provider,
      humanReviewRequired: true,
    });
  }
  // An empty, well-formed finding list is a valid result: it means the model
  // found no candidate conflict, not that the permit was approved.
  return findings;
}

export const getPermitContext = internalQuery({
  args: { permitId: v.id("permits") },
  returns: permitContextValidator,
  handler: async (ctx, args) => {
    const permit = await ctx.db.get("permits", args.permitId);
    if (permit === null) return null;
    return {
      permitNumber: permit.permitNumber,
      level: permit.level,
      location: permit.location,
      purpose: permit.purpose,
      drawingReference: permit.drawingReference,
      drawingRevision: permit.drawingRevision,
    };
  },
});

/**
 * Records that a pre-screen ran, so the advisory result is durable, visible to
 * every authorized viewer in realtime, and auditable after the fact. The event
 * deliberately restates that the finding does not clear a gate.
 */
export const recordRun = internalMutation({
  args: {
    permitId: v.id("permits"),
    actorSubject: v.string(),
    sourceUrl: v.string(),
    status: v.union(
      v.literal("not_configured"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    findings: v.array(findingValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const permit = await ctx.db.get("permits", args.permitId);
    if (permit === null) return null;

    const actorId = ctx.db.normalizeId("users", args.actorSubject);
    const actor = actorId === null ? null : await ctx.db.get("users", actorId);

    const blocking = args.findings.filter(
      (finding) => finding.severity === "blocked",
    ).length;
    const headline =
      args.status === "completed"
        ? `${args.findings.length} advisory finding${args.findings.length === 1 ? "" : "s"}${blocking > 0 ? `, ${blocking} marked blocking` : ""}`
        : args.status === "not_configured"
          ? "pre-screen providers are not configured"
          : "pre-screen did not complete";

    await ctx.db.insert("auditEvents", {
      projectId: permit.projectId,
      permitId: permit._id,
      eventType: "prescreen_recorded",
      actorName: actor === null ? "AI pre-screen" : `AI pre-screen · run by ${actor.username}`,
      actorUserId: actorId ?? undefined,
      summary: boundedText(
        `Pre-screened ${args.sourceUrl}: ${headline}. Advisory only — no gate was cleared.`,
        260,
      ),
      createdAt: Date.now(),
    });
    return null;
  },
});

export const run = action({
  args: {
    permitId: v.id("permits"),
    sourceUrl: v.string(),
  },
  returns: resultValidator,
  handler: async (ctx, args): Promise<PrescreenResult> => {
    const identity = await requireIdentity(ctx);
    const result = await computePrescreen(ctx, args);
    // Record every outcome, including "not configured" and failures, so the
    // audit trail shows what was attempted rather than only what succeeded.
    await ctx.runMutation(internal.prescreen.recordRun, {
      permitId: args.permitId,
      actorSubject: identity.subject,
      sourceUrl: args.sourceUrl.trim().slice(0, 2_000),
      status: result.status,
      findings: result.findings,
    });
    return result;
  },
});

type PrescreenResult = {
  status: "not_configured" | "completed" | "failed";
  findings: Finding[];
};

export async function computePrescreen(
  ctx: GenericActionCtx<DataModel>,
  args: { permitId: Id<"permits">; sourceUrl: string },
): Promise<PrescreenResult> {
  {
    const sourceUrl = validateSourceUrl(args.sourceUrl.trim());
    if (sourceUrl === null) {
      return {
        status: "failed" as const,
        findings: failedFindings(
          args.sourceUrl.trim().slice(0, 2_000),
          "The source URL must be a valid HTTP or HTTPS URL.",
        ),
      };
    }

    const permit = await ctx.runQuery(internal.prescreen.getPermitContext, {
      permitId: args.permitId,
    });
    if (permit === null) {
      return {
        status: "failed" as const,
        findings: failedFindings(sourceUrl, "The permit could not be found."),
      };
    }

    const firecrawlKey = env.FIRECRAWL_API_KEY;
    const modelProvider = selectModelProvider();
    if (!firecrawlKey || modelProvider === null) {
      return { status: "not_configured" as const, findings: demoFindings(sourceUrl) };
    }

    try {
      const scrapeResponse = await fetchWithTimeout(
        "https://api.firecrawl.dev/v2/scrape",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: sourceUrl,
            formats: ["markdown"],
            onlyMainContent: true,
          }),
        },
        8_000,
      );
      if (!scrapeResponse.ok) {
        return {
          status: "failed" as const,
          findings: failedFindings(
            sourceUrl,
            `Firecrawl could not fetch the source (HTTP ${scrapeResponse.status}).`,
          ),
        };
      }
      const scrapePayload: unknown = await scrapeResponse.json();
      const scrapedText = extractScrapedText(scrapePayload);
      if (scrapedText === null) {
        return {
          status: "failed" as const,
          findings: failedFindings(
            sourceUrl,
            "Firecrawl returned no readable document text.",
          ),
        };
      }

      const prompt = [
        `Permit ${permit.permitNumber} at ${permit.location}, ${permit.level}.`,
        `Purpose: ${permit.purpose}`,
        `Drawing reference: ${permit.drawingReference} ${permit.drawingRevision}.`,
        "Review the source document for conflicts or missing evidence relevant to a concrete penetration permit.",
        "Flag only evidence that requires a human reviewer. Never certify the work or claim that a gate is cleared.",
        "Return concise findings using gate keys current-drawing, gpr-scan, structural-approval, mep-clearance, exclusion-zone, or firestop-system.",
        "Source document:\n" + scrapedText.slice(0, 18_000),
      ].join("\n\n");

      const outcome = await requestFindings(modelProvider, prompt);
      if (!outcome.ok) {
        return {
          status: "failed" as const,
          findings: failedFindings(sourceUrl, outcome.detail),
        };
      }
      const findings = parseModelFindings(outcome.text, sourceUrl, modelProvider);
      if (findings === null) {
        return {
          status: "failed" as const,
          findings: failedFindings(
            sourceUrl,
            "The AI response was not valid structured evidence.",
          ),
        };
      }

      return {
        status: "completed" as const,
        findings: [
          {
            gateKey: "current-drawing",
            severity: "info" as const,
            summary: `Source document fetched by Firecrawl; analyzed by ${modelIdFor(modelProvider)}. Findings remain advisory.`,
            sourceUrl,
            provider: "firecrawl" as const,
            humanReviewRequired: true,
          },
          ...findings,
        ].slice(0, 8),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown provider error";
      return {
        status: "failed" as const,
        findings: failedFindings(
          sourceUrl,
          `Pre-screen providers were unavailable: ${boundedText(message, 180)}.`,
        ),
      };
    }
  }
}
