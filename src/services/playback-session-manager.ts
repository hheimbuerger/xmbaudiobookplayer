import { MediaRepository, PlaybackSession } from '../types/media-repository.js';
import type { AudioPlayer } from '../components/audio-player.js';

/**
 * Manages playback sessions and progress syncing with the media repository.
 * 
 * RESPONSIBILITIES:
 * - Creates and manages playback sessions with the media repository
 * - Tracks which episode is currently playing and its duration
 * - Automatically syncs playback progress back to the repository
 * - Handles session lifecycle (start, sync, close)
 * - Manages loading state to prevent race conditions
 * 
 * WHAT IT MANAGES:
 * - Session state: Which episode is playing, session ID, duration
 * - Progress syncing: Periodically saves current position to repository
 * - Time tracking: Calculates how much time was actually listened
 * - Loading state: Tracks when content is being loaded
 * 
 * WHAT IT DOESN'T MANAGE:
 * - UI state: The app.js handles wiring up UI components
 * - Audio playback: The audio-player component handles actual playback
 * - Navigation: The xmb-browser component handles episode selection
 * 
 * LOADING STATES:
 * - 'idle': Ready to play or no content loaded
 * - 'loading': Fetching episode data and loading audio
 * 
 * SYNC STRATEGY:
 * - Syncs immediately on: pause, seek, or when switching episodes
 * - Syncs periodically during playback: every 10 seconds of progress
 * - Uses timeupdate events (not timers) to detect progress
 * 
 * SESSION LIFECYCLE:
 * 1. loadEpisode() - Starts a new session with the repository
 * 2. During playback - Automatically syncs progress
 * 3. stopSession() - Syncs final position and closes the session
 * 
 * A "session" is the repository's way of tracking an active playback.
 * When you start playing an episode, the repository creates a session.
 * When you switch episodes or stop, we close that session to persist progress.
 */
export class PlaybackSessionManager {
  private mediaRepository: MediaRepository;
  private audioPlayer: AudioPlayer;
  private currentSession: PlaybackSession | null = null;
  private currentDuration = 0;
  private lastSyncedPosition = 0;
  private lastSyncTime = 0;
  private syncThreshold = 10;
  private loadingState: 'idle' | 'loading' = 'idle';
  private userIntent: 'play' | 'pause' | null = null;

  constructor(mediaRepository: MediaRepository, audioPlayer: AudioPlayer) {
    this.mediaRepository = mediaRepository;
    this.audioPlayer = audioPlayer;
    this._setupPlayerListeners();
  }

  /**
   * Set user's playback intent (play or pause)
   * This will be fulfilled once content is ready
   */
  setUserIntent(intent: 'play' | 'pause' | null): void {
    this.userIntent = intent;

    // If not loading, fulfill immediately
    if (!this.isLoading() && intent === 'play') {
      this.audioPlayer.play();
    } else if (!this.isLoading() && intent === 'pause') {
      this.audioPlayer.pause();
    }
  }

  /**
   * Load and start playing an episode
   */
  async loadEpisode(
    showId: string, 
    episodeId: string, 
    showTitle: string, 
    episodeTitle: string,
    preservePlayIntent = false
  ): Promise<boolean> {
    // Set loading state
    this.loadingState = 'loading';
    
    // Clear user intent unless explicitly preserving it (e.g., auto-advance)
    if (!preservePlayIntent) {
      console.log('[SessionManager] Loading new episode, clearing user intent');
      this.userIntent = null;
    }

    // Stop current session if any
    await this.stopSession();

    // Start new playback session
    const session = await this.mediaRepository.startPlayback(showId, episodeId);
    if (!session) {
      console.error('[SessionManager] Failed to start playback session');
      this.loadingState = 'idle';
      return false;
    }

    this.currentSession = session;
    this.currentDuration = session.duration;
    this.lastSyncedPosition = session.startTime;
    this.lastSyncTime = session.startTime;

    // Update the audio player
    this.audioPlayer.contentUrl = session.playbackUrl;
    this.audioPlayer.showTitle = showTitle;
    this.audioPlayer.episodeTitle = episodeTitle;
    this.audioPlayer.initialPosition = session.startTime;

    // Note: loadingState will be set to 'idle' by the audio player's ready event
    // and user intent will be fulfilled at that time
    return true;
  }

