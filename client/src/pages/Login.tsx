import { useState } from "react";
import { login } from "../lib/api";

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Napaka");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0D332B] px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl bg-white/5 p-8 shadow-xl ring-1 ring-[#C9A34A]/30"
      >
        <div className="mb-6 text-center">
          <div className="text-lg tracking-[0.3em] text-[#C9A34A]">PRAVO V PRAKSI</div>
          <div className="mt-1 text-xs tracking-[0.2em] text-[#C9A34A]/70">ZAUPANJA VREDNI</div>
        </div>
        <h1 className="mb-4 text-center text-xl font-semibold text-white">Prijava</h1>

        <label className="mb-1 block text-sm text-white/80">E-pošta ali uporabniško ime</label>
        <input
          autoFocus
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mb-4 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-white outline-none focus:border-[#C9A34A]"
        />

        <label className="mb-1 block text-sm text-white/80">Geslo</label>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-white outline-none focus:border-[#C9A34A]"
        />

        {error && <div className="mb-3 text-sm text-red-300">{error}</div>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-[#C9A34A] py-2 font-semibold text-[#0D332B] transition hover:bg-[#d9b45c] disabled:opacity-60"
        >
          {busy ? "Prijavljam…" : "Prijava"}
        </button>
      </form>
    </div>
  );
}
