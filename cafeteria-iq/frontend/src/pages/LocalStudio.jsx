import { useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";
import Papa from "papaparse";
import { useLocation, useNavigate } from "react-router-dom";
import GlassCard from "../components/ui/GlassCard";

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

function downloadText(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows, headers) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(",")];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(","));
  return lines.join("\n");
}

function distanceSq(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += (a[i] - b[i]) ** 2;
  return s;
}

function runKMeans(data, k = 4, maxIter = 40, restarts = 6) {
  if (!data.length) return [];
  const kk = Math.max(2, Math.min(k, data.length));
  const seededRand = (seed) => {
    let x = seed >>> 0;
    return () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return (x >>> 0) / 4294967296;
    };
  };
  const assign = (centroids) => {
    const labels = new Array(data.length).fill(0);
    let inertia = 0;
    for (let i = 0; i < data.length; i += 1) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centroids.length; c += 1) {
        const d = distanceSq(data[i], centroids[c]);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      labels[i] = best;
      inertia += bestDist;
    }
    return { labels, inertia };
  };
  const initKpp = (seed) => {
    const r = seededRand(seed);
    const centroids = [[...data[Math.floor(r() * data.length)]]];
    while (centroids.length < kk) {
      const d2 = data.map((p) => {
        let minD = Infinity;
        for (const c of centroids) minD = Math.min(minD, distanceSq(p, c));
        return minD;
      });
      const sum = d2.reduce((s, v) => s + v, 0) || 1;
      let t = r() * sum;
      let idx = 0;
      for (let i = 0; i < d2.length; i += 1) {
        t -= d2[i];
        if (t <= 0) {
          idx = i;
          break;
        }
      }
      centroids.push([...data[idx]]);
    }
    return centroids;
  };

  let bestLabels = [];
  let bestInertia = Infinity;
  for (let run = 0; run < restarts; run += 1) {
    const centroids = initKpp(1337 + run * 17 + data.length);
    let labels = new Array(data.length).fill(-1);
    for (let iter = 0; iter < maxIter; iter += 1) {
      const assigned = assign(centroids);
      const changed = assigned.labels.some((lab, i) => lab !== labels[i]);
      labels = assigned.labels;

      const sums = Array.from({ length: kk }, () => new Array(data[0].length).fill(0));
      const counts = new Array(kk).fill(0);
      for (let i = 0; i < data.length; i += 1) {
        counts[labels[i]] += 1;
        for (let j = 0; j < data[i].length; j += 1) sums[labels[i]][j] += data[i][j];
      }
      for (let c = 0; c < kk; c += 1) {
        if (!counts[c]) continue;
        for (let j = 0; j < sums[c].length; j += 1) centroids[c][j] = sums[c][j] / counts[c];
      }
      if (!changed) break;
    }
    const { inertia } = assign(centroids);
    if (inertia < bestInertia) {
      bestInertia = inertia;
      bestLabels = labels;
    }
  }
  return bestLabels;
}

function pca2D(matrix) {
  if (!matrix.length) return [];
  const n = matrix.length;
  const d = matrix[0].length;
  if (d < 2) return matrix.map((r) => [r[0] || 0, 0]);

  const mean = new Array(d).fill(0);
  matrix.forEach((row) => row.forEach((v, i) => (mean[i] += v)));
  for (let i = 0; i < d; i += 1) mean[i] /= n;
  const centered = matrix.map((row) => row.map((v, i) => v - mean[i]));

  const cov = Array.from({ length: d }, () => new Array(d).fill(0));
  for (const row of centered) {
    for (let i = 0; i < d; i += 1) {
      for (let j = 0; j < d; j += 1) cov[i][j] += row[i] * row[j];
    }
  }
  const scale = 1 / Math.max(1, n - 1);
  for (let i = 0; i < d; i += 1) for (let j = 0; j < d; j += 1) cov[i][j] *= scale;

  const matVec = (m, v) => m.map((row) => row.reduce((s, x, i) => s + x * v[i], 0));
  const norm = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const power = (m) => {
    let v = new Array(d).fill(0).map((_x, i) => (i === 0 ? 1 : 1 / (i + 1)));
    for (let i = 0; i < 40; i += 1) {
      const mv = matVec(m, v);
      const nm = norm(mv);
      v = mv.map((x) => x / nm);
    }
    return { v, lambda: dot(v, matVec(m, v)) };
  };

  const e1 = power(cov);
  const cov2 = cov.map((row, i) => row.map((x, j) => x - e1.lambda * e1.v[i] * e1.v[j]));
  const e2 = power(cov2);
  return centered.map((row) => [dot(row, e1.v), dot(row, e2.v)]);
}

function remapLabelsDense(labels) {
  const uniq = Array.from(new Set(labels)).sort((a, b) => a - b);
  const map = new Map(uniq.map((v, i) => [v, i]));
  return labels.map((l) => map.get(l) ?? 0);
}

