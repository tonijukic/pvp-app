import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { fetchRadarItem, generateRadarInsight } from "../lib/api";
import { AREA_LABELS, dateFmt } from "../lib/format";

export function RadarDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const { data: item, isLoading, error } = useQuery({
    queryKey: ["radar-item", id],
    queryFn: () => fetchRadarItem(id),
  });

  const gen = useMutation({
    mutationFn: () => generateRadarInsight(id),
    onSuccess: (updated) => {
      qc.setQueryData(["radar-item", id], updated);
      qc.invalidateQueries({ queryKey: ["radar"] });
    },
  });

  // Fire generation once on first open, only if not already cached.
  const needsGen = Boolean(item) && !item?.summaryTeam;
  useEffect(() => {
    if (needsGen && gen.isIdle) gen.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsGen]);

  if (isLoading) return <p className="text-neutral-500">Nalagam…</p>;
  if (error) return <p className="text-red-600">{(error as Error).message}</p>;
  if (!item) return null;

  const published = dateFmt(item.publishedAt);
  const generating = gen.isPending;
  const genError = gen.error as Error | undefined;

  const copyNewsletter = async () => {
    if (!item.newsletterText) return;
    try {
      await navigator.clipboard.writeText(item.newsletterText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  return (
    <div>
      <Link href="/radar" className="text-sm text-neutral-500">← Zakonodajni radar</Link>

      <div className="mb-4 mt-1">
        <h1 className="text-xl font-semibold text-[#0D332B]">{item.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span className="rounded-full bg-[#0D332B]/5 px-2 py-0.5 font-medium text-[#0D332B]">{item.source}</span>
          <span className="rounded-full bg-[#0D332B]/5 px-2 py-0.5 text-[#0D332B]">{AREA_LABELS[item.area]}</span>
          <span>{published || "datum ni na voljo"}</span>
        </div>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-sm font-medium text-[#C9A34A] hover:underline"
          >
            Odpri izvirnik ↗
          </a>
        )}
      </div>

      {item.summary && (
        <div className="mb-4 rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
          {item.summary}
        </div>
      )}

      {/* Povzetek za ekipo */}
      <section className="mb-4 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-[#0D332B]">Povzetek za ekipo</h2>
        {generating && <p className="text-sm text-neutral-500">Pripravljam povzetek…</p>}
        {!generating && genError && (
          <div className="text-sm">
            <p className="text-neutral-500">
              {genError.message.includes("AI ni nastavljen")
                ? "AI povzetek trenutno ni na voljo."
                : genError.message}
            </p>
            <button
              onClick={() => gen.mutate()}
              className="mt-2 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-[#0D332B] hover:bg-[#0D332B]/5"
            >
              Poskusi znova
            </button>
          </div>
        )}
        {!generating && !genError && item.summaryTeam && (
          <p className="whitespace-pre-wrap text-sm text-neutral-700">{item.summaryTeam}</p>
        )}
        {!generating && !genError && !item.summaryTeam && (
          <p className="text-sm text-neutral-500">AI povzetek trenutno ni na voljo.</p>
        )}
      </section>

      {/* Za obvestilnik */}
      <section className="rounded-xl border border-[#C9A34A]/40 bg-[#C9A34A]/5 p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#0D332B]">Za obvestilnik</h2>
          {item.newsletterText && (
            <button
              onClick={copyNewsletter}
              className="rounded-lg border border-[#C9A34A] px-3 py-1 text-xs font-medium text-[#8a6d1f] hover:bg-[#C9A34A]/15"
            >
              {copied ? "Kopirano ✓" : "Kopiraj"}
            </button>
          )}
        </div>
        {generating && <p className="text-sm text-neutral-500">Pripravljam besedilo…</p>}
        {!generating && item.newsletterText && (
          <p className="whitespace-pre-wrap text-sm text-neutral-700">{item.newsletterText}</p>
        )}
        {!generating && !item.newsletterText && !genError && (
          <p className="text-sm text-neutral-500">Besedilo za obvestilnik ni na voljo.</p>
        )}
        {!generating && !item.newsletterText && genError && (
          <p className="text-sm text-neutral-500">AI povzetek trenutno ni na voljo.</p>
        )}
      </section>
    </div>
  );
}
