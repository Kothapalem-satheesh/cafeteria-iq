const mongoose = require("mongoose");

const clusterBlockSchema = new mongoose.Schema(
  {
    clusterId: Number,
    clusterName: String,
    size: Number,
    percentage: Number,
    avgSpend: Number,
    avgFrequency: Number,
    avgRecency: Number,
    topItems: [String],
    topCategories: [String],
    description: String,
    color: String,
    distinguishingFeatures: [
      {
        feature: String,
        zScore: Number,
        interpretation: String,
      },
    ],
  },
  { _id: false }
);

const clusterResultSchema = new mongoose.Schema(
  {
    runId: { type: String, required: true, unique: true, index: true },
    algorithm: {
      type: String,
      enum: ["KMeans", "DBSCAN", "GMM", "Hierarchical", "Autoencoder"],
    },
    parameters: { type: Object, default: {} },
    nClusters: { type: Number, default: 0 },
    metrics: {
      silhouette_score: Number,
      davies_bouldin_score: Number,
      calinski_harabasz_score: Number,
      dunn_index: Number,
      inertia: Number,
    },
    labelsByCustomer: { type: Object, default: {} },
    clusters: [clusterBlockSchema],
    nAnomalies: { type: Number, default: 0 },
    runDuration: { type: Number, default: 0 },
    isActive: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: false } }
);

module.exports = mongoose.model("ClusterResult", clusterResultSchema);
