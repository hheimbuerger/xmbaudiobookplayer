import { Show, MediaRepository, PlaybackSession } from '../media-repository.js';

export interface ArchiveOrgConfig {
  /** List of Internet Archive item identifiers (e.g., "alices_adventures_1003") */
  itemIds: string[];
}

interface ArchiveOrgMetadata {
  metadata: {
    identifier: string;
    title: string;
  };
  files: Array<{
    name: string;
    format?: string;
    source?: string;
    rotation?: string;
    size?: string;
  }>;
  [itemId: string]: any; // The curated playlist array
}

interface AudioTrack {
  title: string;
  name: string;
  format: string;
  length?: string;
  bitrate?: string;
}

/**
 * Internal representation of an Archive.org episode with playback metadata
 */
interface ArchiveOrgEpisode {
  id: string;
  title: string;
  playbackUrl: string;
  duration: number; // in seconds
}

/**
 * Internal representation of an Archive.org show with all metadata
 */
interface ArchiveOrgShow {
  id: string;
  title: string;
  icon: string;
  episodes: ArchiveOrgEpisode[];
}

/**
 * Archive.org implementation of MediaRepository
 */
export class ArchiveOrgRepository implements MediaRepository {
  private shows = new Map<string, ArchiveOrgShow>();

  constructor(private config: ArchiveOrgConfig) {}

  async getCatalog(): Promise<Show[]> {
    const shows: Show[] = [];

    for (const itemId of this.config.itemIds) {
      try {
        const internalShow = await this.fetchShow(itemId);
        if (internalShow) {
          // Store the internal show for later playback
          this.shows.set(itemId, internalShow);

          // Pretty print the complete show structure
          console.log(`[Archive.org] Loaded show: ${itemId} with ${internalShow.episodes.length} episodes`);
          // Verbose logging - uncomment for debugging:
          // console.log(JSON.stringify(internalShow, null, 2));

          // Convert to MediaRepository Show format
          const show: Show = {
            id: internalShow.id,
            title: internalShow.title,
            icon: internalShow.icon,
            episodes: internalShow.episodes.map((ep) => ({
              id: ep.id,
              title: ep.title,
            })),
            currentEpisodeId: internalShow.episodes[0]?.id || '',
          };
          shows.push(show);
        }
      } catch (error) {
        console.error(`[Archive.org] Failed to fetch item ${itemId}:`, error);
      }
    }

    return shows;
  }

  private async fetchShow(itemId: string): Promise<ArchiveOrgShow | null> {
    // Fetch metadata from archive.org
    const metadataUrl = `https://archive.org/metadata/${itemId}`;
    const response = await fetch(metadataUrl);
    
    if (!response.ok) {
      console.error(`[Archive.org] Failed to fetch metadata for ${itemId}: ${response.status}`);
      return null;
    }

    const data: ArchiveOrgMetadata = await response.json();

    // Get show title
    const title = data.metadata?.title || itemId;

    // Find album art
    const icon = this.findAlbumArt(data.files, itemId);

    // Get curated playlist
    const playlist = data[itemId];
    if (!Array.isArray(playlist)) {
      console.error(`[Archive.org] No playlist found for ${itemId}`);
      return null;
    }

    // Extract episodes from playlist
    const episodes = this.extractEpisodes(playlist, itemId);

    if (episodes.length === 0) {
      console.error(`[Archive.org] No episodes found for ${itemId}`);
      return null;
    }

    const show: ArchiveOrgShow = {
      id: itemId,
      title,
      icon,
      episodes,
    };

    return show;
  }

  private findAlbumArt(files: ArchiveOrgMetadata['files'], itemId: string): string {
    // Look for JPEG or PNG with source=original and rotation=0
    const coverImage = files.find(
      (f) =>
        (f.format?.includes('JPEG') || f.format?.includes('PNG')) &&
        f.source === 'original' &&
        (f.rotation === '0' || f.rotation === undefined)
    );

    if (coverImage) {
      return `https://archive.org/download/${itemId}/${coverImage.name}`;
    }

    // Fallback to __ia_thumb.jpg
    const thumb = files.find((f) => f.name === '__ia_thumb.jpg');
    if (thumb) {
      return `https://archive.org/download/${itemId}/__ia_thumb.jpg`;
    }

    // Fallback to services API
    return `https://archive.org/services/img/${itemId}`;
  }

  private extractEpisodes(playlist: AudioTrack[], itemId: string): ArchiveOrgEpisode[] {
    // Group tracks by title to find different formats
    const tracksByTitle = new Map<string, AudioTrack[]>();
    
    for (const track of playlist) {
      if (!track.title || !track.name) continue;
      
      const existing = tracksByTitle.get(track.title) || [];
      existing.push(track);
      tracksByTitle.set(track.title, existing);
    }

    const episodes: ArchiveOrgEpisode[] = [];

    // For each unique title, pick the best format
    for (const [title, tracks] of tracksByTitle) {
      const bestTrack = this.selectBestFormat(tracks);
      if (!bestTrack) continue;

      const episodeId = `${itemId}:${bestTrack.name}`;
      const playbackUrl = `https://archive.org/download/${itemId}/${bestTrack.name}`;
      
      // Parse duration from length field (format: "MM:SS" or seconds)
      const duration = this.parseDuration(bestTrack.length);

      episodes.push({
        id: episodeId,
        title,
        playbackUrl,
        duration,
      });
    }

    // Sort episodes by extracting the first number from the title
    episodes.sort((a, b) => {
      const numA = this.extractFirstNumber(a.title);
      const numB = this.extractFirstNumber(b.title);
      
      // If both have numbers, sort by number
      if (numA !== null && numB !== null) {
        return numA - numB;
      }
      
      // Otherwise, fall back to alphabetical sort
      return a.title.localeCompare(b.title, undefined, { numeric: true });
    });

    return episodes;
  }

