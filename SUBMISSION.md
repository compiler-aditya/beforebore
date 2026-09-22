# BeforeBore — submission kit

- **Live app:** https://tacit-anaconda-976.convex.site
- **Public repo:** https://github.com/compiler-aditya/beforebore
- **Build log:** https://github.com/compiler-aditya/beforebore/blob/main/hackathon.md
- **Category:** Construction coordination / site safety workflow

## Short description

BeforeBore makes the evidence behind a proposed concrete cut visible before work starts. A synthetic site team can track penetration requests against drawings, GPR scans, structural and MEP clearances, exclusion zones, and firestop systems in one live Convex workspace. The read-only sample is public; passkey sign-in unlocks the live demo. It is an evidence-coordination concept, **not** a construction authorization system.

## Why it matters

A permit can look complete while one critical clearance is buried in an email thread or refers to an old drawing. BeforeBore puts six evidence gates beside each request, maps its location, and records changes and coordination replies in an audit trail. A missing firestop selection or unresolved services clearance stays prominent. AI pre-screening is advisory and cannot mark a gate approved.

## Under-three-minute demo outline

1. **0:00–0:25 — The problem.** Open the public sample. State that concrete penetrations need current drawings, scan evidence, and multiple discipline clearances; scattered evidence makes gaps easy to miss.
2. **0:25–1:05 — Find the gap.** Select `BB-2049`. Show the blocked state, six gates, missing MEP plumbing clearance and firestop system, then jump to the matching map pin.
3. **1:05–1:35 — Follow coordination.** Show the synthetic inbox and audit-trail area. Explain that public sample data is read-only and live event history is behind passkey sign-in.
4. **1:35–2:20 — Live Convex.** Sign in on a WebAuthn-capable browser. Create a synthetic permit and show it appearing with six outstanding gates. Show that a new permit cannot self-approve; only seeded examples support clearly labelled simulation.
5. **2:20–2:50 — Sponsor workflow and safety.** Send a real coordination request; Firecrawl and AgentMail are live on production. Show the OpenAI pre-screen only once `OPENAI_API_KEY` is set and `diagnostics:sponsorCheck` reports it healthy — otherwise say plainly that it is wired but unproven. Finish with the safety boundary: no AI result and no demo status grants permission to cut.

## Before submitting

- [x] Public GitHub repository, root `hackathon.md`, and public `convex.site` app.
- [x] Guest-accessible sample; production passkey and Convex data round trip verified.
- [x] Firecrawl live on production (`v2/scrape` verified).
- [x] AgentMail live outbound on production (real reviewer request accepted, upstream message id returned).
- [ ] Set `OPENAI_API_KEY` on production, then re-run `npx convex run diagnostics:sponsorCheck '{}' --prod`.
- [ ] Register inbound replies: `./scripts/agentmail-webhook.sh --prod https://tacit-anaconda-976.convex.site`, then reply to a `[BB-####]` thread and confirm it appears in the site inbox.
- [ ] Re-upload the production frontend: `cd convex-app && npm run deploy`. The backend is current; the published static bundle predates the audit-trail and status-message fixes.
- [ ] Record and link an actual video under three minutes. A script is not a video.
- [ ] Share the build publicly and tag the hackathon accounts if desired.
- [ ] Submit the repo, app, and video through the hackathon form before September 22, 2026, 12:00 PM PT. Submission has **not** been filed.

See the [official event page](https://www.convex.dev/hackathons/all-gas) for the current submission form and rules.

## Operator checks

Run these against the deployment that backs the public app before recording:

```bash
cd convex-app
npx convex run diagnostics:sponsorCheck '{}' --prod          # Firecrawl / OpenAI / AgentMail reachability
npx convex run diagnostics:sendCoordinationProbe '{}' --prod # one real AgentMail send
./scripts/agentmail-webhook.sh --prod https://tacit-anaconda-976.convex.site
```

`sponsorCheck` and `sendCoordinationProbe` are internal actions, so they are not
reachable from the public app. Neither returns a secret value.
