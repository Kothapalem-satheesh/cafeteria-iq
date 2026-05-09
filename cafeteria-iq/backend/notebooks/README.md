# Notebook Workflow (CSV Upload + Unsupervised Learning)

Use this folder for model training and analysis.  
Each notebook should read from local CSV files and save final outputs as local CSV/JSON files.

## Suggested notebook order

1. `01_data_ingestion_and_eda.ipynb`
   - Load uploaded CSV from `data/transactions.csv` (or your chosen local path).
   - Validate row counts, nulls, duplicates.
   - Show distribution by day/time slot/category.

2. `02_preprocessing_and_feature_engineering.ipynb`
   - Build customer-level features (RFM + behavior ratios).
   - Scale numeric features.
   - Save to local `outputs/customer_features.csv`.

3. `03_clustering_kmeans_dbscan_gmm_hierarchical.ipynb`
   - Train and tune clustering models.
   - Save candidate metrics and labels.

4. `04_model_evaluation_and_selection.ipynb`
   - Compare silhouette, Davies-Bouldin, Calinski-Harabasz.
   - Select final clustering run and explain why.

5. `05_anomaly_detection_isolation_forest.ipynb`
   - Train anomaly detector.
   - Save anomaly scores and flags to local `outputs/anomaly_scores.csv`.

6. `06_association_rules_apriori.ipynb`
   - Build market-basket rules.
   - Save top rules to local `outputs/association_rules_top.csv`.

7. `07_export_results_to_supabase.ipynb`
   - Consolidate all generated outputs into `outputs/final_package/`.
   - Export final CSV/JSON files for report/dashboard use.
   - Validate counts and sample rows.

8. `08_final_business_insights.ipynb`
   - Human-readable cluster personas.
   - Revenue opportunity and promotion ideas.
   - Final screenshots/charts for report.

## Minimal Python stack

- pandas
- numpy
- scikit-learn
- mlxtend
- matplotlib
- seaborn
- plotly

## What to keep in each notebook

- Clear problem statement
- Input data source file paths
- Feature list used for model
- Hyperparameters tested
- Metrics table
- Final decision and business interpretation
