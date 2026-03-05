"use client";

import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LoginPage } from '../components/LoginPage';
import { ThemeProvider } from '../contexts/ThemeContext';
import nextDynamic from 'next/dynamic';

export const dynamic = 'force-dynamic';

const VizWorkflowApp = nextDynamic(() => import('../components/VizWorkflow/VizWorkflowApp'), { ssr: false });
const OutsourcePortal = nextDynamic(() => import('../components/OutsourcePortal').then(mod => mod.OutsourcePortal), { ssr: false });

function MainLayout() {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div style={{ background: "#0F0F0E", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#E8731A", fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 600 }}>
                dwp.VizWorkflow
            </div>
        );
    }

    if (!user) {
        return <LoginPage />;
    }

    if (user.role === 'outsource') {
        return <OutsourcePortal />;
    }

    return <VizWorkflowApp />;
}

export default function Home() {
    return (
        <ThemeProvider>
            <MainLayout />
        </ThemeProvider>
    );
}
