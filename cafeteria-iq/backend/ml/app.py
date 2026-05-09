"""
CafeIQ — Flask ML microservice (unsupervised only). Port 5001
"""
import os
import time
from pathlib import Path

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from pymongo import MongoClient

from algorithms.association_rules import AssociationRuleMiner
from algorithms.autoencoder import AutoencoderClustering
from algorithms.dbscan_clustering import DBSCANClustering
from algorithms.feature_engineering import FeatureEngineer
from algorithms.gaussian_mixture import GMMClustering
from algorithms.hierarchical_clustering import HierarchicalClustering
from algorithms.isolation_forest import IsolationForestDetector
from algorithms.kmeans_clustering import KMeansClustering
from algorithms.pca_reduction import PCAReduction
from algorithms.tsne_reduction import TSNEReduction
from algorithms.umap_reduction import UMAPReduction
from sklearn.cluster import KMeans
from utils.evaluation import compare_algorithms, compute_all_metrics
from utils.preprocessing import ensure_numeric_frame, transactions_to_dataframe

# Load backend/.env when running from backend/ml
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
app = Flask(__name__)
CORS(app)

mongo = MongoClient(os.environ.get("MONGODB_URI", "mongodb://localhost:27017/cafeteria_iq"))


def get_collection():
    return mongo.get_default_database()["transactions"]


def _safe_json(obj):
    if obj is None:
        return None
    if isinstance(obj, (np.floating, np.integer)):
        return float(obj) if "float" in str(type(obj)) else int(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, (set, frozenset)):
        return [_safe_json(x) for x in obj]
    if isinstance(obj, (list, tuple)):
        return [_safe_json(x) for x in obj]
    if isinstance(obj, dict):
        return {k: _safe_json(v) for k, v in obj.items()}
    if isinstance(obj, (float, int, str, bool)) or obj is None:
        return obj
    try:
        return float(obj)
    except (TypeError, ValueError):
        return str(obj)


# Cache: last feature build from build_features_from_db
_FEATURE_CACHE = {}


def build_features_from_db():
    col = get_collection()
    txs = list(col.find({}))
    txf = transactions_to_dataframe(txs)
    fe = FeatureEngineer()
    scaled, sc, fn, cids, raw = fe.build_features(txf)
    if raw is None or len(raw) < 1:
        return {"error": "Not enough data"}
    X = scaled[[c for c in scaled.columns if c != "customerId"]].values
    X = ensure_numeric_frame(pd.DataFrame(X)).values
    global _FEATURE_CACHE
    _FEATURE_CACHE = {
        "scaled": scaled,
        "cids": cids,
        "raw": raw,
        "txf": txf,
        "feature_names": fn,
        "X": X,
    }
    stats = {
        c: {"mean": float(raw[c].mean()), "std": float(raw[c].std())}
        for c in fn
        if c in raw.columns
    }
    return {
        "feature_matrix": X.tolist(),
        "feature_names": fn,
        "n_customers": int(len(X)),
        "scaler_fitted": True,
        "feature_stats": stats,
        "customerIds": cids.tolist() if hasattr(cids, "tolist") else list(cids),
    }


def matrix_X_from_cache():
    c = _FEATURE_CACHE
    if c and c.get("X") is not None:
        return c["X"], c.get("raw"), c.get("feature_names", []), c.get("cids", [])
    return None, None, [], []


def projection_labels(X, n_hint=5):
    n = len(X) if X is not None else 0
    if n < 2:
        return [0] * n
    k = int(min(max(2, n_hint), max(2, n - 1)))
    return KMeans(n_clusters=k, random_state=42, n_init=10).fit_predict(X).tolist()


@app.route("/ml/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "ok",
            "algorithms": [
                "KMeans",
                "DBSCAN",
                "GMM",
                "Hierarchical",
                "Autoencoder",
                "IsolationForest",
                "AssociationRules",
                "PCA",
                "tSNE",
                "UMAP",
            ],
        }
    )


@app.route("/ml/features", methods=["POST"])
def route_features():
    d = build_features_from_db()
    if d.get("error"):
        return jsonify(d), 400
    return jsonify(d)


