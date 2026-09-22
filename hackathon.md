# Hackathon log

- **Project:** BeforeBore
- **Event:** Convex All Gas Hackathon
- **What it does:** Demonstrates evidence-gated coordination for concrete drilling and cutting requests without granting permission to perform site work.
- **Live app:** https://tacit-anaconda-976.convex.site
- **Repo:** https://github.com/compiler-aditya/beforebore
- **Frontend:** Convex static hosting
- **Convex deployment:** https://tacit-anaconda-976.convex.cloud
- **Components:** @convex-dev/auth, @convex-dev/static-hosting
- **Convex features:** schema, indexes, queries, mutations, actions, HTTP actions, realtime queries
- **Auth:** Convex Auth
- **AI models:** gpt-4o-mini via `OPENAI_API_KEY`, otherwise gemini-2.5-flash via `GEMINI_API_KEY` (verified live on production)
- **Started:** 2026-09-21T14:06:36Z
- **Last updated:** 2026-09-22T07:55:00Z

## Log

### 2026-09-21 - 4e9dba9
Built the synthetic control room and live Convex data model: indexed projects,
permits, six evidence gates, inbox replies, and audit events. Added passkey
sign-in with Convex Auth, authenticated queries and mutations, idempotent permit
creation, demo seeding, and simulation restricted to seeded requests. The UI
shows the queue, map, gate details, and audit trail. Dev tests covered passkey
registration, repeat sign-in, authorized reads, and rejection of a simulated
transition on a newly created permit (`convex-app/convex/schema.ts`,
`convex-app/convex/auth.ts`, `convex-app/convex/permits.ts`,
`convex-app/components/BeforeBoreDashboard.tsx`).

Wired optional Firecrawl source extraction, OpenAI structured advisory findings,
and AgentMail coordination requests plus a protected reply endpoint. Missing
credentials return an explicit not-configured result, and no AI result clears
a gate. Live sponsor-account round trips have not been verified
(`convex-app/convex/prescreen.ts`, `convex-app/convex/coordination.ts`,
`convex-app/convex/http.ts`).

### 2026-09-22 - 57972a2
Added Convex static hosting and deployment-specific passkey origin configuration,
then published the guest-accessible sample at the live app URL. The production
backend and site were deployed; the public page, static assets, auth JWKS,
passkey registration, authorized project query, and repeat sign-in passed
verification. Seeded four synthetic permits in production. The guest sample is
read-only; live actions require sign-in (`convex-app/convex/convex.config.ts`,
`convex-app/convex/http.ts`, `convex-app/convex/auth.ts`,
`convex-app/components/PasskeySignIn.tsx`,
`convex-app/scripts/auth-smoke.mjs`).

### 2026-09-22 - 852c1f1
Updated Firecrawl extraction to its documented v2 scrape endpoint and replaced
the AgentMail receiver's plain-header check with Svix signature verification.
A synthetic signed webhook without a permit number returned the expected ignored
result, while a tampered signature returned unauthorized. No live provider
round trip is claimed (`convex-app/convex/prescreen.ts`,
`convex-app/convex/http.ts`).

### 2026-09-22 - dffaf10

Added an operator-only connectivity check and moved the AgentMail send onto a
shared helper so the check exercises the same code path as the signed-in
dashboard (`convex/diagnostics.ts`, `convex/coordination.ts`).

Verified against the production deployment:

- **Firecrawl** — live. `POST https://api.firecrawl.dev/v2/scrape` returned
  167 markdown characters for a control URL.
- **AgentMail** — live outbound. The coordination inbox is configured as
  `AGENTMAIL_INBOX_ID`, and a real reviewer request was accepted with an
  upstream message id.
- **OpenAI** — still unconfigured. `OPENAI_API_KEY` is not set on either
  deployment, so `prescreen.run` continues to return `not_configured` rather
  than a fabricated result.

Inbound replies are not live yet. `scripts/agentmail-webhook.sh` registers the
`message.received` webhook against `/agentmail/webhook`, scoped to the single
coordination inbox, and stores the signing secret as
`AGENTMAIL_WEBHOOK_SECRET` without printing it. It has not been run.

