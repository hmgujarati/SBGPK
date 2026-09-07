import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Diamond,
  Gauge,
  Package,
  ArrowsLeftRight,
  Users,
  UserGear,
  Printer,
  SignOut,
  List,
  X,
} from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Dashboard", icon: Gauge, testid: "nav-dashboard" },
  { to: "/kapans", label: "Kapan", icon: Diamond, testid: "nav-kapans" },
  { to: "/issue", label: "Packet Issue", icon: ArrowsLeftRight, testid: "nav-issue" },
  { to: "/receive", label: "Packet Receive", icon: Package, testid: "nav-receive" },
  { to: "/karigars", label: "Karigar", icon: Users, testid: "nav-karigars" },
  { to: "/staff", label: "Staff & Admin", icon: UserGear, testid: "nav-staff", perm: "can_manage_staff" },
  { to: "/print-settings", label: "Print Settings", icon: Printer, testid: "nav-print-settings", perm: "can_manage_staff" },
];

export const Layout = () => {
  const { user, logout, can } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const items = NAV.filter((n) => !n.perm || can(n.perm));

  const doLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-zinc-900">
      {/* Top bar */}
      <header className="no-print sticky top-0 z-40 border-b border-black/10 bg-white/80 backdrop-blur-xl">
        <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
          <button
            data-testid="mobile-menu-toggle"
            className="lg:hidden rounded border border-black/10 p-1.5 transition-colors hover:bg-zinc-100"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={18} /> : <List size={18} />}
          </button>
          <Link to="/" className="flex items-center gap-2" data-testid="brand-link">
            <span className="grid h-7 w-7 place-items-center bg-zinc-900 text-[#B4975A]">
              <Diamond size={16} weight="fill" />
            </span>
            <span className="font-heading text-sm font-bold uppercase tracking-[0.18em]">
              Polki<span className="text-[#B4975A]">Track</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-xs font-semibold leading-tight" data-testid="current-user-name">
                {user?.name}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">{user?.role}</div>
            </div>
            <Button
              data-testid="logout-button"
              variant="outline"
              size="sm"
              onClick={doLogout}
              className="h-8 rounded-none border-black/15 transition-colors"
            >
              <SignOut size={14} className="mr-1" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`no-print fixed inset-y-14 left-0 z-30 w-60 shrink-0 border-r border-black/10 bg-white transition-transform lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <nav className="flex flex-col gap-0.5 p-3">
            {items.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                data-testid={n.testid}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `group flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? "bg-zinc-900 font-semibold text-white"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  }`
                }
              >
                <n.icon size={17} />
                {n.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        {open && (
          <div
            className="no-print fixed inset-0 z-20 bg-black/30 lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}

        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
