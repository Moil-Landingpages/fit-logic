import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
      })
      .catch((err) => {
        console.error("getSession failed", err);
      })
      .finally(() => {
        setLoading(false);
      });

    // Listen for auth state changes; clear cached queries on SIGNED_OUT so
    // that a second user signing in on the same device doesn't see leftover
    // rows from the previous session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setLoading(false);
      if (event === "SIGNED_OUT") {
        queryClient.clear();
      }
    });

    return () => {
      try {
        subscription.unsubscribe();
      } catch (err) {
        console.error("auth unsubscribe failed", err);
      }
    };
  }, [queryClient]);

  const signOut = async () => {
    await supabase.auth.signOut();
    // Belt-and-braces in case the listener doesn't fire (e.g., offline).
    queryClient.clear();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
