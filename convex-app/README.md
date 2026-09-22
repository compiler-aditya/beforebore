# BeforeBore

[Live demo](https://tacit-anaconda-976.convex.site) · [Hackathon build log](../hackathon.md)

BeforeBore is a synthetic construction-penetration coordination workspace. It makes the evidence missing from a proposed concrete cut visible before anyone treats a permit as ready. A queue, floor-map overlay, six evidence gates, coordination inbox, and audit trail show how a team could follow a request from draft through review. The app **does not authorize drilling or cutting**; its green states and gate transitions are demonstrative only.

## Try the demo

1. Open the live app and choose **Explore the read-only sample**. No account is needed to inspect four example permits, their gate states, map locations, and sample inbox replies.
2. Select blocked permit **BB-2049** to see the two outstanding gates. Use search and the map pins to navigate the queue.
3. To exercise the live Convex workflow, sign in with a passkey on a browser/device that supports WebAuthn. The production workspace contains synthetic seeded data. You can create a request and inspect its live audit events. Only the seeded examples allow simulated gate transitions; a newly created permit cannot self-approve.

The shared `ALDER-5` workspace is visible to every registered demo user. Do not upload real drawings, private project information, or actual site instructions. There is no project membership or qualified-reviewer verification yet.

## Architecture

- **Convex:** Indexed projects, permits, evidence gates, inbox messages, and audit events; reactive queries, mutations, actions, and an HTTP webhook endpoint. The frontend is published through the Convex static-hosting component.
- **Authentication:** Convex Auth v2 alpha with username + passkey. The relying-party ID and origin are derived from the deployment's `SITE_URL`; dev and production have separate credentials.
- **Sponsor workflows:** Firecrawl extracts text from a supplied source URL; a structured-output model returns advisory findings — `gpt-4o-mini` when `OPENAI_API_KEY` is set, otherwise `gemini-2.5-flash` when only `GEMINI_API_KEY` is set; AgentMail sends a coordination request and routes a signature-verified webhook reply into the inbox. Every path returns an explicit `not_configured` state when its credentials are absent, and AI findings never clear an evidence gate. Each pre-screen and each outbound request writes an audit event, so the advisory result is durable and shared live rather than held in one browser.
  - Verified live against production: **Firecrawl** (`v2/scrape`), the **model pre-screen** (a live URL yielded seven structured advisory findings), and **AgentMail** outbound (a real request accepted with an upstream message id).
  - Not yet verified: **inbound AgentMail delivery**. The production webhook is registered and its signing secret is stored, but a self-directed probe did not emit AgentMail's inbound event. Verify it with a reply from an external mailbox before presenting it as live.

## Run locally

```sh
cd convex-app
pnpm install
npx convex dev
npm run dev -- -p 62731
```

Configure `.env.local` with `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` for your development deployment. Set `SITE_URL=http://localhost:62731`, `AUTH_PRIVATE_KEY`, and matching `AUTH_JWKS` in that Convex deployment. Never commit signing keys or API keys. A passkey registered for localhost will not work on the hosted domain.

Optional Convex deployment environment variables: `FIRECRAWL_API_KEY`, `OPENAI_API_KEY` or `GEMINI_API_KEY` (plus optional `GEMINI_MODEL`), `AGENTMAIL_API_KEY`, `AGENTMAIL_INBOX_ID`, and `AGENTMAIL_WEBHOOK_SECRET`. The webhook route is `/agentmail/webhook`. `scripts/agentmail-webhook.sh --prod <site-url>` registers an AgentMail `message.received` webhook scoped to the coordination inbox and stores its `whsec_` Svix signing secret without printing it. Re-running the script recognizes an already stored secret. Signature handling passed a synthetic signed/invalid request test; an actual AgentMail delivery remains unverified. The Firecrawl action uses the current v2 scrape endpoint.

## Verify and deploy

```sh
npm run lint
npm run build
node --env-file=.env.local scripts/auth-smoke.mjs
npx convex run diagnostics:sponsorCheck '{}' --prod
```

`diagnostics:sponsorCheck` is an internal action that reports whether this
deployment's credentials actually reach Firecrawl, OpenAI, and AgentMail. It
returns no secret values, and `diagnostics:sendCoordinationProbe` sends one
real reviewer request through the same helper the dashboard uses.

The smoke script is restricted to the two known BeforeBore deployments and creates one synthetic test account with a software WebAuthn authenticator. It checks registration, authenticated reads, and repeat sign-in; it does not exercise an OS passkey prompt. To seed an empty known deployment during the smoke test, set `AUTH_SMOKE_SEED=1`. Anonymous Convex project queries reject with `UNAUTHENTICATED`.

For this project's production deployment, set `SITE_URL` to the hosted `https://*.convex.site` origin, configure separate production signing keys, then publish:

```sh
npx convex deploy --yes
npx @convex-dev/static-hosting upload --build --prod --dist out
```

`--build` supplies the production Convex URL to the Next.js static export. Production passkey registration, authenticated queries, repeat sign-in, the hosted page, assets, and the auth JWKS endpoint were verified on September 22, 2026. Firecrawl, the configured model pre-screen, and AgentMail outbound were also verified live; only a provider-delivered inbound reply remains pending.
