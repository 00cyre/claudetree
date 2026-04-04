import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { spawn, ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import { syncShellEnvironment } from './syncShellEnvironment';
import {
  reserveLoopbackPort,
  generateAuthToken,
  BootstrapConfig,
} from './bootstrapPipe';
import { IPC } from './ipcChannels';

// Sync shell environment before anything else
syncShellEnvironment();

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let backendUrl: string = '';

async function createWindow(): Promise<void> {
  const dataDir = app.getPath('userData');
  const port = await reserveLoopbackPort();
  const authToken = generateAuthToken();

  backendUrl = `http://127.0.0.1:${port}`;

  const bootstrapConfig: BootstrapConfig = { port, authToken, dataDir };

  // Spawn backend subprocess with fd3 pipe for bootstrap config
  const backendEntry = path.resolve(__dirname, '..', '..', '..', 'backend', 'dist', 'index.js');
  backendProcess = spawn(process.execPath, [backendEntry], {
    stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
    env: { ...process.env },
    cwd: path.resolve(__dirname, '..', '..', '..', 'backend'),
  });

  // Write bootstrap config to fd3
  const fd3 = (backendProcess.stdio as any)[3] as NodeJS.WritableStream;
  fd3.write(JSON.stringify(bootstrapConfig) + '\n');
  fd3.end();

  // Capture backend stderr for logging
  backendProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[backend stderr] ${data.toString().trimEnd()}`);
  });

  backendProcess.on('exit', (code, signal) => {
    console.log(`[backend] exited code=${code} signal=${signal}`);
  });

  // Wait for READY signal on backend stdout
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Backend did not send READY within 10 seconds'));
    }, 10_000);

    let buffer = '';
    backendProcess!.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      for (const line of lines) {
        if (line.trim() === 'READY') {
          clearTimeout(timeout);
          resolve();
          return;
        }
        if (line.trim()) {
          console.log(`[backend] ${line.trim()}`);
        }
      }
      // Keep last partial line in buffer
      buffer = lines[lines.length - 1];
    });

    backendProcess!.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    backendProcess!.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Backend exited with code ${code} before sending READY`));
    });
  });

  console.log(`[main] Backend ready at ${backendUrl}`);

  // Create the browser window (hidden until ready-to-show)
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // In dev, load the frontend dev server; in production, load the built files
  const frontendUrl = process.env.CLAUDETREE_FRONTEND_URL || 'http://localhost:5173';
  mainWindow.loadURL(frontendUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Register IPC handlers
  ipcMain.handle(IPC.CT_GET_BACKEND_URL, () => {
    return `${backendUrl}?token=${authToken}`;
  });

  ipcMain.handle(IPC.CT_PICK_FOLDER, async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(IPC.CT_CONFIRM, async (_, message: string) => {
    if (!mainWindow) return false;
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Cancel', 'OK'],
      defaultId: 1,
      message,
    });
    return result.response === 1;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (backendProcess) {
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
});
