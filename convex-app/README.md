# BeforeBore

A synthetic construction-penetration coordination demo built with Next.js and Convex. Evidence gates, an audit trail, optional AI pre-screening, and a coordination inbox illustrate a workflow; they do **not** grant permission to cut or drill concrete.

## Local development

The frontend is currently configured for `http://localhost:62731/`. Start the existing Convex dev deployment and app:

```sh
npx convex dev
npm run dev -- -p 62731
```

The `.env.local` file needs `NEXT_PUBLIC_CONVEX_URL` and `CONVEX_DEPLOYMENT` from your Convex development setup. The Convex deployment needs `AUTH_PRIVATE_KEY` (base64-encoded PKCS8 PEM) and `AUTH_JWKS` (matching RS256 public JWKS); never commit either. The `convex/auth.config.ts` issuer is the deployment's `CONVEX_SITE_URL`. The optional `SITE_URL` variable is set to `http://localhost:62731` for this development deployment.

Open the page in a browser with WebAuthn/passkey support, such as Chrome or Safari. Enter a new username to register a device passkey, or an existing username to sign in. The Codex in-app browser used for development does not currently expose WebAuthn; use a compatible browser for a personal-device sign-in.

The passkey relying-party ID and exact origin are configured in `convex/auth.ts`. Before hosting on another domain or port, update both to match the HTTPS production origin, configure that deployment's auth signing keys, and push Convex functions there. Passkeys registered for `localhost` will not work on another domain. This uses the pinned `@convex-dev/auth` v2 alpha API; review its stability before production use.

## Access model

Every public project query and mutation requires a signed-in Convex user. Permit creation derives the requester name from that account. The current `ALDER-5` workspace is a **shared synthetic demo** visible to any account that signs up; there is no invitation flow, project membership, role verification, or real reviewer approval yet. Do not place actual site drawings or confidential project data in it.

## Checks

```sh
npm run build
npm run lint
node --env-file=.env.local scripts/auth-smoke.mjs
```

The smoke test is restricted to this project's development deployment. It creates a synthetic account with an in-memory software authenticator, checks authorized reads, and performs a second cryptographically verified sign-in. It does not test an OS passkey prompt. Anonymous access can be checked with `npx convex run dashboard:get '{"projectCode":"ALDER-5"}'`, which should return `UNAUTHENTICATED`.
