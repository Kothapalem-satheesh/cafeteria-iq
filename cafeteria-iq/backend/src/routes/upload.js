const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const csv = require("csv-parser");
const Transaction = require("../models/Transaction");
const { auth } = require("../middleware/auth");

const router = express.Router();
const upload = multer({ dest: path.join(__dirname, "../../uploads") });

router.post("/csv", auth(["admin", "analyst"]), upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  const rows = [];
  const p = path.join(req.file.path);
  try {
  fs.createReadStream(p)
    .pipe(csv())
    .on("data", (d) => rows.push(d))
    .on("end", async () => {
      const docs = rows.map((r) => {
        return {
          transactionId: r.transactionId || r.id || `tx-${Date.now()}-${Math.random()}`,
          customerId: r.customerId,
          date: new Date(r.date),
          dayOfWeek: r.dayOfWeek,
          timeSlot: r.timeSlot,
          totalAmount: parseFloat(r.totalAmount) || 0,
          items: r.items ? JSON.parse(r.items) : [],
        };
      });
      try {
        await Transaction.insertMany(docs, { ordered: false });
      } catch (e) {
        return res.json({ ok: true, partial: true, count: rows.length, error: String(e.message) });
      }
      fs.unlink(p, () => {});
      return res.json({ ok: true, count: rows.length });
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.get("/template", (req, res) => {
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=cafeiq_template.csv");
  res.send("transactionId,customerId,date,dayOfWeek,timeSlot,totalAmount,items");
});

module.exports = router;
