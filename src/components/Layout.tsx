import { NavLink, Outlet, Link } from "react-router-dom";
import { logout, useMe } from "../auth";
import { useFamily } from "../data";
import { Avatar } from "./Avatar";

export function Layout() {
  const me = useMe();
  const { peopleById, loading } = useFamily();
  const mine = me.personId ? peopleById.get(me.personId) : undefined;

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">Furtadeira</Link>
        <nav className="nav">
          <NavLink to="/" end>Início</NavLink>
          <NavLink to="/arvore">Árvore</NavLink>
          <NavLink to="/pessoas">Pessoas</NavLink>
          {me.role === "admin" && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <div className="me">
          {mine && (
            <Link to={`/pessoa/${mine.id}`} title="Meu perfil">
              <Avatar person={mine} size={32} />
            </Link>
          )}
          <button className="link" onClick={logout}>Sair</button>
        </div>
      </header>
      <main className="content">{loading ? <p className="muted">Carregando a família…</p> : <Outlet />}</main>
    </div>
  );
}
