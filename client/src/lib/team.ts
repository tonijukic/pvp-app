import { useQuery } from "@tanstack/react-query";
import { fetchTeam, type TeamMember } from "./api";

/** Two-letter initials from a display name (e.g. "Ana Novak" -> "AN"). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Roster + helpers to resolve a matter's assignedTo (username/email) to a name. */
export function useTeam() {
  const { data } = useQuery({ queryKey: ["team"], queryFn: fetchTeam, staleTime: 60_000 });
  const members: TeamMember[] = data ?? [];
  const byUser = new Map(members.map((m) => [m.username, m]));
  const nameOf = (username: string | null | undefined): string =>
    !username ? "Nedodeljeno" : (byUser.get(username)?.displayName ?? username);
  return { members, nameOf };
}
