import { useState, useEffect } from "react";
import { useAuth } from "../lib/auth-context";
import { Card, CardContent } from "./ui/card";
import { loadPermits, savePermitsAndSync } from "./permits-storage";

const MAX_PERMITS = 3;

export function SettingsPage() {
  const { user, loading, signInWithPassword, signUp, signOut, isConfigured } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const [permits, setPermits] = useState<string[]>(() => {
    const loaded = loadPermits();
    return Array.from({ length: MAX_PERMITS }, (_, i) => loaded[i] ?? "");
  });

  useEffect(() => {
    const loaded = loadPermits();
    setPermits(Array.from({ length: MAX_PERMITS }, (_, i) => loaded[i] ?? ""));
  }, []);

  useEffect(() => {
    const onHydrated = () => {
      const loaded = loadPermits();
      setPermits(Array.from({ length: MAX_PERMITS }, (_, i) => loaded[i] ?? ""));
    };
    window.addEventListener("permits-hydrated", onHydrated);
    return () => window.removeEventListener("permits-hydrated", onHydrated);
  }, []);

  const handlePermitChange = (index: number, value: string) => {
    const next = [...permits];
    next[index] = value;
    setPermits(next);
    savePermitsAndSync(next.filter(Boolean));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    const fn = isSignUp ? signUp : signInWithPassword;
    const { error } = await fn(email, password);
    setAuthLoading(false);
    if (error) setAuthError(error.message);
    else if (isSignUp) setAuthError(null);
  };

  const handleSignOut = async () => {
    setAuthError(null);
    await signOut();
  };

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      {isConfigured && (
        <Card className="border-[#e5e7eb]">
          <CardContent className="p-4 space-y-4">
            <h2 className="font-medium text-[#0a0a0a]">Account</h2>
            {loading ? (
              <p className="text-sm text-[#717182]">Loading…</p>
            ) : user ? (
              <div className="space-y-3">
                <p className="text-sm text-[#717182] break-all">
                  Signed in as <strong className="text-[#0a0a0a]">{user.email}</strong>
                </p>
                <p className="text-xs text-[#717182]">
                  Your parking status syncs across devices when you’re signed in.
                </p>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-sm font-medium text-[#155dfc] hover:underline"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  required
                  className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm text-[#0a0a0a] placeholder:text-[#9ca3af]"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm text-[#0a0a0a] placeholder:text-[#9ca3af]"
                />
                {authError && (
                  <p className="text-sm text-red-600">{authError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="rounded-lg bg-[#155dfc] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {authLoading ? "…" : isSignUp ? "Sign up" : "Sign in"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSignUp((s) => !s)}
                    className="text-sm text-[#717182] hover:text-[#155dfc]"
                  >
                    {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
                  </button>
                </div>
                <p className="text-xs text-[#717182]">
                  Sign in to sync your parked car and timer across devices.
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {!isConfigured && (
        <p className="text-sm text-[#717182]">
          Add <code className="bg-[#f3f4f6] px-1 rounded">VITE_SUPABASE_URL</code> and{" "}
          <code className="bg-[#f3f4f6] px-1 rounded">VITE_SUPABASE_ANON_KEY</code> to your{" "}
          <code className="bg-[#f3f4f6] px-1 rounded">.env</code> to enable account sync.
        </p>
      )}

      <Card className="border-[#e5e7eb]">
        <CardContent className="p-4 space-y-3">
          <h2 className="font-medium text-[#0a0a0a]">Parking permits</h2>
          <p className="text-xs text-[#717182]">
            Add up to 3 permit names or numbers (e.g. 1E, Zone A). When you scan a sign, we’ll check if a permit is required and if you have one. Permits sync across devices when you’re signed in.
          </p>
          {isConfigured && user && (
            <p className="text-xs text-[#717182]">
              To sync permits, run <code className="bg-[#f3f4f6] px-1 rounded">supabase-schema.sql</code> in your Supabase project’s SQL Editor (Dashboard → SQL Editor) if you haven’t already.
            </p>
          )}
          {permits.map((value, i) => (
            <input
              key={i}
              type="text"
              value={value}
              onChange={(e) => handlePermitChange(i, e.target.value)}
              onBlur={() => savePermitsAndSync(permits.filter(Boolean))}
              placeholder={`Permit ${i + 1}`}
              maxLength={32}
              className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm text-[#0a0a0a] placeholder:text-[#9ca3af]"
            />
          ))}
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-sm">
        App preferences and dev mode.
      </p>
    </div>
  );
}
