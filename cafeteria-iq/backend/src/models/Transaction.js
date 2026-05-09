const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema(
  {
    itemName: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, default: 0 },
    quantity: { type: Number, default: 1 },
    isVegetarian: { type: Boolean, default: true },
  },
  { _id: false }
);

const transactionSchema = new mongoose.Schema(
  {
    transactionId: { type: String, required: true, unique: true, index: true },
    customerId: { type: String, required: true, index: true },
    customerAge: { type: Number, min: 15, max: 80 },
    customerGender: { type: String, enum: ["M", "F", "Other"] },
    date: { type: Date, required: true, index: true },
    dayOfWeek: {
      type: String,
      enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    },
    timeSlot: {
      type: String,
      enum: ["Breakfast", "Lunch", "Snacks", "Dinner"],
    },
    items: [itemSchema],
    totalAmount: { type: Number, required: true },
    paymentMethod: { type: String, enum: ["Cash", "Card", "UPI", "Wallet"] },
    clusterId: { type: Number, default: null },
    clusterAlgorithm: { type: String, default: null },
    anomalyScore: { type: Number, default: null },
    isAnomaly: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: false } }
);

module.exports = mongoose.model("Transaction", transactionSchema);
