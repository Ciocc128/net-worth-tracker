/**
 * Curated subset of Lucide icons for expense categories.
 * Keys are exact Lucide component names (used for dynamic lookup).
 * Values are Italian display labels for accessibility (aria-label).
 *
 * IMPORTANT: If you add an icon here, verify the name matches an export in
 * the installed version of lucide-react.
 */
export const CATEGORY_ICONS: Record<string, string> = {
  // Food & drink
  UtensilsCrossed: 'Ristorante',
  Coffee: 'Caffè',
  ShoppingBasket: 'Spesa alimentare',
  Pizza: 'Pizza',
  Wine: 'Vino / Bar',

  // Home
  Home: 'Casa',
  Lightbulb: 'Utenze',
  Wifi: 'Internet',
  Tv: 'TV / Streaming',
  Wrench: 'Riparazioni',
  Sofa: 'Arredamento',
  Plug: 'Elettricità',
  Droplets: 'Acqua',
  Flame: 'Gas',

  // Transport
  Car: 'Automobile',
  Bus: 'Trasporto pubblico',
  Train: 'Treno',
  Plane: 'Aereo / Viaggi',
  Fuel: 'Carburante',
  ParkingSquare: 'Parcheggio',
  Bike: 'Bicicletta',

  // Health
  HeartPulse: 'Salute',
  Stethoscope: 'Medico',
  Pill: 'Farmaci',
  Dumbbell: 'Palestra',
  Activity: 'Sport',

  // Entertainment & leisure
  Music: 'Musica',
  Gamepad2: 'Videogiochi',
  Clapperboard: 'Cinema',
  BookOpen: 'Libri',
  Camera: 'Fotografia',
  Ticket: 'Eventi',
  Theater: 'Teatro',

  // Shopping & personal
  ShoppingCart: 'Shopping',
  Shirt: 'Abbigliamento',
  Scissors: 'Cura personale',
  Gem: 'Gioielli',
  Package: 'Acquisti online',

  // Finance & work
  Banknote: 'Contanti',
  CreditCard: 'Carte di credito',
  TrendingUp: 'Investimenti',
  PiggyBank: 'Risparmio',
  Briefcase: 'Lavoro',
  Building2: 'Azienda',
  GraduationCap: 'Formazione',
  Laptop: 'Tecnologia',

  // Family & kids
  Baby: 'Bambini',
  Dog: 'Animali domestici',
  Users: 'Famiglia',
  Gift: 'Regali',
  PartyPopper: 'Feste',

  // Income
  DollarSign: 'Entrate',
  Wallet: 'Portafoglio',
  Landmark: 'Banca',

  // Misc
  Tag: 'Generico',
  Star: 'Preferito',
  AlertCircle: 'Importante',
  Archive: 'Archivio',
  Globe: 'Internazionale',
  Smartphone: 'Telefono',
  Mail: 'Abbonamenti',
  Key: 'Affitto',
  Hammer: 'Lavori',
  Leaf: 'Natura',
};

/** Ordered list of icon names for rendering the picker grid. */
export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS);
