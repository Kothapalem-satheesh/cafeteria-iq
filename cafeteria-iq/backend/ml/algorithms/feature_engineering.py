"""Unsupervised feature engineering: RFM + behavior + time features."""
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

ALL_CATEGORIES = {
    "Main Course",
    "Beverages",
    "Snacks",
    "Desserts",
    "Salads",
}
SLOT_TO_CODE = {"Breakfast": 0, "Lunch": 1, "Snacks": 2, "Dinner": 3}
SLOT_HOUR = {"Breakfast": 9, "Lunch": 12, "Snacks": 16, "Dinner": 19}
DAY_WEEK = {"Mon", "Tue", "Wed", "Thu", "Fri"}
DAY_END = {"Sat", "Sun"}


def _hour_from_row(row):
    d = row.get("date")
    if pd.isna(d) or d is None:
        return SLOT_HOUR.get(row.get("timeSlot"), 12)
    if hasattr(d, "hour"):
        return int(d.hour)
    t = pd.to_datetime(d, errors="coerce")
    if pd.isna(t):
        return SLOT_HOUR.get(row.get("timeSlot"), 12)
    return int(t.hour)


def _is_weekend(day_of_week: str) -> int:
    if not day_of_week:
        return 0
    return 1 if str(day_of_week) in ("Sat", "Sun") else 0


def _parse_items_stats(items, total_cats: int):
    n_items = 0
    cat_counts = {c: 0 for c in ALL_CATEGORIES}
    veg = 0
    bev = 0
    snacks = 0
    desserts = 0
    for it in items or []:
        n_items += int(it.get("quantity") or 0) or 1
        q = int(it.get("quantity") or 1)
        cat = (it.get("category") or "").strip()
        if cat in cat_counts:
            cat_counts[cat] += q
        if it.get("isVegetarian") is True or it.get("isVegetarian") == "true":
            veg += q
        if cat == "Beverages":
            bev += q
        if cat == "Snacks":
            snacks += q
        if cat == "Desserts":
            desserts += q
    total = sum(cat_counts.values()) or 1
    cats_ordered = len([c for c, v in cat_counts.items() if v > 0])
    diversity = cats_ordered / max(total_cats, 1)
    return {
        "n_line_items": n_items,
        "veg_ratio": veg / total,
        "beverage_ratio": bev / total,
        "snack_ratio": snacks / total,
        "dessert_affinity": desserts / 1,  # per txn will divide by n visits in aggregate
        "category_diversity": diversity,
        "dessert_count": desserts,
    }


