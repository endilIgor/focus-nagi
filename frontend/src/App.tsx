import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { LoginPage } from "./auth/LoginPage";
import { RequireAuth } from "./auth/RequireAuth";
import { AppShell } from "./layout/AppShell";
import { ThemeProvider } from "./theme/ThemeContext";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { ChecklistPage } from "./pages/ChecklistPage";
import { FocusPage } from "./pages/FocusPage";
import { JournalPage } from "./pages/JournalPage";
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
              <Route path="/checklist" element={<ChecklistPage />} />
              <Route path="/tarefas" element={<Navigate to="/checklist" replace />} />
              <Route path="/projetos" element={<Navigate to="/checklist" replace />} />
              <Route path="/metas" element={<Navigate to="/checklist" replace />} />
              <Route path="/notas" element={<Navigate to="/checklist" replace />} />
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