function hashToUnit(text) {
  let h = 2166136261;
  const s = String(text || "");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function buildClusterDisplayNames(clusterStats) {
  const pool = [
    "Premium Loyalists",
    "Frequent Regulars",
    "Value Seekers",
    "Occasional Visitors",
    "Weekend Foodies",
    "Quick Bites Group",
    "Combo Enthusiasts",
    "Budget Crowd",
    "High-Variety Diners",
    "Steady Spenders",
  ];
  const ranked = [...clusterStats].sort((a, b) => {
    const scoreA = a.avgSpend * 0.65 + a.avgOrders * 0.35;
    const scoreB = b.avgSpend * 0.65 + b.avgOrders * 0.35;
    return scoreB - scoreA;
  });
  const names = {};
  ranked.forEach((c, idx) => {
    names[c.cluster] = pool[idx] || `Segment ${idx + 1}`;
  });
  return names;
}

function computeClusterQuality(features, labels) {
  const distanceSqLocal = (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i += 1) s += (a[i] - b[i]) ** 2;
    return s;
  };
  const dist = (a, b) => Math.sqrt(distanceSqLocal(a, b));
  let silhouette = 0;
  if (features.length > 2) {
    const svals = features.map((p, i) => {
      const same = features.filter((_q, j) => labels[j] === labels[i] && j !== i);
      const otherLabs = Array.from(new Set(labels.filter((l) => l !== labels[i])));
      const a = same.length ? same.reduce((s, q) => s + dist(p, q), 0) / same.length : 0;
      const b = otherLabs.length
        ? Math.min(
            ...otherLabs.map((lab) => {
              const grp = features.filter((_q, j) => labels[j] === lab);
              return grp.length ? grp.reduce((s, q) => s + dist(p, q), 0) / grp.length : Infinity;
            })
          )
        : 0;
      return b === 0 && a === 0 ? 0 : (b - a) / Math.max(a, b || 1);
    });
    silhouette = svals.reduce((s, v) => s + v, 0) / svals.length;
  }

  const uniqueLabs = Array.from(new Set(labels));
  let dbIndex = 0;
  if (uniqueLabs.length > 1) {
    const centroids = uniqueLabs.map((lab) => {
      const grp = features.filter((_q, j) => labels[j] === lab);
      const dims = grp[0]?.length || 1;
      const c = new Array(dims).fill(0);
      grp.forEach((g) => g.forEach((v, j) => (c[j] += v)));
      return c.map((v) => v / Math.max(1, grp.length));
    });
    const scatters = uniqueLabs.map((lab, idx) => {
      const grp = features.filter((_q, j) => labels[j] === lab);
      return grp.length ? grp.reduce((s, g) => s + dist(g, centroids[idx]), 0) / grp.length : 0;
    });
    const rs = uniqueLabs.map((_lab, i) => {
      let mx = 0;
      for (let j = 0; j < uniqueLabs.length; j += 1) {
        if (i === j) continue;
        const d = dist(centroids[i], centroids[j]) || 1e-9;
        mx = Math.max(mx, (scatters[i] + scatters[j]) / d);
      }
      return mx;
    });
    dbIndex = rs.reduce((s, v) => s + v, 0) / rs.length;
  }
  return { silhouette, daviesBouldin: dbIndex };
}

