import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import '../xmb/xmb-browser.js';
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

    if (!browser) {
      console.error('[PodcastPlayer] Failed to find XMB browser component');
      return;
    }

    // Initialize orchestrator (owns audio element and coordinates all playback)
    this.orchestrator = new PlaybackOrchestrator(this.repository, browser);

    // Listen to state changes for UI updates
    this.orchestrator.addEventListener('state-change', ((e: CustomEvent<PlaybackState>) => {
      this.playbackState = e.detail;
    }) as EventListener);

    // Listen to episode-changed for state persistence
    this.orchestrator.addEventListener('episode-changed', (() => {
      this._saveState();
    }) as EventListener);

    // Load saved state and restore position
    const savedState = this._loadSavedState();

    // Navigate to saved show/episode if available
    if (savedState?.currentShowId && savedState?.currentEpisodeId) {
      const navigated = browser.navigateToEpisode(savedState.currentShowId, savedState.currentEpisodeId);
      if (navigated) {
        console.log('[PodcastPlayer] Restored to show:', savedState.currentShowId, 'episode:', savedState.currentEpisodeId);
      }
    }

    // Load initial episode (orchestrator will handle this)
    const current = browser.getCurrentSelection();
    if (current) {
      await this.orchestrator.loadEpisode(
        current.show.id,
        current.episode.id,
        current.show.title,
        current.episode.title
      );
    }
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
          .isPlaying=${state?.isPlaying ?? false}
          .isLoading=${state?.isLoading ?? false}
          .playbackProgress=${state?.progress ?? 0}
          .config=${this.config}
        ></xmb-browser>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'podcast-player': PodcastPlayer;
  }
}
