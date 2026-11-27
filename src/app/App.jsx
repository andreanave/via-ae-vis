import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "../features/auth/AuthProvider.jsx";
import { AssistProvider, useActor } from "../lib/assist.jsx";
import LoginPage from "../features/auth/LoginPage.jsx";
import NewPasswordPage from "../features/auth/NewPasswordPage.jsx";
import InvitePage from "../features/invite/InvitePage.jsx";
import AppShell from "./AppShell.jsx";
import CoachConsole from "../features/coach/CoachConsole.jsx";
import AthleteCard from "../features/coach/AthleteCard.jsx";
import Agenda from "../features/coach/Agenda.jsx";
import AthleteHome from "../features/athlete/AthleteHome.jsx";
import MasterConsole from "../features/master/MasterConsole.jsx";
import DailyCheckin from "../features/checkin/DailyCheckin.jsx";
import WeeklyCheckin from "../features/checkin/WeeklyCheckin.jsx";

function Home() {
  const actor = useActor();
  return actor.role === "professional" || actor.isMaster ? <CoachConsole /> : <AthleteHome />;
}

function Routed() {
  const { session, profile, recovery } = useAuth();
  const actor = useActor();
  if (session === undefined) return <main className="center muted">Caricamento…</main>;
  if (!session) {
    return (
      <Routes>
        <Route path="/invito/:token" element={<InvitePage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  if (recovery) return <NewPasswordPage />;
  const isProfessional = actor.role === "professional" || actor.isMaster;
  return (
    <Routes>
      <Route path="/nuova-password" element={<NewPasswordPage />} />
      <Route path="/invito/:token" element={<InvitePage />} />
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="/checkin/:moment" element={<DailyCheckin />} />
        <Route path="/settimanale" element={<WeeklyCheckin />} />
        {isProfessional && <Route path="/atleti/:id" element={<AthleteCard />} />}
        {isProfessional && <Route path="/agenda" element={<Agenda />} />}
        {profile?.is_master && <Route path="/gestione" element={<MasterConsole />} />}
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
        <AssistProvider>
          <Routed />
        </AssistProvider>
      </AuthProvider>
    </HashRouter>
  );
}
