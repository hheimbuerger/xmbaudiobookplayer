# XMB Orchestration

## Overview

The **PlaybackOrchestrator** is the state machine that coordinates playback between UI components, audio player, and media repository. It separates **user intent** from **system capability**, eliminating race conditions by preserving user intent across all async operations.

This document provides a deep dive into the orchestrator's state machine, reconciliation logic, and intent preservation rules. For the complete system architecture and how all components fit together, see [XMB Architecture](./xmb-architecture.md).

## Architecture Goals

1. **Eliminate Race Conditions** - User intent must never be lost during async operations
2. **Single Source of Truth** - All playback state managed in one place
3. **Predictable Behavior** - State transitions are explicit and deterministic
4. **Testable** - State machine logic is isolated and unit-testable
5. **Maintainable** - Clear separation of concerns between components

## Core Concepts

### User Intent vs System Capability

The state machine separates what the user wants from what the system can do:

**User Intent:** `'play' | 'pause' | null`
- What the user has requested
- Preserved across ALL async operations
- Never cleared except by explicit user action

**System State:** `'ready' | 'loading' | 'error'`
- What the system is currently capable of
- Tracks async operations (episode loading, audio loading)
- Independent of user intent

### State Derivation

All UI state is derived from intent + system:

```
isPlaying = intent === 'play' && system === 'ready'
isLoading = intent === 'play' && system === 'loading'
isPaused = intent !== 'play' && system === 'ready'
navigationLocked = intent === 'play' || system === 'loading'
```

This ensures UI always reflects the true state with no possibility of desync.

## Orchestrator Responsibilities

The PlaybackOrchestrator is the central state machine that manages all playback state.

**Owns:**
- User intent (play/pause/null)
- System state (ready/loading/error)
- Current episode tracking
- Playback session management
- Progress syncing to repository

**Public API:**
- `requestPlay()` - User wants to play
- `requestPause()` - User wants to pause
- `loadEpisode(showId, episodeId, showTitle, episodeTitle, preserveIntent)` - Load new episode (async)
- `seekToProgress(progress)` - Seek to position
- `getState()` - Get complete current state
- `getCurrentEpisode()` - Get current episode info

**Events:**
- `'state-change'` - Emitted on any state change
- `'episode-changed'` - Emitted when episode loads (for persistence)
- `'episode-ended'` - Emitted when episode finishes (for auto-advance)

**Does NOT Own:**
- Shows catalog (receives from app)
- UI components (coordinates between them)
- State persistence (emits events for app to handle)

**Key Behavior:**
- Intent is preserved during `loadEpisode()` if `preserveIntent=true`
- Intent is set to 'play' if `preserveIntent='play'` (auto-advance)
- Intent is cleared during `loadEpisode()` if `preserveIntent=false` (manual episode change)
- Reconciliation happens automatically when system becomes ready

## State Transitions

### User Presses Play

1. XMB Browser emits `'play-request'`
2. Podcast Player calls `stateManager.requestPlay()`
3. State Manager sets `userIntent = 'play'`
4. State Manager reconciles:
   - If `systemState === 'ready'`: calls `audioPlayer.play()`
   - If `systemState === 'loading'`: intent saved for later
5. State Manager emits `'state-change'` with `isPlaying=true` or `isLoading=true`
6. XMB Browser receives updated props and displays accordingly

### Episode Changes During Loading

1. User navigates to new episode
2. XMB Browser emits `'episode-change'`
3. Podcast Player calls `stateManager.loadEpisode()`
4. State Manager sets `systemState = 'loading'`, `userIntent = null`
5. User presses play (DURING loading)
6. State Manager sets `userIntent = 'play'`
7. Audio finishes loading, fires `'ready'` event
8. State Manager sets `systemState = 'ready'`
9. State Manager reconciles: calls `audioPlayer.play()` (intent fulfilled!)
10. State Manager emits `'state-change'` with `isPlaying=true`

**Key:** Intent set in step 6 is preserved through steps 7-9 and fulfilled in step 9.

### Auto-Advance

Auto-advance creates a three-animation sequence when an episode ends:

**Sequence:**

1. **Audio player fires `'ended'` event**
2. **Orchestrator clears intent** → `userIntent = null`
3. **Orchestrator emits `'state-change'`** → XMB Browser receives `isPlaying=false`
4. **Pause animation starts** (progress ring fades out) - 300ms
5. **Orchestrator starts 300ms timeout** (allows pause animation to complete)
6. **Timeout fires** → Orchestrator emits `'episode-ended'` event
7. **Podcast Player receives `'episode-ended'`**
8. **Podcast Player calls `browser.navigateToNextEpisode()`**
   - XMB Browser updates internal state
   - Starts snap animation (episode slides up) - 500ms
   - Does NOT emit `episode-change` event (programmatic navigation)
