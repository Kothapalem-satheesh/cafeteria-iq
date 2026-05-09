const express = require("express");
const Transaction = require("../models/Transaction");
const { auth } = require("../middleware/auth");
const { query } = require("express-validator");

const router = express.Router();

function pickFilters(q) {
  const f = {};
  if (q.startDate || q.endDate) {
    f.date = {};
    if (q.startDate) f.date.$gte = new Date(q.startDate);
    if (q.endDate) f.date.$lte = new Date(q.endDate);
  }
  if (q.cluster !== undefined) f.clusterId = Number(q.cluster);
  if (q.timeSlot) f.timeSlot = q.timeSlot;
  if (q.customerId) f.customerId = String(q.customerId);
  if (q.anomaly === "1") f.isAnomaly = true;
  if (q.payment) f.paymentMethod = q.payment;
  return f;
}

router.get(
  "/",
  auth(),
  [query("page").optional().isInt(), query("limit").optional().isInt()],
  async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const filter = pickFilters(req.query);
    const [items, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ date: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Transaction.countDocuments(filter),
    ]);
    res.json({ data: items, page, limit, total });
  }
);

router.get("/stats/overview", auth(), async (req, res) => {
  const all = await Transaction.aggregate([
    {
      $facet: {
        now: [
          { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" }, c: { $sum: 1 } } },
        ],
        customers: [{ $group: { _id: "$customerId" } }, { $count: "n" }],
      },
    },
  ]).then((r) => r[0] || { now: [], customers: [] });
  const t = all.now[0] || { totalRevenue: 0, c: 0 };
  const u = (all.customers[0] && all.customers[0].n) || 0;
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const prev = await Transaction.aggregate([
    { $match: { date: { $lt: oneMonthAgo } } },
    { $group: { _id: null, r: { $sum: "$totalAmount" }, c: { $sum: 1 } } },
  ]).then((r) => r[0] || { r: 0, c: 0 });
  res.json({
    totalRevenue: t.totalRevenue,
    totalTransactions: t.c,
    uniqueCustomers: u,
    avgOrderValue: t.c ? t.totalRevenue / t.c : 0,
    revenueGrowth: prev.r ? (t.totalRevenue - prev.r) / prev.r : 0,
    transactionGrowth: prev.c ? (t.c - prev.c) / prev.c : 0,
  });
});

router.get("/stats/timeseries", auth(), async (req, res) => {
  const d = await Transaction.aggregate([
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
        revenue: { $sum: "$totalAmount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    { $limit: 90 },
  ]);
  res.json(
    d.map((x) => ({ date: x._id, revenue: x.revenue, count: x.count }))
  );
});

router.get("/stats/heatmap", auth(), async (req, res) => {
  const m = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const s = { Breakfast: 0, Lunch: 1, Snacks: 2, Dinner: 3 };
  const grid = Array(28)
    .fill(null)
    .map((_, i) => {
      const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][
        Math.floor(i / 4)
      ];
      const timeSlot = ["Breakfast", "Lunch", "Snacks", "Dinner"][i % 4];
      return { day, timeSlot, count: 0, revenue: 0 };
    });
  const agg = await Transaction.aggregate([
    {
      $group: {
        _id: { day: "$dayOfWeek", timeSlot: "$timeSlot" },
        count: { $sum: 1 },
        revenue: { $sum: "$totalAmount" },
      },
    },
  ]);
  for (const a of agg) {
    if (!a._id.day || !a._id.timeSlot) continue;
    const i = m[a._id.day] * 4 + s[a._id.timeSlot];
    if (i >= 0 && i < 28) {
      grid[i] = { ...grid[i], count: a.count, revenue: a.revenue };
    }
  }
  res.json({ matrix: grid });
});

router.get("/stats/rfm", auth(), async (req, res) => {
  const now = new Date();
  const rows = await Transaction.aggregate([
    { $group: { _id: "$customerId", last: { $max: "$date" }, c: { $sum: 1 }, m: { $sum: "$totalAmount" } } },
  ]).then((a) =>
    a.map((r) => ({
      customerId: r._id,
      recency: Math.max(0, (now - new Date(r.last)) / 864e5),
      frequency: r.c,
      monetary: r.m,
    }))
  );
  res.json(rows);
});

router.get("/stats/category-trend", auth(), async (req, res) => {
  res.json(
    await Transaction.aggregate([
      { $unwind: "$items" },
      { $group: { _id: { d: { $dateToString: { format: "%Y-%m", date: "$date" } }, cat: "$items.category" }, v: { $sum: { $multiply: ["$items.price", "$items.quantity"] } } } },
      { $sort: { "_id.d": 1 } },
      { $limit: 200 },
    ]).then((a) => a.map((x) => ({ month: x._id.d, category: x._id.cat, revenue: x.v })))
  );
});

router.get("/anomalies", auth(), async (req, res) => {
  res.json(
    await Transaction.find({ isAnomaly: true }).sort({ date: -1 }).limit(100).lean()
  );
});

router.get("/:id", auth(), async (req, res) => {
  const t = await Transaction.findOne({ transactionId: req.params.id }).lean();
  if (!t) return res.status(404).json({ error: "Not found" });
  res.json(t);
});

router.post("/", auth(["admin", "analyst"]), async (req, res) => {
  const t = new Transaction(req.body);
  await t.save();
  res.status(201).json(t);
});

router.post("/bulk", auth(["admin", "analyst"]), async (req, res) => {
  const arr = Array.isArray(req.body) ? req.body : req.body.transactions;
  if (!Array.isArray(arr)) return res.status(400).json({ error: "expected array" });
  await Transaction.insertMany(arr, { ordered: false }).catch((e) => e);
  res.json({ inserted: arr.length });
});

module.exports = router;
