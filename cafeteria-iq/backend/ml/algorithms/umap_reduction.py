"""UMAP 2D/3D and parameter sweep."""
import numpy as np
import umap


class UMAPReduction:
    def transform_2d(self, X, n_neighbors=15, min_dist=0.1):
        X = np.asarray(X, dtype=float)
        nn = min(n_neighbors, max(2, len(X) - 1))
        r = umap.UMAP(
            n_components=2,
            n_neighbors=nn,
            min_dist=float(min_dist),
            random_state=42,
        )
        Z = r.fit_transform(X)
        return {"coordinates_2d": Z.tolist()}

    def transform_3d(self, X, n_neighbors=15, min_dist=0.1):
        X = np.asarray(X, dtype=float)
        nn = min(n_neighbors, max(2, len(X) - 1))
        r = umap.UMAP(
            n_components=3,
            n_neighbors=nn,
            min_dist=float(min_dist),
            random_state=42,
        )
        Z = r.fit_transform(X)
        return {"coordinates_3d": Z.tolist()}

    def parameter_sweep(self, X):
        X = np.asarray(X, dtype=float)
        results = {}
        for nn in [5, 15, 30]:
            for md in [0.05, 0.1, 0.5]:
                key = f"n{nn}_d{md}"
                n_neighbors = min(nn, max(2, len(X) - 1))
                r = umap.UMAP(
                    n_components=2,
                    n_neighbors=n_neighbors,
                    min_dist=md,
                    random_state=42,
                )
                Z = r.fit_transform(X)
                results[key] = Z.tolist()
        return results
