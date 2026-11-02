/**
 * The colour theme constants and the pre-hydration script `app/layout.tsx` inlines in <head>
 * (since 2026-09-28): the script is a string, so it is run here in a bare VM with a fake `localStorage` and
 * `document` — what it does before any module loads is what these cases pin.
 */
import { describe, it, expect, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import {
  BASE_COLOR_THEME,
  COLOR_THEMES,
  COLOR_THEME_ATTRIBUTE,
  COLOR_THEME_INIT_SCRIPT,
  COLOR_THEME_STORAGE_KEY,
  DEFAULT_COLOR_THEME,
  isColorTheme,
} from '@/lib/constants/colorTheme';

/** Runs the inline script against a storage that answers `stored`, and returns what it set. */
function runInitScript(stored: string | null | (() => never)) {
  const setAttribute = vi.fn();
  const localStorage = {
    getItem: vi.fn((key: string) => {
      if (typeof stored === 'function') stored();
      return key === COLOR_THEME_STORAGE_KEY ? stored : null;
    }),
  };
  runInNewContext(COLOR_THEME_INIT_SCRIPT, { localStorage, document: { documentElement: { setAttribute } } });
  return { setAttribute, getItem: localStorage.getItem };
}

describe('colour theme constants', () => {
  it('should accept every listed theme and nothing else', () => {
    for (const theme of COLOR_THEMES) expect(isColorTheme(theme)).toBe(true);
    expect(isColorTheme('sepia')).toBe(false);
    expect(isColorTheme(null)).toBe(false);
    expect(COLOR_THEMES).toContain(DEFAULT_COLOR_THEME);
    expect(COLOR_THEMES).toContain(BASE_COLOR_THEME);
  });

  it('should make Lime Frost the fork default and leave «Default» as the :root block (2026-11-02)', () => {
    expect(DEFAULT_COLOR_THEME).toBe('lime-frost');
    expect(BASE_COLOR_THEME).toBe('default');
    expect(COLOR_THEMES).toContain('graphite');
  });
});

describe('COLOR_THEME_INIT_SCRIPT', () => {
  it('should put a stored non-default theme on the root element', () => {
    const { setAttribute } = runInitScript('cyberpunk');

    expect(setAttribute).toHaveBeenCalledWith(COLOR_THEME_ATTRIBUTE, 'cyberpunk');
  });

  it('should set nothing for a stored «Default», which is the :root block', () => {
    expect(runInitScript(BASE_COLOR_THEME).setAttribute).not.toHaveBeenCalled();
  });

  it('should put the fork default on the root element when nothing is stored', () => {
    expect(runInitScript(null).setAttribute).toHaveBeenCalledWith(COLOR_THEME_ATTRIBUTE, DEFAULT_COLOR_THEME);
  });

  it('should refuse a stored value that is not a theme name, and paint the fork default instead', () => {
    expect(runInitScript('sepia').setAttribute).toHaveBeenCalledWith(COLOR_THEME_ATTRIBUTE, DEFAULT_COLOR_THEME);
    expect(runInitScript('cyberpunk;x').setAttribute).toHaveBeenCalledWith(COLOR_THEME_ATTRIBUTE, DEFAULT_COLOR_THEME);
  });

  it('should read its own key only', () => {
    const { getItem } = runInitScript('cyberpunk');

    expect(getItem).toHaveBeenCalledTimes(1);
    expect(getItem).toHaveBeenCalledWith(COLOR_THEME_STORAGE_KEY);
  });

  it('should swallow a storage that throws instead of failing the page', () => {
    const throwing = () => {
      throw new Error('SecurityError');
    };

    expect(() => runInitScript(throwing)).not.toThrow();
    expect(runInitScript(throwing).setAttribute).toHaveBeenCalledWith(COLOR_THEME_ATTRIBUTE, DEFAULT_COLOR_THEME);
  });
});
