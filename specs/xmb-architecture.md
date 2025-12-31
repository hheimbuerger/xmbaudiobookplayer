# XMB Architecture

## Overview

The XMB (Cross Media Bar) browser is a modular component system for navigating and playing podcast episodes. The architecture separates concerns into distinct modules with clear responsibilities and interfaces.

This document describes the technical implementation, code structure, and architectural patterns of the XMB module (`src/xmb/`). For user-facing design and interaction behaviors, see [XMB UX](./xmb-ux.md). For detailed state machine logic and playback coordination, see [XMB Orchestration](./xmb-orchestration.md). For configuration system details, see [XMB Configuration](./xmb-configuration.md).

## XMB Module Structure

The XMB module is located in `src/xmb/` and consists of:

```
src/xmb/
├── xmb-browser.ts             # Main XMB browser component
├── xmb-browser.css            # Component styles (imported as string)
├── xmb-config.ts              # Centralized configuration constants
├── playback-orchestrator.ts   # Playback state coordination
├── components/
│   └── debug-overlay.ts       # Performance debug overlay
└── controllers/
    ├── animation-controller.ts           # Animation state management
    ├── navigation-controller.ts          # Drag, momentum, and snap logic
    ├── circular-progress-controller.ts   # Circular progress seeking
    ├── input-controller.ts               # DOM event handling
    ├── layout-calculator.ts              # Pure layout functions
    ├── render-loop-controller.ts         # Adaptive render loop (60fps/15fps/idle)
    └── image-preloader-controller.ts     # Image preloading and decoding
```

## Module Responsibilities

### xmb-browser.ts

Main XMB browser component - the visual interface for episode navigation:

**Responsibilities:**
- Renders episode grid with album art and labels
- Coordinates between controllers
- Delegates to controllers for state management
- Emits events for user actions (episode-change, play-request, pause-request, seek)
- Pure display component - receives state via props, emits events
- Manages visual updates via direct DOM manipulation

**Dependencies:**
- Controllers (animation, navigation, circular-progress, input, layout, render-loop, image-preloader)
- Media repository types (`Show`, `Episode`)

### playback-orchestrator.ts

Playback state coordination - the state machine that manages playback:

**Responsibilities:**
- Manages playback state machine (play/pause/loading)
- Coordinates between audio player and media repository
- Handles episode loading from repository
- Syncs progress to repository
- Preserves user intent across async operations
- Emits events for state changes and episode changes

**Dependencies:**
- Media repository interface
- Audio player component (external to XMB)

See [XMB Orchestration](./xmb-orchestration.md) for detailed state machine logic.

### controllers/animation-controller.ts

Animation state management:

**Responsibilities:**
- Manages snap animations (episode navigation)
- Manages play/pause animations (radial push/collapse)
- Manages fade animations (vertical/horizontal drag modes)
- Tracks animation progress and completion
- Returns whether visual update is needed on each update

**Dependencies:**
- None (pure state management)

### controllers/navigation-controller.ts

Drag, momentum, and snap logic:

**Responsibilities:**
- Manages drag state (active, direction, offsets)
- Implements direction locking with threshold
- Calculates momentum from drag history
- Manages vertical/horizontal drag mode activation

**Dependencies:**
- None (pure state management)

### controllers/circular-progress-controller.ts

Circular progress seeking:

**Responsibilities:**
- Manages circular progress drag state
- Handles angle updates with boundary jump prevention
- Converts angles to progress values (0-1)

**Dependencies:**
- None (pure state management)

### controllers/input-controller.ts

DOM event handling:

**Responsibilities:**
- Attaches/detaches DOM event listeners
- Handles mouse and touch events
- Coordinates between drag, tap, and circular progress interactions
- Checks event composition paths for UI element detection
- Prevents synthetic mouse events after touch
- Detects quick taps vs drags

**Dependencies:**
- None (delegates to callbacks)

### controllers/layout-calculator.ts

Pure layout functions:
- `calculateEpisodeLayout()`: Position and scale for each episode
- `calculateOpacity()`: Opacity based on distance and mode
- `calculateLabelLayout()`: Label positioning and visibility
- Pure functions with no side effects
- All layout logic centralized and testable
- Uses `LayoutContext` object to reduce parameter count

## External Interfaces

The XMB module interacts with external components through well-defined interfaces:

### Inputs (Dependencies)

**Media Repository Interface:**
- `Show` and `Episode` types (from `src/catalog/media-repository.ts`)
- `MediaRepository` interface for loading episodes and syncing progress
- `PlaybackSession` type for active playback tracking

