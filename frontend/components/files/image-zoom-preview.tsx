'use client';

import { Minus, Plus, RotateCcw } from 'lucide-react';
import Image from 'next/image';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ImageZoomPreviewProps = {
  src: string;
  alt: string;
  className?: string;
  zoomInLabel: string;
  zoomOutLabel: string;
  zoomResetLabel: string;
};

export function ImageZoomPreview({ src, alt, className, zoomInLabel, zoomOutLabel, zoomResetLabel }: ImageZoomPreviewProps) {
  return (
    <TransformWrapper
      key={src}
      initialScale={1}
      minScale={0.5}
      maxScale={8}
      centerOnInit
      limitToBounds={false}
      wheel={{ step: 0.12 }}
      pinch={{ step: 5 }}
      doubleClick={{ mode: 'zoomIn', step: 1.25 }}
      panning={{ velocityDisabled: true }}
    >
      {({ zoomIn, zoomOut, resetTransform }) => (
        <div className={cn('relative h-full min-h-[260px] w-full overflow-hidden rounded-md border border-border bg-background', className)}>
          <div className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-md border border-border bg-background/95 p-1 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => zoomIn(0.25)}
              aria-label={zoomInLabel}
              title={zoomInLabel}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => zoomOut(0.25)}
              aria-label={zoomOutLabel}
              title={zoomOutLabel}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => resetTransform(160)}
              aria-label={zoomResetLabel}
              title={zoomResetLabel}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          <TransformComponent
            wrapperClass="!h-full !w-full"
            contentClass="!h-full !w-full flex items-center justify-center"
            wrapperStyle={{ touchAction: 'none' }}
          >
            <Image
              src={src}
              alt={alt}
              width={1920}
              height={1080}
              unoptimized
              className="max-h-[68vh] max-w-full select-none object-contain"
              draggable={false}
            />
          </TransformComponent>
        </div>
      )}
    </TransformWrapper>
  );
}
