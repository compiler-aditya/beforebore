"use client";

import { ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ThemeProvider } from "next-themes";

import { api } from "@/convex/_generated/api";

const convex = new ConvexReactClient(
  // Fall back to a placeholder absolute URL so `next build` static prerender
  // (e.g. /_not-found) doesn't throw "Provided address was not an absolute
  // URL" when NEXT_PUBLIC_CONVEX_URL is unset at build time. The real URL is
  // present at runtime in the browser.
  process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://placeholder.convex.cloud",
);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <ConvexAuthProvider
        client={convex}
        api={{ refreshSession: api.auth.refreshSession, signOut: api.auth.signOut }}
      >
        {children}
      </ConvexAuthProvider>
    </ThemeProvider>
  );
}
