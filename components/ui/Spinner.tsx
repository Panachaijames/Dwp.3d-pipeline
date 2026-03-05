import React from 'react';

interface SpinnerProps {
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
    color?: string;
}

/**
 * Spinner component for loading states
 * Uses shadcn-style spin animation from globals.css
 */
export function Spinner({
    size = 'md',
    className = '',
    color
}: SpinnerProps) {
    const sizeClasses = {
        sm: 'spinner-sm',
        md: 'spinner-md',
        lg: 'spinner-lg',
        xl: 'spinner-xl'
    };

    const style: React.CSSProperties = color ? { color } : {};

    return (
        <div className={`spinner ${className}`} style={style}>
            <div className={`spinner-circle ${sizeClasses[size]}`} />
        </div>
    );
}

// Loading overlay with spinner
export function LoadingOverlay({
    message = 'Loading...',
    className = ''
}: {
    message?: string;
    className?: string;
}) {
    return (
        <div className={`flex flex-col items-center justify-center gap-4 p-8 ${className}`}>
            <Spinner size="lg" />
            <p className="text-sm text-zinc-400 animate-pulse">{message}</p>
        </div>
    );
}

// Inline loading indicator
export function LoadingInline({
    text = 'Loading',
    className = ''
}: {
    text?: string;
    className?: string;
}) {
    return (
        <span className={`inline-flex items-center gap-2 ${className}`}>
            <Spinner size="sm" />
            <span className="text-sm text-zinc-400">{text}</span>
        </span>
    );
}
