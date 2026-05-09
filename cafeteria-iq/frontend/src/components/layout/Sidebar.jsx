import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  MonitorSmartphone,
} from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { useClustering } from "../../context/ClusteringContext";
import clsx from "clsx";

const items = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/local-studio/model", label: "Model Selection", icon: MonitorSmartphone },
  { to: "/local-studio/clusters", label: "Clusters", icon: MonitorSmartphone },
  { to: "/local-studio/visualization", label: "Visualization", icon: MonitorSmartphone },
  { to: "/local-studio/recommendations", label: "Recommendations", icon: MonitorSmartphone },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const { activeRun, isRunning } = useClustering();
  const nav = useNavigate();

  return (
    <aside
      className="fixed left-0 top-0 h-full w-[260px] z-30 border-r border-amber-400/15"
      style={{ background: "#0a1628" }}
    >
      <div className="p-4 border-b border-white/5">
        <div className="flex items-center gap-2 text-amber-300">
          <span className="text-2xl">⸙</span>
          <span className="display-font text-2xl tracking-widest">CafeIQ</span>
        </div>
      </div>
      <nav className="p-2 mt-2">
        {items.map((it, i) => (
          <motion.div
            key={it.to}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <NavLink
              to={it.to}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-sm",
                  isActive
                    ? "bg-amber-500/10 text-amber-300 border-l-4 border-amber-400 pl-2"
                    : "text-slate-300 hover:bg-white/5"
                )
              }
            >
              <it.icon size={18} />
              {it.label}
            </NavLink>
          </motion.div>
        ))}
      </nav>
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/5">
        {activeRun && (
          <p className="text-xs text-emerald-400 mb-2">
            {isRunning ? "⏳ Clustering…" : `Active: ${activeRun.algorithm || "—"}`}
          </p>
        )}
        <div className="text-xs text-slate-400">
          {user && (
            <p>
              {user.name} · {user.role}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            logout();
            nav("/login");
          }}
          className="mt-2 text-sm text-amber-300/80 hover:text-amber-200"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
