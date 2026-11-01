import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { FamilyProvider } from "./data";
import { Layout } from "./components/Layout";
import { LoginPage, NotInvitedPage } from "./pages/LoginPage";
import { HomePage } from "./pages/HomePage";
import { TreePage } from "./pages/TreePage";
import { PeoplePage } from "./pages/PeoplePage";
import { PersonPage } from "./pages/PersonPage";
import { BranchPage } from "./pages/BranchPage";
import { AdminPage } from "./pages/AdminPage";

function Gate() {
  const state = useAuth();
  if (state.kind === "loading") return <div className="login"><p className="muted">Carregando…</p></div>;
  if (state.kind === "signedOut") return <LoginPage />;
  if (state.kind === "notInvited") return <NotInvitedPage email={state.user.email} message={state.message} />;
  return (
    <FamilyProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="arvore" element={<TreePage />} />
          <Route path="pessoas" element={<PeoplePage />} />
          <Route path="pessoa/:id" element={<PersonPage />} />
          <Route path="ramo/:id" element={<BranchPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="*" element={<HomePage />} />
        </Route>
      </Routes>
    </FamilyProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
