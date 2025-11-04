# XMB Browser Playback UI Specification

## Overview

The XMB (Cross Media Bar) browser features an optional interactive playback UI that differentiates between two states: **playing** and **paused**. This document describes the visual design, animations, and interaction behaviors.

### Configuration

The inline playback controls can be enabled or disabled via the `inlinePlaybackControls` property:

```javascript
browser.inlinePlaybackControls = true;  // Enable (default)
browser.inlinePlaybackControls = false; // Disable
```

When **disabled** (`false`):
- No play/pause button on current episode
- No radial push animation
- No circular progress bar
- Navigation is never locked (can swipe during playback)
- XMB browser is agnostic to playback state

---

## States

The XMB browser has three distinct states from the user's perspective:

### 1. Paused Mode

**Visual State:**
- Current episode of each show (left, center, right) at full opacity
- Non-current episodes fade in/out based on proximity when navigating
- Play button (▶) centered on the current episode
- No circular progress indicator
- Compact layout (no radial push)

**Interaction:**
- Full navigation enabled (swipe up/down/left/right)
- Can change episodes and shows freely
- Click play button to transition to Loading mode

### 2. Loading Mode (Buffering)

**Trigger:** User clicks play button, but audio is not yet ready

**Visual State:**
- Radially pushed layout (same as Playing mode)
- Circular progress ring visible with loading animation
- Pause button (⏸) centered on the current episode
- **No playhead handle** (position unknown until metadata loads)
- **No blue progress arc** (duration unknown until metadata loads)
- Loading animation: Subtle waves of light blue emanating from center outward

**Interaction:**
- **Navigation locked** - no swiping allowed (same as Playing mode)
- Pause button is clickable (cancels loading, returns to Paused mode)
- Scrubber is not interactive (no playhead to drag)
- User cannot change episodes

**Purpose:**
- Provides immediate visual feedback that play was registered
- Prevents accidental episode changes during load
- Clearly indicates system is working (loading animation)
- Maintains consistent "playing" UI even before audio starts

**Duration:** Typically 100-500ms, but can be longer on slow connections

### 3. Playing Mode

**Trigger:** Audio metadata loaded and playback started

**Visual State:**
- Radially pushed layout with extra space around the current episode
- Circular progress bar with blue progress arc showing playback position
- Pause button (⏸) centered on the current episode
- White playhead handle at current position
- Interactive scrubber for seeking

**Interaction:**
- **Navigation locked** - no swiping allowed
- Pause button clickable (transitions to Paused mode)
- Playhead draggable for seeking
- User cannot change episodes

---

## State Transitions

### Paused → Loading
**Trigger:** User clicks play button

**Behavior:**
1. Immediately transition to Loading visual state (radial push animation starts)
2. Lock navigation (prevent episode changes)
3. Change button to pause icon
4. Show loading animation on scrubber
5. Request audio load from session manager
6. Session manager saves play intent

**Duration:** 300ms animation + audio load time

### Loading → Playing
**Trigger:** Audio metadata loaded and ready to play

**Behavior:**
1. Session manager fulfills play intent
2. Playhead appears at correct position
3. Blue progress arc appears
4. Loading animation fades out
5. Scrubber becomes interactive
6. Audio starts playing

**Duration:** Instant (no animation)

### Loading → Paused
**Trigger:** User clicks pause button during loading

**Behavior:**
1. Cancel loading (clear play intent)
2. Radial collapse animation (reverse of push)
3. Scrubber fades out
4. Change button to play icon
5. Unlock navigation
6. Audio load continues in background but won't auto-play

**Duration:** 300ms animation

### Playing → Paused
**Trigger:** User clicks pause button, or episode ends without auto-advance

**Behavior:**
1. Audio pauses
2. Radial collapse animation
3. Scrubber fades out (including playhead and progress)
4. Change button to play icon
5. Unlock navigation

**Duration:** 300ms animation

### Paused → Playing (Direct)
**Trigger:** Audio was already loaded and ready (e.g., resuming after pause)

**Behavior:**
1. Skip Loading state entirely
2. Radial push animation
3. Scrubber appears with playhead and progress immediately
4. Change button to pause icon
5. Lock navigation
6. Audio starts playing

