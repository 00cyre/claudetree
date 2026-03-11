import { useState, useEffect, useCallback } from 'react';
import type { Flag } from '../types/index.js';
import { api } from '../api/client.js';

export function useFlags() {
  const [flags, setFlags] = useState<Flag[]>([]);

  const load = useCallback(async () => {
    try {
      setFlags(await api.getFlags());
    } catch {
      // backend may not be running
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createFlag = useCallback(async (name: string, color: string) => {
    await api.createFlag(name, color);
    await load();
  }, [load]);

  const deleteFlag = useCallback(async (name: string) => {
    await api.deleteFlag(name);
    await load();
  }, [load]);

  return { flags, createFlag, deleteFlag };
}
