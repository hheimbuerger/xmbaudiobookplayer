import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

export interface AudioPlayerEvent {
  type: 'play' | 'pause' | 'seek' | 'ended';
  currentTime: number;
  duration: number;
}

@customElement('audio-player')
export class AudioPlayer extends LitElement {
  @property({ type: String }) contentUrl = '';
  @property({ type: String }) showTitle = '';
  @property({ type: String }) episodeTitle = '';
  @property({ type: Number }) initialPosition = 0;

  @state() private isPlaying = false;
  @state() private currentTime = 0;
  @state() private duration = 0;
  @state() private isDragging = false;

  private audio: HTMLAudioElement | null = null;

  static styles = css`
    :host {
      display: block;
      width: 100%;
      padding: 10px 20px 24px;
      background: #1a1a1a;
      color: #fff;
      font-family: system-ui, -apple-system, sans-serif;
      box-sizing: border-box;
    }

    .scrubber-container {
      width: 100%;
      height: 40px;
      display: flex;
      align-items: center;
      margin-bottom: 16px;
      cursor: pointer;
      position: relative;
    }

    .scrubber-track {
      width: 100%;
      height: 6px;
      background: #333;
      border-radius: 3px;
      position: relative;
      overflow: hidden;
    }

    .scrubber-progress {
      height: 100%;
      background: #2563eb;
      border-radius: 3px;
      transition: width 0.1s linear;
    }

    .scrubber-playhead {
      position: absolute;
      width: 16px;
      height: 16px;
      background: #fff;
      border-radius: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      transition: transform 0.1s ease;
    }

    .scrubber-playhead:hover,
    .scrubber-playhead.dragging {
      transform: translate(-50%, -50%) scale(1.2);
    }

    .controls-container {
      display: flex;
      gap: 16px;
      align-items: center;
    }

    .play-pause-button {
      width: 56px;
      height: 56px;
      min-width: 56px;
      border-radius: 50%;
      background: #2563eb;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      color: #fff;
    }

    .play-pause-button:hover {
      background: #3b82f6;
      transform: scale(1.05);
    }

    .play-pause-button:active {
      transform: scale(0.95);
    }

    .play-pause-button svg {
      width: 24px;
      height: 24px;
      fill: currentColor;
    }

    .info-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 56px;
      min-width: 0;
    }

    .episode-title,
    .show-title {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.4;
    }

    .episode-title {
      font-size: 16px;
      font-weight: 600;
      margin: 0;
    }

    .show-title {
      font-size: 14px;
      color: #b3b3b3;
      margin: 0;
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this.audio = new Audio();
    this.audio.addEventListener('loadedmetadata', this._handleLoadedMetadata);
    this.audio.addEventListener('timeupdate', this._handleTimeUpdate);
    this.audio.addEventListener('ended', this._handleEnded);
    this.audio.addEventListener('play', this._handlePlay);
    this.audio.addEventListener('pause', this._handlePause);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.audio) {
      this.audio.pause();
      this.audio.removeEventListener('loadedmetadata', this._handleLoadedMetadata);
      this.audio.removeEventListener('timeupdate', this._handleTimeUpdate);
      this.audio.removeEventListener('ended', this._handleEnded);
      this.audio.removeEventListener('play', this._handlePlay);
      this.audio.removeEventListener('pause', this._handlePause);
      this.audio = null;
    }
  }

  updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.has('contentUrl') && this.audio) {
      const wasPlaying = this.isPlaying;
      
      this.audio.src = this.contentUrl;
      this.audio.load();

      // Reset playing state when URL changes since load() pauses
      this.isPlaying = false;

      // If we were playing, auto-play the new content when ready
      if (wasPlaying) {
        const playWhenReady = () => {
          this.audio?.play().catch(err => console.error('Auto-play failed:', err));
          this.audio?.removeEventListener('loadedmetadata', playWhenReady);
        };
        this.audio.addEventListener('loadedmetadata', playWhenReady);
      }
    }

    if (changedProperties.has('initialPosition') && this.audio && this.duration > 0) {
      this.audio.currentTime = this.initialPosition;
    }
  }

  private _handleLoadedMetadata = (): void => {
    if (this.audio) {
      this.duration = this.audio.duration;
      if (this.initialPosition > 0) {
        this.audio.currentTime = this.initialPosition;
      }
    }
  };

  private _handleTimeUpdate = (): void => {
    if (this.audio && !this.isDragging) {
      this.currentTime = this.audio.currentTime;
    }
  };

  private _handleEnded = (): void => {
    this.isPlaying = false;
    this._emitEvent('ended');
  };

  private _handlePlay = (): void => {
    this.isPlaying = true;
  };

  private _handlePause = (): void => {
    this.isPlaying = false;
  };

  private _emitEvent(type: AudioPlayerEvent['type']): void {
    const event = new CustomEvent<AudioPlayerEvent>('audio-player-event', {
      detail: {
        type,
        currentTime: this.currentTime,
        duration: this.duration,
      },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  private _togglePlayPause(): void {
    if (!this.audio) return;

    if (this.isPlaying) {
      this.audio.pause();
      this._emitEvent('pause');
    } else {
      this.audio.play();
      this._emitEvent('play');
    }
  }

  private _handleScrubberClick(e: MouseEvent): void {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    this._seekTo(percentage);
  }

  private _handlePlayheadMouseDown(e: MouseEvent): void {
    e.stopPropagation();
    this.isDragging = true;

    const handleMouseMove = (moveEvent: MouseEvent): void => {
      if (!this.isDragging) return;

      const scrubber = this.shadowRoot?.querySelector('.scrubber-container') as HTMLElement;
      if (!scrubber) return;

      const rect = scrubber.getBoundingClientRect();
      const x = Math.max(0, Math.min(moveEvent.clientX - rect.left, rect.width));
      const percentage = x / rect.width;
      this.currentTime = percentage * this.duration;
    };

    const handleMouseUp = (): void => {
      if (this.isDragging) {
        this.isDragging = false;
        const percentage = this.currentTime / this.duration;
        this._seekTo(percentage);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  private _seekTo(percentage: number): void {
    if (!this.audio) return;

    const newTime = percentage * this.duration;
    this.audio.currentTime = newTime;
    this.currentTime = newTime;
    this._emitEvent('seek');
  }

  // Public method to trigger play
  public play(): void {
    if (this.audio && !this.isPlaying) {
      this.audio.play();
    }
  }

  // Public method to check playing state
  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  // Public method to get current time
  public getCurrentTime(): number {
    return this.audio?.currentTime || 0;
  }

  render() {
    const progress = this.duration > 0 ? (this.currentTime / this.duration) * 100 : 0;

    return html`
      <div class="scrubber-container" @click=${this._handleScrubberClick}>
        <div class="scrubber-track">
          <div class="scrubber-progress" style="width: ${progress}%"></div>
        </div>
        <div 
          class="scrubber-playhead ${this.isDragging ? 'dragging' : ''}" 
          style="left: ${progress}%"
          @mousedown=${this._handlePlayheadMouseDown}
        ></div>
      </div>

      <div class="controls-container">
        <button 
          class="play-pause-button" 
          @click=${this._togglePlayPause}
          aria-label="${this.isPlaying ? 'Pause' : 'Play'}"
        >
          ${this.isPlaying
        ? html`<svg viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
              </svg>`
        : html`<svg viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>`
      }
        </button>

        <div class="info-container">
          <div class="episode-title" title="${this.episodeTitle}">
            ${this.episodeTitle}
          </div>
          <div class="show-title" title="${this.showTitle}">
            ${this.showTitle}
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'audio-player': AudioPlayer;
  }
}
