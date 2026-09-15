import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runImport, type ImportResult } from "../lib/api";

const ZADEVE_COLS = ["koda", "stranka", "naziv_zadeve", "podrocje", "obracun", "urna_postavka", "pavsal", "status", "odprto", "nosilec", "opombe"];
const ROKI_COLS = ["koda_zadeve", "naziv_roka", "datum", "resnost", "opomni_dni_prej", "vrsta", "ponavljanje"];

const ZADEVE_EXAMPLE = [
  "Z001,Telovarna d.o.o.,GDPR uskladitev,gdpr,pausal,,1200,v_teku,2026-08-15,nina,Letna revizija",
  "Z002,Podjetje ABC,Redna odpoved pogodbe,delovno_pravo,po_urah,120,,odprta,2026-09-05,ana@pravovpraksi.si,",
];
const ROKI_EXAMPLE = [
  "Z002,Rok za pripombe delavca,2026-09-20,3,3,interni,enkraten",
  "Z001,Letno poročilo KPK,2026-11-30,2,14,obveznost_stranke,letni",
];

const input = "w-full rounded-lg border border-neutral-300 p-3 font-mono text-xs";

/** Minimal CSV parser: handles quotes, embedded newlines, and ; or , delimiters. */
function parseCsv(text: string): Record<string, string>[] {
  const s = text.replace(/\r\n?/g, "\n").trim();
  if (!s) return [];
  const firstLine = s.slice(0, s.indexOf("\n") === -1 ? s.length : s.indexOf("\n"));
  const delim = (firstLine.split(";").length - 1) > (firstLine.split(",").length - 1) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

function download(name: string, cols: string[], examples: string[]) {
  const csv = [cols.join(","), ...examples].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export function Import() {
  const qc = useQueryClient();
  const [zadeveCsv, setZadeveCsv] = useState("");
  const [rokiCsv, setRokiCsv] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [committed, setCommitted] = useState(false);

  const run = useMutation({
    mutationFn: (dryRun: boolean) => runImport({ dryRun, zadeve: parseCsv(zadeveCsv), roki: parseCsv(rokiCsv) }),
    onSuccess: (data, dryRun) => {
      setResult(data);
      if (!dryRun && !data.errors.length) {
        setCommitted(true);
        qc.invalidateQueries({ queryKey: ["overview"] });
        qc.invalidateQueries({ queryKey: ["matters"] });
        qc.invalidateQueries({ queryKey: ["deadlines"] });
      }
    },
  });

  const canCommit = !!result && result.errors.length === 0 && !committed;
  const reset = () => { setResult(null); setCommitted(false); };

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[#0D332B]">Uvoz (enkratni popis)</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Enkraten prenos vseh tekočih strank, zadev in rokov na dan preklopa. Postopek: (1) v Nastavitvah dodaj
          vse člane ekipe, (2) ekipa izpolni predlogi spodaj, (3) prilepi CSV, (4) „Preveri“, (5) „Uvozi“.
        </p>
      </div>

      <Spec />

      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#0D332B]">1. Zadeve</h2>
          <button onClick={() => download("zadeve-predloga.csv", ZADEVE_COLS, ZADEVE_EXAMPLE)} className="text-sm text-[#0D332B] underline">Prenesi predlogo CSV</button>
        </div>
        <textarea className={input} rows={6} value={zadeveCsv} onChange={(e) => { setZadeveCsv(e.target.value); reset(); }} placeholder={ZADEVE_COLS.join(",")} />

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#0D332B]">2. Roki (neobvezno)</h2>
          <button onClick={() => download("roki-predloga.csv", ROKI_COLS, ROKI_EXAMPLE)} className="text-sm text-[#0D332B] underline">Prenesi predlogo CSV</button>
        </div>
        <textarea className={input} rows={5} value={rokiCsv} onChange={(e) => { setRokiCsv(e.target.value); reset(); }} placeholder={ROKI_COLS.join(",")} />
      </section>

      <div className="flex items-center gap-3">
        <button onClick={() => { setCommitted(false); run.mutate(true); }} disabled={run.isPending || !zadeveCsv.trim()} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-40">
          Preveri
        </button>
        <button onClick={() => run.mutate(false)} disabled={run.isPending || !canCommit} className="rounded-lg bg-[#0D332B] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          Uvozi
        </button>
        {run.isPending && <span className="text-sm text-neutral-500">Obdelujem…</span>}
      </div>

      {result && <Result result={result} committed={committed} />}
    </div>
  );
}

function Result({ result, committed }: { result: ImportResult; committed: boolean }) {
  if (committed) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        Uvoženo: <b>{result.created.zadeve}</b> zadev in <b>{result.created.roki}</b> rokov. Ekipa lahko začne.
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      <div className={`rounded-xl border p-4 text-sm ${result.errors.length ? "border-amber-200 bg-amber-50 text-amber-800" : "border-green-200 bg-green-50 text-green-800"}`}>
        {result.errors.length
          ? `Predogled: ${result.errors.length} napak — popravi in ponovno preveri. Nič ni bilo zapisano.`
          : `Predogled OK: pripravljenih ${result.willCreate.zadeve} zadev in ${result.willCreate.roki} rokov. Klikni „Uvozi“.`}
      </div>
      {result.errors.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {result.errors.map((e, i) => (
            <div key={i} className="border-b border-neutral-100 px-4 py-2 text-sm last:border-0">
              <span className="font-medium">{e.sheet === "zadeve" ? "Zadeve" : "Roki"} vrstica {e.row}:</span>{" "}
              <span className="text-neutral-600">{e.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Spec() {
  const cell = "border border-neutral-200 px-2 py-1 text-left align-top";
  return (
    <details className="rounded-xl border border-neutral-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold text-[#0D332B]">Katera polja pripraviti (klikni za navodila)</summary>
      <div className="mt-3 grid gap-4 text-xs">
        <div>
          <div className="mb-1 font-semibold">Zadeve — en vrstica na zadevo</div>
          <table className="w-full border-collapse">
            <tbody>
              <Row c="koda" o="da" v="poljubna kratka oznaka (Z001…), unikatna — poveže z roki" />
              <Row c="stranka" o="da" v="naziv stranke" />
              <Row c="naziv_zadeve" o="da" v="kratek naziv zadeve/projekta" />
              <Row c="podrocje" o="da" v="delovno_pravo, javni_usluzbenci, javna_narocila, gdpr, ijz, obligacije, drugo" />
              <Row c="obracun" o="da" v="pausal ali po_urah" />
              <Row c="urna_postavka" o="če po_urah" v="npr. 120 (€)" />
              <Row c="pavsal" o="če pausal" v="npr. 1200 (€)" />
              <Row c="status" o="da" v="odprta, v_teku, caka, zakljucena" />
              <Row c="odprto" o="ne" v="datum YYYY-MM-DD" />
              <Row c="nosilec" o="da" v="e-pošta ali ime člana — MORA obstajati v Nastavitvah" />
              <Row c="opombe" o="ne" v="poljubno" />
            </tbody>
          </table>
        </div>
        <div>
          <div className="mb-1 font-semibold">Roki — ena vrstica na rok (neobvezno)</div>
          <table className="w-full border-collapse">
            <tbody>
              <Row c="koda_zadeve" o="da" v="ujemati se mora s 'koda' iz Zadev" />
              <Row c="naziv_roka" o="da" v="opis roka" />
              <Row c="datum" o="da" v="YYYY-MM-DD" />
              <Row c="resnost" o="ne" v="1, 2 ali 3 (privzeto 2)" />
              <Row c="opomni_dni_prej" o="ne" v="število dni (privzeto 3)" />
              <Row c="vrsta" o="ne" v="interni ali obveznost_stranke (privzeto interni)" />
              <Row c="ponavljanje" o="ne" v="enkraten ali letni (privzeto enkraten)" />
            </tbody>
          </table>
        </div>
        <p className="text-neutral-500">
          Ure in stroški se ne uvažajo — te ekipa beleži sproti od dneva preklopa. Enum vrednosti sprejemamo tudi
          kot slovenske oznake (npr. „Delovno pravo“). Ločilo v CSV je lahko vejica ali podpičje; decimalke z vejico
          ali piko. Uvoz je atomarni: če je kakšna napaka, se ne zapiše nič.
        </p>
      </div>
    </details>
  );

  function Row({ c, o, v }: { c: string; o: string; v: string }) {
    return (
      <tr>
        <td className={`${cell} font-mono`}>{c}</td>
        <td className={cell}>{o}</td>
        <td className={cell}>{v}</td>
      </tr>
    );
  }
}
