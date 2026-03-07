import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./supabase";
import { setParkingSync, hydrateParkingFromSync } from "../components/parking-storage";
import { setPermitsSync, hydratePermitsFromSync } from "../components/permits-storage";
import {
  fetchParkingForUser,
  upsertParkingForUser,
  deleteParkingForUser,
} from "./parking-sync";
import { fetchPermitsForUser, upsertPermitsForUser } from "./permits-sync";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  isConfigured: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.id || !isSupabaseConfigured()) {
      setParkingSync(null);
      setPermitsSync(null);
      return;
    }
    const uid = user.id;
    setParkingSync({
      load: () => fetchParkingForUser(uid),
      save: (loc) => upsertParkingForUser(uid, loc),
      clear: () => deleteParkingForUser(uid),
    });
    setPermitsSync({
      load: () => fetchPermitsForUser(uid),
      save: (permits) => upsertPermitsForUser(uid, permits),
    });
    hydrateParkingFromSync().then(() => {
      window.dispatchEvent(new Event("parking-hydrated"));
    });
    hydratePermitsFromSync();
  }, [user?.id]);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return { error: new Error("Supabase not configured") };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error ?? null };
    },
    []
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return { error: new Error("Supabase not configured") };
      const { error } = await supabase.auth.signUp({ email, password });
      return { error: error ?? null };
    },
    []
  );

  const signOut = useCallback(async () => {
    setParkingSync(null);
    setPermitsSync(null);
    if (supabase) await supabase.auth.signOut();
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    if (!supabase) return { error: new Error("Supabase not configured") };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error ?? null };
  }, []);

  const value: AuthContextValue = {
    user,
    session,
    loading,
    signInWithPassword,
    signUp,
    signOut,
    updatePassword,
    isConfigured: isSupabaseConfigured(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
