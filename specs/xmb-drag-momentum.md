# XMB Momentum System

**Implementation guide for the XMB browser's navigation system (drag, coast, snap, and settle).**

This document describes how the momentum system is implemented to achieve the UX defined in `specs/xmb-ux.md`.

---

## Terminology

**Navigation System** - Umbrella term for all drag/coast/snap/settle interactions

**Drag** - User holds pointer and moves it across the screen

**Release** - User lets go of the pointer

**Coast** - The visible animation phase where items glide with physics-based deceleration (what the user sees)

**Momentum** - The physics system that calculates and drives the coasting behavior (the implementation)

**Settle** - Final snap to exact episode position (always at offset 0)

**Snap** - Quick animation to nearest episode when velocity is too low for coasting (edge case of momentum system)

---

## System Overview

The XMB navigation system uses **physics-based momentum** to implement natural coasting behavior:

1. **Drag Phase** - User drags, items follow pointer with direction locking
2. **Release** - Calculate velocity from recent drag history
3. **Physics Simulation** - Calculate where item would naturally stop with friction
4. **Target Selection** - Snap to nearest episode from natural stopping point
5. **Index Update** - Update current episode immediately (starts loading)
6. **Coast Animation** - Momentum system smoothly animates from current position to target
7. **Settle** - Arrive exactly at target episode (offset 0)

**Key insight:** The momentum system simulates real physics (friction), then snaps to the nearest episode. Fast swipes naturally travel farther before stopping.

---

## Architecture

### Key Components

**NavigationController** (`src/xmb/controllers/navigation-controller.ts`)
- Manages drag state and history
- Calculates velocity from drag points
- Runs momentum/coast animation loop
- Handles snap animation (low velocity edge case)
- Updates position each frame using cubic ease-out
- Direction locking logic

**XmbBrowser** (`src/xmb/xmb-browser.ts`)
- `_calculateSnapTarget()` - Pure function that calculates target episode
- `_applySnapTarget()` - Updates indices and emits episode-change event
- `updateVisuals()` - Applies positions to DOM via direct manipulation

**AnimationController** (`src/xmb/controllers/animation-controller.ts`)
- Manages play/pause button scale animations
- Manages vertical/horizontal drag fade overlays
- UI animations (not navigation)

### Data Flow

```
User drags → DragController tracks history
User releases → Calculate velocity
             → Simulate physics (friction)
             → Calculate target episode
             → Update indices (emit episode-change)
             → Start momentum animation
             → Update position each frame (60fps)
             → Render via updateVisuals()
             → Settle at target
```

---

## Critical Concepts

### Current Episode vs Screen Center

**Important distinction:**

- **Current Episode** - The episode designated by `currentEpisodeId` / `currentShowIndex`
- **Screen Center** - The visual position at offset 0 where episodes are fully centered
- **Offset** - Distance from screen center in episode/show units (0 = centered, 1 = one episode away)

**During navigation:**
1. User drags → current episode stays the same, offset changes
2. User releases → **current episode changes immediately** (at start of coast)
3. Coast animation → current episode animates from adjusted offset to 0
4. Settle → current episode reaches screen center (offset 0)

**Key insight:** The current episode changes BEFORE the coast animation starts, not after. This means:
- Episode loading starts immediately (parallel with animation)
- The NEW current episode is visually offset during coast
- The OLD episode is no longer current (even though it may still be near screen center)

### Adjusted Offset and Reference Frame

When the current episode changes, the coordinate system shifts. This requires calculating an "adjusted offset":

**Example (vertical navigation):**
```
Before release:
- Current episode: 5 (at offset 0)
- User dragged down: offset = -2.3
- Target episode: 7 (2 episodes forward)

After _applySnapTarget():
- Current episode: 7 (NEW reference frame)
- Adjusted offset: -2.3 + 2 = -0.3
- Animation: from -0.3 to 0
```

**Why adjusted offset matters:**
- Offsets are always relative to the current episode
- When current episode changes, we must recalculate offset in the new reference frame
- Formula: `adjustedOffset = dragOffset + delta`
- This ensures smooth visual continuity (no jumps)

