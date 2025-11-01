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

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: relative;
      background: #000;
      overflow: hidden;
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
    }

    .icon-main {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .icon-main img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 8px;
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
  `;

  private readonly SNAP_DURATION = 200;
  private readonly ICON_SIZE = 72;
  private readonly SHOW_SPACING_ICONS = 1.8;
  private readonly EPISODE_SPACING_ICONS = 1.8;
  private readonly DIRECTION_LOCK_THRESHOLD_ICONS = 0.2;
  private readonly FADE_RANGE = 0.5;
  private readonly MAX_SCALE = 1.5;
  private readonly SCALE_DISTANCE_ICONS = 3.3;

  private readonly SHOW_SPACING: number;
  private readonly EPISODE_SPACING: number;
  private readonly DIRECTION_LOCK_THRESHOLD: number;
  private readonly SCALE_DISTANCE: number;

  private dragState: DragState;
  private snapState: SnapState;
  private episodeElements: EpisodeElement[] = [];
  private animationFrameId: number | null = null;

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
      if (this.snapState.active) {
        const elapsed = performance.now() - this.snapState.startTime;
        if (elapsed >= this.SNAP_DURATION) {
          this.snapState.active = false;
        }
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

    this.episodeElements.forEach(({ element, showIndex, episodeIndex }) => {
      const show = this.shows[showIndex];
      if (!show) return;

      const currentEpisodeIndex = this._getCurrentEpisodeIndex(show);
      const showOffsetFromCenter = showIndex - this.currentShowIndex + offsetX;
      const isCurrentShow = showIndex === this.currentShowIndex;
      const episodeOffsetFromCenter =
        episodeIndex - currentEpisodeIndex + (isCurrentShow ? offsetY : 0);

      const showPixelOffsetX = showOffsetFromCenter * this.SHOW_SPACING;
      const episodePixelOffsetY = episodeOffsetFromCenter * this.EPISODE_SPACING;

      const distanceFromScreenCenter = Math.sqrt(
        showPixelOffsetX * showPixelOffsetX + episodePixelOffsetY * episodePixelOffsetY
      );
      const scale = Math.max(
        1,
        this.MAX_SCALE - distanceFromScreenCenter / this.SCALE_DISTANCE
      );

      let opacity = 0;
      const isCenterEpisode = episodeIndex === currentEpisodeIndex;

      if (isCenterEpisode) {
        opacity = 1.0;
      } else {
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

    this.dragState.active = true;
    this.dragState.startX = x;
    this.dragState.startY = y;
    this.dragState.direction = null;
    this.dragState.offsetX = 0;
    this.dragState.offsetY = 0;
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
    return html`
      ${this.shows.flatMap((show) =>
        show.episodes.map(
          (episode, episodeIndex) => html`
            <div
              class="episode-item"
              style="width: ${this.ICON_SIZE}px; height: ${this.ICON_SIZE}px; left: 50%; top: 50%; opacity: 0;"
              data-episode-id="${episode.id}"
            >
              <div class="icon-main">
                ${show.icon.startsWith('http')
                  ? html`<img src="${show.icon}" alt="${show.label}" />`
                  : html`<span style="font-size: ${this.ICON_SIZE * 0.75}px;"
                      >${show.icon}</span
                    >`}
              </div>
              <div class="episode-badge">${episodeIndex + 1}</div>
            </div>
          `
        )
      )}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'xmb-browser': XmbBrowser;
  }
}
