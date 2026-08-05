import type React from 'react';
import Link from 'next/link';
import type { ComponentProps } from 'react';

type Variant = 'primary' | 'secondary' | 'destructive' | 'ghost';
const buttonStyles: Record<Variant, string> = {
  primary: 'border-transparent bg-[rgb(var(--primary))] text-white hover:bg-[rgb(var(--primary-hover))] dark:text-slate-950',
  secondary: 'border-[rgb(var(--border))] bg-[rgb(var(--surface-raised))] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--primary-soft))]',
  destructive: 'border-transparent bg-[rgb(var(--destructive))] text-white hover:opacity-90 dark:text-slate-950',
  ghost: 'border-transparent bg-transparent text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface-raised))] hover:text-[rgb(var(--foreground))]',
};
export function Button({ className = '', variant = 'primary', ...p }: ComponentProps<'button'> & { variant?: Variant }) {
  return <button {...p} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${buttonStyles[variant]} ${className}`} />;
}
export function ActionLink({ className = '', variant = 'primary', ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link {...p} className={`inline-flex min-h-10 items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm transition ${buttonStyles[variant]} ${className}`} />;
}
export function GhostLink({ className = '', active = false, ...p }: ComponentProps<typeof Link> & { active?: boolean }) {
  return <Link {...p} aria-current={active ? 'page' : undefined} className={`rounded-xl px-3 py-2 text-sm font-medium transition ${active ? 'bg-[rgb(var(--primary-soft))] text-[rgb(var(--foreground))]' : 'text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface-raised))] hover:text-[rgb(var(--foreground))]'} ${className}`} />;
}
export function Card({ className = '', ...p }: ComponentProps<'section'>) { return <section {...p} className={`rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-[var(--shadow)] ${className}`} />; }
export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div>{eyebrow && <p className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--primary))]">{eyebrow}</p>}<h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-[rgb(var(--muted))]">{description}</p>}</div>{action}</div>;
}
const inputClass = 'min-h-10 w-full rounded-xl border border-[rgb(var(--input))] bg-[rgb(var(--surface-raised))] px-3 py-2 text-sm font-normal text-[rgb(var(--foreground))] shadow-sm transition placeholder:text-[rgb(var(--muted))] disabled:cursor-not-allowed disabled:opacity-60';
export function Field({ label, description, className = '', ...p }: ComponentProps<'input'> & { label: string; description?: string }) { return <label className={`grid gap-1.5 text-sm font-semibold text-[rgb(var(--foreground))] ${className}`}><span>{label}{p.required && <span className="text-[rgb(var(--destructive))]"> *</span>}</span>{description && <span className="text-xs font-normal text-[rgb(var(--muted))]">{description}</span>}<input {...p} className={inputClass} /></label>; }
export function Select({ label, children, className = '', ...p }: ComponentProps<'select'> & { label: string }) { return <label className={`grid gap-1.5 text-sm font-semibold text-[rgb(var(--foreground))] ${className}`}><span>{label}</span><select {...p} className={inputClass}>{children}</select></label>; }
export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) { const colors = { neutral: 'bg-[rgb(var(--primary-soft))] text-[rgb(var(--primary))]', success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200', warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200', danger: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' }; return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${colors[tone]}`}>{children}</span>; }
export function Empty({ title, body }: { title: string; body: string }) { return <div className="rounded-[var(--radius)] border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-10 text-center"><div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-[rgb(var(--primary-soft))] text-xl">🍽️</div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm text-[rgb(var(--muted))]">{body}</p></div>; }