**Audio Player Component:**
- HTML5 audio wrapper (from `src/components/audio-player.ts`)
- Events: ready, play, pause, seek, timeupdate, ended
- Methods: play(), pause(), seekTo()

### Outputs (Events)

**XMB Browser Events:**
- `episode-change` - User navigated to different episode
- `play-request` - User clicked play button
- `pause-request` - User clicked pause button
- `seek` - User dragged progress scrubber

**Orchestrator Events:**
- `state-change` - Playback state changed
- `episode-changed` - Episode loaded (for persistence)
- `episode-ended` - Episode finished (for auto-advance)

### Data Flow

**Downward (to XMB Browser):**
- `shows: Show[]` - Catalog data (via template binding from podcast-player)
- `config: PlayerConfig` - Configuration (via template binding from podcast-player)
- `isPlaying: boolean` - Playback state (set directly by orchestrator)
- `isLoading: boolean` - Loading state (set directly by orchestrator)
- `playbackProgress: number` - Current progress 0-1 (set directly by orchestrator)

**Important:** Playback state properties are set directly by the orchestrator via property assignment, NOT via template bindings from the parent. This eliminates redundant Lit re-renders during playback.

**Upward (Events from XMB):**
- User actions flow up as events
- Orchestrator listens directly to browser events
- Orchestrator manages state transitions

### Playback State Management

The playback orchestrator implements a state machine with two orthogonal dimensions:

**User Intent:** `'play' | 'pause' | null`
- What the user wants to happen
- Preserved across async operations

**System State:** `'ready' | 'loading' | 'error'`
- What the system can do right now
- Tracks async operation status

**Derived UI State:**
- `isPlaying`: `intent === 'play' && system === 'ready'`
- `isLoading`: `intent === 'play' && system === 'loading'`
- `isPaused`: `intent !== 'play' && system === 'ready'`

This architecture prevents race conditions by centralizing state and preserving intent.

For detailed state machine logic, reconciliation rules, state transitions, and intent preservation scenarios, see [XMB Orchestration](./xmb-orchestration.md).

### Controller Architecture

The XMB browser delegates to seven specialized controllers:

**AnimationController:**
- Owns all animation state (snap, play/pause, fade)
- Provides `update(timestamp)` method called every frame
- Returns boolean indicating if visual update is needed
- Provides getters for current animation values

**NavigationController:**
- Owns all drag state (active, direction, offsets, momentum)
- Maintains separate `dragState` and `momentumState` objects
- `dragState` tracks active dragging (cleared when drag ends)
- `momentumState` preserves direction and velocity for momentum animation
- **Momentum uses easing-based animation** (not physics simulation)
  - Calculates exact path from current position to target
  - Uses cubic ease-out for smooth deceleration
  - Duration scales with velocity and distance
  - Guarantees arrival at target with no overshoot
- Provides methods for drag lifecycle (start, update, end)
- Calculates momentum from drag history
- Manages vertical/horizontal drag mode activation

**CircularProgressController:**
- Owns circular progress drag state
- Handles angle updates with boundary jump prevention
- Converts angles to progress values for seeking

**InputController:**
- Manages all DOM event listeners (mouse, touch)
- Coordinates between different input types
- Detects quick taps vs drags
- Prevents synthetic mouse events after touch
- Uses event composition paths to detect UI element clicks
- Delegates to callbacks for actual behavior

**LayoutCalculator:**
- Pure functions for layout calculations
- No state, no side effects
- Takes `LayoutContext` object with all necessary parameters
- Returns positions, scales, opacities, and label data
- Reduced parameter count improves readability

**RenderLoopController:**
- Manages adaptive render loop (60fps high-freq, 15fps low-freq, idle)
- Automatically switches modes based on application state
- Tracks performance metrics (FPS, frame times, spikes)
- See [XMB Render Loop](./xmb-render-loop.md) for details

**ImagePreloaderController:**
- Preloads and decodes images for smooth display
- Uses `Image.decode()` API for async GPU preparation
- Eliminates decode stutter when switching shows

**Benefits:**
- XMB browser focuses on coordination and rendering
- Controllers are independently testable
- Clear separation of concerns (input, navigation, animation, layout, render loop)
- Easy to modify one aspect without affecting others
- Input handling completely isolated from business logic

## Event Interfaces

### XMB Browser Events

```typescript
interface XmbEpisodeChangeEventDetail {
  showId: string;
  episodeId: string;
  show: Show;
  episode: Episode;
}

interface XmbSeekEventDetail {
  progress: number; // 0 to 1
}
```

