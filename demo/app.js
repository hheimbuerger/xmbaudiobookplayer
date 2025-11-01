import '../components/xmb-browser.js';
import { fetchPodcasts } from './audiobookshelf.js';
import { ABS_CONFIG } from './config.js';

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

function saveState(event) {
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

// Initialize the component
async function init() {
  const shows = await fetchPodcasts(ABS_CONFIG);
  const browser = document.querySelector('xmb-browser');
  browser.shows = shows;
  browser.currentShowIndex = loadState(shows);
  browser.onStateChange = (event) => {
    console.log('State changed:', event.currentShow.label, '-', event.currentEpisode.label);
    saveState(event);
  };
}

init();
