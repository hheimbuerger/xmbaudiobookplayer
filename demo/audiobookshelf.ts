import { Show, Episode } from '../types/data.js';

export interface AudiobookshelfConfig {
  url: string;
  apiKey: string;
  libraryId: string;
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
 * Fetches podcasts from AudioBookshelf API and converts them to Show format
 */
export async function fetchPodcasts(config: AudiobookshelfConfig): Promise<Show[]> {
  try {
    const listResponse = await fetch(
      `${config.url}/api/libraries/${config.libraryId}/items`,
      {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      }
    );
    const listData: ABSListResponse = await listResponse.json();

    const shows = await Promise.all(
      listData.results.map(async (item) => {
        const detailResponse = await fetch(`${config.url}/api/items/${item.id}`, {
          headers: { Authorization: `Bearer ${config.apiKey}` },
        });
        const detail: ABSItemDetail = await detailResponse.json();

        const coverUrl = `${config.url}/api/items/${item.id}/cover`;
        const episodes = (detail.media.episodes || []).map((ep): Episode => {
          // Store the item ID in the contentUrl temporarily - we'll resolve it on playback
          const contentUrl = `abs-play://${item.id}/${ep.id}`;

          return {
            id: ep.id,
            title: ep.title,
            contentUrl,
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
    console.error('Failed to fetch podcasts:', error);
    return [];
  }
}

export interface PlaybackSession {
  sessionId: string;
  playUrl: string;
  startTime: number;
  duration: number;
}

/**
 * Resolves a play URL by calling the /play endpoint and returning session info
 * This should be called only when actually playing an episode
 */
export async function resolvePlayUrl(
  config: AudiobookshelfConfig,
  itemId: string,
  episodeId: string
): Promise<PlaybackSession | null> {
  try {
    const playResponse = await fetch(
      `${config.url}/api/items/${itemId}/play/${episodeId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
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

    // Get saved progress and duration from the play response
    let startTime = 0;
    if (playData.currentTime !== undefined && playData.currentTime > 0) {
      startTime = playData.currentTime;
    }

    const duration = playData.duration || 0;

    console.log(`[ABS] ${episodeId}: resume at ${startTime.toFixed(1)}s / ${duration.toFixed(1)}s`);

    // Track index is typically 0 for podcasts (single episode per play session)
    return {
      sessionId,
      playUrl: `${config.url}/public/session/${sessionId}/track/0`,
      startTime,
      duration,
    };
  } catch (error) {
    console.error('[ABS] Play failed:', error);
    return null;
  }
}

/**
 * Updates the persistent media progress using session sync
 * The session sync endpoint updates both the session and persistent progress
 */
export async function updateMediaProgress(
  config: AudiobookshelfConfig,
  sessionId: string,
  episodeId: string,
  currentTime: number,
  duration: number,
  timeListened: number = 0
): Promise<void> {
  try {
    // Don't sync if duration is invalid or zero
    if (!duration || duration <= 0 || isNaN(duration)) {
      return;
    }

    // Don't sync if currentTime is invalid
    if (isNaN(currentTime) || currentTime < 0) {
      return;
    }

    console.log(`[SYNC] ${episodeId}: ${currentTime.toFixed(1)}s`);

    const response = await fetch(`${config.url}/api/session/${sessionId}/sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        currentTime,
        duration,
        timeListened,
      }),
    });

    if (!response.ok) {
      console.error(`[SYNC] Failed: ${response.status}`);
    }
  } catch (error) {
    console.error('[SYNC] Error:', error);
  }
}

/**
 * Closes a playback session, which persists the progress
 */
export async function closeSession(
  config: AudiobookshelfConfig,
  sessionId: string,
  episodeId: string
): Promise<void> {
  try {
    console.log(`[ABS] Close session: ${episodeId}`);
    const response = await fetch(`${config.url}/api/session/${sessionId}/close`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`[ABS] Close failed: ${response.status}`);
    }
  } catch (error) {
    console.error('[ABS] Close error:', error);
  }
}
