import { MediaRepository, PlaybackSession } from '../catalog/media-repository.js';
import type { AudioPlayer } from '../components/audio-player.js';

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
  private audioPlayer: AudioPlayer;
  
  // Core state
  private userIntent: UserIntent = null;
  private systemState: SystemState = 'ready';
  
  // Session tracking
  private currentSession: PlaybackSession | null = null;
  private currentShowId: string | null = null;
  private currentEpisodeId: string | null = null;
  private currentDuration = 0;
  private lastSyncedPosition = 0;
  private lastSyncTime = 0;
  private syncThreshold = 10;

  constructor(mediaRepository: MediaRepository, audioPlayer: AudioPlayer) {
    super();
    this.mediaRepository = mediaRepository;
    this.audioPlayer = audioPlayer;
    this._setupPlayerListeners();
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
    
    const progress = this.currentDuration > 0
      ? this.audioPlayer.getCurrentTime() / this.currentDuration
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
    this.userIntent = 'play';
    this._reconcile();
  }

  /**
   * User requests to pause
   */
  requestPause(): void {
    console.log('[Orchestrator] User requested pause');
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
    console.log('[Orchestrator] Loading episode:', episodeTitle);
    
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

      // Update audio player (deferred to avoid update cycle issues)
      await Promise.resolve();
      this.audioPlayer.contentUrl = session.playbackUrl;
      this.audioPlayer.showTitle = showTitle;
      this.audioPlayer.episodeTitle = episodeTitle;
      this.audioPlayer.initialPosition = session.startTime;

      // Emit episode-changed event for persistence
      this.dispatchEvent(new CustomEvent<EpisodeChangedEventDetail>('episode-changed', {
        detail: { showId, episodeId }
      }));

      // Intent was already set at the start of loadEpisode
      // System state will be set to 'ready' by audio player 'ready' event
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
      this.audioPlayer.seekTo(newTime);
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
        this.audioPlayer.play();
      } else if (state.intent === 'pause') {
        this.audioPlayer.pause();
      }
    }
    
    // If system is loading, intent will be fulfilled when ready event fires
    
    this._emitStateChange();
  }

  /**
   * Setup audio player event listeners
   */
  private _setupPlayerListeners(): void {
    // Audio is ready to play
    this.audioPlayer.addEventListener('ready', () => {
      if (this.systemState === 'loading') {
        console.log('[Orchestrator] Audio ready, transitioning to ready state');
        this.systemState = 'ready';
        this._reconcile(); // Fulfill any pending intent
      }
    });

    // Sync on pause and seek
    this.audioPlayer.addEventListener('pause', async () => {
      if (this.systemState === 'ready') {
        await this._syncNow();
      }
    });

    this.audioPlayer.addEventListener('seek', async () => {
      if (this.systemState === 'ready') {
        await this._syncNow();
      }
    });

    // Periodic sync during playback
    this.audioPlayer.addEventListener('timeupdate', async () => {
      if (!this.currentSession || this.systemState !== 'ready') return;

      const currentTime = this.audioPlayer.getCurrentTime();
      const timeSinceLastSync = Math.abs(currentTime - this.lastSyncedPosition);

      if (timeSinceLastSync >= this.syncThreshold) {
        await this._syncNow();
      }
      
      // Emit state change for progress updates
      this._emitStateChange();
    });

    // Track actual play/pause from audio element
    this.audioPlayer.addEventListener('play', () => {
      this._emitStateChange();
    });

    // Handle episode end
    this.audioPlayer.addEventListener('ended', () => {
      console.log('[Orchestrator] Episode ended');
      
      // Clear play intent (episode is done)
      this.userIntent = null;
      this._emitStateChange();
      
      // Emit episode-ended event for auto-advance
      if (this.currentShowId && this.currentEpisodeId) {
        this.dispatchEvent(new CustomEvent<EpisodeChangedEventDetail>('episode-ended', {
          detail: {
            showId: this.currentShowId,
            episodeId: this.currentEpisodeId,
          }
        }));
      }
    });
  }

  /**
   * Emit state change event
   */
  private _emitStateChange(): void {
    const state = this.getState();
    this.dispatchEvent(new CustomEvent('state-change', { detail: state }));
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
   * Sync current progress
   */
  private async _syncNow(): Promise<void> {
    if (!this.currentSession || this.systemState !== 'ready') {
      return;
    }

    const currentTime = this.audioPlayer.getCurrentTime();

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
  }
}
