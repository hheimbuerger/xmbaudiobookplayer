/**
 * Represents a single episode within a show
 */
export interface Episode {
  /** Unique identifier for the episode */
  id: string;
  /** Display title for the episode */
  title: string;
}

/**
 * Represents a show with its episodes
 */
export interface Show {
  /** Unique identifier for the show */
  id: string;
  /** Display title for the show */
  title: string;
  /** Icon URL or emoji character */
  icon: string;
  /** Array of episodes in this show */
  episodes: Episode[];
  /** ID of the currently selected episode */
  currentEpisodeId: string;
}

/**
 * Represents an active playback session
 */
export interface PlaybackSession {
  /** Unique identifier for this playback session */
  sessionId: string;
  /** The URL to the actual audio stream */
  playbackUrl: string;
  /** Where to start playback (in seconds) - resume position */
  startTime: number;
  /** Total duration of the episode (in seconds) */
  duration: number;
}

/**
 * Interface for media repository implementations
 * Provides catalog browsing and playback session management
 */
export interface MediaRepository {
  /**
   * Get the catalog of available shows and episodes
   * @returns Promise resolving to array of shows
   */
  getCatalog(): Promise<Show[]>;

  /**
   * Start a playback session for an episode
   * @param showId - The ID of the show
   * @param episodeId - The ID of the episode to play
   * @returns Promise resolving to playback session info, or null if failed
   */
  startPlayback(showId: string, episodeId: string): Promise<PlaybackSession | null>;

  /**
   * Update progress for an active playback session
   * @param sessionId - The session identifier from startPlayback
   * @param currentTime - Current playback position (in seconds)
   * @param duration - Total duration (in seconds)
   * @param timeListened - Time listened since last update (in seconds)
   */
  updateProgress(
    sessionId: string,
    currentTime: number,
    duration: number,
    timeListened: number
  ): Promise<void>;

  /**
   * End a playback session and persist final state
   * @param sessionId - The session identifier from startPlayback
   */
  endPlayback(sessionId: string): Promise<void>;
}
