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

## Visual States

The XMB browser displays three distinct visual states based on playback state (see [Playback State Management](./playback-state-management.md) for state machine details):

### 1. Paused Mode

**When:** `!isPlaying && !isLoading`

**Visual:**
- Current episode of each show at full opacity
- Non-current episodes fade based on proximity
- Play button (▶) centered on current episode
- No circular progress indicator
- Compact layout (no radial push)

**Interaction:**
- Full navigation enabled (swipe up/down/left/right)
- Can change episodes and shows freely
- Click play button to request play

### 2. Loading Mode

**When:** `isLoading` (user requested play, audio not yet ready)

**Visual:**
- Radially pushed layout (same as Playing mode)
- Circular progress ring with loading animation
- Pause button (⏸) centered on current episode
- **No playhead handle** (position unknown)
- **No blue progress arc** (duration unknown)
- Loading animation: Track pulses from gray to blue

**Interaction:**
- **Navigation locked** - no swiping allowed
- Pause button clickable (cancels play intent)
- Scrubber not interactive
- User cannot change episodes

**Purpose:**
- Immediate feedback that play was registered
- Prevents accidental episode changes during load
- Indicates system is working

### 3. Playing Mode

**When:** `isPlaying` (audio ready and playing)

**Visual:**
- Radially pushed layout with extra space
- Circular progress bar with blue progress arc
- Pause button (⏸) centered on current episode
- White playhead handle at current position
- Interactive scrubber for seeking

**Interaction:**
- **Navigation locked** - no swiping allowed
- Pause button clickable (requests pause)
- Playhead draggable for seeking
- User cannot change episodes

---

## State Transitions

All state transitions are managed by the PlaybackStateManager (see [Playback State Management](./playback-state-management.md)). The XMB browser simply displays the current state and emits user action events.

### Visual Animations

**Paused → Loading/Playing:**
- Radial push animation (300ms)
- Progress ring fades in
- Button changes to pause icon
- Navigation locks

**Loading/Playing → Paused:**
- Radial collapse animation (300ms)
- Progress ring fades out
- Button changes to play icon
- Navigation unlocks

**Loading → Playing:**
- No animation (instant transition)
- Playhead appears
- Progress arc appears
- Scrubber becomes interactive

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
- **Hides completely during drag/swipe gestures** (paused mode only)
  - Disappears immediately when drag direction is locked (threshold reached)
  - Stays hidden during entire drag and momentum phases
  - Reappears during snap animation when drag ends
- Always visible at scale 1.0 when playing or loading (no hiding during drag)
- Higher z-index (15) ensures it's always clickable when visible

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
- Quick tap detection allows short swipes to be treated as taps
- Tap thresholds: < 200ms duration AND < 10px distance
- Works identically for both mouse and touch input

**Quick Tap Detection:**
When a touch/click starts on the play button and ends quickly with minimal movement, it's treated as an intentional tap even if it technically qualifies as a drag:

- **Time threshold:** 200ms - Maximum duration for a tap
- **Distance threshold:** 10px - Maximum movement for a tap
- **Direct action:** Play/pause is triggered immediately in `_onDragEnd`, bypassing the click event
- **Prevents double-trigger:** Flag prevents subsequent click event from firing duplicate action
- **Works during animations:** Functions even when button has `pointer-events: none` (during snap animations)

**Scenarios:**
- **Tap play button without moving:** Play/pause action fires ✓
- **Quick tap with slight swipe (< 200ms, < 10px):** Treated as tap, play/pause fires ✓
- **Start drag on play button, move to change episode:** Drag works, click blocked ✓
- **Drag and return to exact start position:** Click still blocked (didDrag is true) ✓
- **Tap immediately after episode change:** Works even during snap animation ✓
- **Drag during playback:** Blocked entirely, no drag or click ✓

**Event Handling:**
- Mouse: `mousedown` → `mousemove` → `mouseup` → `click`
- Touch: `touchstart` → `touchmove` → `touchend` → `click`
- Synthetic mouse events after touch are ignored (500ms window)
- Quick taps trigger action in `_onDragEnd` before click event fires
- Click event is suppressed if already handled as quick tap
- Both paths use unified `didDrag` flag for consistency
- `preventDefault()` is NOT called on play button to allow click events
- `preventDefault()` IS called elsewhere to prevent scrolling during drag

**Touch Highlight Removal:**
- Play/pause button has `-webkit-tap-highlight-color: transparent` to remove rectangular touch highlight
- Provides clean, professional appearance on mobile devices
- Button maintains circular visual design without distracting overlays

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

### State Management

The XMB browser is a pure display component that receives state via props and emits user action events. All state management is handled by the PlaybackStateManager.

**Props (State In):**
- `isPlaying: boolean` - Currently playing audio
- `isLoading: boolean` - Loading with intent to play
- `playbackProgress: number` - Current progress (0-1)

**Events (Actions Out):**
- `play-request` - User clicked play button
- `pause-request` - User clicked pause button
- `seek` - User dragged progress scrubber
- `episode-change` - User navigated to new episode

**Data Flow:**
- Unidirectional: state flows down (props), events flow up
- No internal state tracking
- No state computation from props
- Pure display logic only

For details on how state is managed, intent is preserved, and race conditions are prevented, see [Playback State Management](./playback-state-management.md).

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

## Performance Optimizations

To ensure smooth 60fps animations during swiping and dragging:

**High-Resolution Rendering:**
- Episode items render at maximum zoom size (129.6px) and scale down for off-center items
- Prevents upscaling blur by always rendering at the largest displayed size
- Images remain sharp during all animations

**GPU Acceleration:**
- CSS hints for high-quality rendering (`image-rendering`, `transform: translateZ(0)`)
- GPU compositing enabled for smooth transforms and opacity changes
- Backface visibility hidden to prevent flickering

**Update Batching:**
- Multiple state changes within a frame batch into single template update
- Shallow property comparison instead of JSON.stringify for label data
- Threshold-based updates to avoid micro-changes triggering re-renders

**UI Simplification:**
- Play button hides completely during drag (eliminates scale calculations per frame)
- Direct style manipulation for episode positions (bypasses Lit template system)

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
- ✅ Play/pause button hides during drag gestures
- ✅ Loading animation (color pulse on track)
- ✅ Conditional playhead/progress rendering based on state
- ✅ XMB state property to track Paused/Loading/Playing
- ✅ Performance optimizations for smooth 60fps animations

### Known Issues

#### SVG Conditional Rendering
During implementation, we discovered that conditionally rendering SVG elements with `${condition ? html`<circle />` : ''}` creates elements in the HTML namespace instead of the SVG namespace, causing them not to render. Solution: Always render SVG elements and control visibility with CSS (`display`, `visibility`, or `opacity`).

**Reference:** See `.kiro/steering/lit-svg-conditional-rendering.md` for details.

