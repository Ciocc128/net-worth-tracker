import { cn } from '@/lib/utils';
import { TILE_EYEBROW_CLASS } from '@/components/ui/tile';

interface PageHeaderProps {
  title: React.ReactNode;
  label?: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  /**
   * Show a border-b separator after the description. Only the `legacy` variant draws one;
   * pass false when PageTabs follows — the tab bar's underline provides the separation.
   */
  separator?: boolean;
  /**
   * `compact` (the default since the shell redesign) collapses the desktop header to ONE line —
   * eyebrow · title · description, actions on the right, no separator — because on a redesigned
   * page the real headline is the verdict in the content. The eyebrow is the tiles' eyebrow
   * (10px, 0.1em) so the page has a single eyebrow voice. The mobile sticky navbar is the same
   * in both variants: one block, and its title is what the user anchors to while scrolling.
   *
   * `legacy` is the pre-redesign desktop header (2xl/3xl title, description under it, optional
   * separator), kept byte-for-byte for the pages not yet propagated; it goes away with the last
   * of them.
   */
  variant?: 'compact' | 'legacy';
}

export function PageHeader({
  title,
  label,
  description,
  actions,
  className,
  separator = true,
  variant = 'compact',
}: PageHeaderProps) {
  return (
    <div className={cn(!separator && '-mb-0', className)}>
      {/* Mobile sticky navbar — title + description in one block so the header
          feels like a unified navbar. When separator=false the negative bottom
          margin eats the parent space-y gap, making the tab bar flush. */}
      <div
        className={cn(
          'sticky top-0 z-20 -mx-4 px-4 pt-1 pb-2 flex flex-col bg-background/95 backdrop-blur-sm desktop:hidden',
          separator && variant === 'legacy' && 'border-b border-border pb-3',
        )}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-[17px] font-semibold tracking-tight truncate min-w-0">{title}</h1>
          {actions && (
            <div className="flex shrink-0 items-center gap-1.5 ml-2">{actions}</div>
          )}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground leading-tight">{description}</p>
        )}
      </div>

      {variant === 'compact' ? (
        <div className="hidden desktop:flex items-center justify-between gap-4 min-h-9">
          <div className="flex items-baseline gap-3 min-w-0">
            {label && <p className={cn(TILE_EYEBROW_CLASS, 'shrink-0')}>{label}</p>}
            <h1 className="text-sm text-muted-foreground truncate">
              <span className="font-medium text-foreground">{title}</span>
              {description && <span> · {description}</span>}
            </h1>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      ) : (
        <div
          className={cn(
            'hidden desktop:block',
            separator && 'pb-4 border-b border-border',
          )}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              {label && (
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-1">
                  {label}
                </p>
              )}
              <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{title}</h1>
              {description && <p className="mt-1 text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