  /**
   * Stop the current session and persist progress.
   * 
   * This is called when:
   * - User switches to a different episode
   * - User closes the app (via cleanup)
   * - We need to end the current playback session
   * 
   * It does NOT automatically trigger on browser/tab close - that would
   * require additional window.onbeforeunload handling in app.js.
   * 
   * What it does:
   * 1. Syncs the current playback position one final time
   * 2. Tells the repository to close the session (persists progress)
   * 3. Clears local session state
   */
  async stopSession(): Promise<void> {
    // Sync and close the session
    if (this.currentSession) {
      await this._syncNow();
      await this.mediaRepository.endPlayback(this.currentSession.sessionId);
    }

    // Clear session info
    this.currentSession = null;
    this.currentDuration = 0;
    this.lastSyncedPosition = 0;
    this.lastSyncTime = 0;

    // Don't reset loading state here - it's managed by loadEpisode
  }

  /**
   * Get the current duration (from repository, not audio element)
   */
  getDuration(): number {
    return this.currentDuration;
  }

  /**
   * Get current playback state for display
   */
  getPlaybackState(): { isPlaying: boolean; progress: number } {
    const isPlaying = this.audioPlayer.getIsPlaying();
    const progress = this.currentDuration > 0
      ? this.audioPlayer.getCurrentTime() / this.currentDuration
      : 0;

    return { isPlaying, progress };
  }

  /**
   * Request playback - respects loading state and user intent
   */
  play(): void {
    if (this.loadingState === 'loading') {
      // Content is still loading, save intent to fulfill when ready
      this.userIntent = 'play';
      console.log('[SessionManager] Play requested during loading, saving intent');
    } else {
      // Ready to play immediately
      this.audioPlayer.play();
    }
  }

  /**
   * Request pause - respects loading state and user intent
   */
  pause(): void {
    if (this.loadingState === 'loading') {
      // Content is still loading, save intent to fulfill when ready
      this.userIntent = 'pause';
      console.log('[SessionManager] Pause requested during loading, saving intent');
    } else {
      // Ready to pause immediately
      this.audioPlayer.pause();
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
   * Check if currently loading content
   */
  isLoading(): boolean {
    return this.loadingState === 'loading';
  }



  /**
   * Get the current loading state
   * @returns {string} - 'idle' | 'loading' | 'ready' | 'transitioning'
   */
  getLoadingState() {
    return this.loadingState;
  }

  /**
   * Setup listeners for audio player events
   * @private
   */
  _setupPlayerListeners() {
    // Track when audio is ready to play
    this.audioPlayer.addEventListener('ready', () => {
      if (this.loadingState === 'loading') {
        this.loadingState = 'idle'; // Back to idle once loaded

        // Fulfill user intent
        if (this.userIntent === 'play') {
          this.audioPlayer.play();
          this.userIntent = null; // Intent fulfilled
        } else if (this.userIntent === 'pause') {
          this.audioPlayer.pause();
          this.userIntent = null; // Intent fulfilled
        }
      }
    });

    // Always sync on pause and seek (but not during loading)
    this.audioPlayer.addEventListener('pause', async () => {
      if (!this.isLoading()) {
        await this._syncNow();
      }
    });

    this.audioPlayer.addEventListener('seek', async () => {
      if (!this.isLoading()) {
        await this._syncNow();
      }
    });

    // Throttled sync on timeupdate - only sync if enough time has passed
    this.audioPlayer.addEventListener('timeupdate', async () => {
      if (!this.currentSession) return;

      const currentTime = this.audioPlayer.getCurrentTime();
      const timeSinceLastSync = Math.abs(currentTime - this.lastSyncedPosition);

      // Sync if we've moved forward by the threshold amount
      if (timeSinceLastSync >= this.syncThreshold) {
        await this._syncNow();
      }
    });
  }

  /**
   * Sync current progress with the repository
   * @private
   */
  async _syncNow() {
    if (!this.currentSession) {
      return;
    }

    // Don't sync while loading - we haven't seeked to initial position yet
    if (this.isLoading()) {
      return;
    }

    const currentTime = this.audioPlayer.getCurrentTime();

    // Don't sync if position hasn't changed significantly (avoid excessive syncs)
    // Use 1 second threshold since timeupdate fires frequently
    if (Math.abs(currentTime - this.lastSyncedPosition) < 1.0) {
      return;
    }

    const timeListened = Math.max(0, currentTime - this.lastSyncTime);

    // Update position immediately to prevent race conditions from multiple timeupdate events
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
   * Cleanup when done
   */
  async destroy(): Promise<void> {
    await this.stopSession();
  }
}