**Code location:** `_calculateSnapTarget()` in `xmb-browser.ts`

### Visual Updates and Button Rendering

**The play/pause button is only rendered on the current episode.**

When navigation happens:
1. Old current episode has button (scale 1.0)
2. Direction locks → button hides (animates to 0) on old episode
3. User releases → **current episode changes** → button is now on NEW episode
4. Button on new episode starts at scale 0 (invisible)
5. After optional delay → button animates from 0 to 1.0 on new episode
6. Old episode's button is no longer rendered (not current anymore)

**Important:** The button hide and show animations are on DIFFERENT episodes at DIFFERENT screen positions. They are completely independent animations.

### Critical Implementation Detail

**Visual updates must happen every frame during coasting:**

```typescript
// In _onHighFreqFrame()
const needsVisualUpdate = isDragging || isMomentum || hasAnimationControllerUpdates;

if (needsVisualUpdate) {
  this.updateVisuals();  // Direct DOM manipulation - fast!
}
```

This was the source of a critical bug where the momentum system calculated positions but never rendered them, causing a massive jump at the end.

---

## Momentum System (Coasting Physics)

### Friction Simulation

When user releases, we calculate where the item would naturally stop:

```typescript
const friction = 0.6;  // Friction coefficient
const velocity = calculateVelocity();  // From drag history
const stopDistance = velocity / (1 - friction);  // Natural stopping point
const targetIndex = Math.round(currentIndex - offset - stopDistance);
```

**Example with friction = 0.6:**
- Velocity: -2.0 (fast upward swipe)
- Stop distance: -2.0 / 0.4 = -5.0 episodes
- Target: round(8 - 0.3 - (-5.0)) = round(12.7) = 13

### Velocity Calculation

Uses last 3 drag points to calculate velocity:

```typescript
const recent = dragHistory.slice(-3);
const timeDelta = last.time - first.time;
const velocityX = ((last.x - first.x) / timeDelta) * 16.67;  // Scale to 60fps
const velocity = (velocityX / showSpacing) * velocityScale;
```

- Samples recent movement (not entire drag)
- Scaled to ~60fps frame time for consistency
- Converted to offset units (not pixels)
- Multiplied by `momentumVelocityScale` for amplification

### Why Velocity Amplification?

The `momentumVelocityScale` multiplier (typically 2.0-3.0) is crucial for making the UI feel responsive and natural. Here's why:

**The Problem: Direct Velocity Feels Sluggish**

When you calculate velocity directly from cursor movement, you get the actual physical speed of the cursor. But this feels wrong because:

1. **Cursor Movement is Constrained**
   - Limited by how fast you can move your hand
   - Limited by mouse sensitivity and trackpad friction
   - Limited by screen size (you run out of space quickly)
   - Even a "fast" swipe might only move 50-100 pixels in 50ms

2. **The UI Should Feel Lighter Than Reality**
   - In the real world, heavy objects move slowly when pushed
   - In a UI, things should feel responsive and light
   - When you flick something, it should fly across the screen, not crawl
   - Think about phone scrolling: swipe 2 inches, content scrolls 10 inches

3. **Amplifying Intent**
   - Small, slow drag → small movement (velocity × 2 is still small)
   - Fast flick → large movement (velocity × 2 becomes significant)
   - Creates dynamic range: careful movements are precise, quick gestures are powerful

4. **Compensating for Sampling**
   - Velocity uses last 3 drag points
   - Quick gestures might only capture the end of the movement
   - Scale compensates by amplifying captured velocity to match perceived effort

**The Sweet Spot:**
- **Too low (1.0):** Feels heavy, sluggish, frustrating
- **Just right (2.0-3.0):** Feels responsive, natural, satisfying
- **Too high (5.0+):** Feels slippery, out of control, oversensitive

**Current value: 2.0** - Makes the UI feel light and responsive without being chaotic.

### Animation Duration

Duration is **velocity-dependent** using logarithmic scaling:

```typescript
const velocityFactor = Math.log(1 + speed * 2) / Math.log(3);
const duration = minDuration + (maxDuration - minDuration) * velocityFactor;
```

