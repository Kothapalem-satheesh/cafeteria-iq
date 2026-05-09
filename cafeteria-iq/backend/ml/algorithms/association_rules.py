"""Frequent itemsets and association rules (mlxtend)."""
import re

import numpy as np
import pandas as pd
from mlxtend.frequent_patterns import association_rules, fpgrowth
from mlxtend.preprocessing import TransactionEncoder


def _basket_to_items(df):
    rows = []
    for _, r in df.iterrows():
        names = set()
        for it in r.get("items") or []:
            n = (it.get("itemName") or "item").strip()
            n = re.sub(r"\W+", " ", n)
            n = f"item_{n.replace(' ', '_')[:40]}"
            names.add(n)
        rows.append(list(names))
    return rows


class AssociationRuleMiner:
    def build_basket_matrix(self, transactions_df):
        if isinstance(transactions_df, list):
            b = transactions_df
        else:
            b = _basket_to_items(transactions_df)
        te = TransactionEncoder()
        te_ary = te.fit(b).transform(b)
        return pd.DataFrame(te_ary, columns=te.columns_)

    def mine_frequent_itemsets(self, basket_matrix, min_support=0.05):
        fi = fpgrowth(
            basket_matrix.astype(bool),
            min_support=min(0.99, max(0.01, min_support)),
            use_colnames=True,
        )
        return fi

    def generate_rules(self, frequent_itemsets, min_confidence=0.3, min_lift=1.2, top=50):
        if frequent_itemsets is None or len(frequent_itemsets) < 1:
            return []
        r = association_rules(
            frequent_itemsets,
            metric="lift",
            min_threshold=1.0,
        )
        r = r[(r["confidence"] >= min_confidence) & (r["lift"] >= min_lift)]
        r = r.sort_values("lift", ascending=False)
        r = r.head(top)
        out = []
        for _, row in r.iterrows():
            a = set(row["antecedents"])
            c = set(row["consequents"])
            a_s = ", ".join(sorted(a))
            c_s = ", ".join(sorted(c))
            out.append(
                {
                    "antecedents": list(a),
                    "consequents": list(c),
                    "text": f"If customer buys {a_s} then likely {c_s} (lift: {row['lift']:.2f})",
                    "support": float(row["support"]),
                    "confidence": float(row["confidence"]),
                    "lift": float(row["lift"]),
                    "conviction": float(row.get("conviction", 0))
                    if "conviction" in row
                    else 0.0,
                }
            )
        return out

    def get_menu_bundles(self, rules, price_hint=None):
        bundles = []
        if not rules:
            return bundles
        by_ant = {}
        for r in rules:
            a = frozenset(r.get("antecedents") or [])
            if a not in by_ant:
                by_ant[a] = []
            by_ant[a].append(r)
        for ant, gr in list(by_ant.items())[:20]:
            best = gr[0]
            a_list = [x.replace("item_", "").replace("_", " ") for x in list(ant)]
            c_list = [x.replace("item_", "").replace("_", " ") for x in best.get("consequents", [])]
            s = f" {' + '.join(a_list + c_list)}"
            pr = 35.0
            bundles.append(
                {
                    "bundle": a_list + c_list,
                    "support": best.get("support", 0),
                    "lift": best.get("lift", 0),
                    "recommendation": f"Offer{s.strip()} combo at \u20b9{int(pr)} (bundle)",
                }
            )
        return bundles

    def per_cluster_rules(self, transactions_df, customer_cluster_map, cluster_id, **kwargs):
        """customer_cluster_map: { customerId: clusterId } for rows."""
        d = transactions_df.copy() if not isinstance(transactions_df, list) else None
        if d is not None and "customerId" in d.columns and customer_cluster_map is not None:
            d = d[d["customerId"].astype(str).map(lambda c: str(customer_cluster_map.get(c, -1)) == str(cluster_id))]  # noqa: E501
        elif d is not None and "cluster_id" in d.columns:
            d = d[d["cluster_id"] == cluster_id]
        else:
            d = transactions_df
        b = self.build_basket_matrix(d)
        fi = self.mine_frequent_itemsets(b, min_support=kwargs.get("min_support", 0.05))
        rules = self.generate_rules(
            fi,
            min_confidence=kwargs.get("min_confidence", 0.2),
            min_lift=kwargs.get("min_lift", 1.1),
        )
        return {"frequent_itemsets": fi.to_dict("records") if len(fi) else [], "rules": rules}
