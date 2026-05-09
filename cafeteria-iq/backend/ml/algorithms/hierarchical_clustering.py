"""Hierarchical (agglomerative) clustering and dendrogram data."""
import numpy as np
from scipy.cluster.hierarchy import cophenet, dendrogram, fcluster, linkage
from scipy.spatial.distance import pdist
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics import silhouette_score


class HierarchicalClustering:
    def compute_dendrogram(self, X, method="ward"):
        X = np.asarray(X, dtype=float)
        if len(X) < 2:
            return {
                "linkage_matrix": [],
                "dendrogram_data": {"leaves": [], "icoord": [], "dcoord": []},
                "suggested_cut_levels": [],
            }
        if method == "ward":
            Z = linkage(X, method="ward", metric="euclidean")
        else:
            Z = linkage(X, method=method, metric="euclidean")
        d = dendrogram(Z, no_plot=True, get_leaves=True)
        # Suggested cuts: large gaps in merge heights
        h = Z[:, 2]
        if len(h) > 1:
            gaps = np.diff(h)
            top = int(np.argmax(gaps)) if len(gaps) else 0
            cut = (float(h[top]) + float(h[top + 1])) / 2 if top + 1 < len(h) else float(h[-1])
            suggested = [float(np.percentile(h, 25)), float(np.percentile(h, 75)), cut]
        else:
            suggested = [float(h[0])] if len(h) else [0.0]
        return {
            "linkage_matrix": Z.tolist(),
            "dendrogram_data": {
                "leaves": d.get("leaves", list(range(len(X)))).tolist() if isinstance(d.get("leaves", []), (list, np.ndarray)) else list(range(len(X))),
                "icoord": d.get("icoord", []),
                "dcoord": d.get("dcoord", []),
                "ivl": d.get("ivl", [str(i) for i in range(len(X))]),
            },
            "suggested_cut_levels": suggested,
        }

    def fit(self, X, n_clusters=4, linkage_method="ward"):
        X = np.asarray(X, dtype=float)
        best = {"labels": None, "linkage": linkage_method, "score": -1.0, "coph": 0.0}
        methods = [linkage_method, "complete", "average", "single"]
        Z_for_coph = None
        for m in methods:
            try:
                if m == "ward":
                    cl = AgglomerativeClustering(
                        n_clusters=n_clusters, linkage="ward", metric="euclidean"
                    )
                else:
                    cl = AgglomerativeClustering(
                        n_clusters=n_clusters, linkage=m, metric="euclidean"
                    )
                labels = cl.fit_predict(X)
                if len(np.unique(labels)) < 2:
                    continue
                sc = float(silhouette_score(X, labels, metric="euclidean"))
                if sc > best["score"]:
                    best["labels"] = labels
                    best["linkage"] = m
                    best["score"] = sc
            except Exception:
                continue
        if best["labels"] is None:
            cl = AgglomerativeClustering(
                n_clusters=min(n_clusters, max(1, len(X) - 1)) or 1,
                linkage="ward",
                metric="euclidean",
            )
            best["labels"] = cl.fit_predict(X)
            best["linkage"] = "ward"
        try:
            Z = linkage(X, method=str(best["linkage"]), metric="euclidean")
            d_matrix = pdist(X, metric="euclidean")
            coph, _ = cophenet(Z, d_matrix)
        except Exception:
            coph = 0.0
        return {
            "labels": best["labels"].tolist(),
            "best_linkage_method": str(best["linkage"]),
            "cophenetic_correlation_coefficient": float(coph) if coph is not None else 0.0,
            "silhouette_score": float(best["score"]),
        }

    def get_cluster_hierarchy(self, X, labels):
        """Simplified tree: root -> cluster leaf nodes."""
        X = np.asarray(X, dtype=float)
        labels = np.asarray(labels, dtype=int)
        uniq = [int(c) for c in np.unique(labels)]
        return {
            "name": "root",
            "children": [
                {
                    "name": f"Cluster {c}",
                    "id": c,
                    "size": int(np.sum(labels == c)),
                }
                for c in uniq
            ],
        }
