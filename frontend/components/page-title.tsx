export function PageTitle({
  title,
  subtitle,
  eyebrow
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
}) {
  return (
    <div className="mb-6 rounded-xl border border-border bg-card/90 p-4">
      <div className="space-y-2">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{title}</h1>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
    </div>
  );
}
