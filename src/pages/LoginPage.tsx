import { useState } from "react";
import { devSignIn, logout, signInWithGoogle } from "../auth";

export function LoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <div className="card login-card">
        <img src="/icons/icon.svg" alt="" width={72} height={72} />
        <h1>Família Furtadeira</h1>
        <p className="muted">Site privado da família. Entre com a conta Gmail que recebeu o convite.</p>
        <button
          className="primary big"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError((await signInWithGoogle()) ?? "");
            setBusy(false);
          }}
        >
          Entrar com Google
        </button>
        {error && <p className="error">{error}</p>}
        {import.meta.env.VITE_USE_EMULATORS && (
          <form
            className="inline-form dev-login"
            onSubmit={async (e) => {
              e.preventDefault();
              const email = String(new FormData(e.currentTarget).get("email"));
              setError((await devSignIn(email)) ?? "");
            }}
          >
            <input name="email" placeholder="teste@gmail.com (emulador)" />
            <button>Entrar (teste)</button>
          </form>
        )}
      </div>
    </div>
  );
}

export function NotInvitedPage({ email, message }: { email: string | null; message: string }) {
  return (
    <div className="login">
      <div className="card login-card">
        <h1>Acesso só com convite</h1>
        <p>{message}</p>
        {email && <p className="muted">Você entrou como <b>{email}</b>.</p>}
        <button onClick={logout}>Entrar com outra conta</button>
      </div>
    </div>
  );
}
