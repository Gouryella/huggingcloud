'use client';

import { Check } from 'lucide-react';

import { useAppPreferences } from '@/hooks/use-app-preferences';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export function PageSizeSelect({
  value,
  options,
  onChange,
}: {
  value: number;
  options: number[];
  onChange: (nextValue: number) => void;
}) {
  const { t } = useAppPreferences();

  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{t('pagination.per')}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="min-w-12 border-border bg-card px-3 hover:bg-muted">
            {value}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="border-border bg-popover">
          <DropdownMenuLabel>{t('pagination.rowsPerPage')}</DropdownMenuLabel>
          {options.map((option) => (
            <DropdownMenuItem
              key={option}
              onSelect={() => {
                onChange(option);
              }}
              className="flex items-center justify-between gap-3"
            >
              <span>{option}</span>
              {option === value ? <Check className="h-4 w-4 text-foreground" /> : <span className="h-4 w-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
