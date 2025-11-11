import { LitElement, html, css, PropertyValues, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { Show, Episode } from '../catalog/media-repository.js';
import { AnimationController } from './controllers/animation-controller.js';
import { NavigationController } from './controllers/navigation-controller.js';
import { CircularProgressController } from './controllers/circular-progress-controller.js';
import { InputController } from './controllers/input-controller.js';
import { ImagePreloaderController } from './controllers/image-preloader-controller.js';
import { RenderLoopController } from './controllers/render-loop-controller.js';
import { 
  LayoutConfig,
  LayoutContext,
  calculateEpisodeLayout,
  calculateOpacity,
  calculateLabelLayout
} from './controllers/layout-calculator.js';
import { XMB_CONFIG, XMB_COMPUTED, generateCSSVariables } from './xmb-config.js';
import styles from './xmb-browser.css?inline';
import './components/debug-overlay.js';
import type { PlayerConfig } from '../../config.js';

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
  @property({ type: Object }) config: PlayerConfig = {};

  // Not a @state() - we don't want Lit re-renders when this changes
  // Visual updates handled by updateVisuals() via direct style manipulation
  private currentShowIndex = 0;
  
  private lastEmittedEpisode: { showId: string; episodeId: string } | null = null;

  static styles = [
    css`${unsafeCSS(generateCSSVariables())}`,
    css`${unsafeCSS(styles)}`
  ];

  // Controllers
  private animationController!: AnimationController;
  private navigationController!: NavigationController;
  private circularProgressController!: CircularProgressController;
  private inputController!: InputController;
  private renderLoopController!: RenderLoopController;
  private imagePreloaderController!: ImagePreloaderController;
  private layoutConfig!: LayoutConfig;

  // Remaining state
  private episodeElements: EpisodeElement[] = [];
  private labelData: LabelData[] = [];
  private pendingUpdate = false; // Track if update is already scheduled

  constructor() {
    super();

    // Initialize animation controller
    this.animationController = new AnimationController({
      animationDuration: XMB_CONFIG.animationDuration,
      verticalDragFadeDuration: XMB_CONFIG.verticalDragFadeDuration,
      horizontalDragFadeDuration: XMB_CONFIG.horizontalDragFadeDuration,
      playPauseButtonAnimDuration: XMB_CONFIG.playPauseButtonAnimDuration,
    });

    // Initialize navigation controller
    this.navigationController = new NavigationController({
      showSpacing: XMB_COMPUTED.showSpacingPx,
      episodeSpacing: XMB_COMPUTED.episodeSpacingPx,
      directionLockThreshold: XMB_COMPUTED.directionLockThresholdPx,
      momentumVelocityScale: XMB_CONFIG.momentumVelocityScale,
      momentumFriction: XMB_CONFIG.momentumFriction,
      momentumMinDuration: XMB_CONFIG.momentumMinDuration,
      momentumMaxDuration: XMB_CONFIG.momentumMaxDuration,
      momentumVelocityThreshold: XMB_CONFIG.momentumVelocityThreshold,
      snapDuration: XMB_CONFIG.snapDuration,
    });

    // Initialize circular progress controller
    this.circularProgressController = new CircularProgressController();

    // Initialize input controller
    this.inputController = new InputController(
      {
        onDragStart: this._onDragStart.bind(this),
        onDragMove: this._onDragMove.bind(this),
        onDragEnd: this._onDragEnd.bind(this),
        onPlayPauseClick: this._onPlayPauseClick.bind(this),
        onCircularProgressStart: this._onCircularProgressStart.bind(this),
        onCircularProgressMove: this._onCircularProgressMove.bind(this),
        onCircularProgressEnd: this._onCircularProgressEnd.bind(this),
      },
      {
        tapTimeThreshold: XMB_CONFIG.tapTimeThreshold,
        tapDistanceThreshold: XMB_CONFIG.tapDistanceThreshold,
      }
    );

    // Initialize render loop controller (includes debug stats)
    // Note: tracePerformance is set later via property, so we pass false initially
    // and update it in willUpdate when the property changes
    this.renderLoopController = new RenderLoopController({
      onHighFreqFrame: this._onHighFreqFrame.bind(this),
      onLowFreqFrame: this._onLowFreqFrame.bind(this),
    }, false);

    // Initialize image preloader controller
    this.imagePreloaderController = new ImagePreloaderController();

    // Initialize layout config
    this.layoutConfig = {
      showSpacing: XMB_COMPUTED.showSpacingPx,
      episodeSpacing: XMB_COMPUTED.episodeSpacingPx,
      fadeRange: XMB_CONFIG.fadeRange,
      maxScale: XMB_CONFIG.maxZoom,
      minScale: XMB_CONFIG.minZoom,
      scaleDistance: XMB_COMPUTED.scaleDistancePx,
      radialPushDistance: XMB_CONFIG.radialPushDistance,
      baseIconSize: XMB_CONFIG.baseIconSize,
    };
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.renderLoopController.updateStrategy(
      false, false, false, this.isPlaying
    );
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.inputController.detach();
    this.renderLoopController.destroy();
  }

  firstUpdated(): void {
    // Attach input controller - needs shadowRoot which only exists after first render
    if (this.shadowRoot) {
      this.inputController.attach(this, this.shadowRoot);
    }
  }

  willUpdate(changedProperties: PropertyValues): void {
    // Update trace performance flag in render loop controller
    if (changedProperties.has('config')) {
      this.renderLoopController.setTracePerformance(this.config.tracePerformance ?? false);
    }

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
          
          // Ensure button is visible immediately (no animation)
          this.animationController.setButtonScale(1.0);
          
          // Reset all drag-related state when starting playback/loading
          this.navigationController.resetAllState();
          this.navigationController.stopSnap();
          
          // Start high-frequency loop for animation
          this.renderLoopController.ensureHighFrequencyLoop();
        } 
        // Transition from loading/playing to paused
        else if (wasActive && !isActive) {
          this.animationController.startPauseAnimation();
          
          // Start high-frequency loop for animation
          this.renderLoopController.ensureHighFrequencyLoop();
        }
      }
    }
    
    // Update render strategy when playback state changes
    if (changedProperties.has('isPlaying')) {
      this.renderLoopController.updateStrategy(
        this.navigationController.isDragging(),
        this.navigationController.isMomentumActive(),
        this.animationController.hasActiveAnimations(),
        this.isPlaying
      );
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
        
        // Preload new images
        const icons = this.shows.flatMap(show => [
          show.icon,
          ...show.episodes.map(ep => ep.icon).filter((icon): icon is string => !!icon)
        ]);
        this.imagePreloaderController.preload(icons);
        
        // Schedule initial visual update after the update cycle completes
        // Using setTimeout ensures we're not in the update cycle when requestUpdate() is called
        setTimeout(() => this.updateVisuals(), 0);
      }
    }
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

  // ============================================================================
  // RENDER LOOP CALLBACKS
  // ============================================================================

  /**
   * High-frequency frame callback (60fps)
   * Called by RenderLoopController for each animation frame
   */
  private _onHighFreqFrame(timestamp: number) {
    let needsContinue = false;
    
    // Update momentum in drag controller
    if (this.navigationController.isMomentumActive()) {
      const stillActive = this.navigationController.updateMomentum();
      needsContinue = needsContinue || stillActive;
      if (!stillActive) {
        this._updateIndicesFromMomentumTarget();
      }
    }

    // Update all animations in animation controller (snap, play/pause, fade)
    const hasAnimationControllerUpdates = this.animationController.update(timestamp);
    needsContinue = needsContinue || this.animationController.hasActiveAnimations();

    // Check if still dragging
    const isDragging = this.navigationController.isDragging();
    const isMomentum = this.navigationController.isMomentumActive();
    needsContinue = needsContinue || isDragging;

    // Determine if we need visual updates
    // Visual updates needed when: dragging, momentum, or animation controller has updates
    const needsVisualUpdate = isDragging || isMomentum || hasAnimationControllerUpdates;

    // Update visuals if anything changed
    // All visual updates use direct DOM manipulation (no Lit re-renders during animation)
    if (needsVisualUpdate) {
      this.updateVisuals();
    }

    // Return state for debug stats and loop control
    return {
      isDragging: this.navigationController.isDragging(),
      isMomentum: this.navigationController.isMomentumActive(),
      isSnapping: this.navigationController.isSnapping(),
      hasAnimations: this.animationController.hasActiveAnimations(),
      isPlaying: this.isPlaying,
      needsContinue,
    };
  }

  /**
   * Low-frequency frame callback (15fps)
   * Called by RenderLoopController for playback updates
   */
  private _onLowFreqFrame(_timestamp: number) {
    this.updateVisuals();
  }

  /**
   * Reset debug statistics (useful for testing specific interactions)
   */
  public resetDebugStats(): void {
    this.renderLoopController.resetDebugStats();
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
    if (this.navigationController.isDragging()) {
      const dragState = this.navigationController.getDragState();
      offsetX = dragState.offsetX;
      offsetY = dragState.offsetY;
    } else if (this.navigationController.isMomentumActive()) {
      const momentumOffset = this.navigationController.getMomentumOffset();
      offsetX = momentumOffset.x;
      offsetY = momentumOffset.y;
    } else if (this.navigationController.isSnapping()) {
      const snapOffset = this.navigationController.getSnapOffset();
      offsetX = snapOffset.x;
      offsetY = snapOffset.y;
    }

    // Update play/pause button scale via direct DOM manipulation
    // Button scale is animated by AnimationController
    // ALWAYS show button when playing or loading to ensure it's clickable
    let buttonScale: number;
    if (this.isPlaying || this.isLoading) {
      // Always visible during playback/loading
      buttonScale = 1.0;
    } else {
      // Use animated scale from AnimationController
      buttonScale = this.animationController.getButtonScale();
    }
    
    // Update button directly via DOM manipulation
    const button = this.shadowRoot?.querySelector('.play-pause-overlay') as HTMLElement;
    if (button) {
      // Clamp scale to 0 if very small to avoid flash
      const clampedScale = buttonScale < 0.01 ? 0 : buttonScale;
      const scale = clampedScale * XMB_CONFIG.maxZoom;
      button.style.transform = `translateZ(0) scale(${scale})`;
      button.style.opacity = clampedScale > 0 ? '1' : '0';
      button.style.pointerEvents = clampedScale > 0 ? 'auto' : 'none';
    }

    // Prepare label data array
    let needsTemplateUpdate = false;
    const newLabelData: LabelData[] = [];

    this.episodeElements.forEach(({ element, showIndex, episodeIndex }) => {
      const show = this.shows[showIndex];
      if (!show) return;

      const currentEpisodeIndex = this._getCurrentEpisodeIndex(show);
      const playAnimationProgress = this.animationController.getPlayAnimationProgress();
      const verticalDragFadeProgress = this.animationController.getVerticalDragFadeProgress();
      const horizontalDragFadeProgress = this.animationController.getHorizontalDragFadeProgress();

      // Build layout context
      const ctx: LayoutContext = {
        showIndex,
        episodeIndex,
        currentShowIndex: this.currentShowIndex,
        currentEpisodeIndex,
        offsetX,
        offsetY,
        playAnimationProgress,
        verticalDragFadeProgress,
        horizontalDragFadeProgress,
        inlinePlaybackControls: this.inlinePlaybackControls,
        config: this.layoutConfig,
      };

      // Calculate episode layout using layout calculator
      const layout = calculateEpisodeLayout(ctx);

      // Calculate opacity using layout calculator
      const showOffsetFromCenter = showIndex - this.currentShowIndex + offsetX;
      const isCurrentShow = showIndex === this.currentShowIndex;
      const isCenterEpisode = showIndex === this.currentShowIndex && episodeIndex === currentEpisodeIndex;
      
      const opacity = calculateOpacity(ctx, showOffsetFromCenter, isCurrentShow, isCenterEpisode);

      // Apply layout to element
      element.style.transform = `translate(calc(-50% + ${layout.x}px), calc(-50% + ${layout.y}px)) scale(${layout.scale})`;
      element.style.opacity = opacity.toString();

      // Calculate label data using layout calculator
      const episode = show.episodes[episodeIndex];
      if (episode && opacity > 0) {
        const distanceFromCenter = Math.sqrt(layout.x * layout.x + layout.y * layout.y);
        const scale = layout.scale * XMB_CONFIG.maxZoom; // Convert back to zoom level for label calculations
        const isCurrentEpisodeOfShow = episodeIndex === currentEpisodeIndex;

        const labelLayout = calculateLabelLayout(
          show.title,
          episode.title,
          layout.x,
          layout.y,
          distanceFromCenter,
          scale,
          opacity,
          isCurrentShow,
          isCurrentEpisodeOfShow,
          ctx
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

  // ============================================================================
  // EVENT HANDLERS - DRAG
  // ============================================================================

  private _onDragStart(offsetX: number, offsetY: number): void {
    // Disable dragging when playing or loading (only if inline controls enabled)
    if (this.inlinePlaybackControls && (this.isPlaying || this.isLoading)) {
      return;
    }

    // Cancel any active animations
    if (this.navigationController.isSnapping() || this.navigationController.isMomentumActive()) {
      this.navigationController.stopSnap();
      this.navigationController.stopMomentum();
    }

    this.navigationController.startDrag(offsetX, offsetY, false);
    
    // Start high-frequency loop for drag
    this.renderLoopController.ensureHighFrequencyLoop();
  }

  private _onPlayPauseClick(): void {
    // In loading or playing state, show pause button and allow pausing
    if (this.isPlaying || this.isLoading) {
      this._emitPauseRequest();
    } else {
      this._emitPlayRequest();
    }
  }

  private _handlePlayPauseClick = (e: Event): void => {
    this.inputController.handlePlayPauseClick(e);
  };

  // ============================================================================
  // EVENT EMITTERS
  // ============================================================================

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

  // ============================================================================
  // EVENT HANDLERS - CIRCULAR PROGRESS
  // ============================================================================

  private _onCircularProgressStart(angle: number): void {
    this.circularProgressController.startDrag(angle);
  }

  private _onCircularProgressMove(angle: number): void {
    this.circularProgressController.updateDrag(angle);
    
    // Batch update
    if (!this.pendingUpdate) {
      this.pendingUpdate = true;
      this.requestUpdate();
      Promise.resolve().then(() => {
        this.pendingUpdate = false;
      });
    }
  }

  private _onCircularProgressEnd(progress: number): void {
    this._emitSeek(progress);
  }

  private _handleCircularProgressMouseDown = (e: MouseEvent): void => {
    const initialAngle = this.playbackProgress * 2 * Math.PI;
    this._onCircularProgressStart(initialAngle);
    this.inputController.handleCircularProgressMouseDown(e);
  };

  private _handleCircularProgressTouchStart = (e: TouchEvent): void => {
    const initialAngle = this.playbackProgress * 2 * Math.PI;
    this._onCircularProgressStart(initialAngle);
    this.inputController.handleCircularProgressTouchStart(e);
  };

  // ============================================================================
  // NAVIGATION LOGIC
  // ============================================================================

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
    this.navigationController.startSnap(0, 1);
    
    // Ensure high-frequency loop for snap animation
    this.renderLoopController.ensureHighFrequencyLoop();

    // No need to re-cache - DOM structure unchanged, only positions change

    // Don't emit episode-change event - this is programmatic navigation
    // The caller (auto-advance) will handle loading the episode
    // Update lastEmittedEpisode to prevent duplicate events
    this.lastEmittedEpisode = { showId: show.id, episodeId: nextEpisode.id };

    return { show, episode: nextEpisode };
  }

  private _onDragMove(deltaX: number, deltaY: number): void {
    if (!this.navigationController.isDragging()) return;

    const { verticalModeActivated, horizontalModeActivated } = this.navigationController.updateDrag(deltaX, deltaY);

    // Start fade animations when drag modes are activated
    if (verticalModeActivated) {
      this.animationController.startVerticalDragFade(true);
      this.animationController.startButtonHide(); // Hide button when drag direction locks
      this.inputController.setDidDrag();
    }
    if (horizontalModeActivated) {
      this.animationController.startHorizontalDragFade(true);
      this.animationController.startButtonHide(); // Hide button when drag direction locks
      this.inputController.setDidDrag();
    }

    this.updateVisuals();
  }



  private _updateIndicesFromMomentumTarget(): void {
    // Momentum has settled at target position (offset 0)
    // Indices were already updated when momentum started, so just clean up
    
    // Deactivate drag modes and start fade out animations
    if (this.navigationController.isVerticalDragMode()) {
      this.navigationController.deactivateVerticalDragMode();
      this.animationController.startVerticalDragFade(false);
    }
    if (this.navigationController.isHorizontalDragMode()) {
      this.navigationController.deactivateHorizontalDragMode();
      this.animationController.startHorizontalDragFade(false);
    }
  }

  // ============================================================================
  // SNAP & MOMENTUM LOGIC
  // ============================================================================

  /**
   * Calculate snap target using physics-based momentum simulation
   * 
   * Process:
   * 1. Simulate friction-based deceleration to find natural stopping point
   * 2. Snap to nearest episode from that point
   * 3. Return target for animation
   */
  private _calculateSnapTarget(): {
    targetShowIndex: number;
    targetEpisodeIndex: number;
    showDelta: number;
    episodeDelta: number;
    adjustedOffsetX: number;
    adjustedOffsetY: number;
  } | null {
    const dragState = this.navigationController.getDragState();
    if (!dragState.direction) {
      return null;
    }

    const currentShow = this.shows[this.currentShowIndex];
    const currentEpisodeIndex = this._getCurrentEpisodeIndex(currentShow);
    
    // Calculate velocity
    const velocity = this.navigationController.calculateVelocity();
    
    let targetShowIndex = this.currentShowIndex;
    let targetEpisodeIndex = currentEpisodeIndex;
    
    if (dragState.direction === 'horizontal') {
      // Simulate friction-based deceleration to find natural stopping point
      // Using formula: distance = velocity / (1 - friction)
      // This gives us where the item would naturally stop with friction
      const friction = XMB_CONFIG.momentumFriction;
      const naturalStopDistance = velocity.x / (1 - friction);
      
      // Calculate where we'd naturally stop
      const naturalStopPosition = this.currentShowIndex - dragState.offsetX - naturalStopDistance;
      
      // Snap to nearest episode
      targetShowIndex = Math.max(
        0,
        Math.min(this.shows.length - 1, Math.round(naturalStopPosition))
      );
      
      console.log('[TARGET] Horizontal:', {
        currentIndex: this.currentShowIndex,
        currentOffset: dragState.offsetX.toFixed(3),
        velocity: velocity.x.toFixed(3),
        naturalStopDistance: naturalStopDistance.toFixed(3),
        naturalStopPosition: naturalStopPosition.toFixed(3),
        targetIndex: targetShowIndex,
        delta: targetShowIndex - this.currentShowIndex
      });
    } else if (dragState.direction === 'vertical') {
      // Same physics simulation for vertical
      const friction = XMB_CONFIG.momentumFriction;
      const naturalStopDistance = velocity.y / (1 - friction);
      
      const naturalStopPosition = currentEpisodeIndex - dragState.offsetY - naturalStopDistance;
      
      targetEpisodeIndex = Math.max(
        0,
        Math.min(currentShow.episodes.length - 1, Math.round(naturalStopPosition))
      );
      
      console.log('[TARGET] Vertical:', {
        currentIndex: currentEpisodeIndex,
        currentOffset: dragState.offsetY.toFixed(3),
        velocity: velocity.y.toFixed(3),
        naturalStopDistance: naturalStopDistance.toFixed(3),
        naturalStopPosition: naturalStopPosition.toFixed(3),
        targetIndex: targetEpisodeIndex,
        delta: targetEpisodeIndex - currentEpisodeIndex
      });
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
    const dragState = this.navigationController.getDragState();
    
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
    if (!this.navigationController.isDragging()) return;

    // Calculate snap target (pure function, no side effects)
    const target = this._calculateSnapTarget();
    if (!target) {
      this.navigationController.endDrag();
      this.inputController.resetDidDrag();
      return;
    }
    
    // Apply target immediately - this emits episode-change and starts loading!
    // Loading begins NOW, before animation even starts
    this._applySnapTarget(target);
    
    // Start animation from adjusted offset (in NEW reference frame) to 0
    // The adjusted offset accounts for the index change that just happened
    this.navigationController.startMomentum(0, 0, target.adjustedOffsetX, target.adjustedOffsetY);
    
    console.log('[DRAG END] Starting animation:', {
      direction: this.navigationController.getDragState().direction,
      fromOffset: target.adjustedOffsetX !== 0 ? target.adjustedOffsetX.toFixed(3) : target.adjustedOffsetY.toFixed(3),
      toOffset: '0.000',
      targetDelta: target.showDelta !== 0 ? target.showDelta : target.episodeDelta
    });
    
    // Handle button reappearance based on animation type
    if (this.navigationController.isMomentumActive()) {
      // Coast animation: synchronize button reappearance to finish with coast
      const coastDuration = this.navigationController.getMomentumDuration();
      const buttonAnimDuration = XMB_CONFIG.playPauseButtonAnimDuration;
      
      // Calculate delay so both animations finish together
      const buttonDelay = Math.max(0, coastDuration - buttonAnimDuration);
      
      console.log('[BUTTON] Synchronizing button show with coast:', {
        coastDuration: coastDuration + 'ms',
        buttonAnimDuration: buttonAnimDuration + 'ms',
        buttonDelay: buttonDelay + 'ms'
      });
      
      this.animationController.startButtonShow(buttonDelay);
    } else {
      // If momentum didn't start (velocity too low), use snap animation instead
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
      
      this.navigationController.startSnap(target.adjustedOffsetX, target.adjustedOffsetY);
      
      // Show button immediately when snap starts
      this.animationController.startButtonShow(0);
      
      // Ensure high-frequency loop for snap animation
      this.renderLoopController.ensureHighFrequencyLoop();

      // Deactivate drag modes and start fade out animations
      if (this.navigationController.isVerticalDragMode()) {
        this.navigationController.deactivateVerticalDragMode();
        this.animationController.startVerticalDragFade(false);
      }

      if (this.navigationController.isHorizontalDragMode()) {
        this.navigationController.deactivateHorizontalDragMode();
        this.animationController.startHorizontalDragFade(false);
      }
    }

    this.navigationController.endDrag();
    this.inputController.resetDidDrag();
  }

  // ============================================================================
  // RENDER METHOD
  // ============================================================================

  render() {
    const currentShow = this.shows[this.currentShowIndex];
    const currentEpisodeIndex = currentShow ? this._getCurrentEpisodeIndex(currentShow) : -1;

    // Calculate circular progress using config
    const progressRadius = XMB_COMPUTED.progressRadius;
    const progressCircumference = XMB_COMPUTED.progressCircumference;
    const progressValue = this.circularProgressController.isDragging()
      ? this.circularProgressController.getDragAngle() / (2 * Math.PI)
      : this.playbackProgress;
    const progressOffset = progressCircumference * (1 - progressValue);

    // Calculate playhead position
    const playheadAngle = progressValue * 2 * Math.PI - Math.PI / 2; // Start at top
    const playheadX = progressRadius + Math.cos(playheadAngle) * progressRadius;
    const playheadY = progressRadius + Math.sin(playheadAngle) * progressRadius;

    const progressSize = XMB_COMPUTED.progressSize;
    const progressOpacity = this.animationController.getPlayAnimationProgress();

    return html`
      ${this.shows.flatMap((show, showIndex) =>
      show.episodes.map(
        (episode, episodeIndex) => {
          const isCenterEpisode = showIndex === this.currentShowIndex && episodeIndex === currentEpisodeIndex;

          return html`
              <div
                class="episode-item"
                style="width: ${XMB_COMPUTED.iconSize}px; height: ${XMB_COMPUTED.iconSize}px; left: 50%; top: 50%; opacity: 0;"
                data-episode-id="${episode.id}"
              >
                ${(() => {
                  // Use episode icon if available, otherwise fall back to show icon
                  const iconToUse = episode.icon || show.icon;
                  const isEmoji = !iconToUse.startsWith('http');
                  return html`
                    <div class="icon-main ${isEmoji ? 'emoji-icon' : ''}">
                      ${isEmoji
                        ? html`<span style="font-size: ${XMB_COMPUTED.iconSize * 0.75}px;"
                                >${iconToUse}</span>`
                        : html`<img src="${iconToUse}" alt="${episode.title}" />`}
                    </div>
                  `;
                })()}
                <div class="episode-badge" style="transform: scale(${XMB_CONFIG.maxZoom});">${episode.episodeNumber || (episodeIndex + 1)}</div>
                
                ${isCenterEpisode && this.inlinePlaybackControls ? html`
                  <div 
                    class="play-pause-overlay"
                    data-episode-id="${episode.id}"
                    @click=${this._handlePlayPauseClick}
                    style="transform: translateZ(0) scale(0); opacity: 0; pointer-events: none;"
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
            cx="${playheadX + XMB_CONFIG.progressPadding / 2}"
            cy="${playheadY + XMB_CONFIG.progressPadding / 2}"
            r="${XMB_CONFIG.playheadHitboxRadius}"
            style="display: ${this.isPlaying ? 'block' : 'none'}"
            @mousedown=${this._handleCircularProgressMouseDown}
            @touchstart=${this._handleCircularProgressTouchStart}
          />
          <circle
            class="playhead"
            cx="${playheadX + XMB_CONFIG.progressPadding / 2}"
            cy="${playheadY + XMB_CONFIG.progressPadding / 2}"
            r="${XMB_CONFIG.playheadRadius}"
            style="display: ${this.isPlaying ? 'block' : 'none'}"
          />
        </svg>
        
        ${progressOpacity > 0 ? html`
          <div 
            class="playback-show-title"
            style="
              top: calc(50% - ${progressRadius + XMB_CONFIG.playbackTitleTopOffset}px);
              opacity: ${progressOpacity};
            "
          >
            ${currentShow.title}
          </div>
          
          <div 
            class="playback-episode-title"
            style="
              top: calc(50% + ${progressRadius + XMB_CONFIG.playbackTitleBottomOffset}px);
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
      const showTitleX = labelX + XMB_COMPUTED.showSpacingPx;
      const showTitleY = labelY - XMB_COMPUTED.episodeSpacingPx;
      const episodeTitleX = labelX + XMB_COMPUTED.showSpacingPx;
      const episodeTitleY = labelY + XMB_COMPUTED.episodeSpacingPx;

      // Side episode titles: positioned to the right with spacing and left-aligned
      const sideEpisodeTitleX = labelX + XMB_CONFIG.baseIconSize + XMB_CONFIG.labelSpacing;

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
                left: calc(50% + ${labelX - (XMB_CONFIG.baseIconSize * label.scale) / 2 - XMB_CONFIG.verticalLabelOffset}px);
                top: calc(50% + ${labelY + XMB_CONFIG.baseIconSize / 2}px);
                opacity: ${label.verticalShowTitleOpacity};
                color: ${label.color};
              "
            >
              ${label.showTitle}
            </div>
          ` : ''}
        `;
    })}
    
    ${this.config.tracePerformance ? html`
      <debug-overlay .stats=${this.renderLoopController.getDebugStats()}></debug-overlay>
    ` : ''}
    `;
  }

}

declare global {
  interface HTMLElementTagNameMap {
    'xmb-browser': XmbBrowser;
  }
}
