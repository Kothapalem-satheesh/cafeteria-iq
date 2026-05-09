import { useQuery } from "@tanstack/react-query";
import { transactions as tx } from "../services/api";
import GlassCard from "../components/ui/GlassCard";

export default function Transactions() {
  const { data } = useQuery({ queryKey: ["tx"], queryFn: () => tx.getAll({ page: 1, limit: 50 }).then((r) => r.data) });
  return (
    <div>
      <h1 className="display-font text-3xl mb-4">Transactions</h1>
      <GlassCard>
        <div className="overflow-x-auto text-sm">
          <table className="w-full">
            <thead>
              <tr className="text-left text-slate-400">
                <th>ID</th>
                <th>Customer</th>
                <th>Slot</th>
                <th>Amount</th>
                <th>Cluster</th>
              </tr>
            </thead>
            <tbody>
              {(data?.data || []).map((t) => (
                <tr key={t.transactionId} className="border-t border-white/5">
                  <td className="py-2 number-font text-xs">{t.transactionId}</td>
                  <td>{t.customerId}</td>
                  <td>{t.timeSlot}</td>
                  <td>₹{t.totalAmount}</td>
                  <td>{t.clusterId ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
