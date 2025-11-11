/**
 * Render loop controller for XMB browser
 * Manages high-frequency (60fps) and low-frequency (15fps) render loops
 * Includes integrated debug stats for performance monitoring
 */

export type RenderMode = 'idle' | 'high-freq' | 'low-freq';

export interface RenderLoopState {
  isDragging: boolean;
  isMomentum: boolean;
  isSnapping: boolean;
  hasAnimations: boolean;
  isPlaying: boolean;
}

export interface RenderLoopCallbacks {
  onHighFreqFrame: (timestamp: number) => RenderLoopState & { needsContinue: boolean };
  onLowFreqFrame: (timestamp: number) => void;
}

export interface DebugStats {
  frameTimes: number[];
  lastFrameTime: number;
  fps: number;
  avgFrameTime: number;
  mode: RenderMode;
  maxFrameTime: number;
  minFrameTime: number;
  frameSpikes: number;
}

export class RenderLoopController {
  private animationFrameId: number | null = null;
  private intervalId: number | null = null;
  private currentMode: RenderMode = 'idle';
  private callbacks: RenderLoopCallbacks;
  private isTabVisible = true;
  private tracePerformance: boolean;

  // Integrated debug stats
  private stats: DebugStats = {
    frameTimes: [],
    lastFrameTime: 0,
    fps: 0,
    avgFrameTime: 0,
    mode: 'idle',
    maxFrameTime: 0,
    minFrameTime: Infinity,
    frameSpikes: 0,
  };

  constructor(callbacks: RenderLoopCallbacks, tracePerformance = false) {
    this.callbacks = callbacks;
    this.tracePerformance = tracePerformance;

    // Listen for visibility changes
    document.addEventListener('visibilitychange', () => {
      this.isTabVisible = !document.hidden;
    });
  }

  /**
   * Update render strategy based on what needs rendering
   */
  updateStrategy(
    isDragging: boolean,
    isMomentumActive: boolean,
    hasActiveAnimations: boolean,
    isPlaying: boolean
  ): void {
    const needsHighFreq = isDragging || isMomentumActive || hasActiveAnimations;
    const needsLowFreq = isPlaying && this.isTabVisible;

    if (needsHighFreq) {
      this.ensureHighFrequency();
    } else if (needsLowFreq) {
      this.ensureLowFrequency();
    } else {
      this.stopAll();
    }
  }

  /**
   * Ensure high-frequency loop is running (called from external events)
   */
  ensureHighFrequencyLoop(): void {
    this.ensureHighFrequency();
  }

  /**
   * Ensure high-frequency loop is running
   */
  private ensureHighFrequency(): void {
    if (this.animationFrameId) {
      return; // Already running
    }

    const oldMode = this.currentMode;
    this.stopLowFrequency();
    this.currentMode = 'high-freq';
    this.stats.mode = 'high-freq'; // Update stats mode immediately
    
    if (this.tracePerformance && oldMode !== 'high-freq') {
      console.log(`[RenderLoop] ${oldMode} → high-freq`);
    }
    
    this.startHighFrequency();
  }

  /**
   * Ensure low-frequency loop is running
   */
  private ensureLowFrequency(): void {
    if (this.intervalId) {
      return; // Already running
    }

    const oldMode = this.currentMode;
    this.stopHighFrequency();
    this.currentMode = 'low-freq';
    this.stats.mode = 'low-freq'; // Update stats mode immediately
    
    if (this.tracePerformance && oldMode !== 'low-freq') {
      console.log(`[RenderLoop] ${oldMode} → low-freq`);
    }
    
    this.startLowFrequency();
  }

  /**
   * Start high-frequency render loop (60fps)
   */
  private startHighFrequency(): void {
    const animate = (): void => {
      const timestamp = performance.now();

      // Call frame callback - returns state and whether to continue
      const state = this.callbacks.onHighFreqFrame(timestamp);

      // Update debug stats with actual state
      this.updateDebugStats(timestamp, {
        mode: 'high-freq',
        ...state,
      });

      if (state.needsContinue) {
        this.animationFrameId = requestAnimationFrame(animate);
      } else {
        // Loop done - reset timing and update strategy
        this.animationFrameId = null;
        this.resetTiming();
        this.updateStrategy(
          state.isDragging,
          state.isMomentum,
          state.hasAnimations,
          state.isPlaying
        );
      }
    };

    animate();
  }

