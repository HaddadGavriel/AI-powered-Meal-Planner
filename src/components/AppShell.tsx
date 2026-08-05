'use client';
import type React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { repo } from '@/data/repository';
import { GhostLink } from './ui';
import { ThemeToggle } from './ThemeToggle';
const nav = [['/dashboard','Dashboard'],['/ingredients','Ingredients'],['/recipes','Recipes'],['/plans','Meal plans'],['/household','Household'],['/settings','Settings']];
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname(); const r = useRouter(); const user = repo.currentUser();
  if (!user) return <main className="container-page grid min-h-screen place-items-center"><section className="max-w-lg rounded-[var(--radius)] border border-amber-300 bg-amber-50 p-6 text-amber-950 shadow-[var(--shadow)] dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"><h1 className="text-xl font-bold">Session required</h1><p className="mt-2 text-sm">This protected page uses simulated client-side authentication for development only.</p><Link className="mt-4 inline-flex font-semibold underline" href="/login">Return to login</Link></section></main>;
  return <div className="min-h-screen"><header className="sticky top-0 z-20 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))]/90 backdrop-blur"><div className="container-page flex flex-wrap items-center justify-between gap-3 py-3"><Link href="/dashboard" className="flex items-center gap-3 text-lg font-bold tracking-tight"><span className="grid size-10 place-items-center rounded-2xl bg-[rgb(var(--primary))] text-white dark:text-slate-950">MP</span><span>Meal Planner</span></Link><nav className="order-3 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto" aria-label="Main navigation">{nav.map(([href,label])=><GhostLink key={href} href={href} active={path.startsWith(href)}>{label}</GhostLink>)}</nav><div className="flex items-center gap-2 text-sm"><ThemeToggle/><span className="hidden max-w-[14rem] truncate text-[rgb(var(--muted))] lg:inline">{user.name} · {user.role}</span><button className="rounded-lg px-2 py-1.5 font-medium text-[rgb(var(--muted))] underline-offset-4 hover:text-[rgb(var(--foreground))] hover:underline" onClick={()=>{repo.logout();r.push('/login');}}>Logout</button></div></div></header><main className="container-page space-y-6">{children}</main></div>;
}
