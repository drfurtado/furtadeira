import type { Person } from "../types";

export const CARD_W = 150;
export const CARD_H = 64;
export const GAP_SPOUSE = 10;
export const GAP_SIB = 26;
export const ROW_H = 124;
export const MARGIN = 24;

/** Um "núcleo": a pessoa de sangue e seus cônjuges, desenhados lado a lado. */
export interface TreeUnit {
  members: Person[]; // members[0] é a pessoa de sangue
  children: TreeUnit[];
  depth: number;
  x: number; // canto esquerdo do primeiro cartão
  y: number;
  unitW: number;
  subW: number;
}

function unitWidth(n: number) {
  return n * CARD_W + (n - 1) * GAP_SPOUSE;
}

const byBirth = (a: Person, b: Person) =>
  (a.birthDate ?? "9999").localeCompare(b.birthDate ?? "9999") || a.firstName.localeCompare(b.firstName);

/**
 * Monta a árvore a partir dos ancestrais sem ramo (avós) e desce pelos filhos.
 * Cônjuges que entraram na família aparecem ao lado da pessoa.
 */
export function buildTree(people: Person[]): { roots: TreeUnit[]; width: number; height: number; placed: Set<string> } {
  const byId = new Map(people.map((p) => [p.id, p]));
  const hasParents = (p: Person) => p.parentIds.some((id) => byId.has(id));
  const placed = new Set<string>();

  const build = (person: Person, depth: number): TreeUnit => {
    placed.add(person.id);
    const spouses = person.spouseIds
      .map((id) => byId.get(id))
      .filter((s): s is Person => !!s && !placed.has(s.id) && !hasParents(s));
    spouses.forEach((s) => placed.add(s.id));
    const members = [person, ...spouses];
    const ids = new Set(members.map((m) => m.id));
    const kids = people
      .filter((c) => !placed.has(c.id) && c.parentIds.some((id) => ids.has(id)))
      .sort(byBirth);
    kids.forEach((k) => placed.add(k.id));
    const children = kids.map((k) => build(k, depth + 1));
    const unitW = unitWidth(members.length);
    const childW = children.reduce((s, c) => s + c.subW, 0) + GAP_SIB * Math.max(0, children.length - 1);
    return { members, children, depth, x: 0, y: depth * ROW_H, unitW, subW: Math.max(unitW, childW) };
  };

  // Raízes: sem pais cadastrados, sem ramo, e que não são cônjuges de alguém com pais.
  const rootCandidates = people
    .filter((p) => !hasParents(p) && !p.branchId)
    .filter((p) => !p.spouseIds.some((id) => { const s = byId.get(id); return s && hasParents(s); }))
    .sort(byBirth);

  const roots: TreeUnit[] = [];
  for (const p of rootCandidates) {
    if (!placed.has(p.id)) roots.push(build(p, 0));
  }

  const place = (u: TreeUnit, left: number) => {
    u.x = left + (u.subW - u.unitW) / 2;
    const childW = u.children.reduce((s, c) => s + c.subW, 0) + GAP_SIB * Math.max(0, u.children.length - 1);
    let cx = left + (u.subW - childW) / 2;
    for (const c of u.children) {
      place(c, cx);
      cx += c.subW + GAP_SIB;
    }
  };

  let left = MARGIN;
  let maxDepth = 0;
  const walk = (u: TreeUnit) => {
    maxDepth = Math.max(maxDepth, u.depth);
    u.y = MARGIN + u.depth * ROW_H;
    u.children.forEach(walk);
  };
  for (const r of roots) {
    place(r, left);
    walk(r);
    left += r.subW + GAP_SIB * 2;
  }

  return {
    roots,
    width: Math.max(left - GAP_SIB * 2 + MARGIN, 320),
    height: MARGIN * 2 + maxDepth * ROW_H + CARD_H,
    placed,
  };
}

export function flatten(roots: TreeUnit[]): TreeUnit[] {
  const out: TreeUnit[] = [];
  const walk = (u: TreeUnit) => {
    out.push(u);
    u.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}
