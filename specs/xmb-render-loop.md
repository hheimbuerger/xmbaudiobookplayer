# XMB Render Loop Architecture

## Overview

The XMB browser uses an adaptive render loop system that switches between different rendering strategies based on what's happening in the UI. This optimizes performance by only rendering at high frequency when needed (during interactions) and reducing to low frequency or stopping entirely when idle.

## Architecture

### Core Principle: Direct DOM Manipulation

The XMB browser optimizes render performance by using **direct DOM manipulation** for frequently-updated elements instead of relying on Lit's reactive system. This eliminates unnecessary re-renders during playback and animations.

**What gets updated directly:**
- Progress ring (`stroke-dashoffset`)
- Playhead position (`cx`, `cy` attributes)
- Play/pause icon visibility (`display` property)
- Loading state (`loading` class on track)
- Play/pause button transform and opacity
- Navigation labels (text, transform, opacity, color)
- Playback titles (text content)

**What remains reactive:**
- Shows array (structural changes)
- Configuration (static after init)

### RenderLoopController

The `RenderLoopController` is a self-contained component that manages all render loop logic and integrates performance monitoring. It lives in `src/xmb/controllers/render-loop-controller.ts`.

**Responsibilities:**
- Manages high-frequency (60fps) and low-frequency (15fps) render loops
- Automatically switches between modes based on application state
- Tracks performance metrics (FPS, frame times, spikes)
- Handles timing resets to prevent false spike detection

**Key Design Decisions:**
- Integrates debug stats directly (no separate controller needed)
- Uses callbacks to decouple from XMB browser implementation
- Automatically resets frame timing when loops stop (prevents false spikes)

### DOM Reference Cache

The XMB browser caches references to frequently-updated DOM elements in a `domRefs` object. This avoids repeated `querySelector` calls during render loops.

**Cached Elements:**
```typescript
private domRefs = {
  // Play/pause button (reparented to current episode)
  playPauseButton: HTMLElement,
  playIcon: SVGElement,
  pauseIcon: SVGElement,
  
  // Progress ring elements
  progressRing: SVGCircleElement,
  progressTrack: SVGCircleElement,
  playhead: SVGCircleElement,
  playheadHitbox: SVGCircleElement,
  
  // Playback titles
  playbackShowTitle: HTMLElement,
  playbackEpisodeTitle: HTMLElement,
};
```

**When Refreshed:**
- After initial render
- When `shows` array changes (structural change)

**Error Handling:**
- For DOM refs accessed during normal operation (e.g., `updatePlaybackUI()`): fail-fast - crash if null
- For `reparentButtonToCurrentEpisode()`: early return with logging - can legitimately be called before DOM is ready

This distinction exists because reparenting may be called during initialization before the DOM is fully ready, while other DOM access should only happen after the component is fully rendered.

### Playback State from Orchestrator

The `PlaybackOrchestrator` sets playback state properties (`isPlaying`, `isLoading`, `playbackProgress`) **directly** on the `xmb-browser` component, NOT via template bindings from `podcast-player`.

**Why direct property setting:**
- Avoids redundant Lit re-renders in the parent component
- The orchestrator already has a reference to the browser
- Template bindings would cause parent to re-render on every state change

**Flow:**
```
Audio event → Orchestrator._updateXmbState() → xmb-browser.isPlaying = value
                                             → xmb-browser.isLoading = value
                                             → xmb-browser.playbackProgress = value
```

**Important:** `podcast-player` does NOT pass these properties via template bindings. It only passes `shows` and `config`.

### Manual Playback Properties

Playback state properties (`isPlaying`, `isLoading`, `playbackProgress`) use manual getters/setters instead of Lit's `@property` decorator. This prevents Lit re-renders when playback state changes.

```typescript
private _isPlaying = false;

get isPlaying(): boolean { return this._isPlaying; }
set isPlaying(value: boolean) {
  const oldValue = this._isPlaying;
  this._isPlaying = value;
  if (oldValue !== value) {
    this._handlePlaybackStateChange(oldValue, this._isLoading);
    this._updateRenderLoopStrategy();  // Maintain mode switching
  }
}
```

**Critical:** The setters call `_updateRenderLoopStrategy()` to maintain correct render loop mode switching. Without this, the render loop wouldn't know when to switch between modes.

