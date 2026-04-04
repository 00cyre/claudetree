import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from './ipcChannels';

contextBridge.exposeInMainWorld('claudetreeBridge', {
  getBackendUrl(): Promise<string> {
    return ipcRenderer.invoke(IPC.CT_GET_BACKEND_URL);
  },

  pickFolder(): Promise<string | null> {
    return ipcRenderer.invoke(IPC.CT_PICK_FOLDER);
  },

  confirm(message: string): Promise<boolean> {
    return ipcRenderer.invoke(IPC.CT_CONFIRM, message);
  },

  // terminal — filled in Phase 2
  // worktree — filled in Phase 1
});
