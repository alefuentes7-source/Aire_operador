import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import type { UserRole } from "./database.types";

interface Profile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  clientIds: string[];
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        setProfile(null);
        setClientIds([]);
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const { data: userRow, error: userErr } = await supabase
        .from("users")
        .select("id, name, email, role")
        .eq("id", session.user.id)
        .single();

      if (cancelled) return;

      if (userErr || !userRow) {
        setError("Tu cuenta no tiene un perfil asociado en la tabla users. Pide a un administrador que lo cree.");
        setLoading(false);
        return;
      }

      setProfile(userRow);

      if (userRow.role === "admin") {
        const { data: allClients } = await supabase.from("clients").select("id");
        if (!cancelled) setClientIds((allClients ?? []).map((c) => c.id));
      } else {
        const { data: rows } = await supabase
          .from("operator_clients")
          .select("client_id")
          .eq("operator_id", session.user.id);
        if (!cancelled) setClientIds((rows ?? []).map((r) => r.client_id));
      }

      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

  const signIn = async (email: string, password: string) => {
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, profile, clientIds, loading, error, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
