const express = require("express");
const { auth } = require("../middleware/auth");
const ml = require("../services/mlService");

const router = express.Router();

router.post("/pca", auth(), async (req, res) => {
  res.json(await ml.pca(req.body));
});

router.post("/tsne", auth(), async (req, res) => {
  res.json(await ml.tsne(req.body));
});

router.post("/umap", auth(), async (req, res) => {
  res.json(await ml.umap(req.body));
});

module.exports = router;
