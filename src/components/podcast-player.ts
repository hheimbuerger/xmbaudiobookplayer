import { LitElement, html, css, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import './xmb-browser.js';
import './audio-player.js';
import { MediaRepository } from '../types/media-repository.js';
import { PlaybackSessionManager } from '../services/playback-session-manager.js';
import { Show } from '../types/shows.js';

/**
 * Complete podcast player application component
 * Combines XMB browser, audio player, and session management
 * 
 * @property {MediaRepository} repository - Media repository instance for data access
 */
@customElement('podcast-player')
export class PodcastPlayer extends LitElement {
  @property({ attribute: false }) repository!: MediaRepository;

  @state() private shows: Show[] = [];
  @state() private initialized = false;

  private sessionManager: PlaybackSessionManager | null = null;

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }

    .app-container {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    xmb-browser {
      width: 100%;
      flex: 1;
      min-height: 0;
    }

    audio-player {
      width: 100%;
      flex-shrink: 0;
    }
  `;

  async updated(changedProperties: PropertyValues): Promise<void> {
    super.updated(changedProperties);
    
    // Initialize when repository is set for the first time
    if (changedProperties.has('repository') && this.repository && !this.initialized) {
      this.initialized = true;
      await this._init();
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.sessionManager) {
      this.sessionManager.destroy();
    }
  }

  private async _init(): Promise<void> {
    if (!this.repository) {
      console.error('[PodcastPlayer] No repository provided');
      return;
    }

    // Load catalog
    this.shows = await this.repository.getCatalog();

    // Wait for components to render
    await this.updateComplete;

    const browser = this.shadowRoot?.querySelector('xmb-browser');
    const player = this.shadowRoot?.querySelector('audio-player');

    if (!browser || !player) {
      console.error('[PodcastPlayer] Failed to find child components');
      return;
    }

    // Initialize session manager
    this.sessionManager = new PlaybackSessionManager(this.repository, player);

    // Setup browser
    browser.shows = this.shows;
    browser.inlinePlaybackControls = true;

    // Load saved state
    this._loadState(browser);

    // Load initial episode
    const current = browser.getCurrentSelection();
    if (current) {
      await this._loadEpisode(current.show.id, current.episode.id, current.show.title, current.episode.title);
    }

    // Setup event listeners
    this._setupEventListeners(browser, player);
  }

  private _setupEventListeners(browser: any, player: any): void {
    // Browser events
    browser.addEventListener('episode-change', async (e: CustomEvent) => {
      this._saveState();
      await this._loadEpisode(
        e.detail.show.id,
        e.detail.episode.id,
        e.detail.show.title,
        e.detail.episode.title
      );
    });

    browser.addEventListener('play-request', () => {
      player.play();
    });

    browser.addEventListener('pause-request', () => {
      player.pause();
    });

    browser.addEventListener('seek', (e: CustomEvent) => {
      this.sessionManager?.seekToProgress(e.detail.progress);
    });

    // Player events
    const syncBrowserState = () => {
      const state = this.sessionManager?.getPlaybackState();
      if (state) {
        browser.isPlaying = state.isPlaying;
        browser.playbackProgress = state.progress;
      }
    };

    player.addEventListener('play', syncBrowserState);
    player.addEventListener('pause', syncBrowserState);
    player.addEventListener('seek', syncBrowserState);
    player.addEventListener('timeupdate', syncBrowserState);

    // Handle episode end - auto-advance
    player.addEventListener('ended', async () => {
      syncBrowserState();

      const nextSelection = browser.navigateToNextEpisode();
      if (nextSelection) {
        this._saveState();
        await this._loadEpisode(
          nextSelection.show.id,
          nextSelection.episode.id,
          nextSelection.show.title,
          nextSelection.episode.title
        );
        player.play();
      }
    });
  }

  private async _loadEpisode(
    showId: string,
    episodeId: string,
    showTitle: string,
    episodeTitle: string
  ): Promise<void> {
    if (!this.sessionManager) return;
    await this.sessionManager.loadEpisode(showId, episodeId, showTitle, episodeTitle);
  }

  private _loadState(browser: any): void {
    try {
      const saved = localStorage.getItem('xmb-state');
      if (saved) {
        const state = JSON.parse(saved);

        // Restore current episode IDs
        if (state.episodeStates) {
          state.episodeStates.forEach(({ showId, episodeId }: any) => {
            const show = this.shows.find((s) => s.id === showId);
            if (show) {
              show.currentEpisodeId = episodeId;
            }
          });
        }

        // Navigate to last selected episode
        if (state.currentShowId && state.currentEpisodeId) {
          browser.navigateToEpisode(state.currentShowId, state.currentEpisodeId);
        }
      }
    } catch (e) {
      console.error('[PodcastPlayer] Failed to load state:', e);
    }
  }

  private _saveState(): void {
    try {
      const browser = this.shadowRoot?.querySelector('xmb-browser');
      if (!browser) return;

      const current = browser.getCurrentSelection();
      if (current) {
        const state = {
          currentShowId: current.show.id,
          currentEpisodeId: current.episode.id,
          episodeStates: this.shows.map((show) => ({
            showId: show.id,
            episodeId: show.currentEpisodeId,
          })),
        };
        localStorage.setItem('xmb-state', JSON.stringify(state));
      }
    } catch (e) {
      console.error('[PodcastPlayer] Failed to save state:', e);
    }
  }

  render() {
    return html`
      <div class="app-container">
        <xmb-browser inlinePlaybackControls="true"></xmb-browser>
        <audio-player visible="false"></audio-player>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'podcast-player': PodcastPlayer;
  }
}