- **Slow swipes:** ~150-300ms (quick)
- **Medium swipes:** ~400-600ms (smooth)
- **Fast swipes:** ~700-800ms (long coast)

This feels natural because faster swipes take longer to decelerate.

### Easing Curve

Uses **cubic ease-out** for smooth deceleration:

```typescript
const progress = elapsed / duration;
const eased = 1 - Math.pow(1 - progress, 3);
const currentPosition = startPosition + (targetPosition - startPosition) * eased;
```

Starts fast (matching drag velocity) and smoothly decelerates to zero at target.

---

## Snap Animation

The system uses snap animation (instead of momentum) in two scenarios:

### 1. Low Velocity Snap

When velocity is below threshold (`0.01`), momentum would be imperceptible:

```typescript
if (speed < velocityThreshold) {
  // Use snap animation (fixed 500ms duration)
  animationController.startSnap(adjustedOffsetX, adjustedOffsetY);
}
```

**Characteristics:**
- Fixed 500ms duration
- Cubic ease-out
- Used for slow, careful drags
- Feels precise and controlled

### 2. Boundary Snap

When momentum would go past the first/last episode, the target is clamped and snap is used:

```typescript
// Calculate natural stopping point
const naturalStopPosition = currentIndex - offset - (velocity / (1 - friction));
const unclampedTarget = Math.round(naturalStopPosition);

// Clamp to valid range
const targetIndex = Math.max(0, Math.min(maxIndex, unclampedTarget));

// Use snap if clamped
if (unclampedTarget !== targetIndex) {
  useSnap = true;  // Hit boundary
}
```

**Why snap at boundaries:**
- Momentum animation would be very short (compressed by clamping)
- Snap feels more decisive, like hitting a wall
- Prevents awkward slow crawl to boundary
- Consistent with low-velocity snap behavior

**Example:**
```
User on episode 2, fast swipe up (would go to episode -3)
→ Natural stop: -3
→ Clamped to: 0 (first episode)
→ Uses: SNAP (boundary) instead of momentum
→ Result: Quick, decisive snap to first episode
```

**Future Enhancement: Rubber Band Effect**

A common pattern in touch interfaces (iOS, Android) is to allow scrolling past boundaries with a "rubber band" effect:

1. **Overshoot:** Content scrolls past boundary (e.g., episode 0 at offset -2)
2. **Spring back:** Content springs back to boundary with elastic easing
3. **Settle:** Content settles at boundary (offset 0)

This requires:
- Allowing negative offsets (past first episode)
- Chaining two animations (momentum → spring-back)
- Spring physics (not just ease-out)
- Rendering content at negative offsets

The current boundary detection (`wasClamped` flag) provides the foundation for implementing this in the future.

---

## Animation Synchronization

When navigation ends, three animations are coordinated:

### The Three Animations

1. **Grid Navigation** (snap or momentum)
   - Animates episode positions to settle at target
   - Duration: 150-800ms (momentum) or 500ms (snap)
   - Runs in NavigationController

2. **Episode Label Fade Out**
   - Fades out episode titles on side shows
   - Duration: `verticalDragFadeDuration` or `horizontalDragFadeDuration`
   - Runs in AnimationController

3. **Show Opacity Restore**
   - Other shows fade from dim back to full opacity
   - Duration: Implicit (tied to grid animation progress)
   - Calculated in layout system

### Unified Trigger

**All three animations start when navigation completes**, not when it begins:

```typescript
// In _onHighFreqFrame()
if (this.navigationController.isMomentumActive()) {
  const stillActive = this.navigationController.updateMomentum();
  if (!stillActive) {
    this._onNavigationComplete();  // ← Triggers fade animations
  }
}

if (this.navigationController.isSnapping()) {
  const stillActive = this.navigationController.updateSnap(timestamp);
  if (!stillActive) {
    this._onNavigationComplete();  // ← Triggers fade animations
  }
}
```

**Why this matters:**
- During navigation (snap or coast), UI stays in "navigation mode"
- Labels remain visible, other shows stay dimmed
- When navigation completes, everything transitions back to idle state together
- Creates cohesive, synchronized visual feedback

### Render Loop

