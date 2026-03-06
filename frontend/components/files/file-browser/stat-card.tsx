export function StatCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="w-full rounded-lg border border-border bg-card p-4 sm:w-56">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
      {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}
