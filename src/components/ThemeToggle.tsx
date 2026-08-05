'use client';
import { useEffect, useState } from 'react';
import { Button } from './ui';
type Theme = 'light' | 'dark' | 'system';
const KEY = 'meal-planner:theme';
function apply(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches));
  document.documentElement.classList.toggle('dark', dark);
}
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    const stored = (localStorage.getItem(KEY) as Theme | null) ?? 'system';
    setTheme(stored); apply(stored);
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (stored === 'system') apply('system'); };
    media.addEventListener('change', onChange); return () => media.removeEventListener('change', onChange);
  }, []);
  const cycle = () => {
    const next: Theme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    setTheme(next); localStorage.setItem(KEY, next); apply(next);
  };
  return <Button variant="secondary" aria-label={`Theme: ${theme}. Switch theme`} title={`Theme: ${theme}`} onClick={cycle} className="px-3">{theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'}<span className="hidden sm:inline capitalize">{theme}</span></Button>;
}