@app.route("/ml/kmeans", methods=["POST"])
def route_kmeans():
    body = request.get_json() or {}
    t0 = time.time()
    build_features_from_db()
    X, raw, fn, cids = matrix_X_from_cache()
    if X is None or len(X) < 2:
        return jsonify({"error": "insufficient data"}), 400
    kmc = KMeansClustering()
    n_clusters = int(body.get("n_clusters", 4))
    auto = body.get("auto_k", True)
    if isinstance(auto, str):
        auto = auto.lower() in ("1", "true", "yes")
    elbow = {}
    if auto:
        elbow = kmc.find_optimal_k(X, k_range=(2, 12))
        n_clusters = int(elbow.get("elbow_k") or n_clusters)
    fit = kmc.fit(X, n_clusters=n_clusters)
    labels = np.array(fit["labels"], dtype=int)
    profiles = kmc.get_cluster_profiles(raw, labels, fn) if raw is not None else []
    m = compute_all_metrics(X, labels, kmeans_inertia=fit.get("inertia"))
    return jsonify(
        _safe_json(
            {
                "labels": fit["labels"],
                "profiles": profiles,
                "metrics": m,
                "elbow_data": elbow,
                "silhouette_data": {
                    "k": elbow.get("k_values", []),
                    "scores": elbow.get("silhouette", []),
                },
                "n_clusters": n_clusters,
                "runDuration": time.time() - t0,
            }
        )
    )


@app.route("/ml/dbscan", methods=["POST"])
def route_dbscan():
    build_features_from_db()
    X, raw, fn, cids = matrix_X_from_cache()
    if X is None or len(X) < 3:
        return jsonify({"error": "insufficient data"}), 400
    body = request.get_json() or {}
    dbc = DBSCANClustering()
    eps = body.get("eps", None)
    if eps in ("", "null", None):
        eps = None
    if eps is not None:
        eps = float(eps)
    ms = int(body.get("min_samples", 5))
    out = dbc.fit(X, eps=eps, min_samples=ms)
    labels = np.array(out["labels"], dtype=int)
    noise = labels == -1
    nanalysis = dbc.get_noise_analysis(raw, noise, fn) if raw is not None else {}
    m = compute_all_metrics(
        X, np.where(noise, -1, out["labels"]), kmeans_inertia=None
    )
    return jsonify(
        _safe_json(
            {
                "eps": out.get("eps"),
                "n_clusters": out.get("n_clusters"),
                "n_noise_points": out.get("n_noise_points"),
                "noise_ratio": out.get("noise_ratio"),
                "core_sample_indices": out.get("core_sample_indices", []),
                "labels": out["labels"],
                "silhouette_score": out.get("silhouette_score"),
                "noise_analysis": nanalysis,
                "metrics": m,
            }
        )
    )


@app.route("/ml/hierarchical", methods=["POST"])
def route_hier():
    build_features_from_db()
    X, raw, fn, cids = matrix_X_from_cache()
    if X is None or len(X) < 2:
        return jsonify({"error": "insufficient data"}), 400
    body = request.get_json() or {}
    n_clusters = int(body.get("n_clusters", 4))
    link = body.get("linkage", "ward")
    h = HierarchicalClustering()
    try:
        dend = h.compute_dendrogram(X, method=link)
    except Exception:
        dend = {"linkage_matrix": [], "dendrogram_data": {}, "suggested_cut_levels": []}
    f = h.fit(X, n_clusters=n_clusters, linkage_method=link)
    labels = np.array(f["labels"], dtype=int)
    m = compute_all_metrics(X, labels)
    tree = h.get_cluster_hierarchy(X, labels)
    return jsonify(
        _safe_json(
            {**f, "dendrogram_data": dend, "metrics": m, "hierarchy": tree}
        )
    )


@app.route("/ml/gmm", methods=["POST"])
def route_gmm():
    build_features_from_db()
    X, raw, fn, cids = matrix_X_from_cache()
    if X is None or len(X) < 2:
        return jsonify({"error": "insufficient data"}), 400
    body = request.get_json() or {}
    n = int(body.get("n_components", 4))
    cov = body.get("covariance_type", "full")
    g = GMMClustering()
    curves = g.find_optimal_components(X, n_range=(2, 8))
    fit = g.fit(X, n_components=n, covariance_type=cov)
    lab = np.array(fit["labels"], dtype=int)
    prob = np.array(fit.get("probabilities", []), dtype=float)
    unc = g.get_uncertainty_customers(
        prob, float(body.get("uncertainty", 0.6) or 0.6)
    )
    m = compute_all_metrics(X, lab)
    return jsonify(
        _safe_json(
            {
                "labels": fit.get("labels"),
                "soft_probabilities": fit.get("probabilities"),
                "uncertainty_customers": unc,
                "aic": fit.get("aic"),
                "bic": fit.get("bic"),
                "log_likelihood": fit.get("log_likelihood"),
                "aic_bic_data": curves,
                "metrics": m,
            }
        )
    )


