import Link from 'next/link';
import { Compass, SearchX } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { getServerTranslator } from '@/lib/server-i18n';

export default async function NotFound() {
  const { t } = await getServerTranslator();

  return (
    <div className="flex min-h-[74vh] items-center justify-center">
      <section className="relative isolate w-full overflow-hidden rounded-2xl border border-border bg-card/85 px-6 py-10 shadow-sm sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute -left-24 top-0 h-64 w-64 rounded-full bg-zinc-500/10 blur-3xl dark:bg-zinc-200/10" />
        <div className="pointer-events-none absolute -right-20 bottom-0 h-52 w-52 rounded-full bg-zinc-400/10 blur-3xl dark:bg-zinc-300/10" />

        <div className="relative mx-auto max-w-2xl text-center">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">{t('notFound.code')}</p>

          <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">{t('notFound.title')}</h1>

          <p className="mx-auto mt-4 max-w-xl text-pretty text-sm text-muted-foreground sm:text-base">{t('notFound.description')}</p>
          <p className="mx-auto mt-2 max-w-xl text-xs uppercase tracking-[0.12em] text-muted-foreground/85 sm:text-sm">{t('notFound.hint')}</p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/files" className={buttonVariants({ variant: 'default' })}>
              <Compass className="h-4 w-4" />
              {t('notFound.goFiles')}
            </Link>
            <Link href="/shares" className={buttonVariants({ variant: 'outline' })}>
              <SearchX className="h-4 w-4" />
              {t('notFound.goShares')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
