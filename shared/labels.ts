import type {
  PracticeArea,
  BillingType,
  MatterStatus,
  WaitingReason,
  AgreementType,
  DeadlineKind,
  DeadlineRecurrence,
  ClientKind,
  ClientStatus,
  ContractType,
  ServiceUnit,
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
  pausal_ure: "Pavšal + ure",
};

export const STATUS_LABELS: Record<MatterStatus, string> = {
  odprta: "Odprta",
  v_teku: "V teku",
  caka: "Čaka (stranko/odgovor)",
  za_pregled: "Za pregled",
  posredovano: "Posredovano stranki",
  zakljucena: "Zaključena",
};

export const WAITING_REASON_LABELS: Record<WaitingReason, string> = {
  stranka_odgovor: "Čaka odgovor stranke",
  stranka_gradivo: "Čaka gradivo/dokumentacijo stranke",
  stranka_placilo: "Čaka plačilo/avans",
  nasprotna_stranka: "Čaka nasprotno stranko",
  organ_odlocba: "Čaka odločbo/sklep organa",
  sodisce: "Čaka sodišče",
  tretja_oseba: "Čaka tretjo osebo (notar/izvedenec/cenilec)",
  potek_roka: "Čaka potek roka",
  interni_pregled: "Interni pregled (vodja/sodelavka)",
  drugo: "Drugo",
};

export const AGREEMENT_TYPE_LABELS: Record<AgreementType, string> = {
  narocilnica: "Naročilnica",
  pogodba: "Pogodba",
  ustno: "Ustno naročilo",
  mail: "Mail",
};

export const SERVICE_UNIT_LABELS: Record<ServiceUnit, string> = {
  ura: "ura",
  mesec: "mesec",
  kos: "kos",
  min: "minuta",
  paket: "paket",
  dan: "dan",
  projekt: "projekt",
  km: "km",
  odstotek: "%",
};

export const CLIENT_KIND_LABELS: Record<ClientKind, string> = {
  pravna: "Pravna oseba",
  fizicna: "Fizična oseba",
};

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  aktivna: "Aktivna",
  potencialna: "Potencialna",
};

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  pogodba: "Pogodba",
  narocilnica: "Naročilnica",
  brez: "Brez",
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
