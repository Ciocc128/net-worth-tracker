import { deleteField, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { ColorTheme } from '@/lib/constants/colorTheme';
import type { TopBandChoices } from '@/lib/constants/topBand';
import type { ViewPreset } from '@/lib/constants/viewAreas';
import type { ViewAreaOverrides } from '@/lib/utils/viewAreas';

const COLLECTION = 'userPreferences';

// The union is derived from `COLOR_THEMES` in lib/constants/colorTheme.ts, the list the
// pre-hydration script also accepts; re-exported so the consumers of this service keep their import.
export type { ColorTheme };

export interface UserPreferences {
  colorTheme?: ColorTheme;
  /** The phone's top band, one choice per theme (doc/fascia/README.md; fork only). */
  topBand?: TopBandChoices;
  /**
   * The «Essenziale · Completa» view (doc/essenziale/README.md § 5.2): absent = Completa. Written `essenziale` by the
   * first admission in production (`/api/auth/activate`, `npm run users:allow`), never by a migration.
   */
  viewPreset?: ViewPreset;
  /** The areas the viewer changed against the preset («Personalizzata» when one differs). */
  viewAreaOverrides?: ViewAreaOverrides;
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const ref = doc(db, COLLECTION, userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return {};
  return snap.data() as UserPreferences;
}

export async function setUserPreferences(
  userId: string,
  prefs: Partial<UserPreferences>
): Promise<void> {
  const ref = doc(db, COLLECTION, userId);
  await setDoc(ref, prefs, { merge: true });
}

/**
 * Writes the view: a preset chosen whole clears the overrides (`deleteField`, § 5.2), an area flipped writes the
 * overrides map whole (it replaces the stored one, so an area switched back to the preset's value leaves it).
 */
export async function setViewPreferences(
  userId: string,
  view: { viewPreset: ViewPreset; viewAreaOverrides: ViewAreaOverrides },
): Promise<void> {
  const ref = doc(db, COLLECTION, userId);
  const overrides = Object.keys(view.viewAreaOverrides).length > 0 ? view.viewAreaOverrides : deleteField();
  // `merge` keeps the theme and the band; the overrides field is replaced as a whole by `mergeFields`.
  await setDoc(ref, { viewPreset: view.viewPreset, viewAreaOverrides: overrides }, { mergeFields: ['viewPreset', 'viewAreaOverrides'] });
}