@app.route("/ml/autoencoder", methods=["POST"])
def route_auto():
    build_features_from_db()
    X, raw, fn, cids = matrix_X_from_cache()
    if X is None or len(X) < 5:
        return jsonify({"error": "need more samples for autoencoder"}), 400
    body = request.get_json() or {}
    ec = int(body.get("encoding_dim", 8) or 8)
    n_clusters = int(body.get("n_clusters", 4) or 4)
    epochs = int(body.get("epochs", 100) or 100)
    th = int(body.get("anomaly_threshold", 95) or 95)
    ae = AutoencoderClustering()
    ae.build_autoencoder(X.shape[1], encoding_dim=ec)
    tr = ae.train(
        X, epochs=epochs, batch_size=int(body.get("batch_size", 32) or 32)
    )
    an = ae.detect_anomalies(X, threshold_percentile=th)
    cl = ae.cluster_latent_space(X, n_clusters=n_clusters)
    lab = np.array(cl.get("labels", []), dtype=int)
    m = compute_all_metrics(X, lab) if len(lab) == len(X) else {}
    return jsonify(
        _safe_json(
            {
                "labels": cl.get("labels"),
                "training_history": tr.get("history"),
                "reconstruction_errors": tr.get("reconstruction_errors"),
                "anomaly_scores": an.get("anomaly_scores"),
                "anomaly_flags": an.get("anomaly_flags"),
                "threshold_value": an.get("threshold_value"),
                "latent_2d": cl.get("latent_2d"),
                "silhouette_score": cl.get("silhouette_score"),
                "metrics": m,
            }
        )
    )


@app.route("/ml/isolation-forest", methods=["POST"])
def route_isolation():
    build_features_from_db()
    X, raw, fn, cids = matrix_X_from_cache()
    if X is None or len(X) < 2:
        return jsonify({"error": "insufficient data"}), 400
    body = request.get_json() or {}
    cont = float(body.get("contamination", 0.05) or 0.05)
    iso = IsolationForestDetector()
    r = iso.fit(X, contamination=cont)
    pred = np.array(r.get("anomaly_labels"), dtype=int)
    anom = pred == -1
    cids_l = cids if cids is not None else np.arange(len(X))
    if hasattr(cids_l, "tolist"):
        cids_l = cids_l.tolist()
    analysis = (
        iso.analyze_anomalies(raw, anom, fn, customer_ids=cids_l)
        if raw is not None
        else []
    )
    return jsonify(
        _safe_json(
            {
                "anomaly_labels": r.get("anomaly_labels"),
                "anomaly_scores": r.get("anomaly_scores"),
                "n_anomalies": r.get("n_anomalies"),
                "anomaly_percentage": r.get("anomaly_percentage"),
                "anomaly_analysis": analysis,
            }
        )
    )


