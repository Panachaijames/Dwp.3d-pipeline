import React from 'react';
import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '../components/Providers';

export const metadata: Metadata = {
  title: 'dwp.visualization',
  description: 'Real-time overview of the production pipeline and resources.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/svg+xml" href="https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg" />
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
