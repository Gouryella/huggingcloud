'use client';

import { ChevronDown, ChevronUp, Loader2, RotateCcw, UploadCloud, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAppPreferences } from '@/hooks/use-app-preferences';
import { formatBytes } from '@/lib/format';
import { displayRepoPath } from '@/lib/path-display';

import type { UploadSummary, UploadTask } from './types';
import { isTaskActive, uploadTaskStatusLabel } from './utils';

export function UploadCenter({
  tasks,
  summary,
  expanded,
  onExpandedChange,
  onCancelTask,
  onRetryTask,
  onClearFailed,
}: {
  tasks: UploadTask[];
  summary: UploadSummary;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onCancelTask: (taskId: string) => void;
  onRetryTask: (taskId: string) => void;
  onClearFailed: () => void;
}) {
  const { t } = useAppPreferences();
  if (tasks.length === 0) return null;
  const hasFailedTasks = tasks.some((task) => task.status === 'failed');

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 w-[min(420px,calc(100vw-2rem))]">
      <div className="pointer-events-auto flex [max-height:min(26rem,calc(100vh-8rem))] flex-col overflow-hidden rounded-xl border border-zinc-300 bg-zinc-50/95 text-zinc-900 shadow-xl backdrop-blur dark:border-zinc-700 dark:bg-zinc-950/95 dark:text-zinc-100">
        <div className="shrink-0 space-y-2 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                <UploadCloud className="h-4 w-4" />
                {t('files.uploadCenterTitle')}
              </p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{t('files.uploadCenterSummary', summary)}</p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-7 w-7 border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 hover:text-zinc-900 focus-visible:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:focus-visible:ring-zinc-600"
              onClick={() => onExpandedChange(!expanded)}
              aria-label={expanded ? t('files.uploadCenterHideDetails') : t('files.uploadCenterShowDetails')}
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-zinc-600 dark:text-zinc-400">
              <span>{t('files.uploadCenterProgress')}</span>
              <span>
                {summary.totalProgress}% ({formatBytes(summary.uploadedBytes)} / {formatBytes(summary.totalBytes)})
              </span>
            </div>
            <Progress value={summary.totalProgress} className="h-1.5 bg-zinc-200 dark:bg-zinc-800 [&>div]:bg-zinc-900 dark:[&>div]:bg-zinc-100" />
          </div>
        </div>

        {expanded ? (
          <div className="flex min-h-0 flex-1 flex-col border-t border-zinc-200 px-3 pb-3 pt-2 dark:border-zinc-700">
            <div className="min-h-0 max-h-72 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
              {tasks.map((task) => (
                <div key={task.id} className="rounded-lg border border-zinc-200 bg-white/90 p-2.5 dark:border-zinc-700 dark:bg-zinc-900/80">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{task.fileName}</p>
                      <p className="truncate font-mono text-[11px] text-zinc-600 dark:text-zinc-400">{displayRepoPath(task.path)}</p>
                    </div>
                    <div className="inline-flex items-center gap-1">
                      {task.status === 'failed' ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-7 w-7 border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 hover:text-zinc-900 focus-visible:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:focus-visible:ring-zinc-600"
                          onClick={() => onRetryTask(task.id)}
                          aria-label={t('files.uploadRetry')}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                      {isTaskActive(task.status) ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-7 w-7 border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 hover:text-zinc-900 focus-visible:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:focus-visible:ring-zinc-600"
                          onClick={() => onCancelTask(task.id)}
                          aria-label={t('files.uploadCancel')}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-600 dark:text-zinc-400">
                    <span className="inline-flex items-center gap-1">
                      {isTaskActive(task.status) ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {uploadTaskStatusLabel(t, task.status)}
                    </span>
                    <span>{task.progress}%</span>
                  </div>

                  <Progress value={task.progress} className="mt-1.5 h-1.5 bg-zinc-200 dark:bg-zinc-800 [&>div]:bg-zinc-900 dark:[&>div]:bg-zinc-100" />

                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-zinc-600 dark:text-zinc-400">
                    <span>
                      {formatBytes(task.uploadedBytes)} / {formatBytes(task.size)}
                    </span>
                    <span>
                      {task.completedChunks}/{task.totalChunks}
                    </span>
                  </div>

                  {task.message ? <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400">{task.message}</p> : null}
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-zinc-300 bg-zinc-100 text-zinc-900 hover:bg-zinc-200 focus-visible:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus-visible:ring-zinc-600"
                disabled={!hasFailedTasks}
                onClick={onClearFailed}
              >
                {t('files.uploadClearFailed')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