  /**
   * Start low-frequency render loop (15fps)
   */
  private startLowFrequency(): void {
    this.intervalId = window.setInterval(() => {
      const timestamp = performance.now();

      // Don't update debug stats in low-freq mode - it's not measuring actual frame times
      // Just update the mode so the overlay shows correct state
      this.stats.mode = 'low-freq';

      this.callbacks.onLowFreqFrame(timestamp);
    }, 1000 / 15); // ~67ms between updates
  }

  /**
   * Stop high-frequency loop
   */
  private stopHighFrequency(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
      this.resetTiming();
    }
  }

  /**
   * Stop low-frequency loop
   */
  private stopLowFrequency(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Stop all render loops
   */
  private stopAll(): void {
    const oldMode = this.currentMode;
    this.stopHighFrequency();
    this.stopLowFrequency();
    this.currentMode = 'idle';
    this.stats.mode = 'idle'; // Update stats mode immediately
    
    if (this.tracePerformance && oldMode !== 'idle') {
      console.log(`[RenderLoop] ${oldMode} → idle`);
    }
  }

  /**
   * Get current render mode
   */
  getMode(): RenderMode {
    return this.currentMode;
  }

  /**
   * Update trace performance flag
   */
  setTracePerformance(enabled: boolean): void {
    this.tracePerformance = enabled;
  }

  // ============================================================================
  // DEBUG STATS (integrated)
  // ============================================================================

  /**
   * Update debug statistics for performance monitoring
   */
  private updateDebugStats(
    timestamp: number,
    context: {
      mode: RenderMode;
      isDragging: boolean;
      isMomentum: boolean;
      isSnapping: boolean;
      hasAnimations: boolean;
      isPlaying: boolean;
    }
  ): void {
    this.stats.mode = context.mode;

    // Measure frame time if we have a previous timestamp
    if (this.stats.lastFrameTime > 0) {
      const frameTime = timestamp - this.stats.lastFrameTime;

      // Track min/max frame times
      this.stats.maxFrameTime = Math.max(this.stats.maxFrameTime, frameTime);
      this.stats.minFrameTime = Math.min(this.stats.minFrameTime, frameTime);

      // Count frame spikes (>33ms = <30fps)
      if (frameTime > 33) {
        this.stats.frameSpikes++;
        
        // Log frame spikes if tracing enabled
        if (this.tracePerformance) {
          console.warn(`[RenderLoop] Frame spike: ${frameTime.toFixed(2)}ms`, {
            mode: context.mode,
            isDragging: context.isDragging,
            isMomentum: context.isMomentum,
            isSnapping: context.isSnapping,
            hasAnimations: context.hasAnimations,
            isPlaying: context.isPlaying,
          });
        }
      }

      // Keep sliding window of 60 frames
      this.stats.frameTimes.push(frameTime);
      if (this.stats.frameTimes.length > 60) {
        this.stats.frameTimes.shift();
      }

      // Calculate average
      this.stats.avgFrameTime =
        this.stats.frameTimes.reduce((a, b) => a + b, 0) / this.stats.frameTimes.length;

      // Calculate FPS
      this.stats.fps = 1000 / this.stats.avgFrameTime;
    }

    // Update lastFrameTime for next measurement
    this.stats.lastFrameTime = timestamp;
  }

  /**
   * Reset debug statistics (useful for testing specific interactions)
   */
  resetDebugStats(): void {
    this.stats.maxFrameTime = 0;
    this.stats.minFrameTime = Infinity;
    this.stats.frameSpikes = 0;
    this.stats.frameTimes = [];
    console.log('[XMB] Debug stats reset');
  }

  /**
   * Reset frame timing (called when render loop stops to avoid false spikes on restart)
   */
  private resetTiming(): void {
    this.stats.lastFrameTime = 0;
  }

  /**
   * Get debug statistics
   */
  getDebugStats(): DebugStats {
    return this.stats;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopAll();
  }
}
