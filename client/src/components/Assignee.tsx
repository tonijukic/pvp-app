import { initials } from "../lib/team";

/** Small owner chip: initials avatar + name. Shows a muted "Nedodeljeno"
 * state when a matter has no assignee, so gaps are visible at a glance. */
export function Assignee({
  name,
  size = "sm",
  nameOnly = false,
}: {
  name: string;
  size?: "sm" | "xs";
  nameOnly?: boolean;
}) {
  const unassigned = name === "Nedodeljeno";
  const dim = size === "xs" ? "h-5 w-5 text-[10px]" : "h-6 w-6 text-[11px]";
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <span
        className={`inline-flex items-center justify-center rounded-full font-semibold ${dim} ${
          unassigned ? "bg-neutral-200 text-neutral-500" : "bg-[#0D332B] text-[#C9A34A]"
        }`}
        title={name}
      >
        {unassigned ? "?" : initials(name)}
      </span>
      {!nameOnly && (
        <span className={`text-sm ${unassigned ? "text-neutral-400" : "text-neutral-700"}`}>{name}</span>
      )}
    </span>
  );
}
