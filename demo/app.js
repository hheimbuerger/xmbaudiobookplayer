import '../components/xmb-browser.js';
import '../components/audio-player.js';
import { AudiobookshelfRepository } from './audiobookshelf.js';
import { PlaybackSessionManager } from './playback-session-manager.js';
import { ABS_CONFIG } from '../secrets.js';

// Create the media repository instance
const mediaRepository = new AudiobookshelfRepository(ABS_CONFIG);

// Session manager will be initialized in init()
let sessionManager = null;

// Persistence utilities
function loadState(browser) {
  try {
    const saved = localStorage.getItem('xmb-state');
    if (saved) {
      const state = JSON.parse(saved);

      // Restore current episode IDs from saved state
      if (state.episodeStates) {
        state.episodeStates.forEach(({ showId, episodeId }) => {
          const show = browser.shows.find((s) => s.id === showId);
          if (show) {
            show.currentEpisodeId = episodeId;
          }
        });
      }

      // Navigate to the last selected episode
      if (state.currentShowId && state.currentEpisodeId) {
        browser.navigateToEpisode(state.currentShowId, state.currentEpisodeId);
      }
    }
  } catch (e) {
    console.error('Failed to load state:', e);
  }
}

function saveState() {
  try {
    const browser = document.querySelector('xmb-browser');
    const current = browser.getCurrentSelection();

    if (current) {
      const state = {
        currentShowId: current.show.id,
        currentEpisodeId: current.episode.id,
        episodeStates: browser.shows.map((show) => ({
          showId: show.id,
          episodeId: show.currentEpisodeId,
        })),
      };
      localStorage.setItem('xmb-state', JSON.stringify(state));
    }
  } catch (e) {
    console.error('Failed to save state:', e);
  }
}

// Load an episode through the session manager
async function loadEpisode(show, episode, options = {}) {
  if (!sessionManager) return;
  await sessionManager.loadEpisode(show.id, episode.id, show.title, episode.title, options);
}

// Initialize the application
async function init() {
  const shows = await mediaRepository.getCatalog();
  const browser = document.querySelector('xmb-browser');
  const player = document.querySelector('audio-player');

  // Initialize session manager
  sessionManager = new PlaybackSessionManager(mediaRepository, player);

  // Setup browser
  browser.shows = shows;
  browser.inlinePlaybackControls = true;

  // Load saved state (navigation position and episode selections)
  loadState(browser);

  // Sync browser display state with player
  const syncBrowserState = () => {
    const state = sessionManager.getPlaybackState();
    browser.isPlaying = state.isPlaying;
    browser.playbackProgress = state.progress;
  };

  // Load initial episode
  const current = browser.getCurrentSelection();
  if (current) {
    await loadEpisode(current.show, current.episode);
    syncBrowserState();
  }

  // Listen to XMB browser events
  browser.addEventListener('episode-change', async (e) => {
    // Preserve playback state when switching episodes (but not during auto-advance)
    if (!isAutoAdvancing) {
      const wasPlaying = player.getIsPlaying();
      if (wasPlaying) {
        sessionManager.setUserIntent('play');
      }
    }
    
    saveState();
    await loadEpisode(e.detail.show, e.detail.episode);
    syncBrowserState();
  });

  browser.addEventListener('play-request', () => {
    // Set user intent - will be fulfilled when ready
    sessionManager.setUserIntent('play');
  });

  browser.addEventListener('pause-request', () => {
    sessionManager.setUserIntent('pause');
  });

  browser.addEventListener('seek', (e) => {
    sessionManager.seekToProgress(e.detail.progress);
  });

  // Listen to audio player events to update browser display
  player.addEventListener('ready', syncBrowserState);
  player.addEventListener('play', syncBrowserState);
  player.addEventListener('pause', syncBrowserState);
  player.addEventListener('seek', syncBrowserState);
  player.addEventListener('timeupdate', syncBrowserState);
  
  // Track if we're in auto-advance mode
  let isAutoAdvancing = false;

  // Handle episode end - auto-advance to next episode with smooth transition
  player.addEventListener('ended', async () => {
    syncBrowserState();
    
    // Step 1: Let the progress bar animate away (pause state)
    // The 'ended' event already sets isPlaying to false, so progress bar will fade
    
    // Step 2: Wait for progress bar to fade out
    await new Promise(resolve => setTimeout(resolve, 300)); // Match ANIMATION_DURATION
    
    // Step 3: Navigate to next episode (snap animation)
    isAutoAdvancing = true;
    const nextSelection = browser.navigateToNextEpisode();
    if (!nextSelection) {
      isAutoAdvancing = false;
      return;
    }
    
    saveState();
    
    // Step 4: Wait for snap animation to complete
    await new Promise(resolve => setTimeout(resolve, 200)); // Match SNAP_DURATION
    
    // Step 5: Set play intent (progress bar will animate in when playback starts)
    sessionManager.setUserIntent('play');
    isAutoAdvancing = false;
  });
}

init();
