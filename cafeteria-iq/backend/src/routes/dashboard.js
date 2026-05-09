const express = require("express");
const Transaction = require("../models/Transaction");
const MenuItem = require("../models/MenuItem");
const ClusterResult = require("../models/ClusterResult");
const { auth } = require("../middleware/auth");

const router = express.Router();

router.get("/all", auth(), async (req, res) => {
  const [ov, act, top, lastTx] = await Promise.all([
    Transaction.aggregate([
      {
        $facet: {
          t: [
            { $group: { _id: null, r: { $sum: "$totalAmount" }, c: { $sum: 1 } } },
          ],
          u: [{ $group: { _id: "$customerId" } }, { $count: "n" }],
        },
      },
    ]).then((a) => a[0] || { t: [], u: [] }),
    ClusterResult.findOne({ isActive: true }).lean(),
    MenuItem.find().sort({ revenue: -1 }).limit(8).lean(),
    Transaction.find().sort({ date: -1 }).limit(10).lean(),
  ]);
  const t = (ov.t && ov.t[0]) || { r: 0, c: 0 };
  const nU = (ov.u && ov.u[0] && ov.u[0].n) || 0;

  let revenueByCluster = null;
  if (act && act.algorithm) {
    const raw = await Transaction.aggregate([
      { $match: { clusterId: { $ne: null }, clusterAlgorithm: act.algorithm } },
      {
        $group: {
          _id: "$clusterId",
          revenue: { $sum: "$totalAmount" },
          transactions: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
    ]);
    const nameById = new Map(
      (act.clusters || []).map((c) => [c.clusterId, c.clusterName || `Cluster ${c.clusterId}`])
    );
    revenueByCluster = raw.map((r) => ({
      clusterId: r._id,
      name: nameById.get(r._id) || `Cluster ${r._id}`,
      revenue: r.revenue,
      transactions: r.transactions,
    }));
  }

  res.json({
    kpi: {
      totalRevenue: t.r,
      totalTransactions: t.c,
      uniqueCustomers: nU,
      avgOrderValue: t.c ? t.r / t.c : 0,
    },
    activeClustering: act,
    topMenu: top,
    revenueByCluster,
    recentTransactions: lastTx,
  });
});

module.exports = router;
