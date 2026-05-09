import { useState, useEffect } from "react";
import Plot from "react-plotly.js";
import Papa from "papaparse";
import { reduction } from "../services/api";
import GlassCard from "../components/ui/GlassCard";

function hashNoise(str, seed = 0) {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

async function loadCsvProjection() {
  const res = await fetch("/data/transactions.csv");
  const text = await res.text();
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  const rows = parsed.data || [];
  const slotMap = { Breakfast: -1.8, Lunch: 0.9, Snacks: -0.4, Dinner: 2.2 };
  const labelMap = { Breakfast: 0, Lunch: 1, Snacks: 2, Dinner: 3 };
  const maxAmount = Math.max(...rows.map((r) => Number(r.total_amount || r.totalAmount || 0)), 1);

  const points = rows.map((r, idx) => {
    const slot = r.time_slot || r.timeSlot || "Snacks";
    const cid = r.customer_id || r.customerId || `C${idx + 1}`;
    const amount = Number(r.total_amount || r.totalAmount || 0);
    const nx = hashNoise(`${cid}-x`, idx) - 0.5;
    const ny = hashNoise(`${cid}-y`, idx) - 0.5;
    const x = (slotMap[slot] ?? 0) + nx * 0.9;
    const y = (amount / maxAmount) * 8 + ny * 1.1;
    return { x, y, label: labelMap[slot] ?? 2, cid };
  });

  return {
    coordinates_2d: points.map((p) => [p.x, p.y]),
    labels: points.map((p) => p.label),
    customer_ids: points.map((p) => p.cid),
    source: "csv",
  };
}

export default function VisualExplorer({ csvOnly = false }) {
  const [data, setD] = useState(null);
  const [err, setErr] = useState("");
  const [m, setM] = useState("pca");
  const [loading, setLoading] = useState(false);

  const palette = ["#f59e0b", "#38bdf8", "#22c55e", "#f97316", "#a78bfa", "#ef4444", "#14b8a6"];

  const load = () => {
    setLoading(true);
    setErr("");
    if (csvOnly) {
      loadCsvProjection()
        .then((d) => setD(d))
        .catch(() => setErr("Failed to load CSV demo projection"))
        .finally(() => setLoading(false));
      return;
    }
    const fn = m === "tsne" ? reduction.getTSNE : m === "umap" ? reduction.getUMAP : reduction.getPCA;
    fn({})
      .then((r) => setD(r.data))
      .catch(async () => {
        // graceful fallback when API/DB isn't running
        try {
          const d = await loadCsvProjection();
          setD(d);
        } catch (e2) {
          setErr("Failed to load projection");
        }
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, [m]);
  if (loading && !data) return <p className="p-4">Loading projection…</p>;
  if (err) return <p className="p-4 text-red-300">{err}</p>;
  if (!data) return <p className="p-4">No projection data.</p>;

  const coords = data.coordinates_2d || data.points_2d || [];
  const labels = data.labels || coords.map(() => 0);
  const customerIds = data.customer_ids || coords.map((_, i) => `Customer ${i + 1}`);
  const uniqueLabels = Array.from(new Set(labels)).sort((a, b) => Number(a) - Number(b));

  const shapes = uniqueLabels.flatMap((lab) => {
    const pts = coords.filter((_, i) => labels[i] === lab);
    if (pts.length < 2) return [];
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const sx = Math.max(0.45, Math.sqrt(pts.reduce((s, p) => s + (p[0] - cx) ** 2, 0) / pts.length) * 1.8);
    const sy = Math.max(0.45, Math.sqrt(pts.reduce((s, p) => s + (p[1] - cy) ** 2, 0) / pts.length) * 1.8);
    return [
      {
        type: "circle",
        xref: "x",
        yref: "y",
        x0: cx - sx,
        x1: cx + sx,
        y0: cy - sy,
        y1: cy + sy,
        line: { color: "rgba(239,68,68,0.9)", width: 2 },
        fillcolor: "rgba(0,0,0,0)",
      },
    ];
  });

  const traces = uniqueLabels.map((lab, idx) => {
    const xs = [];
    const ys = [];
    const txt = [];
    for (let i = 0; i < coords.length; i += 1) {
      if (labels[i] !== lab) continue;
      xs.push(coords[i][0]);
      ys.push(coords[i][1]);
      txt.push(String(customerIds[i] || `Customer ${i + 1}`));
    }
    return {
      x: xs,
      y: ys,
      text: txt,
      name: `Cluster ${lab}`,
      type: "scatter",
      mode: "markers",
      hovertemplate: "Customer: %{text}<br>x: %{x:.3f}<br>y: %{y:.3f}<extra></extra>",
      marker: {
        size: 11,
        color: palette[idx % palette.length],
        line: { color: "rgba(255,255,255,0.4)", width: 1 },
        opacity: 0.9,
      },
    };
  });

  return (
    <GlassCard>
      <h1 className="display-font text-3xl mb-2">Visual Cluster Explorer</h1>
      <p className="text-sm text-slate-300 mb-3">
        {data?.source === "csv"
          ? "CSV projection mode (no MongoDB/API required)."
          : `${m.toUpperCase()} projection of customer behavior grouped into clusters.`}
      </p>
      <div className="mb-2 flex gap-2 items-center">
        {["pca", "tsne", "umap"].map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setM(x)}
            className={`px-3 py-1 rounded border ${
              m === x ? "bg-amber-500/20 border-amber-400 text-amber-300" : "bg-navy-800 border-slate-700"
            }`}
          >
            {x}
          </button>
        ))}
      </div>
      <div className="h-[480px]">
        <Plot
          data={traces}
          layout={{
            paper_bgcolor: "transparent",
            plot_bgcolor: "transparent",
            font: { color: "#e2e8f0" },
            margin: { t: 20, r: 20, b: 50, l: 60 },
            showlegend: true,
            legend: {
              orientation: "h",
              y: 1.08,
              x: 0,
              bgcolor: "rgba(15,23,42,0.45)",
              bordercolor: "rgba(148,163,184,0.2)",
              borderwidth: 1,
            },
            xaxis: {
              title: `${m.toUpperCase()} - Component 1`,
              gridcolor: "rgba(148,163,184,0.25)",
              zerolinecolor: "rgba(148,163,184,0.4)",
            },
            yaxis: {
              title: `${m.toUpperCase()} - Component 2`,
              gridcolor: "rgba(148,163,184,0.25)",
              zerolinecolor: "rgba(148,163,184,0.4)",
            },
            shapes,
          }}
          config={{ displayModeBar: false, responsive: true }}
          useResizeHandler
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </GlassCard>
  );
}
