import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useFamily } from "../data";
import { useMe } from "../auth";
import { buildTree, flatten, CARD_H, CARD_W, GAP_SPOUSE, ROW_H } from "../lib/tree";
import { fullName, lifeYears, shortName } from "../lib/people";
import type { Person } from "../types";

export function TreePage() {
  const { people, branchesById } = useFamily();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const me = useMe();
  const focusId = params.get("p");
  const [zoom, setZoom] = useState(0.8);
  const [query, setQuery] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const tree = useMemo(() => buildTree(people), [people]);
  const units = useMemo(() => flatten(tree.roots), [tree]);

  // Posição de cada pessoa, para busca e destaque.
  const positions = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const u of units) {
      u.members.forEach((p, i) => m.set(p.id, { x: u.x + i * (CARD_W + GAP_SPOUSE), y: u.y }));
    }
    return m;
  }, [units]);

  // Abre centralizado na pessoa escolhida, ou em você, ou nos avós.
  useEffect(() => {
    const target = focusId ?? (me.personId && positions.has(me.personId) ? me.personId : tree.roots[0]?.members[0].id);
    const pos = target ? positions.get(target) : undefined;
    const el = scroller.current;
    if (!pos || !el) return;
    el.scrollTo({
      left: (pos.x + CARD_W / 2) * zoom - el.clientWidth / 2,
      top: (pos.y + CARD_H / 2) * zoom - el.clientHeight / 2,
      behavior: "smooth",
    });
  }, [focusId, positions, zoom, me.personId, tree]);

  const matches = query.trim().length >= 2
    ? people.filter((p) => fullName(p).toLowerCase().includes(query.trim().toLowerCase()) && positions.has(p.id)).slice(0, 8)
    : [];

  if (tree.roots.length === 0) {
    return (
      <div className="card">
        <h1>Árvore</h1>
        <p>A árvore começa pelos avós. Peça ao administrador para cadastrá-los (pessoas sem ramo e sem pais).</p>
      </div>
    );
  }

  const card = (p: Person, x: number, y: number) => {
    const color = p.branchId ? branchesById.get(p.branchId)?.color : undefined;
    const focused = p.id === focusId;
    return (
      <g key={p.id} transform={`translate(${x},${y})`} className="tree-card" onClick={() => navigate(`/pessoa/${p.id}`)}>
        <rect width={CARD_W} height={CARD_H} rx={10} className={focused ? "focused" : ""} />
        {color && <rect width={6} height={CARD_H} rx={3} fill={color} />}
        {p.photoURL ? (
          <image href={p.photoURL} x={12} y={12} width={40} height={40} clipPath="url(#avatar-clip)" preserveAspectRatio="xMidYMid slice" />
        ) : (
          <circle cx={32} cy={32} r={20} className="tree-initial-bg" />
        )}
        {!p.photoURL && <text x={32} y={38} textAnchor="middle" className="tree-initial">{p.firstName[0]}</text>}
        <text x={60} y={28} className="tree-name">{shortName(p).slice(0, 14)}</text>
        <text x={60} y={46} className="tree-years">{(p.lastName ?? "").split(" ").slice(-1)[0]?.slice(0, 14)}</text>
        <text x={60} y={58} className="tree-years">{lifeYears(p)}</text>
      </g>
    );
  };

  return (
    <div className="tree-page">
      <div className="tree-toolbar">
        <div className="search">
          <input placeholder="Buscar na árvore…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {matches.length > 0 && (
            <ul className="search-results">
              {matches.map((p) => (
                <li key={p.id}>
                  <button className="link" onClick={() => { setParams({ p: p.id }); setQuery(""); }}>{fullName(p)}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))} aria-label="Diminuir">−</button>
        <button onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))} aria-label="Aumentar">+</button>
        <Link to="/pessoas" className="muted">Ver como lista</Link>
      </div>
      <div className="tree-scroller" ref={scroller}>
        <svg width={tree.width * zoom} height={tree.height * zoom} viewBox={`0 0 ${tree.width} ${tree.height}`}>
          <defs>
            <clipPath id="avatar-clip" clipPathUnits="userSpaceOnUse"><circle cx={32} cy={32} r={20} /></clipPath>
          </defs>
          <g className="tree-lines">
            {units.map((u) =>
              u.children.length === 0 ? null : (() => {
                const fromX = u.members.length > 1 ? u.x + CARD_W + GAP_SPOUSE / 2 : u.x + CARD_W / 2;
                const fromY = u.y + CARD_H;
                const midY = u.y + CARD_H + (ROW_H - CARD_H) / 2;
                const xs = u.children.map((c) => c.x + CARD_W / 2);
                return (
                  <g key={`l-${u.members[0].id}`}>
                    <path d={`M${fromX} ${u.members.length > 1 ? u.y + CARD_H / 2 : fromY}V${midY}`} />
                    <path d={`M${Math.min(fromX, ...xs)} ${midY}H${Math.max(fromX, ...xs)}`} />
                    {xs.map((x, i) => <path key={i} d={`M${x} ${midY}V${u.children[i].y}`} />)}
                  </g>
                );
              })(),
            )}
            {units.filter((u) => u.members.length > 1).map((u) => (
              <path key={`s-${u.members[0].id}`} className="spouse-line"
                d={`M${u.x + CARD_W} ${u.y + CARD_H / 2}H${u.x + u.unitW - CARD_W}`} />
            ))}
          </g>
          {units.map((u) => u.members.map((p, i) => card(p, u.x + i * (CARD_W + GAP_SPOUSE), u.y)))}
        </svg>
      </div>
      {people.length > tree.placed.size && (
        <p className="muted small">
          {people.length - tree.placed.size} pessoa(s) não aparecem na árvore (por exemplo, pais de cônjuges). Elas estão na lista de Pessoas.
        </p>
      )}
    </div>
  );
}
