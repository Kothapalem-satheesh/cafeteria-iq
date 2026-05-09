/* eslint-disable no-console */
/**
 * CafeIQ — “best” demo dataset: 500 customers, 8,000 transactions / 12 months,
 * 5 behaviour personas, weekday/weekend and lunch peaks, monsoon beverage bump,
 * optional light “anomaly” rows. Recomputes MenuItem.salesCount + revenue from lines.
 */
const path = require("path");
require(path.join(__dirname, "../backend/node_modules/dotenv")).config({
  path: path.join(__dirname, "../backend/.env"),
});
const mongoose = require(path.join(__dirname, "../backend/node_modules/mongoose"));
const Transaction = require(path.join(__dirname, "../backend/src/models/Transaction"));
const MenuItem = require(path.join(__dirname, "../backend/src/models/MenuItem"));
const User = require(path.join(__dirname, "../backend/src/models/User"));

const MONGO = process.env.MONGODB_URI || "mongodb://localhost:27017/cafeteria_iq";

if (MONGO.includes("YOUR_CLUSTER_HOST")) {
  // eslint-disable-next-line no-console
  console.error(
    "[seed] MONGODB_URI in backend/.env still contains YOUR_CLUSTER_HOST.\n" +
      "  → Paste your full Atlas SRV, or for local: mongodb://127.0.0.1:27017/cafeteria_iq"
  );
  process.exit(1);
}

const menuSpec = [
  { itemId: "b1", name: "Tea", category: "Beverages", price: 15, isVegetarian: true, calories: 2 },
  { itemId: "b2", name: "Coffee", category: "Beverages", price: 25, isVegetarian: true, calories: 5 },
  { itemId: "b3", name: "Cold Coffee", category: "Beverages", price: 50, isVegetarian: true, calories: 80 },
  { itemId: "b4", name: "Lassi", category: "Beverages", price: 30, isVegetarian: true, calories: 90 },
  { itemId: "b5", name: "Lemonade", category: "Beverages", price: 20, isVegetarian: true, calories: 40 },
  { itemId: "b6", name: "Green Tea", category: "Beverages", price: 20, isVegetarian: true, calories: 0 },
  { itemId: "m1", name: "Dal Rice", category: "Main Course", price: 60, isVegetarian: true, calories: 450 },
  { itemId: "m2", name: "Rajma Chawal", category: "Main Course", price: 70, isVegetarian: true, calories: 500 },
  { itemId: "m3", name: "Paneer Curry+Roti", category: "Main Course", price: 90, isVegetarian: true, calories: 600 },
  { itemId: "m4", name: "Chole Bhature", category: "Main Course", price: 85, isVegetarian: true, calories: 750 },
  { itemId: "m5", name: "Chicken Curry+Rice", category: "Main Course", price: 110, isVegetarian: false, calories: 650 },
  { itemId: "m6", name: "Egg Curry+Rice", category: "Main Course", price: 90, isVegetarian: false, calories: 550 },
  { itemId: "m7", name: "Veg Biryani", category: "Main Course", price: 100, isVegetarian: true, calories: 700 },
  { itemId: "m8", name: "Chicken Biryani", category: "Main Course", price: 130, isVegetarian: false, calories: 800 },
  { itemId: "s1", name: "Samosa", category: "Snacks", price: 15, isVegetarian: true, calories: 200 },
  { itemId: "s2", name: "Bread Pakora", category: "Snacks", price: 20, isVegetarian: true, calories: 250 },
  { itemId: "s3", name: "Vada Pav", category: "Snacks", price: 25, isVegetarian: true, calories: 300 },
  { itemId: "s4", name: "Aloo Tikki", category: "Snacks", price: 20, isVegetarian: true, calories: 180 },
  { itemId: "s5", name: "Sandwich", category: "Snacks", price: 50, isVegetarian: true, calories: 320 },
  { itemId: "s6", name: "Maggi", category: "Snacks", price: 40, isVegetarian: true, calories: 400 },
  { itemId: "d1", name: "Kheer", category: "Desserts", price: 30, isVegetarian: true, calories: 200 },
  { itemId: "d2", name: "Gulab Jamun", category: "Desserts", price: 25, isVegetarian: true, calories: 150 },
  { itemId: "d3", name: "Ice Cream", category: "Desserts", price: 40, isVegetarian: true, calories: 180 },
  { itemId: "d4", name: "Brownie", category: "Desserts", price: 60, isVegetarian: true, calories: 300 },
  { itemId: "d5", name: "Fruit Bowl", category: "Desserts", price: 45, isVegetarian: true, calories: 120 },
  { itemId: "a1", name: "Green Salad", category: "Salads", price: 30, isVegetarian: true, calories: 50 },
  { itemId: "a2", name: "Raita", category: "Salads", price: 25, isVegetarian: true, calories: 60 },
  { itemId: "a3", name: "Fruit Salad", category: "Salads", price: 50, isVegetarian: true, calories: 100 },
];