  private extractFirstNumber(title: string): number | null {
    // Extract the first number from the title
    // Handles: "Chapter 6", "Chapters 1-3", "01 Title", etc.
    const match = title.match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
  }

  private parseDuration(length: string | undefined): number {
    if (!length) return 0;

    // Check if it's a time format (contains colon)
    if (length.includes(':')) {
      // Parse MM:SS or HH:MM:SS format
      const parts = length.split(':').map((p) => parseInt(p, 10));
      if (parts.length === 2) {
        // MM:SS
        return parts[0] * 60 + parts[1];
      } else if (parts.length === 3) {
        // HH:MM:SS
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
    }

    // Otherwise, try to parse as a number (seconds)
    const asNumber = parseFloat(length);
    if (!isNaN(asNumber)) {
      return Math.floor(asNumber);
    }

    return 0;
  }

  private selectBestFormat(tracks: AudioTrack[]): AudioTrack | null {
    if (tracks.length === 0) return null;

    // Filter to only tracks that have a length field (needed for duration)
    const tracksWithLength = tracks.filter((t) => t.length);
    if (tracksWithLength.length === 0) {
      console.warn('[Archive.org] No tracks with length field found');
      return null;
    }

    // Prefer Ogg Vorbis (if it has length)
    const oggTrack = tracksWithLength.find((t) => t.format?.toLowerCase().includes('ogg vorbis'));
    if (oggTrack) return oggTrack;

    // Otherwise, find highest quality MP3
    const mp3Tracks = tracksWithLength.filter((t) => t.format?.toLowerCase().includes('mp3'));
    if (mp3Tracks.length === 0) return tracksWithLength[0]; // Fallback to first track with length

    // Sort by bitrate (descending)
    mp3Tracks.sort((a, b) => {
      const bitrateA = parseInt(a.bitrate || '0', 10);
      const bitrateB = parseInt(b.bitrate || '0', 10);
      return bitrateB - bitrateA;
    });

    return mp3Tracks[0];
  }

  async startPlayback(showId: string, episodeId: string): Promise<PlaybackSession | null> {
    const show = this.shows.get(showId);
    if (!show) {
      console.error(`[Archive.org] Show not found: ${showId}`);
      return null;
    }

    const episode = show.episodes.find((ep) => ep.id === episodeId);
    if (!episode) {
      console.error(`[Archive.org] Episode not found: ${episodeId}`);
      return null;
    }

    // Load saved progress from localStorage
    const savedProgress = this.loadProgress(episodeId);
    const startTime = savedProgress?.currentTime || 0;

    console.log(`[Archive.org] Begin playback: ${episodeId} at ${startTime.toFixed(1)}s`);

    // Use episodeId as the session ID (no server-side session tracking needed)
    const sessionId = episodeId;

    return {
      sessionId,
      playbackUrl: episode.playbackUrl,
      startTime,
      duration: episode.duration,
    };
  }

  async updateProgress(
    sessionId: string,
    currentTime: number,
    duration: number,
    _timeListened: number
  ): Promise<void> {
    // sessionId is the episodeId
    const episodeId = sessionId;
    
    // Save progress to localStorage
    this.saveProgress(episodeId, currentTime, duration);
    
    console.log(`[Archive.org] Progress saved: ${currentTime.toFixed(1)}s / ${duration.toFixed(1)}s`);
  }

  async endPlayback(sessionId: string): Promise<void> {
    // sessionId is the episodeId
    const episodeId = sessionId;
    
    console.log(`[Archive.org] End playback session: ${episodeId}`);
  }

  private saveProgress(episodeId: string, currentTime: number, duration: number): void {
    try {
      const key = `archiveorg:progress:${episodeId}`;
      const data = {
        currentTime,
        duration,
        lastUpdated: Date.now(),
      };
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.warn('[Archive.org] Failed to save progress to localStorage:', error);
    }
  }

  private loadProgress(episodeId: string): { currentTime: number; duration: number } | null {
    try {
      const key = `archiveorg:progress:${episodeId}`;
      const data = localStorage.getItem(key);
      if (!data) return null;
      
      const parsed = JSON.parse(data);
      return {
        currentTime: parsed.currentTime || 0,
        duration: parsed.duration || 0,
      };
    } catch (error) {
      console.warn('[Archive.org] Failed to load progress from localStorage:', error);
      return null;
    }
  }
}
