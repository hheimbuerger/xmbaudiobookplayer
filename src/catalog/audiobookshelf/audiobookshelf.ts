import { Show, Episode, MediaRepository, PlaybackSession } from '../media-repository.js';

export interface AudiobookshelfConfig {
  url: string;
  apiKey: string;
  libraryId: string;
  excludeShowIds?: string[];
  excludeEpisodeIds?: string[];
}

interface ABSListResponse {
  results: Array<{
    id: string;
  }>;
}

interface ABSEpisode {
  id: string;
  title: string;
  audioFile?: {
    metadata?: {
      filename?: string;
    };
  };
  // Audiobookshelf can provide episode-specific cover art
  coverPath?: string;
  // Episode number from audiobook feed
  episode?: string;
}

interface ABSItemDetail {
  id: string;
  media: {
    metadata: {
      title: string;
    };
    episodes?: ABSEpisode[];
  };
}

/**
 * Audiobookshelf implementation of MediaRepository
 */
export class AudiobookshelfRepository implements MediaRepository {
  constructor(private config: AudiobookshelfConfig) {}

  async getCatalog(): Promise<Show[]> {
    try {
      const listResponse = await fetch(
        `${this.config.url}/api/libraries/${this.config.libraryId}/items?sort=media.metadata.title`,
        {
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
        }
      );
      const listData: ABSListResponse = await listResponse.json();

      const shows = await Promise.all(
        listData.results
          .filter((item) => !this.config.excludeShowIds?.includes(item.id))
          .map(async (item) => {
          const detailResponse = await fetch(
            `${this.config.url}/api/items/${item.id}`,
            {
              headers: { Authorization: `Bearer ${this.config.apiKey}` },
            }
          );
          const detail: ABSItemDetail = await detailResponse.json();

          const coverUrl = `${this.config.url}/api/items/${item.id}/cover`;
          const episodes = (detail.media.episodes || [])
            .filter((ep) => !this.config.excludeEpisodeIds?.includes(ep.id))
            .map((ep): Episode => {
              // If episode has its own cover, use it; otherwise undefined (will fall back to show cover)
              const episodeIcon = ep.coverPath 
                ? `${this.config.url}${ep.coverPath}` 
                : undefined;
              
              return {
                id: ep.id,
                title: ep.title,
                icon: episodeIcon,
                episodeNumber: ep.episode,
              };
            });

          const show: Show = {
            id: item.id,
            title: detail.media.metadata.title,
            icon: coverUrl,
            currentEpisodeId: episodes.length > 0 ? episodes[0].id : '',
            episodes,
          };

          return show;
        })
      );

      return shows;
    } catch (error) {
      console.error('[ABS] Failed to fetch catalog:', error);
      return [];
    }
  }

  async startPlayback(showId: string, episodeId: string): Promise<PlaybackSession | null> {
    try {
      const playResponse = await fetch(
        `${this.config.url}/api/items/${showId}/play/${episodeId}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            deviceInfo: { clientVersion: '0.0.1' },
            supportedMimeTypes: ['audio/flac', 'audio/mpeg', 'audio/mp4'],
          }),
        }
      );
      const playData = await playResponse.json();

      const sessionId = playData.id;
      if (!sessionId) {
        console.error('[ABS] No session ID returned');
        return null;
      }

      const startTime = playData.currentTime || 0;
      const duration = playData.duration || 0;

      console.log(
        `[ABS] Begin playback session: ${episodeId} at ${startTime.toFixed(1)}s / ${duration.toFixed(1)}s`
      );

      return {
        sessionId,
        playbackUrl: `${this.config.url}/public/session/${sessionId}/track/0`,
        startTime,
        duration,
      };
    } catch (error) {
      console.error('[ABS] Failed to start playback session:', error);
      return null;
    }
  }

  async updateProgress(
    sessionId: string,
    currentTime: number,
    duration: number,
    timeListened: number
  ): Promise<void> {
    try {
      if (!duration || duration <= 0 || isNaN(duration)) {
        return;
      }

      if (isNaN(currentTime) || currentTime < 0) {
        return;
      }

      console.log(`[ABS] Update playback progress: ${currentTime.toFixed(1)}s`);

      const response = await fetch(
        `${this.config.url}/api/session/${sessionId}/sync`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            currentTime,
            duration,
            timeListened,
          }),
        }
      );

      if (!response.ok) {
        console.error(`[ABS] Update progress failed: ${response.status}`);
      }
    } catch (error) {
      console.error('[ABS] Update progress error:', error);
    }
  }

  async endPlayback(sessionId: string): Promise<void> {
    try {
      console.log(`[ABS] End playback session: ${sessionId}`);
      const response = await fetch(
        `${this.config.url}/api/session/${sessionId}/close`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.error(`[ABS] End playback session failed: ${response.status}`);
      }
    } catch (error) {
      console.error('[ABS] End playback session error:', error);
    }
  }
}