class FeatureEngineer:
    def __init__(self, ref_date=None):
        self.ref_date = ref_date  # for recency; default today

    def build_features(
        self,
        tx_df: pd.DataFrame,
        total_categories_available: int = None,
    ):
        """
        tx_df: columns customerId, date, dayOfWeek, timeSlot, totalAmount, items
        Returns: (scaled DataFrame, scaler, feature_names, customer_ids, raw feature frame before scale)
        """
        if tx_df is None or tx_df.empty:
            return (
                pd.DataFrame(),
                None,
                [],
                np.array([]),
                pd.DataFrame(),
            )
        tcat = total_categories_available or len(ALL_CATEGORIES)
        now = self.ref_date or pd.Timestamp.now(tz=None).normalize()

        tx_df = tx_df.copy()
        tx_df["date"] = pd.to_datetime(tx_df["date"], errors="coerce")
        tx_df = tx_df.dropna(subset=["customerId", "date"])
        tx_df["customerId"] = tx_df["customerId"].astype(str)
        # Derive dayOfWeek and hour
        if "dayOfWeek" not in tx_df.columns or tx_df["dayOfWeek"].isna().all():
            tx_df["dayOfWeek"] = tx_df["date"].dt.day_name().str[:3]
        # Map for older data
        dmap = {
            "Monday": "Mon",
            "Tuesday": "Tue",
            "Wednesday": "Wed",
            "Thursday": "Thu",
            "Friday": "Fri",
            "Saturday": "Sat",
            "Sunday": "Sun",
        }
        tx_df["dayOfWeek"] = (
            tx_df["dayOfWeek"]
            .replace(dmap)
            .fillna(tx_df["date"].dt.day_name().str[:3])
        )
        if "timeSlot" not in tx_df.columns:
            tx_df["timeSlot"] = "Lunch"

        def _row_hour(r):
            d = r["date"]
            if d is not None and not pd.isna(d) and hasattr(d, "hour"):
                return int(d.hour)
            return int(SLOT_HOUR.get(r.get("timeSlot"), 12))

        tx_df["hour"] = tx_df.apply(_row_hour, axis=1)

        groups = []
        for cid, g in tx_df.groupby("customerId"):
            g = g.sort_values("date")
            recency = (now - g["date"].max()).days
            if recency < 0:
                recency = 0.0
            freq = len(g)
            monetary = g["totalAmount"].astype(float).sum()
            aov = g["totalAmount"].astype(float).mean()
            items_per = []
            gaps = []
            prev = None
            for _, r in g.iterrows():
                st = _parse_items_stats(r.get("items"), tcat)
                items_per.append(max(st["n_line_items"], 1))
                if prev is not None:
                    gaps.append((r["date"] - prev).days)
                prev = r["date"]
            avg_items = float(np.mean(items_per)) if items_per else 0.0
            visit_std = float(np.std(gaps)) if len(gaps) > 1 else 0.0
            time_slots = g["timeSlot"].map(SLOT_TO_CODE)
            if time_slots.empty:
                pref_slot = 0
            else:
                pref_slot = int(time_slots.mode().iloc[0]) if not time_slots.empty else 0
            wknd = g["dayOfWeek"].apply(
                lambda x: 1 if str(x) in ("Sat", "Sun") else 0
            ).sum()
            wk = len(g) - wknd
            weekend_ratio = wknd / (wk + 1e-6)
            all_veg = 0.0
            all_bev = 0.0
            all_snack = 0.0
            all_dess = 0.0
            cat_union = set()
            for _, r in g.iterrows():
                s = _parse_items_stats(r.get("items"), tcat)
                all_veg += s["veg_ratio"] * s.get("n_line_items", 1)
                all_bev += s["beverage_ratio"] * 1
                all_snack += s["snack_ratio"] * 1
                all_dess += s["dessert_count"]
            tot_it = sum(
                _parse_items_stats(r.get("items"), tcat).get("n_line_items", 1)
                for _, r in g.iterrows()
            ) or 1.0
            veg_ratio = all_veg / tot_it
            beverage_ratio = all_bev / max(len(g), 1)
            snack_ratio = all_snack / max(len(g), 1)
            dessert_affinity = all_dess / max(len(g), 1)
            uniq_c = set()
            for _, r in g.iterrows():
                for it in r.get("items") or []:
                    c = (it.get("category") or "").strip()
                    if c:
                        uniq_c.add(c)
            category_diversity = len(uniq_c) / max(tcat, 1)
            amts = g["totalAmount"].astype(float)
            cv = float(amts.std() / (amts.mean() + 1e-6)) if len(amts) > 1 else 0.0
            # Time patterns
            morning = (g["timeSlot"] == "Breakfast").sum()
            afternoon = (g["timeSlot"] == "Lunch").sum()
            evening = (g["timeSlot"].isin(["Snacks", "Dinner"])).sum()
            hours = g.apply(lambda row: int(row.get("hour", 12)), axis=1)
            peak_h = int(hours.mode().iloc[0]) if not hours.empty else 12
            row_dict = {
                "customerId": cid,
                "recency": float(recency),
                "frequency": float(freq),
                "monetary": float(monetary),
                "avg_order_value": float(aov),
                "avg_items_per_visit": float(avg_items),
                "visit_consistency_score": float(visit_std),
                "preferred_time_slot": float(pref_slot),
                "weekend_to_weekday_ratio": float(weekend_ratio),
                "category_diversity": float(category_diversity),
                "veg_ratio": float(veg_ratio),
                "beverage_ratio": float(beverage_ratio),
                "snack_ratio": float(snack_ratio),
                "dessert_affinity": float(dessert_affinity),
                "price_sensitivity": float(cv),
                "morning_visits": float(morning),
                "afternoon_visits": float(afternoon),
                "evening_visits": float(evening),
                "peak_hour_preference": float(peak_h),
            }
            groups.append(row_dict)

        raw = pd.DataFrame(groups)
        if raw.empty:
            return pd.DataFrame(), None, [], np.array([]), raw

        feature_cols = [c for c in raw.columns if c != "customerId"]
        X = raw[feature_cols].values.astype(float)
        scaler = StandardScaler()
        Xs = scaler.fit_transform(X)
        scaled = pd.DataFrame(Xs, columns=feature_cols, index=raw.index)
        scaled.insert(0, "customerId", raw["customerId"].values)
        return (
            scaled,
            scaler,
            feature_cols,
            raw["customerId"].values,
            raw,
        )
