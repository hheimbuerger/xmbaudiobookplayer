# Application Architecture

## Overview

This document describes the overall application architecture, showing how all components fit together to create the podcast player application. The application follows a clean **Model-View-Controller (MVC)** architecture pattern.

For detailed XMB component architecture, see [XMB Architecture](./xmb-architecture.md). For state machine logic, see [XMB Orchestration](./xmb-orchestration.md). For user experience design, see [XMB UX](./xmb-ux.md).

## MVC Architecture

The application follows a clean separation of concerns using the MVC pattern:

### **Model** - Media Repository (`src/catalog/`)
- Manages data access and business logic
- Provides shows, episodes, and playback sessions
- Handles external API communication (Audiobookshelf, etc.)
- Syncs playback progress to backend
- **Knows nothing about UI or playback state**

### **View** - XMB Browser (`src/xmb/xmb-browser.ts`)
- Purely visual component
- Renders episode grid, animations, progress ring
- Handles user gestures (drag, tap, seek)
- Emits user interaction events
- Receives state via properties
- **Knows nothing about audio or data access**

### **Controller** - Playback Orchestrator (`src/xmb/playback-orchestrator.ts`)
- Coordinates between Model and View
- Owns the HTML5 audio element
- Manages all playback state
- Listens to View events (user interactions)
- Listens to audio element events
- Updates View state via properties
- Calls Model methods for data
- **The glue that connects everything**

### **Application Shell** - podcast-player (`src/app/podcast-player.ts`)
- Loads the catalog (Model)
- Creates the View and Controller
- Wires them together
- Handles state persistence (localStorage)
- Minimal coordination logic

This clean separation makes the codebase:
- **Testable** - Each layer can be tested independently
- **Maintainable** - Changes to one layer don't affect others
- **Flexible** - Can swap implementations (different repositories, different views)
- **Understandable** - Clear responsibilities for each component

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Shell                       │
│                   (src/app/podcast-player.ts)               │
│                                                             │
│  - Loads catalog from repository                            │
│  - Manages state persistence (localStorage)                 │
│  - Creates and wires MVC components                         │
│  - Restores saved playback position                         │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────────┐    ┌─────────────────────────────┐
│  CONTROLLER              │    │   MODEL                     │
│  Playback Orchestrator   │    │   Media Repository          │
│  (src/xmb/)              │    │   (src/catalog/)            │
│                          │    │                             │
│  - Owns audio element    │◄───┤  - Repository Interface     │
│  - Coordinates state     │    │  - Show/Episode Types       │
│  - Handles auto-advance  │    │  - Implementations:         │
│  - Syncs progress        │    │    • Audiobookshelf         │
└──────────────┬───────────┘    └─────────────────────────────┘
               │
               ▼
┌──────────────────────────┐
│  VIEW                    │
│  XMB Browser             │
│  (src/xmb/)              │
│                          │
│  - Visual UI component   │
│  - Navigation & gestures │
│  - Emits user events     │
│  - Receives state props  │
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
│       └── audiobookshelf.ts      # ABS repository implementation
├── components/
│   └── fullscreen-button.ts       # Fullscreen toggle button
└── xmb/
    ├── xmb-browser.ts             # Visual XMB browser component
    ├── playback-orchestrator.ts   # Playback coordination & audio element
    └── controllers/               # Animation, drag, layout controllers
