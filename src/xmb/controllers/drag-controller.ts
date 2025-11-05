/**
 * Drag controller for XMB browser
 * Handles all drag and touch input, including direction locking and momentum
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

export interface DragConfig {
  showSpacing: number;
  episodeSpacing: number;
  directionLockThreshold: number;
  momentumFriction: number; // Not used in new easing-based momentum
  momentumMinVelocity: number; // Not used in new easing-based momentum
  momentumVelocityScale: number;
  tapTimeThreshold: number;
  tapDistanceThreshold: number;
  // Momentum animation tuning
  momentumBaseDuration: number; // Base duration in ms (e.g., 500)
  momentumSpeedInfluence: number; // How much velocity affects duration (e.g., 150)
  momentumDistanceInfluence: number; // How much distance affects duration (e.g., 100)
  momentumEasingPower: number; // Easing curve power: 2=quad, 3=cubic, 4=quart (lower=gentler)
}

export class DragController {
  private dragState: DragState;
  private momentumState: MomentumState;
  private dragHistory: DragHistoryPoint[] = [];
  private didDrag = false;
  private lastTouchTime = 0;
  private quickTapHandled = false;
  private circularProgressDragging = false;
  private circularProgressDragAngle = 0;
  private circularProgressLastAngle = 0;
  private verticalDragModeActive = false;
  private horizontalDragModeActive = false;

  constructor(private config: DragConfig) {
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
    this.didDrag = false;

    // Initialize drag history for velocity calculation
    this.dragHistory = [{ x, y, time: performance.now() }];
  }

  /**
   * Update drag position and handle direction locking
   * Returns true if vertical or horizontal drag mode was activated
   */
  public updateDrag(x: number, y: number): { verticalModeActivated: boolean; horizontalModeActivated: boolean } {
    if (!this.dragState.active) {
      return { verticalModeActivated: false, horizontalModeActivated: false };
    }

    const deltaX = x - this.dragState.startX;
    const deltaY = y - this.dragState.startY;

    // Add to drag history for velocity calculation (keep last 5 points)
    const now = performance.now();
    this.dragHistory.push({ x, y, time: now });
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
        this.didDrag = true;

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
   * End drag operation and return navigation deltas
   * Returns show delta, episode delta, and whether actual dragging occurred
   */
  public endDrag(): { showDelta: number; episodeDelta: number; didDrag: boolean } {
    if (!this.dragState.active) {
      return { showDelta: 0, episodeDelta: 0, didDrag: false };
    }

    const result = { showDelta: 0, episodeDelta: 0, didDrag: this.didDrag };

    this.dragState.active = false;
    this.dragState.offsetX = 0;
    this.dragState.offsetY = 0;
    this.dragState.direction = null;
    this.dragHistory = [];

    return result;
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
   */
  private calculateVelocity(): { x: number; y: number } {
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
   * Uses easing to smoothly decelerate from current velocity to zero, arriving at target
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
    if (speed > 0.01 && this.dragState.direction) {
      const initialOffsetX = startOffsetX !== undefined ? startOffsetX : this.dragState.offsetX;
      const initialOffsetY = startOffsetY !== undefined ? startOffsetY : this.dragState.offsetY;
      
      // Calculate distance to travel
      const distanceX = targetOffsetX - initialOffsetX;
      const distanceY = targetOffsetY - initialOffsetY;
      const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
      
      // Calculate duration based on initial velocity and distance
      // Faster swipes and longer distances = longer momentum animation
      const speedFactor = Math.min(speed * this.config.momentumSpeedInfluence, this.config.momentumSpeedInfluence * 2);
      const distanceFactor = Math.min(distance * this.config.momentumDistanceInfluence, this.config.momentumDistanceInfluence * 2);
      const duration = this.config.momentumBaseDuration + speedFactor + distanceFactor;
      
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
        distance: distance.toFixed(3),
        velocity: speed.toFixed(3),
        duration: Math.round(duration) + 'ms',
        direction: this.dragState.direction
      });
    }
  }

  /**
   * Update momentum state using easing function
   * Returns true if momentum is still active, false if it stopped
   */
  public updateMomentum(): boolean {
    if (!this.momentumState.active) {
      return false;
    }

    const elapsed = performance.now() - this.momentumState.startTime;
    const progress = Math.min(elapsed / this.momentumState.duration, 1);

    // Use configurable ease-out for smooth deceleration
    // Starts fast (matching drag velocity) and smoothly decelerates to zero
    // Lower power = gentler, more momentum-y feel
    const eased = 1 - Math.pow(1 - progress, this.config.momentumEasingPower);

    // Calculate current position using easing
    const deltaX = this.momentumState.targetOffsetX - this.momentumState.initialOffsetX;
    const deltaY = this.momentumState.targetOffsetY - this.momentumState.initialOffsetY;

    this.momentumState.startOffsetX = this.momentumState.initialOffsetX + deltaX * eased;
    this.momentumState.startOffsetY = this.momentumState.initialOffsetY + deltaY * eased;

    // Check if we're very close to target (within 0.5% of total distance)
    // This prevents the "last pixel jump" by finishing slightly early
    const remainingX = this.momentumState.targetOffsetX - this.momentumState.startOffsetX;
    const remainingY = this.momentumState.targetOffsetY - this.momentumState.startOffsetY;
    const remainingDistance = Math.sqrt(remainingX * remainingX + remainingY * remainingY);
    const totalDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Check if animation is complete or very close
    if (progress >= 1 || (remainingDistance < totalDistance * 0.005 && progress > 0.95)) {
      // Ensure we end exactly at target
      this.momentumState.startOffsetX = this.momentumState.targetOffsetX;
      this.momentumState.startOffsetY = this.momentumState.targetOffsetY;
      this.momentumState.active = false;
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
   * Check if the last interaction was a quick tap
   */
  public wasQuickTap(): boolean {
    const dragTime = performance.now() - this.dragState.startTime;
    const dragDistance = Math.sqrt(
      Math.pow(this.dragState.offsetX * this.config.showSpacing, 2) +
      Math.pow(this.dragState.offsetY * this.config.episodeSpacing, 2)
    );

    return (
      this.dragState.startedOnPlayButton &&
      dragTime < this.config.tapTimeThreshold &&
      dragDistance < this.config.tapDistanceThreshold
    );
  }

  /**
   * Set the quick tap handled flag
   */
  public setQuickTapHandled(handled: boolean): void {
    this.quickTapHandled = handled;
  }

  /**
   * Get the quick tap handled flag
   */
  public getQuickTapHandled(): boolean {
    return this.quickTapHandled;
  }

  /**
   * Update last touch time (for preventing duplicate mouse events)
   */
  public updateLastTouchTime(): void {
    this.lastTouchTime = performance.now();
  }

  /**
   * Check if a mouse event should be ignored (too soon after touch)
   */
  public shouldIgnoreMouseEvent(): boolean {
    return performance.now() - this.lastTouchTime < 500;
  }

  /**
   * Get whether actual dragging occurred (direction was set)
   */
  public getDidDrag(): boolean {
    return this.didDrag;
  }

  /**
   * Reset the didDrag flag
   */
  public resetDidDrag(): void {
    this.didDrag = false;
  }

  /**
   * Start circular progress dragging
   */
  public startCircularProgressDrag(angle: number): void {
    this.circularProgressDragging = true;
    this.circularProgressLastAngle = angle;
    this.circularProgressDragAngle = angle;
  }

  /**
   * Update circular progress drag angle with jump prevention
   */
  public updateCircularProgressDrag(angle: number): void {
    if (!this.circularProgressDragging) {
      return;
    }

    // Prevent jumping across the 12 o'clock boundary
    const lastAngle = this.circularProgressLastAngle;
    const angleDiff = angle - lastAngle;
    const maxJump = Math.PI; // 180 degrees

    // Detect if we're trying to jump across the boundary
    if (Math.abs(angleDiff) > maxJump) {
      // Large jump detected - clamp to the boundary
      if (lastAngle < Math.PI) {
        // We were in the first half, clamp to 0
        angle = 0;
      } else {
        // We were in the second half, clamp to max
        angle = 2 * Math.PI - 0.01; // Just before 2π
      }
    }

    this.circularProgressDragAngle = angle;
    this.circularProgressLastAngle = angle;
  }

  /**
   * End circular progress dragging and return final progress (0-1)
   */
  public endCircularProgressDrag(): number {
    this.circularProgressDragging = false;
    return this.circularProgressDragAngle / (2 * Math.PI);
  }

  /**
   * Check if circular progress is being dragged
   */
  public isCircularProgressDragging(): boolean {
    return this.circularProgressDragging;
  }

  /**
   * Get current circular progress drag angle
   */
  public getCircularProgressDragAngle(): number {
    return this.circularProgressDragAngle;
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
   * Reset all drag-related state (for when playback starts)
   */
  public resetAllState(): void {
    this.dragState.active = false;
    this.dragState.direction = null;
    this.dragState.offsetX = 0;
    this.dragState.offsetY = 0;
    this.dragHistory = [];
    this.momentumState.active = false;
  }
}
