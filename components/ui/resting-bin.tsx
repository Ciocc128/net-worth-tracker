import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A row's bin: grey at rest, red on hover and on focus (RU6 on Strumenti, UM4 P15 everywhere else; DESIGN.md →
 * The Resting-Bin Rule). A page full of rows must not read as a page full of warnings: the red belongs to the
 * moment the reader reaches for the delete. The button around it takes `group` — the colour follows the
 * BUTTON's hover and focus, not the icon's, so the whole 44px target turns red.
 */
export function RestingBin({ className }: Readonly<{ className?: string }>) {
  return (
    <Trash2
      className={cn(
        'h-4 w-4 text-muted-foreground group-hover:text-destructive group-focus-visible:text-destructive',
        className,
      )}
      aria-hidden="true"
    />
  );
}
