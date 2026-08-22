import { cn } from '@/lib/utils';

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  /**
   * `default` (1600px) is the width of the pages not yet redesigned. `wide` (1920px) is the
   * Tile Grid's: a bento of tiles uses width, and at 1600 a 27" monitor left a third of the
   * main area empty on both sides (DESIGN.md → The Tile Grid Rule).
   */
  width?: 'default' | 'wide';
}

export function PageContainer({ children, className, width = 'default' }: PageContainerProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full space-y-4 desktop:space-y-4 max-desktop:portrait:pb-20',
        width === 'wide' ? 'max-w-[1920px]' : 'max-w-[1600px]',
        className,
      )}
    >
      {children}
    </div>
  );
}