@app.route("/ml/association-rules", methods=["POST"])
def route_assoc():
    body = request.get_json() or {}
    min_sup = float(body.get("min_support", 0.05) or 0.05)
    min_conf = float(body.get("min_confidence", 0.3) or 0.3)
    min_lift = float(body.get("min_lift", 1.2) or 1.2)
    cluster_id = body.get("cluster_id", None) or body.get("clusterId", None)
    col = get_collection()
    txs = list(col.find({}))
    txf = transactions_to_dataframe(txs)
    if txf.empty:
        return jsonify({"error": "no transactions"}), 400
    miner = AssociationRuleMiner()
    if cluster_id is not None and "customerId" in txf.columns:
        build_features_from_db()
        _, raw, fn, cids = matrix_X_from_cache()
        if raw is not None and _FEATURE_CACHE.get("X") is not None:
            from sklearn.cluster import KMeans

            X = _FEATURE_CACHE["X"]
            n = int(min(4, max(2, X.shape[0] // 2)))
            kml = KMeans(n_clusters=n, random_state=42).fit_predict(X)
            cid_arr = cids if hasattr(cids, "tolist") else list(cids)
            cmap = {str(cid_arr[i]): int(kml[i]) for i in range(len(kml))}
            txf = txf[txf["customerId"].astype(str).map(lambda c: cmap.get(str(c), -1) == int(cluster_id))]
    b = miner.build_basket_matrix(txf)
    fi = miner.mine_frequent_itemsets(b, min_support=min_sup)
    rules = miner.generate_rules(
        fi, min_confidence=min_conf, min_lift=min_lift, top=50
    )
    bundles = miner.get_menu_bundles(rules)
    return jsonify(
        {
            "frequent_itemsets": fi.to_dict("records") if len(fi) else [],
            "rules": rules,
            "bundle_suggestions": bundles,
        }
    )


@app.route("/ml/reduce/pca", methods=["POST"])
def route_pca():
    build_features_from_db()
    X, raw, fn, cids = matrix_X_from_cache()
    if X is None or len(X) < 2:
        return jsonify({"error": "insufficient data"}), 400
    body = request.get_json() or {}
    pca = PCAReduction()
    full = pca.fit_full(X)
    d2 = pca.transform_2d(X)
    d3 = pca.transform_3d(X)
    labels = projection_labels(X)
    bi = pca.biplot_data(X, feature_names=fn) if body.get("with_biplot", True) else {}
    return jsonify(
        _safe_json(
            {
                "coordinates_2d": d2.get("coordinates_2d"),
                "coordinates_3d": d3.get("coordinates_3d"),
                "labels": labels,
                "customer_ids": cids.tolist() if hasattr(cids, "tolist") else list(cids),
                "explained_variance": d2.get("explained_variance"),
                "scree_data": {
                    "explained_variance_ratio": full.get("explained_variance_ratio"),
                    "cumulative": full.get("cumulative_explained_variance"),
                },
                "n_components_95": full.get("n_components_95"),
                "component_loadings": full.get("component_loadings"),
                "biplot_data": bi,
            }
        )
    )


@app.route("/ml/reduce/tsne", methods=["POST"])
def route_tsne():
    build_features_from_db()
    X, raw, fn, cids = matrix_X_from_cache()
    if X is None or len(X) < 2:
        return jsonify({"error": "insufficient data"}), 400
    body = request.get_json() or {}
    perp = int(body.get("perplexity", 30) or 30)
    tsn = TSNEReduction()
    r = tsn.transform(
        X,
        perplexity=perp,
        n_iter=int(body.get("n_iter", 1000) or 1000),
        learning_rate=body.get("learning_rate", "auto"),
    )
    return jsonify(
        _safe_json(
            {
                **r,
                "labels": projection_labels(X),
                "customer_ids": cids.tolist() if hasattr(cids, "tolist") else list(cids),
            }
        )
    )


@app.route("/ml/reduce/umap", methods=["POST"])
def route_umap():
    build_features_from_db()
    X, raw, fn, cids = matrix_X_from_cache()
    if X is None or len(X) < 2:
        return jsonify({"error": "insufficient data"}), 400
    body = request.get_json() or {}
    nn = int(body.get("n_neighbors", 15) or 15)
    md = float(body.get("min_dist", 0.1) or 0.1)
    u = UMAPReduction()
    d2 = u.transform_2d(X, n_neighbors=nn, min_dist=md)
    d3 = u.transform_3d(X, n_neighbors=nn, min_dist=md)
    return jsonify(
        _safe_json(
            {
                **d2,
                **d3,
                "labels": projection_labels(X),
                "customer_ids": cids.tolist() if hasattr(cids, "tolist") else list(cids),
            }
        )
    )


@app.route("/ml/compare-algorithms", methods=["POST"])
def route_compare():
    build_features_from_db()
    X, raw, fn, cids = matrix_X_from_cache()
    if X is None or len(X) < 3:
        return jsonify({"error": "insufficient data"}), 400
    results = {}
    kmc = KMeansClustering()
    ek = kmc.find_optimal_k(X, k_range=(2, min(10, max(2, len(X) - 1))))
    nk = int(ek.get("elbow_k") or 4)
    km = kmc.fit(X, n_clusters=nk)
    lkm = np.array(km["labels"], dtype=int)
    results["KMeans"] = compute_all_metrics(X, lkm, kmeans_inertia=km.get("inertia"))
    dbs = DBSCANClustering()
    db = dbs.fit(X, eps=None, min_samples=5)
    ldb = np.array(db["labels"], dtype=int)
    results["DBSCAN"] = compute_all_metrics(
        X, ldb, kmeans_inertia=None
    )
    g = GMMClustering()
    gf = g.fit(X, n_components=nk, covariance_type="full")
    lg = np.array(gf["labels"], dtype=int)
    results["GMM"] = compute_all_metrics(X, lg, kmeans_inertia=None)
    h = HierarchicalClustering()
    hf = h.fit(X, n_clusters=nk, linkage_method="ward")
    lh = np.array(hf["labels"], dtype=int)
    results["Hierarchical"] = compute_all_metrics(X, lh, kmeans_inertia=None)
    out = compare_algorithms(results)
    return jsonify(_safe_json({**out, "per_algorithm": results}))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=os.environ.get("FLASK_DEBUG") == "1")
