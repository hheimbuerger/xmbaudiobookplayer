/**
 * Input controller for XMB browser
 * Handles all DOM event listeners and input coordination
 */

export interface InputCallbacks {
  onDragStart: (offsetX: number, offsetY: number) => void;
  onDragMove: (offsetX: number, offsetY: number) => void;
  onDragEnd: () => void;
  onPlayPauseClick: () => void;
  onCircularProgressStart: (angle: number) => void;
  onCircularProgressMove: (angle: number) => void;
  onCircularProgressEnd: () => void;
}

export interface InputConfig {
  tapTimeThreshold: number;
  tapDistanceThreshold: number;
}

/**
 * Input controller manages all DOM event handling for the XMB browser
 * Coordinates between different input types (drag, tap, circular progress)
 */
export class InputController {
  private host: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  
  // Drag state
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartTime = 0;
  private startedOnPlayButton = false;
  private didDrag = false;
  private lastDragX = 0;
  private lastDragY = 0;
  
  // Touch/mouse coordination
  private lastTouchTime = 0;
  
  // Quick tap handling
  private quickTapHandled = false;
  
  // Circular progress dragging
  private circularProgressDragging = false;

  constructor(
    private callbacks: InputCallbacks,
    private config: InputConfig
  ) {}

  /**
   * Attach event listeners to host element
   */
  public attach(host: HTMLElement, shadowRoot: ShadowRoot): void {
    this.host = host;
    this.shadowRoot = shadowRoot;
    
    host.addEventListener('mousedown', this._handleMouseDown);
    host.addEventListener('touchstart', this._handleTouchStart);
    document.addEventListener('mousemove', this._handleMouseMove);
    document.addEventListener('mouseup', this._handleMouseUp);
    document.addEventListener('touchmove', this._handleTouchMove);
    document.addEventListener('touchend', this._handleTouchEnd);
  }

  /**
   * Detach all event listeners
   */
  public detach(): void {
    if (this.host) {
      this.host.removeEventListener('mousedown', this._handleMouseDown);
      this.host.removeEventListener('touchstart', this._handleTouchStart);
    }
    
    document.removeEventListener('mousemove', this._handleMouseMove);
    document.removeEventListener('mouseup', this._handleMouseUp);
    document.removeEventListener('touchmove', this._handleTouchMove);
    document.removeEventListener('touchend', this._handleTouchEnd);
    
    this.host = null;
    this.shadowRoot = null;
  }

  /**
   * Handle play/pause button click from external source
   * Checks if this was a drag or a real click
   */
  public handlePlayPauseClick(e: Event): void {
    // If we already handled this as a quick tap in dragEnd, ignore the click event
    if (this.quickTapHandled) {
      e.stopPropagation();
      e.preventDefault();
      this.didDrag = false; // Reset here too
      return;
    }
    
    // Check if this was a quick tap on the play button
    const isQuickTap = this._wasQuickTap();
    
    // If actual dragging occurred (direction was set) and it's NOT a quick tap, block the click
    if (this.didDrag && !isQuickTap) {
      console.log('[INPUT] Blocking click - was a drag operation');
      e.stopPropagation();
      e.preventDefault();
      this.didDrag = false;
      return;
    }
    
    this.didDrag = false;

    e.stopPropagation();
    e.preventDefault();
    
    this.callbacks.onPlayPauseClick();
  }

