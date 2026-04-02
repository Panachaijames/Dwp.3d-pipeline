"use client";
import React from 'react';

export default function RenderTab() {
    return (
        <div className="vw-pnl">
            <div className="vw-ph"><div className="vw-ph-t">dwp.render</div><div className="vw-ph-s">AI Visualization Tool — select a project to start a session</div></div>
            <div className="vw-empty" style={{ paddingTop: 60 }}>
                <div className="ei">◈</div>
                <div className="et">Select a project from the sidebar</div>
                <div className="es">dwp.render opens as an AI workspace when a project is active.</div>
            </div>
        </div>
    );
}
