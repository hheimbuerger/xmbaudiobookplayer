import '../components/xmb-browser.js';
import '../components/audio-player.js';
import { fetchPodcasts, resolvePlayUrl } from './audiobookshelf.js';
import { ABS_CONFIG } from '../secrets.js';

// Persistence utilities
function loadState(shows) {
  try {
    const saved = localStorage.getItem('xmb-state');
    if (saved) {
      const state = JSON.parse(saved);
      const currentShowIndex = state.currentShowIndex || 1;

      // Restore current episode IDs from saved state
      if (state.currentEpisodeIds) {
        state.currentEpisodeIds.forEach((episodeId, showIndex) => {
          if (shows[showIndex]) {
            shows[showIndex].currentEpisodeId = episodeId;
          }
        });
      }

      return currentShowIndex;
    }
  } catch (e) {
    console.error('Failed to load state:', e);
  }
  return 1; // Default
}

function saveState() {
  try {
    const browser = document.querySelector('xmb-browser');
    const state = {
      currentShowIndex: browser.currentShowIndex,
      currentEpisodeIds: browser.shows.map((show) => show.currentEpisodeId),
    };
    localStorage.setItem('xmb-state', JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save state:', e);
  }
}

// Cache for resolved play URLs to avoid calling /play endpoint multiple times
const resolvedUrlCache = new Map();

// Update audio player with current episode
async function updateAudioPlayer(show, episode) {
  const player = document.querySelector('audio-player');
  if (player) {
    // Only resolve and update if the episode has changed
    const currentUrl = player.contentUrl;
    let contentUrl = episode.contentUrl;
    
    if (contentUrl.startsWith('abs-play://')) {
      // Check cache first
      if (resolvedUrlCache.has(contentUrl)) {
        contentUrl = resolvedUrlCache.get(contentUrl);
      } else {
        // Extract itemId and episodeId from the URL
        const match = contentUrl.match(/^abs-play:\/\/([^/]+)\/(.+)$/);
        if (match) {
          const [, itemId, episodeId] = match;
          const resolvedUrl = await resolvePlayUrl(ABS_CONFIG, itemId, episodeId);
          resolvedUrlCache.set(contentUrl, resolvedUrl);
          contentUrl = resolvedUrl;
        }
      }
    }
    
    // Only update if the URL actually changed (i.e., different episode)
    if (currentUrl !== contentUrl) {
      player.contentUrl = contentUrl;
      player.showTitle = show.title;
      player.episodeTitle = episode.title;
      player.initialPosition = 0;
      // The audio player component handles auto-play internally
    }
  }
}

// Initialize the component
async function init() {
  const shows = await fetchPodcasts(ABS_CONFIG);
  const browser = document.querySelector('xmb-browser');
  const player = document.querySelector('audio-player');
  
  browser.shows = shows;
  browser.currentShowIndex = loadState(shows);
  
  // Set initial audio player content
  const currentShow = shows[browser.currentShowIndex];
  const currentEpisode = currentShow.episodes.find(ep => ep.id === currentShow.currentEpisodeId);
  if (currentEpisode) {
    await updateAudioPlayer(currentShow, currentEpisode);
  }
  
  browser.onStateChange = async (event) => {
    console.log('State changed:', event.currentShow.title, '-', event.currentEpisode.title);
    saveState();
    await updateAudioPlayer(event.currentShow, event.currentEpisode);
  };
  
  // Listen to audio player events
  player.addEventListener('audio-player-event', (e) => {
    console.log('Audio player event:', e.detail.type, 'at', e.detail.currentTime);
  });
}

init();