All three animations run on the **same high-frequency render loop** (60fps):

```typescript
// All updates happen in single frame
private _onHighFreqFrame(timestamp: number) {
  // Update grid navigation (snap or momentum)
  navigationController.updateMomentum();
  navigationController.updateSnap(timestamp);
  
  // Update fade animations
  animationController.update(timestamp);
  
  // Apply all visual changes together
  this.updateVisuals();
}
```

This ensures perfect synchronization - all animations advance together on every frame.

## Play/Pause Button Behavior

The play/pause button appears and disappears based on drag state:

### Visibility Rules

**Button HIDDEN when:**
- Drag direction is locked (user is actively dragging)
- Coasting (momentum animation after release)
- Snapping (quick animation to nearest episode)

**Button VISIBLE when:**
- Not dragging (idle state)
- Playing or loading (always visible for interaction)

### Button Animation Timing

**During momentum (coast):**
- Button hides when drag direction locks
- Button shows with delay to finish with coast animation
- Synchronized so button and coast complete together

**During snap:**
- Button hides when drag direction locks
- Button shows immediately when snap starts
- Button visible during entire snap animation

### Implementation

Button scale is animated via AnimationController:

```typescript
// In _onDragEnd()
if (isMomentum) {
  // Synchronize button show to finish with coast
  const coastDuration = navigationController.getMomentumDuration();
  const buttonAnimDuration = XMB_CONFIG.playPauseButtonAnimDuration;
  const buttonDelay = Math.max(0, coastDuration - buttonAnimDuration);
  
  animationController.startButtonShow(buttonDelay);
} else {
  // Show button immediately for snap
  animationController.startButtonShow(0);
}
```

Button rendering uses **direct DOM manipulation** (not Lit re-renders) for performance.

---

## Configuration Parameters

Located in `src/xmb/xmb-config.ts`:

### Momentum System Parameters

```typescript
momentumVelocityScale: 2.5       // Velocity amplification
momentumFriction: 0.6            // Friction coefficient (0.9=high, 0.98=low)
momentumMinDuration: 150         // Minimum coast animation time (ms)
momentumMaxDuration: 800         // Maximum coast animation time (ms)
momentumVelocityThreshold: 0.01  // Minimum velocity to trigger coasting
```

### Tuning Guide

**`momentumFriction`** - Controls how far items coast:
- **Lower (0.5-0.7):** High friction, shorter coast, more controlled
- **Higher (0.8-0.95):** Low friction, longer coast, more momentum
- **Current: 0.6** (moderate)

**`momentumVelocityScale`** - Amplifies velocity:
- Higher = more throw distance
- Lower = less throw distance
- **Current: 2.5**

**`momentumMinDuration`** / **`momentumMaxDuration`**:
- Controls coast animation speed range
- **Current: 150ms - 800ms**

---

## Edge Cases

### Very Low Velocity
**Scenario:** User drags slowly and releases  
**Behavior:** Falls below velocity threshold, uses snap animation instead  
**Duration:** Fixed 500ms snap

### Backward Snap
**Scenario:** Very low velocity might require snapping backward  
**Example:** Dragged to offset -0.7, velocity too low to reach next episode  
**Behavior:** Snaps back to current episode (delta = 0)

### Boundary Clamping
**Scenario:** Fast swipe would go past first/last episode  
**Behavior:** Clamped to valid range with `Math.max(0, Math.min(maxIndex, target))`

### Rapid Swipes
**Scenario:** User starts new drag during coasting  
**Behavior:** Coast cancelled, new drag starts immediately

### Click vs Drag on Play Button
**Scenario:** User starts drag on play button, then quickly swipes to navigate  
**Problem:** Could trigger both playback AND navigation  
**Solution:** 
- Quick tap detection only triggers if direction was never locked (`didDrag` flag)
- Once direction locks (threshold crossed), it's navigation, not a click
- Distance calculation uses actual drag distance (end - start), not distance from origin
- The `didDrag` flag persists after drag end so the click handler can see it
- Click handler blocks the click if `didDrag` is true
- Ensures every interaction is EITHER a button click OR navigation, never both

