const express = require("express");
const { v4: uuidv4 } = require("uuid");
const ClusterResult = require("../models/ClusterResult");
const Transaction = require("../models/Transaction");
const { auth } = require("../middleware/auth");
const ml = require("../services/mlService");

const router = express.Router();
let runStatus = { running: false, stage: "idle" };

function mapAlgorithm(a) {
  const m = {
    KMeans: (b) => ml.kmeans(b),
    DBSCAN: (b) => ml.dbscan(b),
    GMM: (b) => ml.gmm(b),
    Hierarchical: (b) => ml.hierarchical(b),
    Autoencoder: (b) => ml.autoencoder(b),
  };
  return m[a];
}

router.get("/status", auth(), (req, res) => {
  res.json({ running: runStatus.running, stage: runStatus.stage });
});

router.get("/active", auth(), async (req, res) => {
  const c = await ClusterResult.findOne({ isActive: true }).lean();
  res.json(c || null);
});

router.get("/compare", auth(), async (req, res) => {
  const d = await ml.compareAlgorithms();
  res.json(d);
});

router.get("/runs", auth(), async (req, res) => {
  res.json(
    await ClusterResult.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
  );
});

router.get("/runs/:runId", auth(), async (req, res) => {
  const c = await ClusterResult.findOne({ runId: req.params.runId }).lean();
  if (!c) return res.status(404).json({ error: "not found" });
  res.json(c);
});

router.put("/runs/:runId/activate", auth(), async (req, res) => {
  await ClusterResult.updateMany({}, { isActive: false });
  const c = await ClusterResult.findOneAndUpdate(
    { runId: req.params.runId },
    { isActive: true },
    { new: true }
  );
  if (!c) return res.status(404).json({ error: "not found" });
  res.json(c);
});

router.delete("/runs/:runId", auth(["admin"]), async (req, res) => {
  await ClusterResult.deleteOne({ runId: req.params.runId });
  res.json({ ok: true });
});

async function updateTransactionsAndSaveRun({
  io,
  algorithm,
  params,
  result,
  labels,
  runId,
  started,
}) {
  const feat = (await ml.features({}).catch(() => ({}))) || {};
  const cids = feat.customerIds;
  const lab = labels || result.labels;
  if (Array.isArray(cids) && Array.isArray(lab) && cids.length === lab.length) {
    for (let i = 0; i < cids.length; i += 1) {
      const cl = Number(lab[i]);
      if (Number.isNaN(cl)) continue;
      const clusterId = cl >= 0 ? cl : null;
      await Transaction.updateMany(
        { customerId: String(cids[i]) },
        { $set: { clusterId, clusterAlgorithm: algorithm } }
      );
    }
  }
  const metrics = (result && result.metrics) || {};
  let profiles = (result && result.profiles) || [];
  if ((!profiles || !profiles.length) && Array.isArray(lab) && lab.length) {
    const u = new Map();
    lab.forEach((k) => {
      const c = String(k);
      u.set(c, (u.get(c) || 0) + 1);
    });
    const n = lab.length;
    u.forEach((size, k) => {
      if (k === "-1") {
        return;
      }
      profiles.push({
        clusterId: parseInt(k, 10),
        clusterName: `Cluster ${k}`,
        size,
        percentOfTotal: (100 * size) / n,
      });
    });
  }
  const duration = (Date.now() - started) / 1000;
  const nClusters =
    result.n_clusters
    || result.nClusters
    || (profiles && profiles.length)
    || 0;
  const doc = {
    runId,
    algorithm,
    parameters: params,
    nClusters,
    metrics: {
      silhouette_score: metrics.silhouette_score,
      davies_bouldin_score: metrics.davies_bouldin_score,
      calinski_harabasz_score: metrics.calinski_harabasz_score,
      dunn_index: metrics.dunn_index,
      inertia: metrics.inertia,
    },
    clusters: (profiles || []).map((p) => ({
      clusterId: p.clusterId,
      clusterName: p.clusterName,
      size: p.size,
      percentage: p.percentOfTotal,
      avgSpend: 0,
      description: p.clusterName,
      topItems: [],
    })),
    runDuration: duration,
    nAnomalies: result.n_noise_points || result.n_anomalies || 0,
    isActive: true,
  };
  await ClusterResult.updateMany({}, { isActive: false });
  await ClusterResult.create(doc);
  if (io) {
    io.emit("clustering:complete", {
      runId,
      algorithm,
      nClusters,
      metrics: doc.metrics,
    });
  }
}

router.post(
  "/run",
  auth(["admin", "analyst"]),
  async (req, res) => {
    const io = req.app.get("io");
    const { algorithm, params = {} } = req.body;
    if (!algorithm || !mapAlgorithm(algorithm)) {
      return res.status(400).json({ error: "Invalid algorithm" });
    }
    const runId = uuidv4();
    if (io) {
      io.emit("clustering:started", { algorithm, runId, timestamp: Date.now() });
    }
    runStatus = { running: true, stage: "extract" };
    const t0 = Date.now();
    res.json({ runId, message: "Clustering job started" });
    setTimeout(async () => {
      if (io) {
        io.emit("clustering:progress", { stage: "ml", percent: 40, message: "Running ML" });
      }
      runStatus.stage = "cluster";
      try {
        const fn = mapAlgorithm(algorithm);
        const raw = await fn({
          n_clusters: params.n_clusters || 4,
          min_samples: params.min_samples,
          eps: params.eps,
          auto_k: params.auto_k,
          n_components: params.n_components,
          ...params,
        });
        if (io) {
          io.emit("clustering:progress", { stage: "done", percent: 100, message: "Done" });
        }
        const f = (await ml.features({})) || {};
        const labels = raw.labels;
        await updateTransactionsAndSaveRun({
          io,
          algorithm,
          params,
          result: { ...raw, ...f, customerIds: f.customerIds },
          labels,
          runId,
          started: t0,
        });
      } catch (e) {
        if (io) {
          io.emit("clustering:error", { runId, error: String(e.message || e) });
        }
      } finally {
        runStatus = { running: false, stage: "idle" };
      }
    }, 10);
  }
);

router.get("/clusters/:runId/:clustId", auth(), async (req, res) => {
  const c = await ClusterResult.findOne({ runId: req.params.runId }).lean();
  if (!c) return res.status(404).json({ error: "not found" });
  const cl = (c.clusters || []).find(
    (x) => String(x.clusterId) === String(req.params.clustId)
  );
  if (!cl) return res.status(404).json({ error: "cluster not found" });
  const count = await Transaction.countDocuments({ clusterId: cl.clusterId });
  res.json({ cluster: cl, nTransactions: count });
});

router.get("/clusters/:runId", auth(), async (req, res) => {
  const c = await ClusterResult.findOne({ runId: req.params.runId }).lean();
  if (!c) return res.status(404).json({ error: "not found" });
  res.json({ run: c, clusters: c.clusters || [] });
});

router.get("/anomalies/:runId", auth(), async (req, res) => {
  res.json(
    await Transaction.find({ isAnomaly: true }).sort({ date: -1 }).limit(200).lean()
  );
});

module.exports = router;

module.exports.getRunStatus = () => runStatus;
