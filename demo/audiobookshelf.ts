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

/**
 * Resolves a play URL by calling the /play endpoint and returning the public session URL
 * This should be called only when actually playing an episode
 */
export async function resolvePlayUrl(
  config: AudiobookshelfConfig,
  itemId: string,
  episodeId: string
): Promise<string> {
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

    // Use the public session endpoint - no auth required since session is the authorization
    const sessionId = playData.id;
    if (!sessionId) return '';

    // Track index is typically 0 for podcasts (single episode per play session)
    return `${config.url}/public/session/${sessionId}/track/0`;
  } catch (error) {
    console.error('Failed to resolve play URL:', error);
    return '';
  }
}
