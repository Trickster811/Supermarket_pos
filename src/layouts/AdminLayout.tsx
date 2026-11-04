import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Boxes,
  ShoppingCart,
  Users,
  Monitor,
  BarChart3,
  Settings,
  Menu,
  X,
  LogOut,
  Store,
  ClipboardList,
} from "lucide-react";
import { useAuth } from "../services/auth.context";

const navigation = [
  { label: "Overview", path: "/", icon: LayoutDashboard },
  { label: "Products", path: "/products", icon: Package },
  { label: "Inventory", path: "/inventory", icon: Boxes },
  { label: "Sales", path: "/sales", icon: ShoppingCart },
  { label: "Users", path: "/users", icon: Users },
  { label: "Terminals", path: "/terminals", icon: Monitor },
  { label: "Reports", path: "/reports", icon: BarChart3 },
  { label: "Audit Logs", path: "/audit-logs", icon: ClipboardList },
  { label: "Settings", path: "/settings", icon: Settings },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();

  const initials =
    user?.fullName
      ?.split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "A";
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {sidebarOpen && (
        <button
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-slate-950 text-slate-300 transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-orange-500 p-2 text-white">
              <Store size={19} />
            </div>
            <div>
              <p className="font-semibold text-white">Supermarket POS</p>
              <p className="text-xs text-slate-500">Administration</p>
            </div>
          </div>

          <button
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Management
          </p>

          {navigation.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  isActive
                    ? "bg-orange-500/15 font-medium text-orange-400"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4">
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5">
          <div className="flex items-center gap-3">
            <button
              className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Administration
              </p>
              <p className="text-xs text-slate-500">Manage your supermarket</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-800">
                {user?.fullName || "Administrator"}
              </p>
              <p className="text-xs text-slate-500">{user?.role || "ADMIN"}</p>
            </div>

            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-700">
              {initials}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl p-5 sm:p-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
