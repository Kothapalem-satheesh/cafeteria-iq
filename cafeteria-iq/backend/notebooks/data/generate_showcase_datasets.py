import csv
import json
import random
from datetime import datetime, timedelta
from pathlib import Path


HEADER = [
    "transaction_id",
    "customer_id",
    "customer_age",
    "customer_gender",
    "date",
    "day_of_week",
    "time_slot",
    "total_amount",
    "payment_method",
    "items_json",
]

MENU = [
    {"itemName": "Veg Biryani", "price": 100, "category": "Main Course", "isVegetarian": True},
    {"itemName": "Chicken Biryani", "price": 130, "category": "Main Course", "isVegetarian": False},
    {"itemName": "Paneer Curry+Roti", "price": 90, "category": "Main Course", "isVegetarian": True},
    {"itemName": "Dal Rice", "price": 60, "category": "Main Course", "isVegetarian": True},
    {"itemName": "Rajma Chawal", "price": 70, "category": "Main Course", "isVegetarian": True},
    {"itemName": "Chole Bhature", "price": 85, "category": "Main Course", "isVegetarian": True},
    {"itemName": "Sandwich", "price": 50, "category": "Snacks", "isVegetarian": True},
    {"itemName": "Samosa", "price": 15, "category": "Snacks", "isVegetarian": True},
    {"itemName": "Maggi", "price": 40, "category": "Snacks", "isVegetarian": True},
    {"itemName": "Tea", "price": 15, "category": "Beverages", "isVegetarian": True},
    {"itemName": "Coffee", "price": 25, "category": "Beverages", "isVegetarian": True},
    {"itemName": "Cold Coffee", "price": 50, "category": "Beverages", "isVegetarian": True},
    {"itemName": "Lassi", "price": 30, "category": "Beverages", "isVegetarian": True},
    {"itemName": "Ice Cream", "price": 45, "category": "Desserts", "isVegetarian": True},
    {"itemName": "Brownie", "price": 55, "category": "Desserts", "isVegetarian": True},
    {"itemName": "Fruit Bowl", "price": 40, "category": "Desserts", "isVegetarian": True},
]

SCENARIOS = {
    "01_balanced_weekly_flow.csv": {
        "description": "Balanced demand across all slots and categories.",
        "slot_weights": {"Breakfast": 0.20, "Lunch": 0.40, "Snacks": 0.22, "Dinner": 0.18},
        "weekend_multiplier": 1.15,
        "premium_bias": 1.0,
        "dessert_bias": 1.0,
        "digital_payment_bias": 0.65,
    },
    "02_lunch_rush_corporate.csv": {
        "description": "Strong lunch rush with higher average order values.",
        "slot_weights": {"Breakfast": 0.10, "Lunch": 0.62, "Snacks": 0.16, "Dinner": 0.12},
        "weekend_multiplier": 0.95,
        "premium_bias": 1.2,
        "dessert_bias": 0.75,
        "digital_payment_bias": 0.78,
    },
    "03_evening_snackers_students.csv": {
        "description": "Student-heavy behavior with snacks and beverages.",
        "slot_weights": {"Breakfast": 0.08, "Lunch": 0.18, "Snacks": 0.53, "Dinner": 0.21},
        "weekend_multiplier": 1.20,
        "premium_bias": 0.8,
        "dessert_bias": 1.15,
        "digital_payment_bias": 0.83,
    },
    "04_premium_weekend_family.csv": {
        "description": "Family weekend spikes with premium basket sizes.",
        "slot_weights": {"Breakfast": 0.14, "Lunch": 0.28, "Snacks": 0.15, "Dinner": 0.43},
        "weekend_multiplier": 1.45,
        "premium_bias": 1.35,
        "dessert_bias": 1.20,
        "digital_payment_bias": 0.72,
    },
    "05_health_conscious_low_calorie.csv": {
        "description": "Lower spend, lighter menu choices, fewer fried items.",
        "slot_weights": {"Breakfast": 0.24, "Lunch": 0.35, "Snacks": 0.26, "Dinner": 0.15},
        "weekend_multiplier": 1.05,
        "premium_bias": 0.72,
        "dessert_bias": 0.60,
        "digital_payment_bias": 0.75,
    },
    "06_anomaly_festival_week.csv": {
        "description": "Festival week with sudden spikes and unusual bundles.",
        "slot_weights": {"Breakfast": 0.15, "Lunch": 0.33, "Snacks": 0.22, "Dinner": 0.30},
        "weekend_multiplier": 1.30,
        "premium_bias": 1.25,
        "dessert_bias": 1.40,
        "digital_payment_bias": 0.80,
    },
}


def weighted_choice(weights, rng):
    keys = list(weights.keys())
    vals = list(weights.values())
    return rng.choices(keys, weights=vals, k=1)[0]


