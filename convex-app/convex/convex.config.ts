import { defineApp } from "convex/server";
import { v } from "convex/values";
import auth from "@convex-dev/auth/core/convex.config.js";
import passkey from "@convex-dev/auth/providers/passkey/convex.config.js";
import username from "@convex-dev/auth/username/convex.config.js";
import staticHosting from "@convex-dev/static-hosting/convex.config";

// These are optional so the demo stays useful without credentials. Configure
// them in the Convex deployment environment when enabling live integrations.
const app = defineApp({
  env: {
    AUTH_PRIVATE_KEY: v.string(),
    AUTH_JWKS: v.string(),
    SITE_URL: v.string(),
    OPENAI_API_KEY: v.optional(v.string()),
    FIRECRAWL_API_KEY: v.optional(v.string()),
    AGENTMAIL_API_KEY: v.optional(v.string()),
    AGENTMAIL_INBOX_ID: v.optional(v.string()),
    AGENTMAIL_WEBHOOK_SECRET: v.optional(v.string()),
  },
});

app.use(auth, {
  httpPrefix: "/auth",
  env: {
    AUTH_PRIVATE_KEY: app.env.AUTH_PRIVATE_KEY,
    AUTH_JWKS: app.env.AUTH_JWKS,
  },
});
app.use(passkey);
app.use(username);
app.use(staticHosting);

export default app;
