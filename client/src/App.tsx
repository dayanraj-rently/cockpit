import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { fetchMe } from "./auth";
import type { AuthUser } from "./auth";
import { Signup } from "./Signup";
import { LoginForm } from "./LoginForm";
import { Home } from "./Home";
import { Dashboard } from "./Dashboard";
import { Settings } from "./Settings";
import { TimeLogger } from "./TimeLogger";
import { Kanban } from "./Kanban";
import { Issues } from "./Issues";
import { TimeBlocking } from "./TimeBlocking";
import { Notes } from "./Notes";
import { Admin } from "./Admin";

function RequireAuth({ user, children }: { user: AuthUser | null; children: React.ReactElement }) {
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ user, children }: { user: AuthUser; children: React.ReactElement }) {
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

function AppRoutes({
  user,
  onLoggedIn,
  onLoggedOut,
}: {
  user: AuthUser | null;
  onLoggedIn: (user: AuthUser) => void;
  onLoggedOut: () => void;
}) {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route
        path="/signup"
        element={user ? <Navigate to="/" replace /> : <Signup onSignedUp={onLoggedIn} />}
      />
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <LoginForm onLoggedIn={onLoggedIn} />}
      />
      <Route
        path="/"
        element={
          <RequireAuth user={user}>
            <Home user={user as AuthUser} onLoggedOut={onLoggedOut} />
          </RequireAuth>
        }
      />
      <Route
        path="/matrix"
        element={
          <RequireAuth user={user}>
            <Dashboard
              user={user as AuthUser}
              onLoggedOut={onLoggedOut}
              onOpenSettings={() => navigate("/settings")}
            />
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth user={user}>
            <Settings onDone={() => navigate("/")} onLoggedOut={onLoggedOut} />
          </RequireAuth>
        }
      />
      <Route
        path="/time-logger"
        element={
          <RequireAuth user={user}>
            <TimeLogger
              user={user as AuthUser}
              onLoggedOut={onLoggedOut}
              onOpenSettings={() => navigate("/settings")}
            />
          </RequireAuth>
        }
      />
      <Route
        path="/kanban"
        element={
          <RequireAuth user={user}>
            <Kanban
              user={user as AuthUser}
              onLoggedOut={onLoggedOut}
              onOpenSettings={() => navigate("/settings")}
            />
          </RequireAuth>
        }
      />
      <Route
        path="/issues"
        element={
          <RequireAuth user={user}>
            <Issues
              user={user as AuthUser}
              onLoggedOut={onLoggedOut}
              onOpenSettings={() => navigate("/settings")}
            />
          </RequireAuth>
        }
      />
      <Route
        path="/time-blocking"
        element={
          <RequireAuth user={user}>
            <TimeBlocking
              user={user as AuthUser}
              onLoggedOut={onLoggedOut}
              onOpenSettings={() => navigate("/settings")}
            />
          </RequireAuth>
        }
      />
      <Route
        path="/notes"
        element={
          <RequireAuth user={user}>
            <Notes user={user as AuthUser} onLoggedOut={onLoggedOut} onOpenSettings={() => navigate("/settings")} />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth user={user}>
            <RequireAdmin user={user as AuthUser}>
              <Admin
                user={user as AuthUser}
                onLoggedOut={onLoggedOut}
                onOpenSettings={() => navigate("/settings")}
              />
            </RequireAdmin>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .finally(() => setCheckingAuth(false));
  }, []);

  if (checkingAuth) return null;

  return (
    <BrowserRouter>
      <AppRoutes user={user} onLoggedIn={setUser} onLoggedOut={() => setUser(null)} />
    </BrowserRouter>
  );
}

export default App;