9. **Podcast Player calls `orchestrator.loadEpisode(..., preserveIntent='play')`**
   - Sets `systemState = 'loading'` and `userIntent = 'play'`
   - XMB Browser receives `isLoading=true`
   - Does NOT start play animation yet (snap is running)
10. **Snap animation completes**
11. **Audio loads and becomes ready**
12. **Orchestrator reconciles** → `loading → playing` transition
13. **Play animation starts** (progress ring fades in) - 300ms
14. **Playback continues seamlessly**

**Key Points:**
- Three sequential animations: pause (300ms) → snap (500ms) → play (300ms)
- Total transition time: ~1100ms
- Using `preserveIntent='play'` sets intent to play during load
- Snap animation is NOT cancelled when loading starts (auto-advance detection)
- Play animation is delayed until `loading → playing` transition

**User Interruption:**
- User can click play/pause during auto-advance
- Any user action cancels the pending auto-advance timeout
- Prevents unwanted navigation after user has taken control
- If snap animation is already running, it completes (navigation is locked)

## Reconciliation

The state manager's reconciliation logic is the heart of the system:

```
reconcile():
  if systemState === 'ready':
    if userIntent === 'play':
      audioPlayer.play()
    else if userIntent === 'pause':
      audioPlayer.pause()
  
  // If systemState === 'loading', intent is saved and will be
  // fulfilled when 'ready' event fires
  
  emit 'state-change' event
```

This ensures:
- User intent is always fulfilled when system becomes ready
- No race conditions between user actions and async operations
- State changes are atomic and predictable

## Intent Preservation Rules

### When Intent is Cleared
- Manual episode change (user navigates to different episode)
- Explicit user action (play → pause or pause → play)

### When Intent is Preserved
- Auto-advance (episode ends, next episode loads with `preserveIntent='play'`)
- Episode loading in progress (user presses play during load)
- Audio loading in progress (metadata being fetched)

### Special Case: Auto-Advance
Auto-advance uses `preserveIntent='play'` which explicitly sets the intent to 'play' during the load. This is different from `preserveIntent=true` which preserves the existing intent (which would be null after episode ends).

### Why This Matters

Without intent preservation:
```
1. User navigates to episode → loadEpisode() starts
2. loadEpisode() clears intent
3. User presses play → intent set to 'play'
4. loadEpisode() continues... and clears intent again! ❌
5. Audio ready → no intent to fulfill → stays paused ❌
```

With intent preservation:
```
1. User navigates to episode → loadEpisode() starts
2. loadEpisode() clears intent (manual change)
3. User presses play → intent set to 'play'
4. loadEpisode() continues... intent NOT cleared ✓
5. Audio ready → intent fulfilled → starts playing ✓
```

## Navigation Locking

Navigation is locked when:
- `userIntent === 'play'` (user wants to play)
- `systemState === 'loading'` (episode is loading)

This prevents:
- Accidental episode changes during playback
- Episode changes during loading (which would cancel the load)

The XMB Browser checks `isPlaying || isLoading` to determine if navigation should be locked.

## Loading States

### Three Visual States

1. **Paused** - `!isPlaying && !isLoading`
   - Play button visible
   - Navigation unlocked
   - No progress ring

2. **Loading** - `isLoading` (intent='play', system='loading')
   - Pause button visible
   - Navigation locked
   - Progress ring with loading animation
   - No playhead (position unknown)

3. **Playing** - `isPlaying` (intent='play', system='ready')
   - Pause button visible
   - Navigation locked
   - Progress ring with playhead
   - Scrubber interactive

### Loading Trigger

`isLoading` only returns true when:
- `systemState === 'loading'` AND
- `userIntent === 'play'`

This means:
- Background episode loading (no play intent) doesn't show loading state
- User must explicitly request play to see loading UI
- Provides immediate feedback that play was registered

## Error Handling

If episode loading fails:
1. State Manager sets `systemState = 'error'`
2. State Manager emits `'state-change'` with error state
3. UI can display error message
4. User intent is preserved (can retry)

## Benefits

### Eliminates Race Conditions
User intent is preserved across all async boundaries. No more "play then immediately pause" bugs.

### Predictable State
All state derived from two simple values. Easy to reason about, debug, and test.

### Single Source of Truth
Components just display state, don't manage it. No synchronization needed.

### Maintainable
Clear separation of concerns. State logic isolated in one place.

### Testable
State machine can be unit tested independently of UI components.

## Implementation Notes

### Event Flow
- State flows DOWN via props (unidirectional)
- Events flow UP via custom events
- No circular dependencies
- Clear data flow

### Performance
- State changes emit single event
- Components update only when state changes
- No polling or timers needed
- Efficient reconciliation

### Debugging
- All state transitions logged
- Single place to add breakpoints
- State history could be added for time-travel debugging
- Clear event trail
