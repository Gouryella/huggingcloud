import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Github } from 'lucide-react';
import { redirect } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { ApiError, serverApiFetch } from '@/lib/api';
import { formatCompactNumber } from '@/lib/format';
import { GITHUB_REPO, getGitHubRepoHref } from '@/lib/github';
import { getServerTranslator } from '@/lib/server-i18n';
import type { UserMe } from '@/lib/types';
import { cn } from '@/lib/utils';

interface GitHubRepoResponse {
  stargazers_count?: number;
}

async function getGitHubRepoStars(repo: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'hugging-cloud'
      },
      next: { revalidate: 3600 }
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as GitHubRepoResponse;
    return typeof data.stargazers_count === 'number' ? data.stargazers_count : null;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const { locale, t } = await getServerTranslator();
  const githubHref = getGitHubRepoHref();

  try {
    const me = await serverApiFetch<UserMe>('/api/me');

    if (me.force_root_admin_setup) {
      redirect('/setup/root-admin');
    }

    redirect('/files');
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) {
      // Keep landing page available during transient backend issues.
    }
  }

  const githubStars = await getGitHubRepoStars(GITHUB_REPO);
  const primaryCtaLabel = githubStars === null ? t('pages.home.github.kicker') : `${formatCompactNumber(githubStars, locale)} ${t('pages.home.github.repoStars')}`;

  return (
    <div className="flex h-full flex-col gap-8 pb-4">
      <section className="relative overflow-hidden px-1 pt-4 sm:pt-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px] bg-[radial-gradient(circle_at_top,rgba(24,24,27,0.08),transparent_65%)] dark:bg-[radial-gradient(circle_at_top,rgba(228,228,231,0.12),transparent_60%)]" />

        <div className="mx-auto max-w-[920px] text-center">
          <div className="home-animate-in">
            <p className="text-sm font-medium text-muted-foreground sm:text-base">{t('pages.home.eyebrow')}</p>
            <h1 className="mx-auto mt-5 max-w-[760px] text-balance text-[2.4rem] font-semibold leading-[0.98] tracking-[-0.045em] text-foreground sm:text-[3.4rem] lg:text-[4.35rem]">
              {t('pages.home.title')}
            </h1>
            <p className="mx-auto mt-6 max-w-[760px] text-pretty text-base leading-7 text-muted-foreground sm:text-xl sm:leading-8">
              {t('pages.home.subtitle')}
            </p>
          </div>

          <div className="home-animate-in home-delay-1 mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={githubHref}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ size: 'lg' }), 'h-12 rounded-full px-7 text-sm font-semibold shadow-[0_8px_24px_rgba(0,0,0,0.14)]')}
            >
              <Github className="h-4 w-4" />
              {primaryCtaLabel}
            </Link>
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: 'secondary', size: 'lg' }),
                'h-12 rounded-full bg-zinc-100 px-7 text-sm font-semibold text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700'
              )}
            >
              {t('pages.home.secondaryCta')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="home-animate-in home-delay-2 mx-auto mt-14 w-full max-w-[1180px]">
          <div className="overflow-hidden rounded-[28px] border border-zinc-200/80 bg-white/96 p-2.5 shadow-[0_28px_70px_rgba(0,0,0,0.12)] dark:border-zinc-700/70 dark:bg-zinc-900/95 sm:p-3.5">
            <Image
              src="/safari.png"
              alt="Safari window preview"
              width={1536}
              height={1054}
              priority
              className="block h-auto w-full rounded-[18px] object-contain"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
