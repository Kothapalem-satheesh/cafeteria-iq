/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const mongoose = require("mongoose");

const Transaction = require("./src/models/Transaction");
const ClusterResult = require("./src/models/ClusterResult");
const MenuItem = require("./src/models/MenuItem");

const INPUT = process.argv[2] || path.join(__dirname, "notebooks", "data", "transactions.csv");
const URI = process.argv[3];

if (!URI) {
  console.error("Usage: node import_notebook_csv.cjs <csvPath> <mongoUri>");
  process.exit(1);
}

function normalizeItem(it) {
  const categoryMap = {
    Tea: "Beverages",
    Coffee: "Beverages",
    "Cold Coffee": "Beverages",
    Lassi: "Beverages",
    Lemonade: "Beverages",
    "Green Tea": "Beverages",
    "Dal Rice": "Main Course",
    "Rajma Chawal": "Main Course",
    "Paneer Curry+Roti": "Main Course",
    "Chole Bhature": "Main Course",
    "Chicken Curry+Rice": "Main Course",
    "Egg Curry+Rice": "Main Course",
    "Veg Biryani": "Main Course",
    "Chicken Biryani": "Main Course",
    Samosa: "Snacks",
    "Bread Pakora": "Snacks",
    "Vada Pav": "Snacks",
    "Aloo Tikki": "Snacks",
    Sandwich: "Snacks",
    Maggi: "Snacks",
    Kheer: "Desserts",
    "Gulab Jamun": "Desserts",
    "Ice Cream": "Desserts",
    Brownie: "Desserts",
    "Fruit Bowl": "Desserts",
    "Green Salad": "Salads",
    Raita: "Salads",
    "Fruit Salad": "Salads",
  };

  const itemName = it.itemName || it.name || "Unknown";
  return {
    itemName,
    category: it.category || categoryMap[itemName] || "Snacks",
    price: Number(it.price || 0),
    quantity: Number(it.quantity || 1),
    isVegetarian: it.isVegetarian !== false,
  };
}

async function readCsv(filePath) {
  const rows = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

async function recomputeMenu() {
  const txs = await Transaction.find({}).lean();
  const byName = new Map();
  for (const tx of txs) {
    for (const it of tx.items || []) {
      const key = it.itemName;
      if (!key) continue;
      const prev = byName.get(key) || { salesCount: 0, revenue: 0 };
      const q = Number(it.quantity || 1);
      const p = Number(it.price || 0);
      prev.salesCount += q;
      prev.revenue += q * p;
      byName.set(key, prev);
    }
  }

  const updates = [];
  for (const [name, agg] of byName.entries()) {
    updates.push(
      MenuItem.updateOne(
        { name },
        {
          $set: {
            salesCount: agg.salesCount,
            revenue: Math.round(agg.revenue * 100) / 100,
          },
        }
      )
    );
  }
  await Promise.all(updates);
}

async function main() {
  if (!fs.existsSync(INPUT)) {
    throw new Error(`CSV file not found: ${INPUT}`);
  }

  await mongoose.connect(URI);
  console.log("[import] Connected");

  const rows = await readCsv(INPUT);
  console.log("[import] CSV rows:", rows.length);

  const docs = rows.map((r, idx) => {
    let parsedItems = [];
    try {
      parsedItems = r.items_json ? JSON.parse(r.items_json) : [];
    } catch (e) {
      parsedItems = [];
    }

    const date = new Date(r.date || r.transaction_ts);
    const dow = r.day_of_week || r.dayOfWeek;
    const slot = r.time_slot || r.timeSlot;
    const amount = Number(r.total_amount || r.totalAmount || 0);

    return {
      transactionId: r.transaction_id || r.transactionId || `CSV-${idx + 1}`,
      customerId: r.customer_id || r.customerId,
      customerAge: r.customer_age ? Number(r.customer_age) : undefined,
      customerGender: r.customer_gender || undefined,
      date: Number.isNaN(date.getTime()) ? new Date() : date,
      dayOfWeek: dow,
      timeSlot: slot,
      totalAmount: amount,
      paymentMethod: r.payment_method || r.paymentMethod || undefined,
      items: Array.isArray(parsedItems) ? parsedItems.map(normalizeItem) : [],
      clusterId: null,
      clusterAlgorithm: null,
      anomalyScore: null,
      isAnomaly: false,
    };
  });

  await Transaction.deleteMany({});
  await ClusterResult.deleteMany({});
  await Transaction.insertMany(docs, { ordered: false });
  await recomputeMenu();

  const count = await Transaction.countDocuments();
  console.log("[import] Done. Transactions:", count);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("[import] Failed:", e.message);
  process.exit(1);
});
