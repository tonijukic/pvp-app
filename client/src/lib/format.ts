export const euro = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : `${Number(n).toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export const hoursFmt = (n: number) => `${Number(n).toFixed(2)} h`;

export const todayIso = () => new Date().toISOString().slice(0, 10);

export function daysLeft(dueIso: string): number {
  const due = Date.parse(dueIso + "T00:00:00Z");
  const now = Date.parse(todayIso() + "T00:00:00Z");
  return Math.round((due - now) / 86_400_000);
}

export {
  AREA_LABELS,
  BILLING_LABELS,
  STATUS_LABELS,
  SEVERITY_LABELS,
  DEADLINE_KIND_LABELS,
  DEADLINE_RECURRENCE_LABELS,
  CLIENT_KIND_LABELS,
  CLIENT_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
} from "@shared/labels";