Events: `episode-change`, `play-request`, `pause-request`, `seek`

### Orchestrator Events

```typescript
interface PlaybackState {
  intent: 'play' | 'pause' | null;
  system: 'ready' | 'loading' | 'error';
  isPlaying: boolean;
  isLoading: boolean;
  isPaused: boolean;
  progress: number;
  duration: number;
}

interface EpisodeChangedEventDetail {
  showId: string;
  episodeId: string;
}
```

Events: `state-change`, `episode-changed`, `episode-ended`

## Edge Case Handling

### User Actions During Animation

**New drag during animation:**
- Cancels current momentum/snap animation
- Starts new drag immediately
- Handled in `_onDragStart()` by calling `stopMomentum()` and `stopSnap()`

**Play button during animation:**
- Works normally - orchestrator handles play intent
- Episode is already loading (early loading)
- Animation continues while playback starts
- No special handling needed

**Multiple rapid swipes:**
- Each swipe cancels previous animation
- New target calculated and applied
- Only the final swipe's target is loaded
- Episode-change events may fire multiple times (orchestrator handles this)

**Navigation during loading:**
- New episode-change event cancels previous load
- Orchestrator preserves user intent
- Loading state managed by orchestrator, not XMB

### Intent Preservation

The XMB browser emits events and lets the orchestrator handle intent:
- XMB: "User wants episode X" (emits `episode-change`)
- Orchestrator: Manages loading, preserves play intent, handles errors
- XMB: Continues visual animation regardless of loading state

This separation ensures smooth UX even when loading is slow or fails.

## State Management Patterns

### Unidirectional Data Flow

The XMB browser is a pure display component:
- State flows down via props (`isPlaying`, `isLoading`, `playbackProgress`)
- Events flow up via custom events (`play-request`, `pause-request`, `seek`)
- No internal state tracking of playback
- No state computation from props

### Intent Preservation

The orchestrator preserves user intent across async operations:
- User clicks play → intent set to 'play', system enters 'loading'
- Episode loads from server → system transitions to 'ready'
- Orchestrator reconciles: intent is 'play' and system is 'ready' → audio plays
- If user clicks pause during load → intent changes to 'pause'
- When system becomes ready → audio does not play (intent was changed)

See [XMB Orchestration](./xmb-orchestration.md) for detailed intent preservation rules and edge cases.

### Controller State Isolation

Each controller owns its state and provides methods to query it:
- AnimationController: animation progress values
- DragController: drag offsets, momentum state, tap detection
- LayoutCalculator: stateless pure functions

The XMB browser queries controllers during `render()` and `updateVisuals()` but never modifies their state directly.

## Performance Considerations

### Rendering Optimization

**Update Batching:**
- Multiple state changes within a frame batch into single template update
- `pendingUpdate` flag prevents duplicate requestUpdate() calls
- Shallow property comparison for label data (not JSON.stringify)

**Direct Style Manipulation:**
- Episode positions updated via direct style manipulation in `updateVisuals()`
- Bypasses Lit template system for high-frequency updates
- `render()` defines DOM structure, `updateVisuals()` modifies appearance
- Template only updates for structural changes (labels, buttons)
- **Critical:** `currentShowIndex` is NOT `@state()` - prevents Lit re-renders on show switch
- Show switching only updates transforms/opacity, no DOM recreation

**Element Caching:**
- `_cacheElements()` queries DOM once and stores references
- Only re-caches when show structure changes (episodes added/removed)
- Switching shows doesn't trigger re-cache (DOM structure unchanged)
- Eliminates expensive `querySelectorAll()` on every navigation

**Image Preloading:**
- All show icons preloaded and decoded on app startup
- Uses `Image.decode()` API for async GPU preparation
- Eliminates decode stutter when switching to new shows
- Runs in background without blocking UI

**GPU Acceleration:**
- `transform: translateZ(0)` forces GPU compositing
- `backface-visibility: hidden` prevents flickering
- High-quality image rendering hints

### Animation Performance

**Adaptive Render Loop:**
- Three modes: high-freq (60fps), low-freq (15fps), idle (0fps)
- Automatically switches based on application state
- High-freq for drag, momentum, snap, UI animations
- Low-freq for playback progress updates
- Idle when nothing is happening
- See [XMB Render Loop](./xmb-render-loop.md) for details

**Direct DOM Manipulation:**
- Playback state uses manual getters/setters (not Lit `@property`)
- Visual updates via direct style manipulation, not Lit re-renders
- DOM references cached in `domRefs` object
- Zero Lit re-renders during steady-state playback

