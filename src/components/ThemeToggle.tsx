'use client';
import { useEffect, useState } from 'react';
import { Button } from './ui';
export type Theme = 'light' | 'dark' | 'system';
export const THEME_KEY = 'meal-planner:theme';
export function applyTheme(theme: Theme) { const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.classList.toggle('dark', dark); document.documentElement.dataset.theme = theme; }
export function ThemeToggle() {
    const [theme, setTheme] = useState<Theme>('system');
    useEffect(() => { const stored = localStorage.getItem(THEME_KEY); const current: Theme = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'; setTheme(current); applyTheme(current); }, []);
    useEffect(() => {
        if (theme !== 'system')
            return;
        const media = matchMedia('(prefers-color-scheme: dark)');
        const change = () => applyTheme('system');
        media.addEventListener('change', change);
        return () => media.removeEventListener('change', change);
    }, [theme]);
    const cycle = () => { const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'; setTheme(next); localStorage.setItem(THEME_KEY, next); applyTheme(next); };
    return <Button variant="secondary" aria-label={`Theme: ${theme}. Switch theme`} onClick={cycle}>{theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'} <span className="capitalize">{theme}</span>
</Button>;
}