  /**
   * Handle circular progress mousedown from external source
   */
  public handleCircularProgressMouseDown(e: MouseEvent): void {
    e.stopPropagation();
    this.circularProgressDragging = true;
    this._updateCircularProgressFromMouse(e);

    const handleMouseMove = (moveEvent: MouseEvent): void => {
      if (!this.circularProgressDragging) return;
      this._updateCircularProgressFromMouse(moveEvent);
    };

    const handleMouseUp = (): void => {
      if (this.circularProgressDragging) {
        this.circularProgressDragging = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        
        // Trigger callback - controller will provide the validated final angle
        this.callbacks.onCircularProgressEnd();
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  /**
   * Handle circular progress touchstart from external source
   */
  public handleCircularProgressTouchStart(e: TouchEvent): void {
    e.stopPropagation();
    this.circularProgressDragging = true;
    this._updateCircularProgressFromTouch(e);

    const handleTouchMove = (moveEvent: TouchEvent): void => {
      if (!this.circularProgressDragging) return;
      this._updateCircularProgressFromTouch(moveEvent);
    };

    const handleTouchEnd = (): void => {
      if (this.circularProgressDragging) {
        this.circularProgressDragging = false;
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
        
        // Trigger callback - controller will provide the validated final angle
        this.callbacks.onCircularProgressEnd();
      }
    };

    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);
  }

  /**
   * Reset drag state
   */
  public resetDidDrag(): void {
    this.didDrag = false;
  }

  /**
   * Mark drag as having occurred
   */
  public setDidDrag(): void {
    this.didDrag = true;
  }

  private _handleMouseDown = (e: MouseEvent): void => {
    // Ignore synthetic mouse events that follow touch events
    if (this._shouldIgnoreMouseEvent()) {
      return;
    }
    this.didDrag = false;
    this._onDragStart(e.clientX, e.clientY, e);
  };

  private _handleMouseMove = (e: MouseEvent): void => {
    this._onDragMove(e.clientX, e.clientY);
  };

  private _handleMouseUp = (): void => {
    this._onDragEnd();
  };

  private _handleTouchStart = (e: TouchEvent): void => {
    this.lastTouchTime = performance.now();
    this.didDrag = false;
    this._onDragStart(e.touches[0].clientX, e.touches[0].clientY, e);
  };

  private _handleTouchMove = (e: TouchEvent): void => {
    this._onDragMove(e.touches[0].clientX, e.touches[0].clientY);
  };

  private _handleTouchEnd = (): void => {
    this._onDragEnd();
  };

  private _onDragStart(x: number, y: number, e?: MouseEvent | TouchEvent): void {
    // Check if clicking on circular progress - let it handle its own events
    if (e) {
      const path = e.composedPath();
      const isCircularProgress = path.some(el => (el as HTMLElement).classList?.contains('circular-progress'));

      if (isCircularProgress) {
        return;
      }
    }

    // Check if starting on play button
    let startedOnPlayButton = false;
    if (e) {
      const path = e.composedPath();
      startedOnPlayButton = path.some(el => (el as HTMLElement).classList?.contains('play-pause-overlay'));
      
      // Only prevent default if NOT starting on play button
      if (!startedOnPlayButton) {
        e.preventDefault();
      }
    }

    this.isDragging = true;
    this.dragStartX = x;
    this.dragStartY = y;
    this.lastDragX = x;
    this.lastDragY = y;
    this.dragStartTime = performance.now();
    this.startedOnPlayButton = startedOnPlayButton;
    
    this.callbacks.onDragStart(0, 0);
  }

  private _onDragMove(x: number, y: number): void {
    if (!this.isDragging) return;

    this.lastDragX = x;
    this.lastDragY = y;
    
    const deltaX = x - this.dragStartX;
    const deltaY = y - this.dragStartY;
    
    this.callbacks.onDragMove(deltaX, deltaY);
  }

  private _onDragEnd(): void {
    if (!this.isDragging) return;

    // Check if this was a quick tap on the play button
    // BUT only if direction was never locked (no actual navigation)
    // 
    // Critical: The didDrag flag is set when direction locks (threshold crossed).
    // This ensures that every interaction is EITHER a button click OR navigation, never both.
    // 
    // Example: Quick swipe from play button
    // - User touches play button → startedOnPlayButton = true, didDrag = false
    // - User swipes → direction locks → didDrag = true
    // - User releases → isQuickTap = false (because didDrag = true)
    // - Result: Navigation happens, playback does NOT trigger ✓
    const isQuickTap = this._wasQuickTap() && !this.didDrag;
    
    if (isQuickTap) {
      // Mark that we handled this tap so the click event doesn't double-trigger
      this.quickTapHandled = true;
      
      this.isDragging = false;
      this.didDrag = false;
      
      // Trigger play/pause action directly
      this.callbacks.onPlayPauseClick();
      
      // Clear the flag after a short delay
      setTimeout(() => {
        this.quickTapHandled = false;
      }, 100);
      
      return;
    }

    this.isDragging = false;
    this.callbacks.onDragEnd();
    
    // If didDrag is true, we need to keep it set so the click handler can see it
    // Add a safety timeout to reset it in case click event never fires
    if (this.didDrag) {
      setTimeout(() => {
        this.didDrag = false;
      }, 300);
    }
  }

  private _wasQuickTap(): boolean {
    const dragTime = performance.now() - this.dragStartTime;
    const deltaX = this.lastDragX - this.dragStartX;
    const deltaY = this.lastDragY - this.dragStartY;
    const dragDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    return (
      this.startedOnPlayButton &&
      dragTime < this.config.tapTimeThreshold &&
      dragDistance < this.config.tapDistanceThreshold
    );
  }

  private _shouldIgnoreMouseEvent(): boolean {
    return performance.now() - this.lastTouchTime < 500;
  }

  private _getCircularProgressAngleFromPoint(clientX: number, clientY: number): number {
    if (!this.shadowRoot) return 0;
    
    const container = this.shadowRoot.querySelector('.circular-progress') as SVGElement;
    if (!container) return 0;

    const rect = container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;

    // Calculate angle (0 at top, clockwise)
    let angle = Math.atan2(dy, dx) + Math.PI / 2;
    if (angle < 0) angle += 2 * Math.PI;

    return angle;
  }

  private _updateCircularProgressFromMouse(e: MouseEvent): void {
    const angle = this._getCircularProgressAngleFromPoint(e.clientX, e.clientY);
    this.callbacks.onCircularProgressMove(angle);
  }

  private _updateCircularProgressFromTouch(e: TouchEvent): void {
    if (e.touches.length === 0) return;
    const angle = this._getCircularProgressAngleFromPoint(e.touches[0].clientX, e.touches[0].clientY);
    this.callbacks.onCircularProgressMove(angle);
  }
}
