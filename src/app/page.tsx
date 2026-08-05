'use client';import { useEffect } from 'react';import { useRouter } from 'next/navigation';import { repo } from '@/data/repository';
export default function Home(){const r=useRouter();useEffect(()=>{r.replace(repo.getSession() ? '/dashboard':'/login')},[r]);return <main className="container-page">Loading Meal Planner…</main>}
