import type { Metadata } from 'next';
import './globals.css';
import { RepositoryProvider } from '@/data/RepositoryProvider';
export const metadata: Metadata = {
  title: 'Meal Planner',
  description: 'Frontend-only household meal planning demo',
};
const themeScript = `(()=>{try{const t=localStorage.getItem('meal-planner:theme')||'system';const d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.dataset.theme=t}catch{}})()`;
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <RepositoryProvider>{children}</RepositoryProvider>
      </body>
    </html>
  );
}
