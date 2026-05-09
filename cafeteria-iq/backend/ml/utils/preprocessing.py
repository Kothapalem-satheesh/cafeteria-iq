"""Data preprocessing helpers for ML pipeline."""
import pandas as pd
import numpy as np


def transactions_to_dataframe(transactions: list) -> pd.DataFrame:
    """Convert Mongo/JSON transaction list to a flat DataFrame for feature engineering."""
    if not transactions:
        return pd.DataFrame()
    rows = []
    for t in transactions:
        if isinstance(t.get("date"), str):
            try:
                d = pd.to_datetime(t["date"])
            except Exception:
                d = pd.NaT
        else:
            d = t.get("date")
        if hasattr(d, "to_pydatetime"):
            d = pd.Timestamp(d)
        items = t.get("items") or []
        r = {
            "transactionId": t.get("transactionId"),
            "customerId": str(t.get("customerId", "")),
            "date": d,
            "dayOfWeek": t.get("dayOfWeek"),
            "timeSlot": t.get("timeSlot"),
            "totalAmount": float(t.get("totalAmount") or 0),
            "items": items,
        }
        rows.append(r)
    return pd.DataFrame(rows)


def ensure_numeric_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Replace inf/nan in numeric columns."""
    d = df.copy()
    for c in d.select_dtypes(include=[np.number]).columns:
        d[c] = d[c].replace([np.inf, -np.inf], np.nan).fillna(0)
    return d
