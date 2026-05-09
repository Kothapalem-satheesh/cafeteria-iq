# CafeteriaIQ Pro Showcase (Supabase + Unsupervised ML)

This guide is for your final project demo so you can clearly explain:
- where the data came from,
- which models you trained,
- how you evaluated them,
- and how the web app uses the results.

## 1) Project Story You Can Tell

I built an unsupervised learning system for cafeteria analytics.
I used transactional cafeteria data, cleaned and transformed it into customer behavior features,
trained multiple unsupervised models, compared model quality, and integrated insights into a dashboard.

## 2) Where Data Comes From (very important)

Use one of these valid and professional sources:

1. **Primary option (recommended): your own cafeteria transaction export**
   - Source: CSV export from POS/counter logs.
   - Load into Supabase table `transactions_raw`.
   - Best for viva because you can say the dataset is from a real environment.

2. **If real data is not available: synthetic but realistic data**
   - Generate rows using scripts/notebooks with:
     - realistic menu items,
     - weekday/weekend patterns,
     - lunch-time peak,
     - payment methods,
     - occasional anomalies.
   - Store generated rows in `transactions_raw`.
   - In viva, clearly say: "Data is synthetically generated to simulate realistic cafeteria behavior."

3. **Optional external open data + mapping**
   - Use a public retail dataset and map columns to cafeteria schema.
   - Mention that domain adaptation was performed.

## 3) Supabase Tables for This Project

Use `database/supabase_schema.sql` to create these tables:
- `menu_items`
- `transactions_raw`
- `customer_features`
- `model_runs`
- `cluster_assignments`
- `anomaly_scores`
- `association_rules`

## 4) End-to-End Pipeline

1. Insert data into `transactions_raw`.
2. Build customer-level features (`customer_features`) in notebooks.
3. Train models in Jupyter:
   - KMeans
   - DBSCAN
   - GMM
   - Hierarchical clustering
   - Isolation Forest
   - Apriori association rules
4. Save outputs to Supabase (`model_runs`, `cluster_assignments`, `anomaly_scores`, `association_rules`).
5. Backend API reads these tables and frontend renders beautiful dashboards.

## 5) Notebook Structure (backend training flow)

Create these notebooks under `backend/notebooks/`:

1. `01_data_ingestion_and_eda.ipynb`
2. `02_preprocessing_and_feature_engineering.ipynb`
3. `03_clustering_kmeans_dbscan_gmm_hierarchical.ipynb`
4. `04_model_evaluation_and_selection.ipynb`
5. `05_anomaly_detection_isolation_forest.ipynb`
6. `06_association_rules_apriori.ipynb`
7. `07_export_results_to_supabase.ipynb`
8. `08_final_business_insights.ipynb`

## 6) What to Show in UI

- Segment distribution and persona summary
- 2D projection (PCA/t-SNE/UMAP) with cluster coloring
- Time-slot and day-of-week heatmaps
- Top item bundles from association rules
- Anomaly list with reasons and scores
- Model comparison card (silhouette, Davies-Bouldin, Calinski-Harabasz)

## 7) Viva Lines (ready to speak)

- "Data is stored in Supabase and versioned by model runs."
- "I engineered customer behavior features from transaction history."
- "I compared multiple unsupervised models and selected based on both metrics and interpretability."
- "I exposed model outputs through APIs and built an analytics dashboard for decision support."

