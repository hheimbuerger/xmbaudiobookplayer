import { Show, MediaRepository, PlaybackSession } from '../media-repository.js';
import sampleData from './sample-data.json';

/**
 * Sample implementation of MediaRepository for testing and demo purposes
 * Uses pre-generated data from sample-data.json with emoji icons
 */
export class SampleRepository implements MediaRepository {
  private shows: Show[];
  private activeSessions: Map<string, { showId: string; episodeId: string; startTime: number }>;

  constructor() {
    // Load shows from JSON data
    this.shows = sampleData.shows as Show[];
    this.activeSessions = new Map();
  }

  async getCatalog(): Promise<Show[]> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    // Return a deep copy to prevent external modifications
    return JSON.parse(JSON.stringify(this.shows));
  }

  async startPlayback(showId: string, episodeId: string): Promise<PlaybackSession | null> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    const show = this.shows.find((s) => s.id === showId);
    if (!show) {
      console.error('[Sample] Show not found:', showId);
      return null;
    }

    const episode = show.episodes.find((e) => e.id === episodeId);
    if (!episode) {
      console.error('[Sample] Episode not found:', episodeId);
      return null;
    }

    // Generate a unique session ID
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Store session info
    this.activeSessions.set(sessionId, {
      showId,
      episodeId,
      startTime: 0,
    });

    console.log(`[Sample] Started playback session: ${sessionId} for ${episode.title}`);

    // Return mock playback session
    // Note: No actual playback URL since this is sample data
    return {
      sessionId,
      playbackUrl: '', // Empty URL - no actual audio
      startTime: 0,
      duration: 1800, // Mock 30-minute episodes
    };
  }

  async updateProgress(
    sessionId: string,
    currentTime: number,
    duration: number,
    _timeListened: number
  ): Promise<void> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 10));

    const session = this.activeSessions.get(sessionId);
    if (!session) {
      console.warn('[Sample] Session not found:', sessionId);
      return;
    }

    console.log(
      `[Sample] Progress update for session ${sessionId}: ${currentTime.toFixed(1)}s / ${duration.toFixed(1)}s`
    );

    // In a real implementation, this would persist to storage
  }

  async endPlayback(sessionId: string): Promise<void> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 10));

    const session = this.activeSessions.get(sessionId);
    if (session) {
      console.log(`[Sample] Ended playback session: ${sessionId}`);
      this.activeSessions.delete(sessionId);
    }
  }
}
