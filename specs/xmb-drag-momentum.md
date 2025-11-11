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

**DragController** (`src/xmb/controllers/drag-controller.ts`)
- Manages drag state and history
- Calculates velocity from drag points
- Runs momentum animation loop
- Updates position each frame using cubic ease-out

**XmbBrowser** (`src/xmb/xmb-browser.ts`)
- `_calculateSnapTarget()` - Pure function that calculates target episode
- `_applySnapTarget()` - Updates indices and emits episode-change event
- `updateVisuals()` - Applies positions to DOM via direct manipulation

**AnimationController** (`src/xmb/controllers/animation-controller.ts`)
- Handles snap animation (when velocity too low)
- Manages play/pause button animations
- Manages drag fade animations

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

## Snap Animation (Edge Case)

When velocity is below threshold (`0.01`), the momentum system falls back to snap animation instead of coasting:

```typescript
if (speed < velocityThreshold) {
  // Use AnimationController snap (fixed 500ms duration)
  animationController.startSnap(adjustedOffsetX, adjustedOffsetY);
}
```

**Snap characteristics:**
- Fixed 500ms duration
- Cubic ease-out
- Used for slow drags or when coasting would be imperceptible
- Edge case of the momentum system

---

## Play/Pause Button Behavior

The play/pause button appears and disappears based on drag state:

### Visibility Rules

**Button HIDDEN when:**
- Drag direction is locked (user is actively dragging)
- Coasting (momentum animation after release)

**Button VISIBLE when:**
- Not dragging (idle state)
- Playing or loading (always visible for interaction)
- Snapping (quick animation to nearest episode)

### Implementation

Button scale is updated via **direct DOM manipulation** (not Lit re-renders):

```typescript
// In updateVisuals()
const shouldShowButton = (isPlaying || isLoading) || isSnapping || !isActuallyDragging;
const scale = shouldShowButton ? 1.0 : 0;

const button = shadowRoot.querySelector('.play-pause-overlay');
button.style.transform = `translateZ(0) scale(${scale * maxZoom})`;
button.style.opacity = scale > 0 ? '1' : '0';
button.style.pointerEvents = scale > 0 ? 'auto' : 'none';
```

This avoids expensive Lit template re-renders during animations.

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

**Drag & Momentum:**
- `src/xmb/controllers/drag-controller.ts` - Drag state, velocity, momentum loop
- `src/xmb/xmb-browser.ts` - Target calculation, index updates, visual updates

**Animation:**
- `src/xmb/controllers/animation-controller.ts` - Snap, play/pause, fade animations

**Render Loop:**
- `src/xmb/controllers/render-loop-controller.ts` - High/low frequency switching

---

## Related Documentation

- **`specs/xmb-ux.md`** - User experience and interaction design (what the user sees)
- **`specs/xmb-architecture.md`** - System architecture and patterns
- **`specs/xmb-configuration.md`** - Configuration system and layout constants
