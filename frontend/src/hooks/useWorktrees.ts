import { useState, useEffect, useCallback } from 'react';
import type { Project, Worktree } from '../types/index.js';
import { api } from '../api/client.js';

export function useWorktrees() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [selectedWorktree, setSelectedWorktree] = useState<Worktree | null>(null);
  const [loading, setLoading] = useState(false);

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
    refresh: loadWorktrees,
  };
}
