# %%
# CafeteriaIQ - Unsupervised ML End-to-End Template
#
# Run this file as a notebook in VS Code / Jupyter using cell markers (# %%).
# Keep data in: backend/notebooks/data/transactions.csv

# %%
import warnings
warnings.filterwarnings("ignore")

import json
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
try:
    from IPython.display import display
except Exception:
    def display(obj):
        print(obj)

from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score, davies_bouldin_score, calinski_harabasz_score
from sklearn.cluster import KMeans, DBSCAN, AgglomerativeClustering
from sklearn.mixture import GaussianMixture
from sklearn.ensemble import IsolationForest
from sklearn.decomposition import PCA
from sklearn.manifold import TSNE

from mlxtend.frequent_patterns import apriori, association_rules


# %%
# -----------------------
# 1) Paths and config
# -----------------------
BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data" / "transactions.csv"
OUTPUT_DIR = BASE_DIR / "outputs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

RANDOM_STATE = 42
np.random.seed(RANDOM_STATE)


# %%
# -----------------------
# 2) Load and inspect data
# -----------------------
df = pd.read_csv(DATA_PATH)
print("Shape:", df.shape)
display(df.head())
display(df.info())

print("\nNull counts:")
display(df.isna().sum().sort_values(ascending=False).head(15))


# %%
# -----------------------
# 3) Basic cleaning
# -----------------------
# Expected columns (adapt if your CSV differs):
# customer_id, transaction_id, date, day_of_week, time_slot, total_amount, payment_method, items_json

if "date" in df.columns:
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
elif "transaction_ts" in df.columns:
    df["date"] = pd.to_datetime(df["transaction_ts"], errors="coerce")

df = df.drop_duplicates(subset=["transaction_id"] if "transaction_id" in df.columns else None)
df = df.dropna(subset=["customer_id", "total_amount"])
df["total_amount"] = pd.to_numeric(df["total_amount"], errors="coerce").fillna(0)

if "day_of_week" not in df.columns and "date" in df.columns:
    df["day_of_week"] = df["date"].dt.day_name().str[:3]

if "is_weekend" not in df.columns:
    df["is_weekend"] = df["day_of_week"].isin(["Sat", "Sun"]).astype(int)

display(df.head())


# %%
# -----------------------
# 4) Feature engineering at customer level
# -----------------------
max_date = df["date"].max() if "date" in df.columns else pd.Timestamp.today()

customer = df.groupby("customer_id").agg(
    frequency_count=("customer_id", "size"),
    monetary_total=("total_amount", "sum"),
    avg_order_value=("total_amount", "mean"),
    weekend_ratio=("is_weekend", "mean"),
).reset_index()

if "date" in df.columns:
    last_tx = df.groupby("customer_id")["date"].max().reset_index(name="last_date")
    customer = customer.merge(last_tx, on="customer_id", how="left")
    customer["recency_days"] = (max_date - customer["last_date"]).dt.days
else:
    customer["recency_days"] = 0

if "time_slot" in df.columns:
    lunch_ratio = (
        df.assign(is_lunch=(df["time_slot"].astype(str).str.lower() == "lunch").astype(int))
        .groupby("customer_id")["is_lunch"]
        .mean()
        .reset_index(name="lunch_ratio")
    )
    customer = customer.merge(lunch_ratio, on="customer_id", how="left")
else:
    customer["lunch_ratio"] = 0.0

customer = customer.fillna(0)
display(customer.head())


# %%
# -----------------------
# 5) Prepare model matrix
# -----------------------
feature_cols = [
    "recency_days",
    "frequency_count",
    "monetary_total",
    "avg_order_value",
    "weekend_ratio",
    "lunch_ratio",
]

X = customer[feature_cols].copy()
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

print("Model matrix shape:", X_scaled.shape)


# %%
# -----------------------
# 6) Utility functions
# -----------------------
def evaluate_clustering(x_scaled, labels):
    unique_labels = np.unique(labels)
    if len(unique_labels) <= 1:
        return {"silhouette": np.nan, "davies_bouldin": np.nan, "calinski_harabasz": np.nan}
    return {
        "silhouette": float(silhouette_score(x_scaled, labels)),
        "davies_bouldin": float(davies_bouldin_score(x_scaled, labels)),
        "calinski_harabasz": float(calinski_harabasz_score(x_scaled, labels)),
    }


def save_metrics(name, metrics, params):
    row = {"model": name, **metrics, "params": json.dumps(params)}
    metrics_path = OUTPUT_DIR / "model_metrics.csv"
    if metrics_path.exists():
        existing = pd.read_csv(metrics_path)
        existing = pd.concat([existing, pd.DataFrame([row])], ignore_index=True)
        existing.to_csv(metrics_path, index=False)
    else:
        pd.DataFrame([row]).to_csv(metrics_path, index=False)


# %%
# -----------------------
# 7) KMeans
# -----------------------
kmeans = KMeans(n_clusters=5, random_state=RANDOM_STATE, n_init="auto")
kmeans_labels = kmeans.fit_predict(X_scaled)
kmeans_metrics = evaluate_clustering(X_scaled, kmeans_labels)
save_metrics("KMeans", kmeans_metrics, {"n_clusters": 5})

print("KMeans metrics:", kmeans_metrics)


# %%
# -----------------------
# 8) DBSCAN
# -----------------------
dbscan = DBSCAN(eps=0.9, min_samples=8)
dbscan_labels = dbscan.fit_predict(X_scaled)
dbscan_metrics = evaluate_clustering(X_scaled, dbscan_labels)
save_metrics("DBSCAN", dbscan_metrics, {"eps": 0.9, "min_samples": 8})

