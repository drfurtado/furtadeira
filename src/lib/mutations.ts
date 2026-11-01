import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import type { FamilyUser, Person, Role } from "../types";

export type PersonFields = Omit<Person, "id" | "uid" | "createdBy" | "updatedAt">;

export type Relation =
  | { type: "child"; of: Person; otherParentId: string | null }
  | { type: "spouse"; of: Person }
  | { type: "parent"; of: Person };

function clean<T extends object>(o: T): T {
  // O Firestore não aceita undefined.
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export async function createPerson(me: FamilyUser, fields: PersonFields, relation?: Relation): Promise<string> {
  const batch = writeBatch(db);
  const newRef = doc(collection(db, "people"));
  const data: PersonFields = { ...fields, parentIds: [], spouseIds: [] };

  if (relation?.type === "child") {
    data.parentIds = [relation.of.id, relation.otherParentId].filter((x): x is string => !!x);
  } else if (relation?.type === "spouse") {
    data.spouseIds = [relation.of.id];
    batch.update(doc(db, "people", relation.of.id), { spouseIds: arrayUnion(newRef.id), updatedAt: serverTimestamp() });
  } else if (relation?.type === "parent") {
    batch.update(doc(db, "people", relation.of.id), { parentIds: arrayUnion(newRef.id), updatedAt: serverTimestamp() });
  }

  batch.set(newRef, clean({ ...data, uid: null, createdBy: me.id, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await batch.commit();
  return newRef.id;
}

export async function updatePerson(id: string, fields: Partial<PersonFields>) {
  await updateDoc(doc(db, "people", id), clean({ ...fields, updatedAt: serverTimestamp() }));
}

/** Remove a pessoa e os vínculos que apontam para ela. */
export async function deletePerson(person: Person, people: Person[], canEditOther: (p: Person) => boolean) {
  const batch = writeBatch(db);
  for (const other of people) {
    if (other.id === person.id || !canEditOther(other)) continue;
    if (other.parentIds.includes(person.id)) batch.update(doc(db, "people", other.id), { parentIds: arrayRemove(person.id) });
    if (other.spouseIds.includes(person.id)) batch.update(doc(db, "people", other.id), { spouseIds: arrayRemove(person.id) });
  }
  batch.delete(doc(db, "people", person.id));
  await batch.commit();
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isGmail(email: string) {
  return /^[^@\s]+@(gmail|googlemail)\.com$/.test(normalizeEmail(email));
}

export async function sendInvite(
  me: FamilyUser,
  input: { email: string; name: string; branchId: string | null; role: Role; personId: string | null },
) {
  const email = normalizeEmail(input.email);
  const ref = doc(db, "invites", email);
  let existing;
  try {
    existing = await getDoc(ref);
  } catch {
    throw new Error("Este Gmail já foi convidado por outro ramo da família.");
  }
  if (existing.exists()) {
    const inv = existing.data();
    if (inv.status === "accepted") throw new Error("Esta pessoa já aceitou um convite.");
    if (inv.branchId !== input.branchId && me.role !== "admin") {
      throw new Error("Este Gmail já foi convidado por outro ramo da família.");
    }
    await updateDoc(ref, { status: "pending", sendCount: (inv.sendCount ?? 1) + 1, updatedAt: serverTimestamp() });
    return;
  }
  await setDoc(ref, {
    email,
    name: input.name,
    branchId: input.branchId,
    role: input.role,
    personId: input.personId,
    status: "pending",
    sendCount: 1,
    invitedBy: me.id,
    createdAt: serverTimestamp(),
  });
}

export async function resendInvite(email: string, sendCount: number) {
  await updateDoc(doc(db, "invites", email), { status: "pending", sendCount: sendCount + 1, updatedAt: serverTimestamp() });
}

export async function cancelInvite(email: string) {
  await updateDoc(doc(db, "invites", email), { status: "cancelled", updatedAt: serverTimestamp() });
}

export async function deleteInvite(email: string) {
  await deleteDoc(doc(db, "invites", email));
}