**Duration:** 300ms animation

---

## Visual Elements

### Play/Pause Button

**Appearance:**
- Circular blue button (48px diameter)
- Centered on the current episode's album art
- Matches the audio player's play/pause button design
- Shows play icon (▶) when paused, pause icon (⏸) when playing

**Behavior:**
- Clickable to toggle playback state
- Scales down from 1.0 to 0.0 as you drag away from center (paused mode only)
- Disappears completely at 0.5 icon offset during drag
- Scales up from 0.0 to 1.0 during snap animation to new episode
- Always visible at scale 1.0 when playing (no scaling)
- Higher z-index (15) ensures it's always clickable

**Interaction:**
- Click/tap toggles between play and pause
- Triggers the same playback control as the audio player button

### Circular Progress Bar

**Appearance:**
- Large circular track around the current episode (250px diameter)
- Gray track (rgba(255, 255, 255, 0.2), 8px stroke width)
- Blue progress indicator (#2563eb, 8px stroke width) - only in Playing mode
- White playhead handle (10px radius) with larger hit area (24px radius) - only in Playing mode
- Progress starts at 12 o'clock (top) and moves clockwise

**Visibility:**
- Visible in Loading and Playing modes
- Hidden in Paused mode
- Animates in with radial push (300ms duration)
- Animates out when pausing (300ms duration, reverse animation)
- Opacity tied to play animation progress (0 to 1)

**Loading State (Buffering):**
- Only gray track is visible (no blue progress, no playhead)
- Loading animation: track pulses from gray to blue color
- Animation is continuous and subtle (2 second cycle)
- Indicates system is working without showing specific progress
- Not interactive (no playhead to drag)

**Playing State:**
- Gray track + blue progress arc + white playhead
- Blue arc shows how much has been played
- Playhead shows current position
- Fully interactive for seeking

**Interaction (Playing mode only):**
- Playhead is draggable (mouse and touch supported)
- Drag to seek through the episode
- Only the playhead handle is interactive (not the entire circle)
- Seeking only occurs on release (not during drag)
- Visual progress updates in real-time during drag

**Constraints:**
- Playhead cannot jump across the 12 o'clock boundary
- To move from 95% to 5%, must drag counterclockwise through 0%
- If dragging clockwise past 12 o'clock, playhead gets stuck at ~100%
- If dragging counterclockwise past 12 o'clock, playhead gets stuck at 0%
- Prevents accidental jumps by tracking continuous movement

---

## Animations

### Radial Push Animation (Play)

**Trigger:** When playback starts (paused → playing)

**Duration:** 300ms

**Behavior:**
1. All adjacent episodes (above, below, left, right) push outward radially
2. Push distance: 1.0 icon size (72px)
3. Direction calculated from center point
4. Circular progress bar fades in simultaneously
5. Episodes remain visible during push (fade range expands)

**Easing:** Linear progress (no easing curve)

### Radial Collapse Animation (Pause)

**Trigger:** When playback stops (playing → paused) or loading is cancelled (loading → paused)

**Duration:** 300ms

**Behavior:**
1. Circular progress bar fades out first
2. Adjacent episodes bounce back to original positions
3. Reverse of the radial push animation

**Easing:** Cubic ease-in (1 - (1 - progress)³)

### Loading Animation (Buffering)

**Trigger:** When in Loading mode (audio not yet ready)

**Appearance:**
- Track color pulses from gray to blue
- Gray: `rgba(255, 255, 255, 0.2)` (default track color)
- Blue: `rgba(96, 165, 250, 0.7)` (loading indicator)
- Smooth color transition using CSS animation
- No additional visual elements (just the track itself)

**Behavior:**
- Continuous loop while in Loading mode (2 second cycle)
- Animation stops when transitioning to Playing mode
- Animation stops when transitioning to Paused mode
- Track returns to default gray color when not loading

**Duration:** 2 seconds per cycle (ease-in-out)

**Purpose:**
- Indicates system is actively loading
- Provides visual feedback without specific progress
- Subtle and non-distracting
- Uses existing track element (no additional DOM elements)

**Technical Implementation:**
- CSS keyframe animation on track element
- Applied via `loading` class when `isLoading` is true
- Animates stroke color property
- Minimal performance impact

### Play/Pause Button Scaling (Paused Mode)

**During Drag:**
- Scales linearly based on distance from center
- Formula: `scale = max(0, 1.0 - (totalOffset / 0.5))`
- Disappears at 0.5 icon offset
- Tied directly to drag offset (no lag)

**During Snap:**
- Scales up from 0.0 to 1.0 on new current episode
- Uses same easing as snap animation
- Synchronized with episode movement

---

## Interaction Behaviors

### Click vs Drag Detection

The system distinguishes between clicks (taps) and drags to prevent accidental actions:

**Implementation:**
- `didDrag` flag tracks if actual dragging occurred (direction was set)
- Direction is set when movement exceeds threshold (0.2 icon sizes / ~14px)
- Play/pause button click is blocked if `didDrag` is true
- Works identically for both mouse and touch input

**Scenarios:**
- **Tap play button without moving:** Play/pause action fires ✓
- **Start drag on play button, move to change episode:** Drag works, click blocked ✓
- **Drag and return to exact start position:** Click still blocked (didDrag is true) ✓
- **Drag during playback:** Blocked entirely, no drag or click ✓

**Event Handling:**
- Mouse: `mousedown` → `mousemove` → `mouseup` → `click`
- Touch: `touchstart` → `touchmove` → `touchend` → `click`
- Both paths use unified `didDrag` flag for consistency
- `preventDefault()` is NOT called on play button to allow click events
- `preventDefault()` IS called elsewhere to prevent scrolling during drag

### Navigation (Paused Mode)

**Enabled:**
- Swipe left/right to change shows
- Swipe up/down to change episodes within current show
- Can start drag from anywhere, including on the play button
- Direction locking after threshold (0.2 icon sizes)
- Snap to nearest episode on release
- Momentum scrolling with friction

**Visual Feedback:**
- Episodes move smoothly with drag
- Play/pause button scales down during drag
- Non-current episodes fade based on distance
- Vertical drag mode: side episode titles fade in
- Horizontal drag mode: vertical show titles fade in

**Touch & Mouse Support:**
- Full parity between touch and mouse interactions
- Document-level listeners for smooth dragging outside component
- Proper event cleanup on disconnect

### Navigation (Loading & Playing Modes)

**Disabled:**
- All swiping/dragging is locked in both Loading and Playing modes
- User is "stuck" on the current episode
- Only playback controls are interactive
- Pause button remains clickable

**Implementation:**
- `_onDragStart` checks `isPlaying` and returns early
- Exception: pause button area doesn't call `preventDefault()` to allow pause clicks
- Circular progress remains interactive for seeking (Playing mode only)
- Loading mode has same navigation lock as Playing mode

**Rationale:**
- Prevents accidental episode changes during playback or loading
- Provides immediate feedback that play was registered
- Focuses interaction on playback controls
- User must pause to navigate
- Consistent behavior whether audio is loading or playing

### Circular Progress Dragging

**Start:**
- Grab the playhead handle (24px hit area)
- Initializes from current playback position
- Tracks last angle to prevent jumps
- Uses `composedPath()` to detect clicks in shadow DOM

**During Drag:**
- Visual progress updates immediately
- Playhead follows cursor/finger position
- Constrained to continuous circular movement
- Cannot jump across 12 o'clock boundary
- Separate mouse and touch handlers with document-level listeners

**Release:**
- Seeks audio to new position
- Emits `seek` event with progress (0-1)
- Session manager handles the seek operation
- Audio player updates and resumes playback

**Touch Support:**
- Full touch event support (touchstart, touchmove, touchend)
- Same behavior as mouse interaction
- 24px hit area for comfortable touch target
- Works correctly in mobile device emulation mode

---

## Layout & Spacing

### Icon Sizing
- Base icon size: 72px
- Show spacing: 1.8 icon sizes (129.6px)
- Episode spacing: 1.8 icon sizes (129.6px)
- Radial push distance: 1.0 icon size (72px)

### Opacity & Fading
- Current episode of each show: Always opacity 1.0
- Non-current episodes: Fade based on show offset
- Fade range (paused): 0.5 icon offsets
- Fade range (playing): Expands to accommodate pushed episodes

### Scaling
- Max scale: 1.5x at center
- Scale distance: 3.3 icon sizes
- Scales down based on distance from screen center

---

## Z-Index Hierarchy

1. **Play/Pause Button** (z-index: 15) - Always on top, always clickable
2. **Circular Progress** (z-index: 10) - Only playhead is interactive
3. **Episode Items** (z-index: default) - Base layer

---

## Technical Implementation Notes

### State Synchronization
- XMB browser receives `isPlaying` and `playbackProgress` as properties
- Parent component (podcast-player) syncs state from audio player events
- XMB emits events: `play-request`, `pause-request`, `seek`, `episode-change`
- Unidirectional data flow: properties down, events up

### User Intent Preservation & Loading State

**Three-State Model:**
1. **Paused:** Navigation unlocked, can change episodes
2. **Loading:** Navigation locked, waiting for audio to be ready (user clicked play)
3. **Playing:** Navigation locked, audio is playing

**Key Insight:** Loading mode locks navigation immediately when play is clicked, preventing episode changes during load.

### Episode Loading Phases

When an episode changes (user drags to new episode), the following happens in the background:

**Phase 1: API Call (100-500ms)**
- `loadEpisode()` called on session manager
- `await mediaRepository.startPlayback()` - fetches session from server
- Receives: playbackUrl, duration, startTime (resume position)
- Sets `loadingState = 'loading'` (internal state, not visible to user)

**Phase 2: Audio Element Setup (synchronous)**
- `audio.src = contentUrl` - sets the audio source URL
- `audio.load()` - tells browser to start loading
- Browser begins fetching audio file

**Phase 3: Metadata Loading (50-200ms)**
- Browser downloads file headers to read metadata
- Fires `loadedmetadata` event when complete
- Duration is now known, can seek to resume position
- Fires 'ready' event → `loadingState = 'idle'`
- Browser may start buffering audio data in background

**Phase 4: Buffering (only when play is called)**
- When `audio.play()` is called, browser ensures sufficient data is buffered
- If not enough buffered, browser waits (causes playback delay)
- Duration depends on network speed and buffer requirements

**Background Loading:**
- Phases 1-3 happen automatically when episode changes
- User does NOT see loading state (stays in Paused mode)
- Browser buffers audio in background
- If user waits before clicking play, audio is already ready

**User-Initiated Loading:**
- User clicks play while Phases 1-3 are still in progress
- XMB immediately enters Loading state (radial push, loading animation)
- When 'ready' event fires, transitions to Playing state
- If Phases 1-3 already complete, goes straight to Playing (no Loading state)

**Implementation:**
- `isLoading()` returns `true` only when `userIntent === 'play'` AND `loadingState === 'loading'`
- This ensures Loading state only shows when user has clicked play
- Background loading is invisible to user

**Intent Flow (Play clicked):**
1. User clicks play button
2. XMB immediately transitions to Loading mode (radial push, lock navigation)
3. `play-request` event → `sessionManager.play()`
4. If audio ready: plays immediately, transition to Playing mode
5. If audio loading: saves `userIntent = 'play'`, stays in Loading mode
6. When audio fires 'ready' event: fulfills intent, transition to Playing mode

**Intent Flow (Pause during loading):**
1. User clicks pause button while in Loading mode
2. XMB transitions to Paused mode (radial collapse, unlock navigation)
3. `pause-request` event → `sessionManager.pause()`
4. Updates `userIntent = 'pause'` (or clears it)
5. When audio fires 'ready' event: fulfills pause intent (stays paused)

**Intent Clearing:**
- Manual episode changes (user drags to new episode): Intent is cleared
- Auto-advance (episode ends): Intent is preserved (continues playing)
- Prevents stale play intent from old episode affecting new episode
- Example: Click play → pause → change episode → new episode stays paused ✓

**Why This Works:**
- Navigation is locked as soon as play is clicked (Loading mode)
- User cannot accidentally change episodes while loading
- Intent system only needs to handle play/pause during load, not episode changes
- Simpler and more predictable behavior

### Event Handling Architecture

**Shadow DOM Considerations:**
- Event listeners on component use `composedPath()` to detect actual clicked element
- `e.target` returns host element, not shadow DOM children
- Must check `path.some(el => el.classList?.contains('play-pause-overlay'))` for play button
- Critical for distinguishing play button clicks from general component clicks

**Document-Level Listeners:**
- `mousemove` and `touchmove` on document for smooth dragging
- Allows drag to continue even when pointer leaves component
- Properly cleaned up in `disconnectedCallback()`
- Always check `dragState.active` before processing movement

**Drag State Management:**
- `dragState.active`: Whether a drag is currently in progress
- `dragState.direction`: 'horizontal' | 'vertical' | null (set after threshold)
- `didDrag`: Whether direction was ever set (for click vs drag detection)
- Reset on every pointer down, set during move, checked on click

### Performance
- RequestAnimationFrame for smooth 60fps animations
- Cached episode elements for efficient rendering
- Direct style manipulation for position/opacity
- Template updates only when necessary
- Momentum state with friction for natural scrolling feel

### Accessibility
- Play/pause button has proper ARIA labels
- Keyboard navigation not yet implemented
- Touch targets meet minimum size requirements (24px+)
- Works correctly with touch emulation in desktop browsers

---

## Auto-Advance Behavior

When an episode finishes playing, the system automatically advances to the next episode in the same show with a smooth multi-phase transition:

**Phase 1: Pause (300ms)**
- Episode ends, playback stops
- Progress bar animates away (radial collapse)
- Visual indication that episode is complete

**Phase 2: Navigate (200ms)**
- Snap animation to next episode
- Clear visual transition between episodes
- No progress bar visible during navigation

**Phase 3: Play**
- Play intent is set via `sessionManager.play()`
- Episode loads from server
- Intent is preserved during load
- Progress bar animates in as playback starts

**Behavior:**
- Only advances within the same show (never crosses to a different show)
- If at the last episode of a show, playback stops (no auto-advance)
- User can interrupt by pausing or navigating during any phase
- Uses intent system to ensure playback resumes after load

## Logging & Debugging

The XMB browser and session manager emit structured console logs for debugging:

**User Actions:**
- `[XMB] User requested play` - Play button clicked
- `[XMB] User requested pause` - Pause button clicked
- `[XMB] User navigated to episode:` - Episode changed via drag (includes show/episode details)

**State Changes:**
- `[XMB] Playback state changed: playing` - isPlaying property set to true
- `[XMB] Playback state changed: paused` - isPlaying property set to false

**Intent System:**
- `[SessionManager] Play requested during loading, saving intent` - Play clicked while episode loading
- `[SessionManager] Pause requested during loading, saving intent` - Pause clicked while episode loading

**Purpose:**
- Track user intentions vs actual state changes
- Debug play/pause flickering issues
- Understand episode change timing
- Verify intent preservation across loads

---

## Implementation Status

### Completed
- ✅ Three-state model (Paused, Loading, Playing)
- ✅ Navigation locking in Loading and Playing modes
- ✅ User intent preservation system
- ✅ Click vs drag detection
- ✅ Touch and mouse parity
- ✅ Radial push/collapse animations
- ✅ Play/pause button state management
- ✅ Loading animation (color pulse on track)
- ✅ Conditional playhead/progress rendering based on state
- ✅ XMB state property to track Paused/Loading/Playing

### Known Issues

#### Lit Update Warning
When changing episodes, you may see: "Element audio-player scheduled an update after an update completed"

**Cause:** Episode change event fires during XMB's update cycle, which then sets properties on audio-player, triggering another update.

**Status:** Should be investigated and fixed by deferring property updates to avoid nested update cycles.

#### SVG Conditional Rendering
During implementation, we discovered that conditionally rendering SVG elements with `${condition ? html`<circle />` : ''}` creates elements in the HTML namespace instead of the SVG namespace, causing them not to render. Solution: Always render SVG elements and control visibility with CSS (`display`, `visibility`, or `opacity`).

**Reference:** See `.kiro/steering/lit-svg-conditional-rendering.md` for details.

