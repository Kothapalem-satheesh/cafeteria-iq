import axios from "axios";

const base = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const api = axios.create({ baseURL: base, timeout: 300000 });
api.interceptors.request.use((c) => {
  const t = localStorage.getItem("token");
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});
api.interceptors.response.use(
  (r) => r,
  (e) => {
    if (e.response && e.response.status === 401) {
      localStorage.removeItem("token");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(e);
  }
);

export const auth = {
  login: (p) => api.post("/auth/login", p),
  register: (p) => api.post("/auth/register", p),
  getMe: () => api.get("/auth/me"),
};

export const transactions = {
  getAll: (p) => api.get("/transactions", { params: p }),
  getStats: () => api.get("/transactions/stats/overview"),
  getTimeSeries: (p) => api.get("/transactions/stats/timeseries", { params: p }),
  getHeatmap: () => api.get("/transactions/stats/heatmap"),
  getRFM: () => api.get("/transactions/stats/rfm"),
  getAnomalies: () => api.get("/transactions/anomalies"),
};

export const menu = {
  getAll: () => api.get("/menu"),
  getTopSelling: (p) => api.get("/menu/analytics/top-selling", { params: p }),
  getCategorySplit: () => api.get("/menu/analytics/category-split"),
  getLowPerformers: () => api.get("/menu/analytics/low-performers"),
  getRecommendations: () => api.get("/menu/recommendations"),
};

export const clustering = {
  run: (b) => api.post("/clustering/run", b),
  getRuns: () => api.get("/clustering/runs"),
  getActive: () => api.get("/clustering/active"),
  getCompare: () => api.get("/clustering/compare"),
  getStatus: () => api.get("/clustering/status"),
  getCluster: (r, c) => api.get(`/clustering/clusters/${r}/${c}`),
  getAnomalies: (r) => api.get(`/clustering/anomalies/${r}`),
  activate: (id) => api.put(`/clustering/runs/${id}/activate`),
};

export const reduction = {
  getPCA: (b) => api.post("/reduce/pca", b || {}),
  getTSNE: (b) => api.post("/reduce/tsne", b || {}),
  getUMAP: (b) => api.post("/reduce/umap", b || {}),
};

export const association = {
  mineRules: (b) => api.post("/association/mine", b || {}),
  getRules: () => api.get("/association/rules"),
  getBundles: () => api.get("/association/bundles"),
  getClusterRules: (id) => api.post(`/association/cluster/${id}`),
};

export const dashboard = {
  getAll: () => api.get("/dashboard/all"),
};

export const upload = {
  uploadCSV: (fd) => api.post("/upload/csv", fd, { headers: { "Content-Type": "multipart/form-data" } }),
  getTemplate: () => api.get("/upload/template", { responseType: "blob" }),
};

export default api;
