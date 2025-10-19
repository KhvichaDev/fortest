} else if (patch.action === 'rename_item') {
                        const oldPath = filePath;
                        const newPath = patch.newFilePath;
                        const oldName = oldPath.split('/').pop();
                        const newName = newPath.split('/').pop();
                        const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
                        const parentDirHandle = await getDirectoryHandleRecursive(handle, parentPath);
                        
                        let isFolder = false;
                        try { await parentDirHandle.getDirectoryHandle(oldName); isFolder = true; } catch (e) { isFolder = false; }

                        if (isFolder) {
                            const sourceDirHandle = await parentDirHandle.getDirectoryHandle(oldName);
                            const newDirHandle = await parentDirHandle.getDirectoryHandle(newName, { create: true });
                            await copyDirectoryRecursive(sourceDirHandle, newDirHandle);
                            await parentDirHandle.removeEntry(oldName, { recursive: true });
                        } else {
                           const itemHandle = await parentDirHandle.getFileHandle(oldName);
                           await itemHandle.move(parentDirHandle, newName);
                        }

                        results.modified.push(`${oldPath} -> ${newPath}`);
                        logChangeEvent({ type: `${isFolder ? 'folder' : 'file'}_renamed`, oldPath: oldPath, newPath: newPath, source: 'gemini_patch' });

                    } else if (patch.action === 'move_item') {
                        const sourcePath = filePath;
                        const destPath = patch.destinationPath;
                        const sourceName = sourcePath.split('/').pop();
                        
                        const sourceParentPath = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
                        const sourceParentHandle = await getDirectoryHandleRecursive(handle, sourceParentPath);
                        const destHandle = await getDirectoryHandleRecursive(handle, destPath, true);

                        let isFolder = false;
                        try { await sourceParentHandle.getDirectoryHandle(sourceName); isFolder = true; } catch (e) { isFolder = false; }
                        
                        if (isFolder) {
                            const sourceDirHandle = await sourceParentHandle.getDirectoryHandle(sourceName);
                            const newDestDirHandle = await destHandle.getDirectoryHandle(sourceName, { create: true });
                            await copyDirectoryRecursive(sourceDirHandle, newDestDirHandle);
                            await sourceParentHandle.removeEntry(sourceName, { recursive: true });
                        } else {
                           const itemHandle = await sourceParentHandle.getFileHandle(sourceName);
                           await itemHandle.move(destHandle, sourceName);
                        }

                        results.modified.push(`${sourcePath} -> ${destPath}`);
                        logChangeEvent({ type: `${isFolder ? 'folder' : 'file'}_moved`, oldPath: sourcePath, newPath: `${destPath}/${sourceName}`, source: 'gemini_patch' });