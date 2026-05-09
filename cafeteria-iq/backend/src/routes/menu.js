const express = require("express");
const MenuItem = require("../models/MenuItem");
const ClusterResult = require("../models/ClusterResult");
const { auth } = require("../middleware/auth");

const router = express.Router();

router.get("/", auth(), async (req, res) => {
  res.json(await MenuItem.find().lean());
});

router.post("/", auth(["admin"]), async (req, res) => {
  const m = new MenuItem(req.body);
  await m.save();
  res.status(201).json(m);
});

router.put("/:id", auth(["admin"]), async (req, res) => {
  const m = await MenuItem.findOneAndUpdate(
    { itemId: req.params.id },
    req.body,
    { new: true }
  );
  if (!m) return res.status(404).json({ error: "not found" });
  res.json(m);
});

router.delete("/:id", auth(["admin"]), async (req, res) => {
  await MenuItem.deleteOne({ itemId: req.params.id });
  res.json({ ok: true });
});

router.get("/analytics/top-selling", auth(), async (req, res) => {
  const limit = Math.min(50, parseInt(req.query.limit, 10) || 10);
  const f = { isAvailable: true };
  if (req.query.timeSlot) {
  }
  res.json(
    await MenuItem.find(f).sort({ salesCount: -1 }).limit(limit).lean()
  );
});

router.get("/analytics/category-split", auth(), async (req, res) => {
  res.json(
    await MenuItem.aggregate([
      { $group: { _id: "$category", revenue: { $sum: "$revenue" } } },
    ]).then((a) => a.map((x) => ({ name: x._id, value: x.revenue })))
  );
});

router.get("/analytics/low-performers", auth(), async (req, res) => {
  res.json(
    await MenuItem.find({ salesCount: { $lt: 5 } })
      .sort({ salesCount: 1 })
      .limit(20)
      .lean()
  );
});

router.get("/analytics/hourly-demand", auth(), async (req, res) => {
  res.json({ series: [] });
});

router.get("/recommendations", auth(), async (req, res) => {
  const act = await ClusterResult.findOne({ isActive: true }).lean();
  if (!act) return res.json({ message: "No active clustering", items: [] });
  const names = (act.clusters || []).map((c) => c.topItems).flat().filter(Boolean);
  const items = await MenuItem.find({ name: { $in: names } })
    .limit(10)
    .lean();
  res.json({ clusters: act.clusters, items });
});

module.exports = router;
