# Audiobookshelf Progress Sync Implementation

## Overview

This document describes how to correctly sync and restore playback progress with Audiobookshelf server for podcast episodes.

## Key Learnings

### 1. Session-Based Progress Management

Audiobookshelf uses a **session-based approach** for tracking playback:

- Sessions are temporary playback instances
- Progress is synced to the session during playback
- **Progress is only persisted permanently when the session is closed**

### 2. The Three Critical Endpoints

#### `/api/items/{itemId}/play/{episodeId}` (POST)
- Creates a new playback session
- Returns session ID, playback URL, and **saved progress** (`currentTime`)
- Returns the episode **duration** from server metadata
- This is the primary way to get resume position

**Response includes:**
```json
{
  "id": "session-id",
  "currentTime": 123.45,  // Saved progress in seconds
  "duration": 1507.44,    // Total episode duration
  "episodeId": "episode-id"
}
```

#### `/api/session/{sessionId}/sync` (POST)
- Updates the current playback position in the session
- Should be called periodically (every 10 seconds) while playing
- Should be called immediately on pause, seek, or before switching episodes

**Request body:**
```json
{
  "currentTime": 123.45,
  "duration": 1507.44,
  "timeListened": 10.5  // Time elapsed since last sync
}
```

#### `/api/session/{sessionId}/close` (POST)
- **Critical:** Closes the session and persists progress to database
- Must be called before switching episodes or closing the app
- Without this, progress may not be saved permanently

## Implementation Pattern

### Starting Playback

```typescript
// 1. Call /play to create session and get saved progress
const session = await resolvePlayUrl(config, itemId, episodeId);

// 2. Use the duration from the server (don't wait for audio metadata)
const duration = session.duration;
const startTime = session.currentTime; // Resume position

// 3. Start the audio player at the saved position
player.initialPosition = startTime;
```

### During Playback

```typescript
// Sync every 10 seconds while playing
setInterval(async () => {
  if (isPlaying) {
    await syncSession(sessionId, currentTime, duration, timeListened);
  }
}, 10000);

// Also sync immediately on user actions
player.on('pause', () => syncSession(...));
player.on('seek', () => syncSession(...));
```

### Switching Episodes

```typescript
// 1. Sync current position
await syncSession(currentSessionId, currentTime, duration, timeListened);

// 2. Close the session to persist progress
await closeSession(currentSessionId);

// 3. Now load the new episode
const newSession = await resolvePlayUrl(config, newItemId, newEpisodeId);
```

## Common Pitfalls

### ❌ Don't: Use `/api/me/progress/{id}` PATCH endpoint
- This endpoint has bugs and can crash the server
- The session-based approach is more reliable

### ❌ Don't: Wait for audio metadata to get duration
- The audio player may return incorrect duration before metadata loads
- Always use the duration from the `/play` endpoint response

### ❌ Don't: Forget to close sessions
- Sessions must be closed to persist progress
- Without closing, progress may be lost when switching episodes

### ❌ Don't: Sync before audio metadata loads
- Syncing with invalid duration (0 or NaN) will fail
- Store the duration from the `/play` response and use that

## Complete Flow Diagram

```
User starts episode
    ↓
POST /api/items/{id}/play/{episodeId}
    ↓
Get: sessionId, currentTime (resume position), duration
    ↓
Set audio player position to currentTime
    ↓
Start 10-second sync interval
    ↓
[While playing]
    ↓
POST /api/session/{id}/sync (every 10s, on pause, on seek)
    ↓
[User switches episode]
    ↓
POST /api/session/{id}/sync (final sync)
    ↓
POST /api/session/{id}/close (persist progress) ← CRITICAL
    ↓
Repeat for new episode
```

## Testing Checklist

- [ ] Progress saves when pausing
- [ ] Progress saves when seeking
- [ ] Progress saves when switching episodes within same show
- [ ] Progress saves when switching between different shows
- [ ] Progress persists after closing and reopening app
- [ ] Correct duration is used (matches server metadata)
- [ ] No server crashes when syncing

## Code References

- `demo/audiobookshelf.ts` - API functions for play, sync, and close
- `demo/app.js` - Session management and sync orchestration
- `components/audio-player.ts` - Audio player component
