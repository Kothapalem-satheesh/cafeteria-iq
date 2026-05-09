const mongoose = require("mongoose");

const menuItemSchema = new mongoose.Schema({
  itemId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  category: {
    type: String,
    enum: [
      "Main Course",
      "Beverages",
      "Snacks",
      "Desserts",
      "Salads",
    ],
  },
  price: { type: Number, required: true },
  calories: { type: Number, default: 0 },
  isVegetarian: { type: Boolean, default: true },
  isAvailable: { type: Boolean, default: true },
  salesCount: { type: Number, default: 0 },
  revenue: { type: Number, default: 0 },
  avgRating: { type: Number, default: 0 },
});

module.exports = mongoose.model("MenuItem", menuItemSchema);
