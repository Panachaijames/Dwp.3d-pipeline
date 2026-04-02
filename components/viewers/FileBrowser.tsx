import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, Folder, FileText, Download, ExternalLink, Box, LayoutGrid, List, ChevronRight, X, Layers } from 'lucide-react';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { googleDriveService, DriveFile } from '../../services/googleDriveService';
import { useAuth } from '../../contexts/AuthContext';
import ModelViewer from './ModelViewer';
import Masonry, { MasonryItem } from '../ui/Masonry';
import BounceCards from '../ui/BounceCards';

interface FileBrowserProps {
    initialFolderId: string;
    accessToken: string | null;
    rootName?: string;
}

export const FileBrowser: React.FC<FileBrowserProps> = ({ initialFolderId, accessToken, rootName = 'Project Folder' }) => {
    const [browserPath, setBrowserPath] = useState<{ id: string; name: string }[]>([{ id: initialFolderId, name: rootName }]);
    const [browserFiles, setBrowserFiles] = useState<DriveFile[]>([]);
    const [loadingBrowser, setLoadingBrowser] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'masonry' | 'bounce'>('masonry');
    const [viewingFile, setViewingFile] = useState<DriveFile | null>(null);
    const [modelUrl, setModelUrl] = useState<string | null>(null);

    // Load Browser Files
    useEffect(() => {
        if (accessToken && browserPath.length > 0) {
            loadBrowserFiles();
        }
    }, [browserPath, accessToken, initialFolderId]);

    const loadBrowserFiles = async () => {
        if (!accessToken) return;
        const currentFolderId = browserPath[browserPath.length - 1].id;
        setLoadingBrowser(true);
        try {
            const files = await googleDriveService.listFiles(accessToken, currentFolderId);
            setBrowserFiles(files);
        } catch (err) {
            console.error("Failed to load browser files", err);
            if ((err as Error).message === 'Unauthorized') {
                // Ideally trigger a toast or set a global error state
                alert("Session expired. Please sign in again.");
            }
        } finally {
            setLoadingBrowser(false);
        }
    };

    const handleNavigate = (folderId: string, folderName: string) => {
        setBrowserPath(prev => {
            const index = prev.findIndex(p => p.id === folderId);
            if (index !== -1) {
                return prev.slice(0, index + 1);
            }
            return [...prev, { id: folderId, name: folderName }];
        });
    };

    // Helper for pairing .max files with images
    // Finds an image with the same base name to use as thumbnail
    const getThumbnailForFile = (file: DriveFile) => {
        if (file.thumbnailLink) return file.thumbnailLink.replace('=s220', '=s800');

        // Custom logic for .max or other files without thumbnails
        // Try to find a matching image file
        const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
        const matchingImage = browserFiles.find(f =>
            f.id !== file.id &&
            f.name.startsWith(baseName) &&
            /\.(jpg|jpeg|png)$/i.test(f.name)
        );

        if (matchingImage && matchingImage.thumbnailLink) {
            return matchingImage.thumbnailLink.replace('=s220', '=s800');
        }

        return null;
    };



    const is3DModel = (file: DriveFile) => {
        const isModel = /\.(glb|gltf|fbx|obj|max)$/i.test(file.name) ||
            file.mimeType.includes('model') ||
            file.mimeType.includes('octet-stream'); // Fallback for some binary types
        return isModel;
    };

    const handleView3D = async (file: DriveFile) => {
        if (!accessToken) return;

        let targetFile = file;

        // Smart Check: If .max file, look for a companion .glb/.gltf/.fbx/.obj
        if (/\.max$/i.test(file.name)) {
            const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
            const companion = browserFiles.find(f =>
                f.name.startsWith(baseName) &&
                /\.(glb|gltf|fbx|obj)$/i.test(f.name)
            );

            if (companion) {
                console.log(`Auto-switching .max view to companion: ${companion.name}`);
                targetFile = companion;
            }
        }

        setViewingFile(targetFile);
        setModelUrl(null);
        try {
            const blob = await googleDriveService.downloadFile(accessToken, targetFile.id);
            const url = URL.createObjectURL(blob);
            setModelUrl(url);
        } catch (err) {
            console.error("Failed to load model", err);
            alert("Failed to load 3D model.");
            setViewingFile(null);
        }
    };

    // Build a set of companion image IDs — images whose base name matches a 3D model file.
    // These images are used as thumbnails for the model card and should NOT appear separately.
    const companionImageIds = useMemo<Set<string>>(() => {
        const ids = new Set<string>();
        const modelFiles = browserFiles.filter(f =>
            /\.(glb|gltf|fbx|obj|max|3ds|dwg|rvt)$/i.test(f.name)
        );
        for (const model of modelFiles) {
            const baseName = model.name.substring(0, model.name.lastIndexOf('.'));
            for (const f of browserFiles) {
                if (
                    f.id !== model.id &&
                    f.name.startsWith(baseName) &&
                    /\.(jpg|jpeg|png|webp)$/i.test(f.name)
                ) {
                    ids.add(f.id);
                }
            }
        }
        return ids;
    }, [browserFiles]);

    // Memoized Masonry Items — excludes folders and companion images
    const masonryItems = useMemo<MasonryItem[]>(() => {
        return browserFiles
            .filter(f =>
                f.mimeType !== 'application/vnd.google-apps.folder' &&
                !companionImageIds.has(f.id)
            )
            .map(file => {
                const img = getThumbnailForFile(file) || 'https://placehold.co/400x300?text=No+Preview';
                // Generate a pseudo-random height based on name length for visual variety if real size unknown
                const height = 200 + (file.name.length * 10) % 200;
                return {
                    id: file.id,
                    img: img,
                    url: file.webViewLink || '#',
                    height: height,
                    title: file.name
                };
            });
    }, [browserFiles, companionImageIds]);

    // Memoized Bounce Images — excludes companion images
    const bounceImages = useMemo<string[]>(() => {
        return browserFiles
            .filter(f =>
                /\.(jpg|jpeg|png|webp)$/i.test(f.name) &&
                f.thumbnailLink &&
                !companionImageIds.has(f.id)
            )
            .map(f => f.thumbnailLink!.replace('=s220', '=s800'));
    }, [browserFiles, companionImageIds]);

    return (
        <div className="bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-xl shadow-zinc-200/50 dark:shadow-none min-h-[400px] flex flex-col">
            {/* Browser Header / Breadcrumbs */}
            <div className="flex items-center justify-between mb-6 border-b border-zinc-100 dark:border-zinc-800 pb-2">
                <div className="flex items-center gap-2 overflow-x-auto">
                    {browserPath.map((item, index) => (
                        <React.Fragment key={item.id}>
                            {index > 0 && <ChevronRight size={16} className="text-zinc-400" />}
                            <button
                                onClick={() => handleNavigate(item.id, item.name)}
                                className={`text-sm px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap ${index === browserPath.length - 1 ? 'font-bold text-zinc-900 dark:text-white' : 'text-zinc-500'}`}
                            >
                                {item.name}
                            </button>
                        </React.Fragment>
                    ))}
                </div>
                <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg shrink-0">
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
                        title="List View"
                    >
                        <List size={16} />
                    </button>
                    <button
                        onClick={() => setViewMode('masonry')}
                        className={`p-1.5 rounded-md transition-colors ${viewMode === 'masonry' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
                        title="Masonry Gallery"
                    >
                        <LayoutGrid size={16} />
                    </button>
                    <button
                        onClick={() => setViewMode('bounce')}
                        className={`p-1.5 rounded-md transition-colors ${viewMode === 'bounce' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
                        title="Bounce Stack"
                    >
                        <Layers size={16} />
                    </button>
                </div>
            </div>

            {/* Browser Content */}
            <div className="flex-1 overflow-auto custom-scrollbar p-1">
                {loadingBrowser ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-400 gap-3">
                        <Loader2 className="animate-spin text-purple-500" size={32} />
                        <p>Loading files...</p>
                    </div>
                ) : browserFiles.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-zinc-400">
                        <Folder className="w-12 h-12 mb-4 opacity-20" />
                        <p>This folder is empty.</p>
                    </div>
                ) : (
                    <>
                        {viewMode === 'list' ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50%]">Name</TableHead>
                                        <TableHead>Size</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {browserFiles.filter(f => !companionImageIds.has(f.id)).map((file) => (
                                        <TableRow key={file.id} className="group">
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    {file.mimeType === 'application/vnd.google-apps.folder' ? (
                                                        <Folder className="text-blue-500 fill-blue-500/20" size={20} />
                                                    ) : file.thumbnailLink ? (
                                                        <img src={file.thumbnailLink} alt="" className="w-8 h-8 rounded object-cover bg-zinc-100 dark:bg-zinc-800" />
                                                    ) : (
                                                        <FileText className="text-zinc-400" size={20} />
                                                    )}
                                                    {file.mimeType === 'application/vnd.google-apps.folder' ? (
                                                        <button
                                                            onClick={() => handleNavigate(file.id, file.name)}
                                                            className="font-medium text-zinc-900 dark:text-zinc-200 hover:underline hover:text-blue-600 dark:hover:text-blue-400 text-left truncate max-w-[300px]"
                                                        >
                                                            {file.name}
                                                        </button>
                                                    ) : (
                                                        <span className="text-zinc-700 dark:text-zinc-300 truncate max-w-[300px] block" title={file.name}>
                                                            {file.name}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-zinc-500 font-mono text-xs">
                                                {file.size ? (parseInt(file.size) / 1024 / 1024).toFixed(2) + ' MB' : '-'}
                                            </TableCell>
                                            <TableCell className="text-zinc-500 text-xs truncate max-w-[100px]" title={file.mimeType}>
                                                {file.mimeType.split('.').pop()?.split('/').pop()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {file.webContentLink && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => window.open(file.webContentLink, '_blank')}
                                                            title="Download"
                                                        >
                                                            <Download size={16} />
                                                        </Button>
                                                    )}
                                                    {is3DModel(file) && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={(e) => { e.stopPropagation(); handleView3D(file); }}
                                                            title="View 3D"
                                                        >
                                                            <Box size={16} />
                                                        </Button>
                                                    )}
                                                    {file.webViewLink && (

                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => window.open(file.webViewLink, '_blank')}
                                                            title="Open in Drive"
                                                        >
                                                            <ExternalLink size={16} />
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <>
                                {/* Folders Grid (for non-list modes) */}
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
                                    {browserFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder').map(folder => (
                                        <button
                                            key={folder.id}
                                            onClick={() => handleNavigate(folder.id, folder.name)}
                                            className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                        >
                                            <Folder size={20} className="text-blue-500 fill-blue-500/20" />
                                            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 truncate">{folder.name}</span>
                                        </button>
                                    ))}
                                </div>

                                {viewMode === 'masonry' && (
                                    <Masonry
                                        items={masonryItems}
                                        onItemClick={(item) => {
                                            const file = browserFiles.find(f => f.id === item.id);
                                            console.log("Clicked item:", item, "File found:", file, "Is 3D?", file ? is3DModel(file) : false);
                                            if (file && is3DModel(file)) {
                                                handleView3D(file);
                                            } else {
                                                window.open(item.url, '_blank');
                                            }
                                        }}
                                    />
                                )}

                                {viewMode === 'bounce' && (
                                    <div className="flex items-center justify-center min-h-[500px]">
                                        {bounceImages.length > 0 ? (
                                            <BounceCards
                                                images={bounceImages.slice(0, 5)}
                                                containerWidth={600}
                                                containerHeight={500}
                                                enableHover={true}
                                            />
                                        ) : (
                                            <p className="text-zinc-400">No images found to display in Bounce Gallery.</p>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>

            {/* 3D Model Modal */}
            {viewingFile && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="w-full max-w-6xl h-[85vh] bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col relative border border-zinc-800">
                        <div className="absolute top-4 right-4 z-50 flex gap-2">
                            <a
                                href={viewingFile.webContentLink}
                                className="p-2 bg-black/50 hover:bg-black/80 rounded-full text-white transition-colors backdrop-blur-md"
                                title="Download Model"
                            >
                                <Download size={20} />
                            </a>
                            <button
                                onClick={() => { setViewingFile(null); setModelUrl(null); }}
                                className="p-2 bg-black/50 hover:bg-black/80 rounded-full text-white transition-colors backdrop-blur-md"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 relative bg-gradient-to-b from-zinc-800 to-zinc-950">
                            {!modelUrl ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400 gap-4">
                                    <Loader2 className="animate-spin text-purple-500" size={48} />
                                    <p className="font-medium">Loading 3D Model...</p>
                                    <p className="text-sm text-zinc-500 uppercase tracking-wider">{viewingFile.name}</p>
                                </div>
                            ) : (
                                <ModelViewer
                                    url={modelUrl}
                                    fileName={viewingFile.name}
                                    width="100%"
                                    height="100%"
                                    environmentPreset="city"
                                    autoRotate={true}
                                />
                            )}
                        </div>
                        <div className="p-4 bg-black/40 backdrop-blur border-t border-zinc-800 flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-white text-lg">{viewingFile.name}</h3>
                                <p className="text-zinc-400 text-sm">{(parseInt(viewingFile.size!) / 1024 / 1024).toFixed(2)} MB • {viewingFile.mimeType.split('.').pop()?.toUpperCase()}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
