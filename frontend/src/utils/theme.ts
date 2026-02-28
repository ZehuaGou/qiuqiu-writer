export interface ThemeConfig {
  id: string;
  name: string;
  previewGradient: string;
  previewAccent: string;
  previewText: string;
}

export const themes: ThemeConfig[] = [
  {
    id: 'dark',
    name: '深色',
    previewGradient: 'linear-gradient(135deg, #0c1630 0%, #06091a 100%)',
    previewAccent: '#3b82f6',
    previewText: '#e2e8f0',
  },
  {
    id: 'light',
    name: '浅色',
    previewGradient: 'linear-gradient(135deg, #eef2ff 0%, #e0eaff 100%)',
    previewAccent: '#2563eb',
    previewText: '#0f172a',
  },
];

const THEME_STORAGE_KEY = 'planetwriter_theme';

export function getCurrentTheme(): string {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

export function applyTheme(themeId: string): void {
  const id = themeId === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', id);
  localStorage.setItem(THEME_STORAGE_KEY, id);
}

export function initTheme(): void {
  applyTheme(getCurrentTheme());
}
