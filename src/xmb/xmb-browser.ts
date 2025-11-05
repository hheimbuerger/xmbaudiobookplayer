import { LitElement, html, css, PropertyValues } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { Show, Episode } from '../catalog/media-repository.js';
import { AnimationController } from './controllers/animation-controller.js';
import { DragController } from './controllers/drag-controller.js';
import { 
  LayoutConfig,
  calculateEpisodeLayout,
  calculateOpacity,
  calculateLabelLayout
} from './controllers/layout-calculator.js';

/**
 * Event detail for episode-change event
 */
export interface XmbEpisodeChangeEventDetail {
  showId: string;
  episodeId: string;
  show: Show;
  episode: Episode;
}

/**
 * Event detail for seek event
 */
export interface XmbSeekEventDetail {
  progress: number; // 0 to 1
}



interface EpisodeElement {
  element: HTMLElement;
  showIndex: number;
  episodeIndex: number;
}

interface LabelData {
  showTitle: string;
  episodeTitle: string;
  x: number;
  y: number;
  showTitleOpacity: number;
  episodeTitleOpacity: number;
  sideEpisodeTitleOpacity: number;
  verticalShowTitleOpacity: number;
  showIndex: number;
  scale: number;
  color: string; // Color that transitions from white/gray to blue based on distance from center
}

// Layout constants - defined at file level so they can be used in CSS
// ICON_SIZE represents the maximum visual size (at center, fully zoomed)
const MAX_ZOOM = 1.8;
const ICON_SIZE = 72 * MAX_ZOOM; // 129.6px - visual size at center
const BASE_ICON_SIZE = 72; // Base size for spacing calculations (minimum zoom size)
const PROGRESS_RADIUS = BASE_ICON_SIZE * 1.5; // 108px - based on base size
const PROGRESS_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RADIUS; // ~678px

/**
 * XMB (Cross Media Bar) browser component for navigating shows and episodes
 * 
 * @fires episode-change - Fired when user navigates to a different episode. Detail: { showId, episodeId, show, episode }
 * @fires play-request - Fired when user clicks play button
 * @fires pause-request - Fired when user clicks pause button
 * @fires seek - Fired when user drags the circular progress scrubber. Detail: { progress }
 * 
 * @property {Show[]} shows - Array of shows with episodes
 * @property {boolean} inlinePlaybackControls - Enable/disable inline playback UI
 * @property {boolean} isPlaying - Current playback state (for display only)
 * @property {number} playbackProgress - Current playback progress 0-1 (for display only)
 * 
 * Public Methods:
 * - navigateToEpisode(showId: string, episodeId?: string): boolean - Navigate to specific show/episode
 * - navigateToNextEpisode(): { show: Show; episode: Episode } | null - Navigate to next episode in current show
 * - getCurrentSelection(): { show: Show; episode: Episode } | null - Get currently selected show and episode
 */
@customElement('xmb-browser')
export class XmbBrowser extends LitElement {
  @property({ type: Array }) shows: Show[] = [];
  @property({ type: Boolean }) inlinePlaybackControls = true;
  @property({ type: Boolean }) isPlaying = false;
  @property({ type: Boolean }) isLoading = false;
  @property({ type: Number }) playbackProgress = 0;

  // Not a @state() - we don't want Lit re-renders when this changes
  // Visual updates handled by updateVisuals() via direct style manipulation
  private currentShowIndex = 0;
  
