"use client";

import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LayoutTemplate, Sparkles } from 'lucide-react';

export const LoginPage: React.FC = () => {
    const { login } = useAuth();

    return (
        <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-4 transition-colors duration-300">
            <div className="max-w-md w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-10 shadow-xl text-center animate-fade-in">

                <div className="w-20 h-20 bg-purple-900/20 text-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-8 rotate-3 hover:rotate-0 transition-transform duration-300">
                    <LayoutTemplate className="w-10 h-10" />
                </div>

                <h1 className="text-3xl font-bold text-white mb-3">
                    dwp.3D Pipeline
                </h1>

                <button
                    onClick={() => login()}
                    className="w-full flex items-center justify-center gap-3 bg-white text-gray-700 hover:bg-gray-100 font-semibold py-4 px-6 rounded-xl border border-transparent transition-all group hover:shadow-lg hover:scale-[1.02]"
                >
                    <img
                        src="https://www.google.com/favicon.ico"
                        alt="Google"
                        className="w-5 h-5"
                    />
                    <span>Sign in with Google</span>
                </button>

                <div className="mt-8 pt-6 border-t border-zinc-800 flex items-center justify-center gap-2 text-xs text-zinc-500">
                    <Sparkles className="w-3 h-3" />
                    <span>Powered by dwp | innovation</span>
                </div>
            </div>
        </div>
    );
};
