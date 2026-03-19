import { useState, useEffect, useCallback, useRef } from 'react';
import type { Project, Worktree } from '../types/index.js';
import { api } from '../api/client.js';

const SELECTED_WT_KEY = 'claudetree:selectedWorktreeId';

function loadSelectedWorktreeId(): string | null {
  try { return localStorage.getItem(SELECTED_WT_KEY); } catch { return null; }
}

function saveSelectedWorktreeId(id: string | null): void {
  try {
    if (id) localStorage.setItem(SELECTED_WT_KEY, id);
    else localStorage.removeItem(SELECTED_WT_KEY);
  } catch { /* ignore */ }
}

export function useWorktrees() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [selectedWorktree, setSelectedWorktreeRaw] = useState<Worktree | null>(null);
  const [loading, setLoading] = useState(false);
  const restoredRef = useRef(false);

  const setSelectedWorktree = useCallback((wt: Worktree | null | ((prev: Worktree | null) => Worktree | null)) => {
    setSelectedWorktreeRaw((prev) => {
      const next = typeof wt === 'function' ? wt(prev) : wt;
      saveSelectedWorktreeId(next?.id ?? null);
      return next;
    });
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const data = await api.getProjects();
      setProjects(data);
      if (data.length > 0 && !selectedProject) {
        setSelectedProject(data[0]);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  }, [selectedProject]);

  const loadWorktrees = useCallback(async () => {
    if (!selectedProject) return;
    setLoading(true);
    try {
      const data = await api.getWorktrees(selectedProject.id);
      setWorktrees(data);
    } catch (err) {
      console.error('Failed to load worktrees:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    loadWorktrees();
  }, [loadWorktrees]);

  // Restore previously selected worktree after initial load
  useEffect(() => {
    if (restoredRef.current || worktrees.length === 0 || selectedWorktree) return;
    restoredRef.current = true;
    const savedId = loadSelectedWorktreeId();
    if (savedId) {
      const found = worktrees.find((w) => w.id === savedId);
      if (found) setSelectedWorktree(found);
    }
  }, [worktrees, selectedWorktree, setSelectedWorktree]);

  const addProject = async (path: string) => {
    const project = await api.addProject(path);
    setProjects((prev) => [...prev, project]);
    setSelectedProject(project);
  };

  const createWorktree = async (name: string, linearIssueId?: string, baseBranch?: string) => {
    if (!selectedProject) return;
    const wt = await api.createWorktree(selectedProject.id, name, baseBranch);
    if (linearIssueId) {
      await api.linkWorktree(selectedProject.id, wt.id, linearIssueId);
      wt.linearIssueId = linearIssueId;
    }
    setWorktrees((prev) => [...prev, wt]);
    setSelectedWorktree(wt);
  };

  const deleteWorktree = async (id: string) => {
    await api.deleteWorktree(id);
    setWorktrees((prev) => prev.filter((w) => w.id !== id));
    if (selectedWorktree?.id === id) {
      setSelectedWorktree(null);
    }
  };

  const reorderWorktrees = useCallback(async (reordered: Worktree[]) => {
    setWorktrees(reordered);
    if (selectedProject) {
      await api.setWorktreeOrder(selectedProject.id, reordered.map((w) => w.id));
    }
  }, [selectedProject]);

  const setWorktreeFlags = useCallback(async (worktreeId: string, flags: string[]) => {
    await api.setWorktreeFlags(worktreeId, flags);
    setWorktrees((prev) => prev.map((w) => w.id === worktreeId ? { ...w, flags } : w));
  }, []);

  const setWorktreeFolder = useCallback(async (worktreeId: string, folderId: string | null) => {
    await api.setWorktreeFolder(worktreeId, folderId);
    setWorktrees((prev) => prev.map((w) =>
      w.id === worktreeId ? { ...w, folderId: folderId ?? undefined } : w
    ));
  }, []);

  return {
    projects,
    selectedProject,
    setSelectedProject,
    worktrees,
    selectedWorktree,
    setSelectedWorktree,
    loading,
    addProject,
    createWorktree,
    deleteWorktree,
    reorderWorktrees,
    setWorktreeFlags,
    setWorktreeFolder,
    refresh: loadWorktrees,
  };
}
