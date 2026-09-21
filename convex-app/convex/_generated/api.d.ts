/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentmail from "../agentmail.js";
import type * as auth from "../auth.js";
import type * as authz from "../authz.js";
import type * as coordination from "../coordination.js";
import type * as dashboard from "../dashboard.js";
import type * as demo from "../demo.js";
import type * as http from "../http.js";
import type * as model from "../model.js";
import type * as permits from "../permits.js";
import type * as prescreen from "../prescreen.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentmail: typeof agentmail;
  auth: typeof auth;
  authz: typeof authz;
  coordination: typeof coordination;
  dashboard: typeof dashboard;
  demo: typeof demo;
  http: typeof http;
  model: typeof model;
  permits: typeof permits;
  prescreen: typeof prescreen;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  auth: import("@convex-dev/auth/core/_generated/component.js").ComponentApi<"auth">;
  authPasskey: import("@convex-dev/auth/providers/passkey/_generated/component.js").ComponentApi<"authPasskey">;
  authUsername: import("@convex-dev/auth/username/_generated/component.js").ComponentApi<"authUsername">;
};
