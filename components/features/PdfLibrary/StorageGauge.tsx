import React, { useState, useEffect } from 'react';
import { Database } from 'lucide-react';

export const StorageGauge: React.FC = () => {
    const [usage, setUsage] = useState<number>(0);
    const [quota, setQuota] = useState<number>(0);

    const checkStorage = async () => {
        if (navigator.storage && navigator.storage.estimate) {
            try {
                const estimate = await navigator.storage.estimate();
                setUsage(estimate.usage || 0);
                setQuota(estimate.quota || 0);
            } catch (e) {
                console.error("Storage estimation error", e);
            }
        }
    };

    useEffect(() => {
        checkStorage();
        // Check periodically every 10 seconds
        const interval = setInterval(checkStorage, 10000);

        // Also listen for a custom event we can dispatch when adding/removing files
        const handleUpdate = () => checkStorage();
        window.addEventListener('update-storage-gauge', handleUpdate);

        return () => {
            clearInterval(interval);
            window.removeEventListener('update-storage-gauge', handleUpdate);
        };
    }, []);

    if (!quota) return null;

    const percentage = Math.min(100, (usage / quota) * 100);
    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Determine color based on usage
    let colorClass = 'bg-blue-500';
    if (percentage > 90) colorClass = 'bg-red-500';
    else if (percentage > 75) colorClass = 'bg-yellow-500';

    return (
        <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 shrink-0 bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-white">
            <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                <div className="flex items-center gap-1.5">
                    <Database size={14} />
                    <span>Local Storage Space</span>
                </div>
                <span>{percentage.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-neutral-200 dark:bg-neutral-800 rounded-full h-1.5 mb-2 overflow-hidden">
                <div
                    className={`${colorClass} h-1.5 rounded-full transition-all duration-500`}
                    style={{ width: `${percentage}%` }}
                ></div>
            </div>
            <div className="text-[10px] text-neutral-600 dark:text-neutral-500 flex justify-between">
                <span>{formatBytes(usage)} used</span>
                <span>{formatBytes(quota)} total</span>
            </div>
        </div>
    );
};