### Stable DOM Structure

The template renders a **stable DOM structure** that doesn't change based on runtime state. Elements that need to appear/disappear use CSS visibility control instead of conditional rendering.

**Why no conditional rendering for runtime state:**
1. Conditional rendering (`${condition ? html\`...\` : ''}`) creates/destroys DOM elements
2. This triggers Lit re-renders
3. SVG elements created conditionally may have wrong namespace
4. Can't cache references to elements that don't exist

**Elements always rendered:**
- Play/pause button (single instance, reparented to current episode)
- Both play and pause icons (visibility via `display`)
- Circular progress SVG (visibility via `opacity`)
- Playback titles (visibility via `opacity`)
- Navigation labels for all episodes/shows (visibility via `opacity`)

**Conditional rendering only for:**
- Static conditions (config values, data structure checks)
- Example: `isEmoji` check for icon rendering

## Render Modes

### High-Frequency Mode (60+ fps)

**When Active:**
- User is dragging
- Momentum animation is active
- Any UI animations are running (play/pause transitions, snap animations)

**Implementation:**
- Uses `requestAnimationFrame` for smooth rendering at monitor refresh rate
- Typically 60fps, but can be 120fps, 144fps, or higher on capable displays
- Measures actual frame times for performance monitoring
- Automatically stops when no activity detected

**Frame Callback:**
```typescript
onHighFreqFrame(timestamp: number) => {
  isDragging: boolean,
  isMomentum: boolean,
  isSnapping: boolean,
  hasAnimations: boolean,
  isPlaying: boolean,
  needsContinue: boolean  // Should loop continue?
}
```

### Low-Frequency Mode (15fps)

**When Active:**
- Audio is playing
- Tab is visible
- No active interactions or animations

**Implementation:**
- Uses `setInterval` with ~67ms delay
- Does NOT measure frame times (not actual animation frames)
- Used only for updating playback progress indicator

**Why 15fps?**
- Sufficient for smooth progress bar updates
- Significantly reduces CPU usage during playback
- User can't perceive difference for non-interactive updates

**Note:** Only active when tab is visible. If tab is hidden during playback, goes to idle mode instead.

**Frame Callback:**
```typescript
onLowFreqFrame(timestamp: number) => void
```

### Idle Mode

**When Active:**
- Nothing is happening (no interactions, no animations)
- Audio is paused or stopped
- No user interaction
- **Tab is not visible** (hidden/backgrounded) - always goes idle regardless of other state

**Implementation:**
- All render loops stopped
- No CPU usage for rendering
- Debug stats show last measured values

**Note:** When the tab is hidden, the browser throttles or stops `requestAnimationFrame` callbacks, so we explicitly go idle to avoid wasted work.

## Mode Transitions

The controller automatically switches modes based on application state:

```
High-Freq ←→ Low-Freq ←→ Idle
```

**Transition Logic:**
```typescript
updateStrategy(isDragging, isMomentumActive, isSnapping, hasActiveAnimations, isPlaying) {
  const needsHighFreq = isDragging || isMomentumActive || isSnapping || hasActiveAnimations;
  const needsLowFreq = isPlaying && tabVisible;

  if (needsHighFreq) {
    → High-Frequency Mode
  } else if (needsLowFreq) {
    → Low-Frequency Mode
  } else {
    → Idle Mode
  }
}
```

**When Transitions Happen:**
- Drag starts → High-freq
- Drag ends, momentum starts → Stay in high-freq
- Momentum ends, no animations → Low-freq (if playing and visible) or Idle
- Play button pressed → High-freq (for animation), then low-freq (if visible)
- Pause button pressed → High-freq (for animation), then idle
- **Tab hidden → Idle (immediately, regardless of playback state)**
- **Tab shown → Resumes appropriate mode based on current state**

## Performance Monitoring

### Debug Stats Integration

The `RenderLoopController` includes integrated performance monitoring:

**Metrics Tracked:**
- FPS (frames per second)
- Average frame time
- Min/max frame times
- Frame spike count (frames >33ms)

**Important:** Stats are only meaningful in high-frequency mode. In low-freq and idle modes, the debug overlay shows "Last FPS" / "Last Frame Time" to indicate these are historical values.

