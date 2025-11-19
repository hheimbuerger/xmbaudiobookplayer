# XMB Audio Player Integration - Design

## Overview

This design integrates audio playback directly into the XMB browser component by moving the `<audio>` element and playback state from the separate `audio-player` component into `xmb-browser`. This eliminates the component boundary and event-based state synchronization, creating a single source of truth for playback state.

## Architecture

### Current Architecture
- Separate `audio-player` component with its own UI (scrubber, buttons, episode info)
- Event-based communication between audio-player and XMB browser
- State duplication and synchronization overhead
- XMB browser has its own playback UI (circular progress, play/pause overlay)

### Target Architecture
- XMB browser directly owns the `<audio>` element
- All playback state lives in XMB browser
- Direct method calls instead of event passing
- Single playback UI (XMB browser's existing UI)
- Optional events for external integrations only

## Components and Interfaces

### Audio Element Integration

The `<audio>` element will be added to XMB browser's template with event listeners for:
- `play` / `pause` - Playback state changes
- `timeupdate` - Progress updates
- `ended` - Episode completion
- `error` - Playback errors
- `loadstart` / `canplay` - Loading state transitions

The audio element will not be visible in the UI.

### Playback State Structure

XMB browser will maintain internal playback state properties:
- `currentTime: number` - Current playback position (seconds)
- `duration: number` - Total episode duration (seconds)
- `currentEpisodeId: string | null` - Currently playing episode ID

The existing `@property` decorators for `isPlaying`, `isLoading`, and `playbackProgress` will remain as they are currently set by the PlaybackOrchestrator. However, they will now also be updated internally by audio event handlers, eliminating the need for the orchestrator to set them.

### Playback Control Methods

XMB browser will expose public methods for playback control:
- `play()` - Start or resume playback of the currently selected episode
- `pause()` - Pause current playback
- `seek(time: number)` - Seek to a specific time
- `switchEpisode(episodeId: string)` - Switch to a different episode (not implemented - raises NotImplementedError)
- `stop()` - Stop playback (not implemented - raises NotImplementedError)

The `play()` method will use the currently selected episode from XMB browser's navigation state. Episode selection happens through the existing XMB navigation UI, not through the playback API.

**Important:** These methods will trigger the same internal state changes as user interactions (button clicks). For example, calling `play()` should:
1. Update the audio element to start playback
2. Trigger play/pause animations (same as clicking the play button)
3. Update the render loop strategy
4. Stop any ongoing navigation animations if needed

This ensures consistency between programmatic control and user interactions.

## Data Models

### Internal Playback State
```typescript
{
  currentTime: number;           // seconds
  duration: number;              // seconds
  currentEpisodeId: string | null;
}
```

### Reactive Properties (existing)
These properties already exist on XMB browser and will be updated by audio event handlers:
```typescript
{
  isPlaying: boolean;            // @property
  isLoading: boolean;            // @property
  playbackProgress: number;      // @property (0 to 1)
}
```

### Event Detail (for external events)
```typescript
{
  currentTime: number;
  duration: number;
  episodeId: string | null;
}
```

## Error Handling

### Audio Playback Errors
- Audio element errors will be caught in the `error` event handler
- Error information will be logged to console
- Playback state will be reset (isPlaying = false, isLoading = false)
- UI will reflect the error state

### Episode Not Found
- `play()` method will validate episode exists before attempting playback
- Missing episodes will log an error and return early
- No state changes will occur for invalid episodes

### Network Errors
- Network failures during loading will trigger the `error` event
- Loading state will be cleared
- User can retry by clicking play again

## Progress Sync Integration

### Media Repository Interface
XMB browser will notify the media repository about progress updates through a method call:
```
mediaRepository.updateProgress(episodeId, currentTime, duration)
```

The media repository maintains responsibility for:
- Throttling sync requests
- Communicating with backend catalog APIs
- Handling sync configuration
- Managing sync errors

This preserves the existing separation of concerns where XMB browser handles UI and playback, while the media repository handles data persistence and external sync.

### Update Frequency
Progress updates will be sent on every `timeupdate` event (typically ~4 times per second). The media repository will handle throttling to avoid excessive API calls.

## External Events

For applications that embed XMB browser, the component will emit custom events:
- `play` - Playback started
- `pause` - Playback paused
- `ended` - Episode finished
- `timeupdate` - Progress updated

Each event will include:
- Current playback time
- Total duration
- Episode ID

These events are optional and not used internally by XMB browser.

## PlaybackOrchestrator Changes

The PlaybackOrchestrator currently coordinates between audio-player and XMB browser. After integration:

**What stays:**
- Orchestrator still manages playback state machine (user intent vs system state)
- Orchestrator still handles episode loading from media repository
- Orchestrator still handles auto-advance logic
- Orchestrator still coordinates progress sync

**What changes:**
- Instead of calling `audioPlayer.play()`, orchestrator calls `xmbBrowser.play()`
- Instead of listening to audio-player events, orchestrator listens to XMB browser events
- XMB browser becomes the single audio playback component

The orchestrator's role shifts from coordinating two separate components to coordinating XMB browser with the media repository.

## Migration Strategy

### Phase 1: Integration
1. Add `<audio>` element to XMB browser template
2. Implement audio event handlers in XMB browser
3. Add internal playback state properties (currentTime, duration, currentEpisodeId)
4. Implement playback control methods (play, pause, seek)
5. Ensure methods trigger same state changes as UI interactions

### Phase 2: State Management
1. Update audio event handlers to set isPlaying, isLoading, playbackProgress properties
2. Ensure play/pause animations trigger correctly from both UI and programmatic calls
3. Update render loop strategy based on playback state

### Phase 3: Progress Sync
1. Add media repository reference to XMB browser
2. Implement progress notification in timeupdate handler
3. Verify catalog sync continues to work

### Phase 4: Orchestrator Update
1. Update PlaybackOrchestrator to call XMB browser methods instead of audio-player
2. Update PlaybackOrchestrator to listen to XMB browser events instead of audio-player
3. Remove audio-player reference from orchestrator

### Phase 5: External Events
1. Add optional event emission for external integrations
2. Document event API for component users

### Phase 6: Cleanup
1. Remove all audio-player imports and references from app
2. Delete audio-player.ts file
3. Verify all functionality works without audio-player

## Testing Strategy

### Manual Testing
- Play button starts playback correctly
- Pause button pauses playback
- Progress ring updates smoothly during playback
- Episode ends and stops correctly
- Seeking works via circular progress scrubber
- Loading states display correctly
- Error states display correctly (invalid URL, network errors)

### Integration Testing
- Verify progress sync to media catalog continues to work
- Verify episode auto-advance works
- Verify playback state persists across navigation
- Verify external events are emitted correctly

### Regression Testing
- Verify all existing XMB browser functionality still works
- Verify configuration options are respected
