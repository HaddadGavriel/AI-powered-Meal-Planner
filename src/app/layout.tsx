import type React from 'react';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Meal Planner', description: 'Frontend-only household meal planning app' };

const themeScript = `
(() => {
  try {
    const stored = localStorage.getItem('meal-planner:theme');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = stored === 'dark' || (!stored && systemDark);
    document.documentElement.classList.toggle('dark', dark);
  } catch {}
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
