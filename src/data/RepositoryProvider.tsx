'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { AppData, Member } from '@/lib/types';
import { createRepository, type MealPlannerRepository } from './repository';
type RepositoryContext = {
    repo: MealPlannerRepository;
    data: AppData | null;
    user: Member | null;
    loading: boolean;
    error: string | null;
    message: string | null;
    refresh(): Promise<void>;
    run<T>(work: () => Promise<T>, success?: string): Promise<T | undefined>;
};
const Context = createContext<RepositoryContext | null>(null);
export function RepositoryProvider({ children }: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const repo = useMemo(createRepository, []);
    const [data, setData] = useState<AppData | null>(null);
    const [user, setUser] = useState<Member | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const publicInvitation = pathname.startsWith('/invite/');
    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            if (publicInvitation) {
                setData(null);
                setUser(null);
            }
            else {
                const session = await repo.getSession();
                if (session) {
                    const [nextData, nextUser] = await Promise.all([repo.getData(), repo.currentUser()]);
                    setData(nextData);
                    setUser(nextUser);
                }
                else {
                    setData(null);
                    setUser(null);
                }
            }
            setError(null);
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Unable to load data.');
        }
        finally {
            setLoading(false);
        }
    }, [publicInvitation, repo]);
    useEffect(() => {
        void refresh();
    }, [refresh]);
    const run = useCallback(async <T,>(work: () => Promise<T>, success?: string) => {
        setError(null);
        setMessage(null);
        try {
            const result = await work();
            await refresh();
            if (success)
                setMessage(success);
            return result;
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Something went wrong.');
            return undefined;
        }
    }, [refresh]);
    return (<Context.Provider value={{ repo, data, user, loading, error, message, refresh, run }}>
      {children}
    </Context.Provider>);
}
export function useMealPlanner() {
    const value = useContext(Context);
    if (!value)
        throw new Error('RepositoryProvider missing');
    return value;
}
