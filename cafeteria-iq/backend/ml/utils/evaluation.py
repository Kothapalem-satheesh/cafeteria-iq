"""Internal clustering validation metrics and algorithm comparison."""
import numpy as np
from sklearn.metrics import (
    calinski_harabasz_score,
    davies_bouldin_score,
    silhouette_samples,
    silhouette_score,
)
from sklearn.metrics.pairwise import euclidean_distances

try:
    from sklearn.cluster import KMeans
except Exception:
    KMeans = None


def dunn_index(X, labels, metric="euclidean"):
    """Dunn: min inter-cluster / max intra-cluster distance."""
    X = np.asarray(X)
    labels = np.asarray(labels)
    if len(X) < 2:
        return 0.0
    unique = np.unique(labels[labels >= 0])
    if len(unique) < 2:
        return 0.0
    clusters = {k: X[labels == k] for k in unique}
    # max intra
    max_intra = 0.0
    for k, pts in clusters.items():
        if len(pts) < 2:
            d = 0.0
        else:
            d = euclidean_distances(pts)
            d = np.max(d) if d.size else 0.0
        max_intra = max(max_intra, d)
    if max_intra < 1e-12:
        max_intra = 1e-12
    # min inter (between cluster centroids)
    cids = list(clusters.keys())
    min_inter = float("inf")
    for i in range(len(cids)):
        for j in range(i + 1, len(cids)):
            a, b = clusters[cids[i]], clusters[cids[j]]
            d = euclidean_distances(a, b)
            min_inter = min(min_inter, float(np.min(d)) if d.size else 0.0)
    if not np.isfinite(min_inter) or min_inter == float("inf"):
        return 0.0
    return float(min_inter / max_intra)


def compute_all_metrics(X, labels, kmeans_inertia=None):
    """Compute clustering quality metrics. labels may include -1 for noise."""
    X = np.asarray(X, dtype=float)
    labels = np.asarray(labels, dtype=int)
    n = len(X)
    if n < 2:
        return {
            "silhouette_score": 0.0,
            "silhouette_per_cluster": [],
            "davies_bouldin_score": 0.0,
            "calinski_harabasz_score": 0.0,
            "dunn_index": 0.0,
            "inertia": kmeans_inertia,
            "cluster_sizes": {},
            "cluster_density": {},
            "separation": 0.0,
        }
    mask = labels >= 0
    if mask.sum() < 2 or len(np.unique(labels[mask])) < 2:
        sil = 0.0
        sil_s = np.array([])
    else:
        try:
            sil = float(silhouette_score(X[mask], labels[mask], metric="euclidean"))
            sil_s = silhouette_samples(X[mask], labels[mask], metric="euclidean")
        except Exception:
            sil = 0.0
            sil_s = np.array([])
    sil_per = []
    if len(sil_s) and mask.any():
        lm = labels[mask]
        for k in np.unique(lm):
            part = sil_s[lm == k]
            sil_per.append(float(np.mean(part)) if len(part) else 0.0)
    if mask.sum() and len(np.unique(labels[mask])) >= 2:
        try:
            db = float(davies_bouldin_score(X[mask], labels[mask]))
            ch = float(calinski_harabasz_score(X[mask], labels[mask]))
        except Exception:
            db, ch = 0.0, 0.0
        dunn = dunn_index(X[mask], labels[mask]) if len(np.unique(labels[mask])) > 1 else 0.0
    else:
        db, ch, dunn = 0.0, 0.0, 0.0
    sizes = {int(k): int(np.sum(labels == k)) for k in np.unique(labels)}
    centroids = {}
    for k in np.unique(labels[mask]):
        pts = X[labels == k]
        centroids[k] = np.mean(pts, axis=0)
    cluster_density = {}
    for k in centroids:
        pts = X[labels == k]
        if len(pts) < 1:
            cluster_density[int(k)] = 0.0
        else:
            d = euclidean_distances(pts, [centroids[k]])
            cluster_density[int(k)] = float(np.mean(d))
    keys = [k for k in centroids if k >= 0]
    sep = 0.0
    if len(keys) > 1:
        cc = [centroids[k] for k in keys]
        cc = np.array(cc)
        d = euclidean_distances(cc)
        np.fill_diagonal(d, np.nan)
        sep = float(np.nanmean(d))
    return {
        "silhouette_score": sil,
        "silhouette_per_cluster": [float(x) for x in sil_per],
        "davies_bouldin_score": db,
        "calinski_harabasz_score": ch,
        "dunn_index": dunn,
        "inertia": kmeans_inertia,
        "cluster_sizes": sizes,
        "cluster_density": cluster_density,
        "separation": sep,
    }


def compare_algorithms(results_dict):
    """
    results_dict: { 'KMeans': metrics_dict, ... }
    Returns comparison rows and recommended algorithm with reason.
    """
    rows = []
    scores = {}
    for name, m in results_dict.items():
        if m is None:
            continue
        s = 0.0
        r = []
        sil = m.get("silhouette_score") or 0
        db = m.get("davies_bouldin_score")
        if db is None:
            db = 1.0
        ch = m.get("calinski_harabasz_score") or 0
        if sil > 0.5:
            s += 3.0
            r.append("strong silhouette")
        elif sil > 0.3:
            s += 1.0
        if db < 0.5:
            s += 2.0
            r.append("excellent DB index")
        elif db < 1.0:
            s += 0.5
        if ch > 200:
            s += 1.0
            r.append("high Calinski–Harabasz")
        rows.append(
            {
                "algorithm": name,
                "silhouette_score": m.get("silhouette_score"),
                "davies_bouldin_score": m.get("davies_bouldin_score"),
                "calinski_harabasz_score": m.get("calinski_harabasz_score"),
                "dunn_index": m.get("dunn_index"),
                "inertia": m.get("inertia"),
            }
        )
        scores[name] = (s, r)
    if not scores:
        return {
            "comparison": [],
            "recommended_algorithm": None,
            "reason": "No valid metrics.",
        }
    best = max(scores, key=lambda k: scores[k][0])
    reason = f"Highest aggregate score. " + " ".join(scores[best][1] or ["balanced metrics."])
    return {
        "comparison": rows,
        "recommended_algorithm": best,
        "reason": reason,
    }
