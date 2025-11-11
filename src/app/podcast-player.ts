import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import '../xmb/xmb-browser.js';
import '../components/audio-player.js';
import { MediaRepository } from '../catalog/media-repository.js';
import { PlaybackOrchestrator, type PlaybackState } from '../xmb/playback-orchestrator.js';
import { Show } from '../catalog/media-repository.js';
import type { PlayerConfig } from '../../config.js';

/**
 * Complete podcast player application component
 * Combines XMB browser, audio player, and session management
 * 
 * @property {MediaRepository} repository - Media repository instance for data access
 */
@customElement('podcast-player')
export class PodcastPlayer extends LitElement {
  @property({ attribute: false }) repository!: MediaRepository;
  @property({ type: Object }) config: PlayerConfig = {};

  @state() private shows: Show[] = [];
  @state() private playbackState: PlaybackState | null = null;
  @state() private isCatalogLoading = false;

  private orchestrator: PlaybackOrchestrator | null = null;
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
      this.isCatalogLoading = true;
      this.loadingPromise = this._loadShows();
    }
  }

  private async _loadShows(): Promise<void> {
    try {
      console.log('[PodcastPlayer] Loading shows...');
      const shows = await this.repository.getCatalog();
      this.shows = shows;
      this.isCatalogLoading = false;
      console.log('[PodcastPlayer] Shows loaded:', this.shows.length);
    } catch (error) {
      console.error('[PodcastPlayer] Failed to load shows:', error);
      this.isCatalogLoading = false;
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
    if (this.orchestrator) {
      this.orchestrator.destroy();
    }
  }

  private async _setupBrowser(): Promise<void> {
    const browser = this.shadowRoot?.querySelector('xmb-browser');
    const player = this.shadowRoot?.querySelector('audio-player');

    if (!browser || !player) {
      console.error('[PodcastPlayer] Failed to find child components');
      return;
    }

    // Initialize orchestrator
    this.orchestrator = new PlaybackOrchestrator(this.repository, player);

    // Listen to state changes
    this.orchestrator.addEventListener('state-change', ((e: CustomEvent<PlaybackState>) => {
      this.playbackState = e.detail;
    }) as EventListener);

    // Listen to episode-changed for persistence
    this.orchestrator.addEventListener('episode-changed', (() => {
      this._saveState();
    }) as EventListener);

    // Listen to episode-ended for auto-advance
    this.orchestrator.addEventListener('episode-ended', (() => {
      this._handleAutoAdvance(browser);
    }) as EventListener);

    // Load saved state and restore episode IDs
    const savedState = this._loadSavedState();

    // Navigate to saved show/episode if available
    if (savedState?.currentShowId && savedState?.currentEpisodeId) {
      const navigated = browser.navigateToEpisode(savedState.currentShowId, savedState.currentEpisodeId);
      if (navigated) {
        console.log('[PodcastPlayer] Restored to show:', savedState.currentShowId, 'episode:', savedState.currentEpisodeId);
      }
    }

    // Load initial episode
    const current = browser.getCurrentSelection();
    if (current) {
      await this._loadEpisode(current.show.id, current.episode.id, current.show.title, current.episode.title);
    }

    // Setup event listeners
    this._setupEventListeners(browser);
  }

  private _setupEventListeners(browser: any): void {
    // Browser events
    browser.addEventListener('episode-change', async (e: CustomEvent) => {
      await this._loadEpisode(
        e.detail.show.id,
        e.detail.episode.id,
        e.detail.show.title,
        e.detail.episode.title
      );
    });

    browser.addEventListener('play-request', () => {
      this.orchestrator?.requestPlay();
    });

    browser.addEventListener('pause-request', () => {
      this.orchestrator?.requestPause();
    });

    browser.addEventListener('seek', (e: CustomEvent) => {
      this.orchestrator?.seekToProgress(e.detail.progress);
    });
  }

  private async _handleAutoAdvance(browser: any): Promise<void> {
    const nextSelection = browser.navigateToNextEpisode();
    if (nextSelection) {
      await this._loadEpisode(
        nextSelection.show.id,
        nextSelection.episode.id,
        nextSelection.show.title,
        nextSelection.episode.title,
        'play' // Set play intent for auto-advance
      );
    }
  }

  private async _loadEpisode(
    showId: string,
    episodeId: string,
    showTitle: string,
    episodeTitle: string,
    preserveIntent: boolean | 'play' = false
  ): Promise<void> {
    if (!this.orchestrator) return;
    await this.orchestrator.loadEpisode(showId, episodeId, showTitle, episodeTitle, preserveIntent);
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
    if (this.isCatalogLoading || this.shows.length === 0) {
      return html`<div class="app-container">Loading...</div>`;
    }

    const state = this.playbackState;

    return html`
      <div class="app-container">
        <xmb-browser 
          .shows=${this.shows}
          .inlinePlaybackControls=${true}
          .isPlaying=${state?.isPlaying ?? false}
          .isLoading=${state?.isLoading ?? false}
          .playbackProgress=${state?.progress ?? 0}
          .config=${this.config}
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
