/**
 * Mocks EventSource for the /api/status/stream endpoint.
 * Emits scripted SSE status updates driven by the demo timeline.
 */
import type { SessionStatus, PipelineStatus, PRWatcherStatus } from '@/types';
import { createSessionStatus } from './mock-data';

let activeInstance: DemoEventSource | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let originalEventSource: typeof EventSource | null = null;

// Current demo state — mutated by the timeline controller
let currentSessions: Record<string, SessionStatus> = {};
let currentPipelines: Record<string, PipelineStatus> = {};
let currentPRWatchers: Record<string, PRWatcherStatus> = {};

export function setDemoSessions(sessions: Record<string, SessionStatus>) {
  currentSessions = sessions;
}

export function setDemoPipelines(pipelines: Record<string, PipelineStatus>) {
  currentPipelines = pipelines;
}

export function setDemoPRWatchers(prWatchers: Record<string, PRWatcherStatus>) {
  currentPRWatchers = prWatchers;
}

function emitSSE() {
  if (!activeInstance) return;

  const data = JSON.stringify({
    sessions: currentSessions,
    pipelines: currentPipelines,
    prWatchers: currentPRWatchers,
  });

  const event = new MessageEvent('message', { data });
  activeInstance._emit(event);
}

/**
 * Standalone mock that implements the subset of EventSource
 * used by useWorktreeStatuses (onmessage, onerror, close, readyState).
 * Does NOT inherit from the native EventSource prototype to avoid
 * browser SES/lockdown checks on the native setter.
 */
class DemoEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  readyState = DemoEventSource.CONNECTING;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  url: string;
  withCredentials = false;

  constructor(url: string) {
    this.url = url;
  }

  _emit(event: MessageEvent) {
    this.onmessage?.(event);
  }

  close() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    this.readyState = DemoEventSource.CLOSED;
    activeInstance = null;
  }

  // Stubs for EventSource interface
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return false; }
  CONNECTING = 0;
  OPEN = 1;
  CLOSED = 2;
}

export function installMockSSE() {
  if (originalEventSource) return;
  originalEventSource = window.EventSource;

  // Set up initial state for existing worktrees
  currentSessions = {
    'demo-wt-auth': createSessionStatus('active', 'Refactoring auth middleware'),
    'demo-wt-dashboard': createSessionStatus('idle'),
  };
  currentPipelines = {};
  currentPRWatchers = {};

  // Replace EventSource globally
  window.EventSource = function (url: string) {
    if (url === '/api/status/stream') {
      const instance = new DemoEventSource(url);
      activeInstance = instance;

      // Simulate async connection open
      setTimeout(() => {
        instance.readyState = DemoEventSource.OPEN;
        emitSSE();

        // Emit every 1 second
        intervalId = setInterval(emitSSE, 1000);
      }, 50);

      return instance;
    }

    // Delegate non-SSE EventSources to original
    return new originalEventSource!(url);
  } as unknown as typeof EventSource;

  // Set static constants
  Object.defineProperty(window.EventSource, 'CONNECTING', { value: 0 });
  Object.defineProperty(window.EventSource, 'OPEN', { value: 1 });
  Object.defineProperty(window.EventSource, 'CLOSED', { value: 2 });
}

export function uninstallMockSSE() {
  if (activeInstance) {
    activeInstance.close();
  }
  if (originalEventSource) {
    window.EventSource = originalEventSource;
    originalEventSource = null;
  }
}

/** Force an immediate SSE emit (useful after state changes) */
export function flushSSE() {
  emitSSE();
}
