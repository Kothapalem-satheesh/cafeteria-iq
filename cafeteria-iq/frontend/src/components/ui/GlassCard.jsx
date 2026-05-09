import clsx from "clsx";

export default function GlassCard({ children, className, ...p }) {
  return (
    <div className={clsx("glass-card p-4", className)} {...p}>
      {children}
    </div>
  );
}
