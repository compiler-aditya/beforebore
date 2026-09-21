import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, env, internalQuery } from "./_generated/server";
import { requireIdentity } from "./authz";

const severityValidator = v.union(
  v.literal("info"),
  v.literal("warning"),
  v.literal("blocked"),
);

const providerValidator = v.union(
  v.literal("openai"),
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
  provider: "openai" | "firecrawl" | "demo";
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
      provider: "openai",
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

export const run = action({
  args: {
    permitId: v.id("permits"),
    sourceUrl: v.string(),
  },
  returns: resultValidator,
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
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
    const openAiKey = env.OPENAI_API_KEY;
    if (!firecrawlKey || !openAiKey) {
      return { status: "not_configured" as const, findings: demoFindings(sourceUrl) };
    }

    try {
      const scrapeResponse = await fetchWithTimeout(
        "https://api.firecrawl.dev/v1/scrape",
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

      const openAiResponse = await fetchWithTimeout(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openAiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            input: [
              {
                role: "system",
                content:
                  "You are a construction coordination assistant. You identify evidence gaps for human review; you do not approve drilling.",
              },
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
                          gateKey: { type: "string" },
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
      if (!openAiResponse.ok) {
        return {
          status: "failed" as const,
          findings: failedFindings(
            sourceUrl,
            `OpenAI could not analyze the source (HTTP ${openAiResponse.status}).`,
          ),
        };
      }
      const openAiPayload: unknown = await openAiResponse.json();
      const outputText = extractOutputText(openAiPayload);
      const findings = outputText
        ? parseModelFindings(outputText, sourceUrl)
        : null;
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
            summary: "Source document fetched by Firecrawl; findings remain advisory.",
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
  },
});
