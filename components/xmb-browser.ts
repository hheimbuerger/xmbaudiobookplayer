import { LitElement, html, css, PropertyValues } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { Show, Episode } from '../types/data.js';

/**
 * State change event data emitted by the XMB browser
 */
export interface XmbStateChangeEvent {
  /** The currently selected show */
  currentShow: Show;
  /** The currently selected episode */
  currentEpisode: Episode;
}

interface DragState {
  active: boolean;
  startX: number;
  startY: number;
  direction: 'horizontal' | 'vertical' | null;
  offsetX: number;
  offsetY: number;
}

interface SnapState {
  active: boolean;
  startOffsetX: number;
  startOffsetY: number;
  startTime: number;
}

interface EpisodeElement {
  element: HTMLElement;
  showIndex: number;
  episodeIndex: number;
}

@customElement('xmb-browser')
export class XmbBrowser extends LitElement {
  @property({ type: Array }) shows: Show[] = [];
  @property({ type: Number }) currentShowIndex = 0;
  @property({ type: Function }) onStateChange: ((event: XmbStateChangeEvent) => void) | null = null;
  @property({ type: Boolean }) isPlaying = false;
  @property({ type: Number }) playbackProgress = 0; // 0 to 1
  @property({ type: Function }) onPlayPauseToggle: (() => void) | null = null;
  @property({ type: Function }) onSeek: ((progress: number) => void) | null = null;

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
      background: rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
      transition: none;
      user-select: none;
      -webkit-user-select: none;
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
    }

    .episode-badge {
      position: absolute;
      bottom: 2px;
      right: 2px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      font-size: 10px;
      font-weight: bold;
      padding: 2px 4px;
      border-radius: 3px;
      line-height: 1;
      min-width: 14px;
      text-align: center;
    }

    .play-pause-overlay {
      position: absolute;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: rgba(37, 99, 235, 0.95);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
      z-index: 15;
      pointer-events: auto;
    }

    .play-pause-overlay:hover {
      background: rgba(59, 130, 246, 0.95);
      transform: scale(1.1);
    }

    .play-pause-overlay svg {
      width: 20px;
      height: 20px;
      fill: white;
    }

    .circular-progress {
      position: absolute;
      z-index: 10;
      pointer-events: none;
    }

    .circular-progress circle {
      fill: none;
      stroke-width: 8;
      pointer-events: none;
    }

    .circular-progress .track {
      stroke: rgba(255, 255, 255, 0.2);
    }

    .circular-progress .progress {
      stroke: #2563eb;
      stroke-linecap: round;
      transform: rotate(-90deg);
      transform-origin: center;
      transition: stroke-dashoffset 0.1s linear;
    }

    .circular-progress .playhead {
      fill: white;
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
  `;

  private readonly SNAP_DURATION = 200;
  private readonly ICON_SIZE = 72;
  private readonly SHOW_SPACING_ICONS = 1.8;
  private readonly EPISODE_SPACING_ICONS = 1.8;
  private readonly DIRECTION_LOCK_THRESHOLD_ICONS = 0.2;
  private readonly FADE_RANGE = 0.5;
  private readonly MAX_SCALE = 1.5;
  private readonly SCALE_DISTANCE_ICONS = 3.3;
  private readonly RADIAL_PUSH_DISTANCE = 1.0; // In icon sizes
  private readonly ANIMATION_DURATION = 300; // ms

  private readonly SHOW_SPACING: number;
  private readonly EPISODE_SPACING: number;
  private readonly DIRECTION_LOCK_THRESHOLD: number;
  private readonly SCALE_DISTANCE: number;

  private dragState: DragState;
  private snapState: SnapState;
  private episodeElements: EpisodeElement[] = [];
  private animationFrameId: number | null = null;
  private playAnimationProgress = 0; // 0 to 1
  private playAnimationStartTime = 0;
  private isAnimatingToPlay = false;
  private isAnimatingToPause = false;
  private circularProgressDragging = false;
  private circularProgressDragAngle = 0;
  private circularProgressLastAngle = 0; // Track last angle to prevent jumps
  private playPauseButtonScale = 1.0;

  constructor() {
    super();

    this.SHOW_SPACING = this.SHOW_SPACING_ICONS * this.ICON_SIZE;
    this.EPISODE_SPACING = this.EPISODE_SPACING_ICONS * this.ICON_SIZE;
    this.DIRECTION_LOCK_THRESHOLD = this.DIRECTION_LOCK_THRESHOLD_ICONS * this.ICON_SIZE;
    this.SCALE_DISTANCE = this.SCALE_DISTANCE_ICONS * this.ICON_SIZE;

    this.dragState = {
      active: false,
      startX: 0,
      startY: 0,
      direction: null,
      offsetX: 0,
      offsetY: 0,
    };

    this.snapState = {
      active: false,
      startOffsetX: 0,
      startOffsetY: 0,
      startTime: 0,
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
    this._render();
  }

  updated(changedProperties: PropertyValues): void {
    if (changedProperties.has('shows') || changedProperties.has('currentShowIndex')) {
      this._cacheElements();
      this._render();
    }

    if (changedProperties.has('isPlaying')) {
      // Start animation when play state changes
      if (this.isPlaying) {
        this.isAnimatingToPlay = true;
        this.isAnimatingToPause = false;
      } else {
        this.isAnimatingToPlay = false;
        this.isAnimatingToPause = true;
      }
      this.playAnimationStartTime = performance.now();
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

  private _startAnimation(): void {
    const animate = (): void => {
      let needsRender = false;

      if (this.snapState.active) {
        const elapsed = performance.now() - this.snapState.startTime;
        if (elapsed >= this.SNAP_DURATION) {
          this.snapState.active = false;
        }
        needsRender = true;
      }

      if (this.isAnimatingToPlay || this.isAnimatingToPause) {
        const elapsed = performance.now() - this.playAnimationStartTime;
        const progress = Math.min(elapsed / this.ANIMATION_DURATION, 1);
        const eased = this.isAnimatingToPlay
          ? progress // Ease out for play
          : 1 - Math.pow(1 - progress, 3); // Ease in for pause

        this.playAnimationProgress = this.isAnimatingToPlay ? eased : 1 - eased;

        if (progress >= 1) {
          this.isAnimatingToPlay = false;
          this.isAnimatingToPause = false;
          this.playAnimationProgress = this.isPlaying ? 1 : 0;
        }
        needsRender = true;
        this.requestUpdate(); // Update template for circular progress opacity
      }

      if (needsRender) {
        this._render();
      }

      this.animationFrameId = requestAnimationFrame(animate);
    };
    animate();
  }

  private _getCurrentSnapOffset(): { x: number; y: number } {
    const elapsed = performance.now() - this.snapState.startTime;
    const progress = Math.min(elapsed / this.SNAP_DURATION, 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    return {
      x: this.snapState.startOffsetX * (1 - eased),
      y: this.snapState.startOffsetY * (1 - eased),
    };
  }

  private _render(): void {
    const offsetX = this.dragState.active
      ? this.dragState.offsetX
      : this.snapState.active
        ? this._getCurrentSnapOffset().x
        : 0;
    const offsetY = this.dragState.active
      ? this.dragState.offsetY
      : this.snapState.active
        ? this._getCurrentSnapOffset().y
        : 0;

    // Calculate play/pause button scale based on offset from center
    // Scale down linearly as we move away (disappears at 0.5 offset)
    const totalOffset = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
    const newScale = Math.max(0, Math.min(1, 1.0 - (totalOffset / 0.5)));
    if (newScale !== this.playPauseButtonScale) {
      this.playPauseButtonScale = newScale;
      this.requestUpdate();
    }

    this.episodeElements.forEach(({ element, showIndex, episodeIndex }) => {
      const show = this.shows[showIndex];
      if (!show) return;

      const currentEpisodeIndex = this._getCurrentEpisodeIndex(show);
      const showOffsetFromCenter = showIndex - this.currentShowIndex + offsetX;
      const isCurrentShow = showIndex === this.currentShowIndex;
      const episodeOffsetFromCenter =
        episodeIndex - currentEpisodeIndex + (isCurrentShow ? offsetY : 0);

      let showPixelOffsetX = showOffsetFromCenter * this.SHOW_SPACING;
      let episodePixelOffsetY = episodeOffsetFromCenter * this.EPISODE_SPACING;

      // Apply radial push when playing
      const isCenterEpisode = showIndex === this.currentShowIndex && episodeIndex === currentEpisodeIndex;
      if (!isCenterEpisode && this.playAnimationProgress > 0) {
        const pushDistance = this.RADIAL_PUSH_DISTANCE * this.ICON_SIZE * this.playAnimationProgress;

        // Calculate direction from center
        if (showOffsetFromCenter !== 0 || episodeOffsetFromCenter !== 0) {
          const angle = Math.atan2(episodePixelOffsetY, showPixelOffsetX);
          showPixelOffsetX += Math.cos(angle) * pushDistance;
          episodePixelOffsetY += Math.sin(angle) * pushDistance;
        } else if (showOffsetFromCenter === 0 && episodeOffsetFromCenter === 0) {
          // This shouldn't happen, but just in case
          episodePixelOffsetY += pushDistance;
        }
      }

      const distanceFromScreenCenter = Math.sqrt(
        showPixelOffsetX * showPixelOffsetX + episodePixelOffsetY * episodePixelOffsetY
      );
      const scale = Math.max(
        1,
        this.MAX_SCALE - distanceFromScreenCenter / this.SCALE_DISTANCE
      );

      let opacity = 0;
      const isCurrentEpisodeOfShow = episodeIndex === currentEpisodeIndex;

      if (isCurrentEpisodeOfShow) {
        // Current episode of every show is always visible
        opacity = 1.0;
      } else {
        // Non-current episodes only visible when on their show (within fade range)
        const absShowOffset = Math.abs(showOffsetFromCenter);
        if (absShowOffset <= this.FADE_RANGE) {
          opacity = 1.0 - absShowOffset / this.FADE_RANGE;
        }
      }

      element.style.transform = `translate(calc(-50% + ${showPixelOffsetX}px), calc(-50% + ${episodePixelOffsetY}px)) scale(${scale})`;
      element.style.opacity = opacity.toString();
    });
  }

  private _handleMouseDown = (e: MouseEvent): void => {
    this._onDragStart(e.clientX, e.clientY);
  };

  private _handleMouseMove = (e: MouseEvent): void => {
    this._onDragMove(e.clientX, e.clientY);
  };

  private _handleMouseUp = (): void => {
    this._onDragEnd();
  };

  private _handleTouchStart = (e: TouchEvent): void => {
    this._onDragStart(e.touches[0].clientX, e.touches[0].clientY);
  };

  private _handleTouchMove = (e: TouchEvent): void => {
    this._onDragMove(e.touches[0].clientX, e.touches[0].clientY);
  };

  private _handleTouchEnd = (): void => {
    this._onDragEnd();
  };

  private _onDragStart(x: number, y: number): void {
    if (this.snapState.active) return;

    // Disable dragging when playing
    if (this.isPlaying) return;

    this.dragState.active = true;
    this.dragState.startX = x;
    this.dragState.startY = y;
    this.dragState.direction = null;
    this.dragState.offsetX = 0;
    this.dragState.offsetY = 0;
  }

  private _handlePlayPauseClick(e: Event): void {
    e.stopPropagation();
    if (this.onPlayPauseToggle) {
      this.onPlayPauseToggle();
    }
  }

  private _handleCircularProgressMouseDown = (e: MouseEvent): void => {
    e.stopPropagation();
    this.circularProgressDragging = true;
    // Initialize last angle from current playback progress
    this.circularProgressLastAngle = this.playbackProgress * 2 * Math.PI;
    this._updateCircularProgressFromMouse(e);

    const handleMouseMove = (moveEvent: MouseEvent): void => {
      if (!this.circularProgressDragging) return;
      this._updateCircularProgressFromMouse(moveEvent);
    };

    const handleMouseUp = (): void => {
      if (this.circularProgressDragging) {
        this.circularProgressDragging = false;
        if (this.onSeek) {
          this.onSeek(this.circularProgressDragAngle / (2 * Math.PI));
        }
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  private _handleCircularProgressTouchStart = (e: TouchEvent): void => {
    e.stopPropagation();
    this.circularProgressDragging = true;
    // Initialize last angle from current playback progress
    this.circularProgressLastAngle = this.playbackProgress * 2 * Math.PI;
    this._updateCircularProgressFromTouch(e);

    const handleTouchMove = (moveEvent: TouchEvent): void => {
      if (!this.circularProgressDragging) return;
      this._updateCircularProgressFromTouch(moveEvent);
    };

    const handleTouchEnd = (): void => {
      if (this.circularProgressDragging) {
        this.circularProgressDragging = false;
        if (this.onSeek) {
          this.onSeek(this.circularProgressDragAngle / (2 * Math.PI));
        }
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

    // Prevent jumping across the 12 o'clock boundary
    // If the new angle would cause a large jump (> 180 degrees), clamp it
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
    this.requestUpdate();
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

    // Prevent jumping across the 12 o'clock boundary
    // If the new angle would cause a large jump (> 180 degrees), clamp it
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
    this.requestUpdate();
  }

  private _onDragMove(x: number, y: number): void {
    if (!this.dragState.active) return;

    const deltaX = x - this.dragState.startX;
    const deltaY = y - this.dragState.startY;

    if (!this.dragState.direction) {
      if (
        Math.abs(deltaX) > this.DIRECTION_LOCK_THRESHOLD ||
        Math.abs(deltaY) > this.DIRECTION_LOCK_THRESHOLD
      ) {
        this.dragState.direction =
          Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
      }
    }

    if (this.dragState.direction === 'horizontal') {
      this.dragState.offsetX = deltaX / this.SHOW_SPACING;
      this.dragState.offsetY = 0;
    } else if (this.dragState.direction === 'vertical') {
      this.dragState.offsetY = deltaY / this.EPISODE_SPACING;
      this.dragState.offsetX = 0;
    }

    this._render();
  }

  private _onDragEnd(): void {
    if (!this.dragState.active) return;

    const currentShow = this.shows[this.currentShowIndex];
    const currentEpisodeIndex = this._getCurrentEpisodeIndex(currentShow);

    let targetShowIndex = this.currentShowIndex;
    let targetEpisodeIndex = currentEpisodeIndex;

    if (this.dragState.direction === 'horizontal') {
      const centerShowPosition = this.currentShowIndex - this.dragState.offsetX;
      targetShowIndex = Math.max(
        0,
        Math.min(this.shows.length - 1, Math.round(centerShowPosition))
      );
    } else if (this.dragState.direction === 'vertical') {
      const centerEpisodePosition = currentEpisodeIndex - this.dragState.offsetY;
      targetEpisodeIndex = Math.max(
        0,
        Math.min(currentShow.episodes.length - 1, Math.round(centerEpisodePosition))
      );
    }

    let showDelta = 0;
    let episodeDelta = 0;
    let stateChanged = false;

    if (this.dragState.direction === 'horizontal') {
      showDelta = targetShowIndex - this.currentShowIndex;
      if (targetShowIndex !== this.currentShowIndex) {
        this.currentShowIndex = targetShowIndex;
        stateChanged = true;
      }
    } else if (this.dragState.direction === 'vertical') {
      episodeDelta = targetEpisodeIndex - currentEpisodeIndex;
      if (targetEpisodeIndex !== currentEpisodeIndex) {
        this.shows[this.currentShowIndex].currentEpisodeId =
          this.shows[this.currentShowIndex].episodes[targetEpisodeIndex].id;
        stateChanged = true;
      }
    }

    if (stateChanged && this.onStateChange) {
      const show = this.shows[this.currentShowIndex];
      const episode = show.episodes.find((ep) => ep.id === show.currentEpisodeId);
      if (episode) {
        this.onStateChange({
          currentShow: show,
          currentEpisode: episode,
        });
      }
    }

    this.snapState.active = true;
    this.snapState.startOffsetX = this.dragState.offsetX + showDelta;
    this.snapState.startOffsetY = this.dragState.offsetY + episodeDelta;
    this.snapState.startTime = performance.now();

    this.dragState.active = false;
    this.dragState.offsetX = 0;
    this.dragState.offsetY = 0;
    this.dragState.direction = null;
  }

  render() {
    const currentShow = this.shows[this.currentShowIndex];
    const currentEpisodeIndex = currentShow ? this._getCurrentEpisodeIndex(currentShow) : -1;

    // Use the play/pause button scale calculated in _render()
    const playPauseScale = this.isPlaying ? 1.0 : this.playPauseButtonScale;

    // Calculate circular progress - make it bigger to use the pushed space
    const progressRadius = this.ICON_SIZE * 1.5;
    const progressCircumference = 2 * Math.PI * progressRadius;
    const progressValue = this.circularProgressDragging
      ? this.circularProgressDragAngle / (2 * Math.PI)
      : this.playbackProgress;
    const progressOffset = progressCircumference * (1 - progressValue);

    // Calculate playhead position
    const playheadAngle = progressValue * 2 * Math.PI - Math.PI / 2; // Start at top
    const playheadX = progressRadius + Math.cos(playheadAngle) * progressRadius;
    const playheadY = progressRadius + Math.sin(playheadAngle) * progressRadius;

    const progressSize = progressRadius * 2 + 24; // Extra padding for stroke and playhead
    const progressOpacity = this.playAnimationProgress;

    return html`
      ${this.shows.flatMap((show, showIndex) =>
      show.episodes.map(
        (episode, episodeIndex) => {
          const isCenterEpisode = showIndex === this.currentShowIndex && episodeIndex === currentEpisodeIndex;

          return html`
              <div
                class="episode-item"
                style="width: ${this.ICON_SIZE}px; height: ${this.ICON_SIZE}px; left: 50%; top: 50%; opacity: 0;"
                data-episode-id="${episode.id}"
              >
                <div class="icon-main">
                  ${show.icon.startsWith('http')
              ? html`<img src="${show.icon}" alt="${show.title}" />`
              : html`<span style="font-size: ${this.ICON_SIZE * 0.75}px;"
                        >${show.icon}</span
                      >`}
                </div>
                <div class="episode-badge">${episodeIndex + 1}</div>
                
                ${isCenterEpisode ? html`
                  <div 
                    class="play-pause-overlay"
                    style="transform: scale(${playPauseScale}); opacity: ${playPauseScale > 0 ? 1 : 0}; pointer-events: ${playPauseScale > 0 ? 'auto' : 'none'};"
                    @click=${this._handlePlayPauseClick}
                  >
                    ${this.isPlaying
                ? html`<svg viewBox="0 0 24 24">
                          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                        </svg>`
                : html`<svg viewBox="0 0 24 24">
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
      
      ${currentShow && currentEpisodeIndex >= 0 ? html`
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
            class="track"
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
          />
          <circle
            class="playhead-hitbox"
            cx="${playheadX + 12}"
            cy="${playheadY + 12}"
            r="24"
            @mousedown=${this._handleCircularProgressMouseDown}
            @touchstart=${this._handleCircularProgressTouchStart}
          />
          <circle
            class="playhead"
            cx="${playheadX + 12}"
            cy="${playheadY + 12}"
            r="10"
          />
        </svg>
      ` : ''}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'xmb-browser': XmbBrowser;
  }
}
