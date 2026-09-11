import type { IStorage } from "./storage";
import { hashPassword } from "./auth/passwords";

function isoOffset(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}

/** Seed sample data for local testing. Gated by PVP_SEED=true; no-op if data exists. */
export async function seedDev(storage: IStorage) {
  if (process.env.PVP_SEED !== "true") return;
  if ((await storage.listMatters()).length > 0) return;

  await storage.createUser({
    username: "ana@pravovpraksi.si",
    passwordHash: hashPassword("test123"),
    role: "member",
    email: "ana@pravovpraksi.si",
    displayName: "Ana",
  });

  const gdpr = await storage.createMatter({
    client: "Telovarna d.o.o.",
    title: "GDPR uskladitev",
    area: "gdpr",
    billingType: "pausal",
    flatFee: 1200,
    status: "v_teku",
    openedAt: isoOffset(-30),
    assignedTo: "nina",
    notes: null,
  } as never);

  const labour = await storage.createMatter({
    client: "Podjetje ABC",
    title: "Redna odpoved pogodbe",
    area: "delovno_pravo",
    billingType: "po_urah",
    hourlyRate: 120,
    status: "odprta",
    openedAt: isoOffset(-10),
    assignedTo: "ana@pravovpraksi.si",
    notes: null,
  } as never);

  await storage.createTimeEntry({ matterId: gdpr.id, userId: "nina", date: isoOffset(-5), description: "Pregled evidenc obdelav", hours: 2.5 } as never);
  await storage.createTimeEntry({ matterId: labour.id, userId: "ana@pravovpraksi.si", date: isoOffset(-3), description: "Priprava osnutka odpovedi", hours: 3 } as never);
  await storage.createTimeEntry({ matterId: labour.id, userId: "ana@pravovpraksi.si", date: isoOffset(-1), description: "Sestanek s stranko", hours: 1.5 } as never);

  await storage.createDeadline({ matterId: labour.id, title: "Rok za pripombe delavca", dueDate: isoOffset(2), severity: 3, remindDaysBefore: 3, status: "odprt" } as never);
  await storage.createDeadline({ matterId: gdpr.id, title: "Oddaja DPIA", dueDate: isoOffset(-1), severity: 2, remindDaysBefore: 5, status: "odprt" } as never);

  await storage.createCost({ matterId: labour.id, date: isoOffset(-2), description: "Sodna taksa", amount: 45 } as never);
}
