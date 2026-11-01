import { useState } from "react";
import { Link } from "react-router-dom";
import { useFamily } from "../data";
import { Avatar } from "../components/Avatar";
import { fullName, lifeYears } from "../lib/people";

/** Lista por ramo: mais fácil que a árvore no celular. Também serve de lista de contatos. */
export function PeoplePage() {
  const { people, branches } = useFamily();
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const filtered = people
    .filter((p) => !term || [fullName(p), p.nickname, p.city].some((s) => s?.toLowerCase().includes(term)))
    .sort((a, b) => fullName(a).localeCompare(fullName(b)));

  const groups = [
    ...branches.map((b) => ({ key: b.id, title: `Ramo ${b.name}`, color: b.color, list: filtered.filter((p) => p.branchId === b.id) })),
    { key: "none", title: "Avós, pais e tios", color: undefined, list: filtered.filter((p) => !p.branchId) },
  ].filter((g) => g.list.length > 0);

  return (
    <div>
      <h1>Pessoas <span className="muted">({people.length})</span></h1>
      <input className="wide" placeholder="Buscar por nome, apelido ou cidade…" value={q} onChange={(e) => setQ(e.target.value)} />
      {groups.map((g) => (
        <section key={g.key} className="card">
          <h2 style={{ borderLeft: g.color ? `6px solid ${g.color}` : undefined, paddingLeft: g.color ? 10 : 0 }}>{g.title}</h2>
          <ul className="people-list">
            {g.list.map((p) => (
              <li key={p.id}>
                <Link to={`/pessoa/${p.id}`}>
                  <Avatar person={p} size={40} />
                  <span>
                    <b>{fullName(p)}</b>
                    <small className="muted">{[lifeYears(p), p.city].filter(Boolean).join(" · ")}</small>
                  </span>
                </Link>
                {p.phone && <a className="muted small" href={`https://wa.me/${p.phone.replace(/\D/g, "")}`}>{p.phone}</a>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
