'use client';

import { useAppPreferences } from '@/hooks/use-app-preferences';
import { cn } from '@/lib/utils';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

function buildItems(page: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const clamped = Array.from(pages)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);

  const result: Array<number | 'ellipsis'> = [];
  for (let i = 0; i < clamped.length; i += 1) {
    const current = clamped[i];
    const prev = clamped[i - 1];
    if (i > 0 && current - prev > 1) {
      result.push('ellipsis');
    }
    result.push(current);
  }
  return result;
}

export function PaginationNav({
  page,
  totalPages,
  onPageChange,
  canPrev = page > 1,
  canNext = page < totalPages,
  className,
}: {
  page: number;
  totalPages: number;
  onPageChange: (nextPage: number) => void;
  canPrev?: boolean;
  canNext?: boolean;
  className?: string;
}) {
  const { t } = useAppPreferences();
  const items = buildItems(page, totalPages);

  return (
    <Pagination className={cn('justify-end', className)}>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            label={t('pagination.previous')}
            onClick={(event) => {
              event.preventDefault();
              if (!canPrev) return;
              onPageChange(page - 1);
            }}
            className={!canPrev ? 'pointer-events-none opacity-50' : ''}
          />
        </PaginationItem>

        {items.map((item, index) => (
          <PaginationItem key={`${item}-${index}`}>
            {item === 'ellipsis' ? (
              <PaginationEllipsis />
            ) : (
              <PaginationLink
                href="#"
                isActive={item === page}
                onClick={(event) => {
                  event.preventDefault();
                  onPageChange(item);
                }}
              >
                {item}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}

        <PaginationItem>
          <PaginationNext
            href="#"
            label={t('pagination.next')}
            onClick={(event) => {
              event.preventDefault();
              if (!canNext) return;
              onPageChange(page + 1);
            }}
            className={!canNext ? 'pointer-events-none opacity-50' : ''}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
