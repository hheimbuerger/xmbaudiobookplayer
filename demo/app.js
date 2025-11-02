import '../components/xmb-browser.js';
import '../components/audio-player.js';
import { fetchPodcasts, resolvePlayUrl, updateMediaProgress, closeSession } from './audiobookshelf.js';
import { ABS_CONFIG } from '../secrets.js';

// Track current session for syncing
let currentSession = null;
let currentItemId = null;
let currentEpisodeId = null;
let currentDuration = 0;
let syncInterval = null;
let lastSyncTime = 0;

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

// Sync immediately with the server
async function syncNow(player) {
  if (!currentSession || !currentEpisodeId || !currentDuration) {
    return;
  }
  
  const currentTime = player.getCurrentTime();
  const timeListened = Math.max(0, currentTime - lastSyncTime);
  
  await updateMediaProgress(
    ABS_CONFIG,
    currentSession.sessionId,
    currentEpisodeId,
    currentTime,
    currentDuration,
    timeListened
  );
  
  lastSyncTime = currentTime;
}

// Stop syncing the current session
async function stopSyncing(player) {
  // Stop the interval first
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  
  // Sync and close the session to persist progress
  if (currentSession && player && currentEpisodeId) {
    await syncNow(player);
    await closeSession(ABS_CONFIG, currentSession.sessionId, currentEpisodeId);
  }
  
  // Now clear the session info
  currentSession = null;
  currentItemId = null;
  currentEpisodeId = null;
  currentDuration = 0;
  lastSyncTime = 0;
}

// Start syncing every 10 seconds
async function startSyncing(player) {
  // Just clear the interval, don't sync (we're about to load a new episode)
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  
  syncInterval = setInterval(async () => {
    if (currentSession && player.getIsPlaying()) {
      await syncNow(player);
    }
  }, 10000); // Every 10 seconds
}

// Update audio player with current episode
async function updateAudioPlayer(show, episode) {
  const player = document.querySelector('audio-player');
  if (!player) return;
  
  let contentUrl = episode.contentUrl;
  let startTime = 0;
  
  // Always process abs-play:// URLs to get session and progress
  if (contentUrl.startsWith('abs-play://')) {
    // Extract itemId and episodeId from the URL
    const match = contentUrl.match(/^abs-play:\/\/([^/]+)\/(.+)$/);
    if (match) {
      const [, itemId, episodeId] = match;
      
      // Sync before switching episodes
      await stopSyncing(player);
      
      // Resolve the play URL and get session info
      const session = await resolvePlayUrl(ABS_CONFIG, itemId, episodeId);
      if (session) {
        currentSession = session;
        currentItemId = itemId;
        currentEpisodeId = episodeId;
        currentDuration = session.duration;
        contentUrl = session.playUrl;
        startTime = session.startTime;
        lastSyncTime = startTime;
        
        // Start syncing for this new session
        await startSyncing(player);
        
        // Always update the player with the new episode
        player.contentUrl = contentUrl;
        player.showTitle = show.title;
        player.episodeTitle = episode.title;
        player.initialPosition = startTime;
        
        console.log(`[App] Loaded ${episodeId} at ${startTime.toFixed(1)}s`);
      }
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
    saveState();
    await updateAudioPlayer(event.currentShow, event.currentEpisode);
  };
  
  // Wire up play/pause toggle from XMB browser
  browser.onPlayPauseToggle = () => {
    const button = player.shadowRoot.querySelector('.play-pause-button');
    if (button) {
      button.click();
    }
  };
  
  // Wire up seek from XMB browser circular progress
  browser.onSeek = (progress) => {
    const duration = player.getDuration();
    if (duration > 0) {
      const newTime = progress * duration;
      player.seekTo(newTime);
    }
  };
  
  // Sync XMB browser state with audio player
  const syncBrowserState = () => {
    browser.isPlaying = player.getIsPlaying();
    const duration = player.getDuration();
    if (duration > 0) {
      browser.playbackProgress = player.getCurrentTime() / duration;
    }
  };
  
  // Update browser state periodically
  setInterval(syncBrowserState, 100);
  
  // Listen to audio player events and sync on pause/seek
  player.addEventListener('audio-player-event', async (e) => {
    syncBrowserState();
    if (e.detail.type === 'pause' || e.detail.type === 'seek') {
      await syncNow(player);
    }
  });
}

init();
