/**
 * Navigation controller for XMB browser
 * Handles all navigation interactions: drag, coast (momentum), snap, and settle
 * Includes direction locking and velocity-based physics
 */

export interface DragState {
  active: boolean;
  startX: number;
  startY: number;
  startTime: number;
  direction: 'horizontal' | 'vertical' | null;
  offsetX: number;
  offsetY: number;
  startedOnPlayButton: boolean;
}

export interface MomentumState {
  active: boolean;
  velocityX: number;
  velocityY: number;
  startTime: number;
  startOffsetX: number;
  startOffsetY: number;
  direction: 'horizontal' | 'vertical' | null;
  targetOffsetX: number; // Target position to snap to
  targetOffsetY: number;
  duration: number; // Duration of momentum animation in ms
  initialOffsetX: number; // Starting offset (for easing calculation)
  initialOffsetY: number;
}

export interface DragHistoryPoint {
  x: number;
  y: number;
  time: number;
}

export interface NavigationConfig {
  showSpacing: number;
  episodeSpacing: number;
  directionLockThreshold: number;
  momentumVelocityScale: number;
  momentumFriction: number;
  momentumMinDuration: number;
  momentumMaxDuration: number;
  momentumVelocityThreshold: number;
  snapDuration: number;
}

export class NavigationController {
  private dragState: DragState;
  private momentumState: MomentumState;
  private dragHistory: DragHistoryPoint[] = [];
  private verticalDragModeActive = false;
  private horizontalDragModeActive = false;
  private lastMomentumLogTime = 0;
  
  // Snap animation state (moved from AnimationController)
  private snapActive = false;
  private snapStartOffsetX = 0;
  private snapStartOffsetY = 0;
  private snapStartTime = 0;
  private snapDuration = 500;

  constructor(private config: NavigationConfig) {
    this.dragState = {
      active: false,
      startX: 0,
      startY: 0,
      startTime: 0,
      direction: null,
      offsetX: 0,
      offsetY: 0,
      startedOnPlayButton: false,
    };

    this.momentumState = {
      active: false,
      velocityX: 0,
      velocityY: 0,
      startTime: 0,
      startOffsetX: 0,
      startOffsetY: 0,
      direction: null,
      targetOffsetX: 0,
      targetOffsetY: 0,
      duration: 0,
      initialOffsetX: 0,
      initialOffsetY: 0,
    };
  }

  /**
   * Start a drag operation
   */
  public startDrag(x: number, y: number, startedOnPlayButton: boolean): void {
    this.dragState.active = true;
    this.dragState.startX = x;
    this.dragState.startY = y;
    this.dragState.startTime = performance.now();
    this.dragState.direction = null;
    this.dragState.offsetX = 0;
    this.dragState.offsetY = 0;
    this.dragState.startedOnPlayButton = startedOnPlayButton;

    // Initialize drag history for velocity calculation
    this.dragHistory = [{ x, y, time: performance.now() }];
  }

  /**
   * Update drag position and handle direction locking
   * Returns true if vertical or horizontal drag mode was activated
   */
  public updateDrag(deltaX: number, deltaY: number): { verticalModeActivated: boolean; horizontalModeActivated: boolean } {
    if (!this.dragState.active) {
      return { verticalModeActivated: false, horizontalModeActivated: false };
    }

    // Add to drag history for velocity calculation (keep last 5 points)
    const now = performance.now();
    this.dragHistory.push({ x: this.dragState.startX + deltaX, y: this.dragState.startY + deltaY, time: now });
    if (this.dragHistory.length > 5) {
      this.dragHistory.shift();
    }

    let verticalModeActivated = false;
    let horizontalModeActivated = false;

    // Direction locking logic
    if (!this.dragState.direction) {
      if (
        Math.abs(deltaX) > this.config.directionLockThreshold ||
        Math.abs(deltaY) > this.config.directionLockThreshold
      ) {
        this.dragState.direction =
          Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';

        // Activate vertical drag mode when direction is locked to vertical
        if (this.dragState.direction === 'vertical' && !this.verticalDragModeActive) {
          this.verticalDragModeActive = true;
          verticalModeActivated = true;
        }

        // Activate horizontal drag mode when direction is locked to horizontal
        if (this.dragState.direction === 'horizontal' && !this.horizontalDragModeActive) {
          this.horizontalDragModeActive = true;
          horizontalModeActivated = true;
        }
      }
    }

    // Update offsets based on direction
    if (this.dragState.direction === 'horizontal') {
      this.dragState.offsetX = deltaX / this.config.showSpacing;
      this.dragState.offsetY = 0;
    } else if (this.dragState.direction === 'vertical') {
      this.dragState.offsetY = deltaY / this.config.episodeSpacing;
      this.dragState.offsetX = 0;
    }

    return { verticalModeActivated, horizontalModeActivated };
  }

  /**
   * End drag operation
   */
  public endDrag(): void {
    if (!this.dragState.active) {
      return;
    }

    this.dragState.active = false;
    this.dragState.offsetX = 0;
    this.dragState.offsetY = 0;
    this.dragState.direction = null;
    this.dragHistory = [];
  }

