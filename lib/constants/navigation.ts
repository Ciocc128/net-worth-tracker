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
// SecondaryMenuDrawer and the desktop folder row (FolderNav) read it. `null` label = a loose route.
// Traguardi and Hall of Fame as a Storico tab are wave 3: Hall of Fame still sits alone under STORIA.
export type NavGroup = { label: string | null; items: NavItem[] };

const panoramica = primaryNav[0];
const patrimonio = primaryNav[1];
const cashflow = primaryNav[2];

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
      { name: 'FIRE e Simulazioni', href: '/dashboard/fire-simulations', icon: Flame },
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
 * Where the phone's bottom pill is on screen: the complement of `desktop:hidden
 * max-desktop:landscape:hidden` on its container (BottomNavigation.tsx). Kept in step with those
 * classes — change one, change the other. Also where a navigation is the soft scene, not a view
 * transition (`useSceneNavigation`).
 */
export const PILL_VISIBLE_QUERY =
  '(width < 1440px) and (not ((width >= 1280px) and (pointer: fine))) and (orientation: portrait)';
