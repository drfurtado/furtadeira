import type { Person } from "../types";

export function Avatar({ person, size = 40 }: { person: Person; size?: number }) {
  const initials = [person.firstName, person.lastName]
    .filter(Boolean)
    .map((s) => s![0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return person.photoURL ? (
    <img className="avatar" src={person.photoURL} alt="" width={size} height={size} referrerPolicy="no-referrer" />
  ) : (
    <span className="avatar avatar-initials" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials}
    </span>
  );
}
