import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import type { Branch, FamilyUser, Person } from "./types";

interface FamilyData {
  loading: boolean;
  people: Person[];
  peopleById: Map<string, Person>;
  branches: Branch[];
  branchesById: Map<string, Branch>;
  users: FamilyUser[];
}

const FamilyContext = createContext<FamilyData | null>(null);

export function useFamily(): FamilyData {
  const ctx = useContext(FamilyContext);
  if (!ctx) throw new Error("useFamily fora do FamilyProvider");
  return ctx;
}

/**
 * A família inteira cabe na memória (algumas centenas de pessoas),
 * então assinamos as coleções uma vez e todas as páginas usam o mesmo dado.
 */
export function FamilyProvider({ children }: { children: ReactNode }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [users, setUsers] = useState<FamilyUser[] | null>(null);

  useEffect(() => {
    const subs = [
      onSnapshot(collection(db, "people"), (s) =>
        setPeople(s.docs.map((d) => ({ parentIds: [], spouseIds: [], ...d.data(), id: d.id }) as unknown as Person)),
      ),
      onSnapshot(collection(db, "branches"), (s) =>
        setBranches(
          s.docs.map((d) => ({ ...d.data(), id: d.id }) as Branch).sort((a, b) => a.order - b.order),
        ),
      ),
      onSnapshot(collection(db, "users"), (s) =>
        setUsers(s.docs.map((d) => ({ ...d.data(), id: d.id }) as FamilyUser)),
      ),
    ];
    return () => subs.forEach((u) => u());
  }, []);

  const value = useMemo<FamilyData>(() => {
    const p = people ?? [];
    const b = branches ?? [];
    return {
      loading: people === null || branches === null || users === null,
      people: p,
      peopleById: new Map(p.map((x) => [x.id, x])),
      branches: b,
      branchesById: new Map(b.map((x) => [x.id, x])),
      users: users ?? [],
    };
  }, [people, branches, users]);

  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>;
}
