import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import "@/App.css";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Kapans from "@/pages/Kapans";
import KapanDetail from "@/pages/KapanDetail";
import Packets from "@/pages/Packets";
import Karigars from "@/pages/Karigars";
import Staff from "@/pages/Staff";
import PrintSettings from "@/pages/PrintSettings";
import Labels from "@/pages/Labels";
import Jangad from "@/pages/Jangad";

const Protected = ({ children }) => {
  const { user, ready } = useAuth();
  if (!ready) return <div className="p-8 text-sm text-zinc-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

const LoginGate = () => {
  const { user, ready } = useAuth();
  if (!ready) return <div className="p-8 text-sm text-zinc-500">Loading…</div>;
  if (user) return <Navigate to="/" replace />;
  return <Login />;
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/login" element={<LoginGate />} />
          <Route
            element={
              <Protected>
                <Layout />
              </Protected>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/kapans" element={<Kapans />} />
            <Route path="/kapans/:id" element={<KapanDetail />} />
            <Route path="/issue" element={<Packets mode="issue" />} />
            <Route path="/receive" element={<Packets mode="receive" />} />
            <Route path="/karigars" element={<Karigars />} />
            <Route path="/staff" element={<Staff />} />
            <Route path="/print-settings" element={<PrintSettings />} />
            <Route path="/labels" element={<Labels />} />
            <Route path="/jangad/:jangadNo" element={<Jangad />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
