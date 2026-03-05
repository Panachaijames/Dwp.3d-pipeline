import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    /* config options here */
    output: 'standalone',
    env: {
        // Expose the server-side GEMINI_CLIENT_ID to the client
        GEMINI_CLIENT_ID: process.env.GEMINI_CLIENT_ID,
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '*.googleusercontent.com',
            },
            {
                protocol: 'https',
                hostname: 'ui-avatars.com',
            },
            {
                protocol: 'https',
                hostname: 'lh3.googleusercontent.com',
            }
        ],
    }
};

export default nextConfig;
