"""K-Means with elbow, metrics, and persona-based cluster profiles."""
import numpy as np
import pandas as pd
from kneed import KneeLocator
from sklearn.cluster import KMeans
from sklearn.metrics import (
    calinski_harabasz_score,
    davies_bouldin_score,
    silhouette_score,
)

def _z_scores(global_means, cluster_means, global_std, names):
    out = []
    for i, n in enumerate(names):
        s = max(global_std.iloc[i] if hasattr(global_std, "iloc") else float(global_std[i]) or 1.0, 1e-6)
        m = float(global_means[i])
        c = float(cluster_means[i])
        out.append((n, (c - m) / s))
    return sorted(out, key=lambda x: -abs(x[1]))


class KMeansClustering:
    def find_optimal_k(self, X, k_range=(2, 12)):
        X = np.asarray(X, dtype=float)
        low, high = k_range
        r = {
            "k_values": [],
            "inertia": [],
            "silhouette": [],
            "davies_bouldin": [],
            "calinski_harabasz": [],
            "elbow_k": None,
        }
        wcss = []
        for k in range(low, min(high + 1, max(len(X) - 1, low + 1))):
            if k >= len(X):
                break
            km = KMeans(
                n_clusters=k,
                init="k-means++",
                n_init=10,
                random_state=42,
            )
            km.fit(X)
            wcss.append(km.inertia_)
            r["k_values"].append(k)
            try:
                r["silhouette"].append(float(silhouette_score(X, km.labels_)))
            except Exception:
                r["silhouette"].append(0.0)
            try:
                r["davies_bouldin"].append(float(davies_bouldin_score(X, km.labels_)))
            except Exception:
                r["davies_bouldin"].append(0.0)
            try:
                r["calinski_harabasz"].append(
                    float(calinski_harabasz_score(X, km.labels_))
                )
            except Exception:
                r["calinski_harabasz"].append(0.0)
        r["inertia"] = wcss
        if len(r["k_values"]) >= 2:
            try:
                kn = KneeLocator(
                    r["k_values"],
                    wcss,
                    curve="convex",
                    direction="decreasing",
                )
                r["elbow_k"] = int(kn.knee) if kn.knee is not None else r["k_values"][
                    int(np.argmax(r["silhouette"]))
                ]
            except Exception:
                r["elbow_k"] = r["k_values"][int(np.argmax(r["silhouette"] or [0]))]
        else:
            r["elbow_k"] = r["k_values"][0] if r["k_values"] else low
        return r

    def fit(self, X, n_clusters=4):
        X = np.asarray(X, dtype=float)
        km = KMeans(
            n_clusters=n_clusters,
            init="k-means++",
            n_init=10,
            random_state=42,
        )
        km.fit(X)
        try:
            sil = float(silhouette_score(X, km.labels_))
        except Exception:
            sil = 0.0
        return {
            "labels": km.labels_.tolist(),
            "cluster_centers": km.cluster_centers_.tolist(),
            "inertia": float(km.inertia_),
            "silhouette_score": sil,
        }

    def get_cluster_profiles(self, X_original, labels, feature_names):
        """X_original: DataFrame of raw (unscaled) features + customerId optional."""
        labels = np.asarray(labels, dtype=int)
        if isinstance(X_original, pd.DataFrame):
            fn = [c for c in X_original.columns if c != "customerId"]
            M = X_original[fn].values.astype(float)
        else:
            M = np.asarray(X_original, dtype=float)
            fn = list(feature_names) if feature_names is not None else [f"f{i}" for i in range(M.shape[1])]
        n_samples = len(M)
        gmean = (
            X_original[fn].mean()
            if isinstance(X_original, pd.DataFrame)
            else pd.DataFrame(M, columns=fn).mean()
        )
        gstd = (
            X_original[fn].std().replace(0, 1.0)
            if isinstance(X_original, pd.DataFrame)
            else pd.DataFrame(M, columns=fn).std().replace(0, 1.0)
        )
        idx_of = {n: i for i, n in enumerate(fn)}
        profiles = []
        for c in np.unique(labels):
            mask = labels == c
            sub = M[mask]
            means = sub.mean(axis=0)
            size = int(mask.sum())
            pct = 100.0 * size / max(n_samples, 1)
            top3 = _z_scores(gmean.values, means, gstd, fn)[:3]
            dist = []
            for n, z in top3:
                if z > 0.5:
                    dist.append(
                        {
                            "feature": n,
                            "zScore": float(z),
                            "interpretation": f"High {n}",
                        }
                    )
                elif z < -0.5:
                    dist.append(
                        {
                            "feature": n,
                            "zScore": float(z),
                            "interpretation": f"Low {n}",
                        }
                    )
                else:
                    dist.append(
                        {
                            "feature": n,
                            "zScore": float(z),
                            "interpretation": n,
                        }
                    )
            name = self._name_persona(means, fn, idx_of)
            profiles.append(
                {
                    "clusterId": int(c),
                    "clusterName": name,
                    "size": size,
                    "percentOfTotal": float(round(pct, 2)),
                    "featureMeans": {fn[i]: float(means[i]) for i in range(len(fn))},
                    "distinguishingFeatures": dist[:3],
                }
            )
        return profiles

    def _name_persona(self, means, feature_names, idx_of):
        def v(name, default=0.0):
            i = idx_of.get(name)
            if i is None:
                return default
            return float(means[i])

        all_means = [float(vn) for vn in means]
        med = float(np.median(all_means)) if all_means else 0.0
        monetary = v("monetary")
        frequency = v("frequency")
        div = v("category_diversity")
        veg = v("veg_ratio")
        if div > 0.35:
            return "Food Explorers"
        if veg > 0.45:
            return "Wellness Champions"
        if monetary > med and frequency > med:
            return "VIP Power Users"
        if monetary <= med and frequency > med:
            return "Budget Regulars"
        if monetary > med and frequency <= med:
            return "Weekend Splurgers"
        return "Casual Visitors"
