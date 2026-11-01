/**
 * Leitura de arquivos GEDCOM (exportados do MyHeritage, por exemplo)
 * e comparação com as pessoas que já estão no site.
 */
import type { Person } from "../types";

export interface GedPerson {
  key: string; // identificador estável (RIN do MyHeritage, _UID ou @I1@)
  xref: string;
  firstName: string;
  lastName: string;
  gender: "F" | "M" | "";
  birthDate: string; // AAAA-MM-DD, AAAA-MM, AAAA ou ""
  deathDate: string;
  deceased: boolean;
  city: string;
  parentXrefs: string[];
  spouseXrefs: string[];
}

const MONTHS: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

/** "12 MAR 1950" → "1950-03-12"; "ABT 1950" → "1950"; "MAR 1950" → "1950-03". */
export function parseGedDate(raw: string): string {
  const s = raw.toUpperCase().replace(/^(ABT|ABOUT|EST|CAL|BEF|AFT|FROM|BET|TO)\s+/, "");
  const full = s.match(/(\d{1,2})\s+([A-Z]{3})\s+(\d{4})/);
  if (full && MONTHS[full[2]]) return `${full[3]}-${MONTHS[full[2]]}-${full[1].padStart(2, "0")}`;
  const month = s.match(/([A-Z]{3})\s+(\d{4})/);
  if (month && MONTHS[month[1]]) return `${month[2]}-${MONTHS[month[1]]}`;
  const year = s.match(/\d{4}/);
  return year ? year[0] : "";
}

function cityOf(place: string): string {
  return place.split(",")[0].trim();
}

export function parseGedcom(text: string): GedPerson[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const people = new Map<string, GedPerson>();
  const fams = new Map<string, { husb?: string; wife?: string; chil: string[] }>();

  let current: { kind: "INDI" | "FAM" | "OTHER"; id: string } = { kind: "OTHER", id: "" };
  let event = ""; // BIRT, DEAT...
  let nameDone = false;

  for (const line of lines) {
    const m = line.match(/^\s*(\d+)\s+(@[^@]+@\s+)?(\S+)\s?(.*)$/);
    if (!m) continue;
    const level = Number(m[1]);
    const xref = m[2]?.trim();
    const tag = m[3];
    const value = m[4]?.trim() ?? "";

    if (level === 0) {
      event = "";
      nameDone = false;
      if (xref && tag === "INDI") {
        current = { kind: "INDI", id: xref };
        people.set(xref, {
          key: xref, xref, firstName: "", lastName: "", gender: "", birthDate: "", deathDate: "",
          deceased: false, city: "", parentXrefs: [], spouseXrefs: [],
        });
      } else if (xref && tag === "FAM") {
        current = { kind: "FAM", id: xref };
        fams.set(xref, { chil: [] });
      } else {
        current = { kind: "OTHER", id: "" };
      }
      continue;
    }

    if (current.kind === "INDI") {
      const p = people.get(current.id)!;
      if (level === 1) {
        event = tag;
        if (tag === "NAME" && !nameDone) {
          const parts = value.match(/^([^/]*)\/?([^/]*)\/?(.*)$/);
          p.firstName = (parts?.[1] ?? value).trim();
          p.lastName = [parts?.[2], parts?.[3]].filter(Boolean).join(" ").trim();
          nameDone = true;
        } else if (tag === "SEX") {
          p.gender = value === "F" ? "F" : value === "M" ? "M" : "";
        } else if (tag === "DEAT" || tag === "BURI") {
          p.deceased = true;
        } else if (tag === "RIN" && value) {
          p.key = value; // MyHeritage: "MH:I500001", estável entre exportações
        } else if (tag === "_UID" && value && p.key === p.xref) {
          p.key = value;
        }
      } else if (level === 2) {
        if (event === "NAME" && tag === "GIVN" && !p.firstName) p.firstName = value;
        if (event === "NAME" && tag === "SURN" && !p.lastName) p.lastName = value;
        if (tag === "DATE" && event === "BIRT") p.birthDate = parseGedDate(value);
        if (tag === "DATE" && event === "DEAT") p.deathDate = parseGedDate(value);
        if (tag === "PLAC" && event === "RESI" && value) p.city = cityOf(value);
        if (tag === "PLAC" && event === "BIRT" && !p.city && value) p.city = cityOf(value);
      }
    } else if (current.kind === "FAM" && level === 1) {
      const f = fams.get(current.id)!;
      if (tag === "HUSB") f.husb = value;
      if (tag === "WIFE") f.wife = value;
      if (tag === "CHIL") f.chil.push(value);
    }
  }

  for (const f of fams.values()) {
    const parents = [f.husb, f.wife].filter((x): x is string => !!x && people.has(x));
    if (f.husb && f.wife && people.has(f.husb) && people.has(f.wife)) {
      people.get(f.husb)!.spouseXrefs.push(f.wife);
      people.get(f.wife)!.spouseXrefs.push(f.husb);
    }
    for (const c of f.chil) {
      const child = people.get(c);
      if (child) child.parentXrefs.push(...parents.filter((x) => !child.parentXrefs.includes(x)).slice(0, 2 - child.parentXrefs.length));
    }
  }

  return [...people.values()].map((p) => ({
    ...p,
    firstName: p.firstName || "(sem nome)",
    spouseXrefs: [...new Set(p.spouseXrefs)].slice(0, 4),
  }));
}

