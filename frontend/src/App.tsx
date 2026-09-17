import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { LoginPage } from "./auth/LoginPage";
import { RequireAuth } from "./auth/RequireAuth";
import { AppShell } from "./layout/AppShell";
import { ThemeProvider } from "./theme/ThemeContext";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { FocusPage } from "./pages/FocusPage";
import { GoalsPage } from "./pages/GoalsPage";
import { JournalPage } from "./pages/JournalPage";
import { NotesPage } from "./pages/NotesPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { TasksPage } from "./pages/TasksPage";
import { TodayPage } from "./pages/TodayPage";

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route path="/hoje" element={<TodayPage />} />
              <Route path="/foco" element={<FocusPage />} />
              <Route path="/tarefas" element={<TasksPage />} />
              <Route path="/projetos" element={<ProjectsPage />} />
              <Route path="/metas" element={<GoalsPage />} />
              <Route path="/notas" element={<NotesPage />} />
              <Route path="/diario" element={<JournalPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/" element={<Navigate to="/hoje" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/hoje" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
