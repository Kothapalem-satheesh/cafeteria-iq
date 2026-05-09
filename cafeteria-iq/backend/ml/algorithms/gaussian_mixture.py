"""Gaussian Mixture models with AIC/BIC and soft membership."""
import numpy as np
from sklearn.mixture import GaussianMixture


class GMMClustering:
    def find_optimal_components(self, X, n_range=(2, 10), covariance_types=None):
        X = np.asarray(X, dtype=float)
        if covariance_types is None:
            covariance_types = ["full", "tied", "diag", "spherical"]
        low, high = n_range
        aic_c = {"n": [], "values": []}
        bic_c = {"n": [], "values": []}
        by_combo = []
        for n in range(low, min(high + 1, max(len(X) - 1, low + 1))):
            for cov in covariance_types:
                if n >= len(X):
                    continue
                try:
                    g = GaussianMixture(
                        n_components=n,
                        covariance_type=cov,
                        random_state=42,
                        n_init=3,
                    )
                    g.fit(X)
                    by_combo.append(
                        {
                            "n_components": n,
                            "covariance_type": cov,
                            "aic": float(g.aic(X)),
                            "bic": float(g.bic(X)),
                        }
                    )
                    aic_c["n"].append(n)
                    aic_c["values"].append(float(g.aic(X)))
                except Exception:
                    continue
        if by_combo:
            best = min(by_combo, key=lambda x: x["bic"])
        else:
            best = {"n_components": 2, "covariance_type": "full", "aic": 0, "bic": 0}
        return {
            "by_configuration": by_combo,
            "aic_curve": aic_c,
            "bic_curve": by_combo
            and {
                "n": [x["n_components"] for x in by_combo],
                "values": [x["bic"] for x in by_combo],
            }
            or {"n": [], "values": []},
            "optimal": best,
        }

    def fit(self, X, n_components=4, covariance_type="full"):
        X = np.asarray(X, dtype=float)
        n_components = int(min(n_components, max(1, len(X) - 1)))
        g = GaussianMixture(
            n_components=n_components,
            covariance_type=covariance_type,
            random_state=42,
            n_init=5,
        )
        g.fit(X)
        labels = g.predict(X)
        probs = g.predict_proba(X)
        cov = []
        if hasattr(g, "covariances_") and g.covariances_ is not None:
            if g.covariance_type == "diag":
                cov = [c.tolist() for c in g.covariances_]
            elif g.covariance_type in ("spherical", "tied"):
                cov = g.covariances_.tolist() if g.covariances_.size < 1e3 else "omitted"
            else:
                cov = "omitted_large"
        return {
            "labels": labels.tolist(),
            "probabilities": probs.tolist(),
            "means": g.means_.tolist(),
            "covariances": cov,
            "aic": float(g.aic(X)),
            "bic": float(g.bic(X)),
            "log_likelihood": float(g.score(X) * len(X)),
        }

    def get_uncertainty_customers(self, probabilities, threshold=0.6):
        P = np.asarray(probabilities, dtype=float)
        if P.size == 0:
            return {"indices": [], "distributions": []}
        maxp = P.max(axis=1)
        uncertain = np.where(maxp < threshold)[0]
        return {
            "uncertain_customer_indices": uncertain.tolist(),
            "probability_distributions": P[uncertain].tolist() if len(uncertain) else [],
        }
