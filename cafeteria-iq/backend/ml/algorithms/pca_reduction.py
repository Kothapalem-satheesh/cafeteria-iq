"""PCA: scree, loadings, biplot."""
import numpy as np
from sklearn.decomposition import PCA


class PCAReduction:
    def fit_full(self, X):
        X = np.asarray(X, dtype=float)
        pca = PCA()
        pca.fit(X)
        evr = pca.explained_variance_ratio_.tolist()
        cum = np.cumsum(pca.explained_variance_ratio_).tolist()
        n95 = int(np.searchsorted(cum, 0.95) + 1) if len(cum) else 0
        n95 = min(n95, X.shape[1]) if n95 else 1
        load = pca.components_.tolist()
        fn = X.shape[1]
        top_per = []
        for k in range(min(5, pca.n_components_)):
            w = np.abs(pca.components_[k])
            idx = np.argsort(-w)[:3]
            top_per.append(
                [
                    {"feature_index": int(i), "loading": float(pca.components_[k][i])}
                    for i in idx
                ]
            )
        return {
            "explained_variance_ratio": evr,
            "cumulative_explained_variance": [float(c) for c in cum],
            "n_components_95": n95,
            "component_loadings": load,
            "feature_importance_per_pc": top_per,
        }

    def transform_2d(self, X):
        X = np.asarray(X, dtype=float)
        pca = PCA(n_components=min(2, X.shape[1]), random_state=42)
        Z = pca.fit_transform(X)
        return {
            "coordinates_2d": Z.tolist(),
            "explained_variance": pca.explained_variance_ratio_.tolist(),
        }

    def transform_3d(self, X):
        X = np.asarray(X, dtype=float)
        n = min(3, X.shape[1])
        pca = PCA(n_components=n, random_state=42)
        Z = pca.fit_transform(X)
        return {
            "coordinates_3d": Z.tolist(),
            "explained_variance": pca.explained_variance_ratio_.tolist(),
        }

    def biplot_data(self, X, feature_names=None):
        X = np.asarray(X, dtype=float)
        pca = PCA(n_components=2, random_state=42)
        Z = pca.fit_transform(X)
        scale = 3.0
        ar = (pca.components_[:2].T) * scale
        return {
            "points_2d": Z.tolist(),
            "loading_vectors": ar.tolist(),
            "feature_names": feature_names or [f"f{i}" for i in range(X.shape[1])],
        }
