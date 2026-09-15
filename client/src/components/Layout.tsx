import { Link, useLocation } from "wouter";
import type { Me } from "../lib/api";
import { logout } from "../lib/api";

const NAV = [
  { href: "/", label: "Pregled" },
  { href: "/zadeve", label: "Zadeve" },
  { href: "/roki", label: "Roki" },
  { href: "/ure", label: "Ure" },
];

export function Layout({
  me,
  onLogout,
  children,
}: {
  me: Me;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const [loc] = useLocation();
  const nav =
    me.role === "admin"
      ? [...NAV, { href: "/ekipa", label: "Ekipa" }, { href: "/nastavitve", label: "Nastavitve" }]
      : NAV;

  async function doLogout() {
    await logout();
    onLogout();
  }

  const active = (href: string) => (href === "/" ? loc === "/" : loc.startsWith(href));

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-10 bg-[#0D332B] text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm tracking-[0.22em] text-[#C9A34A]">PRAVO V PRAKSI</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="hidden text-white/70 sm:inline">
              {me.displayName ?? me.username} · {me.role}
            </span>
            <button onClick={doLogout} className="rounded border border-[#C9A34A]/40 px-2 py-1 text-[#C9A34A]">
              Odjava
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-2 pb-1">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`whitespace-nowrap rounded-t-md px-3 py-2 text-sm ${
                active(n.href) ? "bg-neutral-50 font-semibold text-[#0D332B]" : "text-white/80 hover:text-white"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-5">{children}</main>
    </div>
  );
}
