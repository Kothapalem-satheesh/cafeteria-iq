const axios = require("axios");

const base = (process.env.ML_SERVICE_URL || "http://localhost:5001").replace(/\/$/, "");

const client = axios.create({
  baseURL: base,
  timeout: 1200000,
  headers: { "Content-Type": "application/json" },
});

function wrap(path, body) {
  return client.post(path, body || {}).then((r) => r.data);
}

module.exports = {
  health: () => client.get("/ml/health").then((r) => r.data),
  features: (body) => wrap("/ml/features", body),
  kmeans: (body) => wrap("/ml/kmeans", body),
  dbscan: (body) => wrap("/ml/dbscan", body),
  hierarchical: (body) => wrap("/ml/hierarchical", body),
  gmm: (body) => wrap("/ml/gmm", body),
  autoencoder: (body) => wrap("/ml/autoencoder", body),
  isolationForest: (body) => wrap("/ml/isolation-forest", body),
  associationRules: (body) => wrap("/ml/association-rules", body),
  pca: (body) => wrap("/ml/reduce/pca", body),
  tsne: (body) => wrap("/ml/reduce/tsne", body),
  umap: (body) => wrap("/ml/reduce/umap", body),
  compareAlgorithms: () => client.post("/ml/compare-algorithms", {}).then((r) => r.data),
};
