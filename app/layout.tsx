import React from 'react';
import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '../components/core/Providers';

export const metadata: Metadata = {
  title: 'dwp.3D Pipeline',
  description: 'Official DWP 3D Pipeline workspace for internal project delivery and coordination.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/svg+xml" href="/dwp-favicon.svg" />
        {/* Using CDN as per original index.html */}
        <script src="https://cdn.tailwindcss.com"></script>
        <script dangerouslySetInnerHTML={{
          __html: `
            tailwind.config = {
              darkMode: ['class', '.viz-dark'],
              theme: {
                extend: {
                  fontFamily: {
                    sans: ['Inter', 'sans-serif'],
                  },
                  animation: {
                    'fade-in': 'fadeIn 0.5s ease-out',
                  }
                }
              }
            }
          `
        }} />
      </head>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
