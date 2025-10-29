import { Injectable } from '@angular/core';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'sdk_theme_v1';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private _theme: Theme = 'light';

  constructor() {
    // Prefer saved theme; otherwise use system preference on first load.
    const saved = (localStorage.getItem(STORAGE_KEY) as Theme) || null;
    if (saved === 'light' || saved === 'dark') {
      this.setTheme(saved, false);
    } else {
      const prefersDark =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      this.setTheme(prefersDark ? 'dark' : 'light', false);
    }
  }

  theme(): Theme {
    return this._theme;
  }

  isDark(): boolean {
    return this._theme === 'dark';
  }

  setTheme(next: Theme, persist = true) {
    this._theme = next;

    const html = document.documentElement;
    if (next === 'dark') html.classList.add('dark');
    else html.classList.remove('dark');

    // Reflect to CSS color-scheme so form controls render correctly
    document.body.style.colorScheme = next;

    // Optional: keep the browser UI in sync (mobile address bar, etc.)
    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (meta) {
      // Uses current surface variable if available, otherwise a safe fallback.
      const surface = getComputedStyle(document.documentElement)
        .getPropertyValue('--mat-sys-surface').trim();
      meta.content = surface || (next === 'dark' ? '#0b1324' : '#ffffff');
    }

    if (persist) localStorage.setItem(STORAGE_KEY, next);
  }

  toggle() {
    this.setTheme(this.isDark() ? 'light' : 'dark');
  }
}
