import { setupCore } from "@convex-dev/auth/core/setup";
import { setupUsernamePasskey } from "@convex-dev/auth/providers/passkey/setup";

import { components, internal } from "./_generated/api";

const core = setupCore({ component: components.auth });
export const { signOut, refreshSession, isAuthenticated } = core;

export const { startSignIn, startAutofillSignIn, finishSignUp, finishSignIn } =
  setupUsernamePasskey(core, {
    component: components.authPasskey,
    usernameComponent: components.authUsername,
    rpId: "localhost",
    origin: "http://localhost:62731",
    rpName: "BeforeBore",
  }).attachUserCallbacks({ createUser: internal.users.createUserPasskey });