const byName = {};
for (const m of menuSpec) {
  byName[m.name] = m;
}

function lineFrom(name, qty) {
  const b = byName[name];
  if (!b) return null;
  return {
    itemName: b.name,
    category: b.category,
    price: b.price,
    quantity: qty,
    isVegetarian: b.isVegetarian,
  };
}

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pay = ["Cash", "Card", "UPI", "Wallet"];
const SLOTS = {
  Breakfast: { h: [8, 9, 10] },
  Lunch: { h: [12, 13, 14] },
  Snacks: { h: [16, 17, 18] },
  Dinner: { h: [19, 20, 21] },
};

/**
 * Personas: weights for which basket id to use (0..n-1) + age + rough visit frequency
 */
const personas = [
  { id: 0, label: "Students", minA: 18, maxA: 24, w: 0.22, basketIds: "student" },
  { id: 1, label: "Office", minA: 25, maxA: 50, w: 0.28, basketIds: "office" },
  { id: 2, label: "Health", minA: 26, maxA: 45, w: 0.14, basketIds: "health" },
  { id: 3, label: "Regulars", minA: 32, maxA: 60, w: 0.26, basketIds: "regular" },
  { id: 4, label: "Occasional", minA: 22, maxA: 55, w: 0.1, basketIds: "occasional" },
];