```

## Layer Responsibilities

### Application Layer (`src/app/`)

**podcast-player.ts** - Application shell that provides the complete player:

**Responsibilities:**
- Loads catalog from media repository
- Creates XMB browser component with shows
- Creates playback orchestrator (passing repository and browser)
- Manages state persistence (localStorage)
- Listens to orchestrator events for persistence

**Key Behaviors:**
- On startup → loads catalog, creates components, restores saved position
- On `state-change` from orchestrator → updates internal state for rendering
- On `episode-changed` from orchestrator → saves state to localStorage
- On disconnect → cleans up orchestrator

**Does NOT:**
- Route events between components (orchestrator handles this)
- Manage playback state (orchestrator owns this)
- Handle auto-advance (orchestrator handles this)
- Control audio element (orchestrator owns this)

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

**fullscreen-button.ts** - Fullscreen toggle:

**Responsibilities:**
- Provides button to enter/exit fullscreen
- Uses Fullscreen API
- Independent of other components

### XMB Layer (`src/xmb/`)

See [XMB Architecture](./xmb-architecture.md) for detailed documentation of the XMB component.

**Summary:**
- **XMB Browser** - Purely visual component for navigation UI
  - Renders episode grid, animations, progress ring
  - Handles user gestures (drag, tap, seek)
  - Emits user interaction events
  - Receives state via properties (isPlaying, isLoading, playbackProgress)
  
- **Playback Orchestrator** - Central coordinator that owns everything
  - Owns HTML5 audio element
  - Manages all playback state (intent, system state, progress)
  - Listens to XMB browser user events
  - Listens to audio element events
  - Updates XMB browser state via properties
  - Handles auto-advance logic
  - Syncs progress to repository
  
- **Controllers** - Animation, drag, and layout logic

## Data Flow

### Initialization

1. **Application starts:**
   - podcast-player.ts loads
   - Creates media repository instance
   - Loads catalog from repository
   - Creates XMB browser component with shows
   - Creates playback orchestrator (with repository and XMB browser)
   - Orchestrator creates HTML5 audio element
   - Orchestrator sets up event listeners on audio and browser
   - Loads persisted state from localStorage
   - Navigates XMB browser to last episode
   - Tells orchestrator to load that episode

### User Navigates to Episode

1. User swipes in XMB browser
2. XMB browser emits `episode-change` event
3. Orchestrator receives event (listening directly)
4. Orchestrator calls `loadEpisode(showId, episodeId, ..., preserveIntent=false)`
5. Orchestrator sets system state to 'loading', clears intent
6. Orchestrator loads episode from repository
7. Orchestrator sets audio element src and loads
8. Audio element fires `canplay` event
9. Orchestrator sets system state to 'ready'
10. Orchestrator updates XMB browser props (isPlaying, isLoading, progress)
11. Orchestrator emits `episode-changed` event
12. podcast-player saves state to localStorage

### User Starts Playback

1. User taps play button in XMB browser
2. XMB browser emits `play-request` event
3. Orchestrator receives event (listening directly)
4. Orchestrator calls `requestPlay()` internally
5. Orchestrator sets intent to 'play'
6. Orchestrator reconciles: if system is 'ready', calls `audio.play()`
7. Audio element fires `play` event
8. Orchestrator updates XMB browser props: `isPlaying=true`
9. XMB browser displays playing state (radial push, progress ring)

### Episode Ends (Auto-Advance)

Auto-advance creates a three-animation sequence for smooth episode transitions:

1. Audio element fires `ended` event
2. Orchestrator clears intent (`userIntent = null`)
3. Orchestrator updates XMB browser: `isPlaying=false` → **pause animation** starts (300ms)
4. Orchestrator starts 300ms timeout (allows pause animation to complete)
5. Timeout fires → Orchestrator calls internal `_handleAutoAdvance()`
6. Orchestrator calls `browser.navigateToNextEpisode()`
7. XMB browser starts **snap animation** (500ms) - episode slides to next
8. Orchestrator calls `loadEpisode(..., preserveIntent='play')`
9. Orchestrator sets system state to 'loading' and intent to 'play'
10. New episode loads from repository
11. Orchestrator sets audio element src and loads
12. Snap animation completes
13. Audio element fires `canplay` event
14. Orchestrator reconciles → `loading → playing` transition
15. Orchestrator updates XMB browser: `isPlaying=true` → **play animation** starts (300ms)
16. Seamless transition complete

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
