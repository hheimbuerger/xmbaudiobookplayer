/**
 * Configuration for animation controller
 */
export interface AnimationConfig {
  animationDuration: number; // ms - for play/pause animations
  verticalDragFadeDuration: number; // ms
  horizontalDragFadeDuration: number; // ms
  playPauseButtonAnimDuration: number; // ms - for button scale animation
}

/**
 * Animation controller for XMB browser
 * Manages UI animations: play/pause button and drag fade overlays
 * Navigation animations (drag, coast, snap) are handled by NavigationController
 */
export class AnimationController {
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

  // Play/pause button scale animation state
  private buttonScaleAnimActive = false;
  private buttonScaleAnimProgress = 1.0; // 0 to 1 (0 = hidden, 1 = visible) - starts visible
  private buttonScaleAnimStartTime = 0;
  private buttonScaleAnimTargetScale = 1.0; // Target scale (0 or 1)
  private buttonScaleAnimStartScale = 1.0; // Starting scale
  private buttonScaleAnimDelay = 0; // Delay before animation starts (ms)

  constructor(private config: AnimationConfig) {}

  // Play/pause animation methods
  startPlayAnimation(): void {
    console.log('[ANIMATION] startPlayAnimation() called', {
      wasAnimatingToPlay: this.animatingToPlay,
      currentProgress: this.playAnimationProgress.toFixed(3),
      timestamp: performance.now()
    });
    this.animatingToPlay = true;
    this.animatingToPause = false;
    this.playAnimationStartTime = performance.now();
  }

  startPauseAnimation(): void {
    console.log('[ANIMATION] startPauseAnimation() called', {
      wasAnimatingToPause: this.animatingToPause,
      currentProgress: this.playAnimationProgress.toFixed(3),
      timestamp: performance.now()
    });
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

  // Play/pause button scale animation methods
  
  /**
   * Start button scale animation to hide (scale to 0)
   * Used when drag starts - hides button on current episode
   */
  startButtonHide(): void {
    this.buttonScaleAnimActive = true;
    this.buttonScaleAnimStartScale = this.buttonScaleAnimProgress; // Capture current scale
    this.buttonScaleAnimTargetScale = 0;
    this.buttonScaleAnimStartTime = performance.now();
    this.buttonScaleAnimDelay = 0;
    
    console.log('[BUTTON] Hide:', {
      from: this.buttonScaleAnimStartScale.toFixed(3),
      to: '0.000'
    });
  }

  /**
   * Start button scale animation to show (scale to 1)
   * Used when navigation ends - shows button on NEW episode
   * Always starts from 0 (new episode, new button)
   * @param delay - Optional delay in ms before starting animation
   */
  startButtonShow(delay: number = 0): void {
    const previousProgress = this.buttonScaleAnimProgress;
    
    this.buttonScaleAnimActive = true;
    this.buttonScaleAnimStartScale = 0; // Always start from 0 (new episode)
    this.buttonScaleAnimProgress = 0; // Set progress to 0 immediately (new episode)
    this.buttonScaleAnimTargetScale = 1.0;
    this.buttonScaleAnimStartTime = performance.now();
    this.buttonScaleAnimDelay = delay;
    
    console.log('[BUTTON] Show:', {
      from: '0.000',
      to: '1.000',
      delay: delay + 'ms',
      previousProgress: previousProgress.toFixed(3)
    });
  }

  /**
   * Get current button scale (0 to 1)
   */
  getButtonScale(): number {
    return this.buttonScaleAnimProgress;
  }

  /**
   * Set button scale immediately without animation
   * Cancels any active animation
   */
  setButtonScale(scale: number): void {
    const wasPreviouslyAnimating = this.buttonScaleAnimActive;
    
    this.buttonScaleAnimProgress = scale;
    this.buttonScaleAnimActive = false;
    
    if (wasPreviouslyAnimating) {
      console.log('[BUTTON] Immediate:', {
        scale: scale.toFixed(3)
      });
    }
  }

  /**
   * Update all active animations
   * @param timestamp - Current timestamp from performance.now()
   * @returns true if visual update is needed, false otherwise
   */
  update(timestamp: number): boolean {
    let needsVisualUpdate = false;

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

    // Update button scale animation
    if (this.buttonScaleAnimActive) {
      const elapsed = timestamp - this.buttonScaleAnimStartTime;
      
      // Check if delay has passed
      if (elapsed >= this.buttonScaleAnimDelay) {
        const animElapsed = elapsed - this.buttonScaleAnimDelay;
        const progress = Math.min(animElapsed / this.config.playPauseButtonAnimDuration, 1);
        
        // Linear interpolation
        const delta = this.buttonScaleAnimTargetScale - this.buttonScaleAnimStartScale;
        this.buttonScaleAnimProgress = this.buttonScaleAnimStartScale + delta * progress;
        
        if (progress >= 1) {
          this.buttonScaleAnimProgress = this.buttonScaleAnimTargetScale;
          this.buttonScaleAnimActive = false;
          console.log('[BUTTON] Complete:', {
            scale: this.buttonScaleAnimProgress.toFixed(3)
          });
        }
      }
      
      needsVisualUpdate = true;
    }

    return needsVisualUpdate;
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
    return this.animatingToPlay || 
           this.animatingToPause || 
           this.verticalDragFadeStartTime > 0 || 
           this.horizontalDragFadeStartTime > 0 ||
           this.buttonScaleAnimActive;
  }

  /**
   * Cancel all fade animations immediately
   * Sets fade progress to 0 (fully faded out) and stops animations
   * Used when entering playback mode to ensure titles are hidden
   */
  cancelFadeAnimations(): void {
    // Set both fade animations to fully faded out (0)
    this.verticalDragFadeProgress = 0;
    this.verticalDragFadeStartTime = 0;
    this.verticalDragFadeActive = false;
    
    this.horizontalDragFadeProgress = 0;
    this.horizontalDragFadeStartTime = 0;
    this.horizontalDragFadeActive = false;
    
    console.log('[ANIMATION] Fade animations cancelled - entering playback mode');
  }

  /**
   * Immediately cancel vertical drag fade (set to 0)
   * Used when switching to horizontal drag mode
   */
  cancelVerticalDragFade(): void {
    this.verticalDragFadeProgress = 0;
    this.verticalDragFadeStartTime = 0;
    this.verticalDragFadeActive = false;
  }

  /**
   * Immediately cancel horizontal drag fade (set to 0)
   * Used when switching to vertical drag mode
   */
  cancelHorizontalDragFade(): void {
    this.horizontalDragFadeProgress = 0;
    this.horizontalDragFadeStartTime = 0;
    this.horizontalDragFadeActive = false;
  }
}
