/**
 * What each lazy tab of Impostazioni draws until its chunk has arrived (RU9, P6, D-RU23): the
 * geometry of the tiles the tab will have, so the content replaces it without a jump. Account is in
 * the page's initial JavaScript and needs none; the skeleton of the page's first read is the page's own.
 * Types only here: it must stay free of the tabs' code (AGENTS.md § Dynamic Imports and Module Hygiene).
 */
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';

export const FUNZIONI_SKELETON_CELLS: TileSkeletonCell[] = [{ span: 12, lines: 8 }];

export const CASHFLOW_SETTINGS_SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 12, lines: 8 },
  { span: 6, lines: 5 },
  { span: 6, lines: 5 },
  { span: 6, lines: 5 },
  { span: 6, lines: 5 },
  { span: 12, lines: 5 },
];

export const INVESTIMENTI_SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 6, lines: 8 },
  { span: 6, lines: 6 },
  { span: 6, lines: 3 },
];

export const AVANZATE_SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 12, lines: 8 },
  { span: 12, lines: 8 },
  { span: 12, lines: 5 },
];
