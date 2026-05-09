import GlassCard from "../components/ui/GlassCard";

export default function Settings() {
  return (
    <div>
      <h1 className="display-font text-3xl">Settings</h1>
      <GlassCard className="mt-4">
        <p className="text-slate-400">API base is configured via VITE_API_URL. ML service: ensure backend .env ML_SERVICE_URL points to Flask (5001).</p>
      </GlassCard>
    </div>
  );
}
