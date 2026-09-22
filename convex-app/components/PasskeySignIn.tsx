"use client";

import { type FormEvent, useState } from "react";
import { useUsernamePasskeySignIn } from "@convex-dev/auth/providers/passkey/react";
import { Drill, Fingerprint, Loader2, ShieldCheck } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";

export function PasskeySignIn({ onExploreDemo }: { onExploreDemo?: () => void }) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { signIn, pending } = useUsernamePasskeySignIn({
    startSignIn: api.auth.startSignIn,
    startAutofillSignIn: api.auth.startAutofillSignIn,
    finishSignIn: api.auth.finishSignIn,
    finishSignUp: api.auth.finishSignUp,
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (typeof window.PublicKeyCredential === "undefined") {
      setError(`This browser does not support passkeys. Open ${window.location.origin} in Chrome or Safari to sign in.`);
      return;
    }
    try {
      const result = await signIn({ username: username.trim() });
      if (result.status === "error") {
        setError(`Passkey sign-in failed: ${result.userError.error}. Please try again.`);
      }
    } catch {
      setError("Could not complete passkey sign-in. Check your connection and try again.");
    }
  }

  return (
    <main className="bb-theme-scope flex min-h-screen items-center justify-center bg-[#0c0e12] px-4 py-10 text-white">
      <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-[#15181d] p-7 shadow-2xl sm:p-9">
        <div className="mb-8 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-400 text-zinc-950"><Drill className="h-6 w-6" /></span>
            <div><p className="text-lg font-bold">BeforeBore</p><p className="text-xs text-zinc-500">Construction evidence control room</p></div>
          </div>
          <ThemeToggle />
        </div>
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-400/10 text-amber-300"><Fingerprint /></div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in with a passkey</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">Enter your username. If it’s new, your device will create a passkey; otherwise it will ask you to use the existing one.</p>
        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" name="username" autoComplete="username webauthn" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={64} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Your username" className="h-11 border-zinc-700 bg-zinc-900 text-white" />
          </div>
          {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p>}
          <Button type="submit" disabled={pending} className="h-11 w-full bg-amber-400 font-bold text-zinc-950 hover:bg-amber-300">
            {pending ? <Loader2 className="animate-spin" /> : <Fingerprint />} {pending ? "Waiting for passkey…" : "Continue with passkey"}
          </Button>
        </form>
        {onExploreDemo && <Button type="button" variant="outline" onClick={onExploreDemo} className="mt-3 h-11 w-full border-zinc-600 bg-transparent text-zinc-200 hover:bg-zinc-800 hover:text-white">Explore the read-only sample</Button>}
        <div className="mt-7 flex gap-2 border-t border-zinc-800 pt-5 text-xs leading-5 text-zinc-500"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" /><span>This is a synthetic demo, not authorization to perform construction work.</span></div>
      </div>
    </main>
  );
}
