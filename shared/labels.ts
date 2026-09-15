import type {
  PracticeArea,
  BillingType,
  MatterStatus,
  DeadlineKind,
  DeadlineRecurrence,
} from "./schema";

export const AREA_LABELS: Record<PracticeArea, string> = {
  delovno_pravo: "Delovno pravo",
  javni_usluzbenci: "Javni uslužbenci",
  javna_narocila: "Javna naročila",
  gdpr: "GDPR / varstvo podatkov",
  ijz: "Dostop do informacij (IJZ)",
  obligacije: "Obligacijsko / pogodbe",
  drugo: "Drugo",
};

export const BILLING_LABELS: Record<BillingType, string> = {
  pausal: "Pavšal",
  po_urah: "Po urah",
};

export const STATUS_LABELS: Record<MatterStatus, string> = {
  odprta: "Odprta",
  v_teku: "V teku",
  caka: "Čaka",
  zakljucena: "Zaključena",
};

export const SEVERITY_LABELS: Record<number, string> = {
  1: "nizka",
  2: "srednja",
  3: "kritična",
};

export const DEADLINE_KIND_LABELS: Record<DeadlineKind, string> = {
  interni: "Interni rok",
  obveznost_stranke: "Obveznost stranke",
};

export const DEADLINE_RECURRENCE_LABELS: Record<DeadlineRecurrence, string> = {
  enkraten: "Enkraten",
  letni: "Letni",
};