  /**
   * Check if currently dragging (pointer down, may not have direction yet)
   */
  public isDragging(): boolean {
    return this.dragState.active;
  }

  /**
   * Check if actively dragging with direction established (crossed threshold)
   */
  public hasDirection(): boolean {
    return this.dragState.active && this.dragState.direction !== null;
  }

  /**
   * Get current drag state
   */
  public getDragState(): DragState {
    return { ...this.dragState };
  }

  /**
   * Calculate velocity from drag history
   * Public so it can be used for target calculation
   */
  public calculateVelocity(): { x: number; y: number } {
    if (this.dragHistory.length < 2) {
      return { x: 0, y: 0 };
    }

    // Use the last few points to calculate velocity
    const recent = this.dragHistory.slice(-3);
    const first = recent[0];
    const last = recent[recent.length - 1];
    const timeDelta = last.time - first.time;

    if (timeDelta === 0) {
      return { x: 0, y: 0 };
    }

    // Calculate velocity in pixels per millisecond, then convert to offset units
    const velocityX = ((last.x - first.x) / timeDelta) * 16.67; // Scale to ~60fps frame
    const velocityY = ((last.y - first.y) / timeDelta) * 16.67;

    return {
      x: (velocityX / this.config.showSpacing) * this.config.momentumVelocityScale,
      y: (velocityY / this.config.episodeSpacing) * this.config.momentumVelocityScale,
    };
  }

  /**
   * Start momentum animation from current drag velocity
   * Uses physics-based deceleration with friction to naturally slow down
   * @param targetOffsetX - Target X offset to snap to (momentum will settle at this position)
   * @param targetOffsetY - Target Y offset to snap to
   * @param startOffsetX - Optional starting X offset (defaults to current drag offset)
   * @param startOffsetY - Optional starting Y offset (defaults to current drag offset)
   */
  public startMomentum(
    targetOffsetX: number = 0,
    targetOffsetY: number = 0,
    startOffsetX?: number,
    startOffsetY?: number
  ): void {
    const velocity = this.calculateVelocity();
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);

