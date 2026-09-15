import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchUsers, createUser, updateUser, deleteUser, runJob } from "../lib/api";
import type { SafeUser } from "../lib/api";

const input = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

export function Admin() {
  return (
    <div className="grid gap-6">
      <h1 className="text-xl font-semibold text-[#0D332B]">Nastavitve</h1>
      <Users />
      <Jobs />
    </div>
  );
}

function Users() {
  const qc = useQueryClient();
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: fetchUsers });
  const [f, setF] = useState({ displayName: "", email: "", password: "", role: "member" });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const invalidate = () => qc.invalidateQueries({ queryKey: ["users"] });

  const create = useMutation({
    mutationFn: () => createUser({ username: f.email, email: f.email, password: f.password, role: f.role, displayName: f.displayName }),
    onSuccess: () => { setF({ displayName: "", email: "", password: "", role: "member" }); invalidate(); },
    onError: (e) => setErr((e as Error).message),
  });

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold text-[#0D332B]">Ekipa</h2>
      <p className="mb-3 text-sm text-neutral-500">
        Dodajaj in ureja sodelavce ter jim dodeljuj pravice (član vidi le svoje zadeve; admin vidi vse in ureja ekipo).
      </p>

      <form onSubmit={(e) => { e.preventDefault(); setErr(null); if (f.email && f.password) create.mutate(); }} className="mb-4 grid gap-2 rounded-xl border border-neutral-200 bg-white p-3 sm:grid-cols-[1fr_1fr_1fr_110px_auto]">
        <input className={input} placeholder="Ime in priimek" value={f.displayName} onChange={(e) => set("displayName", e.target.value)} />
        <input className={input} placeholder="E-pošta (= prijava)" value={f.email} onChange={(e) => set("email", e.target.value)} />
        <input className={input} type="password" placeholder="Začetno geslo" value={f.password} onChange={(e) => set("password", e.target.value)} />
        <select className={input} value={f.role} onChange={(e) => set("role", e.target.value)}>
          <option value="member">član</option>
          <option value="admin">admin</option>
        </select>
        <button className="rounded-lg bg-[#0D332B] px-3 py-2 text-sm font-semibold text-white">Dodaj</button>
      </form>
      {err && <div className="mb-2 text-sm text-red-600">{err}</div>}

      <div className="grid gap-2">
        {(users ?? []).map((u) => <UserRow key={u.id} user={u} onChanged={invalidate} />)}
        {!users?.length && (
          <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-400">
            Ni računov ekipe (Nina se prijavi z break-glass adminom).
          </div>
        )}
      </div>
    </section>
  );
}

function UserRow({ user, onChanged }: { user: SafeUser; onChanged: () => void }) {
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [role, setRole] = useState(user.role);
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const dirty =
    displayName !== (user.displayName ?? "") ||
    email !== (user.email ?? "") ||
    role !== user.role ||
    password.length > 0;

  const save = useMutation({
    mutationFn: () =>
      updateUser(user.id, {
        displayName: displayName || null,
        email: email || null,
        role,
        ...(password ? { password } : {}),
      }),
    onSuccess: () => { setPassword(""); setMsg("Shranjeno"); onChanged(); setTimeout(() => setMsg(null), 2000); },
    onError: (e) => setMsg((e as Error).message),
  });

  const del = useMutation({ mutationFn: () => deleteUser(user.id), onSuccess: onChanged });

  return (
    <div className="grid gap-2 rounded-xl border border-neutral-200 bg-white p-3 sm:grid-cols-[1fr_1fr_1fr_110px_auto_auto] sm:items-center">
      <input className={input} placeholder="Ime" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      <input className={input} placeholder="E-pošta" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className={input} type="password" placeholder="Novo geslo (neobvezno)" value={password} onChange={(e) => setPassword(e.target.value)} />
      <select className={input} value={role} onChange={(e) => setRole(e.target.value as SafeUser["role"])}>
        <option value="member">član</option>
        <option value="admin">admin</option>
      </select>
      <button
        disabled={!dirty || save.isPending}
        onClick={() => { setMsg(null); save.mutate(); }}
        className="rounded-lg bg-[#0D332B] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        Shrani
      </button>
      <button onClick={() => del.mutate()} className="text-xs text-red-600">izbriši</button>
      {msg && <div className="text-xs text-neutral-500 sm:col-span-6">{msg}</div>}
    </div>
  );
}

function Jobs() {
  const [out, setOut] = useState<string | null>(null);
  const run = useMutation({
    mutationFn: (which: "reminders" | "summary") => runJob(which, true),
    onSuccess: (data) => setOut(JSON.stringify(data, null, 2)),
    onError: (e) => setOut((e as Error).message),
  });
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-[#0D332B]">Opravila (testni zagon)</h2>
      <p className="mb-2 text-sm text-neutral-500">Dry-run: ustvari predogled/osnutek, nič se ne pošlje Nini.</p>
      <div className="flex gap-2">
        <button onClick={() => run.mutate("reminders")} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm">Zaženi opomnike rokov</button>
        <button onClick={() => run.mutate("summary")} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm">Zaženi mesečni pregled</button>
      </div>
      {out && <pre className="mt-3 overflow-auto rounded-lg bg-neutral-900 p-3 text-xs text-neutral-100">{out}</pre>}
    </section>
  );
}
