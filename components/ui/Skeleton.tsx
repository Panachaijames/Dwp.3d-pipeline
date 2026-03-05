import React from 'react';

interface SkeletonProps {
    className?: string;
    width?: string | number;
    height?: string | number;
    rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
}

/**
 * Skeleton component for loading states
 * Uses shadcn-style shimmer animation from globals.css
 */
export function Skeleton({
    className = '',
    width,
    height,
    rounded = 'md'
}: SkeletonProps) {
    const roundedClasses = {
        none: 'rounded-none',
        sm: 'rounded-sm',
        md: 'rounded-md',
        lg: 'rounded-lg',
        full: 'rounded-full'
    };

    const style: React.CSSProperties = {
        width: width,
        height: height
    };

    return (
        <div
            className={`skeleton ${roundedClasses[rounded]} ${className}`}
            style={style}
        />
    );
}

// Pre-built skeleton variants
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
    return (
        <div className={`space-y-2 ${className}`}>
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton
                    key={i}
                    height="1rem"
                    width={i === lines - 1 ? '60%' : '100%'}
                />
            ))}
        </div>
    );
}

export function SkeletonCard({ className = '' }: { className?: string }) {
    return (
        <div className={`p-4 space-y-4 ${className}`}>
            <Skeleton height="200px" rounded="lg" />
            <Skeleton height="1.5rem" width="70%" />
            <SkeletonText lines={2} />
        </div>
    );
}

export function SkeletonAvatar({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
    const sizes = {
        sm: { width: '32px', height: '32px' },
        md: { width: '48px', height: '48px' },
        lg: { width: '64px', height: '64px' }
    };

    return (
        <Skeleton
            {...sizes[size]}
            rounded="full"
            className={className}
        />
    );
}