  private lastEmittedEpisode: { showId: string; episodeId: string } | null = null;

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: relative;
      background: #000;
      overflow: hidden;
      user-select: none;
      -webkit-user-select: none;
      -webkit-user-drag: none;
      -webkit-touch-callout: none;
      touch-action: none;
    }

    .episode-item {
      position: absolute;
      /*background: rgba(255, 255, 255, 0.15);*/
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
      transition: none;
      user-select: none;
      -webkit-user-select: none;
      /* Force GPU compositing with high quality */
      transform: translateZ(0);
      backface-visibility: hidden;
    }

    .icon-main {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      user-select: none;
      -webkit-user-select: none;
    }

    .icon-main img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 8px;
      user-select: none;
      -webkit-user-select: none;
      -webkit-user-drag: none;
      pointer-events: none;
      /* Force high-quality rendering during GPU compositing */
      image-rendering: -webkit-optimize-contrast;
      image-rendering: high-quality;
      transform: translateZ(0); /* Force GPU layer for smoother scaling */
      backface-visibility: hidden; /* Prevent flickering */
      -webkit-font-smoothing: subpixel-antialiased;
    }

    .episode-badge {
      position: absolute;
      bottom: 0;
      right: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      color: rgba(255, 255, 255, 0.95);
      font-size: 9px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif;
      padding: 1.5px 4px;
      border-radius: 6px;
      line-height: 1.1;
      min-width: 14px;
      text-align: center;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      border: 0.5px solid rgba(255, 255, 255, 0.1);
      transform-origin: bottom right;
    }

    .play-pause-overlay {
      position: absolute;
      width: 38.4px;
      height: 38.4px;
      border-radius: 50%;
      background: rgba(37, 99, 235, 0.95);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
      z-index: 15;
      pointer-events: auto;
      will-change: transform, opacity;
      -webkit-tap-highlight-color: transparent;
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
      /* Force sharp rendering on desktop */
      transform: translateZ(0);
      backface-visibility: hidden;
      -webkit-font-smoothing: subpixel-antialiased;
    }

    .play-pause-overlay:hover {
      background: rgba(59, 130, 246, 0.95);
      transform: translateZ(0) scale(1.1);
    }

    .play-pause-overlay svg {
      width: 16px;
      height: 16px;
      fill: white;
      /* Ensure crisp SVG rendering */
      shape-rendering: geometricPrecision;
    }

    .circular-progress {
      position: absolute;
      z-index: 10;
      pointer-events: none;
      will-change: opacity;
    }

    .circular-progress .track {
      fill: none;
      stroke: rgba(255, 255, 255, 0.2);
      stroke-width: 8;
      pointer-events: none;
    }

    .circular-progress .track.loading {
      animation: track-loading-pulse 2s ease-in-out infinite;
    }

    @keyframes track-loading-pulse {
      0%, 100% {
        stroke: rgba(255, 255, 255, 0.2);
      }
      50% {
        stroke: rgba(96, 165, 250, 0.7);
      }
    }

    .circular-progress .progress {
      fill: none;
      stroke: #2563eb;
      stroke-width: 8;
      stroke-linecap: round;
      transform: rotate(-90deg);
      transform-origin: center;
      transition: stroke-dashoffset 0.1s linear;
      pointer-events: none;
    }

    .circular-progress .playhead {
      fill: white;
      stroke: none;
      pointer-events: none;
    }

    .circular-progress .playhead-hitbox {
      fill: transparent;
      cursor: grab;
      pointer-events: auto;
    }

    .circular-progress .playhead-hitbox:active {
      cursor: grabbing;
    }

    .episode-label {
      position: absolute;
      color: white;
      font-family: system-ui, -apple-system, sans-serif;
      white-space: nowrap;
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
      will-change: transform, opacity;
    }

    .show-title-label {
      font-size: 12px;
      font-weight: 500;
    }

    .episode-title-label {
      font-size: 14px;
      font-weight: 600;
    }

    .side-episode-title-label {
      color: rgba(255, 255, 255, 0.85);
      font-size: 14px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif;
      letter-spacing: 0.05em;
    }

    .vertical-show-title {
      position: absolute;
      color: rgba(255, 255, 255, 0.85);
      font-size: 14px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif;
      letter-spacing: 0.05em;
      white-space: nowrap;
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
      transform-origin: left bottom;
      transform: rotate(-90deg);
    }

    .playback-show-title {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      color: #60a5fa;
      font-size: 14px;
      font-family: system-ui, -apple-system, sans-serif;
      white-space: nowrap;
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
      text-align: center;
    }

    .playback-episode-title {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      color: #60a5fa;
      font-size: 16px;
      font-weight: 700;
      font-family: system-ui, -apple-system, sans-serif;
      white-space: nowrap;
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
      text-align: center;
    }
  `;

  // Configuration constants (used for controller initialization)
  private readonly SHOW_SPACING_ICONS = 2.0;
  private readonly EPISODE_SPACING_ICONS = 2.0;
  private readonly DIRECTION_LOCK_THRESHOLD_ICONS = 0.2;
  private readonly FADE_RANGE = 0.5;
  private readonly MAX_SCALE = MAX_ZOOM; // 1.8 - maximum zoom at center
  private readonly MIN_SCALE = 1.0;
  private readonly SCALE_DISTANCE_ICONS = 2.0;
  private readonly RADIAL_PUSH_DISTANCE = 1.3;

  private readonly SHOW_SPACING: number;
  private readonly EPISODE_SPACING: number;
  private readonly DIRECTION_LOCK_THRESHOLD: number;
  private readonly SCALE_DISTANCE: number;

  // Controllers
  private animationController!: AnimationController;
  private dragController!: DragController;
  private layoutConfig!: LayoutConfig;

  // Remaining state
  private episodeElements: EpisodeElement[] = [];
  private animationFrameId: number | null = null;
  private playPauseButtonScale = 1.0;
  private labelData: LabelData[] = [];
  private pendingUpdate = false; // Track if update is already scheduled

  constructor() {
    super();

    // Use BASE_ICON_SIZE for spacing (logical spacing, not visual size)
    this.SHOW_SPACING = this.SHOW_SPACING_ICONS * BASE_ICON_SIZE;
    this.EPISODE_SPACING = this.EPISODE_SPACING_ICONS * BASE_ICON_SIZE;
    this.DIRECTION_LOCK_THRESHOLD = this.DIRECTION_LOCK_THRESHOLD_ICONS * BASE_ICON_SIZE;
    this.SCALE_DISTANCE = this.SCALE_DISTANCE_ICONS * BASE_ICON_SIZE;

    // Initialize animation controller
    this.animationController = new AnimationController({
      snapDuration: 500,
      animationDuration: 300,
      verticalDragFadeDuration: 400,
      horizontalDragFadeDuration: 400,
    });

    // Initialize drag controller
    this.dragController = new DragController({
      showSpacing: this.SHOW_SPACING,
      episodeSpacing: this.EPISODE_SPACING,
      directionLockThreshold: this.DIRECTION_LOCK_THRESHOLD,
      momentumFriction: 0.94, // Legacy, not used
      momentumMinVelocity: 0.01, // Legacy, not used
      momentumVelocityScale: 0.8,
      tapTimeThreshold: 200,
      tapDistanceThreshold: 10,
      // Momentum animation tuning - adjust these for feel
      momentumBaseDuration: 400, // Base duration (ms) - higher = more coast
      momentumSpeedInfluence: 100, // Speed influence - higher = faster swipes coast longer
      momentumDistanceInfluence: 100, // Distance influence - higher = longer distances coast longer
      momentumEasingPower: 3, // Easing curve: 2=gentle, 3=medium, 4=sharp
    });

    // Initialize layout config
    this.layoutConfig = {
      showSpacing: this.SHOW_SPACING,
      episodeSpacing: this.EPISODE_SPACING,
      fadeRange: this.FADE_RANGE,
      maxScale: this.MAX_SCALE,
      minScale: this.MIN_SCALE,
      scaleDistance: this.SCALE_DISTANCE,
      radialPushDistance: this.RADIAL_PUSH_DISTANCE,
      baseIconSize: BASE_ICON_SIZE,
    };
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('mousedown', this._handleMouseDown);
    this.addEventListener('touchstart', this._handleTouchStart);
    document.addEventListener('mousemove', this._handleMouseMove);
    document.addEventListener('mouseup', this._handleMouseUp);
    document.addEventListener('touchmove', this._handleTouchMove);
    document.addEventListener('touchend', this._handleTouchEnd);

    this._startAnimation();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener('mousedown', this._handleMouseDown);
    this.removeEventListener('touchstart', this._handleTouchStart);
    document.removeEventListener('mousemove', this._handleMouseMove);
    document.removeEventListener('mouseup', this._handleMouseUp);
    document.removeEventListener('touchmove', this._handleTouchMove);
    document.removeEventListener('touchend', this._handleTouchEnd);

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  firstUpdated(): void {
    this._cacheElements();
    this._preloadImages();
    // Schedule initial visual update after the update cycle completes
    // Using setTimeout ensures we're not in the update cycle when requestUpdate() is called
    setTimeout(() => this.updateVisuals(), 0);
  }

  /**
   * Preload and decode all show icons for smooth rendering
   * Runs in background without blocking UI
   */
  private _preloadImages(): void {
    const uniqueUrls = new Set<string>();
    
    // Collect unique image URLs
    this.shows.forEach(show => {
      if (show.icon.startsWith('http')) {
        uniqueUrls.add(show.icon);
      }
    });
    
    if (uniqueUrls.size === 0) return;
    
    console.log(`[XMB] Preloading ${uniqueUrls.size} unique images...`);
    
    // Preload each image
    uniqueUrls.forEach(url => {
      const img = new Image();
      img.decoding = 'async'; // Use async decoding
      img.src = url;
      
      // Decode the image to ensure it's ready for GPU
      img.decode().catch(err => {
        console.warn(`[XMB] Failed to decode image: ${url}`, err);
      });
    });
  }

  willUpdate(changedProperties: PropertyValues): void {
    // Handle play/pause animation state changes
    // Trigger animation when entering/exiting loading or playing states
    if ((changedProperties.has('isPlaying') || changedProperties.has('isLoading')) && this.inlinePlaybackControls) {
      const oldIsPlaying = changedProperties.get('isPlaying');
      const oldIsLoading = changedProperties.get('isLoading');
      
      // Only animate if this is an actual change, not the initial value
      if (oldIsPlaying !== undefined || oldIsLoading !== undefined) {
        const wasActive = oldIsPlaying || oldIsLoading;
        const isActive = this.isPlaying || this.isLoading;
        
        // Log state transitions for debugging
        if (wasActive !== isActive) {
          const oldState = wasActive ? (oldIsLoading ? 'loading' : 'playing') : 'paused';
          const newState = isActive ? (this.isLoading ? 'loading' : 'playing') : 'paused';
          console.log(`[XMB] State transition: ${oldState} → ${newState}`);
        }
        
        // Transition from paused to loading/playing
        if (!wasActive && isActive) {
          this.animationController.startPlayAnimation();
          
          // Reset all drag-related state when starting playback/loading
          this.dragController.resetAllState();
          this.animationController.stopSnap();
        } 
        // Transition from loading/playing to paused
        else if (wasActive && !isActive) {
          this.animationController.startPauseAnimation();
        }
      }
    }
  }

  updated(changedProperties: PropertyValues): void {
    // Only re-cache if the shows array structure changed (not just episode IDs)
    // Switching shows doesn't change DOM structure, so no need to re-cache
    if (changedProperties.has('shows')) {
      const oldShows = changedProperties.get('shows') as Show[] | undefined;
      const structureChanged = !oldShows || 
        oldShows.length !== this.shows.length ||
        oldShows.some((show, i) => show.episodes.length !== this.shows[i]?.episodes.length);
      
      if (structureChanged) {
        this._cacheElements();
      }
    }
    // Don't call updateVisuals() here - it will be called by the animation loop
    // Calling it here causes a requestUpdate() during the update cycle
  }

  private _getCurrentEpisodeIndex(show: Show): number {
    return show.episodes.findIndex((ep) => ep.id === show.currentEpisodeId);
  }

  private _cacheElements(): void {
    this.episodeElements = [];
    const items = this.shadowRoot?.querySelectorAll('.episode-item');
    if (!items) return;

    let index = 0;
    this.shows.forEach((show, showIndex) => {
      show.episodes.forEach((_, episodeIndex) => {
        if (items[index]) {
          this.episodeElements.push({
            element: items[index] as HTMLElement,
            showIndex,
            episodeIndex,
          });
        }
        index++;
      });
    });
  }

  private _startAnimation(): void {
    const animate = (): void => {
      const timestamp = performance.now();
      
      // Update momentum in drag controller
      if (this.dragController.isMomentumActive()) {
        const stillActive = this.dragController.updateMomentum();
        if (!stillActive) {
          // Momentum finished at target position, update indices
          this._updateIndicesFromMomentumTarget();
        }
      }

      // Update all animations in animation controller
      const needsVisualUpdate = this.animationController.update(timestamp);

      // Batch Lit template updates with other changes in updateVisuals()
      if (needsVisualUpdate && (this.animationController.isAnimatingToPlay() || this.animationController.isAnimatingToPause())) {
        if (!this.pendingUpdate) {
          this.pendingUpdate = true;
          this.requestUpdate();
          Promise.resolve().then(() => {
            this.pendingUpdate = false;
          });
        }
      }

      if (needsVisualUpdate) {
        this.updateVisuals();
      }

      this.animationFrameId = requestAnimationFrame(animate);
    };
    animate();
  }





  /**
   * Updates visual properties via direct DOM manipulation without triggering Lit's template re-rendering.
   * 
   * This method applies calculated positions, transforms, and styles to episode elements based on
   * current drag state, animations, and playback progress. It's called frequently (e.g., during
   * drag operations and animation frames) to keep visuals in sync with state.
   * 
   * Unlike render() which defines the DOM structure, updateVisuals() modifies how existing
   * elements appear through direct style manipulation for performance.
   */
  private updateVisuals(): void {
    let offsetX = 0;
    let offsetY = 0;

    // Get offset from drag controller or animation controller
    if (this.dragController.isDragging()) {
      const dragState = this.dragController.getDragState();
      offsetX = dragState.offsetX;
      offsetY = dragState.offsetY;
    } else if (this.dragController.isMomentumActive()) {
      const momentumOffset = this.dragController.getMomentumOffset();
      offsetX = momentumOffset.x;
      offsetY = momentumOffset.y;
    } else if (this.animationController.isSnapping()) {
      const snapOffset = this.animationController.getSnapOffset();
      offsetX = snapOffset.x;
      offsetY = snapOffset.y;
    }

    // Hide play button only during actual drag/momentum (direction established), show otherwise
    // Button disappears when drag direction is locked, reappears when drag ends
    // ALWAYS show button when playing or loading to ensure it's clickable
    let needsTemplateUpdate = false;
    const isActuallyDragging = this.dragController.hasDirection() || this.dragController.isMomentumActive();
    const isSnapping = this.animationController.isSnapping();
    // Show button when: playing, loading, snapping, or not actually dragging
    const shouldShowButton = (this.isPlaying || this.isLoading) || isSnapping || !isActuallyDragging;
    const newScale = shouldShowButton ? 1.0 : 0;
    
    if (Math.abs(newScale - this.playPauseButtonScale) > 0.01) {
      this.playPauseButtonScale = newScale;
      needsTemplateUpdate = true;
    }

    // Prepare label data array
    const newLabelData: LabelData[] = [];

    this.episodeElements.forEach(({ element, showIndex, episodeIndex }) => {
      const show = this.shows[showIndex];
      if (!show) return;

      const currentEpisodeIndex = this._getCurrentEpisodeIndex(show);
      const playAnimationProgress = this.animationController.getPlayAnimationProgress();
      const verticalDragFadeProgress = this.animationController.getVerticalDragFadeProgress();
      const horizontalDragFadeProgress = this.animationController.getHorizontalDragFadeProgress();

      // Calculate episode layout using layout calculator
      const layout = calculateEpisodeLayout(
        showIndex,
        episodeIndex,
        this.currentShowIndex,
        currentEpisodeIndex,
        offsetX,
        offsetY,
        playAnimationProgress,
        this.inlinePlaybackControls,
        this.layoutConfig
      );

      // Calculate opacity using layout calculator
      const showOffsetFromCenter = showIndex - this.currentShowIndex + offsetX;
      const isCurrentShow = showIndex === this.currentShowIndex;
      const isCenterEpisode = showIndex === this.currentShowIndex && episodeIndex === currentEpisodeIndex;
      
      const opacity = calculateOpacity(
        showIndex,
        episodeIndex,
        this.currentShowIndex,
        currentEpisodeIndex,
        showOffsetFromCenter,
        isCurrentShow,
        isCenterEpisode,
        verticalDragFadeProgress,
        playAnimationProgress,
        this.inlinePlaybackControls,
        this.layoutConfig
      );

      // Apply layout to element
      element.style.transform = `translate(calc(-50% + ${layout.x}px), calc(-50% + ${layout.y}px)) scale(${layout.scale})`;
      element.style.opacity = opacity.toString();

      // Calculate label data using layout calculator
      const episode = show.episodes[episodeIndex];
      if (episode && opacity > 0) {
        const distanceFromCenter = Math.sqrt(layout.x * layout.x + layout.y * layout.y);
        const scale = layout.scale * this.MAX_SCALE; // Convert back to zoom level for label calculations
        const isCurrentEpisodeOfShow = episodeIndex === currentEpisodeIndex;

        const labelLayout = calculateLabelLayout(
          show.title,
          episode.title,
          showIndex,
          episodeIndex,
          this.currentShowIndex,
          currentEpisodeIndex,
          layout.x,
          layout.y,
          distanceFromCenter,
          scale,
          opacity,
          isCurrentShow,
          isCurrentEpisodeOfShow,
          verticalDragFadeProgress,
          horizontalDragFadeProgress,
          this.layoutConfig
        );

        if (labelLayout) {
          newLabelData.push(labelLayout);
        }
      }
    });

    // Update label data and trigger Lit template update if changed
    // Use shallow comparison instead of JSON.stringify for better performance
    let labelsChanged = this.labelData.length !== newLabelData.length;
    if (!labelsChanged) {
      for (let i = 0; i < this.labelData.length; i++) {
        const old = this.labelData[i];
        const newLabel = newLabelData[i];
        if (
          old.x !== newLabel.x ||
          old.y !== newLabel.y ||
          old.showTitleOpacity !== newLabel.showTitleOpacity ||
          old.episodeTitleOpacity !== newLabel.episodeTitleOpacity ||
          old.sideEpisodeTitleOpacity !== newLabel.sideEpisodeTitleOpacity ||
          old.verticalShowTitleOpacity !== newLabel.verticalShowTitleOpacity ||
          old.scale !== newLabel.scale ||
          old.color !== newLabel.color
        ) {
          labelsChanged = true;
          break;
        }
      }
    }
    
    if (labelsChanged) {
      this.labelData = newLabelData;
      needsTemplateUpdate = true;
    }
    
    // Batch all template updates into a single requestUpdate call
    if (needsTemplateUpdate && !this.pendingUpdate) {
      this.pendingUpdate = true;
      this.requestUpdate();
      // Reset flag after microtask to allow batching within same frame
      Promise.resolve().then(() => {
        this.pendingUpdate = false;
      });
    }
  }

  private _handleMouseDown = (e: MouseEvent): void => {
    // Ignore synthetic mouse events that follow touch events
    if (this.dragController.shouldIgnoreMouseEvent()) {
      return;
    }
    this.dragController.resetDidDrag();
    this._onDragStart(e.clientX, e.clientY, e);
  };

  private _handleMouseMove = (e: MouseEvent): void => {
    this._onDragMove(e.clientX, e.clientY);
  };

  private _handleMouseUp = (): void => {
    this._onDragEnd();
  };

  private _handleTouchStart = (e: TouchEvent): void => {
    this.dragController.updateLastTouchTime();
    this.dragController.resetDidDrag();
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

      // Don't start drag if clicking on circular progress
      if (isCircularProgress) {
        return;
      }
    }

    // Disable dragging when playing or loading (only if inline controls enabled)
    if (this.inlinePlaybackControls && (this.isPlaying || this.isLoading)) {
      // Check if on play button - if so, don't prevent default to allow pause click
      if (e) {
        const path = e.composedPath();
        const isPlayButton = path.some(el => (el as HTMLElement).classList?.contains('play-pause-overlay'));
        
        // Only prevent default if NOT on play button (to prevent scrolling elsewhere)
        if (!isPlayButton) {
          e.preventDefault();
        }
      }
      return;
    }

    // Cancel any active animations
    if (this.animationController.isSnapping() || this.dragController.isMomentumActive()) {
      this.animationController.stopSnap();
      this.dragController.stopMomentum();
    }

    // Check if starting on play button - if so, don't prevent default yet
    // Let the click handler decide whether to allow the click
    let startedOnPlayButton = false;
    if (e) {
      const path = e.composedPath();
      startedOnPlayButton = path.some(el => (el as HTMLElement).classList?.contains('play-pause-overlay'));
      
      // Only prevent default if NOT starting on play button
      if (!startedOnPlayButton) {
        e.preventDefault();
      }
    }

    this.dragController.startDrag(x, y, startedOnPlayButton);
  }

  private _handlePlayPauseClick(e: Event): void {
    // If we already handled this as a quick tap in dragEnd, ignore the click event
    if (this.dragController.getQuickTapHandled()) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    
    // Check if this was a quick tap on the play button
    const isQuickTap = this.dragController.wasQuickTap();
    
    // If actual dragging occurred (direction was set) and it's NOT a quick tap, block the click
    if (this.dragController.getDidDrag() && !isQuickTap) {
      e.stopPropagation();
      e.preventDefault();
      this.dragController.resetDidDrag();
      return;
    }
    
    this.dragController.resetDidDrag();

    e.stopPropagation();
    e.preventDefault(); // Prevent default to avoid double-firing on touch devices
    
    // In loading or playing state, show pause button and allow pausing
    if (this.isPlaying || this.isLoading) {
      this._emitPauseRequest();
    } else {
      this._emitPlayRequest();
    }
  }

  private _emitPlayRequest(): void {
    const event = new CustomEvent('play-request', {
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  private _emitPauseRequest(): void {
    const event = new CustomEvent('pause-request', {
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  private _emitSeek(progress: number): void {
    const event = new CustomEvent<XmbSeekEventDetail>('seek', {
      detail: { progress },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  private _emitEpisodeChange(show: Show, episode: Episode): void {
    // Prevent duplicate episode-change events for the same episode
    // This can happen when snap animation completes after user has already navigated
    if (this.lastEmittedEpisode && 
        this.lastEmittedEpisode.showId === show.id && 
        this.lastEmittedEpisode.episodeId === episode.id) {
      return;
    }
    
    this.lastEmittedEpisode = { showId: show.id, episodeId: episode.id };
    
    const event = new CustomEvent<XmbEpisodeChangeEventDetail>('episode-change', {
      detail: {
        showId: show.id,
        episodeId: episode.id,
        show,
        episode,
      },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  /**
   * Navigate to a specific show and episode by their IDs
   * @param showId - The ID of the show to navigate to
   * @param episodeId - Optional episode ID. If not provided, uses the show's currentEpisodeId
   * @returns true if navigation was successful, false if show/episode not found
   */
  public navigateToEpisode(showId: string, episodeId?: string): boolean {
    const showIndex = this.shows.findIndex((s) => s.id === showId);
    if (showIndex === -1) return false;

    const show = this.shows[showIndex];
    const targetEpisodeId = episodeId || show.currentEpisodeId;
    const episode = show.episodes.find((ep) => ep.id === targetEpisodeId);
    if (!episode) return false;

    // Update internal state
    this.currentShowIndex = showIndex;
    if (episodeId) {
      show.currentEpisodeId = episodeId;
    }

    // Update visuals to reflect new episode selection
    this.updateVisuals();

    return true;
  }

  /**
   * Get the currently selected show and episode
   * @returns Object with current show and episode, or null if not available
   */
  public getCurrentSelection(): { show: Show; episode: Episode } | null {
    const show = this.shows[this.currentShowIndex];
    if (!show) return null;

    const episode = show.episodes.find((ep) => ep.id === show.currentEpisodeId);
    if (!episode) return null;

    return { show, episode };
  }

  /**
   * Navigate to the next episode in the current show
   * Uses the same animation as manual navigation
   * @returns Object with next show and episode, or null if at the last episode
   */
  public navigateToNextEpisode(): { show: Show; episode: Episode } | null {
    const show = this.shows[this.currentShowIndex];
    if (!show) return null;

    const currentEpisodeIndex = this._getCurrentEpisodeIndex(show);
    const nextEpisodeIndex = currentEpisodeIndex + 1;

    // Check if there's a next episode in the current show
    if (nextEpisodeIndex >= show.episodes.length) {
      return null; // No more episodes in this show
    }

    const nextEpisode = show.episodes[nextEpisodeIndex];

    // Update the show's current episode
    show.currentEpisodeId = nextEpisode.id;

    // Use normal snap animation (same as manual drag)
    // episodeDelta = 1 (moved forward one episode)
    // We're currently at offset 0, so snap from 0 + 1 = 1 (one episode below target)
    this.animationController.startSnap(0, 1);

    // No need to re-cache - DOM structure unchanged, only positions change

    // Don't emit episode-change event - this is programmatic navigation
    // The caller (auto-advance) will handle loading the episode
    // Update lastEmittedEpisode to prevent duplicate events
    this.lastEmittedEpisode = { showId: show.id, episodeId: nextEpisode.id };

    return { show, episode: nextEpisode };
  }

  private _handleCircularProgressMouseDown = (e: MouseEvent): void => {
    e.stopPropagation();
    const initialAngle = this.playbackProgress * 2 * Math.PI;
    this.dragController.startCircularProgressDrag(initialAngle);
    this._updateCircularProgressFromMouse(e);

    const handleMouseMove = (moveEvent: MouseEvent): void => {
      if (!this.dragController.isCircularProgressDragging()) return;
      this._updateCircularProgressFromMouse(moveEvent);
    };

    const handleMouseUp = (): void => {
      if (this.dragController.isCircularProgressDragging()) {
        const progress = this.dragController.endCircularProgressDrag();
        this._emitSeek(progress);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  private _handleCircularProgressTouchStart = (e: TouchEvent): void => {
    e.stopPropagation();
    const initialAngle = this.playbackProgress * 2 * Math.PI;
    this.dragController.startCircularProgressDrag(initialAngle);
    this._updateCircularProgressFromTouch(e);

    const handleTouchMove = (moveEvent: TouchEvent): void => {
      if (!this.dragController.isCircularProgressDragging()) return;
      this._updateCircularProgressFromTouch(moveEvent);
    };

    const handleTouchEnd = (): void => {
      if (this.dragController.isCircularProgressDragging()) {
        const progress = this.dragController.endCircularProgressDrag();
        this._emitSeek(progress);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      }
    };

    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);
  };

  private _updateCircularProgressFromMouse(e: MouseEvent): void {
    const container = this.shadowRoot?.querySelector('.circular-progress') as SVGElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;

    // Calculate angle (0 at top, clockwise)
    let angle = Math.atan2(dy, dx) + Math.PI / 2;
    if (angle < 0) angle += 2 * Math.PI;

    this.dragController.updateCircularProgressDrag(angle);
    
    // Batch update
    if (!this.pendingUpdate) {
      this.pendingUpdate = true;
      this.requestUpdate();
      Promise.resolve().then(() => {
        this.pendingUpdate = false;
      });
    }
  }

  private _updateCircularProgressFromTouch(e: TouchEvent): void {
    const container = this.shadowRoot?.querySelector('.circular-progress') as SVGElement;
    if (!container || e.touches.length === 0) return;

    const rect = container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = e.touches[0].clientX - centerX;
    const dy = e.touches[0].clientY - centerY;

    // Calculate angle (0 at top, clockwise)
    let angle = Math.atan2(dy, dx) + Math.PI / 2;
    if (angle < 0) angle += 2 * Math.PI;

    this.dragController.updateCircularProgressDrag(angle);
    
    // Batch update
    if (!this.pendingUpdate) {
      this.pendingUpdate = true;
      this.requestUpdate();
      Promise.resolve().then(() => {
        this.pendingUpdate = false;
      });
    }
  }

  private _onDragMove(x: number, y: number): void {
    if (!this.dragController.isDragging()) return;

    const { verticalModeActivated, horizontalModeActivated } = this.dragController.updateDrag(x, y);

    // Start fade animations when drag modes are activated
    if (verticalModeActivated) {
      this.animationController.startVerticalDragFade(true);
    }
    if (horizontalModeActivated) {
      this.animationController.startHorizontalDragFade(true);
    }

    this.updateVisuals();
  }



  private _updateIndicesFromMomentumTarget(): void {
    // Momentum has settled at target position (offset 0)
    // Indices were already updated when momentum started, so just clean up
    console.log('[MOMENTUM] Animation complete');
    
    // Deactivate drag modes and start fade out animations
    if (this.dragController.isVerticalDragMode()) {
      this.dragController.deactivateVerticalDragMode();
      this.animationController.startVerticalDragFade(false);
    }
    if (this.dragController.isHorizontalDragMode()) {
      this.dragController.deactivateHorizontalDragMode();
      this.animationController.startHorizontalDragFade(false);
    }
  }

  /**
   * Calculate snap target from current drag state
   * Pure function - no side effects, no state mutation
   */
  private _calculateSnapTarget(): {
    targetShowIndex: number;
    targetEpisodeIndex: number;
    showDelta: number;
    episodeDelta: number;
    adjustedOffsetX: number;
    adjustedOffsetY: number;
  } | null {
    const dragState = this.dragController.getDragState();
    if (!dragState.direction) {
      return null;
    }

    const currentShow = this.shows[this.currentShowIndex];
    const currentEpisodeIndex = this._getCurrentEpisodeIndex(currentShow);
    
    let targetShowIndex = this.currentShowIndex;
    let targetEpisodeIndex = currentEpisodeIndex;
    
    if (dragState.direction === 'horizontal') {
      const centerShowPosition = this.currentShowIndex - dragState.offsetX;
      targetShowIndex = Math.max(
        0,
        Math.min(this.shows.length - 1, Math.round(centerShowPosition))
      );
    } else if (dragState.direction === 'vertical') {
      const centerEpisodePosition = currentEpisodeIndex - dragState.offsetY;
      targetEpisodeIndex = Math.max(
        0,
        Math.min(currentShow.episodes.length - 1, Math.round(centerEpisodePosition))
      );
    }
    
    // Calculate deltas
    const showDelta = targetShowIndex - this.currentShowIndex;
    const episodeDelta = targetEpisodeIndex - currentEpisodeIndex;
    
    // Calculate adjusted offset in NEW reference frame
    const adjustedOffsetX = dragState.offsetX + showDelta;
    const adjustedOffsetY = dragState.offsetY + episodeDelta;
    
    return {
      targetShowIndex,
      targetEpisodeIndex,
      showDelta,
      episodeDelta,
      adjustedOffsetX,
      adjustedOffsetY,
    };
  }

  /**
   * Apply snap target - update indices and emit events
   * This is the ONLY place where currentShowIndex/currentEpisodeId should be updated during navigation
   */
  private _applySnapTarget(target: {
    targetShowIndex: number;
    targetEpisodeIndex: number;
    showDelta: number;
    episodeDelta: number;
  }): void {
    const dragState = this.dragController.getDragState();
    
    // Update indices if they changed
    if (dragState.direction === 'horizontal' && target.showDelta !== 0) {
      this.currentShowIndex = target.targetShowIndex;
      
      const show = this.shows[this.currentShowIndex];
      const episode = show.episodes.find((ep) => ep.id === show.currentEpisodeId);
      if (episode) {
        this._emitEpisodeChange(show, episode);
      }
    } else if (dragState.direction === 'vertical' && target.episodeDelta !== 0) {
      this.shows[this.currentShowIndex].currentEpisodeId =
        this.shows[this.currentShowIndex].episodes[target.targetEpisodeIndex].id;
      
      const show = this.shows[this.currentShowIndex];
      const episode = show.episodes[target.targetEpisodeIndex];
      if (episode) {
        this._emitEpisodeChange(show, episode);
      }
    }
  }

  private _onDragEnd(): void {
    if (!this.dragController.isDragging()) return;

    // Check if this was a quick tap on the play button
    const isQuickTap = this.dragController.wasQuickTap();
    
    if (isQuickTap) {
      // Mark that we handled this tap so the click event doesn't double-trigger
      this.dragController.setQuickTapHandled(true);
      
      // End drag and reset state
      this.dragController.endDrag();
      this.dragController.resetDidDrag();
      
      // Trigger play/pause action directly
      if (this.isPlaying || this.isLoading) {
        this._emitPauseRequest();
      } else {
        this._emitPlayRequest();
      }
      
      // Clear the flag after a short delay
      setTimeout(() => {
        this.dragController.setQuickTapHandled(false);
      }, 100);
      
      return;
    }

    // Calculate snap target (pure function, no side effects)
    const target = this._calculateSnapTarget();
    if (!target) {
      this.dragController.endDrag();
      return;
    }
    
    // Apply target immediately - this emits episode-change and starts loading!
    // Loading begins NOW, before animation even starts
    this._applySnapTarget(target);
    
    // Start animation (visual transition happens while episode loads)
    this.dragController.startMomentum(0, 0, target.adjustedOffsetX, target.adjustedOffsetY);
    
    // If momentum didn't start (velocity too low), use snap animation instead
    if (!this.dragController.isMomentumActive()) {
      const distance = Math.sqrt(
        target.adjustedOffsetX * target.adjustedOffsetX + 
        target.adjustedOffsetY * target.adjustedOffsetY
      );
      console.log('[SNAP] Starting snap animation:', {
        from: { x: target.adjustedOffsetX.toFixed(3), y: target.adjustedOffsetY.toFixed(3) },
        distance: distance.toFixed(3),
        duration: '500ms',
        reason: 'velocity too low'
      });
      
      this.animationController.startSnap(target.adjustedOffsetX, target.adjustedOffsetY);

      // Deactivate drag modes and start fade out animations
      if (this.dragController.isVerticalDragMode()) {
        this.dragController.deactivateVerticalDragMode();
        this.animationController.startVerticalDragFade(false);
      }

      if (this.dragController.isHorizontalDragMode()) {
        this.dragController.deactivateHorizontalDragMode();
        this.animationController.startHorizontalDragFade(false);
      }
    }

    this.dragController.endDrag();
  }

  render() {
    const currentShow = this.shows[this.currentShowIndex];
    const currentEpisodeIndex = currentShow ? this._getCurrentEpisodeIndex(currentShow) : -1;

    // Use the play/pause button scale calculated in updateVisuals()
    // Keep button at full scale when playing or loading (no scaling during drag)
    const playPauseScale = (this.isPlaying || this.isLoading) ? 1.0 : this.playPauseButtonScale;

    // Calculate circular progress - use file-level constants
    const progressRadius = PROGRESS_RADIUS;
    const progressCircumference = PROGRESS_CIRCUMFERENCE;
    const progressValue = this.dragController.isCircularProgressDragging()
      ? this.dragController.getCircularProgressDragAngle() / (2 * Math.PI)
      : this.playbackProgress;
    const progressOffset = progressCircumference * (1 - progressValue);

    // Calculate playhead position
    const playheadAngle = progressValue * 2 * Math.PI - Math.PI / 2; // Start at top
    const playheadX = progressRadius + Math.cos(playheadAngle) * progressRadius;
    const playheadY = progressRadius + Math.sin(playheadAngle) * progressRadius;

    const progressSize = progressRadius * 2 + 24; // Extra padding for stroke and playhead
    const progressOpacity = this.animationController.getPlayAnimationProgress();

    return html`
      ${this.shows.flatMap((show, showIndex) =>
      show.episodes.map(
        (episode, episodeIndex) => {
          const isCenterEpisode = showIndex === this.currentShowIndex && episodeIndex === currentEpisodeIndex;

          return html`
              <div
                class="episode-item"
                style="width: ${ICON_SIZE}px; height: ${ICON_SIZE}px; left: 50%; top: 50%; opacity: 0;"
                data-episode-id="${episode.id}"
              >
                <div class="icon-main">
                  ${show.icon.startsWith('http')
              ? html`<img src="${show.icon}" alt="${show.title}" />`
              : html`<span style="font-size: ${ICON_SIZE * 0.75}px;"
                        >${show.icon}</span
                      >`}
                </div>
                <div class="episode-badge" style="transform: scale(${this.MAX_SCALE});">${episodeIndex + 1}</div>
                
                ${isCenterEpisode && this.inlinePlaybackControls ? html`
                  <div 
                    class="play-pause-overlay"
                    style="transform: translateZ(0) scale(${playPauseScale * this.MAX_SCALE}); opacity: ${playPauseScale > 0 ? 1 : 0}; pointer-events: ${playPauseScale > 0 ? 'auto' : 'none'};"
                    @click=${this._handlePlayPauseClick}
                  >
                    ${this.isPlaying || this.isLoading
                ? html`<svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet">
                          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                        </svg>`
                : html`<svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet">
                          <path d="M8 5v14l11-7z"/>
                        </svg>`
              }
                  </div>
                ` : ''}
              </div>
            `;
        }
      )
    )}
      
      ${currentShow && currentEpisodeIndex >= 0 && this.inlinePlaybackControls ? html`
        <svg 
          class="circular-progress"
          style="
            width: ${progressSize}px; 
            height: ${progressSize}px; 
            left: 50%; 
            top: 50%; 
            transform: translate(-50%, -50%);
            opacity: ${progressOpacity};
          "
          viewBox="0 0 ${progressSize} ${progressSize}"
        >
          <circle 
            class="track ${this.isLoading ? 'loading' : ''}"
            cx="${progressSize / 2}" 
            cy="${progressSize / 2}" 
            r="${progressRadius}"
          />
          <circle 
            class="progress"
            cx="${progressSize / 2}" 
            cy="${progressSize / 2}" 
            r="${progressRadius}"
            stroke-dasharray="${progressCircumference}"
            stroke-dashoffset="${progressOffset}"
            style="display: ${this.isPlaying ? 'block' : 'none'}"
          />
          <circle
            class="playhead-hitbox"
            cx="${playheadX + 12}"
            cy="${playheadY + 12}"
            r="24"
            style="display: ${this.isPlaying ? 'block' : 'none'}"
            @mousedown=${this._handleCircularProgressMouseDown}
            @touchstart=${this._handleCircularProgressTouchStart}
          />
          <circle
            class="playhead"
            cx="${playheadX + 12}"
            cy="${playheadY + 12}"
            r="10"
            style="display: ${this.isPlaying ? 'block' : 'none'}"
          />
        </svg>
        
        ${progressOpacity > 0 ? html`
          <div 
            class="playback-show-title"
            style="
              top: calc(50% - ${progressRadius + 40}px);
              opacity: ${progressOpacity};
            "
          >
            ${currentShow.title}
          </div>
          
          <div 
            class="playback-episode-title"
            style="
              top: calc(50% + ${progressRadius + 20}px);
              opacity: ${progressOpacity};
            "
          >
            ${currentShow.episodes[currentEpisodeIndex].title}
          </div>
        ` : ''}
      ` : ''}
      
      ${this.labelData.map((label) => {
      const labelX = label.x;
      const labelY = label.y;
      const showTitleX = labelX + this.SHOW_SPACING;
      const showTitleY = labelY - this.EPISODE_SPACING;
      const episodeTitleX = labelX + this.SHOW_SPACING;
      const episodeTitleY = labelY + this.EPISODE_SPACING;

      // Side episode titles: positioned to the right with spacing and left-aligned
      const sideEpisodeTitleX = labelX + BASE_ICON_SIZE + 16; // Full icon + 16px spacing (another half icon size added)

      return html`
          ${label.showTitleOpacity > 0 ? html`
            <div 
              class="episode-label show-title-label"
              style="
                left: 50%;
                top: 50%;
                transform: translate(calc(-50% + ${showTitleX}px), calc(-50% + ${showTitleY}px));
                opacity: ${label.showTitleOpacity};
                color: ${label.color};
              "
            >
              ${label.showTitle}
            </div>
          ` : ''}
          
          ${label.episodeTitleOpacity > 0 ? html`
            <div 
              class="episode-label episode-title-label"
              style="
                left: 50%;
                top: 50%;
                transform: translate(calc(-50% + ${episodeTitleX}px), calc(-50% + ${episodeTitleY}px));
                opacity: ${label.episodeTitleOpacity};
                color: ${label.color};
              "
            >
              ${label.episodeTitle}
            </div>
          ` : ''}
          
          ${label.sideEpisodeTitleOpacity > 0 ? html`
            <div 
              class="episode-label side-episode-title-label"
              style="
                left: calc(50% + ${sideEpisodeTitleX}px);
                top: calc(50% + ${labelY}px);
                transform: translateY(-50%);
                opacity: ${label.sideEpisodeTitleOpacity};
                color: ${label.color};
              "
            >
              ${label.episodeTitle}
            </div>
          ` : ''}
          
          ${label.verticalShowTitleOpacity > 0 ? html`
            <div 
              class="vertical-show-title"
              style="
                left: calc(50% + ${labelX - (BASE_ICON_SIZE * label.scale) / 2 - 10}px);
                top: calc(50% + ${labelY + BASE_ICON_SIZE / 2}px);
                opacity: ${label.verticalShowTitleOpacity};
                color: ${label.color};
              "
            >
              ${label.showTitle}
            </div>
          ` : ''}
        `;
    })}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'xmb-browser': XmbBrowser;
  }
}
