import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRestTimer } from '../useRestTimer';

describe('useRestTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should start at 0 elapsed seconds', () => {
      const { result } = renderHook(() => useRestTimer({ targetSeconds: 60 }));
      expect(result.current.elapsedSeconds).toBe(0);
    });

    it('should not be running initially', () => {
      const { result } = renderHook(() => useRestTimer({ targetSeconds: 60 }));
      expect(result.current.isRunning).toBe(false);
    });

    it('should not be complete initially', () => {
      const { result } = renderHook(() => useRestTimer({ targetSeconds: 60 }));
      expect(result.current.isComplete).toBe(false);
    });

    it('should not be dismissed initially', () => {
      const { result } = renderHook(() => useRestTimer({ targetSeconds: 60 }));
      expect(result.current.isDismissed).toBe(false);
    });
  });

  describe('timer counting', () => {
    it('should count up correctly when started', () => {
      const { result } = renderHook(() => useRestTimer({ targetSeconds: 60 }));

      act(() => {
        result.current.start();
      });

      expect(result.current.isRunning).toBe(true);
      expect(result.current.elapsedSeconds).toBe(0);

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(result.current.elapsedSeconds).toBe(1);

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.elapsedSeconds).toBe(6);
    });

    it('should stop counting when target is reached', () => {
      const { result } = renderHook(() => useRestTimer({ targetSeconds: 3 }));

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.elapsedSeconds).toBe(3);
      expect(result.current.isComplete).toBe(true);
      expect(result.current.isRunning).toBe(false);
    });

    it('should not overflow past target seconds', () => {
      const { result } = renderHook(() => useRestTimer({ targetSeconds: 2 }));

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(result.current.elapsedSeconds).toBe(2);
    });
  });

  describe('completion callback', () => {
    it('should fire onComplete callback when target is reached', () => {
      const onComplete = vi.fn();
      const { result } = renderHook(() =>
        useRestTimer({ targetSeconds: 2, onComplete })
      );

      act(() => {
        result.current.start();
      });

      expect(onComplete).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('should not fire onComplete callback multiple times', () => {
      const onComplete = vi.fn();
      const { result } = renderHook(() =>
        useRestTimer({ targetSeconds: 2, onComplete })
      );

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe('reset functionality', () => {
    it('should reset elapsed time to 0', () => {
      const { result } = renderHook(() => useRestTimer({ targetSeconds: 60 }));

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(result.current.elapsedSeconds).toBe(10);

      act(() => {
        result.current.reset();
      });

      expect(result.current.elapsedSeconds).toBe(0);
      expect(result.current.isRunning).toBe(false);
      expect(result.current.isComplete).toBe(false);
    });

    it('should reset completion state', () => {
      const { result } = renderHook(() => useRestTimer({ targetSeconds: 2 }));

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(result.current.isComplete).toBe(true);

      act(() => {
        result.current.reset();
      });

      expect(result.current.isComplete).toBe(false);
      expect(result.current.isDismissed).toBe(false);
    });

    it('should allow starting again after reset', () => {
      const onComplete = vi.fn();
      const { result } = renderHook(() =>
        useRestTimer({ targetSeconds: 2, onComplete })
      );

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(onComplete).toHaveBeenCalledTimes(1);

      act(() => {
        result.current.reset();
      });

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(onComplete).toHaveBeenCalledTimes(2);
    });
  });

  describe('dismiss functionality', () => {
    it('should stop timer and mark as dismissed', () => {
      const { result } = renderHook(() => useRestTimer({ targetSeconds: 60 }));

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      act(() => {
        result.current.dismiss();
      });

      expect(result.current.isRunning).toBe(false);
      expect(result.current.isDismissed).toBe(true);
    });

    it('should not continue counting after dismiss', () => {
      const { result } = renderHook(() => useRestTimer({ targetSeconds: 60 }));

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      const elapsedAtDismiss = result.current.elapsedSeconds;

      act(() => {
        result.current.dismiss();
      });

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.elapsedSeconds).toBe(elapsedAtDismiss);
    });

    it('should not allow starting after dismiss', () => {
      const { result } = renderHook(() => useRestTimer({ targetSeconds: 60 }));

      act(() => {
        result.current.start();
      });

      act(() => {
        result.current.dismiss();
      });

      act(() => {
        result.current.start();
      });

      expect(result.current.isRunning).toBe(false);
    });
  });

  describe('pause and resume', () => {
    it('should pause the timer', () => {
      const { result } = renderHook(() => useRestTimer({ targetSeconds: 60 }));

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      act(() => {
        result.current.pause();
      });

      expect(result.current.isRunning).toBe(false);
      expect(result.current.elapsedSeconds).toBe(5);

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.elapsedSeconds).toBe(5);
    });

    it('should resume the timer from paused state', () => {
      const { result } = renderHook(() => useRestTimer({ targetSeconds: 60 }));

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      act(() => {
        result.current.pause();
      });

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(result.current.elapsedSeconds).toBe(8);
      expect(result.current.isRunning).toBe(true);
    });
  });

  describe('initialElapsed option', () => {
    it('should start with initial elapsed time if provided', () => {
      const { result } = renderHook(() =>
        useRestTimer({ targetSeconds: 60, initialElapsed: 30 })
      );

      expect(result.current.elapsedSeconds).toBe(30);
    });

    it('should continue counting from initial elapsed', () => {
      const { result } = renderHook(() =>
        useRestTimer({ targetSeconds: 60, initialElapsed: 30 })
      );

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.elapsedSeconds).toBe(35);
    });

    it('should immediately complete if initial elapsed >= target', () => {
      const onComplete = vi.fn();
      const { result } = renderHook(() =>
        useRestTimer({ targetSeconds: 30, initialElapsed: 35, onComplete })
      );

      expect(result.current.isComplete).toBe(true);
      expect(result.current.elapsedSeconds).toBe(30);
    });
  });

  describe('cleanup', () => {
    it('should clean up interval on unmount', () => {
      const { result, unmount } = renderHook(() =>
        useRestTimer({ targetSeconds: 60 })
      );

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.elapsedSeconds).toBe(5);

      unmount();

      // Interval should be cleared, no errors should occur
      act(() => {
        vi.advanceTimersByTime(5000);
      });
    });
  });
});
