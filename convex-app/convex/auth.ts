import { setupCore } from "@convex-dev/auth/core/setup";
import { setupUsernamePasskey } from "@convex-dev/auth/providers/passkey/setup";

import { components, internal } from "./_generated/api";
import { env } from "./_generated/server";

const core = setupCore({ component: components.auth });
const siteOrigin = new URL(env.SITE_URL);
export const { signOut, refreshSession, isAuthenticated } = core;

export const { startSignIn, startAutofillSignIn, finishSignUp, finishSignIn } =
  setupUsernamePasskey(core, {
    component: components.authPasskey,
    usernameComponent: components.authUsername,
    rpId: siteOrigin.hostname,
    origin: siteOrigin.origin,
    rpName: "BeforeBore",
  }).attachUserCallbacks({ createUser: internal.users.createUserPasskey });
