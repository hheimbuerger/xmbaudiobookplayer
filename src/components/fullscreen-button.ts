import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

/**
 * Fullscreen button component that toggles browser fullscreen mode
 * Automatically hides if the browser doesn't support the Fullscreen API
 */
@customElement('fullscreen-button')
export class FullscreenButton extends LitElement {
  @state() private isFullscreen = false;
  @state() private fullscreenSupported = false;

  static styles = css`
    :host {
      display: block;
      position: fixed;
      top: 0;
      right: 0;
      z-index: 1000;
    }

    .fullscreen-button {
      position: absolute;
      top: 0;
      right: 0;
      width: 50px;
      height: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
      pointer-events: auto;
    }

    .fullscreen-button:hover {
      background: rgba(0, 0, 0, 0.5);
      transform: scale(1.05);
    }

    .fullscreen-button svg {
      width: 25px;
      height: 25px;
      fill: rgba(255, 255, 255, 0.6);
    }

    :host([hidden]) {
      display: none;
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('fullscreenchange', this._handleFullscreenChange);

    // Check if fullscreen API is supported
    this.fullscreenSupported = !!(
      document.fullscreenEnabled ||
      (document as any).webkitFullscreenEnabled ||
      (document as any).mozFullScreenEnabled ||
      (document as any).msFullscreenEnabled
    );

    // Hide the component if not supported
    if (!this.fullscreenSupported) {
      this.setAttribute('hidden', '');
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('fullscreenchange', this._handleFullscreenChange);
  }

  private _handleFullscreenChange = (): void => {
    // Update state based on actual fullscreen status
    this.isFullscreen = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );
  };

  private _toggleFullscreen = async (e: Event): Promise<void> => {
    e.stopPropagation();
    e.preventDefault();

    try {
      if (!this.isFullscreen) {
        // Enter fullscreen
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
        } else if ((elem as any).webkitRequestFullscreen) {
          await (elem as any).webkitRequestFullscreen();
        } else if ((elem as any).mozRequestFullScreen) {
          await (elem as any).mozRequestFullScreen();
        } else if ((elem as any).msRequestFullscreen) {
          await (elem as any).msRequestFullscreen();
        }
      } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
      }
    } catch (err) {
      // Silently ignore errors (e.g., user denied fullscreen request)
      console.debug('Fullscreen request failed:', err);
    }
  };

  render() {
    if (!this.fullscreenSupported) {
      return html``;
    }

    return html`
      <div
        class="fullscreen-button"
        @click=${this._toggleFullscreen}
        @touchend=${this._toggleFullscreen}
        title="${this.isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}"
      >
        ${this.isFullscreen
          ? html`
              <svg viewBox="0 0 24 24">
                <path
                  d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"
                />
              </svg>
            `
          : html`
              <svg viewBox="0 0 24 24">
                <path
                  d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
                />
              </svg>
            `}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'fullscreen-button': FullscreenButton;
  }
}
