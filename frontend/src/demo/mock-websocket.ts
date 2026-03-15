/**
 * Mocks WebSocket connections to /terminal/* endpoints.
 * Plays scripted terminal output through the real xterm.js rendering.
 *
 * Uses a standalone class (not inheriting native WebSocket prototype)
 * to avoid SES/lockdown checks on native property setters.
 */
import { SCRIPTS } from './terminal-script';

let originalWebSocket: typeof WebSocket | null = null;
let activeTimers: ReturnType<typeof setTimeout>[] = [];
let speedMultiplier = 1;
let currentScriptId = 'dev';
let activeInstances: MockTerminalWebSocket[] = [];

export function setDemoSpeed(speed: number) {
  speedMultiplier = speed;
}

export function setDemoTerminalScript(scriptId: string) {
  currentScriptId = scriptId;
}

export function destroyDemoTerminals() {
  for (const t of activeTimers) clearTimeout(t);
  activeTimers = [];
  for (const ws of activeInstances) {
    if (ws.readyState === 1) {
      ws.readyState = 3;
      ws.onclose?.(new CloseEvent('close', { code: 1000 }));
    }
  }
  activeInstances = [];
}

class MockTerminalWebSocket {
  readyState = 0; // CONNECTING

  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;

  // WebSocket interface stubs
  url: string;
  protocol = '';
  extensions = '';
  bufferedAmount = 0;
  binaryType: BinaryType = 'blob';

  CONNECTING = 0;
  OPEN = 1;
  CLOSING = 2;
  CLOSED = 3;

  private _started = false;
  private _scriptId: string;

  constructor(url: string) {
    this.url = url;
    this._scriptId = currentScriptId;
    activeInstances.push(this);

    // Simulate connection open after a brief delay
    const openTimer = setTimeout(() => {
      this.readyState = 1; // OPEN
      this.onopen?.(new Event('open'));
    }, 80);
    activeTimers.push(openTimer);
  }

  send(data: string) {
    // Handle resize message from terminal-sessions.ts
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'resize' && !this._started) {
        this._started = true;
        this._playScript();
      }
    } catch {
      // User input — ignore in demo mode
    }
  }

  close(code?: number) {
    this.readyState = 3; // CLOSED
    this.onclose?.(new CloseEvent('close', { code: code ?? 1000 }));
  }

  // Stubs for EventTarget interface
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return false; }

  private _playScript() {
    const script = SCRIPTS[this._scriptId] ?? SCRIPTS['dev'];
    let elapsed = 0;

    for (const line of script) {
      elapsed += line.delay / speedMultiplier;

      const timer = setTimeout(() => {
        if (this.readyState !== 1) return; // not OPEN
        this.onmessage?.(new MessageEvent('message', { data: line.text }));
      }, elapsed);

      activeTimers.push(timer);
    }

    // Close the connection after the script finishes
    const closeTimer = setTimeout(() => {
      if (this.readyState === 1) { // OPEN
        this.readyState = 3; // CLOSED
        this.onclose?.(new CloseEvent('close', { code: 1000, reason: '' }));
      }
    }, elapsed + 500 / speedMultiplier);

    activeTimers.push(closeTimer);
  }
}

export function installMockWebSocket() {
  if (originalWebSocket) return;
  originalWebSocket = window.WebSocket;

  window.WebSocket = function (url: string, protocols?: string | string[]) {
    // Intercept terminal connections
    if (url.includes('/terminal/')) {
      return new MockTerminalWebSocket(url) as unknown as WebSocket;
    }

    // Delegate everything else to the real WebSocket
    return new originalWebSocket!(url, protocols);
  } as unknown as typeof WebSocket;

  // Set static constants
  Object.defineProperty(window.WebSocket, 'CONNECTING', { value: 0 });
  Object.defineProperty(window.WebSocket, 'OPEN', { value: 1 });
  Object.defineProperty(window.WebSocket, 'CLOSING', { value: 2 });
  Object.defineProperty(window.WebSocket, 'CLOSED', { value: 3 });
}

export function uninstallMockWebSocket() {
  destroyDemoTerminals();

  if (originalWebSocket) {
    window.WebSocket = originalWebSocket;
    originalWebSocket = null;
  }
}
