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
          const audioUrl = ep.audioFile?.metadata?.filename
            ? `${config.url}/api/items/${item.id}/file/${encodeURIComponent(
                ep.audioFile.metadata.filename
              )}`
            : `${config.url}/api/items/${item.id}/play/${ep.id}`;

          return {
            id: ep.id,
            label: ep.title,
            contentUrl: audioUrl,
          };
        });

        const show: Show = {
          id: item.id,
          label: detail.media.metadata.title,
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
