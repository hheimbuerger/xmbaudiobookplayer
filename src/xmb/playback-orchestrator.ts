import { MediaRepository, PlaybackSession } from '../catalog/media-repository.js';
import type { XmbBrowser } from './xmb-browser.js';

/**
 * User's desired playback state
 */
type UserIntent = 'play' | 'pause' | null;

/**
 * System's current capability
 */
type SystemState = 'ready' | 'loading' | 'error';

/**
 * Complete playback state for UI
 */
export interface PlaybackState {
  // Core state
  intent: UserIntent;
  system: SystemState;
  
  // Derived UI state
  isPlaying: boolean;      // Actually playing audio
  isLoading: boolean;      // Loading with intent to play
  isPaused: boolean;       // Paused and ready
  showPlayButton: boolean; // Show play icon
  showPauseButton: boolean; // Show pause icon
  buttonClickable: boolean; // Button is interactive
  navigationLocked: boolean; // Can't swipe to change episodes
  
  // Progress
  progress: number; // 0-1
  duration: number; // seconds
}

/**
 * Episode changed event detail (for persistence)
 */
export interface EpisodeChangedEventDetail {
  showId: string;
  episodeId: string;
}

/**
 * Playback Orchestrator
 * 
 * Coordinates playback between UI components, audio player, and repository.
 * 
 * Responsibilities:
 * - Manages playback state machine (play/pause/loading)
 * - Coordinates episode loading from repository
 * - Handles auto-advance between episodes
 * - Syncs progress to repository
 * - Emits events for state changes and episode changes
 * 
 * Does NOT:
 * - Load catalog (receives shows from app)
 * - Persist state (emits events for app to handle)
 * - Own UI components (coordinates between them)
 * 
 * Key principles:
 * - User intent is ALWAYS preserved across async operations
 * - System state tracks what the system can do right now
 * - UI state is derived from intent + system state
 * - No race conditions because state is centralized
 */
export class PlaybackOrchestrator extends EventTarget {
  private mediaRepository: MediaRepository;
  private xmbBrowser: XmbBrowser;
  
  // Audio element - owned by orchestrator
  private audio: HTMLAudioElement;
  
  // Core state
  private userIntent: UserIntent = null;
  private systemState: SystemState = 'ready';
  
  // Session tracking
  private currentSession: PlaybackSession | null = null;
  private currentShowId: string | null = null;
  private currentEpisodeId: string | null = null;
  private currentDuration = 0;
  private currentTime = 0;
  private lastSyncedPosition = 0;
  private lastSyncTime = 0;
  private syncThreshold = 10;
  
  // Auto-advance tracking
  private autoAdvanceTimeout: number | null = null;

  constructor(mediaRepository: MediaRepository, xmbBrowser: XmbBrowser) {
    super();
    this.mediaRepository = mediaRepository;
    this.xmbBrowser = xmbBrowser;
    
    // Create and setup audio element
    this.audio = new Audio();
    this._setupAudioListeners();
    this._setupBrowserListeners();
  }

  /**
   * Get current episode info (for persistence)
   */
  getCurrentEpisode(): { showId: string; episodeId: string } | null {
    if (this.currentShowId && this.currentEpisodeId) {
      return {
        showId: this.currentShowId,
        episodeId: this.currentEpisodeId,
      };
    }
    return null;
  }

  /**
   * Get complete current state
   */
  getState(): PlaybackState {
    const intent = this.userIntent;
    const system = this.systemState;
    
    // Derive UI state from core state
    const isPlaying = intent === 'play' && system === 'ready';
    const isLoading = intent === 'play' && system === 'loading';
    const isPaused = intent !== 'play' && system === 'ready';
    
    // Calculate progress from audio element
    const progress = this.currentDuration > 0
      ? this.currentTime / this.currentDuration
      : 0;
    
    return {
      intent,
      system,
      isPlaying,
      isLoading,
      isPaused,
      showPlayButton: intent !== 'play',
      showPauseButton: intent === 'play',
      buttonClickable: true, // Always clickable
      navigationLocked: intent === 'play' || system === 'loading',
      progress,
      duration: this.currentDuration,
    };
  }

  /**
   * User requests to play
   */
  requestPlay(): void {
    console.log('[Orchestrator] User requested play');
    this._cancelAutoAdvance(); // Cancel any pending auto-advance
    this.userIntent = 'play';
    this._reconcile();
  }

  /**
   * User requests to pause
   */
  requestPause(): void {
    console.log('[Orchestrator] User requested pause');
    this._cancelAutoAdvance(); // Cancel any pending auto-advance
    this.userIntent = 'pause';
    this._reconcile();
  }

