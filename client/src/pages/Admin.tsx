import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchUsers, createUser, deleteUser, runJob } from "../lib/api";

const input = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

export function Admin() {
  return (
    <div className="grid gap-6">
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

  const create = useMutation({
    mutationFn: () => createUser({ username: f.email, email: f.email, password: f.password, role: f.role, displayName: f.displayName }),
    onSuccess: () => { setF({ displayName: "", email: "", password: "", role: "member" }); qc.invalidateQueries({ queryKey: ["users"] }); },
    onError: (e) => setErr((e as Error).message),
  });
  const del = useMutation({ mutationFn: (id: string) => deleteUser(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }) });

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-[#0D332B]">Ekipa</h2>
      <form onSubmit={(e) => { e.preventDefault(); setErr(null); if (f.email && f.password) create.mutate(); }} className="mb-3 grid gap-2 rounded-xl border border-neutral-200 bg-white p-3 sm:grid-cols-[1fr_1fr_1fr_110px_auto]">
        <input className={input} placeholder="Ime" value={f.displayName} onChange={(e) => set("displayName", e.target.value)} />
        <input className={input} placeholder="E-pošta (= prijava)" value={f.email} onChange={(e) => set("email", e.target.value)} />
        <input className={input} type="password" placeholder="Geslo" value={f.password} onChange={(e) => set("password", e.target.value)} />
        <select className={input} value={f.role} onChange={(e) => set("role", e.target.value)}>
          <option value="member">član</option>
          <option value="admin">admin</option>
        </select>
        <button className="rounded-lg bg-[#0D332B] px-3 py-2 text-sm font-semibold text-white">Dodaj</button>
      </form>
      {err && <div className="mb-2 text-sm text-red-600">{err}</div>}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {(users ?? []).map((u) => (
          <div key={u.id} className="flex items-center justify-between border-b border-neutral-100 px-4 py-2 text-sm last:border-0">
            <span>{u.displayName ?? u.username} · <span className="text-neutral-500">{u.email}</span> · {u.role}</span>
            <button onClick={() => del.mutate(u.id)} className="text-xs text-red-600">izbriši</button>
          </div>
        ))}
        {!users?.length && <div className="px-4 py-3 text-sm text-neutral-400">Ni računov ekipe (Nina se prijavi z break-glass adminom).</div>}
      </div>
    </section>
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
