# Application Architecture

## Overview

This document describes the overall application architecture, showing how all components fit together to create the podcast player application. The application is built around the XMB browser component, which provides the navigation and playback interface.

For detailed XMB component architecture, see [XMB Architecture](./xmb-architecture.md). For state machine logic, see [XMB Orchestration](./xmb-orchestration.md). For user experience design, see [XMB UX](./xmb-ux.md).

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                       │
│                   (src/app/podcast-player.ts)               │
│                                                             │
│  - Loads catalog from repository                            │
│  - Manages state persistence                                │
│  - Wires components together                                │
│  - Handles auto-advance                                     │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────────┐    ┌─────────────────────────────┐
│      XMB Component       │    │   Media Repository          │
│      (src/xmb/)          │    │   (src/catalog/)            │
│                          │    │                             │
│  - XMB Browser           │◄───┤  - Repository Interface     │
│  - Playback Orchestrator │    │  - Show/Episode Types       │
│  - Controllers           │    │  - Implementations:         │
│                          │    │    • Audiobookshelf         │
└──────────────┬───────────┘    └─────────────────────────────┘
               │
               ▼
┌──────────────────────────┐
│   UI Components          │
│   (src/components/)      │
│                          │
│  - Audio Player          │
│  - Fullscreen Button     │
└──────────────────────────┘
```

## Directory Structure

```
src/
├── app/
│   └── podcast-player.ts          # Application entry point
├── catalog/
│   ├── media-repository.ts        # Repository interface and types
│   └── audiobookshelf/
│       ├── audiobookshelf.ts      # ABS repository implementation
├── components/
│   ├── audio-player.ts            # HTML5 audio wrapper
│   └── fullscreen-button.ts       # Fullscreen toggle button
└── xmb/
    ├── xmb-browser.ts             # Main XMB browser component
    ├── playback-orchestrator.ts   # Playback state coordination
    └── controllers/               # Animation, drag, layout controllers