  /**
   * Load a new episode
   * @param preserveIntent - If true, preserves current intent. If 'play', sets intent to play (for auto-advance)
   */
  async loadEpisode(
    showId: string,
    episodeId: string,
    showTitle: string,
    episodeTitle: string,
    preserveIntent: boolean | 'play' = false
  ): Promise<boolean> {
    console.log(`[Orchestrator] Loading ${showTitle} - ${episodeTitle}`);
    
    // Cancel any pending auto-advance when manually loading an episode
    if (preserveIntent !== 'play') {
      this._cancelAutoAdvance();
    }
    
    // Handle intent based on preserveIntent parameter
    let savedIntent: UserIntent = null;
    if (preserveIntent === 'play') {
      // Auto-advance: explicitly set play intent
      savedIntent = 'play';
    } else if (preserveIntent === true) {
      // Preserve existing intent
      savedIntent = this.userIntent;
    }
    // else: preserveIntent === false, clear intent (manual episode change)
    
    // Enter loading state
    this.systemState = 'loading';
    this.userIntent = savedIntent; // Set intent (may be null, 'play', or 'pause')
    this._emitStateChange();

    // Stop current session
    await this._stopSession();

    try {
      // Start new session
      const session = await this.mediaRepository.startPlayback(showId, episodeId);
      if (!session) {
        console.error('[Orchestrator] Failed to start playback session');
        this.systemState = 'error';
        this._emitStateChange();
        return false;
      }

      this.currentSession = session;
      this.currentShowId = showId;
      this.currentEpisodeId = episodeId;
      this.currentDuration = session.duration;
      this.lastSyncedPosition = session.startTime;
      this.lastSyncTime = session.startTime;

      // Load audio in orchestrator (deferred to avoid update cycle issues)
      await Promise.resolve();
      this.audio.src = session.playbackUrl;
      this.audio.currentTime = session.startTime;
      this.audio.load();

      // Emit episode-changed event for persistence
      this.dispatchEvent(new CustomEvent<EpisodeChangedEventDetail>('episode-changed', {
        detail: { showId, episodeId }
      }));

      // Intent was already set at the start of loadEpisode
      // System state will be set to 'ready' by audio 'canplay' event
      return true;
    } catch (error) {
      console.error('[Orchestrator] Error loading episode:', error);
      this.systemState = 'error';
      this._emitStateChange();
      return false;
    }
  }

  /**
   * Seek to a specific progress (0-1)
   */
  seekToProgress(progress: number): void {
    if (this.currentDuration > 0) {
      const newTime = progress * this.currentDuration;
      this.audio.currentTime = newTime;
      this._syncNow(); // Sync immediately after seek
    }
  }

  /**
   * Reconcile user intent with system capability
   * This is where the magic happens - no race conditions!
   */
  private _reconcile(): void {
    const state = this.getState();
    
    console.log('[Orchestrator] Reconciling:', {
      intent: state.intent,
      system: state.system,
      result: state.isPlaying ? 'playing' : state.isLoading ? 'loading' : 'paused'
    });

    // Only act if system is ready
    if (state.system === 'ready') {
      if (state.intent === 'play') {
        this.audio.play();
      } else if (state.intent === 'pause') {
        this.audio.pause();
      }
    }
    
    // If system is loading, intent will be fulfilled when canplay event fires
    
    this._updateXmbState();
  }

  /**
   * Setup audio element event listeners
   */
  private _setupAudioListeners(): void {
    // Audio is ready to play
    this.audio.addEventListener('canplay', () => {
      if (this.systemState === 'loading') {
        console.log('[Orchestrator] Audio ready, transitioning to ready state');
        this.systemState = 'ready';
        this.currentDuration = this.audio.duration;
        this._updateXmbState();
        this._reconcile(); // Fulfill any pending play intent
      }
    });

    // Audio started playing
    this.audio.addEventListener('play', () => {
      console.log('[Orchestrator] Audio play event');
      this._updateXmbState();
    });

    // Audio paused
    this.audio.addEventListener('pause', async () => {
      console.log('[Orchestrator] Audio pause event');
      if (this.systemState === 'ready') {
        await this._syncNow();
      }
      this._updateXmbState();
    });

    // Playback position updated
    this.audio.addEventListener('timeupdate', async () => {
      this.currentTime = this.audio.currentTime;
      
      // Periodic sync during playback
      if (this.currentSession && this.systemState === 'ready') {
        const timeSinceLastSync = Math.abs(this.currentTime - this.lastSyncedPosition);
        if (timeSinceLastSync >= this.syncThreshold) {
          await this._syncNow();
        }
      }
      
      this._updateXmbState();
    });

    // Episode ended
    this.audio.addEventListener('ended', () => {
      console.log('[Orchestrator] Episode ended');
      
      // Clear play intent (episode is done)
      this.userIntent = null;
      this._updateXmbState();
      
      // Delay auto-advance to allow pause animation to complete
      this.autoAdvanceTimeout = window.setTimeout(() => {
        this.autoAdvanceTimeout = null;
        
        // Auto-advance to next episode
        this._handleAutoAdvance();
      }, 300);
    });

    // Audio loading started
    this.audio.addEventListener('loadstart', () => {
      console.log('[Orchestrator] Audio loading started');
    });

    // Audio error
    this.audio.addEventListener('error', () => {
      console.error('[Orchestrator] Audio error:', this.audio.error);
      this.systemState = 'error';
      this._updateXmbState();
    });
  }