print("DBSCAN metrics:", dbscan_metrics)
print("DBSCAN noise points:", int((dbscan_labels == -1).sum()))


# %%
# -----------------------
# 9) Gaussian Mixture (GMM)
# -----------------------
gmm = GaussianMixture(n_components=5, random_state=RANDOM_STATE)
gmm_labels = gmm.fit_predict(X_scaled)
gmm_metrics = evaluate_clustering(X_scaled, gmm_labels)
save_metrics("GMM", gmm_metrics, {"n_components": 5})

print("GMM metrics:", gmm_metrics)


# %%
# -----------------------
# 10) Hierarchical clustering
# -----------------------
hier = AgglomerativeClustering(n_clusters=5, linkage="ward")
hier_labels = hier.fit_predict(X_scaled)
hier_metrics = evaluate_clustering(X_scaled, hier_labels)
save_metrics("Hierarchical", hier_metrics, {"n_clusters": 5, "linkage": "ward"})

print("Hierarchical metrics:", hier_metrics)


# %%
# -----------------------
# 11) Compare all models
# -----------------------
metrics_df = pd.read_csv(OUTPUT_DIR / "model_metrics.csv")
display(metrics_df.sort_values("silhouette", ascending=False))


# %%
# -----------------------
# 12) Select best model labels
# -----------------------
# Change this manually after reviewing metrics + business interpretability
best_model_name = "KMeans"
label_map = {
    "KMeans": kmeans_labels,
    "DBSCAN": dbscan_labels,
    "GMM": gmm_labels,
    "Hierarchical": hier_labels,
}
customer["cluster_label"] = label_map[best_model_name]
customer["best_model"] = best_model_name

display(customer.head())


# %%
# -----------------------
# 13) Anomaly detection (Isolation Forest)
# -----------------------
iso = IsolationForest(contamination=0.04, random_state=RANDOM_STATE)
iso.fit(X_scaled)
anomaly_pred = iso.predict(X_scaled)  # -1 anomaly, 1 normal
anomaly_score = iso.decision_function(X_scaled)

customer["anomaly_flag"] = (anomaly_pred == -1).astype(int)
customer["anomaly_score"] = anomaly_score

print("Anomaly count:", int(customer["anomaly_flag"].sum()))


# %%
# -----------------------
# 14) 2D visualization projection
# -----------------------
pca = PCA(n_components=2, random_state=RANDOM_STATE)
xy = pca.fit_transform(X_scaled)
customer["x_2d"] = xy[:, 0]
customer["y_2d"] = xy[:, 1]

plt.figure(figsize=(8, 6))
sns.scatterplot(
    data=customer,
    x="x_2d",
    y="y_2d",
    hue="cluster_label",
    style="anomaly_flag",
    palette="tab10",
    s=60,
)
plt.title(f"Customer clusters ({best_model_name}) + anomalies")
plt.tight_layout()
plt.show()


# %%
# -----------------------
# 15) Association rules (basket analysis)
# -----------------------
# Requires one row per transaction with list-like items.
# If your column name differs, update here.
if "items_json" in df.columns:
    parsed = []
    for _, row in df[["transaction_id", "items_json"]].dropna().iterrows():
        try:
            items = row["items_json"]
            if isinstance(items, str):
                items = json.loads(items)
            names = []
            for it in items:
                if isinstance(it, dict):
                    nm = it.get("itemName") or it.get("name")
                    if nm:
                        names.append(nm)
                elif isinstance(it, str):
                    names.append(it)
            parsed.append({"transaction_id": row["transaction_id"], "items": list(set(names))})
        except Exception:
            continue

    basket_df = pd.DataFrame(parsed)
    if not basket_df.empty:
        exploded = basket_df.explode("items").dropna().reset_index(drop=True)
        basket_matrix = pd.crosstab(exploded["transaction_id"], exploded["items"]).astype(bool)
        freq = apriori(basket_matrix, min_support=0.02, use_colnames=True)
        rules = association_rules(freq, metric="lift", min_threshold=1.0)
        rules = rules.sort_values(["lift", "confidence"], ascending=False)
        rules.to_csv(OUTPUT_DIR / "association_rules.csv", index=False)
        display(rules.head(10))
    else:
        print("No valid basket rows found for association rules.")
else:
    print("Column 'items_json' not found. Skip association rules or adapt this cell.")


# %%
# -----------------------
# 16) Save outputs for dashboard/report
# -----------------------
customer.to_csv(OUTPUT_DIR / "customer_clusters_and_anomalies.csv", index=False)

summary = (
    customer.groupby("cluster_label")
    .agg(
        customers=("customer_id", "count"),
        avg_frequency=("frequency_count", "mean"),
        avg_monetary=("monetary_total", "mean"),
        avg_recency=("recency_days", "mean"),
        anomaly_rate=("anomaly_flag", "mean"),
    )
    .reset_index()
)
summary.to_csv(OUTPUT_DIR / "cluster_summary.csv", index=False)

display(summary)
print("\nSaved files:")
for p in sorted(OUTPUT_DIR.glob("*")):
    print("-", p.name)


# %%
# -----------------------
# 17) Presentation notes
# -----------------------
print(
    "Demo script:\n"
    "1) Data source and preprocessing\n"
    "2) Multiple unsupervised models trained\n"
    "3) Best model selected using metrics + interpretability\n"
    "4) Customer segments and anomalies extracted\n"
    "5) Business recommendations from segments + association rules"
)
