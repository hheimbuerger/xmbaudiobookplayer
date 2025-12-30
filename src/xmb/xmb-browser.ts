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
 * Cached references to frequently-updated DOM elements.
 * Used for direct DOM manipulation without repeated querySelector calls.
 */
interface DOMRefs {
  // Play/pause button (single element, reparented to current episode)
  playPauseButton: HTMLElement | null;
  playIcon: SVGElement | null;
  pauseIcon: SVGElement | null;
  
  // Progress ring elements (single instances)
  progressRing: SVGCircleElement | null;
  progressTrack: SVGCircleElement | null;
  playhead: SVGCircleElement | null;
  playheadHitbox: SVGCircleElement | null;
  
  // Playback titles (single instances)
  playbackShowTitle: HTMLElement | null;
  playbackEpisodeTitle: HTMLElement | null;
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

  // DOM reference cache for direct manipulation
  private domRefs: DOMRefs = {
    playPauseButton: null,
    playIcon: null,
    pauseIcon: null,
    progressRing: null,
    progressTrack: null,
    playhead: null,
    playheadHitbox: null,
    playbackShowTitle: null,
    playbackEpisodeTitle: null,
  };

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
      false, false, false, false, this.isPlaying
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
      
      // Refresh DOM references after first render
      // This ensures refs are available even if shows hasn't changed yet
      this.refreshDOMRefs();
    }
  }

  willUpdate(changedProperties: PropertyValues): void {
    // Update trace performance flag in render loop controller
    if (changedProperties.has('config')) {
      this.renderLoopController.setTracePerformance(this.config.tracePerformance ?? false);
    }

    // Handle play/pause animation state changes
    // Trigger animation when entering/exiting loading or playing states
    if (changedProperties.has('isPlaying') || changedProperties.has('isLoading')) {
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
          // Check if we're in auto-advance (snap animation is running)
          const isAutoAdvance = this.navigationController.isSnapping();
          
          console.log('[XMB] paused→active transition:', {
            isAutoAdvance,
            isLoading: this.isLoading,
            isPlaying: this.isPlaying,
            isAnimatingToPlay: this.animationController.isAnimatingToPlay(),
            action: 'START_PLAY_ANIMATION'
          });
          
          // Always start play animation when entering active state from paused
          // This is the ONLY place we start play animation for normal play
          this.animationController.startPlayAnimation();
          
          if (!isAutoAdvance) {
            // Normal play/load: additional setup
            
            // Ensure button is visible immediately (no animation)
            this.animationController.setButtonScale(1.0);
            
            // Reset all drag-related state
            this.navigationController.resetAllState();
            
            // Cancel any ongoing fade animations
            this.animationController.cancelFadeAnimations();
          }
          // else: Auto-advance case - animation started above, button will be shown
          // when snap completes and loading → playing transition happens
          
          // Start high-frequency loop for animation
          this.renderLoopController.ensureHighFrequencyLoop();
        } 
        // Transition from loading/playing to paused
        else if (wasActive && !isActive) {
          this.animationController.startPauseAnimation();
          
          // Start high-frequency loop for animation
          this.renderLoopController.ensureHighFrequencyLoop();
        }
        // Transition within active states (playing ↔ loading)
        // This happens during: loading → playing (audio becomes ready)
        else if (wasActive && isActive) {
          // Check if we're transitioning from loading to playing
          const wasLoading = oldIsLoading;
          const nowPlaying = this.isPlaying;
          
          if (wasLoading && nowPlaying) {
            console.log('[XMB] loading→playing transition:', {
              isAnimatingToPlay: this.animationController.isAnimatingToPlay(),
              playAnimProgress: this.animationController.getPlayAnimationProgress(),
              action: 'SET_BUTTON_SCALE_ONLY'
            });
            
            // loading → playing: audio is ready
            // For auto-advance, show the button now (animation already started in paused→loading)
            // For normal play, button is already visible (set in paused→loading)
            // Either way, ensure button is visible
            this.animationController.setButtonScale(1.0);
            
            // Don't start play animation here - it was already started in paused→loading
            // Starting it again causes the double-play effect
          }
          
          // Ensure high-frequency loop stays active during state transitions
          this.renderLoopController.ensureHighFrequencyLoop();
        }
      }
    }
    
    // Update render strategy when playback state changes
    if (changedProperties.has('isPlaying')) {
      this.renderLoopController.updateStrategy(
        this.navigationController.isDragging(),
        this.navigationController.isMomentumActive(),
        this.navigationController.isSnapping(),
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
        
        // Refresh DOM references after structure changes
        this.refreshDOMRefs();
        
        // Position button at current episode initially
        this.reparentButtonToCurrentEpisode();
        
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

  /**
   * Refreshes the DOM reference cache for frequently-updated elements.
   * Called after structure changes (when shows array changes).
   * Uses fail-fast approach - elements should always exist after render.
   */
  private refreshDOMRefs(): void {
    // Query play/pause button and its child icons
    this.domRefs.playPauseButton = this.shadowRoot!.querySelector('.play-pause-overlay') as HTMLElement;
    this.domRefs.playIcon = this.shadowRoot!.querySelector('.play-icon') as SVGElement;
    this.domRefs.pauseIcon = this.shadowRoot!.querySelector('.pause-icon') as SVGElement;
    
    // Query progress ring elements
    this.domRefs.progressRing = this.shadowRoot!.querySelector('.circular-progress .progress') as SVGCircleElement;
    this.domRefs.progressTrack = this.shadowRoot!.querySelector('.circular-progress .track') as SVGCircleElement;
    this.domRefs.playhead = this.shadowRoot!.querySelector('.circular-progress .playhead') as SVGCircleElement;
    this.domRefs.playheadHitbox = this.shadowRoot!.querySelector('.circular-progress .playhead-hitbox') as SVGCircleElement;
    
    // Query playback title elements
    this.domRefs.playbackShowTitle = this.shadowRoot!.querySelector('.playback-show-title') as HTMLElement;
    this.domRefs.playbackEpisodeTitle = this.shadowRoot!.querySelector('.playback-episode-title') as HTMLElement;
  }

  /**
   * Reparents the play/pause button to the current center episode element.
   * Uses appendChild() which MOVES the existing element (doesn't clone).
   * The button inherits the episode's transform and moves with it during drag.
   */
  private reparentButtonToCurrentEpisode(): void {
    // Early return if no shows or no button
    if (!this.domRefs.playPauseButton) {
      console.log('[REPARENT] No button ref');
      return;
    }
    
    const currentShow = this.shows[this.currentShowIndex];
    if (!currentShow || currentShow.episodes.length === 0) {
      console.log('[REPARENT] No current show or no episodes');
      return;
    }
    
    // Get current episode index, fallback to 0 if not found
    let currentEpisodeIndex = this._getCurrentEpisodeIndex(currentShow);
    if (currentEpisodeIndex === -1) {
      currentEpisodeIndex = 0;
    }
    
    // Find the episode element in the cached array
    const episodeEntry = this.episodeElements.find(
      e => e.showIndex === this.currentShowIndex && e.episodeIndex === currentEpisodeIndex
    );
    
    // Early return if episode element not found (can happen during initial render)
    if (!episodeEntry) {
      console.log('[REPARENT] No episode entry found for', this.currentShowIndex, currentEpisodeIndex, 'cached:', this.episodeElements.length);
      return;
    }
    
    console.log('[REPARENT] Moving button to episode', this.currentShowIndex, currentEpisodeIndex);
    // Move button to episode element
    episodeEntry.element.appendChild(this.domRefs.playPauseButton);
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
    
    // Update momentum in navigation controller
    if (this.navigationController.isMomentumActive()) {
      const stillActive = this.navigationController.updateMomentum();
      needsContinue = needsContinue || stillActive;
      if (!stillActive) {
        this._onNavigationComplete();
      }
    }

    // Update snap in navigation controller
    if (this.navigationController.isSnapping()) {
      const stillActive = this.navigationController.updateSnap(timestamp);
      needsContinue = needsContinue || stillActive;
      if (!stillActive) {
        this._onNavigationComplete();
      }
    }

    // Update all animations in animation controller (play/pause, fade)
    const hasAnimationControllerUpdates = this.animationController.update(timestamp);
    needsContinue = needsContinue || this.animationController.hasActiveAnimations();

    // Check if still dragging
    const isDragging = this.navigationController.isDragging();
    const isMomentum = this.navigationController.isMomentumActive();
    const isSnapping = this.navigationController.isSnapping();
    needsContinue = needsContinue || isDragging;

    // Determine if we need visual updates
    // Visual updates needed when: dragging, momentum, snap, or animation controller has updates
    const needsVisualUpdate = isDragging || isMomentum || isSnapping || hasAnimationControllerUpdates;

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
    
    // Get animation progress for playback UI opacity
    const playAnimationProgress = this.animationController.getPlayAnimationProgress();
    
    // Update button directly via DOM manipulation
    // IMPORTANT: Always render at full scale to avoid rasterization issues
    // Control visibility with opacity only - scaling from 0 causes browser to
    // rasterize SVG at tiny size, then GPU-scale the bitmap, resulting in blurriness
    // 
    // Since the button is reparented to the current episode element, it inherits
    // the episode's transform and moves with it during drag. We only need to
    // center it within the episode and control its opacity.
    const button = this.domRefs.playPauseButton;
    if (button) {
      // Clamp scale to 0 if very small to avoid flash
      const clampedScale = buttonScale < 0.01 ? 0 : buttonScale;
      // Button is centered within its parent episode element using translate(-50%, -50%)
      // translateZ(0) ensures GPU compositing for smooth animations
      button.style.transform = `translate(-50%, -50%) translateZ(0) scale(${XMB_CONFIG.maxZoom})`;
      button.style.opacity = clampedScale.toString();
      button.style.pointerEvents = clampedScale > 0 ? 'auto' : 'none';
    }

    // Update playback titles opacity via direct DOM manipulation
    // These titles show during playback and fade out when paused
    if (this.domRefs.playbackShowTitle) {
      this.domRefs.playbackShowTitle.style.opacity = playAnimationProgress.toString();
    }
    if (this.domRefs.playbackEpisodeTitle) {
      this.domRefs.playbackEpisodeTitle.style.opacity = playAnimationProgress.toString();
    }

    // Update circular progress SVG opacity via direct DOM manipulation
    // The progress ring shows during playback and fades out when paused
    const circularProgress = this.shadowRoot?.querySelector('.circular-progress') as SVGElement;
    if (circularProgress) {
      circularProgress.style.opacity = playAnimationProgress.toString();
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

    // Update labels via direct DOM manipulation (no Lit re-renders)
    this.updateLabels(newLabelData);
  }

  /**
   * Updates label elements via direct DOM manipulation without triggering Lit re-renders.
   * 
   * This method queries labels by their data attributes and updates their content,
   * position, opacity, and color directly. Uses fail-fast approach - crashes if
   * expected elements are not found.
   * 
   * @param labelData - Array of label data with positions and opacities
   */
  private updateLabels(labelData: LabelData[]): void {
    // First, reset all labels to hidden (opacity 0)
    // This ensures labels that are no longer in labelData are hidden
    const allShowTitleLabels = this.shadowRoot!.querySelectorAll('.show-title-label');
    const allEpisodeTitleLabels = this.shadowRoot!.querySelectorAll('.episode-title-label');
    const allSideEpisodeTitleLabels = this.shadowRoot!.querySelectorAll('.side-episode-title-label');
    const allVerticalShowTitles = this.shadowRoot!.querySelectorAll('.vertical-show-title');
    
    allShowTitleLabels.forEach(el => (el as HTMLElement).style.opacity = '0');
    allEpisodeTitleLabels.forEach(el => (el as HTMLElement).style.opacity = '0');
    allSideEpisodeTitleLabels.forEach(el => (el as HTMLElement).style.opacity = '0');
    allVerticalShowTitles.forEach(el => (el as HTMLElement).style.opacity = '0');
    
    // Track which vertical show titles have been updated (to avoid duplicates)
    const updatedVerticalShowTitles = new Set<number>();
    
    // Update each label from labelData
    labelData.forEach(label => {
      // Find the episode index for this label
      const show = this.shows[label.showIndex];
      if (!show) return;
      
      const episodeIndex = show.episodes.findIndex(ep => ep.title === label.episodeTitle);
      if (episodeIndex === -1) return;
      
      const key = `${label.showIndex}-${episodeIndex}`;
      
      // Calculate label positions
      const labelX = label.x;
      const labelY = label.y;
      const showTitleX = labelX + XMB_COMPUTED.showSpacingPx;
      const showTitleY = labelY - XMB_COMPUTED.episodeSpacingPx;
      const episodeTitleX = labelX + XMB_COMPUTED.showSpacingPx;
      const episodeTitleY = labelY + XMB_COMPUTED.episodeSpacingPx;
      const sideEpisodeTitleX = labelX + XMB_CONFIG.baseIconSize + XMB_CONFIG.labelSpacing;
      
      // Update show title label
      if (label.showTitleOpacity > 0) {
        const showTitleLabel = this.shadowRoot!.querySelector(
          `.show-title-label[data-episode-key="${key}"]`
        ) as HTMLElement;
        showTitleLabel!.textContent = label.showTitle;
        showTitleLabel!.style.transform = `translate(calc(-50% + ${showTitleX}px), calc(-50% + ${showTitleY}px))`;
        showTitleLabel!.style.opacity = label.showTitleOpacity.toString();
        showTitleLabel!.style.color = label.color;
      }
      
      // Update episode title label
      if (label.episodeTitleOpacity > 0) {
        const episodeTitleLabel = this.shadowRoot!.querySelector(
          `.episode-title-label[data-episode-key="${key}"]`
        ) as HTMLElement;
        episodeTitleLabel!.textContent = label.episodeTitle;
        episodeTitleLabel!.style.transform = `translate(calc(-50% + ${episodeTitleX}px), calc(-50% + ${episodeTitleY}px))`;
        episodeTitleLabel!.style.opacity = label.episodeTitleOpacity.toString();
        episodeTitleLabel!.style.color = label.color;
      }
      
      // Update side episode title label
      if (label.sideEpisodeTitleOpacity > 0) {
        const sideEpisodeTitleLabel = this.shadowRoot!.querySelector(
          `.side-episode-title-label[data-episode-key="${key}"]`
        ) as HTMLElement;
        sideEpisodeTitleLabel!.textContent = label.episodeTitle;
        sideEpisodeTitleLabel!.style.left = `calc(50% + ${sideEpisodeTitleX}px)`;
        sideEpisodeTitleLabel!.style.top = `calc(50% + ${labelY}px)`;
        sideEpisodeTitleLabel!.style.transform = 'translateY(-50%)';
        sideEpisodeTitleLabel!.style.opacity = label.sideEpisodeTitleOpacity.toString();
        sideEpisodeTitleLabel!.style.color = label.color;
      }
      
      // Update vertical show title (only once per show)
      if (label.verticalShowTitleOpacity > 0 && !updatedVerticalShowTitles.has(label.showIndex)) {
        const verticalShowTitle = this.shadowRoot!.querySelector(
          `.vertical-show-title[data-show-index="${label.showIndex}"]`
        ) as HTMLElement;
        verticalShowTitle!.textContent = label.showTitle;
        verticalShowTitle!.style.left = `calc(50% + ${labelX - (XMB_CONFIG.baseIconSize * label.scale) / 2 - XMB_CONFIG.verticalLabelOffset}px)`;
        verticalShowTitle!.style.top = `calc(50% + ${labelY + XMB_CONFIG.baseIconSize / 2}px)`;
        verticalShowTitle!.style.opacity = label.verticalShowTitleOpacity.toString();
        verticalShowTitle!.style.color = label.color;
        updatedVerticalShowTitles.add(label.showIndex);
      }
    });
  }

  // ============================================================================
  // EVENT HANDLERS - DRAG
  // ============================================================================

  private _onDragStart(offsetX: number, offsetY: number): void {
    // Disable dragging when playing or loading
    if (this.isPlaying || this.isLoading) {
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
    
    // Request update for circular progress visual feedback
    this.requestUpdate();
  }

  private _onCircularProgressEnd(): void {
    // Get the final progress from the controller (which has the validated angle)
    const progress = this.circularProgressController.endDrag();
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

    // Reparent button to new center episode
    this.reparentButtonToCurrentEpisode();

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
    this.navigationController.startSnap(
      0, 1,
      'vertical',
      1,
      1,
      'auto-advance'
    );
    
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



  /**
   * Called when any navigation animation completes (momentum or snap)
   * Triggers fade out animations and deactivates drag modes
   */
  private _onNavigationComplete(): void {
    console.log('[NAVIGATION] Animation complete - starting fade out');
    
    // Deactivate drag modes and start fade out animations
    if (this.navigationController.isVerticalDragMode()) {
      this.navigationController.deactivateVerticalDragMode();
      this.animationController.startVerticalDragFade(false);
    }
    if (this.navigationController.isHorizontalDragMode()) {
      this.navigationController.deactivateHorizontalDragMode();
      this.animationController.startHorizontalDragFade(false);
    }
    
    // Ensure high-frequency loop continues for any follow-up animations
    // This is critical for auto-advance where snap completes, then loading/play animations start
    this.renderLoopController.ensureHighFrequencyLoop();
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
    wasClamped: boolean;
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
    
    // Check if target was clamped (natural stop was beyond boundary)
    let wasClamped = false;
    if (dragState.direction === 'horizontal') {
      const friction = XMB_CONFIG.momentumFriction;
      const naturalStopDistance = velocity.x / (1 - friction);
      const naturalStopPosition = this.currentShowIndex - dragState.offsetX - naturalStopDistance;
      const unclampedTarget = Math.round(naturalStopPosition);
      wasClamped = unclampedTarget !== targetShowIndex;
    } else if (dragState.direction === 'vertical') {
      const friction = XMB_CONFIG.momentumFriction;
      const naturalStopDistance = velocity.y / (1 - friction);
      const naturalStopPosition = currentEpisodeIndex - dragState.offsetY - naturalStopDistance;
      const unclampedTarget = Math.round(naturalStopPosition);
      wasClamped = unclampedTarget !== targetEpisodeIndex;
    }
    
    return {
      targetShowIndex,
      targetEpisodeIndex,
      showDelta,
      episodeDelta,
      adjustedOffsetX,
      adjustedOffsetY,
      wasClamped,
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
      
      // Reparent button to new center episode after horizontal navigation
      this.reparentButtonToCurrentEpisode();
    } else if (dragState.direction === 'vertical' && target.episodeDelta !== 0) {
      this.shows[this.currentShowIndex].currentEpisodeId =
        this.shows[this.currentShowIndex].episodes[target.targetEpisodeIndex].id;
      
      const show = this.shows[this.currentShowIndex];
      const episode = show.episodes[target.targetEpisodeIndex];
      if (episode) {
        this._emitEpisodeChange(show, episode);
      }
      
      // Reparent button to new center episode after vertical navigation
      this.reparentButtonToCurrentEpisode();
    }
  }

  private _onDragEnd(): void {
    if (!this.navigationController.isDragging()) return;

    // Calculate snap target (pure function, no side effects)
    const target = this._calculateSnapTarget();
    if (!target) {
      this.navigationController.endDrag();
      // Don't reset didDrag here - let it persist so click handler can see it
      return;
    }
    
    // Mark that a drag occurred to block subsequent click events
    // This is critical for quick swipes where direction might not have locked yet
    // but navigation still happens based on velocity
    this.inputController.setDidDrag();
    
    // Apply target immediately - this emits episode-change and starts loading!
    // Loading begins NOW, before animation even starts
    this._applySnapTarget(target);
    
    const dragState = this.navigationController.getDragState();
    const direction = dragState.direction;
    const fromOffset = target.adjustedOffsetX !== 0 ? target.adjustedOffsetX : target.adjustedOffsetY;
    const targetDelta = target.showDelta !== 0 ? target.showDelta : target.episodeDelta;
    
    // Check velocity to decide between momentum and snap
    const decision = this.navigationController.checkMomentumDecision();
    
    // Decide animation type: boundary snap, low-velocity snap, or momentum
    let animationType: 'boundary' | 'low-velocity' | 'momentum';
    if (target.wasClamped) {
      animationType = 'boundary';
    } else if (decision.useMomentum) {
      animationType = 'momentum';
    } else {
      animationType = 'low-velocity';
    }
    
    // Log decision
    console.log('[NAVIGATION] Decision:', {
      type: animationType === 'momentum' ? 'MOMENTUM' : `SNAP (${animationType})`,
      speed: decision.speed.toFixed(4),
      threshold: XMB_CONFIG.momentumVelocityThreshold.toFixed(4),
      velocity: { x: decision.velocity.x.toFixed(4), y: decision.velocity.y.toFixed(4) },
      timeWindow: decision.details.timeWindow.toFixed(1) + 'ms',
      distance: { x: decision.details.distance.x.toFixed(1) + 'px', y: decision.details.distance.y.toFixed(1) + 'px' },
      wasClamped: target.wasClamped
    });
    
    if (animationType === 'momentum') {
      // Start momentum animation from adjusted offset (in NEW reference frame) to 0
      // The adjusted offset accounts for the index change that just happened
      this.navigationController.startMomentum(
        0, 0, 
        target.adjustedOffsetX, 
        target.adjustedOffsetY,
        direction,
        fromOffset,
        targetDelta
      );
      
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
      
      // Fade animations will start when momentum completes (in _onNavigationComplete)
    } else {
      // Use snap animation (boundary or low-velocity)
      this.navigationController.startSnap(
        target.adjustedOffsetX, 
        target.adjustedOffsetY,
        direction,
        fromOffset,
        targetDelta,
        animationType
      );
      
      // Show button immediately when snap starts
      this.animationController.startButtonShow(0);
      
      // Ensure high-frequency loop for snap animation
      this.renderLoopController.ensureHighFrequencyLoop();

      // Fade animations will start when snap completes (in _onNavigationComplete)
    }

    this.navigationController.endDrag();
    // Don't reset didDrag here - let it persist so click handler can see it
    // It will be reset in handlePlayPauseClick after checking
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
      ${this.shows.flatMap((show) =>
      show.episodes.map(
        (episode, episodeIndex) => {
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
                <div class="episode-badge">${episode.episodeNumber || (episodeIndex + 1)}</div>
              </div>
            `;
        }
      )
    )}
      
      <!-- Play/pause button - single element, always rendered, reparented to current episode -->
      <!-- Positioned at center of parent episode element, inherits episode's transform during drag -->
      <div 
        class="play-pause-overlay"
        @click=${this._handlePlayPauseClick}
        style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) scale(${XMB_CONFIG.maxZoom}); opacity: 0; pointer-events: none;"
      >
        <svg class="play-icon" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" style="display: ${this.isPlaying || this.isLoading ? 'none' : 'block'}">
          <path d="M8 5v14l11-7z"/>
        </svg>
        <svg class="pause-icon" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" style="display: ${this.isPlaying || this.isLoading ? 'block' : 'none'}">
          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
        </svg>
      </div>
      
      <!-- Circular progress SVG - always rendered, visibility controlled by opacity -->
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
      
      <!-- Playback titles - always rendered, visibility controlled by opacity -->
      <div 
        class="playback-show-title"
        style="
          top: calc(50% - ${progressRadius + XMB_CONFIG.playbackTitleTopOffset}px);
          opacity: ${progressOpacity};
        "
      >
        ${currentShow?.title ?? ''}
      </div>
      
      <div 
        class="playback-episode-title"
        style="
          top: calc(50% + ${progressRadius + XMB_CONFIG.playbackTitleBottomOffset}px);
          opacity: ${progressOpacity};
        "
      >
        ${currentShow?.episodes[currentEpisodeIndex]?.title ?? ''}
      </div>
      
      <!-- Labels for all episodes - always rendered, updated via direct DOM manipulation -->
      ${this.shows.flatMap((_show, showIndex) =>
        _show.episodes.map((_episode, episodeIndex) => html`
          <div 
            class="episode-label show-title-label"
            data-episode-key="${showIndex}-${episodeIndex}"
            style="left: 50%; top: 50%; opacity: 0;"
          ></div>
          <div 
            class="episode-label episode-title-label"
            data-episode-key="${showIndex}-${episodeIndex}"
            style="left: 50%; top: 50%; opacity: 0;"
          ></div>
          <div 
            class="episode-label side-episode-title-label"
            data-episode-key="${showIndex}-${episodeIndex}"
            style="left: 50%; top: 50%; opacity: 0;"
          ></div>
        `)
      )}
      
      <!-- Vertical show titles - always rendered for each show -->
      ${this.shows.map((_show, showIndex) => html`
        <div 
          class="vertical-show-title"
          data-show-index="${showIndex}"
          style="left: 50%; top: 50%; opacity: 0;"
        ></div>
      `)}
    
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
