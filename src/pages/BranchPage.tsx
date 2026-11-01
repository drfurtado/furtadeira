import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useMe } from "../auth";
import { useFamily } from "../data";
import { Avatar } from "../components/Avatar";
import { PersonForm } from "../components/PersonForm";
import { canAddToBranch, fullName, lifeYears } from "../lib/people";
import { cancelInvite, createPerson, resendInvite, updatePerson } from "../lib/mutations";
import { uploadPersonPhoto } from "../lib/photos";
import type { Invite } from "../types";

const STATUS: Record<Invite["status"], string> = { pending: "Aguardando", accepted: "Aceito", cancelled: "Cancelado" };

export function BranchPage() {
  const { id } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const { people, branchesById, peopleById, users } = useFamily();
  const [adding, setAdding] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const branch = id ? branchesById.get(id) : undefined;
  const manage = !!branch && canAddToBranch(me, branch.id);

  useEffect(() => {
    if (!branch || !manage) return;
    return onSnapshot(query(collection(db, "invites"), where("branchId", "==", branch.id)), (s) =>
      setInvites(s.docs.map((d) => ({ ...d.data(), id: d.id }) as Invite)),
    );
  }, [branch?.id, manage]);

  if (!branch) return <p>Ramo não encontrado.</p>;

  const members = people
    .filter((p) => p.branchId === branch.id)
    .sort((a, b) => (a.birthDate ?? "9999").localeCompare(b.birthDate ?? "9999"));
  const head = branch.personId ? peopleById.get(branch.personId) : undefined;
  const reps = users.filter((u) => u.role === "rep" && u.branchId === branch.id);

  return (
    <div>
      <h1 style={{ borderLeft: `8px solid ${branch.color}`, paddingLeft: 12 }}>Ramo {branch.name}</h1>
      <p className="muted">
        {members.length} pessoas
        {reps.length > 0 && <> · Representante: {reps.map((r) => r.displayName).join(", ")}</>}
        {head && <> · <Link to={`/arvore?p=${head.id}`}>ver na árvore</Link></>}
      </p>

      {manage && !adding && (
        <div className="actions">
          <button className="primary" onClick={() => setAdding(true)}>+ Adicionar pessoa ao ramo</button>
        </div>
      )}
      {manage && (
        <p className="muted small">
          Dica: para ligar a pessoa à árvore, abra o perfil do pai ou da mãe e use “+ Filho(a)”, ou do marido/esposa e use “+ Cônjuge”.
          Para dar acesso ao site, abra o perfil e use “Convidar para o site”.
        </p>
      )}
      {adding && (
        <PersonForm
          initial={{ branchId: branch.id }}
          showBranch={false}
          showParents
          submitLabel="Adicionar"
          onCancel={() => setAdding(false)}
          onSubmit={async (fields, { photo }) => {
            const newId = await createPerson(me, { ...fields, branchId: branch.id });
            if (fields.parentIds.length) await updatePerson(newId, { parentIds: fields.parentIds });
            if (photo) await updatePerson(newId, { photoURL: await uploadPersonPhoto(newId, photo) });
            navigate(`/pessoa/${newId}`);
          }}
        />
      )}

      <section className="card">
        <ul className="people-list">
          {members.map((p) => (
            <li key={p.id}>
              <Link to={`/pessoa/${p.id}`}>
                <Avatar person={p} size={40} />
                <span>
                  <b>{fullName(p)}</b>
                  <small className="muted">{[lifeYears(p), p.city, p.uid ? "no site" : ""].filter(Boolean).join(" · ")}</small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {manage && invites.length > 0 && (
        <section className="card">
          <h2>Convites</h2>
          <table className="table">
            <thead><tr><th>Nome</th><th>Gmail</th><th>Situação</th><th /></tr></thead>
            <tbody>
              {invites.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.name}</td>
                  <td>{inv.email}</td>
                  <td>{STATUS[inv.status]}{inv.role === "rep" ? " (representante)" : ""}</td>
                  <td className="actions">
                    {inv.status !== "accepted" && <button onClick={() => resendInvite(inv.email, inv.sendCount)}>Reenviar</button>}
                    {inv.status === "pending" && <button onClick={() => cancelInvite(inv.email)}>Cancelar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
