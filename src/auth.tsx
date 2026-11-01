import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signInWithPopup, signOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "./firebase";
import type { FamilyUser } from "./types";

type AuthState =
  | { kind: "loading" }
  | { kind: "signedOut"; error?: string }
  | { kind: "notInvited"; user: User; message: string }
  | { kind: "ready"; user: User; me: FamilyUser };

const AuthContext = createContext<AuthState>({ kind: "loading" });

export function useAuth() {
  return useContext(AuthContext);
}

/** Usado nas páginas internas, onde o login já foi confirmado. */
export function useMe(): FamilyUser {
  const state = useAuth();
  if (state.kind !== "ready") throw new Error("useMe fora da área logada");
  return state.me;
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("popup-closed")) return "";
  // A barreira de login devolve a mensagem dentro do erro.
  const match = msg.match(/não foi convidado[^"]*/);
  if (match || msg.includes("permission-denied") || msg.includes("blocking")) {
    return "Este Gmail não foi convidado. Peça a alguém da família para enviar um convite.";
  }
  return "Não foi possível entrar. Tente de novo.";
}

export async function signInWithGoogle(): Promise<string | undefined> {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(auth, provider);
  } catch (e) {
    return friendlyError(e) || undefined;
  }
}

/** Só nos emuladores: entra com qualquer Gmail de teste, sem a janela do Google. */
export async function devSignIn(email: string): Promise<string | undefined> {
  if (!import.meta.env.VITE_USE_EMULATORS) return;
  try {
    const token = JSON.stringify({ sub: email, email, email_verified: true, name: email.split("@")[0] });
    await signInWithCredential(auth, GoogleAuthProvider.credential(token));
  } catch (e) {
    return friendlyError(e) || undefined;
  }
}

export function logout() {
  return signOut(auth);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ kind: "loading" });

  useEffect(() => {
    let unsubUser: (() => void) | undefined;
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      unsubUser?.();
      if (!user) {
        setState({ kind: "signedOut" });
        return;
      }
      setState({ kind: "loading" });
      try {
        await httpsCallable(functions, "joinFamily")();
      } catch (e) {
        const message = e instanceof Error && e.message ? e.message : friendlyError(e);
        setState({ kind: "notInvited", user, message });
        return;
      }
      unsubUser = onSnapshot(
        doc(db, "users", user.uid),
        (snap) => {
          const data = snap.data();
          if (!data || data.status !== "active") {
            setState({ kind: "notInvited", user, message: "Seu acesso foi suspenso. Fale com o administrador." });
            return;
          }
          setState({ kind: "ready", user, me: { id: snap.id, ...data } as FamilyUser });
        },
        () => setState({ kind: "notInvited", user, message: "Seu acesso foi suspenso. Fale com o administrador." }),
      );
    });
    return () => {
      unsubAuth();
      unsubUser?.();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
