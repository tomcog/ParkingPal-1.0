import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { Card, CardContent } from "./ui/card";
import { ButtonStandard } from "./button-standard";
import { IconSignIn } from "./icon-signin";
import { loadPermits, savePermitsAndSync } from "./permits-storage";

const MAX_PERMITS = 3;

export function SettingsPage() {
  const navigate = useNavigate();
  const { user, loading, signInWithPassword, signUp, signOut, updatePassword, isConfigured } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

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

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setPasswordLoading(true);
    const { error } = await updatePassword(newPassword);
    setPasswordLoading(false);
    if (error) {
      setPasswordError(error.message);
    } else {
      setPasswordSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex items-center justify-center size-10 rounded-[4px] text-[#155dfc] hover:bg-[#155dfc]/10 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" strokeWidth={2} />
        </button>
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>

      {isConfigured && (
        <div className="rounded-[4px] border border-[#e5e7eb] bg-card text-card-foreground flex flex-col gap-6 p-4">
          <h2 className="font-medium text-[#0a0a0a]">Account</h2>
          {loading ? (
            <p className="text-sm text-[#717182]">Loading…</p>
          ) : user ? (
            <div className="space-y-4">
              <p className="text-sm text-[#717182] break-all">
                Signed in as <strong className="text-[#0a0a0a]">{user.email}</strong>
              </p>

              <form onSubmit={handleChangePassword} className="space-y-3 border-t border-[#e5e7eb] pt-4">
                <h3 className="text-sm font-medium text-[#0a0a0a]">Change password</h3>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm text-[#0a0a0a] placeholder:text-[#9ca3af]"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm text-[#0a0a0a] placeholder:text-[#9ca3af]"
                />
                {passwordError && (
                  <p className="text-sm text-red-600">{passwordError}</p>
                )}
                {passwordSuccess && (
                  <p className="text-sm text-[#16a34a]">Password updated.</p>
                )}
                <ButtonStandard
                  type="submit"
                  icon={null}
                  disabled={passwordLoading || !newPassword || !confirmPassword}
                >
                  {passwordLoading ? "Updating…" : "Update password"}
                </ButtonStandard>
              </form>

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
                <ButtonStandard
                  type="submit"
                  icon={<IconSignIn className="w-5 h-5 text-white shrink-0" />}
                  disabled={authLoading}
                >
                  {authLoading ? "…" : isSignUp ? "Sign up" : "Sign in"}
                </ButtonStandard>
                <button
                  type="button"
                  onClick={() => setIsSignUp((s) => !s)}
                  className="text-sm text-[#717182] hover:opacity-90"
                >
                  {isSignUp ? (
                    <>Already have an account? <span className="text-[#155dfc]">Sign in</span></>
                  ) : (
                    <>No account? <span className="text-[#155dfc]">Sign up</span></>
                  )}
                </button>
              </div>
             
            </form>
          )}
        </div>
      )}

      {!isConfigured && (
        <p className="text-sm text-[#717182]">
          Add <code className="bg-[#f3f4f6] px-1 rounded">VITE_SUPABASE_URL</code> and{" "}
          <code className="bg-[#f3f4f6] px-1 rounded">VITE_SUPABASE_ANON_KEY</code> to your{" "}
          <code className="bg-[#f3f4f6] px-1 rounded">.env</code> to enable account sync.
        </p>
      )}

      <Card className="rounded-xl border-[#e5e7eb]">
        <CardContent className="p-4 space-y-3">
          <h2 className="font-medium text-[#0a0a0a]">Parking permits</h2>
          <p className="text-xs text-[#717182]">
            Add up to 3 permit names or numbers. Permits sync across devices when you’re signed in.
          </p>
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

    </div>
  );
}
