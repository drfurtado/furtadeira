import type { FamilyUser, Person } from "../types";

export function fullName(p: Person): string {
  return [p.firstName, p.lastName].filter(Boolean).join(" ");
}

export function shortName(p: Person): string {
  return p.nickname || p.firstName;
}

/** "1950 – 2020", "n. 1985" ou "" */
export function lifeYears(p: Person): string {
  const b = p.birthDate?.slice(0, 4);
  const d = p.deathDate?.slice(0, 4);
  if (b && d) return `${b} – ${d}`;
  if (d) return `† ${d}`;
  if (p.deceased && b) return `${b} – ?`;
  if (b) return `n. ${b}`;
  return "";
}

export function formatDate(iso?: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return d && m ? `${d}/${m}/${y}` : iso;
}

export function age(p: Person): number | null {
  if (!p.birthDate || p.deceased || p.deathDate) return null;
  const b = new Date(p.birthDate + "T12:00:00");
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a;
}

export function childrenOf(p: Person, people: Person[]): Person[] {
  return people
    .filter((c) => c.parentIds.includes(p.id))
    .sort((a, b) => (a.birthDate ?? "9999").localeCompare(b.birthDate ?? "9999"));
}

export function siblingsOf(p: Person, people: Person[]): Person[] {
  if (p.parentIds.length === 0) return [];
  return people
    .filter((s) => s.id !== p.id && s.parentIds.some((id) => p.parentIds.includes(id)))
    .sort((a, b) => (a.birthDate ?? "9999").localeCompare(b.birthDate ?? "9999"));
}

/** Mesmas regras do firestore.rules, para mostrar ou esconder botões. */
export function canEdit(me: FamilyUser, p: Person): boolean {
  if (me.role === "admin") return true;
  if (me.role === "rep" && p.branchId && p.branchId === me.branchId) return true;
  return p.uid === me.id;
}

export function canAddToBranch(me: FamilyUser, branchId: string | null): boolean {
  if (me.role === "admin") return true;
  return me.role === "rep" && branchId !== null && branchId === me.branchId;
}

export function canInvite(me: FamilyUser, p: Person): boolean {
  return !p.uid && !p.deceased && !p.deathDate && canAddToBranch(me, p.branchId);
}

export function upcomingBirthdays(people: Person[], days = 30) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return people
    .filter((p) => p.birthDate && !p.deceased && !p.deathDate)
    .map((p) => {
      const [, m, d] = p.birthDate!.split("-").map(Number);
      let next = new Date(today.getFullYear(), m - 1, d);
      if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d);
      const inDays = Math.round((next.getTime() - today.getTime()) / 86400000);
      return { person: p, next, inDays };
    })
    .filter((x) => x.inDays <= days)
    .sort((a, b) => a.inDays - b.inDays);
}
