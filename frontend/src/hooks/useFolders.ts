import { useState, useEffect, useCallback } from 'react';
import type { Folder } from '../types/index.js';
import { api } from '../api/client.js';

export function useFolders(projectId: string | undefined) {
  const [folders, setFolders] = useState<Folder[]>([]);

  const load = useCallback(async () => {
    if (!projectId) { setFolders([]); return; }
    try {
      setFolders(await api.getFolders(projectId));
    } catch {
      // backend may not be running
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const createFolder = useCallback(async (name: string) => {
    if (!projectId) return;
    await api.createFolder(projectId, name);
    await load();
  }, [projectId, load]);

  const updateFolder = useCallback(async (folderId: string, name: string) => {
    if (!projectId) return;
    await api.updateFolder(projectId, folderId, name);
    await load();
  }, [projectId, load]);

  const deleteFolder = useCallback(async (folderId: string) => {
    if (!projectId) return;
    await api.deleteFolder(projectId, folderId);
    await load();
  }, [projectId, load]);

  const reorderFolders = useCallback(async (reordered: Folder[]) => {
    if (!projectId) return;
    setFolders(reordered);
    await api.setFolderOrder(projectId, reordered.map((f) => f.id));
  }, [projectId]);

  return { folders, createFolder, updateFolder, deleteFolder, reorderFolders, refreshFolders: load };
}
