import { useState } from "react";
import { association } from "../services/api";
import GlassCard from "../components/ui/GlassCard";

export default function AssociationRules() {
  const [data, setD] = useState(null);
  return (
    <div>
      <h1 className="display-font text-3xl mb-4">Association Rule Mining</h1>
      <GlassCard className="mb-4">
        <button
          type="button"
          onClick={() => association.mineRules({ min_support: 0.02 }).then((r) => setD(r.data))}
          className="px-4 py-2 bg-amber-500/20 text-amber-200 rounded-lg"
        >
          Mine rules
        </button>
      </GlassCard>
      {data && data.rules && (
        <div className="space-y-2 max-h-96 overflow-auto text-sm">
          {data.rules.map((r, i) => (
            <p key={i} className="p-2 glass-card">
              {r.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
