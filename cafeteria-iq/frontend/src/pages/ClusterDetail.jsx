import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { clustering } from "../services/api";
import GlassCard from "../components/ui/GlassCard";

export default function ClusterDetail() {
  const { runId, clusterId } = useParams();
  const { data } = useQuery({
    queryKey: ["cl", runId, clusterId],
    queryFn: () => clustering.getCluster(runId, clusterId).then((r) => r.data),
  });
  if (!data) return <p className="p-4">…</p>;
  return (
    <div>
      <Link to="/" className="text-amber-300 text-sm">
        ← Back
      </Link>
      <h1 className="display-font text-3xl mt-2">Cluster {clusterId}</h1>
      <GlassCard className="mt-4">
        <pre className="text-xs overflow-auto">{JSON.stringify(data, null, 2)}</pre>
      </GlassCard>
    </div>
  );
}
