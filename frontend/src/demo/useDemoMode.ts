import { useState, useCallback, useRef } from 'react';
import { isDemoMode } from './index';
import { enterSlide, cleanupSlide, DEMO_PHASES, type DemoPhase, type SlideCallbacks } from './timeline';

interface DemoModeState {
  active: boolean;
  phase: DemoPhase;
  slideIndex: number;
  next: () => void;
  prev: () => void;
  bindCallbacks: (cbs: SlideCallbacks) => void;
}

export function useDemoMode(): DemoModeState {
  const active = isDemoMode();
  const [slideIndex, setSlideIndex] = useState(0);
  const callbacksRef = useRef<SlideCallbacks | null>(null);
  const initialEnteredRef = useRef(false);

  const phase = DEMO_PHASES[slideIndex] ?? 'idle';

  const bindCallbacks = useCallback((cbs: SlideCallbacks) => {
    callbacksRef.current = cbs;

    // Auto-enter the first slide when callbacks are bound for the first time
    if (!initialEnteredRef.current) {
      initialEnteredRef.current = true;
      setTimeout(() => {
        enterSlide(DEMO_PHASES[0], cbs);
      }, 100);
    }
  }, []);

  const next = useCallback(() => {
    setSlideIndex(prev => {
      const nextIdx = Math.min(prev + 1, DEMO_PHASES.length - 1);
      if (nextIdx !== prev && callbacksRef.current) {
        cleanupSlide();
        // Use setTimeout to ensure state update happens first
        setTimeout(() => {
          enterSlide(DEMO_PHASES[nextIdx], callbacksRef.current!);
        }, 0);
      }
      return nextIdx;
    });
  }, []);

  const prev = useCallback(() => {
    setSlideIndex(prev => {
      const prevIdx = Math.max(prev - 1, 0);
      if (prevIdx !== prev && callbacksRef.current) {
        cleanupSlide();
        setTimeout(() => {
          enterSlide(DEMO_PHASES[prevIdx], callbacksRef.current!);
        }, 0);
      }
      return prevIdx;
    });
  }, []);

  return {
    active,
    phase,
    slideIndex,
    next,
    prev,
    bindCallbacks,
  };
}