```

## Layer Responsibilities

### Application Layer (`src/app/`)

**podcast-player.ts** - Application entry point that wires everything together:

**Responsibilities:**
- Instantiates XMB browser, audio player, and playback orchestrator
- Loads catalog from media repository
- Manages state persistence (localStorage)
- Listens to events from XMB browser and orchestrator
- Handles auto-advance between episodes
- Coordinates responses to user actions

**Key Behaviors:**
- On `episode-change` from XMB browser → calls orchestrator.loadEpisode()
- On `play-request` from XMB browser → calls orchestrator.requestPlay()
- On `pause-request` from XMB browser → calls orchestrator.requestPause()
- On `seek` from XMB browser → calls orchestrator.seekToProgress()
- On `state-change` from orchestrator → updates XMB browser props
- On `episode-ended` from orchestrator → calls browser.navigateToNextEpisode() and orchestrator.loadEpisode()
- On `episode-changed` from orchestrator → saves state to localStorage

**Does NOT:**
- Manage playback state (delegated to orchestrator)
- Handle drag/navigation logic (delegated to XMB browser)
- Directly control audio player (delegated to orchestrator)

### Catalog Layer (`src/catalog/`)

**media-repository.ts** - Repository interface defining the contract:

**Provides:**
- `Show` and `Episode` type definitions
- `MediaRepository` interface with methods:
  - `loadCatalog()` - Load all shows and episodes
  - `startPlayback(showId, episodeId)` - Start playback session
  - `updateProgress(sessionId, position, duration, timeListened)` - Sync progress
  - `endPlayback(sessionId)` - End playback session
- `PlaybackSession` type for active playback tracking

**Purpose:**
- Defines repository-agnostic types used throughout application
- Allows swapping repository implementations (Audiobookshelf, Plex, Jellyfin, etc.)
- Provides clean abstraction for media sources

**audiobookshelf/** - Audiobookshelf-specific implementation:

**Responsibilities:**
- Implements `MediaRepository` interface
- Handles authentication with ABS server
- Queries library for shows and episodes
- Tracks playback sessions
- Syncs progress to ABS server
- Maps ABS data structures to application types

**Files:**
- `audiobookshelf.ts` - Low-level API client
- `audiobookshelf-repository.ts` - Repository implementation

### Components Layer (`src/components/`)

**audio-player.ts** - HTML5 audio element wrapper:

**Responsibilities:**
- Manages HTML5 audio element lifecycle
- Handles audio loading and playback
- Emits events for state changes
- Provides playback control methods

**Events:**
- `ready` - Audio loaded and ready to play
- `play` - Audio started playing
- `pause` - Audio paused
- `seek` - User seeked to new position
- `timeupdate` - Playback position updated
- `ended` - Audio finished playing

**Methods:**
- `play()` - Start playback
- `pause()` - Pause playback
- `seekTo(time)` - Seek to position

**Properties:**
- `contentUrl` - Audio file URL
- `showTitle` - Show title (for display)
- `episodeTitle` - Episode title (for display)
- `initialPosition` - Starting position in seconds

**fullscreen-button.ts** - Fullscreen toggle:

**Responsibilities:**
- Provides button to enter/exit fullscreen
- Uses Fullscreen API
- Independent of other components

### XMB Layer (`src/xmb/`)

See [XMB Architecture](./xmb-architecture.md) for detailed documentation of the XMB component.

**Summary:**
- XMB Browser - Visual interface for navigation and playback
- Playback Orchestrator - State machine for playback coordination
- Controllers - Animation, drag, and layout logic

## Data Flow

### Initialization

1. **Application starts:**
   - podcast-player.ts loads
   - Creates media repository instance
   - Loads catalog from repository
   - Creates audio player component
   - Creates playback orchestrator (with repository and audio player)
   - Creates XMB browser component
   - Loads persisted state from localStorage
   - Navigates to last episode

### User Navigates to Episode

1. User swipes in XMB browser
2. XMB browser emits `episode-change` event
3. podcast-player receives event
4. podcast-player calls `orchestrator.loadEpisode(showId, episodeId, ..., preserveIntent=false)`
5. Orchestrator sets system state to 'loading', clears intent
6. Orchestrator loads episode from repository
7. Orchestrator updates audio player with new content
8. Audio player loads and emits `ready` event
9. Orchestrator sets system state to 'ready'
10. Orchestrator emits `state-change` event
11. podcast-player updates XMB browser props

### User Starts Playback

1. User taps play button in XMB browser
2. XMB browser emits `play-request` event
3. podcast-player receives event
4. podcast-player calls `orchestrator.requestPlay()`
5. Orchestrator sets intent to 'play'
6. Orchestrator reconciles: if system is 'ready', calls `audioPlayer.play()`
7. Orchestrator emits `state-change` with `isPlaying=true`
8. podcast-player updates XMB browser props
9. XMB browser displays playing state (radial push, progress ring)

### Episode Ends (Auto-Advance)

Auto-advance creates a three-animation sequence for smooth episode transitions:

1. Audio player emits `ended` event
2. Orchestrator clears intent (`userIntent = null`)
3. Orchestrator emits `state-change` → XMB browser starts **pause animation** (300ms)
4. Orchestrator starts 300ms timeout (allows pause animation to complete)
5. Timeout fires → Orchestrator emits `episode-ended` event
6. podcast-player receives `episode-ended` event
7. podcast-player calls `browser.navigateToNextEpisode()`
8. XMB browser starts **snap animation** (500ms) - episode slides to next
9. podcast-player calls `orchestrator.loadEpisode(..., preserveIntent='play')`
10. Orchestrator sets system state to 'loading' and intent to 'play'
11. New episode loads from repository
12. Snap animation completes
13. When audio ready, orchestrator reconciles → `loading → playing` transition
14. XMB browser starts **play animation** (300ms) - progress ring fades in
15. Seamless transition complete

**Animation Sequence:** Pause (300ms) → Snap (500ms) → Play (300ms) = ~1100ms total

**User Interruption:** Any play/pause action cancels the pending auto-advance timeout

## State Persistence

**What Gets Persisted:**
- Current show ID
- Current episode ID for each show
- Playback position for each episode

**When State is Saved:**
- On `episode-changed` event from orchestrator
- On progress updates (throttled)
- On application close

**Storage:**
- localStorage (key: 'podcast-player-state')
- JSON format

**Restoration:**
- On application load
- Navigates to last episode
- Restores playback position

## Configuration

### Repository Configuration

Repository is configured via `secrets.ts`:

```typescript
import { AudiobookshelfConfig } from './src/catalog/audiobookshelf/audiobookshelf-repository.js';

export const ABS_CONFIG: AudiobookshelfConfig = {
  url: 'https://your-server.com',
  apiKey: 'your-api-key',
  libraryId: 'your-library-id',
};
```

### XMB Configuration

XMB browser can be configured via properties:

```typescript
browser.inlinePlaybackControls = true;  // Enable playback UI
```

See [XMB Architecture](./xmb-architecture.md) for detailed configuration options.

## Error Handling

### Repository Errors

**Catalog Loading Fails:**
- Application displays error message
- User cannot browse episodes

**Episode Loading Fails:**
- Orchestrator sets system state to 'error'
- XMB browser can display error state
- User can retry by navigating to different episode

**Progress Sync Fails:**
- Logged to console
- Does not interrupt playback
- Will retry on next sync

### Audio Player Errors

**Audio Loading Fails:**
- Audio player emits error event
- Orchestrator can handle error state
- User can retry or skip to next episode

**Playback Interrupted:**
- Audio player emits pause event
- Orchestrator updates state
- XMB browser displays paused state

## Extension Points

### Adding New Repository

To add support for a new media source (Plex, Jellyfin, etc.):

1. Create new folder in `src/catalog/`
2. Implement `MediaRepository` interface
3. Map source data to `Show` and `Episode` types
4. Update application to use new repository

## Performance Considerations

### Catalog Loading

- Catalog loaded once on application start
- Cached in memory
- No re-fetching during session

### Progress Syncing

- Throttled to avoid excessive API calls
- Syncs every 10 seconds during playback
- Syncs on pause and seek
- Syncs on episode end

### State Persistence

- Throttled writes to localStorage
- Only saves on significant changes
- Minimal data stored

### Rendering

- XMB browser optimized for 60fps
- Direct style manipulation for positions
- GPU acceleration for animations
- Efficient update batching