**RequestAnimationFrame Loop:**
- Single RAF loop for all animations
- Controllers return boolean indicating if visual update needed
- `updateVisuals()` called only when necessary to apply new positions/styles

**Momentum Calculation:**
- Drag history limited to last 5 points
- Velocity calculated from recent movement
- Friction applied each frame for natural deceleration

## Configuration

All XMB configuration is centralized in `src/xmb/xmb-config.ts` - a single source of truth for layout, animation, and interaction constants. The configuration system provides:

- `XMB_CONFIG` - Base configuration object with all tunable constants
- `XMB_COMPUTED` - Derived values calculated from base config
- `generateCSSVariables()` - Injects config into CSS custom properties
- CSS integration via custom properties (e.g., `var(--xmb-icon-size)`)

**Key benefits:**
- Single source of truth for all constants
- Type-safe configuration
- CSS and TypeScript share the same values
- Easy to tweak and experiment
- No magic numbers scattered throughout code

For detailed configuration documentation, including all available constants, usage patterns, and maintenance guidelines, see [XMB Configuration](./xmb-configuration.md).

## Technical Implementation Details

### Immutable Navigation Calculations

**Pattern:** All navigation target calculations use pure functions that don't mutate state.

**Implementation:**
```typescript
// 1. Calculate target (pure function)
const target = this._calculateSnapTarget();

// 2. Apply target (single mutation point)
this._applySnapTarget(target);

// 3. Start animation (visual transition)
this.navigationController.startMomentum(0, 0, target.adjustedOffsetX, target.adjustedOffsetY);
```

**Benefits:**
- No mid-calculation reference frame changes
- Easy to reason about and test
- Single source of truth for index updates
- Prevents double-delta bugs
- Enables early loading (emit event before animation)

**Early Loading:**
By separating calculation from application, we can emit the `episode-change` event immediately when drag ends, before the animation starts. This allows episode loading to happen in parallel with the visual transition, significantly reducing perceived loading time.

### Reference Frame Management in Snap Animations

**CRITICAL:** When snapping to a new show/episode after updating `currentShowIndex` or `currentEpisodeIndex`, the snap offset must be adjusted by the delta to compensate for the reference frame change. Otherwise, animations play in reverse. See `.kiro/steering/xmb-reference-frame-snap.md` for detailed explanation and examples.

**Quick reference:**
```typescript
const delta = targetShowIndex - currentShowIndex;
currentShowIndex = targetShowIndex;
animationController.startSnap(offsetX + delta, offsetY);
```

### Shadow DOM Event Handling

The XMB browser uses shadow DOM, which affects event handling:

**composedPath() for Click Detection:**
- `e.target` returns host element, not shadow children
- Must use `e.composedPath()` to find actual clicked element
- Critical for distinguishing play button clicks from general clicks

**Document-Level Listeners:**
- `mousemove` and `touchmove` on document for smooth dragging
- Allows drag to continue when pointer leaves component
- Properly cleaned up in `disconnectedCallback()`

### Touch and Mouse Parity

Full parity between touch and mouse interactions:

**Synthetic Event Prevention:**
- Touch events followed by synthetic mouse events
- `lastTouchTime` tracks recent touches
- Mouse events ignored within 500ms of touch

**Event Mapping:**
- Mouse: mousedown → mousemove → mouseup → click
- Touch: touchstart → touchmove → touchend → click
- Both use same drag state and logic

### SVG Namespace Handling

SVG elements must be in the SVG namespace to render:

**Problem:**
- Conditionally rendering SVG with `${condition ? html`<circle />` : ''}` creates elements in HTML namespace
- Elements appear in DOM but don't render

**Solution:**
- Always render SVG elements
- Control visibility with CSS (`display`, `visibility`, `opacity`)
- Or use Lit's `svg` tag function for conditional rendering

**Reference:** See `.kiro/steering/lit-svg-conditional-rendering.md` for details.

## Testing Strategy

### Unit Testing

**Controllers:**
- AnimationController: Test animation progress calculations
- DragController: Test drag state, momentum, tap detection
- LayoutCalculator: Test pure layout functions

**Orchestrator:**
- Test state machine transitions
- Test intent preservation
- Test event emission

### Integration Testing

**Component Interactions:**
- Test XMB browser event emission
- Test orchestrator coordination
- Test audio player integration

### Manual Testing

**User Interactions:**
- Drag and swipe gestures
- Play/pause button clicks
- Circular progress seeking
- Auto-advance behavior
