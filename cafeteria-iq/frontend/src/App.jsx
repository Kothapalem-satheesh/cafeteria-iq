import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import LocalStudio from "./pages/LocalStudio";
import { Sidebar } from "./components/layout/Sidebar";

function Private({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 ml-[260px] min-h-screen">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Private>
            <Dashboard />
          </Private>
        }
      />
      <Route
        path="/local-studio/*"
        element={
          <Private>
            <LocalStudio />
          </Private>
        }
      />
      <Route path="/settings" element={<Navigate to="/" replace />} />
      <Route path="/clustering" element={<Navigate to="/local-studio/clusters" replace />} />
      <Route path="/explore" element={<Navigate to="/local-studio/visualization" replace />} />
      <Route path="/explore-demo" element={<Navigate to="/local-studio/visualization" replace />} />
      <Route path="/associations" element={<Navigate to="/local-studio/recommendations" replace />} />
      <Route path="/menu" element={<Navigate to="/local-studio/model" replace />} />
      <Route path="/transactions" element={<Navigate to="/local-studio/upload" replace />} />
      <Route path="/upload" element={<Navigate to="/local-studio/upload" replace />} />
      <Route path="/clusters/:runId/:clusterId" element={<Navigate to="/local-studio/clusters" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
