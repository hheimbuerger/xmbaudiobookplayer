import '../components/xmb-browser.js';
import '../components/audio-player.js';
import { AudiobookshelfRepository } from './audiobookshelf.js';
import { ABS_CONFIG } from '../secrets.js';

// Create the media repository instance
const mediaRepository = new AudiobookshelfRepository(ABS_CONFIG);

// Track current session for syncing
let currentSession = null;
let currentShowId = null;
let currentEpisodeId = null;
let currentDuration = 0;
let syncInterval = null;
let lastSyncTime = 0;

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

// Sync immediately with the server
async function syncNow(player) {
  if (!currentSession) {
    return;
  }

  const currentTime = player.getCurrentTime();
  const timeListened = Math.max(0, currentTime - lastSyncTime);

  await mediaRepository.updateProgress(
    currentSession.sessionId,
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
  if (currentSession && player) {
    await syncNow(player);
    await mediaRepository.endPlayback(currentSession.sessionId);
  }

  // Now clear the session info
  currentSession = null;
  currentShowId = null;
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

  // Sync before switching episodes
  await stopSyncing(player);

  // Start playback session
  const session = await mediaRepository.startPlayback(show.id, episode.id);
  if (session) {
    currentSession = session;
    currentShowId = show.id;
    currentEpisodeId = episode.id;
    currentDuration = session.duration;
    lastSyncTime = session.startTime;

    // Start syncing for this new session
    await startSyncing(player);

    // Update the player with the new episode
    player.contentUrl = session.playbackUrl;
    player.showTitle = show.title;
    player.episodeTitle = episode.title;
    player.initialPosition = session.startTime;

    console.log(`[App] Loaded ${episode.id} at ${session.startTime.toFixed(1)}s`);
  }
}

// Initialize the component
async function init() {
  const shows = await mediaRepository.getCatalog();
  const browser = document.querySelector('xmb-browser');
  const player = document.querySelector('audio-player');

  browser.shows = shows;

  // Enable inline playback controls (set to false to disable)
  browser.inlinePlaybackControls = true;

  // Load saved state (navigation position and episode selections)
  loadState(browser);

  // Set initial audio player content
  const current = browser.getCurrentSelection();
  if (current) {
    await updateAudioPlayer(current.show, current.episode);
  }

  // Listen to XMB browser events
  browser.addEventListener('episode-change', async (e) => {
    saveState();
    await updateAudioPlayer(e.detail.show, e.detail.episode);
  });

  browser.addEventListener('play-request', () => {
    player.play();
  });

  browser.addEventListener('pause-request', () => {
    player.pause();
  });

  browser.addEventListener('seek', (e) => {
    if (currentDuration > 0) {
      const newTime = e.detail.progress * currentDuration;
      console.log(
        `[App] Seeking to ${newTime.toFixed(1)}s (${(e.detail.progress * 100).toFixed(1)}%)`
      );
      player.seekTo(newTime);
    }
  });

  // Sync XMB browser state with audio player
  const syncBrowserState = () => {
    browser.isPlaying = player.getIsPlaying();
    if (currentDuration > 0) {
      browser.playbackProgress = player.getCurrentTime() / currentDuration;
    }
  };

  // Listen to audio player events
  player.addEventListener('play', () => {
    syncBrowserState();
  });

  player.addEventListener('pause', async () => {
    syncBrowserState();
    await syncNow(player);
  });

  player.addEventListener('seek', async () => {
    syncBrowserState();
    await syncNow(player);
  });

  player.addEventListener('ended', () => {
    syncBrowserState();
  });

  player.addEventListener('timeupdate', () => {
    syncBrowserState();
  });
}

init();
