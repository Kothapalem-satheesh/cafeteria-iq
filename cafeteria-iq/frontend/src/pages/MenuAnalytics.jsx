import { useQuery } from "@tanstack/react-query";
import { menu } from "../services/api";
import GlassCard from "../components/ui/GlassCard";
import { Pie, PieChart, ResponsiveContainer, Cell, Legend, Tooltip } from "recharts";

const COL = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#06b6d4"];

export default function MenuAnalytics() {
  const { data: split } = useQuery({ queryKey: ["cat"], queryFn: () => menu.getCategorySplit().then((r) => r.data) });
  return (
    <div>
      <h1 className="display-font text-3xl mb-4">Menu Analytics</h1>
      <GlassCard>
        <h2 className="text-lg mb-2">Revenue by category</h2>
        <div className="h-64">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={split} dataKey="value" nameKey="name" label>
                {split?.map((e, i) => (
                  <Cell key={e.name} fill={COL[i % COL.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#0a1628" }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>
    </div>
  );
}
