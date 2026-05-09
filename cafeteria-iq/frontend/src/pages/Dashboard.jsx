import { motion } from "framer-motion";
import GlassCard from "../components/ui/GlassCard";
import Papa from "papaparse";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { useState, useEffect, useRef } from "react";

const LOCAL_CSV_ROWS_KEY = "cafeiq_local_csv_rows";
const LOCAL_CSV_NAME_KEY = "cafeiq_local_csv_name";

function parseItems(raw) {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function readLocalCsvRows() {
  try {
    const raw = localStorage.getItem(LOCAL_CSV_ROWS_KEY);
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export default function Dashboard() {
  const [t, setT] = useState(new Date());
  const [rows, setRows] = useState(() => readLocalCsvRows());
  const [sourceName, setSourceName] = useState(() => localStorage.getItem(LOCAL_CSV_NAME_KEY) || "");
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef(null);

  const openFilePicker = () => fileInputRef.current?.click();

  const onCsvSelected = (file) => {
    if (!file) return;
    setUploadError("");
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedRows = Array.isArray(results.data)
          ? results.data.filter((r) => Object.values(r || {}).some(Boolean))
          : [];
        if (!parsedRows.length) {
          setUploadError("Uploaded CSV is empty or invalid.");
          return;
        }

        const sample = parsedRows[0] || {};
        const keys = Object.keys(sample).map((k) => String(k || "").trim());
        const requiredEither = [
          ["customer_id", "customerId"],
          ["total_amount", "totalAmount"],
          ["date", "transaction_ts"],
        ];
        const missingGroups = requiredEither.filter((group) => !group.some((g) => keys.includes(g)));
        const hasItemsJson = keys.includes("items_json");
        const hasFlatItems = keys.includes("item_name") || keys.includes("itemName") || keys.includes("menu_item");
        if (missingGroups.length || (!hasItemsJson && !hasFlatItems)) {
          setUploadError(
            "CSV schema invalid. Need customer_id, total_amount, date, and item details (items_json or item_name)."
          );
          return;
        }

        localStorage.setItem(LOCAL_CSV_ROWS_KEY, JSON.stringify(parsedRows));
        localStorage.setItem(LOCAL_CSV_NAME_KEY, file.name);
        setRows(parsedRows);
        setSourceName(file.name);
      },
      error: () => setUploadError("Failed to parse CSV file."),
    });
  };

  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    const sync = () => {
      setRows(readLocalCsvRows());
      setSourceName(localStorage.getItem(LOCAL_CSV_NAME_KEY) || "");
    };
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, []);

  const parsed = rows.map((r, i) => {
    const amount = Number(r.total_amount || r.totalAmount || 0);
    const date = new Date(r.date || r.transaction_ts || Date.now());
    const cid = r.customer_id || r.customerId || `C${i + 1}`;
    const jsonItems = parseItems(r.items_json);
    const fallbackName = r.item_name || r.itemName || r.menu_item || r.name || "";
    const fallbackQty = Number(r.quantity || r.qty || 1);
    const fallbackPrice = Number(r.item_price || r.price || 0);
    const fallbackItems = fallbackName
      ? [{ name: fallbackName, quantity: Number.isFinite(fallbackQty) ? fallbackQty : 1, price: Number.isFinite(fallbackPrice) ? fallbackPrice : 0 }]
      : [];
    return { amount, date, cid, items: jsonItems.length ? jsonItems : fallbackItems };
  });

  if (!parsed.length) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <GlassCard className="max-w-2xl mt-8">
          <h1 className="display-font text-3xl mb-2">Dashboard</h1>
          <p className="text-slate-300 mb-3">No CSV data loaded yet. This dashboard shows only your uploaded CSV results.</p>
          <button
            type="button"
            onClick={openFilePicker}
            className="px-4 py-2 rounded-lg border border-emerald-500/40 text-emerald-200"
          >
            Upload Document
          </button>
        </GlassCard>
      </motion.div>
    );
  }

  const totalRevenue = parsed.reduce((s, r) => s + r.amount, 0);
  const totalTransactions = parsed.length;
  const uniqueCustomers = new Set(parsed.map((r) => r.cid)).size;
  const avgOrder = totalTransactions ? totalRevenue / totalTransactions : 0;

  const byDay = new Map();
  for (const r of parsed) {
    const k = Number.isNaN(r.date.getTime()) ? "N/A" : r.date.toLocaleDateString();
    byDay.set(k, (byDay.get(k) || 0) + r.amount);
  }
  const series = Array.from(byDay.entries()).map(([name, value]) => ({ name, value }));

  const topMap = new Map();
  for (const r of parsed) {
    for (const it of r.items) {
      const name = it.itemName || it.name || "Unknown";
      const qty = Number(it.quantity || 1);
      const price = Number(it.price || 0);
      const prev = topMap.get(name) || { name, revenue: 0 };
      prev.revenue += qty * price;
      topMap.set(name, prev);
    }
  }
  const top = Array.from(topMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  const customerSpend = new Map();
  for (const r of parsed) customerSpend.set(r.cid, (customerSpend.get(r.cid) || 0) + r.amount);
  const spends = Array.from(customerSpend.entries()).sort((a, b) => b[1] - a[1]);
  const cut1 = Math.max(1, Math.floor(spends.length * 0.33));
  const cut2 = Math.max(cut1 + 1, Math.floor(spends.length * 0.66));
  const high = new Set(spends.slice(0, cut1).map(([cid]) => cid));
  const mid = new Set(spends.slice(cut1, cut2).map(([cid]) => cid));
  const segmentAgg = new Map([
    ["High Value", { name: "High Value", revenue: 0, transactions: 0 }],
    ["Mid Value", { name: "Mid Value", revenue: 0, transactions: 0 }],
    ["Occasional", { name: "Occasional", revenue: 0, transactions: 0 }],
  ]);
  for (const r of parsed) {
    const seg = high.has(r.cid) ? "High Value" : mid.has(r.cid) ? "Mid Value" : "Occasional";
    const rec = segmentAgg.get(seg);
    rec.revenue += r.amount;
    rec.transactions += 1;
  }
  const barSeries = Array.from(segmentAgg.values());

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="display-font text-4xl">Dashboard</h1>
          <p className="text-slate-400 text-sm number-font mt-1">{t.toLocaleString()}</p>
          <p className="text-emerald-300/80 text-xs mt-1">Source: {sourceName || "Uploaded CSV"}</p>
          {uploadError && <p className="text-red-300 text-xs mt-1">{uploadError}</p>}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={openFilePicker}
            className="px-3 py-1.5 text-sm rounded-lg border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10"
          >
            Upload CSV
          </button>
          <button type="button" onClick={() => setRows(readLocalCsvRows())} className="px-3 py-1.5 text-sm glass-card">
            Refresh CSV
          </button>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => onCsvSelected(e.target.files?.[0])}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { t: "Total Revenue", v: "₹" + totalRevenue.toLocaleString() },
          { t: "Transactions", v: totalTransactions.toLocaleString() },
          { t: "Unique Customers", v: uniqueCustomers.toLocaleString() },
          { t: "Avg Order", v: "₹" + avgOrder.toFixed(0) },
        ].map((c, i) => (
          <GlassCard key={c.t} className="border-t-4 border-amber-500/40">
            <p className="text-slate-500 text-sm">{c.t}</p>
            <p className="text-2xl number-font text-amber-200 mt-1">{c.v}</p>
          </GlassCard>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassCard>
          <h3 className="text-lg mb-2">Revenue (recent)</h3>
          <div className="h-56">
            <ResponsiveContainer>
              <AreaChart data={series.slice(-30)}>
                <XAxis dataKey="name" hide />
                <YAxis />
                <Tooltip
                  contentStyle={{ background: "#0a1628", border: "1px solid rgba(251,191,36,0.2)" }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#fbbf24"
                  fill="url(#a)"
                />
                <defs>
                  <linearGradient id="a" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                  </linearGradient>
                </defs>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
        <GlassCard>
          <h3 className="text-lg mb-1">Top menu</h3>
          <p className="text-slate-500 text-xs mb-2">By revenue (top 8 items)</p>
          <ol className="space-y-2">
            {top.map((m, j) => (
              <li key={m.name} className="flex justify-between text-sm">
                <span>
                  {j + 1}. {m.name}
                </span>
                <span className="text-amber-200 number-font">₹{(m.revenue || 0).toLocaleString()}</span>
              </li>
            ))}
          </ol>
        </GlassCard>
      </div>

      <GlassCard className="mt-4">
        <h3 className="text-lg mb-1">Revenue by customer segment</h3>
        <p className="text-slate-500 text-xs mb-3">Computed directly from uploaded CSV customer spend distribution.</p>
        {barSeries.length > 0 && (
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={barSeries} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={48}
                />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => (v >= 1e5 ? `${(v / 1e3).toFixed(0)}k` : v)} />
                <Tooltip
                  contentStyle={{ background: "#0a1628", border: "1px solid rgba(251,191,36,0.2)" }}
                  formatter={(value, _n, p) => [`₹${Number(value).toLocaleString()}`, "Revenue"]}
                  labelFormatter={(_l, p) => p?.[0]?.payload?.fullName || _l}
                />
                <Bar dataKey="revenue" name="Revenue" radius={[4, 4, 0, 0]}>
                  {barSeries.map((entry, idx) => (
                    <Cell key={`${entry.name}-${idx}`} fill={["#f59e0b", "#38bdf8", "#34d399"][idx % 3]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {barSeries.length > 0 && (
          <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-400">
            {barSeries.map((c) => (
              <li key={c.name} className="flex justify-between gap-2">
                <span className="text-slate-300">{c.name}</span>
                <span className="text-amber-200/90 number-font whitespace-nowrap">
                  ₹{c.revenue.toLocaleString()} · {c.transactions} tx
                </span>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </motion.div>
  );
}
