"""Isolation Forest anomaly detection and typed explanations."""
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest


class IsolationForestDetector:
    def fit(self, X, contamination=0.05):
        X = np.asarray(X, dtype=float)
        if len(X) < 2:
            n = len(X)
            return {
                "anomaly_labels": [1] * n,
                "anomaly_scores": [0.0] * n,
                "n_anomalies": 0,
                "anomaly_percentage": 0.0,
            }
        iso = IsolationForest(
            n_estimators=200,
            contamination=float(contamination),
            random_state=42,
            n_jobs=-1,
        )
        iso.fit(X)
        pred = iso.predict(X)
        scores = iso.decision_function(X)
        n_an = int((pred == -1).sum())
        return {
            "anomaly_labels": pred.tolist(),
            "anomaly_scores": scores.tolist(),
            "n_anomalies": n_an,
            "anomaly_percentage": 100.0 * n_an / max(len(X), 1),
        }

    def analyze_anomalies(
        self,
        X_original,
        anomaly_mask,
        feature_names,
        customer_ids=None,
    ):
        """anomaly_mask: where True = anomaly. X_original: DataFrame or matrix."""
        anomaly_mask = np.asarray(anomaly_mask, dtype=bool)
        if isinstance(X_original, pd.DataFrame):
            fn = [c for c in X_original.columns if c != "customerId"]
            M = X_original[fn]
            ids = (
                X_original["customerId"].values
                if "customerId" in X_original.columns
                else None
            )
        else:
            M = np.asarray(X_original, dtype=float)
            fn = list(feature_names) if feature_names else [f"f{i}" for i in range(M.shape[1])]
            ids = None
        if isinstance(M, np.ndarray) is False and hasattr(M, "values"):
            M = M.values
        M = np.asarray(M, dtype=float)
        n = M.shape[0]
        if customer_ids is not None:
            cids = [str(customer_ids[i]) for i in range(n)]
        elif ids is not None:
            cids = [str(ids[i]) for i in range(n)]
        else:
            cids = [f"idx_{i}" for i in range(n)]
        gmean = M.mean(axis=0)
        gstd = (M.std(axis=0) + 1e-9)
        name_to_i = {n: i for i, n in enumerate(fn)}
        out = []
        for i in range(n):
            if not anomaly_mask[i]:
                continue
            ext = {}
            for j, nm in enumerate(fn):
                z = (M[i, j] - gmean[j]) / gstd[j]
                if abs(z) > 2.0:
                    ext[nm] = float(z)
            mrow = {fn[j]: float(M[i, j]) for j in range(len(fn))}
            t = self._classify(mrow, name_to_i)
            out.append(
                {
                    "type": t,
                    "customerId": cids[i],
                    "explanation": ext,
                }
            )
        return out

    def _classify(self, row, name_to_i):
        def g(key):
            return float(row.get(key, 0) or 0) if isinstance(row, dict) else 0.0

        f = g("frequency")
        r = g("recency")
        mon = g("monetary")
        aov = g("avg_items_per_visit")
        div = g("category_diversity")
        ph = g("peak_hour_preference")
        night = ph > 20 or ph < 7
        if mon > 0 and f < 2:
            return "High Spender"
        if aov > 5:
            return "Bulk Buyer"
        if f < 2 and r > 200:
            return "Ghost Customer"
        if night:
            return "Night Owl"
        if div < 0.1 and "category_diversity" in name_to_i:
            return "Category Extremist"
        return "Atypical Pattern"