**Implementation:**
```typescript
// In _onDragEnd()
const isQuickTap = this._wasQuickTap() && !this.didDrag;
// Don't reset didDrag here - let click handler see it

// In handlePlayPauseClick()
if (this.didDrag && !isQuickTap) {
  e.stopPropagation();
  e.preventDefault();
  this.didDrag = false;
  return; // Block the click
}

// In _wasQuickTap()
const deltaX = this.lastDragX - this.dragStartX;
const deltaY = this.lastDragY - this.dragStartY;
const dragDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
```

**Key insight:** The `didDrag` flag must be set whenever navigation occurs, not just when direction locks. This is because quick swipes can trigger navigation based on velocity alone, even if the direction lock threshold was never crossed.

**When didDrag is set:**
1. When direction locks during drag (threshold crossed) - set in `_onDragMove()`
2. When navigation is determined in `_onDragEnd()` - set before `_applySnapTarget()`

This ensures that ANY drag that results in navigation will block the subsequent click event, regardless of whether direction locked during the drag.

**Critical: No Timeout on didDrag Reset**

The `didDrag` flag must NOT be reset with a timeout. It should only be reset by:
1. The click handler after blocking the click (`handlePlayPauseClick`)
2. The start of a new drag operation

Using a timeout creates a race condition where:
- User drags quickly → direction locks → `didDrag = true`
- User releases → timeout starts (e.g., 300ms)
- Click event fires slightly delayed (> timeout)
- `didDrag` is already false → click goes through → unwanted play!

This is especially problematic when dragging past boundaries and snapping back, where the user might release quickly and the click event fires after the timeout.

---

## Performance Optimizations

### Direct DOM Manipulation

All visual updates use direct DOM manipulation instead of Lit re-renders:

```typescript
// Fast: Direct style manipulation
element.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
element.style.opacity = opacity.toString();

// Slow: Lit template re-render (avoided during animations)
// this.requestUpdate();
```

### Deferred Episode Loading

Episode loading is deferred to next tick to avoid blocking animation frames:

```typescript
// In podcast-player.ts
setTimeout(() => {
  this.orchestrator.loadEpisode(showId, episodeId, ...);
}, 0);
```

This ensures smooth 60fps animation while loading happens asynchronously.

### Render Loop Strategy

The render loop automatically switches between modes:

- **High-frequency (60fps):** During drag, coasting, or animations
- **Low-frequency (15fps):** During playback (for progress updates)
- **Idle:** When nothing is happening

---

## Logging

### Coast Animation (Momentum System)

```
[TARGET] Vertical: {
  currentIndex: 8,
  currentOffset: "-0.300",
  velocity: "-2.000",
  naturalStopDistance: "-5.000",
  naturalStopPosition: "12.700",
  targetIndex: 13,
  delta: 5
}

[DRAG END] Starting animation: {
  direction: "vertical",
  fromOffset: "4.700",
  toOffset: "0.000",
  targetDelta: 5
}

[MOMENTUM] Y animation: {
  startY: "4.7000",
  targetY: "0.0000",
  currentY: "3.8210",
  progress: "15.2%",
  eased: "18.4%"
}

[MOMENTUM] Animation complete
```

### Snap Animation

```
[SNAP] Starting snap animation: {
  from: { x: "0.234", y: "0.000" },
  distance: "0.234",
  duration: "500ms",
  reason: "velocity too low"
}
```

---

## Code Locations

**Configuration:**
- `src/xmb/xmb-config.ts` - All tunable parameters

**Navigation:**
- `src/xmb/controllers/navigation-controller.ts` - Drag, velocity, momentum, snap
- `src/xmb/xmb-browser.ts` - Target calculation, index updates, visual updates

**Animation:**
- `src/xmb/controllers/animation-controller.ts` - Play/pause button, fade overlays

**Render Loop:**
- `src/xmb/controllers/render-loop-controller.ts` - High/low frequency switching

---

## Related Documentation

- **`specs/xmb-ux.md`** - User experience and interaction design (what the user sees)
- **`specs/xmb-architecture.md`** - System architecture and patterns
- **`specs/xmb-configuration.md`** - Configuration system and layout constants
