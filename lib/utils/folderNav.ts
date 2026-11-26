import { assistantNavItem, navGroups, type NavGroup, type NavItem } from '@/lib/constants/navigation';
import { isNavItemActive } from '@/lib/utils/navUtils';
import { groupViewAreas, type ViewNavGroup, type ViewNavItem } from '@/lib/utils/viewAreas';

/**
 * The folder row of the desktop shell (doc/fascia-desktop/README.md): one folder per group of `navGroups`
 * plus the Assistente. Pure helpers — what a folder is called, which one is open, where it opens (D-FD11).
 */
export type Folder = {
  /** Stable key: the first page's href. */
  key: string;
  /** The tab's words: the group's label, or the loose page's own name (Panoramica, Assistente AI). */
  label: string;
  /** The first page's icon. */
  icon: NavItem['icon'];
  /** The group's pages in order (one for a loose route). */
  items: NavItem[];
  /**
   * The areas the folder hides with before hydration (`data-view-area`, doc/essenziale/README.md D-ES15): set only
   * when every page of the group belongs to an area.
   */
  viewArea?: string;
};

const toFolder = (group: NavGroup | ViewNavGroup): Folder => ({
  // The key is the group's FIRST page in `navGroups`, so it stays the same when the view hides that page.
  key: (navGroups.find((g) => g.label !== null && g.label === group.label) ?? group).items[0].href,
  label: group.label ?? group.items[0].name,
  icon: group.items[0].icon,
  items: group.items,
  viewArea: groupViewAreas(group)?.join(' '),
});

/**
 * The folders in order; the Assistente is the last, shown at the right end by the row. `groups` are the view's
 * (`useViewNavGroups`, doc/essenziale/README.md § 5.4); `navGroups` whole by default.
 */
export function buildFolders(showAssistant: boolean, groups: readonly (NavGroup | ViewNavGroup)[] = navGroups): Folder[] {
  const folders = groups.map(toFolder);
  if (showAssistant) folders.push(toFolder({ label: null, items: [assistantNavItem] }));
  return folders;
}

/** The folder whose page the pathname is on; `undefined` on a page outside the groups (Impostazioni). */
export function findOpenFolder(folders: Folder[], pathname: string): Folder | undefined {
  return folders.find((folder) => folder.items.some((item) => isNavItemActive(item.href, pathname)));
}

/** The page of the open folder the pathname is on. */
export function findOpenPage(folder: Folder, pathname: string): NavItem | undefined {
  return folder.items.find((item) => isNavItemActive(item.href, pathname));
}

const STORAGE_PREFIX = 'nwt:folder-last:';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const listeners = new Set<() => void>();

/** For `useSyncExternalStore`: called when a folder's remembered page changes. */
export function subscribeFolderMemory(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Remembers `href` as the page the reader last opened in `folder` (tab session). Never throws. */
export function rememberFolderPage(folder: Folder, href: string, storage?: StorageLike): void {
  try {
    (storage ?? window.sessionStorage).setItem(STORAGE_PREFIX + folder.key, href);
  } catch {
    // Storage blocked: a folder then opens on its first page.
  }
  listeners.forEach((listener) => listener());
}

/**
 * Where a folder opens (D-FD11): the page the reader last opened in it during this tab session, if it is
 * still one of the folder's pages, the first page otherwise.
 */
export function folderTarget(folder: Folder, storage?: StorageLike): string {
  try {
    const stored = (storage ?? window.sessionStorage).getItem(STORAGE_PREFIX + folder.key);
    if (stored && folder.items.some((item) => item.href === stored)) return stored;
  } catch {
    // Storage blocked or none (server): the first page.
  }
  return folder.items[0].href;
}

export type BandPage = { href: string; name: string; viewArea?: string };

/** The pages outside the groups, each its own single tab on the band's edge (D-FD14). */
const LOOSE_PAGES: BandPage[] = [{ href: '/dashboard/settings', name: 'Impostazioni' }];

/**
 * The tabs on the band's bottom edge (D-FD14, D-FD19): the open group's pages by their `navGroups` names — the ONE
 * source, so «Analisi spese» is the same word in the menu, on the band and in the tab — or, on a page outside the
 * groups (Impostazioni), that page alone. Nothing on a route neither knows.
 */
export function bandPages(openFolder: Folder | undefined, pathname: string): BandPage[] {
  if (openFolder) {
    return openFolder.items.map((item) => {
      const viewArea = (item as ViewNavItem).viewArea;
      return viewArea ? { href: item.href, name: item.name, viewArea } : { href: item.href, name: item.name };
    });
  }
  return LOOSE_PAGES.filter((page) => isNavItemActive(page.href, pathname));
}
