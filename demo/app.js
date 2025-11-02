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
  if (!currentSession) {
    return;
  }

  const currentTime = player.getCurrentTime();
  const duration = player.getDuration();
  const timeListened = Math.max(0, currentTime - lastSyncTime);

  await mediaRepository.updateProgress(
    currentSession.sessionId,
    currentTime,
    duration,
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
  browser.currentShowIndex = loadState(shows);

  // Enable inline playback controls (set to false to disable)
  browser.inlinePlaybackControls = true;

  // Set initial audio player content
  const currentShow = shows[browser.currentShowIndex];
  const currentEpisode = currentShow.episodes.find(
    (ep) => ep.id === currentShow.currentEpisodeId
  );
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
      console.log(
        `[App] Seeking to ${newTime.toFixed(1)}s (${(progress * 100).toFixed(1)}%)`
      );
      player.seekTo(newTime);
      // Force play after seek if we were playing
      if (player.getIsPlaying()) {
        setTimeout(() => {
          if (!player.getIsPlaying()) {
            player.play();
          }
        }, 100);
      }
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
