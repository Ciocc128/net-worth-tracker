import {
  LayoutDashboard,
  Wallet,
  ArrowRightLeft,
  BarChart3,
  PieChart,
  TrendingUp,
  CalendarRange,
  Trophy,
  Flame,
  Target,
  PiggyBank,
  Bot,
} from 'lucide-react';

export type NavItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

// Primary routes — shown in Sidebar (top group) and BottomNavigation main tabs.
export const primaryNav: NavItem[] = [
  { name: 'Panoramica', href: '/dashboard',          icon: LayoutDashboard },
  { name: 'Patrimonio', href: '/dashboard/assets',   icon: Wallet          },
  { name: 'Cashflow',   href: '/dashboard/cashflow', icon: ArrowRightLeft  },
];

// Menu groups by object (RU1, doc/riordino-ui/README.md § 5.3) — THE one source of the groups: Sidebar,
// SecondaryMenuDrawer and the shell's band (ShellBand) read it. `null` label = a loose route.
// Hall of Fame stays a page of STORIA next to Storico (D-RU33).
export type NavGroup = { label: string | null; items: NavItem[] };

const panoramica = primaryNav[0];
const patrimonio = primaryNav[1];
const cashflow = primaryNav[2];

/** The Traguardi page's entry (RU11, D-RU29): an account switch decides whether the menu shows it, not a view area. */
export const GOALS_NAV_ITEM: NavItem = { name: 'Traguardi', href: '/dashboard/traguardi', icon: Target };

export const navGroups: NavGroup[] = [
  { label: null, items: [panoramica] },
  {
    label: 'Entrate e spese',
    items: [
      cashflow,
      { name: 'Analisi spese', href: '/dashboard/analisi', icon: BarChart3 },
    ],
  },
  {
    label: 'Investimenti',
    items: [
      patrimonio,
      // Allocazione is a rebalancing tool (action chips), not a read-only stat view.
      { name: 'Allocazione', href: '/dashboard/allocation', icon: PieChart },
      { name: 'Rendimenti', href: '/dashboard/performance', icon: TrendingUp },
    ],
  },
  {
    label: 'Futuro',
    items: [
      { name: 'FIRE', href: '/dashboard/fire-simulations', icon: Flame },
      // Only with «Traguardi di investimento» on (D-RU29): `navGroups` is the whole list, `resolveNavGroups` filters it.
      GOALS_NAV_ITEM,
      { name: 'Previdenza', href: '/dashboard/pension', icon: PiggyBank },
    ],
  },
  {
    label: 'Storia',
    items: [
      { name: 'Storico', href: '/dashboard/history', icon: CalendarRange },
      { name: 'Hall of Fame', href: '/dashboard/hall-of-fame', icon: Trophy },
    ],
  },
];

/** The routes of every group (the assistant and Impostazioni aside). */
export const groupedNav: NavItem[] = navGroups.flatMap((g) => g.items);

// The AI assistant — a plain route after the groups in Sidebar and
// SecondaryMenuDrawer (no banner: the chrome stays achromatic). Gated at render by
// NEXT_PUBLIC_ASSISTANT_AI_ENABLED, which is why it is not part of a group array.
export const assistantNavItem: NavItem = {
  name: 'Assistente AI',
  href: '/dashboard/assistant',
  icon: Bot,
};

// All secondary hrefs — used by BottomNavigation to determine "Altro" active state.
export const secondaryHrefs: string[] = [
  ...groupedNav.map((i) => i.href).filter((href) => !primaryNav.some((p) => p.href === href)),
  assistantNavItem.href,
  '/dashboard/settings',
];

/**
 * Where the band of the shell is on screen (doc/fascia-desktop/README.md, D-FD16): the groups, the page tabs, the
 * page's fact and actions at the top of every dashboard page. The same condition as Tailwind's `band:` in
 * globals.css (held by __tests__/desktopQuery.test.ts). Wider than `desktop:` on purpose: a 1440 screen zoomed to
 * 125% (1152 CSS px) or 150% (960) with a mouse keeps the same band; a phone turned sideways (≤ 932, touch) does not.
 */
export const BAND_QUERY = '(width >= 1440px) or ((width >= 960px) and (pointer: fine)) or ((orientation: landscape) and (width >= 1000px))';

/**
 * Where the phone's bottom pill is on screen: in portrait, below the band (`band:hidden
 * max-desktop:landscape:hidden` on its container, BottomNavigation.tsx). Kept in step with those
 * classes — change one, change the other. Also where a navigation is the soft scene, not a view
 * transition (`useSceneNavigation`).
 */
export const PILL_VISIBLE_QUERY = `(orientation: portrait) and (not (${BAND_QUERY}))`;
