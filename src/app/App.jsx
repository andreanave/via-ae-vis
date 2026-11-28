import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "../features/auth/AuthProvider.jsx";
import { AssistProvider, useActor } from "../lib/assist.jsx";
import { BrandProvider } from "../lib/brand.jsx";
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
import CatalogPage from "../features/nutrition/CatalogPage.jsx";
import TrainingHome from "../features/training/TrainingHome.jsx";
import GymSession from "../features/training/GymSession.jsx";
import MyWorkouts from "../features/training/MyWorkouts.jsx";
import ProgramEditor from "../features/training/ProgramEditor.jsx";
import ExerciseCatalog from "../features/training/ExerciseCatalog.jsx";
import Conversations from "../features/messages/Conversations.jsx";
import Chat from "../features/messages/Chat.jsx";
import NotificationsPage from "../features/messages/NotificationsPage.jsx";
import AthletePlan from "../features/nutrition/AthletePlan.jsx";
import MealPage from "../features/nutrition/MealPage.jsx";
import DayTimes from "../features/athlete/DayTimes.jsx";
import ProgressPage from "../features/progress/ProgressPage.jsx";

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
  // Le rotte dipendono dal ruolo: aspettare il profilo evita che un link diretto (es. #/atleti/:id) finisca sulla Home.
  if (!profile) return <main className="center muted">Caricamento…</main>;
  const isProfessional = actor.role === "professional" || actor.isMaster;
  return (
    <Routes>
      <Route path="/nuova-password" element={<NewPasswordPage />} />
      <Route path="/invito/:token" element={<InvitePage />} />
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="/checkin/:moment" element={<DailyCheckin />} />
        <Route path="/settimanale" element={<WeeklyCheckin />} />
        <Route path="/catalogo" element={<CatalogPage />} />
        <Route path="/allenamento" element={<TrainingHome />} />
        <Route path="/allenamento/seduta/:workoutId" element={<GymSession />} />
        <Route path="/allenamento/storico" element={<MyWorkouts />} />
        <Route path="/messaggi" element={<Conversations />} />
        <Route path="/messaggi/:linkId" element={<Chat />} />
        <Route path="/notifiche" element={<NotificationsPage />} />
        <Route path="/alimentazione" element={<AthletePlan />} />
        <Route path="/alimentazione/pasto/:mealKey" element={<MealPage />} />
        <Route path="/orari" element={<DayTimes />} />
        <Route path="/andamento" element={<ProgressPage />} />
        {isProfessional && <Route path="/atleti/:id" element={<AthleteCard />} />}
        {isProfessional && <Route path="/atleti/:id/allenamento" element={<ProgramEditor />} />}
        {isProfessional && <Route path="/esercizi" element={<ExerciseCatalog />} />}
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
          <BrandProvider>
            <Routed />
          </BrandProvider>
        </AssistProvider>
      </AuthProvider>
    </HashRouter>
  );
}