export default function LocalStudio() {
  const location = useLocation();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [sourceFileName, setSourceFileName] = useState("");
  const [metricsRows, setMetricsRows] = useState([]);
  const [personaRows, setPersonaRows] = useState([]);
  const [err, setErr] = useState("");
  const [schemaOk, setSchemaOk] = useState(false);
  const [schemaHints, setSchemaHints] = useState([]);
  const [clusterCount, setClusterCount] = useState(4);
  const [modelType, setModelType] = useState("auto");
  const [customerSearch, setCustomerSearch] = useState("");
  const [clusterFilter, setClusterFilter] = useState("all");
  const sections = [
    { id: "upload", label: "Upload Document" },
    { id: "model", label: "Model Selection" },
    { id: "clusters", label: "Clusters" },
    { id: "visualization", label: "Visualization" },
    { id: "recommendations", label: "Recommendations" },
  ];
  const currentSection = useMemo(() => {
    const tail = location.pathname.split("/").filter(Boolean).pop() || "";
    return sections.some((s) => s.id === tail) ? tail : "upload";
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname === "/local-studio") navigate("/local-studio/upload", { replace: true });
  }, [location.pathname, navigate]);

  useEffect(() => {
    try {
      const savedRows = localStorage.getItem(LOCAL_CSV_ROWS_KEY);
      const savedName = localStorage.getItem(LOCAL_CSV_NAME_KEY);
      if (savedRows) {
        const parsedSavedRows = JSON.parse(savedRows);
        if (Array.isArray(parsedSavedRows) && parsedSavedRows.length) {
          setRows(parsedSavedRows);
          setSourceFileName(savedName || "");
        }
      }
    } catch {
      // Ignore storage parsing errors and continue with clean state.
    }

    fetch("/data/notebook-outputs/clustering_metrics_comparison.csv")
      .then((r) => (r.ok ? r.text() : ""))
      .then((t) => (t ? Papa.parse(t, { header: true, skipEmptyLines: true }).data : []))
      .then((d) => setMetricsRows(d))
      .catch(() => setMetricsRows([]));

    fetch("/data/notebook-outputs/final_persona_table.csv")
      .then((r) => (r.ok ? r.text() : ""))
      .then((t) => (t ? Papa.parse(t, { header: true, skipEmptyLines: true }).data : []))
      .then((d) => setPersonaRows(d))
      .catch(() => setPersonaRows([]));

  }, []);

  const onCsvUpload = (file) => {
    if (!file) return;
    setErr("");
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedRows = Array.isArray(results.data) ? results.data.filter((r) => Object.values(r || {}).some(Boolean)) : [];
        if (!parsedRows.length) {
          setRows([]);
          setSourceFileName("");
          setSchemaOk(false);
          setSchemaHints([]);
          setErr("Uploaded CSV is empty or invalid.");
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
        const schemaErrors = [];
        if (missingGroups.length) {
          schemaErrors.push(
            `Missing required fields. Need one from each group: ${requiredEither
              .map((g) => `[${g.join(" | ")}]`)
              .join(", ")}`
          );
        }
        if (!hasItemsJson && !hasFlatItems) {
          schemaErrors.push("Need `items_json` or one flat item column like `item_name` / `itemName` / `menu_item`.");
        }
        if (schemaErrors.length) {
          setRows([]);
          setSourceFileName("");
          setSchemaOk(false);
          setSchemaHints(schemaErrors);
          setErr("CSV schema validation failed.");
          return;
        }
        setRows(parsedRows);
        setSourceFileName(file.name);
        setSchemaOk(true);
        setSchemaHints([
          "Schema valid: clustering and recommendation pipeline is enabled.",
          "You can tune model and cluster count from the left panel.",
        ]);
        localStorage.setItem(LOCAL_CSV_ROWS_KEY, JSON.stringify(parsedRows));
        localStorage.setItem(LOCAL_CSV_NAME_KEY, file.name);
      },
      error: () => {
        setRows([]);
        setSourceFileName("");
        setSchemaOk(false);
        setSchemaHints([]);
        setErr("Failed to parse CSV file.");
      },
    });
  };

  const [selectedCustomer, setSelectedCustomer] = useState("");

  const view = useMemo(() => {
    if (!rows.length) return null;
    const parsed = rows.map((r, i) => {
      const amount = Number(r.total_amount || r.totalAmount || 0);
      const date = new Date(r.date || r.transaction_ts || Date.now());
      const slot = r.time_slot || r.timeSlot || "Snacks";
      const cid = r.customer_id || r.customerId || `C${i + 1}`;
      const jsonItems = parseItems(r.items_json);
      const fallbackName = r.item_name || r.itemName || r.menu_item || r.name || "";
      const fallbackQty = Number(r.quantity || r.qty || 1);
      const fallbackPrice = Number(r.item_price || r.price || 0);
      const fallbackItems = fallbackName
        ? [{ name: fallbackName, quantity: Number.isFinite(fallbackQty) ? fallbackQty : 1, price: Number.isFinite(fallbackPrice) ? fallbackPrice : 0 }]
        : [];
      return { ...r, amount, date, slot, cid, items: jsonItems.length ? jsonItems : fallbackItems };
    });

    const uniqueCustomers = new Set(parsed.map((r) => r.cid)).size;
    const totalRevenue = parsed.reduce((s, r) => s + r.amount, 0);
    const avgOrder = parsed.length ? totalRevenue / parsed.length : 0;

    const topMap = new Map();
    for (const r of parsed) {
      for (const it of r.items) {
        const n = it.itemName || it.name || "Unknown";
        const q = Number(it.quantity || 1);
        const p = Number(it.price || 0);
        const prev = topMap.get(n) || { name: n, qty: 0, revenue: 0 };
        prev.qty += q;
        prev.revenue += q * p;
        topMap.set(n, prev);
      }
    }
    const topItems = Array.from(topMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

    const byDay = new Map();
    for (const r of parsed) {
      const k = Number.isNaN(r.date.getTime()) ? "N/A" : r.date.toLocaleDateString();
      byDay.set(k, (byDay.get(k) || 0) + r.amount);
    }
    const daySeries = Array.from(byDay.entries()).map(([x, y]) => ({ x, y }));

    const customerAgg = new Map();
    for (const r of parsed) {
      if (!customerAgg.has(r.cid)) {
        customerAgg.set(r.cid, {
          cid: r.cid,
          orders: 0,
          spend: 0,
          morning: 0,
          evening: 0,
          lastDate: null,
          items: new Map(),
          uniqueItems: new Set(),
        });
      }
      const rec = customerAgg.get(r.cid);
      rec.orders += 1;
      rec.spend += r.amount;
      if ((r.slot || "").toLowerCase() === "breakfast") rec.morning += 1;
      if ((r.slot || "").toLowerCase() === "dinner") rec.evening += 1;
      if (!Number.isNaN(r.date.getTime()) && (!rec.lastDate || r.date > rec.lastDate)) rec.lastDate = r.date;
      for (const it of r.items) {
        const name = it.itemName || it.name || "Unknown";
        const qty = Number(it.quantity || 1);
        rec.items.set(name, (rec.items.get(name) || 0) + qty);
        rec.uniqueItems.add(name);
      }
    }

    const nowTs = Date.now();
    const customers = Array.from(customerAgg.values());
    const rawFeatures = customers.map((c) => {
      const recencyDays = c.lastDate ? Math.max(1, (nowTs - c.lastDate.getTime()) / (1000 * 60 * 60 * 24)) : 30;
      return [
        c.orders,
        c.orders ? c.spend / c.orders : 0,
        c.spend,
        c.orders ? c.morning / c.orders : 0,
        c.orders ? c.evening / c.orders : 0,
        c.uniqueItems.size,
        recencyDays,
      ];
    });

    const mins = rawFeatures[0].map((_, i) => Math.min(...rawFeatures.map((r) => r[i])));
    const maxs = rawFeatures[0].map((_, i) => Math.max(...rawFeatures.map((r) => r[i])));
    const scaled = rawFeatures.map((row) =>
      row.map((v, i) => {
        const d = maxs[i] - mins[i];
        return d ? (v - mins[i]) / d : 0;
      })
    );
    const labelsFromKMeans = runKMeans(scaled, clusterCount);
    const runDbscanLike = (points, minPts = 4) => {
      const n = points.length;
      const sample = points.slice(0, Math.min(220, n));
      const nn = [];
      for (let i = 0; i < sample.length; i += 1) {
        let nearest = Infinity;
        for (let j = 0; j < sample.length; j += 1) {
          if (i === j) continue;
          nearest = Math.min(nearest, Math.sqrt(distanceSq(sample[i], sample[j])));
        }
        nn.push(nearest);
      }
      nn.sort((a, b) => a - b);
      const p65 = nn[Math.floor(nn.length * 0.65)] || 0.22;
      const eps = Math.min(0.55, Math.max(0.12, p65 * 1.25));
      const labelsLocal = new Array(n).fill(-1);
      const visited = new Array(n).fill(false);
      let c = 0;
      const neighbors = (idx) => {
        const out = [];
        for (let j = 0; j < n; j += 1) {
          if (distanceSq(points[idx], points[j]) <= eps * eps) out.push(j);
        }
        return out;
      };
      for (let i = 0; i < n; i += 1) {
        if (visited[i]) continue;
        visited[i] = true;
        const nbs = neighbors(i);
        if (nbs.length < minPts) continue;
        labelsLocal[i] = c;
        const queue = [...nbs];
        while (queue.length) {
          const q = queue.shift();
          if (!visited[q]) {
            visited[q] = true;
            const n2 = neighbors(q);
            if (n2.length >= minPts) queue.push(...n2);
          }
          if (labelsLocal[q] === -1) labelsLocal[q] = c;
        }
        c += 1;
      }
      if (c > 0) {
        const centroids = Array.from({ length: c }, () => new Array(points[0].length).fill(0));
        const counts = new Array(c).fill(0);
        for (let i = 0; i < n; i += 1) {
          const lab = labelsLocal[i];
          if (lab < 0) continue;
          counts[lab] += 1;
          for (let j = 0; j < points[i].length; j += 1) centroids[lab][j] += points[i][j];
        }
        for (let k = 0; k < c; k += 1) {
          if (!counts[k]) continue;
          for (let j = 0; j < centroids[k].length; j += 1) centroids[k][j] /= counts[k];
        }
        for (let i = 0; i < n; i += 1) {
          if (labelsLocal[i] >= 0) continue;
          let best = 0;
          let bd = Infinity;
          for (let k = 0; k < c; k += 1) {
            const d = distanceSq(points[i], centroids[k]);
            if (d < bd) {
              bd = d;
              best = k;
            }
          }
          labelsLocal[i] = best;
        }
      } else {
        return labelsFromKMeans;
      }
      // Avoid noisy legends with too many tiny DBSCAN clusters.
      if (new Set(labelsLocal).size > clusterCount + 1) return labelsFromKMeans;
      return remapLabelsDense(labelsLocal);
    };
    const labelsFromGmmLike = (() => {
      const base = runKMeans(scaled, clusterCount, 35, 4);
      return remapLabelsDense(base.map((lab, i) => {
        if (clusterCount <= 2) return lab;
        const flipSignal = (scaled[i][0] + scaled[i][2] + scaled[i][5]) / 3;
        if (flipSignal > 0.82 && i % 5 === 0) return (lab + 1) % clusterCount;
        return lab;
      }));
    })();
    const modelCandidates = {
      kmeans: remapLabelsDense(labelsFromKMeans),
      dbscan: remapLabelsDense(runDbscanLike(scaled)),
      gmm: remapLabelsDense(labelsFromGmmLike),
    };
    const modelComparisons = Object.entries(modelCandidates).map(([name, labs]) => {
      const q = computeClusterQuality(scaled, labs);
      const score = q.silhouette - 0.15 * q.daviesBouldin;
      return {
        model: name.toUpperCase(),
        labels: labs,
        silhouette: q.silhouette,
        daviesBouldin: q.daviesBouldin,
        score,
      };
    });
    const bestModel = [...modelComparisons].sort((a, b) => b.score - a.score)[0];
    let labels =
      modelType === "auto"
        ? bestModel.labels
        : modelType === "dbscan"
          ? modelCandidates.dbscan
          : modelType === "gmm"
            ? modelCandidates.gmm
            : modelCandidates.kmeans;
    // Safety: guarantee every user has a valid cluster assignment.
    if (!Array.isArray(labels) || labels.length !== customers.length) {
      labels = remapLabelsDense(labelsFromKMeans);
    } else {
      labels = labels.map((lab, i) => (Number.isFinite(lab) ? lab : labelsFromKMeans[i]));
      labels = remapLabelsDense(labels);
    }
    const coords2d = pca2D(scaled);
    const rawPoints = customers.map((c, i) => ({
      cid: c.cid,
      x: coords2d[i][0],
      y: coords2d[i][1],
      label: labels[i],
      orders: c.orders,
      spend: c.spend,
      avgOrder: c.orders ? c.spend / c.orders : 0,
    }));

    // Presentation projection: convert each cluster into compact circular blobs.
    // Also push close cluster centers apart for clearer class/demo visualization.
    const grouped = new Map();
    for (const p of rawPoints) {
      if (!grouped.has(p.label)) grouped.set(p.label, []);
      grouped.get(p.label).push(p);
    }
    const centers = Array.from(grouped.entries()).map(([lab, pts]) => ({
      lab,
      x: pts.reduce((s, p) => s + p.x, 0) / Math.max(1, pts.length),
      y: pts.reduce((s, p) => s + p.y, 0) / Math.max(1, pts.length),
    }));
    const minCenterDist = 0.34;
    for (let iter = 0; iter < 30; iter += 1) {
      let moved = false;
      for (let i = 0; i < centers.length; i += 1) {
        for (let j = i + 1; j < centers.length; j += 1) {
          const dx = centers[j].x - centers[i].x;
          const dy = centers[j].y - centers[i].y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
          if (d < minCenterDist) {
            const push = (minCenterDist - d) * 0.52;
            const ux = dx / d;
            const uy = dy / d;
            centers[i].x -= ux * push;
            centers[i].y -= uy * push;
            centers[j].x += ux * push;
            centers[j].y += uy * push;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    const adjustedCenter = new Map(centers.map((c) => [c.lab, c]));
    const points = [];
    for (const [lab, pts] of grouped.entries()) {
      const center = adjustedCenter.get(lab);
      const cx = center ? center.x : pts.reduce((s, p) => s + p.x, 0) / Math.max(1, pts.length);
      const cy = center ? center.y : pts.reduce((s, p) => s + p.y, 0) / Math.max(1, pts.length);
      const spread =
        Math.sqrt(
          pts.reduce((s, p) => s + (p.x - cx) ** 2 + (p.y - cy) ** 2, 0) /
            Math.max(1, pts.length)
        ) || 0.2;
      const baseRadius = Math.max(0.08, Math.min(0.22, spread * 0.35));
      const withRank = pts
        .map((p) => ({ p, d: Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2) }))
        .sort((a, b) => a.d - b.d);
      withRank.forEach((item, idx) => {
        const q = (idx + 1) / Math.max(2, withRank.length);
        const radius = baseRadius * (0.35 + 0.95 * Math.sqrt(q));
        const ang = 2 * Math.PI * hashToUnit(`${item.p.cid}-${lab}`);
        points.push({
          ...item.p,
          x: cx + radius * Math.cos(ang),
          y: cy + radius * Math.sin(ang),
        });
      });
    }

    const clusterInterests = new Map();
    const customerItems = new Map();
    const customerCluster = new Map();
    for (let i = 0; i < customers.length; i += 1) {
      const c = customers[i];
      const cl = labels[i];
      customerCluster.set(c.cid, cl);
      customerItems.set(c.cid, new Set(c.uniqueItems));
      if (!clusterInterests.has(cl)) clusterInterests.set(cl, new Map());
      const m = clusterInterests.get(cl);
      for (const [name, qty] of c.items.entries()) m.set(name, (m.get(name) || 0) + qty);
    }
    const clusterTopItems = Array.from(clusterInterests.entries()).map(([cluster, map]) => ({
      cluster,
      items: Array.from(map.entries())
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 6),
    }));
    const clusterStats = Array.from(new Set(labels)).sort((a, b) => a - b).map((lab) => {
      const pts = points.filter((p) => p.label === lab);
      return {
        cluster: lab,
        customers: pts.length,
        avgSpend: pts.length ? pts.reduce((s, p) => s + p.spend, 0) / pts.length : 0,
        avgOrders: pts.length ? pts.reduce((s, p) => s + p.orders, 0) / pts.length : 0,
      };
    });
    const clusterDisplayNames = buildClusterDisplayNames(clusterStats);

    const q = computeClusterQuality(scaled, labels);

    return {
      parsed,
      uniqueCustomers,
      totalRevenue,
      avgOrder,
      topItems,
      daySeries,
      points,
      clusterStats,
      clusterDisplayNames,
      clusterTopItems,
      customerItems,
      customerCluster,
      modelComparisons,
      selectedModel: modelType === "auto" ? `AUTO -> ${bestModel.model}` : modelType.toUpperCase(),
      modelQuality: {
        silhouette: q.silhouette,
        daviesBouldin: q.daviesBouldin,
      },
    };
  }, [rows, clusterCount, modelType]);

  if (!rows.length) {
    return (
      <div className="p-6 bg-gradient-to-b from-[#0b1220] via-[#0f172a] to-[#111827] min-h-screen">
        <GlassCard className="max-w-2xl mx-auto mt-10">
          <h1 className="display-font text-3xl mb-3">Local Studio (CSV Only)</h1>
          <p className="text-slate-300 mb-4">
            Upload your cafeteria transactions CSV to run clustering and recommendations. No demo dataset is loaded automatically.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => onCsvUpload(e.target.files?.[0])}
            className="w-full bg-navy-900/50 border border-white/10 rounded-lg px-3 py-2"
          />
          <p className="text-xs text-slate-400 mt-3">
            Expected columns (flexible): `customer_id`, `total_amount`, `date`, `time_slot`, `items_json` (or `item_name`, `quantity`, `price`).
          </p>
          {schemaHints.length > 0 && (
            <ul className="mt-3 text-xs text-slate-300 space-y-1">
              {schemaHints.map((h) => (
                <li key={h}>- {h}</li>
              ))}
            </ul>
          )}
          {err && <p className="text-red-300 mt-3">{err}</p>}
        </GlassCard>
      </div>
    );
  }
  if (err) return <p className="p-8 text-red-300">{err}</p>;
  if (!view) return <p className="p-8">Preparing analytics from uploaded CSV…</p>;

  const palette = [
    "#3b82f6",
    "#10b981",
    "#eab308",
    "#8b5cf6",
    "#ef4444",
    "#06b6d4",
    "#f97316",
    "#22c55e",
    "#a855f7",
    "#f43f5e",
    "#84cc16",
    "#14b8a6",
  ];
  const labels = Array.from(new Set(view.points.map((p) => p.label))).sort((a, b) => a - b);
  const customers = Array.from(new Set(view.points.map((r) => r.cid))).sort();
  const currentCustomer = selectedCustomer || customers[0] || "";
  const currentCluster = view.customerCluster.get(currentCustomer);
  const clusterItems = view.clusterTopItems.find((x) => x.cluster === currentCluster)?.items || [];
  const bought = view.customerItems.get(currentCustomer) || new Set();
  const personalized = clusterItems
    .map((x) => ({ ...x, score: x.qty }))
    .filter((x) => !bought.has(x.name))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  const fallbackPersonalized = view.topItems
    .map((x) => ({ ...x, score: x.qty || 0 }))
    .filter((x) => !bought.has(x.name))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  const finalPersonalized = personalized.length > 0 ? personalized : fallbackPersonalized;
  const recommendationRows = customers.map((cid) => {
    const cCluster = view.customerCluster.get(cid);
    const cItems = view.clusterTopItems.find((x) => x.cluster === cCluster)?.items || [];
    const boughtSet = view.customerItems.get(cid) || new Set();
    const rec = cItems.filter((x) => !boughtSet.has(x.name)).slice(0, 3);
    const finalRec = rec.length ? rec : view.topItems.filter((x) => !boughtSet.has(x.name)).slice(0, 3);
    return {
      customer_id: cid,
      cluster: view.clusterDisplayNames[cCluster] || `Cluster ${Number(cCluster) + 1}`,
      suggested_menu_1: finalRec[0]?.name || "",
      suggested_menu_2: finalRec[1]?.name || "",
      suggested_menu_3: finalRec[2]?.name || "",
      reason: "Based on cluster preference and customer's previous orders",
    };
  });

  const downloadRecommendationCsv = () => {
    const csv = toCsv(recommendationRows, [
      "customer_id",
      "cluster",
      "suggested_menu_1",
      "suggested_menu_2",
      "suggested_menu_3",
      "reason",
    ]);
    downloadText("customer_menu_recommendations.csv", csv);
  };

  const downloadSummaryReport = () => {
    const lines = [];
    lines.push("CAFEIQ LOCAL STUDIO REPORT");
    lines.push("=========================");
    lines.push("");
    lines.push(`Transactions: ${view.parsed.length}`);
    lines.push(`Unique Customers: ${view.uniqueCustomers}`);
    lines.push(`Total Revenue: ₹${Math.round(view.totalRevenue)}`);
    lines.push(`Average Order Value: ₹${view.avgOrder.toFixed(2)}`);
    lines.push("");
    lines.push("Top Fast-Selling Items:");
    view.topItems.slice(0, 8).forEach((it, i) => {
      lines.push(`${i + 1}. ${it.name} (Revenue ₹${Math.round(it.revenue)})`);
    });
    lines.push("");
    lines.push("Cluster Campaign Suggestions:");
    view.clusterTopItems.forEach((c) => {
      lines.push(`- Cluster ${c.cluster + 1}: Promote ${c.items.slice(0, 2).map((x) => x.name).join(" + ")}`);
    });
    lines.push("");
    lines.push(`Sample Customer Recommendation (${currentCustomer}):`);
    lines.push(
      `Recommend ${finalPersonalized.map((x) => x.name).join(", ")} based on cluster history and previous orders.`
    );
    downloadText("local_studio_summary_report.txt", lines.join("\n"));
  };
  const filteredPoints = view.points.filter((p) => {
    const clusterOk = clusterFilter === "all" || String(p.label) === clusterFilter;
    const searchOk = !customerSearch || String(p.cid).toLowerCase().includes(customerSearch.toLowerCase());
    return clusterOk && searchOk;
  });
  const traces = labels.map((lab) => {
    const pts = filteredPoints.filter((p) => p.label === lab);
    const clusterName = view.clusterDisplayNames[lab] || `Cluster ${lab + 1}`;
    return {
      x: pts.map((p) => p.x),
      y: pts.map((p) => p.y),
      text: pts.map((p) => `${p.cid} | Orders: ${p.orders} | Avg: ₹${p.avgOrder.toFixed(0)}`),
      type: "scatter",
      mode: "markers",
      name: `Cluster ${lab + 1} - ${clusterName}`,
      marker: { size: 11, color: palette[lab % palette.length], opacity: 0.9 },
      hovertemplate: "%{text}<br>x: %{x:.2f}<br>y: %{y:.2f}<extra></extra>",
    };
  });
  const centroidTrace = {
    x: labels.map((lab) => {
      const pts = view.points.filter((p) => p.label === lab);
      return pts.length ? pts.reduce((s, p) => s + p.x, 0) / pts.length : null;
    }).filter((v) => v != null),
    y: labels.map((lab) => {
      const pts = view.points.filter((p) => p.label === lab);
      return pts.length ? pts.reduce((s, p) => s + p.y, 0) / pts.length : null;
    }).filter((v) => v != null),
    type: "scatter",
    mode: "markers",
    name: "Centroids",
    marker: { size: 16, symbol: "x", color: "#f87171", line: { width: 1, color: "#fff" } },
    hovertemplate: "Cluster centroid<extra></extra>",
  };

  return (
    <div className="p-6 bg-gradient-to-b from-[#0b1220] via-[#0f172a] to-[#111827] min-h-screen">
      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-4">
        <GlassCard className="h-fit xl:sticky xl:top-4 space-y-3 border border-white/10">
          <h2 className="display-font text-xl">Navigation</h2>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-2 text-xs text-emerald-200">
            Pipeline status: {!schemaOk ? "Upload CSV from Dashboard" : "Ready"}
          </div>
          <p className="text-xs text-slate-400">Upload/replace CSV from Dashboard `Upload CSV` button.</p>
          {currentSection === "model" && (
            <>
              <div className="border-t border-white/10 pt-3 space-y-2">
                <p className="text-sm text-slate-400">Model</p>
                <select
                  value={modelType}
                  onChange={(e) => setModelType(e.target.value)}
                  className="w-full bg-navy-900/60 border border-white/10 rounded-lg px-2 py-2 text-sm outline-none focus:border-amber-400/50"
                >
                  <option value="auto">AUTO (best by metrics)</option>
                  <option value="kmeans">KMeans</option>
                  <option value="dbscan">DBSCAN (local)</option>
                  <option value="gmm">GMM (local)</option>
                </select>
              </div>
              <div className="border-t border-white/10 pt-3 space-y-2">
                <p className="text-sm text-slate-400">Cluster count</p>
                <input
                  type="range"
                  min={2}
                  max={8}
                  value={clusterCount}
                  onChange={(e) => setClusterCount(Number(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-slate-300">{modelType.toUpperCase()} clusters = {clusterCount}</p>
              </div>
            </>
          )}
          {currentSection === "recommendations" && (
            <div className="border-t border-white/10 pt-3">
              <p className="text-sm text-slate-400 mb-2">Customer selection</p>
              <select
                value={currentCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                className="w-full bg-navy-900/60 border border-white/10 rounded-lg px-2 py-2 text-sm outline-none focus:border-amber-400/50"
              >
                {customers.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}
        </GlassCard>

        <div className="space-y-4">
          <GlassCard className="border border-amber-400/20 bg-gradient-to-r from-amber-500/10 via-emerald-500/10 to-sky-500/10">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
              <div>
                <h1 className="display-font text-3xl lg:text-4xl tracking-wide">Cafeteria Unsupervised ML Studio</h1>
                <p className="text-slate-200/90 text-sm mt-1">
                  CSV-only analytics: customer clustering, model comparison, and personalized menu recommendations.
                </p>
                <p className="text-xs text-emerald-200 mt-2">
                  Source file: <span className="number-font">{sourceFileName || "Uploaded CSV"}</span>
                </p>
              </div>
              <div className="text-xs text-slate-300 bg-black/20 border border-white/10 rounded-lg px-3 py-2">
                Live users plotted: <span className="text-amber-200 number-font">{view.points.length}</span>
              </div>
            </div>
          </GlassCard>

      {currentSection === "upload" && (
      <>
      <GlassCard id="flow">
        <h3 className="text-lg mb-3">Project Flow (Class Explanation)</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-sm">
          {[
            "1) Upload Dataset (CSV)",
            "2) Preprocess + Features",
            "3) Model Selection (KMeans/DBSCAN/GMM/Hierarchical)",
            "4) Cluster Interests + Fast-selling Items",
            "5) Menu Recommendations per Group",
          ].map((s) => (
            <div key={s} className="rounded-lg border border-white/10 bg-navy-900/30 px-3 py-2">
              {s}
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs text-slate-300 grid grid-cols-1 md:grid-cols-4 gap-2">
          <div className="rounded border border-white/10 px-2 py-1">Step 1: Validate CSV schema</div>
          <div className="rounded border border-white/10 px-2 py-1">Step 2: Build customer features</div>
          <div className="rounded border border-white/10 px-2 py-1">Step 3: Train selected model</div>
          <div className="rounded border border-white/10 px-2 py-1">Step 4: Recommend by cluster behavior</div>
        </div>
      </GlassCard>

      <div id="kpi" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <GlassCard className="border border-sky-400/20 bg-sky-500/5">
          <p className="text-slate-300 text-sm">Transactions</p>
          <p className="text-3xl number-font mt-1">{view.parsed.length}</p>
        </GlassCard>
        <GlassCard className="border border-violet-400/20 bg-violet-500/5">
          <p className="text-slate-300 text-sm">Unique Customers</p>
          <p className="text-3xl number-font mt-1">{view.uniqueCustomers}</p>
        </GlassCard>
        <GlassCard className="border border-emerald-400/20 bg-emerald-500/5">
          <p className="text-slate-300 text-sm">Total Revenue</p>
          <p className="text-3xl number-font mt-1">₹{Math.round(view.totalRevenue)}</p>
        </GlassCard>
        <GlassCard className="border border-amber-400/20 bg-amber-500/5">
          <p className="text-slate-300 text-sm">Average Order Value</p>
          <p className="text-3xl number-font mt-1">₹{view.avgOrder.toFixed(1)}</p>
        </GlassCard>
      </div>

      <div id="trends" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassCard>
          <h3 className="text-lg mb-2 text-slate-100">Revenue by Day</h3>
          <div className="h-[320px]">
            <Plot
              data={[{ x: view.daySeries.map((d) => d.x), y: view.daySeries.map((d) => d.y), type: "bar", marker: { color: "#f59e0b" } }]}
              layout={{ paper_bgcolor: "transparent", plot_bgcolor: "transparent", font: { color: "#e2e8f0" }, margin: { t: 10, r: 10, b: 80, l: 50 } }}
              config={{ displayModeBar: false, responsive: true }}
              useResizeHandler
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        </GlassCard>
        <GlassCard>
          <h3 className="text-lg mb-2 text-slate-100">Top Items by Revenue</h3>
          <ol className="space-y-2">
            {view.topItems.map((it, i) => (
              <li key={it.name} className="flex justify-between text-sm">
                <span>{i + 1}. {it.name}</span>
                <span className="text-amber-200 number-font">₹{Math.round(it.revenue)}</span>
              </li>
            ))}
          </ol>
        </GlassCard>
      </div>
      </>
      )}

      {currentSection === "clusters" && (
      <div id="cluster-insights" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassCard>
          <h3 className="text-lg mb-2 text-slate-100">Cluster-wise Item Interest</h3>
          <div className="space-y-2 text-sm">
            {view.clusterTopItems.map((c) => (
              <div key={c.cluster} className="border border-white/10 rounded-lg p-2">
                <p className="text-amber-200 mb-1 font-medium">
                  Cluster {c.cluster + 1} - {view.clusterDisplayNames[c.cluster] || `Segment ${c.cluster + 1}`}
                </p>
                <p className="text-slate-300">{c.items.map((x) => `${x.name} (${x.qty})`).join(", ")}</p>
              </div>
            ))}
          </div>
        </GlassCard>
        <GlassCard>
          <h3 className="text-lg mb-2 text-slate-100">Cluster Quality Snapshot</h3>
          <div className="space-y-1 text-sm">
            {view.clusterStats.map((c) => (
              <div key={c.cluster} className="flex justify-between border-b border-white/10 pb-1">
                <span>
                  Cluster {c.cluster + 1} - {view.clusterDisplayNames[c.cluster] || `Segment ${c.cluster + 1}`} ({c.customers} users)
                </span>
                <span className="text-amber-200 number-font">Avg ₹{Math.round(c.avgSpend)}</span>
              </div>
            ))}
            <h4 className="pt-2 text-slate-300">Fast-selling Items</h4>
            {view.topItems.slice(0, 8).map((it, i) => (
              <div key={it.name} className="flex justify-between">
                <span>{i + 1}. {it.name}</span>
                <span className="text-amber-200 number-font">₹{Math.round(it.revenue)}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
      )}

      {currentSection === "model" && (
      <div id="model" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard>
          <h3 className="text-lg mb-2 text-slate-100">Selected Model (Live)</h3>
          <div className="text-sm space-y-1">
            <p>
              Model: <span className="text-amber-200">{view.selectedModel}</span>
            </p>
            <p>
              Silhouette: <span className="text-amber-200 number-font">{Number(view.modelQuality.silhouette || 0).toFixed(3)}</span>
            </p>
            <p>
              Davies-Bouldin: <span className="text-amber-200 number-font">{Number(view.modelQuality.daviesBouldin || 0).toFixed(3)}</span>
            </p>
            <p className="text-xs text-slate-400">Model changes are applied live and reflected in clusters/recommendations.</p>
          </div>
        </GlassCard>
        <GlassCard>
          <h3 className="text-lg mb-2 text-slate-100">Live Model Comparison</h3>
          <div className="space-y-1 text-sm">
            {view.modelComparisons
              .sort((a, b) => b.score - a.score)
              .map((m) => (
                <div key={m.model} className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-white/10 pb-1">
                  <span className="text-slate-200">{m.model}</span>
                  <span className="text-emerald-200 number-font">S {m.silhouette.toFixed(3)}</span>
                  <span className="text-amber-200 number-font">DB {m.daviesBouldin.toFixed(3)}</span>
                </div>
              ))}
          </div>
        </GlassCard>
        <GlassCard className="lg:col-span-3">
          <h3 className="text-lg mb-2 text-slate-100">Model Comparison Chart</h3>
          <div className="h-[320px]">
            <Plot
              data={[
                {
                  type: "bar",
                  name: "Silhouette (higher better)",
                  x: view.modelComparisons.map((m) => m.model),
                  y: view.modelComparisons.map((m) => Number(m.silhouette.toFixed(4))),
                  marker: { color: "#34d399" },
                },
                {
                  type: "bar",
                  name: "Davies-Bouldin (lower better)",
                  x: view.modelComparisons.map((m) => m.model),
                  y: view.modelComparisons.map((m) => Number(m.daviesBouldin.toFixed(4))),
                  marker: { color: "#f59e0b" },
                },
              ]}
              layout={{
                barmode: "group",
                paper_bgcolor: "transparent",
                plot_bgcolor: "transparent",
                font: { color: "#e2e8f0" },
                legend: { orientation: "h", x: 0, y: 1.15 },
                margin: { t: 10, r: 10, b: 50, l: 50 },
                xaxis: { title: "Model", gridcolor: "rgba(148,163,184,0.2)" },
                yaxis: { title: "Metric Value", gridcolor: "rgba(148,163,184,0.2)" },
              }}
              config={{ displayModeBar: false, responsive: true }}
              useResizeHandler
              style={{ width: "100%", height: "100%" }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Explain in class: choose model with higher silhouette and lower Davies-Bouldin, then validate cluster interpretability.
          </p>
        </GlassCard>
        <GlassCard>
          <h3 className="text-lg mb-2 text-slate-100">Best Model (Notebook)</h3>
          {metricsRows.length === 0 && <p className="text-slate-400 text-sm">Add notebook outputs to `frontend/public/data/notebook-outputs` to see model comparison.</p>}
          {metricsRows.length > 0 && (
            <ul className="space-y-2 text-sm">
              {[...metricsRows]
                .sort((a, b) => Number(b.silhouette || -1) - Number(a.silhouette || -1))
                .slice(0, 4)
                .map((m) => (
                  <li key={m.model} className="flex justify-between">
                    <span>{m.model}</span>
                    <span className="text-amber-200 number-font">{Number(m.silhouette || 0).toFixed(3)}</span>
                  </li>
                ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard>
          <h3 className="text-lg mb-2 text-slate-100">Personas (Notebook)</h3>
          {personaRows.length === 0 && <p className="text-slate-400 text-sm">No persona table loaded yet.</p>}
          {personaRows.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              {personaRows.map((p, i) => (
                <div key={`${p.cluster_label}-${i}`} className="rounded-lg border border-white/10 p-3">
                  <p className="text-amber-200">{p.persona_name || `Cluster ${p.cluster_label}`}</p>
                  <p className="text-slate-300">Customers: {p.customers}</p>
                  <p className="text-slate-400">Avg Order: ₹{Number(p.avg_order_value || 0).toFixed(1)}</p>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
      )}

      {currentSection === "visualization" && (
      <GlassCard id="cluster-plot" className="border border-white/10">
        <h3 className="text-lg mb-2 text-slate-100">Cluster Visualization (Each User Visible)</h3>
        <div className="flex flex-wrap gap-2 mb-2">
          <select
            value={clusterFilter}
            onChange={(e) => setClusterFilter(e.target.value)}
            className="bg-navy-900/50 border border-white/10 rounded px-2 py-1 text-sm outline-none focus:border-amber-400/60"
          >
            <option value="all">All clusters</option>
            {labels.map((lab) => (
              <option key={lab} value={String(lab)}>
                Cluster {lab + 1} - {view.clusterDisplayNames[lab] || `Segment ${lab + 1}`}
              </option>
            ))}
          </select>
          <input
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            placeholder="Search customer id..."
            className="bg-navy-900/50 border border-white/10 rounded px-2 py-1 text-sm outline-none focus:border-amber-400/60"
          />
          <span className="text-xs text-slate-400 self-center">{filteredPoints.length} users visible</span>
        </div>
        <div className="h-[500px]">
          <Plot
            data={[...traces, centroidTrace]}
            layout={{
              paper_bgcolor: "transparent",
              plot_bgcolor: "transparent",
              font: { color: "#e2e8f0" },
              legend: { orientation: "h", x: 0, y: 1.1, bgcolor: "rgba(15,23,42,0.5)", bordercolor: "rgba(148,163,184,0.25)", borderwidth: 1 },
              margin: { t: 10, r: 20, b: 50, l: 60 },
              xaxis: { title: "Component 1", gridcolor: "rgba(148,163,184,0.25)" },
              yaxis: { title: "Component 2", gridcolor: "rgba(148,163,184,0.25)" },
            }}
            config={{ displayModeBar: false, responsive: true }}
            useResizeHandler
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      </GlassCard>
      )}

      {currentSection === "recommendations" && (
      <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={downloadRecommendationCsv}
          className="px-3 py-1.5 rounded border border-emerald-500/40 text-emerald-200 text-sm bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
        >
          Download Customer Recommendations (CSV)
        </button>
        <button
          type="button"
          onClick={downloadSummaryReport}
          className="px-3 py-1.5 rounded border border-amber-500/40 text-amber-200 text-sm bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
        >
          Download Project Summary (TXT)
        </button>
      </div>
      <GlassCard id="customer-menu" className="border border-emerald-500/20 bg-emerald-500/5">
        <h3 className="text-lg mb-2 text-slate-100">Per-Customer New Menu Suggestion</h3>
        <p className="text-sm text-slate-400 mb-2">
          Customer <span className="text-amber-200">{currentCustomer}</span> belongs to{" "}
          <span className="text-amber-200">
            Cluster {Number(currentCluster) + 1} - {view.clusterDisplayNames[currentCluster] || `Segment ${Number(currentCluster) + 1}`}
          </span>. Suggestions below are from cluster preferences,
          excluding items already purchased by this customer.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
          {finalPersonalized.map((x) => (
            <div key={`${currentCustomer}-${x.name}`} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-emerald-200 font-medium">{x.name}</p>
              <p className="text-xs text-slate-400">Recommendation score: {(x.score || x.qty || 0).toFixed(2)}</p>
            </div>
          ))}
        </div>
        <h4 className="text-sm text-slate-300 mb-1">Class explanation line:</h4>
        <p className="text-sm text-slate-200">
          “For {currentCustomer}, based on cluster history and past orders, we recommend {finalPersonalized.map((x) => x.name).join(", ")}
          as new menu items with high conversion probability.”
        </p>
      </GlassCard>

      <GlassCard className="border border-amber-500/20 bg-amber-500/5">
        <h3 className="text-lg mb-2 text-slate-100">Action Plan: Segment Campaigns</h3>
        <ul className="space-y-1 text-sm text-slate-300">
          {view.clusterTopItems.map((c) => (
            <li key={`plan-${c.cluster}`}>
              <span className="text-amber-200">
                Cluster {c.cluster + 1} - {view.clusterDisplayNames[c.cluster] || `Segment ${c.cluster + 1}`}:
              </span>{" "}
              Promote combos around <b>{c.items.slice(0, 2).map((x) => x.name).join(" + ")}</b> and test one new add-on item in this segment.
            </li>
          ))}
        </ul>
      </GlassCard>
      </>
      )}
        </div>
      </div>
    </div>
  );
}

