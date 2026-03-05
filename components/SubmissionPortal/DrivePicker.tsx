"use client";

import React, { useState, useEffect } from 'react';
import { Folder, ChevronRight, HardDrive, ArrowLeft, Search, Check, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { googleDriveService, DriveFile } from '../../services/googleDriveService';

interface DriveFolder extends DriveFile {
    type: 'folder' | 'shared-drive' | 'my-drive' | 'root-container';
    updatedAt: string;
    owner: string;
}

interface DrivePickerProps {
    onSelect: (folderId: string, folderName: string) => void;
    onCancel: () => void;
    initialPath?: string[];
}

export const DrivePicker: React.FC<DrivePickerProps> = ({ onSelect, onCancel }) => {
    const { accessToken } = useAuth();
    // Start with a virtual root container
    const [currentPath, setCurrentPath] = useState<DriveFolder[]>([
        { id: 'virtual-root', name: 'Google Drive', type: 'root-container', mimeType: '', updatedAt: '', owner: '' }
    ]);
    const [folders, setFolders] = useState<DriveFolder[]>([]);
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchFolders = async () => {
            if (!accessToken) return;

            setLoading(true);
            setError(null);
            const currentFolder = currentPath[currentPath.length - 1];

            try {
                let mappedFolders: DriveFolder[] = [];

                if (currentFolder.id === 'virtual-root') {
                    // Virtual root level: Show "My Drive" and "Shared Drives"
                    mappedFolders = [
                        {
                            id: 'root',
                            name: 'My Drive',
                            mimeType: 'application/vnd.google-apps.folder',
                            type: 'my-drive',
                            updatedAt: '',
                            owner: 'Me'
                        },
                        {
                            id: 'shared-drives-root',
                            name: 'Shared Drives',
                            mimeType: 'application/vnd.google-apps.folder',
                            type: 'shared-drive',
                            updatedAt: '',
                            owner: 'Team'
                        }
                    ];
                } else if (currentFolder.id === 'shared-drives-root') {
                    // Fetch actual Shared Drives
                    const drives = await googleDriveService.listSharedDrives(accessToken);
                    mappedFolders = drives.map(d => ({
                        ...d,
                        type: 'shared-drive',
                        updatedAt: '',
                        owner: 'Shared Drive'
                    }));
                } else {
                    // Fetch folders within a drive or folder
                    const files = await googleDriveService.listFolders(accessToken, currentFolder.id);
                    mappedFolders = files.map(f => ({
                        ...f,
                        type: 'folder',
                        updatedAt: f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : '',
                        owner: f.owners?.[0]?.displayName || 'Unknown'
                    }));
                }

                setFolders(mappedFolders);
            } catch (err) {
                console.error("Failed to load folders", err);
                setError("Failed to load folders. Please try logging in again.");
            } finally {
                setLoading(false);
            }
        };

        fetchFolders();
        setSelectedFolderId(null);
    }, [currentPath, accessToken]);

    const handleNavigate = (folder: DriveFolder) => {
        setCurrentPath([...currentPath, folder]);
    };

    const handleBreadcrumbClick = (index: number) => {
        setCurrentPath(currentPath.slice(0, index + 1));
    };

    const handleSelect = () => {
        if (selectedFolderId) {
            const folder = folders.find(f => f.id === selectedFolderId);
            if (folder && folder.id !== 'virtual-root' && folder.id !== 'shared-drives-root') {
                onSelect(folder.id, folder.name);
            }
        }
    };

    return (
        <div className="flex flex-col h-[500px] bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-xl overflow-hidden shadow-2xl border border-zinc-200 dark:border-zinc-800">
            {/* Header */}
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-2">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg" className="w-5 h-5" alt="Drive" />
                    Select Destination
                </h3>
                <button onClick={onCancel} className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300">
                    Cancel
                </button>
            </div>

            {/* Toolbar & Breadcrumbs */}
            <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2 bg-white dark:bg-zinc-900">
                {currentPath.length > 1 && (
                    <button
                        onClick={() => handleBreadcrumbClick(currentPath.length - 2)}
                        className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full mr-1 text-zinc-500"
                    >
                        <ArrowLeft size={16} />
                    </button>
                )}

                <div className="flex items-center text-sm text-zinc-600 dark:text-zinc-400 overflow-hidden whitespace-nowrap mask-linear-fade">
                    {currentPath.map((folder, index) => (
                        <React.Fragment key={folder.id}>
                            {index > 0 && <ChevronRight size={14} className="mx-1 text-zinc-400" />}
                            <button
                                onClick={() => handleBreadcrumbClick(index)}
                                className={`hover:bg-zinc-100 dark:hover:bg-zinc-800 px-1.5 py-0.5 rounded transition-colors ${index === currentPath.length - 1 ? 'font-bold text-zinc-900 dark:text-zinc-100' : ''}`}
                            >
                                {folder.name}
                            </button>
                        </React.Fragment>
                    ))}
                </div>
            </div>

            {/* Folder List */}
            <div className="flex-1 overflow-y-auto p-2">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-400 gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                        <span className="text-sm">Loading Drive...</span>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-400 p-4 text-center">
                        <div className="w-10 h-10 bg-red-100 dark:bg-red-900/20 text-red-500 rounded-full flex items-center justify-center mb-2">
                            <AlertCircle size={20} />
                        </div>
                        <span className="text-sm text-red-500">{error}</span>
                    </div>
                ) : folders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-400">
                        <span className="text-sm">Empty folder</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-1">
                        {folders.map((folder) => (
                            <div
                                key={folder.id}
                                onClick={() => setSelectedFolderId(folder.id)}
                                onDoubleClick={() => handleNavigate(folder)}
                                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border group ${selectedFolderId === folder.id
                                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-500/30'
                                    : 'bg-white dark:bg-zinc-900 border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                                    }`}
                            >
                                <div className={`p-2 rounded-lg ${selectedFolderId === folder.id
                                    ? 'bg-blue-100 dark:bg-blue-800/30 text-blue-600 dark:text-blue-400'
                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700'
                                    }`}>
                                    {folder.type === 'my-drive' || folder.type === 'shared-drive' ? <HardDrive size={20} /> : <Folder size={20} />}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className={`text-sm font-medium truncate ${selectedFolderId === folder.id ? 'text-blue-700 dark:text-blue-300' : 'text-zinc-700 dark:text-zinc-200'}`}>
                                        {folder.name}
                                    </div>
                                    <div className="text-[10px] text-zinc-400 flex items-center gap-2">
                                        <span>{folder.updatedAt}</span>
                                        <span>•</span>
                                        <span>{folder.owner}</span>
                                    </div>
                                </div>

                                {(folder.type === 'folder' || folder.type === 'my-drive' || folder.type === 'shared-drive') && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleNavigate(folder); }}
                                        className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex justify-end gap-3">
                <button
                    onClick={onCancel}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSelect}
                    disabled={!selectedFolderId || selectedFolderId === 'shared-drives-root'}
                    className={`px-6 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${!selectedFolderId || selectedFolderId === 'shared-drives-root'
                        ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
                        }`}
                >
                    Select
                </button>
            </div>
        </div>
    );
};
