"""DBSCAN with k-NN eps knee and noise analysis."""
import numpy as np
import pandas as pd
from kneed import KneeLocator
from sklearn.cluster import DBSCAN
from sklearn.metrics import silhouette_score
from sklearn.neighbors import NearestNeighbors


class DBSCANClustering:
    def find_optimal_eps(self, X, k_nn=5):
        X = np.asarray(X, dtype=float)
        if len(X) < k_nn + 1:
            dsort = [0.1]
            return {
                "optimal_eps": 0.5,
                "distances": dsort,
                "kth_neighbor": k_nn,
            }
        nbrs = NearestNeighbors(n_neighbors=k_nn, metric="euclidean")
        nbrs.fit(X)
        dist, _ = nbrs.kneighbors(X)
        d_k = dist[:, -1]
        dsort = np.sort(d_k)
        if len(dsort) < 2:
            eps = float(np.median(dsort) or 0.1)
        else:
            x_axis = list(range(1, len(dsort) + 1))
            try:
                kn = KneeLocator(
                    x_axis,
                    dsort.tolist(),
                    curve="convex",
                    direction="increasing",
                )
                idx = (int(kn.knee) - 1) if kn.knee is not None else len(dsort) // 2
            except Exception:
                idx = len(dsort) // 2
            idx = max(0, min(idx, len(dsort) - 1))
            eps = float(dsort[idx])
        return {
            "optimal_eps": float(eps),
            "distances": dsort.tolist(),
            "kth_neighbor": k_nn,
        }

    def fit(self, X, eps=None, min_samples=5):
        X = np.asarray(X, dtype=float)
        if eps is None:
            od = self.find_optimal_eps(X, k_nn=max(2, min_samples))
            eps = od["optimal_eps"]
        eps = float(eps) if eps is not None else 0.5
        m = max(1, int(min_samples))
        db = DBSCAN(eps=eps, min_samples=m, metric="euclidean")
        labels = db.fit_predict(X)
        n_noise = int(np.sum(labels == -1))
        core_idx = list(db.core_sample_indices_) if hasattr(db, "core_sample_indices_") else []
        labs = set(labels) - {-1}
        n_clusters = len(labs)
        n = len(X)
        noise_ratio = n_noise / max(n, 1)
        mask = labels >= 0
        if len(np.unique(labels[mask])) > 1 and mask.sum() > 1:
            try:
                sil = float(silhouette_score(X[mask], labels[mask]))
            except Exception:
                sil = 0.0
        else:
            sil = 0.0
        return {
            "labels": labels.tolist(),
            "n_clusters": n_clusters,
            "n_noise_points": n_noise,
            "noise_ratio": float(noise_ratio),
            "silhouette_score": sil,
            "core_sample_indices": core_idx,
            "eps": eps,
        }

    def get_noise_analysis(self, X_original, noise_mask, feature_names):
        noise_mask = np.asarray(noise_mask, dtype=bool)
        if isinstance(X_original, pd.DataFrame):
            fn = [c for c in X_original.columns if c != "customerId"]
            Xo = X_original[fn].values.astype(float)
        else:
            Xo = np.asarray(X_original, dtype=float)
            fn = list(feature_names) if feature_names is not None else [f"f{i}" for i in range(Xo.shape[1])]
        n_row = {n: i for i, n in enumerate(fn)}
        if len(noise_mask) != len(Xo):
            return {
                "n_anomalies": 0,
                "featureDeltas": {},
                "anomalyStats": {"mean": []},
            }
        normal = Xo[~noise_mask]
        noise = Xo[noise_mask]
        if not len(normal):
            gmean = np.zeros(Xo.shape[1])
            gstd = np.ones(Xo.shape[1])
        else:
            gmean = normal.mean(axis=0)
            gstd = (normal.std(axis=0) + 1e-9)
        stats = {
            "n_anomalies": int(np.sum(noise_mask)),
            "featureDeltas": {},
            "anomalyStats": {
                "mean": noise.mean(axis=0).tolist() if len(noise) else [],
            },
        }
        if len(noise) and len(normal):
            for i, n in enumerate(fn):
                stats["featureDeltas"][n] = float(
                    (noise[:, i].mean() - gmean[i]) / gstd[i]
                )
        return stats