### Frame Spike Detection

**Definition:** A frame spike is when a frame takes longer than expected to render.

**Threshold:** >33ms (equivalent to <30fps)

**Why 33ms?**
- Target is 60fps = 16.67ms per frame
- 33ms = 30fps, which is noticeably choppy
- Only measured in high-freq mode (low-freq intentionally runs at 67ms)

### Debug Overlay

The debug overlay (`src/xmb/components/debug-overlay.ts`) provides real-time performance visualization:

**Features:**
- Click top-left corner to toggle visibility
- Shows current render mode (HIGH-FREQ / LOW-FREQ / IDLE)
- Displays FPS and frame time (or "Last" values when not actively rendering)
- Frame time graph (last 60 frames)
- Min/max frame times
- Frame spike warnings

**Configuration:**
- Controlled by `tracePerformance` flag in `config.js`
- When false/unset, debug overlay is not rendered at all
- No performance overhead when disabled

**Color Coding:**
- **Green**: Good performance (FPS >50, Frame Time <20ms)
- **Yellow**: Acceptable (FPS >30, Frame Time <33ms)  
- **Red**: Poor performance (FPS ≤30, Frame Time ≥33ms)

**Usage:**
- Click invisible 40x40px box in top-left corner to toggle
- Shows last 60 frames in graph
- Updates at 10fps when visible (only when expanded)

## Issues Solved

### 1. False Frame Spikes on Mode Transitions

**Problem:** When transitioning from idle to high-freq mode, the first frame would measure time from the last frame before going idle, resulting in false "spikes" of several seconds.

**Root Cause:** `lastFrameTime` was not reset when render loops stopped.

**Solution:** 
- Call `resetTiming()` whenever a render loop stops
- Resets `lastFrameTime` to 0
- First frame after restart skips measurement

**Code Locations:**
- `stopHighFrequency()` - resets timing
- High-freq loop completion - resets timing before calling `updateStrategy()`

### 2. False Frame Spikes in Low-Frequency Mode

**Problem:** Low-freq mode was reporting constant "frame spikes" of ~67ms.

**Root Cause:** Low-freq mode uses `setInterval` (not `requestAnimationFrame`), so the 67ms delay between callbacks is intentional, not a performance issue.

**Solution:**
- Don't measure frame times in low-freq mode at all
- Only update `stats.mode` to show correct state
- Frame time stats remain from last high-freq session

**Why This Works:** Low-freq mode isn't rendering animation frames - it's just periodic DOM updates. The browser renders whenever it wants, so "frame time" is meaningless.

### 3. Stale Debug Stats Display

**Problem:** When going idle or low-freq, debug overlay would show stale FPS/frame time values without indicating they were historical.

**Solution:**
- Show "FPS" / "Frame Time" only in high-freq mode
- Show "Last FPS" / "Last Frame Time" in low-freq and idle modes
- Reduce opacity to indicate historical data

### 4. Debug Overlay Not Updating When Idle

**Problem:** Debug overlay appeared frozen when idle, even though it claimed to update at 10fps.

**Root Cause:** Lit doesn't detect changes when object properties are mutated in place (same object reference).

**Solution:**
- Call `requestUpdate('stats')` explicitly in update interval
- Forces re-render even though object reference hasn't changed

**Note:** This is only relevant when `tracePerformance` is enabled. The update interval only runs when the overlay is visible (expanded).

## Code Structure

### RenderLoopController API

```typescript
class RenderLoopController {
  // Public API
  updateStrategy(isDragging, isMomentumActive, isSnapping, hasActiveAnimations, isPlaying): void
  ensureHighFrequencyLoop(): void  // Force high-freq mode
  setTracePerformance(enabled: boolean): void
  resetDebugStats(): void
  getDebugStats(): DebugStats
  getMode(): RenderMode
  destroy(): void
  
  // Callbacks (provided by XMB browser)
  onHighFreqFrame(timestamp): RenderLoopState & { needsContinue: boolean }
  onLowFreqFrame(timestamp): void
}
```

### Integration with XMB Browser

**Initialization:**
```typescript
this.renderLoopController = new RenderLoopController({
  onHighFreqFrame: this._onHighFreqFrame.bind(this),
  onLowFreqFrame: this._onLowFreqFrame.bind(this),
});
```

