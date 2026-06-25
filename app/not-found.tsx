import React from 'react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
import { Home } from 'lucide-react';

export default function NotFound() {
    return (
        <div className="min-h-screen bg-black text-zinc-100 flex flex-col items-center justify-center p-4">
            <div className="text-center animate-in fade-in slide-in-from-bottom-4">
                <h1 className="text-6xl font-bold text-white mb-4">404</h1>
                <h2 className="text-2xl font-semibold text-zinc-400 mb-8">Page Not Found</h2>
                <p className="text-zinc-500 mb-8 max-w-md mx-auto">
                    The page you are looking for does not exist or has been moved.
                </p>

                <Link
                    href="/app"
                    className="inline-flex items-center gap-2 bg-white text-black px-6 py-3 rounded-full font-medium hover:bg-zinc-200 transition-colors"
                >
                    <Home size={18} />
                    Return Home
                </Link>
            </div>
        </div>
    );
}
