"""Deep autoencoder: latent space + anomaly detection from reconstruction error."""
import numpy as np
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
from tensorflow.keras import Model
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.preprocessing import MinMaxScaler


class AutoencoderClustering:
    def __init__(self):
        self.autoencoder = None
        self.encoder = None
        self.scaler = None

    def build_autoencoder(self, input_dim, encoding_dim=8):
        tf.random.set_seed(42)
        inp = keras.Input(shape=(input_dim,))
        x = layers.Dense(64, activation="relu")(inp)
        x = layers.BatchNormalization()(x)
        x = layers.Dense(32, activation="relu")(x)
        x = layers.Dense(16, activation="relu")(x)
        encoded = layers.Dense(encoding_dim, activation="relu")(x)
        x = layers.Dense(16, activation="relu")(encoded)
        x = layers.Dense(32, activation="relu")(x)
        x = layers.Dense(64, activation="relu")(x)
        # Linear last layer: standardized features
        out = layers.Dense(input_dim, activation="linear")(x)
        self.autoencoder = Model(inp, out, name="autoencoder")
        self.encoder = Model(inp, encoded, name="encoder")
        self.autoencoder.compile(optimizer=keras.optimizers.Adam(1e-3), loss="mse")
        return self.autoencoder, self.encoder

    def train(self, X, epochs=100, batch_size=32):
        X = np.asarray(X, dtype=float)
        self.scaler = MinMaxScaler()
        Xn = self.scaler.fit_transform(X)
        dim = Xn.shape[1]
        if self.autoencoder is None:
            self.build_autoencoder(dim, encoding_dim=min(8, max(2, dim // 2)))
        es = keras.callbacks.EarlyStopping(
            monitor="loss", patience=10, restore_best_weights=True
        )
        hist = self.autoencoder.fit(
            Xn,
            Xn,
            epochs=epochs,
            batch_size=batch_size,
            validation_split=0.1
            if len(Xn) > 5
            else 0.0,
            verbose=0,
            callbacks=[es],
        )
        recon = self.autoencoder.predict(Xn, verbose=0)
        err = np.mean(np.power(Xn - recon, 2), axis=1)
        return {
            "history": {k: [float(x) for x in v] for k, v in hist.history.items()},
            "reconstruction_errors": err.tolist(),
        }

    def get_latent_representations(self, X):
        X = np.asarray(X, dtype=float)
        if self.encoder is None or self.scaler is None:
            return np.zeros((len(X), 4))
        Xn = self.scaler.transform(X)
        return self.encoder.predict(Xn, verbose=0)

    def detect_anomalies(self, X, threshold_percentile=95):
        X = np.asarray(X, dtype=float)
        if self.autoencoder is None or self.scaler is None:
            return {
                "anomaly_scores": [0.0] * len(X),
                "anomaly_flags": [False] * len(X),
                "threshold_value": 0.0,
            }
        Xn = self.scaler.transform(X)
        recon = self.autoencoder.predict(Xn, verbose=0)
        scores = np.mean(np.power(Xn - recon, 2), axis=1)
        thr = float(np.percentile(scores, threshold_percentile))
        flags = (scores > thr).tolist()
        return {
            "anomaly_scores": scores.tolist(),
            "anomaly_flags": flags,
            "threshold_value": thr,
        }

    def cluster_latent_space(self, X, n_clusters=4):
        X = np.asarray(X, dtype=float)
        lat = self.get_latent_representations(X)
        n_clusters = int(min(n_clusters, max(2, len(X) - 1)))
        km = KMeans(
            n_clusters=n_clusters, init="k-means++", n_init=10, random_state=42
        )
        labels = km.fit_predict(lat)
        try:
            from sklearn.metrics import silhouette_score

            sil = float(
                silhouette_score(
                    lat, labels, metric="euclidean"
                )
            )
        except Exception:
            sil = 0.0
        p2 = PCA(n_components=2, random_state=42)
        z2 = p2.fit_transform(lat)
        return {
            "labels": labels.tolist(),
            "silhouette_score": sil,
            "latent_2d": z2.tolist(),
        }
