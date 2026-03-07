import { useState, useEffect, type ReactNode } from "react";
import { useAuth } from "../lib/auth-context";
import { ButtonStandard } from "./button-standard";
import { IconSignIn } from "./icon-signin";
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
  const [skipSignIn, setSkipSignIn] = useState(getSkipSignIn);

  useEffect(() => {
    setSkipSignIn(getSkipSignIn());
  }, []);

  const showGate =
    isConfigured && !loading && !user && !skipSignIn;
  const showLoading = isConfigured && loading && !skipSignIn;

  const handleUseWithoutSignIn = () => {
    setSkipSignInStorage();
    setSkipSignIn(true);
    window.location.replace("/");
  };

  if (showLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#ebf4ff]">
        <p className="flex items-center gap-2 text-base text-[#717182]">
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
    <div className="flex min-h-screen flex-col bg-[#ebf4ff]">
      <div className="flex flex-1 flex-col items-center px-6 pt-[124px] pb-12">
        <div className="w-full max-w-[360px] flex flex-col items-start gap-8">
          <div className="flex flex-col items-center gap-4 w-full">
            <img src="/pplogo.svg" alt="ParkingPal" className="h-[74px] w-auto object-contain" />
            <p className="text-center text-[16px] leading-5 text-[#717182]">
              Sign in to sync your parking status and permits
            </p>
          </div>

          <div className="w-full rounded-[12px] bg-[#ccdcff] p-5 flex flex-col gap-4">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
                  className="w-full h-12 rounded-[4px] border-0 bg-white px-4 py-3 text-[18px] text-[#2b2b2b] placeholder:text-[#888] focus:outline-none focus:ring-2 focus:ring-[#155dfc] focus:ring-inset"
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
                  className="w-full h-12 rounded-[4px] border-0 bg-white px-4 py-3 text-[18px] text-[#2b2b2b] placeholder:text-[#888] focus:outline-none focus:ring-2 focus:ring-[#155dfc] focus:ring-inset"
                />
              </div>
              {authError && (
                <p className="text-sm text-[#dc2626]" role="alert">
                  {authError}
                </p>
              )}
              <ButtonStandard
                type="submit"
                disabled={authLoading}
                icon={
                  authLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  ) : (
                    <IconSignIn className="w-5 h-5 text-white shrink-0" />
                  )
                }
              >
                {authLoading ? "Signing in…" : isSignUp ? "Sign up" : "Sign in"}
              </ButtonStandard>
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setIsSignUp((s) => !s)}
                  className="text-[16px] font-medium leading-5 text-[#155dfc] hover:underline"
                >
                  {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
                </button>
              </div>
            </form>
          </div>

          <button
            type="button"
            onClick={onSkip}
            className="w-full py-3 text-[16px] font-medium leading-5 text-[#155dfc] hover:underline active:opacity-80"
          >
            Use without signing in
          </button>
        </div>
      </div>
    </div>
  );
}
