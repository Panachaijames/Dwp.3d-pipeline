"use client";

import React from 'react';
import nextDynamic from 'next/dynamic';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { LoginPage } from '../../components/auth/LoginPage';
import { ThemeProvider, useTheme } from '../../contexts/ThemeContext';
import '../../components/features/VizWorkflow/vizworkflow.css';

// Dynamic import for the tab to avoid SSR issues with some components
const Book3DTab = nextDynamic(() => import('../../components/features/VizWorkflow/Book3DTab'), { ssr: false });

function EmbedContent() {
    const { user, loading } = useAuth();
    const { theme } = useTheme();
    const dark = theme === 'dark';

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

    return (
        <div className={`vw-root ${dark ? 'viz-dark' : 'viz-light'}`} style={{
            width: '100vw',
            background: 'var(--bg)',
            justifyContent: 'center'
        }}>
            <div className="vw-mn" style={{
                maxWidth: '900px',
                width: '100%',
                borderLeft: '1px solid var(--bdr)',
                borderRight: '1px solid var(--bdr)'
            }}>
                {/* Back to VizWorkflow button */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bdr)' }}>
                    <Link
                        href="/pipeline"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 600,
                            fontFamily: "'DM Sans', sans-serif",
                            color: dark ? '#ccc' : '#555',
                            background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                            border: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                            textDecoration: 'none',
                            transition: 'all 0.2s ease',
                            cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = dark ? 'rgba(232,115,26,0.15)' : 'rgba(232,115,26,0.08)';
                            e.currentTarget.style.color = '#E8731A';
                            e.currentTarget.style.borderColor = 'rgba(232,115,26,0.3)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
                            e.currentTarget.style.color = dark ? '#ccc' : '#555';
                            e.currentTarget.style.borderColor = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Back to VizWorkflow
                    </Link>
                </div>
                <Book3DTab proj={null} />
            </div>
        </div>
    );
}

export default function Book3DEmbedPage() {
    return (
        <ThemeProvider>
            <EmbedContent />
        </ThemeProvider>
    );
}
