'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMealPlanner } from '@/data/RepositoryProvider';
import { ThemeToggle } from './ThemeToggle';
import { GhostLink } from './ui';
const navigation = [
    ['/dashboard', 'Dashboard'],
    ['/ingredients', 'Ingredients'],
    ['/recipes', 'Recipes'],
    ['/plans', 'Meal plans'],
    ['/shopping', 'Shopping'],
    ['/household', 'Household'],
    ['/activity', 'Activity'],
    ['/settings', 'Settings'],
];
export function AppShell({ children }: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, loading, error, message, repo } = useMealPlanner();
    if (loading) {
        return <main className="container-page grid min-h-screen place-items-center" aria-busy="true">Loading your meal planner…</main>;
    }
    if (!user) {
        return (<main className="container-page grid min-h-screen place-items-center">
        <section className="card">
          <h1 className="text-xl font-bold">Session required</h1>
          <p className="mt-2 text-sm">Sign in to view this page.</p>
          <Link className="mt-4 inline-flex font-semibold underline" href="/login">Return to sign in</Link>
        </section>
      </main>);
    }
    return (<div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))]/90 backdrop-blur">
        <div className="container-page flex flex-wrap items-center justify-between gap-3 py-3">
          <Link href="/dashboard" className="flex items-center gap-3 text-lg font-bold">
            <span className="grid size-10 place-items-center rounded-2xl bg-[rgb(var(--primary))] text-white">MP</span>
            Meal Planner
          </Link>
          <nav className="order-3 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto" aria-label="Main navigation">
            {navigation.map(([href, label]) => (<GhostLink key={href} href={href} active={pathname.startsWith(href)}>{label}</GhostLink>))}
          </nav>
          <div className="flex items-center gap-2 text-sm">
            <ThemeToggle />
            <span className="hidden lg:inline">{user.name} · {user.role}</span>
            <button className="underline" onClick={async () => {
            await repo.logout();
            router.push('/login');
            router.refresh();
        }}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="container-page space-y-6">
        {error && (<div role="alert" className="rounded-xl bg-red-100 p-3 text-red-900">
            {error}{repo.capabilities.canReset ? ' Try again or reset dummy data in Settings.' : ' Try again or sign in again.'}
          </div>)}
        {message && <div role="status" className="rounded-xl bg-emerald-100 p-3 text-emerald-900">{message}</div>}
        {children}
      </main>
    </div>);
}
