import { useState, type FormEvent } from "react";
import { useFamily } from "../data";
import type { PersonFields } from "../lib/mutations";
import type { Person } from "../types";

interface Props {
  initial?: Partial<Person>;
  showBranch: boolean;
  showParents?: boolean; // editar pais (para corrigir a árvore)
  otherParentChoices?: Person[]; // ao adicionar filho: escolher o outro pai/mãe
  submitLabel: string;
  onSubmit: (fields: PersonFields, extra: { photo: File | null; otherParentId: string | null }) => Promise<void>;
  onCancel: () => void;
}

export function PersonForm({ initial = {}, showBranch, showParents, otherParentChoices, submitLabel, onSubmit, onCancel }: Props) {
  const { branches, people } = useFamily();
  const [f, setF] = useState({
    firstName: initial.firstName ?? "",
    lastName: initial.lastName ?? "",
    nickname: initial.nickname ?? "",
    gender: initial.gender ?? "",
    birthDate: initial.birthDate ?? "",
    deceased: initial.deceased ?? false,
    deathDate: initial.deathDate ?? "",
    city: initial.city ?? "",
    phone: initial.phone ?? "",
    email: initial.email ?? "",
    bio: initial.bio ?? "",
    branchId: initial.branchId ?? "",
    parent1: initial.parentIds?.[0] ?? "",
    parent2: initial.parentIds?.[1] ?? "",
  });
  const [otherParentId, setOtherParentId] = useState<string>(otherParentChoices?.[0]?.id ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.firstName.trim()) return setError("Informe o nome.");
    setBusy(true);
    setError("");
    try {
      const fields: PersonFields = {
        firstName: f.firstName.trim(),
        lastName: f.lastName.trim(),
        nickname: f.nickname.trim(),
        gender: f.gender as Person["gender"],
        birthDate: f.birthDate,
        deceased: f.deceased || !!f.deathDate,
        deathDate: f.deathDate,
        city: f.city.trim(),
        phone: f.phone.trim(),
        email: f.email.trim(),
        bio: f.bio.trim(),
        branchId: f.branchId || null,
        parentIds: showParents ? [f.parent1, f.parent2].filter(Boolean) : initial.parentIds ?? [],
        spouseIds: initial.spouseIds ?? [],
      };
      await onSubmit(fields, { photo, otherParentId: otherParentId || null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
      setBusy(false);
    }
  }

  const parentOptions = people
    .filter((p) => p.id !== initial.id)
    .sort((a, b) => a.firstName.localeCompare(b.firstName));

  return (
    <form className="card form" onSubmit={submit}>
      <div className="grid2">
        <label>Nome*<input value={f.firstName} onChange={set("firstName")} autoFocus /></label>
        <label>Sobrenome<input value={f.lastName} onChange={set("lastName")} /></label>
        <label>Apelido<input value={f.nickname} onChange={set("nickname")} /></label>
        <label>
          Sexo
          <select value={f.gender} onChange={set("gender")}>
            <option value="">—</option>
            <option value="F">Feminino</option>
            <option value="M">Masculino</option>
          </select>
        </label>
        <label>Nascimento<input type="date" value={f.birthDate} onChange={set("birthDate")} /></label>
        <label className="check">
          <input type="checkbox" checked={f.deceased} onChange={(e) => setF({ ...f, deceased: e.target.checked })} />
          Falecido(a)
        </label>
        {f.deceased && <label>Falecimento<input type="date" value={f.deathDate} onChange={set("deathDate")} /></label>}
        <label>Cidade<input value={f.city} onChange={set("city")} /></label>
        <label>Telefone / WhatsApp<input type="tel" value={f.phone} onChange={set("phone")} /></label>
        <label>E-mail de contato<input type="email" value={f.email} onChange={set("email")} /></label>
        <label>
          Foto
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        </label>
        {showBranch && (
          <label>
            Ramo
            <select value={f.branchId} onChange={set("branchId")}>
              <option value="">Sem ramo (avós, pais, tios)</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        {otherParentChoices && otherParentChoices.length > 0 && (
          <label>
            Outro pai / mãe
            <select value={otherParentId} onChange={(e) => setOtherParentId(e.target.value)}>
              {otherParentChoices.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
              <option value="">Nenhum / não cadastrado</option>
            </select>
          </label>
        )}
        {showParents && (
          <>
            <label>
              Pai / mãe 1
              <select value={f.parent1} onChange={set("parent1")}>
                <option value="">—</option>
                {parentOptions.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
              </select>
            </label>
            <label>
              Pai / mãe 2
              <select value={f.parent2} onChange={set("parent2")}>
                <option value="">—</option>
                {parentOptions.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
              </select>
            </label>
          </>
        )}
      </div>
      <label>Sobre<textarea rows={3} value={f.bio} onChange={set("bio")} /></label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="submit" className="primary" disabled={busy}>{busy ? "Salvando…" : submitLabel}</button>
        <button type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </form>
  );
}
