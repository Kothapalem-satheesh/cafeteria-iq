"""t-SNE 2D with PCA pretrain and perplexity grid."""
import numpy as np
from sklearn.decomposition import PCA
from sklearn.manifold import TSNE


class TSNEReduction:
    def transform(self, X, perplexity=30, n_iter=1000, learning_rate="auto"):
        X = np.asarray(X, dtype=float)
        pca = PCA(n_components=min(50, X.shape[1]), random_state=42)
        Xp = pca.fit_transform(X)
        perp = min(perplexity, max(5, (len(X) - 1) // 2))
        ts = TSNE(
            n_components=2,
            perplexity=perp,
            max_iter=n_iter,
            learning_rate=learning_rate
            if learning_rate != "auto"
            else 200.0
            if len(X) < 1000
            else 1000.0,
            init="pca",
            random_state=42,
        )
        Z = ts.fit_transform(Xp)
        kl = float(getattr(ts, "kl_divergence_", 0) or 0)
        return {"coordinates_2d": Z.tolist(), "kl_divergence": kl}

    def perplexity_comparison(self, X):
        out = {}
        for p in [5, 15, 30, 50]:
            r = self.transform(X, perplexity=p, n_iter=500, learning_rate="auto")
            out[str(p)] = r
        return out
