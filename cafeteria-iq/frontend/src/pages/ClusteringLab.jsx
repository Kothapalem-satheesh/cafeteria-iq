import { useState } from "react";
import { useClustering } from "../context/ClusteringContext";
import GlassCard from "../components/ui/GlassCard";
import { clustering } from "../services/api";
import toast from "react-hot-toast";

const algos = [
  { k: "KMeans", d: "Spherical, scalable", label: "K-Means" },
  { k: "DBSCAN", d: "Density + noise", label: "DBSCAN" },
  { k: "GMM", d: "Soft membership", label: "Gaussian Mix" },
  { k: "Hierarchical", d: "Nested structure", label: "Hierarchical" },
  { k: "Autoencoder", d: "Latent space", label: "Autoencoder" },
];

export default function ClusteringLab() {
  const [a, setA] = useState("KMeans");
  const [k, setK] = useState(4);
  const { runClustering, isRunning, progress } = useClustering();
  const [result, setR] = useState(null);

  const run = async () => {
    try {
      const r = await runClustering(a, { n_clusters: k, min_samples: 5, auto_k: a === "KMeans" });
      toast.success("Job queued — " + (r && r.runId));
      const poll = setInterval(async () => {
        const s = await clustering.getStatus();
        if (!s.data.running) {
          clearInterval(poll);
          const act = await clustering.getActive();
          setR(act.data);
        }
      }, 2000);
    } catch (e) {
      toast.error("Failed: " + (e.response?.data?.error || e.message));
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <GlassCard>
        <h2 className="display-font text-2xl mb-4">Algorithm</h2>
        <div className="grid grid-cols-2 gap-2">
          {algos.map((x) => (
            <button
              type="button"
              key={x.k}
              onClick={() => setA(x.k)}
              className={
                a === x.k
                  ? "p-3 rounded-lg border border-amber-400/50 bg-amber-500/10 text-left"
                  : "p-3 rounded-lg border border-white/10 text-left"
              }
            >
              <div className="font-medium">{x.label}</div>
              <div className="text-xs text-slate-500">{x.d}</div>
            </button>
          ))}
        </div>
        <div className="mt-4">
          <label className="text-sm">Clusters / components: {k}</label>
          <input
            type="range"
            min={2}
            max={10}
            value={k}
            onChange={(e) => setK(+e.target.value)}
            className="w-full"
          />
        </div>
        {progress && (
          <p className="text-sm text-amber-200 mt-2">
            {progress.message || progress.stage} {isRunning && "…"}
          </p>
        )}
        <button
          type="button"
          onClick={run}
          disabled={isRunning}
          className="mt-4 w-full py-3 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 text-navy-950"
        >
          {isRunning ? "Running…" : "Run Clustering"}
        </button>
      </GlassCard>
      <GlassCard>
        <h2 className="display-font text-2xl mb-4">Latest active run</h2>
        {result ? (
          <pre className="text-xs overflow-auto max-h-96">{JSON.stringify(result, null, 2)}</pre>
        ) : (
          <p className="text-slate-500">No run loaded yet. Start clustering after seeding data.</p>
        )}
      </GlassCard>
    </div>
  );
}
