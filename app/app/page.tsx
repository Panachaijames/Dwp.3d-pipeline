"use client";

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LoginPage } from '@/components/auth/LoginPage';
import { ThemeProvider } from '@/contexts/ThemeContext';
import nextDynamic from 'next/dynamic';
import { buildSSOUrl } from '@/utils/sso';

export const dynamic = 'force-dynamic';

const VizWorkflowApp = nextDynamic(() => import('@/components/features/VizWorkflow/VizWorkflowApp'), { ssr: false });
const OutsourcePortal = nextDynamic(() => import('@/components/portals/OutsourcePortal').then(mod => mod.OutsourcePortal), { ssr: false });

function MainLayout() {
    const { user, loading, logout } = useAuth();

    if (loading) {
        return (
            <div style={{ background: "#0F0F0E", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#E8731A", fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 600 }}>
                <a href={buildSSOUrl("https://dwp-visualization-747963782073.asia-southeast3.run.app/")} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>dwp.visualization</a>
            </div>
        );
    }

    if (!user) {
        return <LoginPage />;
    }

    if (user.role === 'outsource') {
        return <OutsourcePortal />;
    }

    if (!user.role) {
        return (
            <div style={{ background: "#F5F4F1", height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',sans-serif", gap: 12 }}>
                <div style={{ fontSize: 36, fontWeight: 700, color: "#1a1a1a" }}>Access Pending</div>
                <div style={{ fontSize: 14, color: "#888", maxWidth: 400, textAlign: "center" }}>Your account ({user.email}) does not have a role assigned yet. Please contact your team leader to get access.</div>
                <button onClick={logout} style={{ marginTop: 16, padding: "8px 24px", border: "1px solid #ddd", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Sign Out</button>
            </div>
        );
    }

    return <VizWorkflowApp />;
}

export default function PipelineApp() {
    return (
        <ThemeProvider>
            <MainLayout />
        </ThemeProvider>
    );
}
