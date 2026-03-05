
export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    modifiedTime?: string;
    owners?: { displayName: string }[];
    driveId?: string; // For shared drives
    size?: string;
    thumbnailLink?: string;
    webContentLink?: string; // Download link
    webViewLink?: string; // Open in Drive link
    iconLink?: string;
}

export const googleDriveService = {
    // List Shared Drives
    async listSharedDrives(accessToken: string): Promise<DriveFile[]> {
        try {
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/drives?pageSize=100`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                    },
                }
            );

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Unauthorized');
                }
                throw new Error(`Drive API error: ${response.statusText}`);
            }

            const data = await response.json();
            // Map drives to DriveFile structure
            return (data.drives || []).map((drive: any) => ({
                id: drive.id,
                name: drive.name,
                mimeType: 'application/vnd.google-apps.folder', // Treat as folder
                owners: [{ displayName: 'Shared Drive' }],
                driveId: drive.id
            }));
        } catch (error) {
            console.error('Error listing Shared Drives:', error);
            throw error;
        }
    },

    // List folders in a specific parent directory
    async listFolders(accessToken: string, parentId: string = 'root'): Promise<DriveFile[]> {
        try {
            // Query for folders, not trashed, and child of parentId
            // Note: 'trashed = false' syntax varies slightly, usually 'trashed = false' is correct.
            // For shared drives, we must use supportsAllDrives=true and includeItemsFromAllDrives=true
            const query = `mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
            const encodedQuery = encodeURIComponent(query);

            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files?q=${encodedQuery}&fields=files(id, name, mimeType, modifiedTime, owners, driveId)&orderBy=folder,name&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                    },
                }
            );

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Unauthorized');
                }
                throw new Error(`Drive API error: ${response.statusText}`);
            }

            const data = await response.json();
            return data.files || [];
        } catch (error) {
            console.error('Error listing Drive folders:', error);
            throw error;
        }
    },

    // List all files and folders in a specific parent directory
    async listFiles(accessToken: string, parentId: string = 'root'): Promise<DriveFile[]> {
        const query = `'${parentId}' in parents and trashed = false`;
        const encodedQuery = encodeURIComponent(query);

        try {
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files?q=${encodedQuery}&fields=files(id, name, mimeType, modifiedTime, owners, driveId, size, thumbnailLink, webContentLink, webViewLink, iconLink)&orderBy=folder,name&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                    },
                }
            );

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Unauthorized');
                }
                throw new Error(`Drive API error: ${response.statusText}`);
            }

            const data = await response.json();
            return data.files || [];
        } catch (error) {
            console.error('Error listing Drive files:', error);
            throw error;
        }
    },

    // Upload a file to a specific folder
    async uploadFile(accessToken: string, folderId: string, file: File, customName?: string, onProgress?: (progress: number) => void): Promise<DriveFile> {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', true);
            xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);

            // Progress handler
            if (onProgress) {
                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        const percentComplete = Math.round((event.loaded / event.total) * 100);
                        onProgress(percentComplete);
                    }
                };
            }

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const response = JSON.parse(xhr.responseText);
                    resolve(response);
                } else {
                    if (xhr.status === 401) {
                        reject(new Error('Unauthorized'));
                    } else {
                        reject(new Error(`Upload failed: ${xhr.statusText}`));
                    }
                }
            };

            xhr.onerror = () => reject(new Error('Network error during upload'));

            // Metadata for the file (name, parent folder)
            const metadata = {
                name: customName || file.name,
                parents: [folderId],
            };

            const formData = new FormData();
            // append metadata as a separate part
            formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            // append file content
            formData.append('file', file);

            xhr.send(formData);
        });
    },

    // Find a specific folder by name within a parent folder
    async findFolder(accessToken: string, parentId: string, folderName: string): Promise<string | null> {
        try {
            const query = `mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and name = '${folderName}' and trashed = false`;
            const encodedQuery = encodeURIComponent(query);

            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files?q=${encodedQuery}&fields=files(id, name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                    },
                }
            );

            if (!response.ok) {
                throw new Error(`Drive API error: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.files && data.files.length > 0) {
                return data.files[0].id;
            }
            return null;
        } catch (error) {
            console.error('Error finding folder:', error);
            throw error;
        }
    },

    // Create a new folder
    async createFolder(accessToken: string, parentId: string, folderName: string): Promise<string> {
        try {
            const metadata = {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId],
            };

            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(metadata),
                }
            );

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Unauthorized');
                }
                throw new Error(`Drive API error: ${response.statusText}`);
            }

            const data = await response.json();
            return data.id;
        } catch (error) {
            console.error('Error creating folder:', error);
            throw error;
        }
    },

    // Verify access to a specific folder
    async verifyFolderAccess(accessToken: string, folderId: string): Promise<{ canAccess: boolean; name?: string }> {
        try {
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,capabilities&supportsAllDrives=true`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                    },
                }
            );

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Unauthorized');
                }
                if (response.status === 404 || response.status === 403) {
                    return { canAccess: false };
                }
                throw new Error(`Drive API error: ${response.statusText}`);
            }

            const file = await response.json();
            // Check if user has canAddChildren capability
            const canEdit = file.capabilities?.canAddChildren || file.capabilities?.canEdit;

            return {
                canAccess: !!canEdit,
                name: file.name
            };
        } catch (error) {
            console.error("Failed to verify folder access", error);
            return { canAccess: false };
        }
    },

    // Download file as Blob (for 3D viewer)
    async downloadFile(accessToken: string, fileId: string): Promise<Blob> {
        try {
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                    },
                }
            );

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Unauthorized');
                }
                throw new Error(`Drive API error: ${response.statusText}`);
            }

            return await response.blob();
        } catch (error) {
            console.error('Error downloading file:', error);
            throw error;
        }
    }
};