// Named baskets: returns array of line objects
const baskets = {
  student: [
    () => [lineFrom("Samosa", 1), lineFrom("Tea", 1)],
    () => [lineFrom("Vada Pav", 1), lineFrom("Coffee", 1)],
    () => [lineFrom("Maggi", 1), lineFrom("Tea", 1)],
    () => [lineFrom("Aloo Tikki", 1), lineFrom("Lemonade", 1)],
  ],
  office: [
    () => [lineFrom("Paneer Curry+Roti", 1), lineFrom("Lassi", 1)],
    () => [lineFrom("Rajma Chawal", 1), lineFrom("Lemonade", 1)],
    () => [lineFrom("Chole Bhature", 1), lineFrom("Cold Coffee", 1)],
    () => [lineFrom("Chicken Curry+Rice", 1), lineFrom("Lassi", 1)],
    () => [lineFrom("Veg Biryani", 1), lineFrom("Lassi", 1)],
  ],
  health: [
    () => [lineFrom("Green Salad", 1), lineFrom("Fruit Bowl", 1), lineFrom("Green Tea", 1)],
    () => [lineFrom("Fruit Salad", 1), lineFrom("Lemonade", 1)],
    () => [lineFrom("Raita", 1), lineFrom("Dal Rice", 1), lineFrom("Green Tea", 1)],
  ],
  regular: [
    () => [lineFrom("Dal Rice", 1), lineFrom("Tea", 1)],
    () => [lineFrom("Veg Biryani", 1), lineFrom("Lassi", 1)],
    () => [lineFrom("Rajma Chawal", 1), lineFrom("Samosa", 1), lineFrom("Tea", 1)],
    () => [lineFrom("Paneer Curry+Roti", 1), lineFrom("Gulab Jamun", 1)],
  ],
  occasional: [
    () => [lineFrom("Chicken Biryani", 1), lineFrom("Lassi", 1), lineFrom("Ice Cream", 1)],
    () => [lineFrom("Chicken Biryani", 1), lineFrom("Brownie", 1), lineFrom("Cold Coffee", 1)],
  ],
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randi(a, b) {
  return a + Math.floor(Math.random() * (b - a + 1));
}

function pickPersona() {
  const r = Math.random();
  let c = 0;
  for (const p of personas) {
    c += p.w;
    if (r < c) return p;
  }
  return personas[0];
}

function pickSlotForDay(dow) {
  if (dow === "Mon" && Math.random() < 0.12) return "Lunch";
  if (dow === "Fri" && Math.random() < 0.22) return "Dinner";
  if (Math.random() < 0.42) return "Lunch";
  const r = Math.random();
  if (r < 0.18) return "Breakfast";
  if (r < 0.6) return "Lunch";
  if (r < 0.82) return "Snacks";
  return "Dinner";
}

function setClockForSlot(d, slot) {
  const hlist = SLOTS[slot] ? SLOTS[slot].h : [12];
  const h = pick(hlist);
  const m = randi(0, 45);
  d.setHours(h, m, 0, 0);
}

function buildBasket(persona, monsoon) {
  const key = persona.basketIds;
  const list = baskets[key] || baskets.student;
  let lines = pick(list)().filter(Boolean);
  if (monsoon && Math.random() < 0.35) {
    const bev = pick(["Tea", "Coffee", "Green Tea", "Lemonade"].map((n) => lineFrom(n, 1)));
    if (bev && !lines.some((x) => x.category === "Beverages")) {
      lines = [...lines, bev];
    }
  }
  if (key === "student" && Math.random() < 0.2) {
    const ex = lineFrom("Samosa", 1);
    if (ex && !lines.find((l) => l.itemName === "Samosa")) lines = [...lines, ex];
  }
  return lines;
}

function totalFor(lines) {
  return lines.reduce((s, x) => s + (x.price || 0) * (x.quantity || 1), 0);
}

async function recomputeMenuFromTransactions() {
  const acc = new Map();
  for (const m of menuSpec) {
    acc.set(m.name, { salesCount: 0, revenue: 0 });
  }
  const c = await Transaction.find({}).lean();
  for (const tx of c) {
    for (const it of tx.items || []) {
      if (!it.itemName) continue;
      const row = acc.get(it.itemName);
      if (!row) continue;
      const q = it.quantity || 1;
      const p = it.price != null ? it.price : byName[it.itemName]?.price || 0;
      row.salesCount += q;
      row.revenue += p * q;
    }
  }
  const ops = [];
  for (const m of menuSpec) {
    const s = acc.get(m.name);
    if (!s) continue;
    ops.push(
      MenuItem.updateOne(
        { itemId: m.itemId },
        { $set: { salesCount: s.salesCount, revenue: Math.round(s.revenue * 100) / 100 } }
      )
    );
  }
  await Promise.all(ops);
}

const N_TX = 8000;
const N_CUSTOMERS = 500;
const ANOMALY_PCT = 0.04;

async function run() {
  await mongoose.connect(MONGO);
  await Promise.all([Transaction.deleteMany({}), MenuItem.deleteMany({})]);
  const menu = menuSpec.map((m) => new MenuItem({ ...m, salesCount: 0, revenue: 0 }));
  await MenuItem.insertMany(menu);

  await User.deleteOne({ email: "demo@cafeiq.com" });
  const u = new User({
    name: "Demo Analyst",
    email: "demo@cafeiq.com",
    password: "demo123",
    role: "analyst",
  });
  await u.save();

  const customers = Array.from({ length: N_CUSTOMERS }, (_, i) => `CUST${String(1000 + i)}`);
  const start = new Date(2024, 0, 1);
  const end = new Date(2024, 11, 31, 23, 59, 59, 999);
  const txs = [];

  for (let t = 0; t < N_TX; t += 1) {
    const p = pickPersona();
    const d = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    const dayJs = d.getDay();
    const dow = days[dayJs === 0 ? 6 : dayJs - 1];
    const isWknd = dow === "Sat" || dow === "Sun";
    const monsoon = d.getMonth() >= 5 && d.getMonth() <= 8;

    let slot = pickSlotForDay(dow);
    setClockForSlot(d, slot);
    if (dow === "Fri" && Math.random() < 0.08) slot = "Snacks";

    let items = buildBasket(p, monsoon);
    if (Math.random() < ANOMALY_PCT) {
      if (Math.random() < 0.5) {
        items = [lineFrom("Veg Biryani", 4), lineFrom("Lassi", 2)];
      } else {
        items = [lineFrom("Chicken Biryani", 1), lineFrom("Brownie", 1)];
      }
    }
    if (!items.length) items = [lineFrom("Dal Rice", 1), lineFrom("Tea", 1)];

    let total = totalFor(items);
    if (isWknd) total *= 1.12;
    if (dow === "Fri" && Math.random() < 0.15) total *= 1.05;
    total = Math.max(1, Math.round(total));

    const age = randi(p.minA, p.maxA);
    const gen = t % 3 === 0 ? "F" : t % 3 === 1 ? "M" : "Other";

    txs.push({
      transactionId: `TXN-2024-${String(t + 1).padStart(7, "0")}`,
      customerId: pick(customers),
      customerAge: age,
      customerGender: gen,
      date: d,
      dayOfWeek: dow,
      timeSlot: slot,
      items,
      totalAmount: total,
      paymentMethod: pay[t % pay.length],
    });
  }

  await Transaction.insertMany(txs, { ordered: false });
  await recomputeMenuFromTransactions();

  const revAgg = await Transaction.aggregate([
    { $group: { _id: null, r: { $sum: "$totalAmount" }, c: { $sum: 1 } } },
  ]);
  const r0 = revAgg[0] || { r: 0, c: 0 };
  // eslint-disable-next-line no-console
  console.log("CafeIQ seed complete");
  // eslint-disable-next-line no-console
  console.log("  • Customers:", N_CUSTOMERS, "• Transactions:", N_TX);
  // eslint-disable-next-line no-console
  console.log("  • Total revenue (₹):", r0.r, "• Avg order (₹):", r0.c ? (r0.r / r0.c).toFixed(2) : 0);
  // eslint-disable-next-line no-console
  console.log("  • Menu lines updated with salesCount + revenue from transaction items");
  // eslint-disable-next-line no-console
  console.log("  • Login: demo@cafeiq.com / demo123");
  process.exit(0);
}

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