def build_items(cfg, slot, rng):
    count = rng.choices([1, 2, 3], weights=[0.45, 0.37, 0.18], k=1)[0]
    mains = [m for m in MENU if m["category"] == "Main Course"]
    snacks = [m for m in MENU if m["category"] == "Snacks"]
    beverages = [m for m in MENU if m["category"] == "Beverages"]
    desserts = [m for m in MENU if m["category"] == "Desserts"]

    pool = []
    if slot in ("Lunch", "Dinner"):
        pool.extend(mains * int(3 * cfg["premium_bias"]))
        pool.extend(beverages * 2)
        pool.extend(desserts * int(max(1, cfg["dessert_bias"])))
    elif slot == "Snacks":
        pool.extend(snacks * 3)
        pool.extend(beverages * 3)
        pool.extend(desserts * int(max(1, cfg["dessert_bias"] * 2)))
    else:
        pool.extend(beverages * 3)
        pool.extend(snacks * 2)
        pool.extend(mains)

    selected = rng.sample(pool, k=min(count, len(pool)))
    out = []
    for item in selected:
        q = rng.choices([1, 2], weights=[0.84, 0.16], k=1)[0]
        out.append(
            {
                "itemName": item["itemName"],
                "quantity": q,
                "price": item["price"],
                "category": item["category"],
                "isVegetarian": item["isVegetarian"],
            }
        )
    return out


def generate_dataset(filename, cfg, out_dir, n_rows=1000):
    rng = random.Random(2026 + abs(hash(filename)) % 10000)
    start = datetime(2024, 1, 1, 7, 0, 0)
    payments = ["Cash", "UPI", "Card", "Wallet"]
    rows = []

    for i in range(1, n_rows + 1):
        customer_num = 1000 + i
        customer_id = f"CUST{customer_num}"
        age = rng.randint(18, 46)
        gender = rng.choice(["M", "F"])
        day_offset = rng.randint(0, 180)
        dt = start + timedelta(days=day_offset, minutes=rng.randint(0, 14 * 60))
        day = dt.strftime("%a")
        slot = weighted_choice(cfg["slot_weights"], rng)

        if slot == "Breakfast":
            dt = dt.replace(hour=rng.randint(7, 10), minute=rng.randint(0, 59))
        elif slot == "Lunch":
            dt = dt.replace(hour=rng.randint(12, 15), minute=rng.randint(0, 59))
        elif slot == "Snacks":
            dt = dt.replace(hour=rng.randint(16, 18), minute=rng.randint(0, 59))
        else:
            dt = dt.replace(hour=rng.randint(19, 21), minute=rng.randint(0, 59))

        items = build_items(cfg, slot, rng)
        amount = sum(it["price"] * it["quantity"] for it in items)
        if day in ("Sat", "Sun"):
            amount = int(round(amount * cfg["weekend_multiplier"]))
        amount += rng.randint(-5, 12)
        amount = max(15, amount)

        payment_weights = [
            1.0 - cfg["digital_payment_bias"],
            cfg["digital_payment_bias"] * 0.45,
            cfg["digital_payment_bias"] * 0.30,
            cfg["digital_payment_bias"] * 0.25,
        ]
        payment = rng.choices(payments, weights=payment_weights, k=1)[0]

        # Festival scenario anomaly injections
        if "festival" in filename and rng.random() < 0.05:
            amount = int(amount * rng.uniform(1.5, 2.3))
            items.append(
                {
                    "itemName": "Brownie",
                    "quantity": 2,
                    "price": 55,
                    "category": "Desserts",
                    "isVegetarian": True,
                }
            )

        rows.append(
            [
                f"TXN-{filename[:2]}-{i:07d}",
                customer_id,
                age,
                gender,
                dt.strftime("%Y-%m-%d %H:%M:%S"),
                day,
                slot,
                amount,
                payment,
                json.dumps(items, separators=(",", ":")),
            ]
        )

    out_path = out_dir / filename
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(HEADER)
        writer.writerows(rows)
    return out_path


def main():
    base_dir = Path(__file__).resolve().parent
    out_dir = base_dir / "showcase_datasets"
    out_dir.mkdir(parents=True, exist_ok=True)

    generated = []
    for filename, cfg in SCENARIOS.items():
        generated.append((filename, cfg["description"], generate_dataset(filename, cfg, out_dir)))

    readme = out_dir / "README.md"
    lines = [
        "# Showcase Datasets",
        "",
        "Use these CSV files in class demos to showcase how clustering and recommendations change by behavior pattern.",
        "",
        "## Files",
    ]
    for fname, desc, _ in generated:
        lines.append(f"- `{fname}`: {desc}")
    lines.append("")
    lines.append("Each file has 1000 rows and follows the same schema as `transactions.csv`.")
    readme.write_text("\n".join(lines), encoding="utf-8")

    print("Generated showcase datasets:")
    for fname, _, path in generated:
        print("-", fname, "=>", path)
    print("-", readme.name, "=>", readme)


if __name__ == "__main__":
    main()
