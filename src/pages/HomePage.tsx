import { Link } from "react-router-dom";
import { useMe } from "../auth";
import { useFamily } from "../data";
import { Avatar } from "../components/Avatar";
import { fullName, upcomingBirthdays } from "../lib/people";

export function HomePage() {
  const me = useMe();
  const { people, branches, peopleById } = useFamily();
  const mine = me.personId ? peopleById.get(me.personId) : undefined;
  const birthdays = upcomingBirthdays(people, 30);
  const first = (me.displayName || "").split(" ")[0];

  return (
    <div>
      <h1>Olá, {mine?.firstName ?? first}!</h1>
      {mine && !mine.birthDate && (
        <p className="notice">
          Complete seu perfil (data de nascimento, cidade, foto). <Link to={`/pessoa/${mine.id}`}>Abrir meu perfil</Link>
        </p>
      )}
      {me.role === "admin" && !mine && (
        <p className="notice">
          Bem-vindo, administrador. Comece pela <Link to="/admin">página Admin</Link>: cadastre avós, pais e irmãos, crie os ramos e convide os representantes.
        </p>
      )}
      {me.role === "rep" && me.branchId && (
        <p className="notice">
          Você é representante do seu ramo: cadastre sua família e convide quem tem Gmail.{" "}
          <Link to={`/ramo/${me.branchId}`}>Abrir meu ramo</Link>
        </p>
      )}

      <section className="card">
        <h2>Ramos da família</h2>
        {branches.length === 0 && <p className="muted">Nenhum ramo criado ainda.</p>}
        <div className="branch-grid">
          {branches.map((b) => {
            const count = people.filter((p) => p.branchId === b.id).length;
            return (
              <Link key={b.id} to={`/ramo/${b.id}`} className="branch-tile" style={{ borderColor: b.color }}>
                <b>{b.name}</b>
                <span className="muted">{count} pessoa{count === 1 ? "" : "s"}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2>Aniversários nos próximos 30 dias</h2>
        {birthdays.length === 0 && <p className="muted">Nenhum aniversário nos próximos dias.</p>}
        <ul className="people-list">
          {birthdays.map(({ person, next, inDays }) => (
            <li key={person.id}>
              <Link to={`/pessoa/${person.id}`}>
                <Avatar person={person} size={36} />
                <span>
                  <b>{fullName(person)}</b>
                  <small className="muted">
                    {inDays === 0 ? "Hoje!" : inDays === 1 ? "Amanhã" : next.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}
                    {" · "}faz {next.getFullYear() - Number(person.birthDate!.slice(0, 4))} anos
                  </small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
