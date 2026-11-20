'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { SceneLink } from '@/components/layout/SceneLink';
import { cn } from '@/lib/utils';
import {
  buildFolders,
  findOpenFolder,
  findOpenPage,
  folderTarget,
  rememberFolderPage,
  subscribeFolderMemory,
  type Folder,
} from '@/lib/utils/folderNav';

/**
 * The navigation of the desktop and of a tablet in landscape (doc/fascia-desktop/README.md, D-FD1…D-FD11): a row of
 * folder tabs, one per group of `navGroups`, the Assistente at the right end. The open folder is the only
 * coloured one — it takes the band's colour (`--folder-fill`) and joins the band under it through two inverted
 * corners; the closed ones are a tint of it. Lime Frost and Graphite colour it, every other theme draws the same
 * shape in neutral (D-FD7). Shown by CSS alone (`desktop:` / `tablet-landscape:`), so the prerendered shell paints
 * it before hydration. A `nav` of links, not a tablist: each folder is a route.
 *
 * On touch (the tablet) the folders are 44px closed and 50px open, so every target is at least 44px.
 */
export function FolderNav() {
  const pathname = usePathname() ?? '';
  const showAssistant = process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED !== 'false';
  const folders = useMemo(() => buildFolders(showAssistant), [showAssistant]);
  const openFolder = findOpenFolder(folders, pathname);
  const openPage = openFolder ? findOpenPage(openFolder, pathname) : undefined;

  // The folders open on the page last read in them (D-FD11). The server has no storage: its snapshot (and the
  // hydration's) is every folder's first page, and the store corrects it once mounted.
  const targetsKey = useSyncExternalStore(
    subscribeFolderMemory,
    () => folders.map((folder) => folderTarget(folder)).join('|'),
    () => folders.map((folder) => folder.items[0].href).join('|'),
  );
  const targets = useMemo(() => Object.fromEntries(targetsKey.split('|').map((href, index) => [folders[index].key, href])), [targetsKey, folders]);
  useEffect(() => {
    if (openFolder && openPage) rememberFolderPage(openFolder, openPage.href);
  }, [openFolder, openPage]);

  const main = folders.filter((folder) => !isAssistant(folder));
  const assistant = folders.find(isAssistant);

  return (
    <nav
      aria-label="Navigazione principale"
      data-nav="folders"
      className="folder-nav relative z-30 hidden shrink-0 items-end gap-[3px] bg-background px-5 pt-2.5 desktop:flex tablet-landscape:flex tablet-landscape:px-4"
    >
      <SceneLink
        href="/dashboard"
        className="mr-4 mb-2.5 shrink-0 rounded-md px-1 text-[13px] font-semibold tracking-[-0.01em] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring tablet-landscape:mb-3"
      >
        Portfolio Tracker
      </SceneLink>
      {main.map((folder) => (
        <FolderTab key={folder.key} folder={folder} href={targets[folder.key] ?? folder.items[0].href} open={folder === openFolder} openPage={folder === openFolder ? openPage?.href : undefined} />
      ))}
      {assistant && (
        <div className="ml-auto flex items-end">
          <FolderTab folder={assistant} href={targets[assistant.key] ?? assistant.items[0].href} open={assistant === openFolder} openPage={assistant === openFolder ? openPage?.href : undefined} />
        </div>
      )}
    </nav>
  );
}

const isAssistant = (folder: Folder) => folder.key === '/dashboard/assistant';

function FolderTab({ folder, href, open, openPage }: { folder: Folder; href: string; open: boolean; openPage?: string }) {
  const Icon = folder.icon;
  // `aria-current="page"` when the link's own page is the open one; the folder holding another page of the
  // group says it is the current section by `true` (the band names the page).
  const current = open ? (openPage === href ? 'page' : 'true') : undefined;
  return (
    <SceneLink
      href={href}
      aria-current={current}
      data-folder={open ? 'open' : 'closed'}
      className={cn(
        'folder-tab relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-[11px] px-[11px] text-[13.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        open
          ? 'folder-tab-open z-10 h-[42px] bg-[var(--folder-fill)] font-semibold text-[var(--folder-ink)] tablet-landscape:h-[50px]'
          : 'h-9 border border-b-0 border-[var(--folder-closed-border)] bg-[var(--folder-closed-bg)] text-[var(--folder-closed-ink)] hover:text-foreground tablet-landscape:h-11',
      )}
    >
      <Icon className="size-[15px] shrink-0" aria-hidden="true" />
      <span>{folder.label}</span>
    </SceneLink>
  );
}
