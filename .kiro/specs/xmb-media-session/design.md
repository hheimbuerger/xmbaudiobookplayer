# XMB Media Session API Integration - Design

## Media Session Setup

**Location:** Playback Orchestrator (`src/xmb/playback-orchestrator.ts`)

The orchestrator owns the audio element and manages all playback state, making it the natural place for Media Session API integration.

```typescript
// In PlaybackOrchestrator constructor
constructor(mediaRepository: MediaRepository, xmbBrowser: XmbBrowser) {
  super();
  this.mediaRepository = mediaRepository;
  this.xmbBrowser = xmbBrowser;
  
  // Create and setup audio element
  this.audio = new Audio();
  this._setupAudioListeners();
  this._setupBrowserListeners();
  this._setupMediaSession(); // NEW: Setup Media Session API
}

private _setupMediaSession() {
  if (!('mediaSession' in navigator)) {
    console.warn('Media Session API not supported');
    return;
  }

  navigator.mediaSession.setActionHandler('play', () => this._handleMediaPlay());
  navigator.mediaSession.setActionHandler('pause', () => this._handleMediaPause());
  navigator.mediaSession.setActionHandler('stop', () => this._handleMediaStop());
  navigator.mediaSession.setActionHandler('seekbackward', () => this._handleMediaSeekBackward());
  navigator.mediaSession.setActionHandler('seekforward', () => this._handleMediaSeekForward());
  navigator.mediaSession.setActionHandler('seekto', (details) => this._handleMediaSeekTo(details));
  navigator.mediaSession.setActionHandler('previoustrack', () => this._handleMediaPrevious());
  navigator.mediaSession.setActionHandler('nexttrack', () => this._handleMediaNext());
}

async destroy(): Promise<void> {
  await this._stopSession();
  
  // Clean up audio element
  this.audio.pause();
  this.audio.src = '';
  
  // Clean up media session handlers
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', null);
    navigator.mediaSession.setActionHandler('pause', null);
    navigator.mediaSession.setActionHandler('stop', null);
    navigator.mediaSession.setActionHandler('seekbackward', null);
    navigator.mediaSession.setActionHandler('seekforward', null);
    navigator.mediaSession.setActionHandler('seekto', null);
    navigator.mediaSession.setActionHandler('previoustrack', null);
    navigator.mediaSession.setActionHandler('nexttrack', null);
  }
}
```

## Metadata Update Pattern

**Location:** Playback Orchestrator

```typescript
private _updateMediaMetadata(showTitle: string, episodeTitle: string, artworkUrl?: string) {
  if (!('mediaSession' in navigator)) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: episodeTitle,
    artist: showTitle, // Show title as artist
    album: showTitle,  // Show title as album
    artwork: artworkUrl ? [
      { src: artworkUrl, sizes: '96x96', type: 'image/jpeg' },
      { src: artworkUrl, sizes: '128x128', type: 'image/jpeg' },
      { src: artworkUrl, sizes: '192x192', type: 'image/jpeg' },
      { src: artworkUrl, sizes: '256x256', type: 'image/jpeg' },
      { src: artworkUrl, sizes: '384x384', type: 'image/jpeg' },
      { src: artworkUrl, sizes: '512x512', type: 'image/jpeg' }
    ] : []
  });
}

private _clearMediaMetadata() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = null;
}
```

## Position State Update Pattern

**Location:** Playback Orchestrator

```typescript
private lastPositionUpdate = 0;

private _updateMediaPosition() {
  if (!('mediaSession' in navigator)) return;
  if (!this.currentEpisodeId) return;

  navigator.mediaSession.setPositionState({
    duration: this.currentDuration,
    playbackRate: this.audio.playbackRate,
    position: this.currentTime
  });
}

// In audio timeupdate handler
private _setupAudioListeners(): void {
  // ... other listeners
  
  this.audio.addEventListener('timeupdate', async () => {
    this.currentTime = this.audio.currentTime;
    
    // Update Media Session position state every 5 seconds
    const now = Date.now();
    if (now - this.lastPositionUpdate > 5000) {
      this._updateMediaPosition();
      this.lastPositionUpdate = now;
    }
    
    // Periodic sync during playback
    if (this.currentSession && this.systemState === 'ready') {
      const timeSinceLastSync = Math.abs(this.currentTime - this.lastSyncedPosition);
      if (timeSinceLastSync >= this.syncThreshold) {
        await this._syncNow();
      }
    }
    
    this._updateXmbState();
  });
}
```

## Action Handler Pattern

**Location:** Playback Orchestrator

