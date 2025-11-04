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

### Paused Mode

In paused mode, the XMB browser displays:
- Current episode of each show (left, center, right) at full opacity
- Non-current episodes fade in/out based on proximity when navigating
- Play/pause button centered on the current episode
- No circular progress indicator
- Full navigation enabled (swipe up/down/left/right)

### Playing Mode

In playing mode, the XMB browser displays:
- Radially pushed layout with extra space around the current episode
- Circular progress bar tracking playback position
- Play/pause button centered on the current episode
- Interactive playhead for seeking
- **Navigation locked** - no swiping allowed

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
- Blue progress indicator (#2563eb, 8px stroke width)
- White playhead handle (10px radius) with larger hit area (24px radius)
- Progress starts at 12 o'clock (top) and moves clockwise

**Visibility:**
- Only visible when playing
- Animates in with radial push (300ms duration)
- Animates out when pausing (300ms duration, reverse animation)
- Opacity tied to play animation progress (0 to 1)

**Interaction:**
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

**Trigger:** When playback stops (playing → paused)

**Duration:** 300ms

**Behavior:**
1. Circular progress bar fades out first
2. Adjacent episodes bounce back to original positions
3. Reverse of the radial push animation

**Easing:** Cubic ease-in (1 - (1 - progress)³)

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

### Navigation (Playing Mode)

**Disabled:**
- All swiping/dragging is locked
- User is "stuck" on the current episode
- Only playback controls are interactive
- Play button remains clickable for pause

**Implementation:**
- `_onDragStart` checks `isPlaying` and returns early
- Exception: play button area doesn't call `preventDefault()` to allow pause clicks
- Circular progress remains interactive for seeking

**Rationale:**
- Prevents accidental episode changes during playback
- Focuses interaction on playback controls
- User must pause to navigate

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

### User Intent Preservation
- **Problem:** Episode changes reset playback state, losing user's play intent
- **Solution:** PlaybackSessionManager tracks `userIntent` ('play' | 'pause' | null)
- When user clicks play/pause during episode load, intent is saved
- When audio fires 'ready' event, intent is fulfilled automatically
- Prevents play/pause flickering during episode transitions

**Intent Flow (Play during load):**
1. User clicks play during episode change
2. `play-request` event → `sessionManager.play()`
3. If loading: saves `userIntent = 'play'`
4. Episode loads, audio fires 'ready' event
5. Session manager checks intent and calls `audioPlayer.play()`
6. Intent fulfilled, set to null

**Intent Clearing:**
- Manual episode changes (user drags to new episode): Intent is cleared
- Auto-advance (episode ends): Intent is preserved (continues playing)
- Prevents stale play intent from old episode affecting new episode
- Example: Click play → pause → change episode → new episode stays paused ✓

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

## Known Issues & Limitations

### Lit Update Warning
When changing episodes, you may see: "Element audio-player scheduled an update after an update completed"

**Cause:** Episode change event fires during XMB's update cycle, which then sets properties on audio-player, triggering another update.

**Status:** Should be investigated and fixed by deferring property updates to avoid nested update cycles.

