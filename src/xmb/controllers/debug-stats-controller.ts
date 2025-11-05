/**
 * Debug statistics controller for performance monitoring
 * Tracks frame times, FPS, and performance metrics
 */
export interface DebugStats {
  frameTimes: number[];
  lastFrameTime: number;
  fps: number;
  avgFrameTime: number;
  mode: 'idle' | 'high-freq' | 'low-freq';
  maxFrameTime: number;
  minFrameTime: number;
  frameSpikes: number;
}

export class DebugStatsController {
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

  /**
   * Update debug statistics for performance monitoring
   */
  update(timestamp: number, context: {
    mode: 'idle' | 'high-freq' | 'low-freq';
    isDragging: boolean;
    isMomentum: boolean;
    isSnapping: boolean;
    hasAnimations: boolean;
    isPlaying: boolean;
  }): void {
    this.stats.mode = context.mode;

    if (this.stats.lastFrameTime > 0) {
      const frameTime = timestamp - this.stats.lastFrameTime;
      
      // Track min/max frame times
      this.stats.maxFrameTime = Math.max(this.stats.maxFrameTime, frameTime);
      this.stats.minFrameTime = Math.min(this.stats.minFrameTime, frameTime);
      
      // Count frame spikes (>33ms = <30fps)
      if (frameTime > 33) {
        this.stats.frameSpikes++;
        // Log detailed info about frame spikes for debugging
        console.warn(`[XMB] Frame spike detected: ${frameTime.toFixed(2)}ms`, {
          mode: context.mode,
          isDragging: context.isDragging,
          isMomentum: context.isMomentum,
          isSnapping: context.isSnapping,
          hasAnimations: context.hasAnimations,
          isPlaying: context.isPlaying,
          timestamp: timestamp.toFixed(2),
        });
      }
      
      // Keep sliding window of 60 frames
      this.stats.frameTimes.push(frameTime);
      if (this.stats.frameTimes.length > 60) {
        this.stats.frameTimes.shift();
      }
      
      // Calculate average
      this.stats.avgFrameTime = 
        this.stats.frameTimes.reduce((a, b) => a + b, 0) / 
        this.stats.frameTimes.length;
      
      // Calculate FPS
      this.stats.fps = 1000 / this.stats.avgFrameTime;
    }
    
    this.stats.lastFrameTime = timestamp;
  }

  /**
   * Reset debug statistics (useful for testing specific interactions)
   */
  reset(): void {
    this.stats.maxFrameTime = 0;
    this.stats.minFrameTime = Infinity;
    this.stats.frameSpikes = 0;
    this.stats.frameTimes = [];
    console.log('[XMB] Debug stats reset');
  }

  /**
   * Get current debug statistics
   */
  getStats(): DebugStats {
    return this.stats;
  }
}