### 2026-09-22 - 6561ab0

Pre-screen results and reviewer requests were previously client-only: a finding
disappeared on refresh and a second viewer never saw it. Both now write an
audit event inside the same transaction path, so the advisory result and the
outbound request are durable, shared live with every authorized viewer, and
attributable to the signed-in user (`convex/prescreen.ts`,
`convex/coordination.ts`, `convex/model.ts`).

Every pre-screen outcome is recorded, including `not_configured` and failures,
so the trail shows what was attempted rather than only what succeeded. Each
summary restates the boundary: an advisory finding clears no gate, and a
request is not an approval.

Fixed a dashboard defect where a *successful* AgentMail send was rendered in
the red error region, and replaced raw status strings in the pre-screen
readout with readable labels (`components/BeforeBoreDashboard.tsx`).

Verified on the dev deployment: both new event types insert and read back with
the expected actor, type, and summary. Type-check and lint are clean.

### 2026-09-22 - 8e47e01

Made the pre-screen model provider swappable. `selectModelProvider` prefers
OpenAI when `OPENAI_API_KEY` is present and falls back to Gemini when only
`GEMINI_API_KEY` is set, so an OpenAI key can be added later without a code
change. Both branches are pinned to structured output against the same JSON
contract — OpenAI through `json_schema`, Gemini through `responseSchema` — so
the parser and the gate-key enum are shared rather than duplicated per
provider. Findings record which model produced them
(`convex/prescreen.ts`, `convex/convex.config.ts`, `convex/diagnostics.ts`).

The connectivity check now reports one `model` provider rather than assuming
OpenAI, and says plainly when neither key is set. Verified on the dev
deployment: Firecrawl and AgentMail pass; the model check correctly reports
that no model key is configured.

### 2026-09-22 - d464ebb

The Gemini pre-screen returned no findings against a real document while
succeeding on a short test prompt. Gemini 2.5 spends `maxOutputTokens` on
thinking tokens before emitting any JSON, so an 18,000-character scraped
document exhausted the 1,000-token budget and the candidate came back empty
with `finishReason: MAX_TOKENS`. Capped thinking at 512 tokens, raised the
output budget to 4,096, and made the empty-candidate path report the finish
reason instead of the generic "not valid structured evidence"
(`convex/prescreen.ts`).

Added `diagnostics:prescreenProbe`, which runs the real Firecrawl-to-model
function the dashboard calls, so the whole chain can be proven without signing
in. Verified on the dev deployment: a live URL produced seven structured
findings across six valid gate keys, each attributed to the model that
produced it and each marked advisory. No gate was cleared.

Production still holds a placeholder `GEMINI_API_KEY` and reports HTTP 400;
only the dev deployment has a working key.

### 2026-09-22 - 2dd3941

Production rejected its model key while dev worked. The connectivity check now
describes a rejected key by length and leading characters only, never its
value, which identified the stored string immediately as a pasted placeholder
rather than a revoked or restricted key (`convex/diagnostics.ts`).

Full chain verified on the production deployment: Firecrawl fetched a live
document, gemini-2.5-flash returned seven structured findings across six valid
gate keys, each attributed to the model that produced it and each marked
advisory. No gate was cleared. Firecrawl, the model pre-screen, and AgentMail
outbound now all pass against production.

Inbound AgentMail replies remain the one unproven leg.

### 2026-09-22 - PLACEHOLDER

Published the current frontend to the production `convex.site` host, then hit
a CDN failure worth recording. Convex static hosting caches a miss with
`max-age=14400`, so chunk URLs that were requested *before* their upload kept
returning 404 at that edge for four hours after the files existed. Three of
them were load-bearing and the published app hung at "Restoring session…"
while every file was present and fetchable with a cache-busting query.

Fixed by setting Next's `deploymentId`, which stamps a per-deploy id onto every
asset URL. Each publish therefore uses a fresh cache key and a poisoned miss
can no longer outlive a deploy (`convex-app/next.config.ts`).

Verified on production: the page loads with every asset returning 200, and the
served dashboard bundle contains the current status-message and pre-screen
labels.