**Frame Callbacks:**
- `_onHighFreqFrame()` - Updates momentum, animations, visuals via direct DOM manipulation; returns state
- `_onLowFreqFrame()` - Calls `updateVisuals()` and `updatePlaybackUI()` for progress updates

**What happens in frame callbacks:**
```typescript
// High-freq frame
_onHighFreqFrame(timestamp) {
  // Update momentum physics
  // Update animations
  // Update visuals via direct DOM manipulation
  // Update labels via direct DOM manipulation
  return { isDragging, isMomentum, isSnapping, hasAnimations, isPlaying, needsContinue };
}

// Low-freq frame
_onLowFreqFrame(timestamp) {
  updateVisuals();      // Episode positions, button opacity
  updatePlaybackUI();   // Progress ring, playhead, icons
}
```

**Mode Updates:**
- Called automatically when high-freq loop completes
- Called by playback state setters (`isPlaying`, `isLoading`)
- Called on visibility changes (tab hidden/shown)

## Configuration

### tracePerformance Flag

**Location:** `config.js`

**Purpose:** Enable/disable debug overlay and performance monitoring

**Default:** `false` (disabled)

**When Enabled:**
- Debug overlay rendered in XMB browser
- Click top-left corner to toggle visibility
- Performance stats collected and displayed

**When Disabled:**
- Debug overlay not rendered at all
- No click area, no visual overhead
- Stats still collected internally (minimal overhead)

**Flow:**
```
config.js → init.ts → podcast-player → xmb-browser → debug-overlay
```

## Best Practices

### When to Call updateStrategy()

**Automatically called by:**
- `isPlaying` setter (when playback state changes)
- `isLoading` setter (when loading state changes)
- High-freq loop completion (when animations finish)

**Manually call after:**
- Drag operations complete
- Tab visibility changes

**Don't call:**
- During every frame (controller handles this automatically)
- When state hasn't changed (controller checks internally)
- When playback state changes (setters handle this)

### When to Call ensureHighFrequencyLoop()

**Use when:**
- Starting a drag operation
- Starting an animation manually
- Any time you need immediate high-freq rendering

**Don't use:**
- For playback (use `updateStrategy` instead)
- When already in high-freq mode (controller checks)

### Performance Considerations

**High-Freq Mode:**
- Runs at 60fps - use sparingly
- Automatically stops when done
- Ideal for: drag, momentum, UI animations
- All updates via direct DOM manipulation

**Low-Freq Mode:**
- Runs at 15fps - very efficient
- Perfect for: progress bars, passive updates
- Don't use for: interactive elements
- Updates progress ring, playhead, icons directly

**Idle Mode:**
- Zero CPU usage for rendering
- Always prefer idle when nothing is happening

**Zero Re-renders Goal:**
- During steady-state playback: zero `requestUpdate()` calls
- During navigation: zero `requestUpdate()` calls (labels updated directly)
- Re-renders only for structural changes (shows array changes)

## Performance Budget

**Target Frame Times:**
- **60fps**: 16.67ms per frame (ideal for high-freq mode)
- **30fps**: 33.33ms per frame (acceptable minimum)
- **Below 30fps**: Noticeable stutter (needs fixing)

**Acceptable Spike Frequency:**
- 0-1 spikes per interaction: Excellent
- 2-5 spikes per interaction: Good
- 5-10 spikes per interaction: Needs optimization
- 10+ spikes per interaction: Poor, investigate immediately

**Note:** On high refresh rate displays (120Hz, 144Hz), target frame time is lower (8.33ms for 120fps, 6.94ms for 144fps), but the 33ms spike threshold remains the same.

## Troubleshooting Performance Issues

### Using the Debug Overlay

1. Enable `tracePerformance: true` in `config.js`
2. Click top-left corner to show overlay
3. Perform the action that stutters
4. Check for red bars in graph or spike count increase
5. Check console for detailed spike logs

### Frame Spike Logs

When `tracePerformance` is enabled, frame spikes log to console:

```javascript
[RenderLoop] Frame spike: 45.23ms {
  mode: 'high-freq',
  isDragging: true,
  isMomentum: false,
  isSnapping: false,
  hasAnimations: true,
  isPlaying: false
}
```

This tells you what was active when the spike occurred.

