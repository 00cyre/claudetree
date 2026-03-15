/**
 * Demo mode entry point.
 *
 * Activates when `?demo` or `?demo=true` is in the URL.
 * Installs mock API, SSE, and WebSocket interceptors.
 */
import { installMockApi, uninstallMockApi, resetMockApi } from './mock-api';
import { installMockSSE, uninstallMockSSE } from './mock-sse';
import { installMockWebSocket, uninstallMockWebSocket, setDemoSpeed } from './mock-websocket';

export function isDemoMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has('demo');
}

export function activateDemo() {
  installMockApi();
  installMockSSE();
  installMockWebSocket();
}

export function deactivateDemo() {
  uninstallMockApi();
  uninstallMockSSE();
  uninstallMockWebSocket();
}

export function resetDemo() {
  resetMockApi();
}

export function setSpeed(speed: number) {
  setDemoSpeed(speed);
}
