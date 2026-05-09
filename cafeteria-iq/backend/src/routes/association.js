const express = require("express");
const { auth } = require("../middleware/auth");
const ml = require("../services/mlService");

const router = express.Router();
let lastRules = { rules: [], bundles: [], at: 0 };

router.post("/mine", auth(), async (req, res) => {
  const d = await ml.associationRules(req.body);
  lastRules = { ...d, at: Date.now() };
  res.json(d);
});

router.get("/rules", auth(), (req, res) => {
  res.json({ rules: lastRules.rules || [], minedAt: lastRules.at || null });
});

router.get("/bundles", auth(), (req, res) => {
  const b = lastRules.bundle_suggestions || lastRules.bundles || [];
  res.json({ bundle_suggestions: b, bundles: b });
});

router.post("/cluster/:clusterId", auth(), async (req, res) => {
  res.json(
    await ml.associationRules({
      ...req.body,
      cluster_id: req.params.clusterId,
    })
  );
});

module.exports = router;
