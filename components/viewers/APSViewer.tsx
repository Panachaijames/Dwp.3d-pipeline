'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

declare global {
    interface Window {
        Autodesk: any;
    }
}

interface APSViewerProps {
    urn: string; // base64-safe URN
    getToken: () => Promise<string>;
}

export default function APSViewer({ urn, getToken }: APSViewerProps) {
    const viewerDiv = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<any>(null);
    const [scriptLoaded, setScriptLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const initializeViewer = async () => {
        if (!window.Autodesk || !viewerDiv.current) return;
        setError(null);

        // Shutdown previous viewer instance
        if (viewerRef.current) {
            viewerRef.current.finish();
            viewerRef.current = null;
        }

        const options = {
            env: 'AutodeskProduction2',
            api: 'streamingV2',
            getAccessToken: (onGetAccessToken: (token: string, expire: number) => void) => {
                getToken().then((t) => onGetAccessToken(t, 3600));
            },
        };

        window.Autodesk.Viewing.Initializer(options, () => {
            const viewer = new window.Autodesk.Viewing.GuiViewer3D(viewerDiv.current);
            viewer.start();
            viewerRef.current = viewer;

            const documentId = urn.startsWith('urn:') ? urn : 'urn:' + urn;

            window.Autodesk.Viewing.Document.load(
                documentId,
                (doc: any) => {
                    const defaultModel = doc.getRoot().getDefaultGeometry();
                    if (defaultModel) {
                        viewer.loadDocumentNode(doc, defaultModel);
                    } else {
                        setError('No viewable geometry found in this file.');
                    }
                },
                (errorCode: any, errorMsg: any) => {
                    console.error('APS Viewer Error:', errorCode, errorMsg);
                    setError(`Viewer error: ${errorMsg || errorCode}`);
                }
            );
        });
    };

    // Re-init when URN changes
    useEffect(() => {
        if (scriptLoaded && urn) {
            initializeViewer();
        }

        return () => {
            if (viewerRef.current) {
                viewerRef.current.finish();
                viewerRef.current = null;
            }
        };
    }, [scriptLoaded, urn]);

    return (
        <div className="relative w-full h-full" style={{ background: '#f0f0f0', minHeight: 300 }}>
            <link rel="stylesheet" href="https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/style.min.css" type="text/css" />
            <Script
                src="https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/viewer3D.min.js"
                onLoad={() => setScriptLoaded(true)}
            />
            <div ref={viewerDiv} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }} />

            {!scriptLoaded && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 12 }}>
                    Loading Autodesk Viewer...
                </div>
            )}

            {error && (
                <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12, background: 'rgba(200,0,0,.9)', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: 11 }}>
                    {error}
                </div>
            )}
        </div>
    );
}