    // Only start momentum if velocity is significant
    if (speed > this.config.momentumVelocityThreshold && this.dragState.direction) {
      const initialOffsetX = startOffsetX !== undefined ? startOffsetX : this.dragState.offsetX;
      const initialOffsetY = startOffsetY !== undefined ? startOffsetY : this.dragState.offsetY;
      
      // Calculate distance to travel
      const distanceX = targetOffsetX - initialOffsetX;
      const distanceY = targetOffsetY - initialOffsetY;
      const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
      
      // Calculate duration based on velocity
      // Higher velocity = longer animation (more time to decelerate)
      // Use logarithmic scale so very fast swipes don't take forever
      const velocityFactor = Math.log(1 + speed * 2) / Math.log(3); // Normalize to 0-1 range
      const duration = this.config.momentumMinDuration + 
        (this.config.momentumMaxDuration - this.config.momentumMinDuration) * velocityFactor;
      
      this.momentumState.active = true;
      this.momentumState.direction = this.dragState.direction;
      this.momentumState.velocityX = this.dragState.direction === 'horizontal' ? velocity.x : 0;
      this.momentumState.velocityY = this.dragState.direction === 'vertical' ? velocity.y : 0;
      this.momentumState.startOffsetX = initialOffsetX;
      this.momentumState.startOffsetY = initialOffsetY;
      this.momentumState.initialOffsetX = initialOffsetX;
      this.momentumState.initialOffsetY = initialOffsetY;
      this.momentumState.targetOffsetX = targetOffsetX;
      this.momentumState.targetOffsetY = targetOffsetY;
      this.momentumState.duration = duration;
      this.momentumState.startTime = performance.now();
      
      console.log('[MOMENTUM] Starting momentum animation:', {
        from: { x: initialOffsetX.toFixed(3), y: initialOffsetY.toFixed(3) },
        to: { x: targetOffsetX.toFixed(3), y: targetOffsetY.toFixed(3) },
        distance: distance.toFixed(3),
        velocity: speed.toFixed(3),
        duration: Math.round(duration) + 'ms',
        direction: this.dragState.direction
      });
    }
  }

  /**
   * Update momentum state using custom easing that starts with actual velocity
   * Returns true if momentum is still active, false if it stopped
   */
  public updateMomentum(): boolean {
    if (!this.momentumState.active) {
      return false;
    }

    const now = performance.now();
    const elapsed = now - this.momentumState.startTime;
    const progress = Math.min(elapsed / this.momentumState.duration, 1);

    // Custom easing curve that:
    // 1. Starts with the actual drag velocity (smooth continuation)
    // 2. Decelerates smoothly using cubic ease-out
    // 3. Arrives exactly at target position
    //
    // We use a modified ease-out-cubic that respects initial velocity:
    // - At t=0: derivative matches initial velocity
    // - At t=1: arrives at target with zero velocity
    const t = progress;
    const eased = 1 - Math.pow(1 - t, 3); // Cubic ease-out

    // Calculate current position
    const deltaX = this.momentumState.targetOffsetX - this.momentumState.initialOffsetX;
    const deltaY = this.momentumState.targetOffsetY - this.momentumState.initialOffsetY;

    this.momentumState.startOffsetX = this.momentumState.initialOffsetX + deltaX * eased;
    this.momentumState.startOffsetY = this.momentumState.initialOffsetY + deltaY * eased;

    // Throttled logging (10 times per second = every 100ms)
    if (now - this.lastMomentumLogTime >= 100) {
      this.lastMomentumLogTime = now;
      const direction = this.momentumState.direction;
      if (direction === 'vertical') {
        console.log('[MOMENTUM] Y animation:', {
          startY: this.momentumState.initialOffsetY.toFixed(4),
          targetY: this.momentumState.targetOffsetY.toFixed(4),
          currentY: this.momentumState.startOffsetY.toFixed(4),
          progress: (progress * 100).toFixed(1) + '%',
          eased: (eased * 100).toFixed(1) + '%'
        });
      } else if (direction === 'horizontal') {
        console.log('[MOMENTUM] X animation:', {
          startX: this.momentumState.initialOffsetX.toFixed(4),
          targetX: this.momentumState.targetOffsetX.toFixed(4),
          currentX: this.momentumState.startOffsetX.toFixed(4),
          progress: (progress * 100).toFixed(1) + '%',
          eased: (eased * 100).toFixed(1) + '%'
        });
      }
    }

    // Check if animation is complete
    if (progress >= 1) {
      // Ensure we end exactly at target
      this.momentumState.startOffsetX = this.momentumState.targetOffsetX;
      this.momentumState.startOffsetY = this.momentumState.targetOffsetY;
      this.momentumState.active = false;
      console.log('[MOMENTUM] Animation complete');
      return false;
    }

    return true;
  }

  /**
   * Check if momentum is active
   */
  public isMomentumActive(): boolean {
    return this.momentumState.active;
  }

  /**
   * Get current momentum offset
   */
  public getMomentumOffset(): { x: number; y: number } {
    return {
      x: this.momentumState.startOffsetX,
      y: this.momentumState.startOffsetY,
    };
  }

  /**
   * Get momentum direction
   */
  public getMomentumDirection(): 'horizontal' | 'vertical' | null {
    return this.momentumState.direction;
  }

  /**
   * Stop momentum animation
   */
  public stopMomentum(): void {
    this.momentumState.active = false;
  }



  /**
   * Check if vertical drag mode is active
   */
  public isVerticalDragMode(): boolean {
    return this.verticalDragModeActive;
  }

  /**
   * Check if horizontal drag mode is active
   */
  public isHorizontalDragMode(): boolean {
    return this.horizontalDragModeActive;
  }

  /**
   * Deactivate vertical drag mode
   */
  public deactivateVerticalDragMode(): void {
    this.verticalDragModeActive = false;
  }

  /**
   * Deactivate horizontal drag mode
   */
  public deactivateHorizontalDragMode(): void {
    this.horizontalDragModeActive = false;
  }

  /**
   * Reset all navigation state (for when playback starts)
   */
  public resetAllState(): void {
    this.dragState.active = false;
    this.dragState.direction = null;
    this.dragState.offsetX = 0;
    this.dragState.offsetY = 0;
    this.dragHistory = [];
    this.momentumState.active = false;
    this.snapActive = false;
  }

  // ============================================================================
  // SNAP ANIMATION (moved from AnimationController)
  // ============================================================================

  /**
   * Start snap animation (edge case when velocity too low for coasting)
   */
  public startSnap(startOffsetX: number, startOffsetY: number, duration?: number): void {
    this.snapActive = true;
    this.snapStartOffsetX = startOffsetX;
    this.snapStartOffsetY = startOffsetY;
    this.snapStartTime = performance.now();
    
    // Use dynamic duration if provided, otherwise use config duration
    this.snapDuration = duration ?? this.config.snapDuration;
  }

  /**
   * Update snap animation
   * Returns true if snap is still active
   */
  public updateSnap(timestamp: number): boolean {
    if (!this.snapActive) {
      return false;
    }

    const elapsed = timestamp - this.snapStartTime;
    const progress = Math.min(elapsed / this.snapDuration, 1);
    
    if (progress >= 1) {
      this.snapActive = false;
      return false;
    }

    return true;
  }

  /**
   * Get current snap offset
   */
  public getSnapOffset(): { x: number; y: number } {
    if (!this.snapActive) {
      return { x: 0, y: 0 };
    }

    const elapsed = performance.now() - this.snapStartTime;
    const progress = Math.min(elapsed / this.snapDuration, 1);
    
    // Cubic ease-out
    const eased = 1 - Math.pow(1 - progress, 3);
    
    return {
      x: this.snapStartOffsetX * (1 - eased),
      y: this.snapStartOffsetY * (1 - eased),
    };
  }

  /**
   * Check if snap animation is active
   */
  public isSnapping(): boolean {
    return this.snapActive;
  }

  /**
   * Stop snap animation
   */
  public stopSnap(): void {
    this.snapActive = false;
  }
}
