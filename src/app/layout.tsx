import type React from 'react';import type { Metadata } from 'next';import './globals.css';
export const metadata:Metadata={title:'Meal Planner',description:'Frontend-only household meal planning app'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
