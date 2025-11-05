/**
 * Configuration for animation controller
 */
export interface AnimationConfig {
  snapDuration: number; // ms
  animationDuration: number; // ms - for play/pause animations
  verticalDragFadeDuration: number; // ms
  horizontalDragFadeDuration: number; // ms
}

/**
 * Animation controller for XMB browser
 * Manages snap, play/pause, and drag fade animations
 */
export class AnimationController {
  // Snap animation state
  private snapActive = false;
  private snapStartOffsetX = 0;
  private snapStartOffsetY = 0;
  private snapStartTime = 0;
  private snapDuration = 0;

  // Play/pause animation state
  private playAnimationProgress = 0; // 0 to 1
  private playAnimationStartTime = 0;
  private animatingToPlay = false;
  private animatingToPause = false;

  // Vertical drag fade animation state
  private verticalDragFadeActive = false;
  private verticalDragFadeProgress = 0; // 0 to 1
  private verticalDragFadeStartTime = 0;

  // Horizontal drag fade animation state
  private horizontalDragFadeActive = false;
  private horizontalDragFadeProgress = 0; // 0 to 1
  private horizontalDragFadeStartTime = 0;

  constructor(private config: AnimationConfig) {}

  // Snap animation methods
  startSnap(startOffsetX: number, startOffsetY: number, dynamicDuration?: number): void {
    this.snapActive = true;
    this.snapStartOffsetX = startOffsetX;
    this.snapStartOffsetY = startOffsetY;
    this.snapStartTime = performance.now();
    
    // Use dynamic duration if provided, otherwise use config duration
    if (dynamicDuration !== undefined) {
      this.snapDuration = dynamicDuration;
    } else {
      this.snapDuration = this.config.snapDuration;
    }
  }

  isSnapping(): boolean {
    return this.snapActive;
  }

  getSnapOffset(): { x: number; y: number } {
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

  // Play/pause animation methods
  startPlayAnimation(): void {
    this.animatingToPlay = true;
    this.animatingToPause = false;
    this.playAnimationStartTime = performance.now();
  }

  startPauseAnimation(): void {
    this.animatingToPlay = false;
    this.animatingToPause = true;
    this.playAnimationStartTime = performance.now();
  }

  getPlayAnimationProgress(): number {
    return this.playAnimationProgress;
  }

  isAnimatingToPlay(): boolean {
    return this.animatingToPlay;
  }

  isAnimatingToPause(): boolean {
    return this.animatingToPause;
  }

  // Vertical drag fade methods
  startVerticalDragFade(active: boolean): void {
    this.verticalDragFadeActive = active;
    this.verticalDragFadeStartTime = performance.now();
  }

  getVerticalDragFadeProgress(): number {
    return this.verticalDragFadeProgress;
  }

  // Horizontal drag fade methods
  startHorizontalDragFade(active: boolean): void {
    this.horizontalDragFadeActive = active;
    this.horizontalDragFadeStartTime = performance.now();
  }

  getHorizontalDragFadeProgress(): number {
    return this.horizontalDragFadeProgress;
  }

  /**
   * Update all active animations
   * @param timestamp - Current timestamp from performance.now()
   * @returns true if visual update is needed, false otherwise
   */
  update(timestamp: number): boolean {
    let needsVisualUpdate = false;

    // Update snap animation
    if (this.snapActive) {
      const elapsed = timestamp - this.snapStartTime;
      if (elapsed >= this.snapDuration) {
        this.snapActive = false;
      }
      needsVisualUpdate = true;
    }

    // Update play/pause animation
    if (this.animatingToPlay || this.animatingToPause) {
      const elapsed = timestamp - this.playAnimationStartTime;
      const progress = Math.min(elapsed / this.config.animationDuration, 1);

      // Bouncy easing: ease-out-back for play, ease-in-back for pause
      let eased: number;
      if (this.animatingToPlay) {
        // Ease out back - overshoots slightly then settles
        const c1 = 1.70158;
        const c3 = c1 + 1;
        eased = 1 + c3 * Math.pow(progress - 1, 3) + c1 * Math.pow(progress - 1, 2);
      } else {
        // Ease in back - pulls back slightly before moving
        const c1 = 1.70158;
        const c3 = c1 + 1;
        eased = c3 * progress * progress * progress - c1 * progress * progress;
      }

      this.playAnimationProgress = this.animatingToPlay ? eased : 1 - eased;

      if (progress >= 1) {
        this.animatingToPlay = false;
        this.animatingToPause = false;
      }
      needsVisualUpdate = true;
    }

    // Update vertical drag fade animation
    if (this.verticalDragFadeStartTime > 0) {
      const elapsed = timestamp - this.verticalDragFadeStartTime;
      const progress = Math.min(elapsed / this.config.verticalDragFadeDuration, 1);

      if (this.verticalDragFadeActive) {
        // Fading in
        this.verticalDragFadeProgress = progress;
      } else {
        // Fading out
        this.verticalDragFadeProgress = 1 - progress;
      }

      if (progress >= 1) {
        this.verticalDragFadeStartTime = 0;
      }
      needsVisualUpdate = true;
    }

    // Update horizontal drag fade animation
    if (this.horizontalDragFadeStartTime > 0) {
      const elapsed = timestamp - this.horizontalDragFadeStartTime;
      const progress = Math.min(elapsed / this.config.horizontalDragFadeDuration, 1);

      if (this.horizontalDragFadeActive) {
        // Fading in
        this.horizontalDragFadeProgress = progress;
      } else {
        // Fading out
        this.horizontalDragFadeProgress = 1 - progress;
      }

      if (progress >= 1) {
        this.horizontalDragFadeStartTime = 0;
      }
      needsVisualUpdate = true;
    }

    return needsVisualUpdate;
  }

  /**
   * Stop snap animation
   */
  stopSnap(): void {
    this.snapActive = false;
  }

  /**
   * Set final play animation progress (for when animation completes)
   */
  setPlayAnimationProgress(progress: number): void {
    this.playAnimationProgress = progress;
  }

  /**
   * Check if any animations are currently active
   */
  hasActiveAnimations(): boolean {
    return this.snapActive || 
           this.animatingToPlay || 
           this.animatingToPause || 
           this.verticalDragFadeStartTime > 0 || 
           this.horizontalDragFadeStartTime > 0;
  }
}