  /**
   * Setup XMB browser event listeners (user interactions)
   */
  private _setupBrowserListeners(): void {
    // User clicked play button
    this.xmbBrowser.addEventListener('play-request', () => {
      this.requestPlay();
    });

    // User clicked pause button
    this.xmbBrowser.addEventListener('pause-request', () => {
      this.requestPause();
    });

    // User dragged seek scrubber
    this.xmbBrowser.addEventListener('seek', (e: Event) => {
      const customEvent = e as CustomEvent;
      this.seekToProgress(customEvent.detail.progress);
    });

    // User navigated to a different episode
    this.xmbBrowser.addEventListener('episode-change', (e: Event) => {
      const customEvent = e as CustomEvent;
      const { show, episode } = customEvent.detail;
      this.loadEpisode(show.id, episode.id, show.title, episode.title);
    });
  }

  /**
   * Cancel pending auto-advance
   */
  private _cancelAutoAdvance(): void {
    if (this.autoAdvanceTimeout !== null) {
      console.log('[Orchestrator] Cancelling auto-advance (user action)');
      clearTimeout(this.autoAdvanceTimeout);
      this.autoAdvanceTimeout = null;
    }
  }

  /**
   * Handle auto-advance to next episode
   */
  private _handleAutoAdvance(): void {
    const nextSelection = this.xmbBrowser.navigateToNextEpisode();
    if (nextSelection) {
      console.log('[Orchestrator] Auto-advancing to next episode');
      // Load next episode with play intent
      this.loadEpisode(
        nextSelection.show.id,
        nextSelection.episode.id,
        nextSelection.show.title,
        nextSelection.episode.title,
        'play' // Auto-advance should continue playing
      );
    } else {
      console.log('[Orchestrator] No next episode available for auto-advance');
    }
  }

  /**
   * Update XMB browser visual state
   */
  private _updateXmbState(): void {
    const state = this.getState();
    
    // Push state to XMB browser
    this.xmbBrowser.isPlaying = state.isPlaying;
    this.xmbBrowser.isLoading = state.isLoading;
    this.xmbBrowser.playbackProgress = state.progress;
    
    // Emit state change event for external listeners
    this.dispatchEvent(new CustomEvent('state-change', { detail: state }));
  }

  /**
   * Emit state change event (deprecated - use _updateXmbState)
   */
  private _emitStateChange(): void {
    this._updateXmbState();
  }

  /**
   * Stop current session and sync progress
   */
  private async _stopSession(): Promise<void> {
    if (this.currentSession) {
      await this._syncNow();
      await this.mediaRepository.endPlayback(this.currentSession.sessionId);
    }

    this.currentSession = null;
    this.currentShowId = null;
    this.currentEpisodeId = null;
    this.currentDuration = 0;
    this.lastSyncedPosition = 0;
    this.lastSyncTime = 0;
  }

  /**
   * Sync current progress to media repository
   */
  private async _syncNow(): Promise<void> {
    if (!this.currentSession || this.systemState !== 'ready') {
      return;
    }

    const currentTime = this.currentTime;

    if (Math.abs(currentTime - this.lastSyncedPosition) < 1.0) {
      return;
    }

    const timeListened = Math.max(0, currentTime - this.lastSyncTime);

    this.lastSyncedPosition = currentTime;
    this.lastSyncTime = currentTime;

    await this.mediaRepository.updateProgress(
      this.currentSession.sessionId,
      currentTime,
      this.currentDuration,
      timeListened
    );
  }

  /**
   * Cleanup
   */
  async destroy(): Promise<void> {
    await this._stopSession();
    
    // Clean up audio element
    this.audio.pause();
    this.audio.src = '';
  }
}
