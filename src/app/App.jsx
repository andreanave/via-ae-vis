import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "../features/auth/AuthProvider.jsx";
import LoginPage from "../features/auth/LoginPage.jsx";
import NewPasswordPage from "../features/auth/NewPasswordPage.jsx";
import AppShell from "./AppShell.jsx";
import CoachConsole from "../features/coach/CoachConsole.jsx";
import AthleteHome from "../features/athlete/AthleteHome.jsx";

function Routed() {
  const { session, profile, recovery } = useAuth();
  if (session === undefined) return <main className="center muted">Caricamento…</main>;
  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  if (recovery) return <NewPasswordPage />;
  const isProfessional = profile?.role === "professional" || profile?.is_master;
  return (
    <Routes>
      <Route path="/nuova-password" element={<NewPasswordPage />} />
      <Route element={<AppShell />}>
        <Route index element={isProfessional ? <CoachConsole /> : <AthleteHome />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  // HashRouter: funziona su GitHub Pages senza regole di riscrittura lato server.
  return (
    <HashRouter>
      <AuthProvider>
        <Routed />
      </AuthProvider>
    </HashRouter>
  );
}
