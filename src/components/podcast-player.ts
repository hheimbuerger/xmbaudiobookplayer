import { LitElement, html, css } from 'lit';
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
  @state() private isPlaying = false;
  @state() private playbackProgress = 0;
  @state() private isLoading = false;

  private sessionManager: PlaybackSessionManager | null = null;
  private setupComplete = false;
  private loadingPromise: Promise<void> | null = null;

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

  willUpdate(changedProperties: Map<string, any>): void {
    // Start loading shows when repository is first set (but don't await)
    if (changedProperties.has('repository') && this.repository && !this.loadingPromise) {
      this.isLoading = true;
      this.loadingPromise = this._loadShows();
    }
  }

  private async _loadShows(): Promise<void> {
    try {
      console.log('[PodcastPlayer] Loading shows...');
      const shows = await this.repository.getCatalog();
      this.shows = shows;
      this.isLoading = false;
      console.log('[PodcastPlayer] Shows loaded:', this.shows.length);
    } catch (error) {
      console.error('[PodcastPlayer] Failed to load shows:', error);
      this.isLoading = false;
    }
  }

  async updated(changedProperties: Map<string, any>): Promise<void> {
    // Setup browser once after shows are loaded and rendered
    if (changedProperties.has('shows') && this.shows.length > 0 && !this.setupComplete) {
      this.setupComplete = true;
      // Wait one more frame to ensure child components are rendered
      await this.updateComplete;
      await this._setupBrowser();
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.sessionManager) {
      this.sessionManager.destroy();
    }
  }

  private async _setupBrowser(): Promise<void> {
    const browser = this.shadowRoot?.querySelector('xmb-browser');
    const player = this.shadowRoot?.querySelector('audio-player');

    if (!browser || !player) {
      console.error('[PodcastPlayer] Failed to find child components');
      return;
    }

    // Initialize session manager
    this.sessionManager = new PlaybackSessionManager(this.repository, player);

    // Load saved state and restore episode IDs
    this._loadSavedState();

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
      this.sessionManager?.play();
    });

    browser.addEventListener('pause-request', () => {
      this.sessionManager?.pause();
    });

    browser.addEventListener('seek', (e: CustomEvent) => {
      this.sessionManager?.seekToProgress(e.detail.progress);
    });

    // Player events - update parent state instead of directly setting child properties
    const syncBrowserState = () => {
      const state = this.sessionManager?.getPlaybackState();
      if (state) {
        this.isPlaying = state.isPlaying;
        this.playbackProgress = state.progress;
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
          nextSelection.episode.title,
          true // Preserve play intent for auto-advance
        );
        this.sessionManager?.play();
      }
    });
  }

  private async _loadEpisode(
    showId: string,
    episodeId: string,
    showTitle: string,
    episodeTitle: string,
    preservePlayIntent = false
  ): Promise<void> {
    if (!this.sessionManager) return;
    await this.sessionManager.loadEpisode(showId, episodeId, showTitle, episodeTitle, preservePlayIntent);
  }

  private _loadSavedState(): { currentShowId?: string; currentEpisodeId?: string } | null {
    try {
      const saved = localStorage.getItem('xmb-state');
      if (!saved) return null;

      const state = JSON.parse(saved);

      // Restore current episode IDs by mutating shows (necessary for state restoration)
      if (state.episodeStates) {
        state.episodeStates.forEach(({ showId, episodeId }: any) => {
          const show = this.shows.find((s) => s.id === showId);
          if (show) {
            show.currentEpisodeId = episodeId;
          }
        });
      }

      return state;
    } catch (e) {
      console.error('[PodcastPlayer] Failed to load state:', e);
      return null;
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
    // Don't render children until shows are loaded
    if (this.isLoading || this.shows.length === 0) {
      return html`<div class="app-container">Loading...</div>`;
    }

    return html`
      <div class="app-container">
        <xmb-browser 
          .shows=${this.shows}
          .inlinePlaybackControls=${true}
          .isPlaying=${this.isPlaying}
          .playbackProgress=${this.playbackProgress}
        ></xmb-browser>
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
