'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import WavesurferPlayer from '@wavesurfer/react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type AudioWaveformPreviewProps = {
  src: string;
  className?: string;
};

export function AudioWaveformPreview({ src, className }: AudioWaveformPreviewProps) {
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [waveformEnabled, setWaveformEnabled] = useState(false);
  const [waveformReady, setWaveformReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [waveformHeight, setWaveformHeight] = useState(200);
  const waveformContainerRef = useRef<HTMLDivElement | null>(null);
  const fetchParams = useMemo<RequestInit>(
    () => ({
      credentials: 'include',
    }),
    []
  );

  useEffect(() => {
    setWaveformEnabled(false);
    setWaveformReady(false);
    setLoadError(null);
    setWaveformHeight(200);
  }, [src]);

  useEffect(() => {
    if (!waveformEnabled) return;
    const container = waveformContainerRef.current;
    if (!container) return;

    const updateWaveHeight = () => {
      const style = window.getComputedStyle(container);
      const paddingTop = Number.parseFloat(style.paddingTop) || 0;
      const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
      const available = Math.floor(container.clientHeight - paddingTop - paddingBottom);
      const nextHeight = Math.max(150, Math.min(220, available));
      setWaveformHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };

    updateWaveHeight();
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      updateWaveHeight();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [waveformEnabled]);

  const isWaveformLoading = waveformEnabled && !waveformReady && !loadError;

  return (
    <div className={cn('grid h-full min-h-[360px] w-full grid-rows-[auto,minmax(0,1fr)] gap-4', className)}>
      <section className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Audio Preview</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">先用播放器快速预览，需要时再加载波形。</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-zinc-300 text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            onClick={() => {
              setWaveformEnabled((prev) => !prev);
              setWaveformReady(false);
              setLoadError(null);
            }}
          >
            {waveformEnabled ? '隐藏波形' : '加载波形'}
          </Button>
        </div>

        <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950/70">
          <audio src={src} className="w-full" controls preload="metadata" ref={setAudioElement} />
        </div>
      </section>

      <section className="flex min-h-0 flex-col rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/30">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Waveform</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {waveformEnabled ? (isWaveformLoading ? '加载中' : '已显示') : '未加载'}
          </p>
        </div>

        <div ref={waveformContainerRef} className="relative flex min-h-[240px] flex-1 items-center rounded-lg border border-zinc-200 bg-white px-3 py-4 dark:border-zinc-800 dark:bg-zinc-950/70">
          {!waveformEnabled ? <div className="w-full text-center text-sm text-zinc-500 dark:text-zinc-400">点击上方“加载波形”后在这里展示</div> : null}
          {waveformEnabled && audioElement ? (
            <div className="w-full">
              <WavesurferPlayer
                key={src}
                media={audioElement}
                fetchParams={fetchParams}
                height={waveformHeight}
                barWidth={2}
                barGap={2}
                barRadius={2}
                dragToSeek
                normalize
                waveColor="hsl(var(--muted-foreground) / 0.35)"
                progressColor="hsl(var(--foreground))"
                cursorColor="hsl(var(--foreground))"
                onReady={() => {
                  setWaveformReady(true);
                  setLoadError(null);
                }}
                onDecode={() => {
                  setWaveformReady(true);
                }}
                onError={(_instance, error) => {
                  const message = error instanceof Error ? error.message : String(error);
                  setLoadError(message || 'Failed to load audio waveform.');
                }}
              />
            </div>
          ) : null}
          {isWaveformLoading ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-white/80 text-xs text-zinc-600 dark:bg-zinc-950/80 dark:text-zinc-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载波形...
            </div>
          ) : null}
        </div>
      </section>

      {loadError ? <p className="text-xs text-destructive">{loadError}</p> : null}
    </div>
  );
}
