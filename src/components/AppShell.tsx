'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { repo } from '@/data/repository';
import { GhostLink } from './ui';

const navItems = [
  ['/dashboard', 'Dashboard'],
  ['/ingredients', 'Ingredients'],
  ['/recipes', 'Recipes'],
  ['/plans', 'Meal plans'],
  ['/household', 'Household'],
  ['/settings', 'Settings'],
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = repo.currentUser();

  if (!user) {
    return (
      <main className="container-page">
        <div className="rounded-xl bg-amber-50 p-6">
          <h1 className="text-xl font-bold">Session required</h1>
          <p>
            This protected page uses simulated client-side authentication for
            development only.
          </p>
          <Link className="text-brand-700 underline" href="/login">
            Return to login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div>
      <header className="border-b bg-white">
        <div className="container-page flex flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard" className="text-xl font-bold text-brand-900">
            Meal Planner
          </Link>
          <nav className="flex flex-wrap gap-1" aria-label="Main navigation">
            {navItems.map(([href, label]) => (
              <GhostLink
                key={href}
                href={href}
                className={pathname.startsWith(href) ? 'bg-brand-50 text-brand-900' : ''}
              >
                {label}
              </GhostLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span>
              {user.name} · {user.role}
            </span>
            <button
              className="text-slate-600 underline"
              type="button"
              onClick={() => {
                repo.logout();
                router.push('/login');
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="container-page space-y-6">{children}</main>
    </div>
  );
}
