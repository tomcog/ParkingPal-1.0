import { useState, useEffect, type ReactNode } from "react";
import { useAuth } from "../lib/auth-context";
import { Card, CardContent } from "./ui/card";
import { Loader2 } from "lucide-react";

const SKIP_SIGNIN_KEY = "parkingpal_skip_signin";

function getSkipSignIn(): boolean {
  try {
    return sessionStorage.getItem(SKIP_SIGNIN_KEY) === "1";
  } catch {
    return false;
  }
}

function setSkipSignInStorage() {
  try {
    sessionStorage.setItem(SKIP_SIGNIN_KEY, "1");
  } catch {}
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading, signInWithPassword, signUp, isConfigured } = useAuth();
  const [skipSignIn, setSkipSignIn] = useState(false);

  useEffect(() => {
    setSkipSignIn(getSkipSignIn());
  }, []);

  const showGate =
    isConfigured && !loading && !user && !skipSignIn;
  const showLoading = isConfigured && loading && !skipSignIn;

  const handleUseWithoutSignIn = () => {
    setSkipSignInStorage();
    setSkipSignIn(true);
  };

  if (showLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
        <p className="flex items-center gap-2 text-sm text-[#717182]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </p>
      </div>
    );
  }

  if (!showGate) {
    return <>{children}</>;
  }

  return <SignInScreen onSignIn={signInWithPassword} onSignUp={signUp} onSkip={handleUseWithoutSignIn} />;
}

function SignInScreen({
  onSignIn,
  onSignUp,
  onSkip,
}: {
  onSignIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  onSignUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  onSkip: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    const fn = isSignUp ? onSignUp : onSignIn;
    const { error } = await fn(email, password);
    setAuthLoading(false);
    if (error) setAuthError(error.message);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f5f7]">
      {/* Top branding — aligns with Figma ParkingPal1.0 sign-in */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-[360px] space-y-8">
          <div className="flex flex-col items-center gap-4">
            <img src="/pplogo.svg" alt="ParkingPal" className="h-10" />
            <p className="text-center text-sm text-[#717182]">
              Sign in to sync your parking status and permits
            </p>
          </div>

          <Card className="border-[#e5e7eb] bg-white shadow-sm">
            <CardContent className="p-5 space-y-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="auth-email" className="sr-only">
                    Email
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    required
                    autoComplete="email"
                    className="w-full rounded-[8px] border border-[#e5e7eb] bg-white px-4 py-3 text-[15px] text-[#0a0a0a] placeholder:text-[#9ca3af] focus:border-[#155dfc] focus:outline-none focus:ring-1 focus:ring-[#155dfc]"
                  />
                </div>
                <div>
                  <label htmlFor="auth-password" className="sr-only">
                    Password
                  </label>
                  <input
                    id="auth-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    required
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    className="w-full rounded-[8px] border border-[#e5e7eb] bg-white px-4 py-3 text-[15px] text-[#0a0a0a] placeholder:text-[#9ca3af] focus:border-[#155dfc] focus:outline-none focus:ring-1 focus:ring-[#155dfc]"
                  />
                </div>
                {authError && (
                  <p className="text-sm text-[#dc2626]" role="alert">
                    {authError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={authLoading}
                  className="group relative flex h-[54px] w-full cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-[4px] bg-[#155dfc] pb-2 pt-1 font-semibold text-base text-white shadow-[inset_0px_-6px_0px_0px_#042f8c] hover:bg-[#0f46bf] active:bg-[#0f46bf] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {authLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  ) : null}
                  <span>{authLoading ? "Signing in…" : isSignUp ? "Sign up" : "Sign in"}</span>
                </button>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setIsSignUp((s) => !s)}
                    className="text-sm font-medium text-[#155dfc] hover:underline"
                  >
                    {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>

          <button
            type="button"
            onClick={onSkip}
            className="w-full rounded-[8px] border border-[#e5e7eb] bg-white py-3 text-sm font-medium text-[#717182] hover:bg-[#f9fafb] active:bg-[#f3f4f6]"
          >
            Use without signing in
          </button>
        </div>
      </div>
    </div>
  );
}