const norm = (s?: string) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export interface ImportPlan {
  created: { ged: GedPerson; id: string }[];
  updated: { ged: GedPerson; person: Person }[];
  /** Campos finais de cada pessoa (nova ou existente), já com ids do site. */
  writes: { id: string; isNew: boolean; data: Partial<Person> & { gedcomKey: string } }[];
}

/**
 * Casa cada pessoa do GEDCOM com alguém do site:
 * 1) pelo identificador da importação anterior; 2) por nome + ano de nascimento.
 * Dados de contato, foto, ramo e login nunca são tocados.
 */
export function planImport(ged: GedPerson[], people: Person[], newId: () => string): ImportPlan {
  const byKey = new Map(people.filter((p) => p.gedcomKey).map((p) => [p.gedcomKey!, p]));
  const byName = new Map<string, Person[]>();
  for (const p of people) {
    if (p.gedcomKey) continue;
    const k = `${norm(p.firstName)}|${norm(p.lastName)}`;
    byName.set(k, [...(byName.get(k) ?? []), p]);
  }

  const idOf = new Map<string, string>(); // xref → id no site
  const created: ImportPlan["created"] = [];
  const updated: ImportPlan["updated"] = [];
  const used = new Set<string>();

  for (const g of ged) {
    let match = byKey.get(g.key);
    if (!match) {
      const candidates = (byName.get(`${norm(g.firstName)}|${norm(g.lastName)}`) ?? []).filter((p) => !used.has(p.id));
      match = candidates.find((p) => !p.birthDate || !g.birthDate || p.birthDate.slice(0, 4) === g.birthDate.slice(0, 4));
    }
    if (match) {
      used.add(match.id);
      idOf.set(g.xref, match.id);
      updated.push({ ged: g, person: match });
    } else {
      const id = newId();
      idOf.set(g.xref, id);
      created.push({ ged: g, id });
    }
  }

  const existing = new Map(people.map((p) => [p.id, p]));
  const writes: ImportPlan["writes"] = [];
  for (const g of ged) {
    const id = idOf.get(g.xref)!;
    const old = existing.get(id);
    const gedParents = g.parentXrefs.map((x) => idOf.get(x)!).filter(Boolean);
    const gedSpouses = g.spouseXrefs.map((x) => idOf.get(x)!).filter(Boolean);
    const data: Partial<Person> & { gedcomKey: string } = {
      gedcomKey: g.key,
      firstName: g.firstName,
      lastName: g.lastName,
      // Datas: o GEDCOM só substitui se trouxer algo.
      birthDate: g.birthDate || old?.birthDate || "",
      deathDate: g.deathDate || old?.deathDate || "",
      deceased: g.deceased || !!old?.deceased,
      parentIds: gedParents.length ? gedParents : old?.parentIds ?? [],
      spouseIds: [...new Set([...(old?.spouseIds ?? []), ...gedSpouses])].slice(0, 4),
    };
    if (g.gender) data.gender = g.gender;
    if (!old?.city && g.city) data.city = g.city;
    if (!old) Object.assign(data, { branchId: null, uid: null });
    writes.push({ id, isNew: !old, data });
  }
  return { created, updated, writes };
}