```typescript
private _handleMediaPlay() {
  if (this.currentEpisodeId) {
    this.requestPlay();
  }
  // Note: Can't start new playback from media key without current episode
}

private _handleMediaPause() {
  this.requestPause();
}

private _handleMediaStop() {
  // Stop playback and clear episode
  this.audio.pause();
  this.audio.currentTime = 0;
  this.userIntent = null;
  this._clearMediaMetadata();
  this._updateXmbState();
}

private _handleMediaSeekForward() {
  const seekAmount = 30; // TODO: Make configurable
  const newTime = Math.min(
    this.currentTime + seekAmount,
    this.currentDuration
  );
  this.audio.currentTime = newTime;
  this._updateMediaPosition();
}

private _handleMediaSeekBackward() {
  const seekAmount = 10; // TODO: Make configurable
  const newTime = Math.max(
    this.currentTime - seekAmount,
    0
  );
  this.audio.currentTime = newTime;
  this._updateMediaPosition();
}

private _handleMediaSeekTo(details: MediaSessionActionDetails) {
  if (details.seekTime !== undefined) {
    this.audio.currentTime = details.seekTime;
    this._updateMediaPosition();
  }
}

private _handleMediaNext() {
  // Navigate to next episode
  const nextSelection = this.xmbBrowser.navigateToNextEpisode();
  if (nextSelection) {
    this.loadEpisode(
      nextSelection.show.id,
      nextSelection.episode.id,
      nextSelection.show.title,
      nextSelection.episode.title,
      true // Preserve current intent
    );
  }
}

private _handleMediaPrevious() {
  // Navigate to previous episode
  // Note: XMB browser doesn't have navigateToPreviousEpisode yet
  // Would need to implement or manually navigate
  console.warn('Previous track not yet implemented');
}
```

## Configuration Extension

Add Media Session config to XMB config:

```typescript
interface XMBConfig {
  // ... existing config
  mediaSession?: {
    enabled: boolean;
    seekForwardAmount: number;  // seconds, default 30
    seekBackwardAmount: number; // seconds, default 10
    enableTrackNavigation: boolean; // enable next/previous, default true
    wrapToNextShow: boolean; // wrap to next show at end, default false
  };
}
```

Default config:

```typescript
const defaultConfig: XMBConfig = {
  // ... existing defaults
  mediaSession: {
    enabled: true,
    seekForwardAmount: 30,
    seekBackwardAmount: 10,
    enableTrackNavigation: true,
    wrapToNextShow: false
  }
};
```

## Integration Points

### When to Update Metadata

**In `loadEpisode()` method:**

```typescript
async loadEpisode(
  showId: string,
  episodeId: string,
  showTitle: string,
  episodeTitle: string,
  preserveIntent: boolean | 'play' = false
): Promise<boolean> {
  // ... existing loading logic
  
  // Update XMB browser with playback URL and session info
  await Promise.resolve();
  this.audio.src = session.playbackUrl;
  this.audio.currentTime = session.startTime;
  this.audio.load();
  
  // Update Media Session metadata
  this._updateMediaMetadata(showTitle, episodeTitle, session.artworkUrl);
  
  // ... rest of method
}
```

### When to Clear Metadata

**In `_handleMediaStop()` or when episode ends:**

```typescript
private _handleMediaStop() {
  this.audio.pause();
  this.audio.currentTime = 0;
  this.userIntent = null;
  
  // Clear Media Session metadata
  this._clearMediaMetadata();
  
  this._updateXmbState();
}
```

### When to Update Position State

**In audio `canplay` event handler:**

```typescript
this.audio.addEventListener('canplay', () => {
  if (this.systemState === 'loading') {
    console.log('[Orchestrator] Audio ready, transitioning to ready state');
    this.systemState = 'ready';
    this.currentDuration = this.audio.duration;
    
    // Set initial position state when audio is ready
    this._updateMediaPosition();
    
    this._updateXmbState();
    this._reconcile();
  }
});
```

## Testing Checklist

### Desktop Testing
- [ ] Keyboard media keys control playback (play/pause)
- [ ] Keyboard media keys skip forward/backward
- [ ] Keyboard media keys navigate episodes (next/previous)
- [ ] Chrome media notification shows episode info
- [ ] Chrome media notification controls work

### Mobile Testing (Android)
- [ ] Lock screen shows media controls
- [ ] Lock screen shows episode artwork
- [ ] Lock screen shows episode/show title
- [ ] Lock screen play/pause works
- [ ] Lock screen skip forward/backward works
- [ ] Notification drawer shows media controls
- [ ] Notification drawer controls work
- [ ] Notification dismisses when playback stops

### Bluetooth Testing
- [ ] Bluetooth headphone play/pause button works
- [ ] Bluetooth headphone skip buttons work
- [ ] Bluetooth headphone controls update XMB UI

### Edge Cases
- [ ] Media keys work when XMB browser not focused
- [ ] Media keys work when browser tab in background
- [ ] Metadata updates when episode changes
- [ ] Position state updates during playback
- [ ] Graceful degradation when API not supported

## References

- [Media Session API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API)
- [MediaMetadata - MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaMetadata)
- [Browser Support - Can I Use](https://caniuse.com/mdn-api_mediasession)
