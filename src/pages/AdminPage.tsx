import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { useMe } from "../auth";
import { useFamily } from "../data";
import { fullName } from "../lib/people";
import { cancelInvite, isGmail, resendInvite, sendInvite } from "../lib/mutations";
import type { Branch, FamilyUser, Invite, Role } from "../types";

const COLORS = ["#c0392b", "#d35400", "#b7950b", "#27ae60", "#16a085", "#2980b9", "#8e44ad", "#c2185b", "#6d4c41", "#546e7a"];
const ROLE: Record<Role, string> = { admin: "Admin", rep: "Representante", member: "Membro" };

function BranchEditor({ branch, onDone }: { branch?: Branch; onDone: () => void }) {
  const { branches, people } = useFamily();
  const [name, setName] = useState(branch?.name ?? "");
  const [color, setColor] = useState(branch?.color ?? COLORS[branches.length % COLORS.length]);
  const [personId, setPersonId] = useState(branch?.personId ?? "");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Dê um nome ao ramo (por exemplo, o nome do irmão ou irmã).");
    const ref = branch ? doc(db, "branches", branch.id) : doc(collection(db, "branches"));
    await setDoc(ref, {
      name: name.trim(),
      color,
      personId: personId || null,
      order: branch?.order ?? branches.length,
    });
    // O irmão ou irmã que dá nome ao ramo passa a pertencer a ele.
    if (personId) await updateDoc(doc(db, "people", personId), { branchId: ref.id });
    onDone();
  }

  return (
    <form className="card form" onSubmit={submit}>
      <div className="grid2">
        <label>Nome do ramo<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Maria" autoFocus /></label>
        <label>
          Irmão ou irmã
          <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">— cadastre antes na árvore —</option>
            {people.slice().sort((a, b) => a.firstName.localeCompare(b.firstName)).map((p) => (
              <option key={p.id} value={p.id}>{fullName(p)}</option>
            ))}
          </select>
        </label>
        <label>
          Cor
          <div className="colors">
            {COLORS.map((c) => (
              <button type="button" key={c} className={`swatch ${c === color ? "on" : ""}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
            ))}
          </div>
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="primary">Salvar</button>
        <button type="button" onClick={onDone}>Cancelar</button>
        {branch && (
          <button type="button" className="danger" onClick={async () => {
            if (confirm(`Apagar o ramo ${branch.name}? As pessoas continuam cadastradas.`)) {
              await deleteDoc(doc(db, "branches", branch.id));
              onDone();
            }
          }}>Apagar ramo</button>
        )}
      </div>
    </form>
  );
}

function RepInvite({ branch }: { branch: Branch }) {
  const me = useMe();
  const { peopleById } = useFamily();
  const head = branch.personId ? peopleById.get(branch.personId) : undefined;
  const [email, setEmail] = useState(head?.email ?? "");
  const [name, setName] = useState(head ? fullName(head) : "");
  const [msg, setMsg] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isGmail(email)) return setMsg("Use um endereço Gmail.");
    try {
      await sendInvite(me, { email, name, branchId: branch.id, role: "rep", personId: head && !head.uid ? head.id : null });
      setMsg("Convite de representante enviado.");
      setEmail("");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro ao enviar.");
    }
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="gmail do representante" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button>Convidar representante</button>
      {msg && <span className="small muted">{msg}</span>}
    </form>
  );
}

/** O admin entra sem convite; aqui ele diz quem é na árvore. */
function LinkMyself() {
  const me = useMe();
  const { people, peopleById } = useFamily();
  const current = me.personId ? peopleById.get(me.personId) : undefined;
  const [choice, setChoice] = useState("");

  async function link() {
    if (!choice) return;
    const batch = writeBatch(db);
    if (current) batch.update(doc(db, "people", current.id), { uid: null });
    batch.update(doc(db, "people", choice), { uid: me.id, email: me.email });
    batch.update(doc(db, "users", me.id), { personId: choice });
    await batch.commit();
    setChoice("");
  }

  const options = people.filter((p) => !p.uid).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  return (
    <section className="card">
      <h2>Você na árvore</h2>
      <p className="muted small">
        {current ? <>Sua conta está ligada a <Link to={`/pessoa/${current.id}`}>{fullName(current)}</Link>.</> : "Sua conta ainda não está ligada a ninguém da árvore. Cadastre-se como filho dos seus pais e escolha aqui."}
      </p>
      <div className="inline-form">
        <select value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">Escolha a pessoa…</option>
          {options.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
        </select>
        <button onClick={link} disabled={!choice}>Sou eu</button>
      </div>
    </section>
  );
}

export function AdminPage() {
  const me = useMe();
  const { branches, users } = useFamily();
  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);

  useEffect(() => onSnapshot(collection(db, "invites"), (s) => setInvites(s.docs.map((d) => ({ ...d.data(), id: d.id }) as Invite))), []);

  if (me.role !== "admin") return <p>Somente o administrador vê esta página.</p>;

  async function setRole(u: FamilyUser, role: Role) {
    await updateDoc(doc(db, "users", u.id), { role });
  }
  async function setBlocked(u: FamilyUser, blocked: boolean) {
    if (blocked && !confirm(`Bloquear o acesso de ${u.displayName}?`)) return;
    await updateDoc(doc(db, "users", u.id), { status: blocked ? "blocked" : "active" });
    // Sem convite válido, a conta também não passa pela barreira de login.
    const inv = invites.find((i) => i.email === u.email);
    if (inv && blocked) await cancelInvite(inv.email);
    if (inv && !blocked) await resendInvite(inv.email, inv.sendCount);
  }

  return (
    <div>
      <h1>Administração</h1>
      <LinkMyself />

      <section className="card">
        <h2>Ramos (um por irmão ou irmã)</h2>
        <p className="muted small">
          Ordem sugerida: 1) cadastre os avós e os pais na árvore (sem ramo); 2) cadastre os 10 irmãos como filhos dos pais;
          3) crie um ramo para cada irmão; 4) convide um representante por ramo.
        </p>
        <table className="table">
          <thead><tr><th>Ramo</th><th>Representante</th><th /></tr></thead>
          <tbody>
            {branches.map((b) => {
              const reps = users.filter((u) => u.branchId === b.id && u.role === "rep");
              const pending = invites.filter((i) => i.branchId === b.id && i.role === "rep" && i.status === "pending");
              return (
                <tr key={b.id}>
                  <td><span className="dot" style={{ background: b.color }} /> <Link to={`/ramo/${b.id}`}>{b.name}</Link></td>
                  <td>
                    {reps.map((r) => r.displayName).join(", ")}
                    {pending.map((i) => <div key={i.id} className="small muted">Convite enviado para {i.email}</div>)}
                    {reps.length === 0 && pending.length === 0 && <RepInvite branch={b} />}
                  </td>
                  <td><button onClick={() => setEditing(b)}>Editar</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {editing ? (
          <BranchEditor branch={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />
        ) : (
          <div className="actions"><button className="primary" onClick={() => setEditing("new")}>+ Novo ramo</button></div>
        )}
      </section>

      <section className="card">
        <h2>Contas com acesso ({users.length})</h2>
        <table className="table">
          <thead><tr><th>Nome</th><th>Gmail</th><th>Ramo</th><th>Papel</th><th /></tr></thead>
          <tbody>
            {users.slice().sort((a, b) => a.displayName.localeCompare(b.displayName)).map((u) => (
              <tr key={u.id} className={u.status === "blocked" ? "blocked" : ""}>
                <td>{u.personId ? <Link to={`/pessoa/${u.personId}`}>{u.displayName}</Link> : u.displayName}</td>
                <td>{u.email}</td>
                <td>{branches.find((b) => b.id === u.branchId)?.name ?? "—"}</td>
                <td>
                  {u.id === me.id ? ROLE[u.role] : (
                    <select value={u.role} onChange={(e) => setRole(u, e.target.value as Role)}>
                      {(Object.keys(ROLE) as Role[]).map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}
                    </select>
                  )}
                </td>
                <td>
                  {u.id !== me.id && (
                    <button onClick={() => setBlocked(u, u.status !== "blocked")}>{u.status === "blocked" ? "Desbloquear" : "Bloquear"}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
