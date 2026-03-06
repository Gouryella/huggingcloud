import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';

import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

const Pagination = ({ className, ...props }: React.ComponentProps<'nav'>) => (
  <nav
    role="navigation"
    aria-label="pagination"
    className={cn('flex items-center justify-center', className)}
    {...props}
  />
);
Pagination.displayName = 'Pagination';

const PaginationContent = React.forwardRef<HTMLUListElement, React.ComponentProps<'ul'>>(({ className, ...props }, ref) => (
  <ul ref={ref} className={cn('flex flex-row items-center gap-1', className)} {...props} />
));
PaginationContent.displayName = 'PaginationContent';

const PaginationItem = React.forwardRef<HTMLLIElement, React.ComponentProps<'li'>>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn('', className)} {...props} />
));
PaginationItem.displayName = 'PaginationItem';

type PaginationLinkProps = {
  isActive?: boolean;
} & Pick<React.ComponentProps<typeof Link>, 'href' | 'onClick' | 'className'> &
  React.AnchorHTMLAttributes<HTMLAnchorElement>;

const PaginationLink = ({ className, isActive, ...props }: PaginationLinkProps) => (
  <Link
    aria-current={isActive ? 'page' : undefined}
    className={cn(
      buttonVariants({
        variant: isActive ? 'default' : 'outline',
        size: 'sm',
      }),
      'h-9 min-w-9 px-3',
      className,
    )}
    {...props}
  />
);
PaginationLink.displayName = 'PaginationLink';

const PaginationPrevious = ({ className, label, ...props }: React.ComponentProps<typeof PaginationLink> & { label?: string }) => (
  <PaginationLink aria-label="Go to previous page" className={cn('gap-1 pl-2.5', className)} {...props}>
    <ChevronLeft className="h-4 w-4" />
    <span className="hidden sm:inline">{label || 'Previous'}</span>
  </PaginationLink>
);
PaginationPrevious.displayName = 'PaginationPrevious';

const PaginationNext = ({ className, label, ...props }: React.ComponentProps<typeof PaginationLink> & { label?: string }) => (
  <PaginationLink aria-label="Go to next page" className={cn('gap-1 pr-2.5', className)} {...props}>
    <span className="hidden sm:inline">{label || 'Next'}</span>
    <ChevronRight className="h-4 w-4" />
  </PaginationLink>
);
PaginationNext.displayName = 'PaginationNext';

const PaginationEllipsis = ({ className, ...props }: React.ComponentProps<'span'>) => (
  <span aria-hidden className={cn('flex h-9 w-9 items-center justify-center', className)} {...props}>
    <MoreHorizontal className="h-4 w-4" />
    <span className="sr-only">More pages</span>
  </span>
);
PaginationEllipsis.displayName = 'PaginationEllipsis';

export {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
};
