import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMe } from "../auth";
import { useFamily } from "../data";
import { Avatar } from "../components/Avatar";
import { PersonForm } from "../components/PersonForm";
import { age, canAddToBranch, canEdit, canInvite, childrenOf, formatDate, fullName, lifeYears, siblingsOf } from "../lib/people";
import { createPerson, deletePerson, isGmail, sendInvite, updatePerson } from "../lib/mutations";
import { uploadPersonPhoto } from "../lib/photos";
import type { Person } from "../types";

type Mode = "view" | "edit" | "child" | "spouse" | "parent" | "invite";

function PersonChips({ title, list }: { title: string; list: Person[] }) {
  if (list.length === 0) return null;
  return (
    <div className="relatives">
      <h3>{title}</h3>
      <div className="chips">
        {list.map((p) => (
          <Link key={p.id} to={`/pessoa/${p.id}`} className="chip">
            <Avatar person={p} size={28} />
            <span>{fullName(p)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function InviteForm({ person, onDone }: { person: Person; onDone: () => void }) {
  const me = useMe();
  const [email, setEmail] = useState(person.email ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isGmail(email)) return setMsg("Use um endereço Gmail (termina em @gmail.com).");
    setBusy(true);
    try {
      await sendInvite(me, { email, name: fullName(person), branchId: person.branchId, role: "member", personId: person.id });
      setMsg("Convite enviado! A pessoa vai receber um e-mail com o link do site.");
      setTimeout(onDone, 2000);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível enviar.");
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <p>Convidar <b>{fullName(person)}</b> para o site. Só esta conta Gmail poderá entrar.</p>
      <label>Gmail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@gmail.com" autoFocus /></label>
      {msg && <p className="notice">{msg}</p>}
      <div className="actions">
        <button className="primary" disabled={busy}>Enviar convite</button>
        <button type="button" onClick={onDone}>Fechar</button>
      </div>
    </form>
  );
}

export function PersonPage() {
  const { id } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const { people, peopleById, branchesById } = useFamily();
  const [mode, setMode] = useState<Mode>("view");
  const person = id ? peopleById.get(id) : undefined;

  if (!person) return <p>Pessoa não encontrada. <Link to="/pessoas">Ver todos</Link></p>;

  const branch = person.branchId ? branchesById.get(person.branchId) : undefined;
  const parents = person.parentIds.map((x) => peopleById.get(x)).filter((x): x is Person => !!x);
  const spouses = person.spouseIds.map((x) => peopleById.get(x)).filter((x): x is Person => !!x);
  const children = childrenOf(person, people);
  const siblings = siblingsOf(person, people);
  const editable = canEdit(me, person);
  const canAdd = canAddToBranch(me, person.branchId) || me.role === "admin";
  const years = lifeYears(person);
  const a = age(person);

  async function save(fields: Parameters<typeof updatePerson>[1], photo: File | null) {
    if (photo) fields.photoURL = await uploadPersonPhoto(person!.id, photo);
    await updatePerson(person!.id, fields);
    setMode("view");
  }

  async function add(type: "child" | "spouse" | "parent", fields: Parameters<typeof createPerson>[1], photo: File | null, otherParentId: string | null) {
    const relation =
      type === "child" ? { type, of: person!, otherParentId } : { type, of: person! };
    const newId = await createPerson(me, fields, relation);
    if (photo) await updatePerson(newId, { photoURL: await uploadPersonPhoto(newId, photo) });
    setMode("view");
    navigate(`/pessoa/${newId}`);
  }

  async function remove() {
    if (!confirm(`Remover ${fullName(person!)} da árvore? Isso não pode ser desfeito.`)) return;
    await deletePerson(person!, people, (p) => canEdit(me, p));
    navigate("/pessoas");
  }

  // Ramo de quem for adicionado: o mesmo da pessoa (o admin pode trocar no formulário).
  const newBase = { branchId: person.branchId, lastName: person.lastName };

  return (
    <div className="person-page">
      <section className="card profile" style={{ borderTopColor: branch?.color }}>
        <Avatar person={person} size={96} />
        <div>
          <h1>{fullName(person)}{person.nickname && <span className="muted"> ({person.nickname})</span>}</h1>
          <p className="muted">
            {years}
            {a !== null && ` · ${a} anos`}
            {branch && <> · Ramo <Link to={`/ramo/${branch.id}`}>{branch.name}</Link></>}
            {person.uid && " · tem acesso ao site"}
          </p>
          <dl className="details">
            {person.birthDate && <><dt>Nascimento</dt><dd>{formatDate(person.birthDate)}</dd></>}
            {person.deathDate && <><dt>Falecimento</dt><dd>{formatDate(person.deathDate)}</dd></>}
            {person.city && <><dt>Cidade</dt><dd>{person.city}</dd></>}
            {person.phone && (
              <><dt>Telefone</dt><dd><a href={`https://wa.me/${person.phone.replace(/\D/g, "")}`}>{person.phone}</a></dd></>
            )}
            {person.email && <><dt>E-mail</dt><dd><a href={`mailto:${person.email}`}>{person.email}</a></dd></>}
          </dl>
          {person.bio && <p className="bio">{person.bio}</p>}
        </div>
      </section>

      {mode === "view" && (
        <div className="actions wrap">
          {editable && <button onClick={() => setMode("edit")}>Editar</button>}
          {canAdd && <button onClick={() => setMode("child")}>+ Filho(a)</button>}
          {canAdd && <button onClick={() => setMode("spouse")}>+ Cônjuge</button>}
          {canAdd && parents.length < 2 && <button onClick={() => setMode("parent")}>+ Pai / mãe</button>}
          {canInvite(me, person) && <button className="primary" onClick={() => setMode("invite")}>Convidar para o site</button>}
          {(me.role === "admin" || (editable && !person.uid && me.role === "rep")) && (
            <button className="danger" onClick={remove}>Remover</button>
          )}
        </div>
      )}

      {mode === "edit" && (
        <PersonForm
          initial={person}
          showBranch={me.role === "admin"}
          showParents={me.role === "admin" || me.role === "rep"}
          submitLabel="Salvar"
          onSubmit={(fields, { photo }) => save(fields, photo)}
          onCancel={() => setMode("view")}
        />
      )}
      {(mode === "child" || mode === "spouse" || mode === "parent") && (
        <>
          <h2>
            {mode === "child" && `Novo(a) filho(a) de ${person.firstName}`}
            {mode === "spouse" && `Cônjuge de ${person.firstName}`}
            {mode === "parent" && `Pai ou mãe de ${person.firstName}`}
          </h2>
          <PersonForm
            initial={mode === "child" ? newBase : { branchId: person.branchId }}
            showBranch={me.role === "admin"}
            otherParentChoices={mode === "child" ? spouses : undefined}
            submitLabel="Adicionar"
            onSubmit={(fields, { photo, otherParentId }) => add(mode, fields, photo, otherParentId)}
            onCancel={() => setMode("view")}
          />
        </>
      )}
      {mode === "invite" && <InviteForm person={person} onDone={() => setMode("view")} />}

      <section className="card">
        <PersonChips title="Pais" list={parents} />
        <PersonChips title={spouses.length > 1 ? "Cônjuges" : "Cônjuge"} list={spouses} />
        <PersonChips title="Filhos" list={children} />
        <PersonChips title="Irmãos" list={siblings} />
        {parents.length + spouses.length + children.length + siblings.length === 0 && (
          <p className="muted">Nenhum parente ligado ainda.</p>
        )}
        <p><Link to={`/arvore?p=${person.id}`}>Ver na árvore</Link></p>
      </section>
    </div>
  );
}
