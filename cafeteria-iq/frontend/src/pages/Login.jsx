import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

const base =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL) ||
  "http://localhost:5000/api";

function loginErrorMessage(err) {
  if (err.isNetwork)
    return `Cannot reach API (${base.replace(/\/api$/, "")}). In folder backend, run: npm run dev:stack (full stack) or npm run dev (API only; needs MongoDB + seed).`;
  if (err.status === 401)
    return "Invalid email/password. Check your user in backend seed data.";
  if (err.response?.data?.error)
    return String(err.response.data.error);
  return "Login failed. Check backend logs.";
}

export default function Login() {
  const [email, setE] = useState("");
  const [pass, setP] = useState("");
  const { login } = useAuth();
  const nav = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email, pass);
      toast.success("Welcome");
      nav("/");
    } catch (err) {
      toast.error(loginErrorMessage(err));
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      <div
        className="relative p-10 flex flex-col justify-center"
        style={{
          background: "radial-gradient(ellipse at 20% 30%, #1e3a6e, #020817 60%)",
        }}
      >
        <h1 className="display-font text-6xl text-amber-200 tracking-[0.2em]">CafeIQ</h1>
        <p className="text-slate-300 mt-4 max-w-sm">
          Unsupervised intelligence for menu optimization. Clustering, embeddings, and market basket
          analysis — no labels required.
        </p>
        <div className="mt-8 flex gap-4 text-amber-400/60 text-sm">
          <span>KMeans</span>
          <span>DBSCAN</span>
          <span>GMM</span>
          <span>t-SNE</span>
        </div>
      </div>
      <div className="flex items-center justify-center p-8">
        <motion.form
          onSubmit={onSubmit}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md glass-card p-8"
        >
          <h2 className="display-font text-3xl text-center mb-6">Welcome Back</h2>
          <label className="block text-sm text-slate-400 mb-1">Email</label>
          <input
            className="w-full bg-navy-900/50 border border-white/10 rounded-lg px-3 py-2 mb-4"
            value={email}
            onChange={(e) => setE(e.target.value)}
            type="email"
            autoComplete="email"
          />
          <label className="block text-sm text-slate-400 mb-1">Password</label>
          <input
            className="w-full bg-navy-900/50 border border-white/10 rounded-lg px-3 py-2 mb-4"
            value={pass}
            onChange={(e) => setP(e.target.value)}
            type="password"
            autoComplete="current-password"
          />
          <button
            type="submit"
            className="w-full py-2 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 text-navy-950 font-medium"
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => nav("/local-studio")}
            className="w-full mt-4 py-2 rounded-lg border border-emerald-500/30 text-emerald-200"
          >
            Open Full Local Studio (No DB)
          </button>
          <p className="text-xs text-slate-500 mt-6 leading-relaxed">
            Easiest: in <code className="text-slate-400">backend</code> run{" "}
            <code className="text-slate-400">npm run dev:stack</code> (in-memory Mongo, seed, API :5000, ML :5001, Vite). Or use
            your own <code className="text-slate-400">MONGODB_URI</code> in <code className="text-slate-400">backend/.env</code>{" "}
            and run <code className="text-slate-400">npm run dev</code> plus <code className="text-slate-400">npm run seed</code>.
          </p>
        </motion.form>
      </div>
    </div>
  );
}