### Common Causes

1. **Accidental Lit Re-renders**: Check for unintended `requestUpdate()` calls or reactive property changes in hot paths
2. **Label Calculations**: Optimize `calculateLabelLayout()` or reduce label count
3. **Garbage Collection**: Reduce object allocations in hot paths
4. **Layout Thrashing**: Batch DOM reads and writes
5. **Missing DOM Cache**: Ensure `refreshDOMRefs()` is called after structural changes

**Note:** The architecture is designed to have **zero Lit re-renders during steady-state playback**. If you see `requestUpdate()` calls during playback, that's a bug.

### requestUpdate Override for Debugging

The `xmb-browser` component overrides `requestUpdate()` to log unexpected re-renders when `tracePerformance` is enabled:

```typescript
override requestUpdate(name?: PropertyKey, oldValue?: unknown): void {
  if (this.config?.tracePerformance) {
    const isExpectedUpdate = name === 'config' || name === 'shows';
    if (!isExpectedUpdate) {
      console.warn('[LIT] UNEXPECTED requestUpdate:', name ?? 'no property', 
        this._isPlaying ? '(DURING PLAYBACK!)' : '');
    }
  }
  super.requestUpdate(name, oldValue);
}
```

**Expected updates:** `config`, `shows` (structural changes only)
**Unexpected updates:** Any other property, or no property name (indicates a bug)

### Browser DevTools

**Performance Profiler:**
1. Open DevTools → Performance tab
2. Record while performing the action
3. Look for long frames (red bars)
4. Click frame to see what took time

**Rendering Tab:**
- Enable "Frame Rendering Stats" for real-time FPS
- Enable "Paint flashing" to see repaints
- Enable "Layout Shift Regions" for unexpected layout changes

### Testing Tips

**Reset stats before testing:**
```javascript
document.querySelector('xmb-browser').resetDebugStats();
```

**Test different scenarios:**
- Vertical swipe (episode navigation)
- Horizontal swipe (show navigation)
- Rapid back-and-forth swiping
- Long momentum scrolls
- Playback with progress updates

**Test on different devices:**
- High-end (144Hz) - should always be smooth
- Mid-range (60Hz) - should be smooth for most interactions
- Low-end - may show spikes, helps identify bottlenecks

## Future Improvements

### Potential Enhancements

1. **Adaptive Frame Rate:** Adjust high-freq target based on device capabilities
2. **Battery Awareness:** Reduce frame rate on battery power
3. **Performance Budget:** Track frame time budget and warn when exceeded
4. **Frame Time Prediction:** Predict next frame time based on history
5. **Render Profiling:** Break down frame time by operation (momentum, animations, visuals)

### Known Limitations

1. **Low-Freq Frame Times:** Cannot measure actual render time in low-freq mode (browser controls rendering)
2. **Tab Visibility:** Relies on `visibilitychange` event (may not fire in all scenarios)
3. **Stats Overhead:** Performance monitoring has small overhead even when overlay is hidden
4. **DOM Cache Staleness:** If DOM structure changes without calling `refreshDOMRefs()`, cached references become stale (will crash on access - fail-fast)

## Button Reparenting

The play/pause button is a single DOM element that gets reparented to the current center episode. This allows the button to move with the episode during drag without needing to calculate its position manually.

**How it works:**
1. Button is rendered once in the template (outside episode loop)
2. After navigation completes, `reparentButtonToCurrentEpisode()` moves it to the new center episode
3. Button inherits the episode's transform and moves with it during drag

**When reparenting happens:**
- After `_applySnapTarget()` updates indices (horizontal/vertical navigation)
- After initial render when shows array is set
- In `_onNavigationComplete()` after momentum or snap animation completes
- In `navigateToEpisode()` for programmatic navigation
- NOT during drag or animation frames

**Key insight:** `appendChild()` of an existing element MOVES it (doesn't clone). This is a single DOM mutation per navigation, not per frame.

## Related Documentation

- `specs/xmb-architecture.md` - Overall XMB system architecture
- `specs/xmb-drag-momentum.md` - Momentum animation system
- `specs/xmb-ux.md` - User experience and interaction design
- `.kiro/specs/xmb-render-loop-refactoring/` - Refactoring spec that implemented this architecture
